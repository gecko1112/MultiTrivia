// Survival, server side.
//
// THE SERVER DECIDES EVERYTHING, like in moreless-server.js. It deals the questions from content/survival.js (and the
// Plus packs in content/packs.js), which the browser never gets, runs the clock, works out the damage of every
// estimate and keeps the score. The browser sees a question and its unit; the answer and its note leave the server only
// after the estimate for that question was sent.
//
// The clock: the server notes when each question was shown. An estimate that arrives later than the time limit (plus a
// little for the connection) counts as running out of time, whatever it says. The clock never pauses: leaving the page
// or switching tabs during a question uses up its time (the owner's decision, so nobody can stop it to look an answer up).
//
// Daily run: the same questions for everyone, one try, saved after every estimate (db.sv: account -> day -> estimates).
// It continues from any browser and is never dealt again. The day's result goes into the account's x_daily and every
// finished run that is not a pack run into the account's best runs (documents with a score, the ten best are kept),
// all written by the server only (server.js). Practice runs live in memory.
//
// The questions of a day are dealt the way the browser dealt them, so every day keeps its questions.
'use strict';
const crypto = require('crypto');
const { NO_LIMITS } = require('./limits-server.js');
const { today, pastDay, markLate } = require('./games-common.js');

const MAX = 10, TIMEOUT_DMG = 2, HEAL = 0.2, HEAL_WITHIN = Math.log10(1.05);
const DAILY_TIMER = 15, TIMERS = [0, 15];            // practice: 15 seconds or no timer
const GRACE_MS = 1500;                               // allowance for the connection on top of the time limit
const KEEP_RUNS = 10;                                // best runs kept per account
// Difficulty: 1 easy, 2 medium, 3 hard (huge or tiny magnitudes and known killers). Unchanged from the browser.
const HARD_HINTS=['IPv6','electron','Avogadro','52!','Rubik','mass of the Sun','mass of the Earth','hydrogen atom','light travel in one year','atoms are in a human','power does the Sun','neurons','cells are in an adult','red blood cells','alveoli','base pairs','IPv4','gibibyte','stars are in the Milky Way','observable universe','orbit the centre of the Milky Way','heart beat in an 80-year','half-life of uranium','Earths would fit'];
function qDiff(q){ if(HARD_HINTS.some(h=>q.q.includes(h))) return 3; const L=Math.abs(Math.log10(q.a)); return L>=12?3:L>=6?2:1; }
function seededShuffle(arr,seed){let h=2166136261;for(const c of seed){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}const r=()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function dailyDeck(Q,day,suffix){
  if(day<='2026-11-08') return seededShuffle(Q,'survival-'+day+(suffix||'')).reverse();   // keep the original order for past days
  let h=2166136261; for(const c of 'ramp-'+day+(suffix||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
  const r=()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
  const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const pools={1:shuf(Q.filter(q=>qDiff(q)===1)),2:shuf(Q.filter(q=>qDiff(q)===2)),3:shuf(Q.filter(q=>qDiff(q)===3))};
  const out=[];
  for(let i=0;i<Q.length;i++){
    // first 8 questions easy; medium ones creep in after ~5, hard ones after ~10, slowly getting more likely
    const pH=i<10?0:Math.min(0.25,(i-10)/80), pM=i<5?0:Math.min(0.35,(i-5)/45), x=r();
    let t = x<pH?3 : x<pH+pM?2 : 1;
    if(!pools[t].length) t=[1,2,3].find(k=>pools[k].length);
    out.push(pools[t].pop());
  }
  return out.reverse();                                   // reversed because the game pops from the end
}
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const avgErrOf = h => { const real = h.filter(r => r.g !== null); return real.length ? real.reduce((s, r) => s + Math.abs(Math.log10(r.g / r.a)), 0) / real.length : null; };
const rankRuns = r => r.sort((a, b) => b.score - a.score || ((a.avg ?? 99) - (b.avg ?? 99)) || a.t - b.t);
const isRunDoc = (id, d) => !String(id).startsWith('x_') && d && typeof d.score === 'number';

module.exports = function createSurvival({ questions, packs, send, readBody, records, docsOf, save, mayArchive, hasPlus, limits = NO_LIMITS }) {
  const Q = Array.isArray(questions) ? questions : [], PACKS = packs || {};
  // the questions of a daily run in the order they come: the day's deck, then the day's second deck, as the browser popped them
  const dailySeqs = new Map();
  function dailySeq(day, n) {
    let s = dailySeqs.get(day);
    if (!s) { if (dailySeqs.size > 12) dailySeqs.clear(); s = { list: [], deck: dailyDeck(Q, day) }; dailySeqs.set(day, s); }
    while (s.list.length <= n) { if (!s.deck.length) s.deck = dailyDeck(Q, day, '-2'); s.list.push(s.deck.pop()); }
    return s.list;
  }
  const questionAt = (run, i) => {
    if (run.daily) return dailySeq(run.day, i)[i];
    while (run.seq.length <= i) run.seq.push(...shuffle(run.pool));               // a practice run reshuffles when it runs out
    return run.seq[i];
  };
  // where a run stands after the estimates so far: life, score, the history the browser always kept
  function walk(run) {
    let life = MAX, score = 0; const h = [];
    for (let i = 0; i < run.rec.moves.length && life > 0; i++) {
      const q = questionAt(run, i), g = run.rec.moves[i], dmg = g === null ? TIMEOUT_DMG : Math.abs(Math.log10(g / q.a));
      const healed = g !== null && dmg <= HEAL_WITHIN, before = life;
      life = healed ? Math.min(MAX, life + HEAL) : life - dmg;
      h.push({ q: q.q, u: q.u, a: q.a, g, dmg: healed ? -HEAL : dmg, n: q.n, before, after: life });
      if (life > 0) score++;
    }
    return { life, score, h, done: life <= 0 || !!run.rec.ended };
  }
  const finishedOn = (user, date) => { const d = docsOf(user).x_daily, r = d && d.days && d.days[date]; return r && r.score != null ? r : null; };
  const startedOn = (user, date) => { const d = docsOf(user).x_daily, r = d && d.days && d.days[date]; return !!(r && r.score == null); };
  function dailyDoc(user) {
    const docs = docsOf(user), d = docs.x_daily = (docs.x_daily && typeof docs.x_daily === 'object') ? docs.x_daily : {};
    if (!d.days || typeof d.days !== 'object') d.days = {};
    return d;
  }
  // A daily run somebody had started in the browser before the server dealt Survival: its estimates come along.
  function carried(user, date) {
    const run = docsOf(user).x_run, s = run && run.day === date && run.games && run.games.sv && run.games.sv.s;
    if (!s || s.mode !== 'daily' || s.day !== date || !Array.isArray(s.history)) return null;
    const moves = [];
    for (let i = 0; i < s.history.length; i++) {
      const h = s.history[i], q = dailySeq(date, i)[i];
      if (!h || h.q !== q.q) break;                                              // only the same questions, in order
      if (h.g !== null && !(typeof h.g === 'number' && h.g > 0 && isFinite(h.g))) break;
      moves.push(h.g);
    }
    return moves;
  }

  // ---- the account's best runs: documents with a score, written by the server only (server.js)
  function recordRun(user, run, w) {
    const docs = docsOf(user), id = Date.now() + '-' + crypto.randomBytes(2).toString('hex');
    docs[id] = { t: Date.now(), score: w.score, avg: avgErrOf(w.h), timer: run.timer, h: w.h.map(x => ({ q: x.q, u: x.u, a: x.a, g: x.g, dmg: x.dmg })) };
    const ranked = rankRuns(Object.entries(docs).filter(([k, d]) => isRunDoc(k, d)).map(([k, d]) => Object.assign({ id: k }, d)));
    ranked.slice(KEEP_RUNS).forEach(r => { delete docs[r.id]; });
    const placed = ranked.slice(0, KEEP_RUNS).findIndex(r => r.id === id);
    return { id: placed >= 0 ? id : null, placed, best: ranked.length ? ranked[0].score : w.score };
  }

  const practice = new Map();                        // account -> practice run
  function getRun(user, daily, create, day) {
    if (!daily) return practice.get(user) || null;
    const date = day || today(), mine = records(user);
    if (!mine[date]) {
      const before = finishedOn(user, date);
      if (before) return { user, daily: true, day: date, before };          // finished before the server dealt Survival
      const moves = carried(user, date);
      if (startedOn(user, date) && !moves) return { user, daily: true, day: date, blocked: true };   // started in the browser, nothing to go on with: that was the day's try
      if (!create && !moves) return null;
      mine[date] = { t0: Date.now(), t1: 0, moves: moves || [], shownAt: Date.now() };
      if (date !== today()) mine[date].late = true;                           // played through the archive: does not count for streaks
      dailyDoc(user).days[date] = { score: null, started: Date.now() };        // one try: it counts from the first question on
      save();
    }
    return { user, daily: true, day: date, timer: DAILY_TIMER, rec: mine[date] };
  }
  function finish(run, w) {
    const out = { score: w.score, avg: avgErrOf(w.h), h: w.h.map(x => ({ q: x.q, u: x.u, a: x.a, g: x.g, dmg: x.dmg })) };
    if (!run.pack) Object.assign(out, recordRun(run.user, run, w));             // pack runs are not ranked
    if (run.daily) {
      run.rec.t1 = Date.now();
      dailyDoc(run.user).days[run.day] = { score: w.score, avg: out.avg, t: Date.now(), h: out.h };
      if (run.rec.late) markLate(docsOf(run.user), 'sv', run.day);
      save();
    } else { practice.delete(run.user); if (!run.pack) save(); }
    run.result = out;
    return out;
  }
  function view(run) {
    if (run.blocked) return { daily: true, day: run.day, done: true, blocked: true };
    if (run.before) return { daily: true, day: run.day, done: true, result: { score: run.before.score, avg: run.before.avg ?? null, h: run.before.h || [] } };
    const w = walk(run), out = { daily: run.daily, day: run.daily ? run.day : null, timer: run.timer, pack: run.pack ? PACKS[run.pack].name : null, life: w.life, score: w.score, i: run.rec.moves.length, done: w.done };
    const l = w.h[w.h.length - 1];
    if (l) out.last = { q: l.q, u: l.u, a: l.a, g: l.g, dmg: l.dmg, note: l.n, timeout: l.g === null, healed: l.dmg < 0, before: l.before, after: l.after };   // the question just answered, with its answer
    if (w.done) out.result = run.result || { score: w.score, avg: avgErrOf(w.h), h: w.h.map(x => ({ q: x.q, u: x.u, a: x.a, g: x.g, dmg: x.dmg })) };
    else {
      const q = questionAt(run, run.rec.moves.length);
      out.q = { q: q.q, u: q.u };                                                 // the next question, without its answer
      out.left = run.timer ? Math.max(0, run.timer * 1000 - (Date.now() - run.rec.shownAt)) : null;
    }
    return out;
  }

  async function handle(req, res, url, query, user) {
    if (!url.startsWith('/api/sv/')) return false;
    const act = url.slice('/api/sv/'.length);
    if (req.method === 'GET') {
      if (act === 'home') {
        const day = pastDay(query.get('day'), mayArchive(user)); if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }
        const date = day || today(), done = !!finishedOn(user, date), blocked = !done && !records(user)[date] && startedOn(user, date) && !carried(user, date);
        const going = !done && !blocked && !!(records(user)[date] || (carried(user, date) || []).length);
        send(res, 200, { date, done, going, blocked, practice: practice.has(user), practiceLeft: limits.practiceLeft(user, 'sv'), packs: Object.keys(PACKS).map(id => ({ id, name: PACKS[id].name })), plus: !!hasPlus(user) }); return true;
      }
      send(res, 404, { error: 'not found' }); return true;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'not allowed' }); return true; }
    const body = await readBody(req), daily = body.daily === true;
    const day = daily ? pastDay(body.day, mayArchive(user)) : null;
    if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }

    if (act === 'start') {
      if (daily) {                                    // today's run continues where it was, never dealt again
        const run = getRun(user, true, true, day);
        if (run.blocked) { send(res, 409, Object.assign({ error: "Today's run was started before and counts as today's try." }, view(run))); return true; }
        send(res, 200, view(run)); return true;
      }
      if (body.resume) { const run = practice.get(user); if (!run) { send(res, 404, { error: 'No run to continue' }); return true; } send(res, 200, view(run)); return true; }
      const pack = typeof body.pack === 'string' && body.pack ? body.pack : '';
      if (pack && !PACKS[pack]) { send(res, 400, { error: 'Unknown question pack' }); return true; }
      if (pack && !hasPlus(user)) { send(res, 403, { error: 'Question packs are part of Plus' }); return true; }
      const t = limits.takePractice(user, 'sv');                 // a new practice run counts for a free account (packs are Plus anyway)
      if (!t.ok) { send(res, 403, t.refusal); return true; }
      const timer = TIMERS.includes(body.timer) ? body.timer : 15;
      if (practice.size > 5000) practice.clear();
      const run = { user, daily: false, timer, pack, pool: pack ? PACKS[pack].q : Q, seq: [], rec: { moves: [], shownAt: Date.now() } };
      practice.set(user, run);
      send(res, 200, Object.assign(view(run), { practiceLeft: t.left })); return true;
    }
    if (act === 'clear-runs') {                      // "Clear saved runs": the account's best runs go
      const docs = docsOf(user); for (const k of Object.keys(docs)) if (isRunDoc(k, docs[k])) delete docs[k];
      save(); send(res, 200, { ok: true }); return true;
    }
    const run = getRun(user, daily, false, day);
    if (!run) { send(res, 409, { error: 'Start a run first' }); return true; }
    if (run.before || run.blocked || walk(run).done) { send(res, 409, { error: 'This run is over' }); return true; }

    if (act === 'answer') {
      if (body.i !== run.rec.moves.length) { send(res, 409, { error: 'That question was already answered' }); return true; }   // a double click, or a second tab
      let g = body.g;
      if (g !== null && (typeof g !== 'number' || !isFinite(g) || !(g > 0) || g > 1e300)) { send(res, 400, { error: 'Enter a positive number' }); return true; }
      if (run.timer && Date.now() - run.rec.shownAt > run.timer * 1000 + GRACE_MS) g = null;   // too late: the time had run out
      run.rec.moves.push(g); run.rec.shownAt = Date.now();
      const w = walk(run);
      if (w.done) finish(run, w); else if (run.daily) save();
      send(res, 200, view(run)); return true;
    }
    if (act === 'end') {                             // "End run": the run ends here, with the score so far
      run.rec.ended = true;
      finish(run, walk(run));
      send(res, 200, view(run)); return true;
    }
    send(res, 404, { error: 'not found' }); return true;
  }
  return { handle, dailySeq, isRunDoc };
};
