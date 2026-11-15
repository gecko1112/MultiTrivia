// Wordy, server side.
//
// THE SERVER DECIDES EVERYTHING, like in moreless-server.js. It picks the word from content/wordy.js, which the browser
// never gets, checks every guess against the word list and colours it. The browser learns the word only when its game
// is over.
//
// Daily game: the same word for everyone, played once, saved after every guess (db.wd: account -> day -> guesses). It
// continues from any browser and is never dealt again. Opening the page creates nothing: the game is kept from the
// first guess on. Results go into the account's x_words (the day's result, games played and won, the streak, the
// guess distribution), a document server.js keeps out of the browser's reach as a whole. Practice words live in memory
// and are not counted, as before.
//
// The word of a day is picked the way the browser picked it, so every day keeps its word.
'use strict';
const crypto = require('crypto');
const { today, pastDay, markLate } = require('./games-common.js');

const TRIES = 6;
// ---- the browser's picking and colouring, unchanged (they lived in public/wordy.js)
function rng(seed){let h=2166136261;for(const c of seed){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return ()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function score(guess,target){
  const res=Array(5).fill('a'), t=target.split(''), used=Array(5).fill(false);
  for(let i=0;i<5;i++) if(guess[i]===t[i]){res[i]='c';used[i]=true;}
  for(let i=0;i<5;i++) if(res[i]!=='c'){ const j=t.findIndex((ch,k)=>!used[k]&&ch===guess[i]); if(j>=0){res[i]='p';used[j]=true;} }
  return res;
}
const dayNum = date => { const [y, m, d] = date.split('-').map(Number); return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 864e5); };
const prevDay = date => new Date(Date.parse(date + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);

module.exports = function createWordy({ words, send, readBody, records, docsOf, save, mayArchive }) {
  const ANS = words.answers, OK = new Set(words.allowed.split(' ')); ANS.forEach(w => OK.add(w));
  const ORDER = (() => { const a = ANS.slice(), r = rng('wordy-v1'); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
  const dailyWord = date => ORDER[((dayNum(date) % ORDER.length) + ORDER.length) % ORDER.length];

  // ---- the account's Wordy results (x_words), in the shape the browser always kept them
  function wordsDoc(user) {
    const docs = docsOf(user), st = docs.x_words = (docs.x_words && typeof docs.x_words === 'object') ? docs.x_words : {};
    if (!st.days || typeof st.days !== 'object') st.days = {};
    for (const f of ['played', 'won', 'streak', 'maxStreak']) st[f] = st[f] || 0;
    if (!Array.isArray(st.dist) || st.dist.length !== TRIES) st.dist = [0, 0, 0, 0, 0, 0];
    return st;
  }
  const finishedOn = (user, date) => { const st = docsOf(user).x_words; return (st && st.days && st.days[date]) || null; };
  const summary = user => { const st = wordsDoc(user); return { played: st.played, won: st.won, streak: st.streak, maxStreak: st.maxStreak, dist: st.dist.slice() }; };
  // A daily game somebody had started in the browser before the server picked Wordy's word: its guesses come along.
  function carried(user, date) {
    const run = docsOf(user).x_run, s = run && run.day === date && run.games && run.games.wd && run.games.wd.s;
    if (!s || s.t !== dailyWord(date) || !Array.isArray(s.rows)) return [];
    const out = [];
    for (const w of s.rows) { if (typeof w !== 'string' || !OK.has(w) || out.length >= TRIES) break; out.push(w); if (w === s.t) break; }
    return out;
  }

  const practice = new Map();                        // account -> practice game
  // `keep`: a daily game is stored once it has a guess; opening the page alone stores nothing.
  function getRun(user, daily, day, keep) {
    if (!daily) return practice.get(user) || null;
    const date = day || today(), mine = records(user);
    if (!mine[date]) {
      const before = finishedOn(user, date);
      if (before) return { user, daily: true, day: date, before };          // finished in the browser before the server picked the word
      const moves = carried(user, date);
      if (!keep && !moves.length) return { user, daily: true, day: date, target: dailyWord(date), rec: { moves: [] }, unsaved: true };
      mine[date] = { t0: Date.now(), t1: 0, moves };
      if (date !== today()) mine[date].late = true;                           // played through the archive: does not count for streaks
      save();
    }
    return { user, daily: true, day: date, target: dailyWord(date), rec: mine[date] };
  }
  const rowsOf = run => run.rec.moves.map(w => ({ w, res: score(w, run.target) }));
  const state = run => { const rows = rowsOf(run), won = rows.some(r => r.w === run.target); return { rows, won, done: won || rows.length >= TRIES }; };
  function finish(run, s) {
    if (!run.daily) { practice.delete(run.user); return null; }
    const docs = docsOf(run.user), st = wordsDoc(run.user), k = run.day, late = !!run.rec.late;
    run.rec.t1 = Date.now();
    st.played++;
    if (s.won) {
      st.won++; st.dist[s.rows.length - 1]++;
      if (!late) { st.streak = (st.lastWin === prevDay(k) ? st.streak : 0) + 1; st.lastWin = k; st.maxStreak = Math.max(st.maxStreak, st.streak); }
    } else if (!late) st.streak = 0;                  // a late game neither builds nor breaks the streak
    st.days[k] = { solved: s.won, guesses: s.rows.length, word: run.target, rows: s.rows.map(r => r.res.join('')), words: s.rows.map(r => r.w) };
    if (late) markLate(docs, 'wd', k);
    save();
    return summary(run.user);
  }
  function view(run, stats) {
    if (run.before) {
      const b = run.before, rows = (b.words || []).map((w, i) => ({ w, res: String((b.rows || [])[i] || 'aaaaa').split('') }));
      return { daily: true, day: run.day, rows, done: true, won: !!b.solved, word: b.word, stats: summary(run.user) };
    }
    const s = state(run), out = { daily: run.daily, day: run.daily ? run.day : null, rows: s.rows, done: s.done, won: s.won };
    if (s.done) { out.word = run.target; if (run.daily) out.stats = stats || summary(run.user); }   // the word leaves the server only at the end
    if (stats) out.fresh = true;                     // this guess ended the game just now
    return out;
  }

  async function handle(req, res, url, query, user) {
    if (!url.startsWith('/api/wd/')) return false;
    const act = url.slice('/api/wd/'.length);
    if (req.method === 'GET') {
      if (act === 'home') {
        const day = pastDay(query.get('day'), mayArchive(user)); if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }
        const date = day || today(), done = !!finishedOn(user, date), going = !done && !!(records(user)[date] || carried(user, date).length);
        send(res, 200, { date, done, going, practice: practice.has(user) }); return true;
      }
      send(res, 404, { error: 'not found' }); return true;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'not allowed' }); return true; }
    const body = await readBody(req), daily = body.daily === true;
    const day = daily ? pastDay(body.day, mayArchive(user)) : null;
    if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }

    if (act === 'start') {                           // today's word continues where it was; a practice word is new each time
      if (!daily && !body.resume) {
        if (practice.size > 5000) practice.clear();
        const not = dailyWord(today()); let w; do { w = ANS[crypto.randomInt(ANS.length)]; } while (w === not);
        practice.set(user, { user, daily: false, target: w, rec: { moves: [] } });
      }
      const run = getRun(user, daily, day, false);
      if (!run) { send(res, 404, { error: 'No game to continue' }); return true; }
      send(res, 200, view(run)); return true;
    }
    if (act === 'guess') {
      const run = getRun(user, daily, day, true);
      if (!run) { send(res, 409, { error: 'Start a game first' }); return true; }
      if (run.before || state(run).done) { send(res, 409, { error: 'This game is over' }); return true; }
      if (body.i !== run.rec.moves.length) { send(res, 409, { error: 'That guess was already made' }); return true; }
      const w = typeof body.word === 'string' ? body.word.toLowerCase() : '';
      if (!/^[a-z]{5}$/.test(w)) { send(res, 400, { error: 'Not enough letters' }); return true; }
      if (!OK.has(w)) { send(res, 400, { error: '"' + w.toUpperCase() + '" isn\'t in the word list', notWord: true }); return true; }
      run.rec.moves.push(w);
      const s = state(run), stats = s.done ? finish(run, s) : null;
      if (run.daily && !s.done) save();
      send(res, 200, view(run, stats)); return true;
    }
    send(res, 404, { error: 'not found' }); return true;
  }
  return { handle, dailyWord, score };
};
