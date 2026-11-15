// More/Less, server side.
//
// THE SERVER DECIDES EVERYTHING, like in geo-server.js and party-server.js. It deals the pairs from content/moreless.js,
// which the browser never gets, keeps the numbers, judges every "more" or "less" and stores the result. The browser
// sees the left card with its number and the right card without it; the right card's number leaves the server only
// after the call on it was made.
//
// Daily game: the same for everyone, played once, saved after every call (db.ml: account -> day -> calls). A reload,
// another device or a server restart continues it; it is never dealt again. The finished result goes into the
// account's x_stats.ml, where every reader of results already looks (friends table, head-to-head, levels,
// statistics); server.js keeps that part of x_stats out of the browser's reach. Practice games live in memory.
//
// The dealing is the one the browser used before, card for card, so a game dealt before this file existed (today's
// game in progress, a past day in the archive) comes out the same.
'use strict';
const crypto = require('crypto');
const { today, rngFrom, pick, shuffleR, fmt, pastDay, resultsOf, resultOn, markLate } = require('./games-common.js');

const ROUNDS = 5, CALLS = 5;                         // five categories, up to five calls each
const LEGACY_UNTIL = '2026-11-11';                   // daily games up to this day keep the pairs their players saw back then

// ---- the browser's dealing, unchanged (it lived in public/games.js)
function itemsFor(cat,r,Q){
  if(cat.trivia){
    return {label:'the number', src:'Each card is a different quantity in its own unit. Compare the raw numbers.',
      items:Q.map(q=>({name:q.q.replace(/\?$/,''),sub:'in '+q.u,v:q.a,show:fmt(q.a)+' '+q.u}))};
  }
  const set=pick(cat.sets,r);
  return {name:set.name, label:set.label, src:set.src, rating:!!set.rating, items:set.items.map(([n,s,v,ic])=>({name:n, sub:set.flag?'':s, v,
    icon:set.flag?s:(ic||set.icon||''), rating:!!set.rating,
    show:set.rating?v.toFixed(1)+' / 10':set.money?'$'+fmt(v):fmt(v)+' '+set.unit}))};
}
function chainOf(items,gap,r,diff,near){
  const okPair=(x,p)=>diff?Math.abs(x.v-p.v)>=diff:Math.max(x.v,p.v)/Math.min(x.v,p.v)>=gap;
  let pool=shuffleR(items,r); const chain=[pool.pop()];
  while(chain.length<6 && pool.length){
    const prev=chain[chain.length-1];
    // "near" keeps a pair comparable: at most that many times bigger (for ratings: that many points apart).
    const dist=(x,p)=>diff?Math.abs(x.v-p.v):Math.max(x.v,p.v)/Math.min(x.v,p.v);
    let i=near?pool.findIndex(x=>okPair(x,prev)&&dist(x,prev)<=near):pool.findIndex(x=>okPair(x,prev));
    if(i<0&&near){ let bd=Infinity; pool.forEach((x,j)=>{ if(okPair(x,prev)&&dist(x,prev)<bd){ bd=dist(x,prev); i=j; } }); }   // nothing that close: take the closest
    if(i<0) i=pool.findIndex(x=>x.v!==prev.v);
    if(i<0) break;
    chain.push(pool.splice(i,1)[0]);
  }
  return chain;
}
function deal(CATS, Q, seed, legacy){
  const r=rngFrom(seed);
  return CATS.map(cat=>{const s=itemsFor(cat,r,Q);return {name:s.name||cat.name,label:s.label,src:s.src,chain:chainOf(s.items,cat.gap,r,cat.diff,legacy?0:(cat.diff?1.5:cat.trivia?4:3))};});
}
// `questions`: the Survival questions (content/survival.js), which the trivia round compares. The whole list, as the
// browser had it, so every day's trivia round stays the same.
module.exports = function createMoreLess({ cats, questions, send, readBody, records, docsOf, save, mayArchive }) {
  const Q = Array.isArray(questions) ? questions : [];
  const dailyDeals = new Map();
  function dailyDeal(date) {
    if (!dailyDeals.has(date)) { if (dailyDeals.size > 12) dailyDeals.clear(); dailyDeals.set(date, deal(cats, Q, 'ml-' + date, date <= LEGACY_UNTIL)); }
    return dailyDeals.get(date);
  }

  // ---- where a game stands after the calls so far
  function walk(run) {
    const res = [[], [], [], [], []], log = []; let ci = 0, si = 0;
    for (const ch of run.rec.moves) {
      if (ci >= ROUNDS) break;
      const c = run.cats[ci], L = c.chain[si], R = c.chain[si + 1];
      if (!R) { ci++; si = 0; continue; }
      const ok = (ch === 'more') === (R.v > L.v);
      res[ci][si] = ok; log.push({ c: c.name, a: L, b: R, ch, ok });
      if (si >= CALLS - 1 || si + 2 >= c.chain.length) { ci++; si = 0; } else si++;
    }
    while (ci < ROUNDS && !run.cats[ci].chain[si + 1]) { ci++; si = 0; }   // a category too small to play (never with the current data)
    return { res, log, ci, si, done: ci >= ROUNDS };
  }
  // the result in the form the browser always stored it, so old and new results read the same everywhere
  function record(run, w) {
    return { score: w.res.flat().filter(Boolean).length, grid: w.res.map(r => r.map(x => (x ? 1 : 0))), cats: run.cats.map(c => c.name),
      log: w.log.map(l => ({ c: l.c, a: l.a.name, av: l.a.show, b: l.b.name, bv: l.b.show, ch: l.ch, ok: l.ok })) };
  }
  const card = (it, open) => Object.assign({ name: it.name }, it.sub ? { sub: it.sub } : null, it.icon ? { icon: it.icon } : null, it.rating ? { rating: true } : null, open ? { v: it.v, show: it.show } : null);

  // ---- the account's results (x_stats.ml) and archive marks (x_late), see games-common.js
  const finishedOn = (user, date) => resultOn(docsOf(user), 'ml', date);
  // A daily game somebody had started in the browser before the server dealt More/Less: its calls so far come along,
  // so it continues where it was instead of being dealt again (the pairs are the same, see above).
  function carried(user, date) {
    const run = docsOf(user).x_run, s = run && run.day === date && run.games && run.games.ml && run.games.ml.s;
    if (!s || s.seed !== 'ml-' + date || !Array.isArray(s.log)) return [];
    return s.log.map(l => l && l.choice).filter(c => c === 'more' || c === 'less').slice(0, ROUNDS * CALLS);
  }

  // ---- a game: the deal plus the calls made so far ("rec")
  const practice = new Map();                        // account -> practice game
  function getRun(user, daily, create, day) {
    if (!daily) {
      if (create) { if (practice.size > 5000) practice.clear(); practice.set(user, { user, daily: false, cats: deal(cats, Q, 'mlp-' + crypto.randomBytes(12).toString('hex'), false), rec: { moves: [] } }); }
      return practice.get(user) || null;
    }
    const date = day || today(), mine = records(user);
    if (!mine[date]) {
      const before = finishedOn(user, date);
      if (before) return { user, daily: true, day: date, before };          // finished in the browser before the server judged More/Less: that result stands
      if (!create) return null;
      mine[date] = { t0: Date.now(), t1: 0, moves: carried(user, date) };
      if (date !== today()) mine[date].late = true;                           // played through the archive: does not count for streaks
      save();
    }
    return { user, daily: true, day: date, cats: dailyDeal(date), rec: mine[date] };
  }
  function finish(run, w) {
    const rec = record(run, w), ml = resultsOf(docsOf(run.user), 'ml');
    ml.played++; ml.best = Math.max(ml.best, rec.score);
    if (run.daily) { run.rec.t1 = Date.now(); ml.days[run.day] = rec; if (run.rec.late) markLate(docsOf(run.user), 'ml', run.day); }
    else practice.delete(run.user);
    save();
    return { best: ml.best, played: ml.played, day: run.daily ? run.day : null, rec: run.daily ? rec : null };
  }
  function view(run, stats) {
    if (run.before) return { daily: true, day: run.day, done: true, rec: run.before };
    const w = walk(run), out = { daily: run.daily, day: run.daily ? run.day : null, i: run.rec.moves.length, done: w.done, res: w.res, score: w.res.flat().filter(Boolean).length };
    if (w.done) out.rec = run.daily ? finishedOn(run.user, run.day) || record(run, w) : record(run, w);
    else { const c = run.cats[w.ci]; Object.assign(out, { ci: w.ci, si: w.si, cat: { name: c.name, label: c.label, src: c.src }, left: card(c.chain[w.si], true), right: card(c.chain[w.si + 1], false) }); }
    const l = w.log[w.log.length - 1];
    if (l) out.last = { ok: l.ok, ch: l.ch, b: card(l.b, true) };                // the card just called, now with its number
    if (stats) out.stats = stats;
    return out;
  }
  async function handle(req, res, url, query, user) {
    if (!url.startsWith('/api/ml/')) return false;
    const act = url.slice('/api/ml/'.length);
    if (req.method === 'GET') {
      if (act === 'home') {                          // what the menu needs: is today's game finished, going, or not started
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

    if (act === 'start') {                           // a daily game that exists is continued, never dealt again
      const run = daily || !body.resume ? getRun(user, daily, true, day) : getRun(user, false, false);
      if (!run) { send(res, 404, { error: 'No game to continue' }); return true; }
      send(res, 200, view(run)); return true;
    }
    if (act === 'quit') {                            // a practice game is thrown away; a daily game cannot be
      if (!daily) practice.delete(user);
      send(res, 200, { ok: true }); return true;
    }
    if (act === 'answer') {
      const run = getRun(user, daily, false, day);
      if (!run) { send(res, 409, { error: 'Start a game first' }); return true; }
      if (run.before) { send(res, 409, { error: 'This game is over' }); return true; }
      const w = walk(run);
      if (w.done) { send(res, 409, { error: 'This game is over' }); return true; }
      if (body.i !== run.rec.moves.length) { send(res, 409, { error: 'That pair was already called' }); return true; }   // a double click, or a second tab
      if (body.choice !== 'more' && body.choice !== 'less') { send(res, 400, { error: 'More or less?' }); return true; }
      run.rec.moves.push(body.choice);
      const after = walk(run);
      const stats = after.done ? finish(run, after) : null;
      if (run.daily && !after.done) save();
      send(res, 200, view(run, stats)); return true;
    }
    send(res, 404, { error: 'not found' }); return true;
  }
  return { handle, deal: seed => deal(cats, Q, seed, false), dailyDeal, today };
};
