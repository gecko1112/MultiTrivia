// Clueless, server side.
//
// THE SERVER DECIDES EVERYTHING, like in moreless-server.js. It picks the hidden word and looks up how close each guess
// is, from content/clueless.js, which the browser never gets (it used to download all of it, about 2 MB). The browser
// learns a word's rank only by guessing it, and the hidden word only when the game is over. Hints are given by the
// server too, by the old rule: a word at half the best rank so far.
//
// Daily game: the same word for everyone, played once, saved after every guess (db.cl: account -> day -> guesses). It
// continues from any browser and is never dealt again. Results go into x_stats.cl, which server.js keeps out of the
// browser's reach. Practice games live in memory; as before, they count as played (and solved).
//
// The hidden word of a day is picked the way the browser picked it, so every day keeps its word.
'use strict';
const crypto = require('crypto');
const { today, rngFrom, shuffleR, pastDay, resultsOf, resultOn, markLate } = require('./games-common.js');

const CLOSEST = 30;                                  // the closest words shown at the end (ranks 2 to 31)
const dayNum = date => { const [y, m, d] = date.split('-').map(Number); return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 864e5); };

module.exports = function createClueless({ data, send, readBody, records, docsOf, save, mayArchive }) {
  const WORDS = data.words, index = new Map(WORDS.map((w, i) => [w, i]));
  const ORDER = shuffleR(data.targets, rngFrom('clueless-order-v1'));                         // the browser's order, unchanged
  const dailyTarget = date => ORDER[((dayNum(date) % ORDER.length) + ORDER.length) % ORDER.length];
  const rankCache = new Map();
  function ranks(target) {                           // rank of every word for this target (1 = the word itself)
    if (!rankCache.has(target)) { const b = Buffer.from(data.ranks[target], 'base64'), u = new Uint16Array(b.length / 2); for (let i = 0; i < u.length; i++) u[i] = b.readUInt16LE(2 * i); rankCache.set(target, u); }
    return rankCache.get(target);
  }
  const rankOf = (target, w) => { const i = index.get(w); return i === undefined ? null : ranks(target)[i]; };
  const finishedOn = (user, date) => resultOn(docsOf(user), 'cl', date);

  // A daily game somebody had started in the browser before the server picked Clueless's word: its guesses come along.
  function carried(user, date) {
    const run = docsOf(user).x_run, s = run && run.day === date && run.games && run.games.cl && run.games.cl.s, t = dailyTarget(date);
    if (!s || s.t !== t || !Array.isArray(s.g)) return null;
    const moves = [];
    for (const w of s.g) { if (typeof w === 'string' && index.has(w) && !moves.some(m => m.w === w)) moves.push({ w }); if (moves.length >= 2000) break; }
    return moves.length ? { moves, hints: Math.max(0, Math.min(moves.length, Number(s.h) || 0)) } : null;
  }

  const practice = new Map();                        // account -> practice game
  function getRun(user, daily, create, day) {
    if (!daily) {
      if (create) {
        if (practice.size > 5000) practice.clear();
        const others = data.targets.filter(t => t !== dailyTarget(today()));
        practice.set(user, { user, daily: false, target: others[crypto.randomInt(others.length)], rec: { moves: [], hints: 0 } });
      }
      return practice.get(user) || null;
    }
    const date = day || today(), mine = records(user);
    if (!mine[date]) {
      const before = finishedOn(user, date);
      if (before) return { user, daily: true, day: date, before, target: dailyTarget(date) };   // finished in the browser before the server judged Clueless
      const c = carried(user, date);
      if (!create && !c) return null;
      mine[date] = { t0: Date.now(), t1: 0, moves: c ? c.moves : [], hints: c ? c.hints : 0 };
      if (date !== today()) mine[date].late = true;
      save();
    }
    return { user, daily: true, day: date, target: dailyTarget(date), rec: mine[date] };
  }
  const guessesOf = run => run.rec.moves.map(m => ({ w: m.w, r: rankOf(run.target, m.w) }));
  const won = run => run.rec.moves.some(m => m.w === run.target);
  const over = run => won(run) || !!run.rec.gaveUp;
  function closest(target) {                         // the words at rank 2 to 31
    const r = ranks(target), out = [];
    for (let i = 0; i < r.length; i++) if (r[i] >= 2 && r[i] <= CLOSEST + 1) out[r[i] - 2] = WORDS[i];
    return out.filter(Boolean);
  }
  function finish(run) {
    const solved = won(run), cl = resultsOf(docsOf(run.user), 'cl');
    cl.played++; if (solved) cl.solved = (cl.solved || 0) + 1;
    if (run.daily) {
      run.rec.t1 = Date.now();
      cl.days[run.day] = { solved, guesses: run.rec.moves.length, hints: run.rec.hints || 0, word: run.target, list: guessesOf(run).map(g => [g.w, g.r]) };
      if (run.rec.late) markLate(docsOf(run.user), 'cl', run.day);
    } else practice.delete(run.user);
    save();
    return { played: cl.played, solved: cl.solved || 0, day: run.daily ? run.day : null, rec: run.daily ? cl.days[run.day] : null };
  }
  function view(run, extra) {
    if (run.before) {
      const b = run.before;
      return { daily: true, day: run.day, size: WORDS.length, guesses: (b.list || []).map(([w, r]) => ({ w, r })), hints: b.hints || 0, done: true, won: !!b.solved, word: b.word || run.target, closest: closest(run.target), last: null };
    }
    const done = over(run), out = { daily: run.daily, day: run.daily ? run.day : null, size: WORDS.length, guesses: guessesOf(run), hints: run.rec.hints || 0, done, won: won(run), i: run.rec.moves.length };
    const lm = run.rec.moves[run.rec.moves.length - 1]; out.last = lm ? lm.w : null;
    if (done) { out.word = run.target; out.closest = closest(run.target); }   // the word leaves the server only at the end
    return Object.assign(out, extra);
  }

  async function handle(req, res, url, query, user) {
    if (!url.startsWith('/api/cl/')) return false;
    const act = url.slice('/api/cl/'.length);
    if (req.method === 'GET') {
      if (act === 'home') {
        const day = pastDay(query.get('day'), mayArchive(user)); if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }
        const date = day || today(), done = !!finishedOn(user, date), going = !done && !!(records(user)[date] || carried(user, date));
        send(res, 200, { date, done, going, practice: practice.has(user) }); return true;
      }
      send(res, 404, { error: 'not found' }); return true;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'not allowed' }); return true; }
    const body = await readBody(req), daily = body.daily === true;
    const day = daily ? pastDay(body.day, mayArchive(user)) : null;
    if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }

    if (act === 'start') {
      const run = daily || !body.resume ? getRun(user, daily, true, day) : getRun(user, false, false);
      if (!run) { send(res, 404, { error: 'No game to continue' }); return true; }
      send(res, 200, view(run)); return true;
    }
    if (act === 'quit') { if (!daily) practice.delete(user); send(res, 200, { ok: true }); return true; }
    const run = getRun(user, daily, false, day);
    if (!run) { send(res, 409, { error: 'Start a game first' }); return true; }
    if (run.before || over(run)) { send(res, 409, { error: 'This game is over' }); return true; }
    if (body.i !== run.rec.moves.length) { send(res, 409, { error: 'That was already done' }); return true; }   // a double click, or a second tab

    if (act === 'guess') {
      const w = typeof body.word === 'string' ? body.word.trim().toLowerCase() : '';
      if (!/^[a-z]+$/.test(w)) { send(res, 400, { error: 'Letters only, one word.' }); return true; }
      if (!index.has(w)) { send(res, 400, { error: '"' + w + '" isn\'t in my word list. Try another word.', unknown: true }); return true; }
      if (run.rec.moves.some(m => m.w === w)) { send(res, 200, view(run, { dup: w })); return true; }
      run.rec.moves.push({ w });
      const stats = won(run) ? finish(run) : null;
      if (run.daily && !stats) save();
      send(res, 200, view(run, stats ? { stats } : null)); return true;
    }
    if (act === 'hint') {                            // a word at half the best rank so far (from 1000 when nothing was guessed), never one already guessed
      const gs = guessesOf(run), best = gs.length ? Math.min(...gs.map(g => g.r)) : 1000;
      let t = Math.max(2, Math.floor(best / 2)); if (best <= 2) t = 2;
      const r = ranks(run.target), byRank = new Map(); for (let i = 0; i < r.length; i++) byRank.set(r[i], i);
      for (let k = t; k >= 2; k--) {
        const w = WORDS[byRank.get(k)];
        if (w && !run.rec.moves.some(m => m.w === w)) {
          run.rec.moves.push({ w, h: 1 }); run.rec.hints = (run.rec.hints || 0) + 1;
          if (run.daily) save();
          send(res, 200, view(run, { hint: w })); return true;
        }
      }
      send(res, 200, view(run, { noHint: true })); return true;
    }
    if (act === 'giveup') {
      run.rec.gaveUp = true;
      const stats = finish(run);
      send(res, 200, view(run, { stats })); return true;
    }
    send(res, 404, { error: 'not found' }); return true;
  }
  return { handle, dailyTarget, rankOf, ranks };
};
