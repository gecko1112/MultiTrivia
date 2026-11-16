// Guessless, server side.
//
// THE SERVER DECIDES EVERYTHING, like in moreless-server.js. It deals the five questions from content/guessless.js,
// which the browser never gets, and scores every estimate. The browser sees a question and its unit; the answer and
// its note leave the server only after the estimate for that question was sent. Reading a number like "2.5k" or
// "40 million" stays in the browser (that decides nothing); the server checks the number it receives.
//
// Daily game: the same five questions for everyone, played once, saved after every estimate (db.gl: account -> day ->
// estimates). It continues from any browser and is never dealt again. The finished result goes into x_stats.gl, which
// server.js keeps out of the browser's reach. Practice games live in memory.
//
// The questions are picked the way the browser picked them, so a day's game is the game it always was.
'use strict';
const crypto = require('crypto');
const { NO_LIMITS } = require('./limits-server.js');
const { today, rngFrom, pick, pastDay, resultsOf, resultOn, markLate } = require('./games-common.js');

const N = 5;                                         // one question per category
const points = (g, a) => Math.round(100 * Math.max(0, 1 - Math.abs(Math.log10(g / a))));   // 100 when spot on, 0 from ten times off

module.exports = function createGuessless({ cats, send, readBody, records, docsOf, save, mayArchive, limits = NO_LIMITS }) {
  const deal = seed => { const r = rngFrom(seed); return cats.map(c => Object.assign({ cat: c.name }, pick(c.qs, r))); };   // the browser's pick, unchanged
  const dailyDeals = new Map();
  function dailyDeal(date) {
    if (!dailyDeals.has(date)) { if (dailyDeals.size > 12) dailyDeals.clear(); dailyDeals.set(date, deal('gl-' + date)); }
    return dailyDeals.get(date);
  }
  const finishedOn = (user, date) => resultOn(docsOf(user), 'gl', date);
  // the result in the form the browser always stored it
  const scored = run => run.rec.moves.map((g, i) => { const q = run.qs[i]; return { q: q.q, u: q.u, a: q.a, g, pts: points(g, q.a), cat: q.cat }; });
  const record = run => { const res = scored(run); return { total: res.reduce((s, x) => s + x.pts, 0), res }; };
  // A daily game somebody had started in the browser before the server dealt Guessless: its estimates come along.
  function carried(user, date) {
    const run = docsOf(user).x_run, s = run && run.day === date && run.games && run.games.gl && run.games.gl.s, g = s && s.gl;
    if (!g || !g.daily || !Array.isArray(g.res) || !Array.isArray(g.qs)) return [];
    const qs = dailyDeal(date), out = [];
    for (let i = 0; i < Math.min(g.res.length, N); i++) {
      const r = g.res[i];
      if (!r || r.q !== qs[i].q || typeof r.g !== 'number' || !(r.g > 0) || !isFinite(r.g)) break;   // only the same questions, in order
      out.push(r.g);
    }
    return out;
  }

  const practice = new Map();                        // account -> practice game
  function getRun(user, daily, create, day) {
    if (!daily) {
      if (create) { if (practice.size > 5000) practice.clear(); practice.set(user, { user, daily: false, qs: deal('glp-' + crypto.randomBytes(12).toString('hex')), rec: { moves: [] } }); }
      return practice.get(user) || null;
    }
    const date = day || today(), mine = records(user);
    if (!mine[date]) {
      const before = finishedOn(user, date);
      if (before) return { user, daily: true, day: date, before };          // finished in the browser before the server judged Guessless
      if (!create) return null;
      mine[date] = { t0: Date.now(), t1: 0, moves: carried(user, date) };
      if (date !== today()) mine[date].late = true;
      save();
    }
    return { user, daily: true, day: date, qs: dailyDeal(date), rec: mine[date] };
  }
  function finish(run) {
    const rec = record(run), gl = resultsOf(docsOf(run.user), 'gl');
    gl.played++; gl.best = Math.max(gl.best, rec.total);
    if (run.daily) { run.rec.t1 = Date.now(); gl.days[run.day] = rec; if (run.rec.late) markLate(docsOf(run.user), 'gl', run.day); }
    else practice.delete(run.user);
    save();
    return { best: gl.best, played: gl.played, day: run.daily ? run.day : null, rec: run.daily ? rec : null };
  }
  function view(run, stats) {
    if (run.before) return { daily: true, day: run.day, done: true, rec: run.before };
    const i = run.rec.moves.length, done = i >= N, res = scored(run);
    const out = { daily: run.daily, day: run.daily ? run.day : null, i, n: N, done, total: res.reduce((s, x) => s + x.pts, 0) };
    if (!done) { const q = run.qs[i]; out.q = { cat: q.cat, q: q.q, u: q.u }; }   // the next question, without its answer
    if (i) { const q = run.qs[i - 1]; out.last = Object.assign({}, res[i - 1], { note: q.n }); }   // the question just answered, with its answer
    if (done) out.rec = run.daily ? finishedOn(run.user, run.day) || record(run) : record(run);
    if (stats) out.stats = stats;
    return out;
  }

  async function handle(req, res, url, query, user) {
    if (!url.startsWith('/api/gl/')) return false;
    const act = url.slice('/api/gl/'.length);
    if (req.method === 'GET') {
      if (act === 'home') {
        const day = pastDay(query.get('day'), mayArchive(user)); if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }
        const date = day || today(), done = !!finishedOn(user, date), going = !done && !!(records(user)[date] || carried(user, date).length);
        send(res, 200, { date, done, going, practice: practice.has(user), practiceLeft: limits.practiceLeft(user, 'gl') }); return true;
      }
      send(res, 404, { error: 'not found' }); return true;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'not allowed' }); return true; }
    const body = await readBody(req), daily = body.daily === true;
    const day = daily ? pastDay(body.day, mayArchive(user)) : null;
    if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }

    if (act === 'start') {                           // a daily game that exists is continued, never dealt again
      const t = !daily && !body.resume ? limits.takePractice(user, 'gl') : null;   // a new practice game counts for a free account
      if (t && !t.ok) { send(res, 403, t.refusal); return true; }
      const run = daily || !body.resume ? getRun(user, daily, true, day) : getRun(user, false, false);
      if (!run) { send(res, 404, { error: 'No game to continue' }); return true; }
      send(res, 200, t ? Object.assign(view(run), { practiceLeft: t.left }) : view(run)); return true;
    }
    if (act === 'quit') { if (!daily) practice.delete(user); send(res, 200, { ok: true }); return true; }
    if (act === 'answer') {
      const run = getRun(user, daily, false, day);
      if (!run) { send(res, 409, { error: 'Start a game first' }); return true; }
      if (run.before || run.rec.moves.length >= N) { send(res, 409, { error: 'This game is over' }); return true; }
      if (body.i !== run.rec.moves.length) { send(res, 409, { error: 'That question was already answered' }); return true; }
      const g = body.g;
      if (typeof g !== 'number' || !isFinite(g) || !(g > 0) || g > 1e300) { send(res, 400, { error: 'Enter a positive number' }); return true; }
      run.rec.moves.push(g);
      const stats = run.rec.moves.length >= N ? finish(run) : null;
      if (run.daily && !stats) save();
      send(res, 200, view(run, stats)); return true;
    }
    send(res, 404, { error: 'not found' }); return true;
  }
  return { handle, deal, dailyDeal };
};
