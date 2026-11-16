// Levels and achievements, worked out on the server from the results the server itself recorded.
//
//   XP = 40 for every finished daily game + 10 for every game of any kind + the XP of every achievement
//
// The browser asks GET /api/levels and draws what it is told; it cannot change a number. What the account has earned
// is kept in its "x_ach" document, which only the server writes (SERVER_DOCS in server.js):
//   got    when each achievement was first earned (an achievement is announced once, in the reply that earns it)
//   flags  achievements that cannot be worked out from results:
//          - "company" and "top" depend on friends' results; the server checks every day it has
//          - "tour", "poke", "annoy", "flick" happen with Fermi in the browser, so the browser reports them
//            (POST /api/levels/flag). Only these four names are accepted, once each, worth 25 to 75 XP.
//   lvl    the level last announced, for "Level up"
'use strict';

const XP_DAILY = 40, XP_GAME = 10;
const TITLES = [[1, 'Rookie'], [3, 'Bench player'], [5, 'Regular'], [8, 'Starter'], [12, 'Slugger'], [16, 'All-Star'], [20, 'MVP'], [25, 'Legend'], [30, 'Hall of Famer']];
// XP needed to go from one level to the next grows by 50 each time: 150, 200, 250, ...
function levelFor(xp){ let lv = 1, need = 150, into = xp; while (into >= need) { into -= need; lv++; need = 150 + 50 * (lv - 1); } return { lv, into, need }; }
function titleFor(lv){ let t = TITLES[0][1]; for (const [n, name] of TITLES) if (lv >= n) t = name; return t; }

// s = the numbers from gather(). "prog" returns [current, target] for the progress bar.
const ACH = [
  { g: 'Overall', id: 'first', name: 'First pitch', desc: 'Finish your first daily game.', xp: 50, test: s => s.dailies >= 1 },
  { g: 'Overall', id: 'sweep', name: 'Clean sweep', desc: 'Finish all five daily games on the same day.', xp: 150, test: s => s.sweeps >= 1 },
  { g: 'Overall', id: 'days7', name: 'Regular', desc: 'Play on 7 different days.', xp: 100, prog: s => [s.days, 7] },
  { g: 'Overall', id: 'days30', name: 'Season ticket', desc: 'Play on 30 different days.', xp: 300, prog: s => [s.days, 30] },
  { g: 'Overall', id: 'streak3', name: 'On a roll', desc: 'Play three days in a row.', xp: 75, prog: s => [s.bestStreak, 3] },
  { g: 'Overall', id: 'streak7', name: 'Full week', desc: 'Play seven days in a row.', xp: 200, prog: s => [s.bestStreak, 7] },
  { g: 'Overall', id: 'games50', name: 'Fifty up', desc: 'Play 50 games in total.', xp: 100, prog: s => [s.games, 50] },
  { g: 'Overall', id: 'games200', name: 'Two hundred club', desc: 'Play 200 games in total.', xp: 300, prog: s => [s.games, 200] },

  { g: 'Survival', id: 'sv10', name: 'Still standing', desc: 'Survive 10 questions in one run.', xp: 75, prog: s => [s.svBest, 10] },
  { g: 'Survival', id: 'sv20', name: 'Hard to kill', desc: 'Survive 20 questions in one run.', xp: 150, prog: s => [s.svBest, 20] },
  { g: 'Survival', id: 'sv30', name: 'Indestructible', desc: 'Survive 30 questions in one run.', xp: 300, prog: s => [s.svBest, 30] },
  { g: 'Survival', id: 'svHeal', name: 'Dead on', desc: 'Land a guess within 5% of the answer.', xp: 50, test: s => s.svHeal },
  { g: 'Survival', id: 'svSharp', name: 'Steady hand', desc: 'Finish a run of 10 or more with an average error under 0.3.', xp: 150, test: s => s.svSharp },

  { g: 'More/Less', id: 'ml13', name: 'Better than a coin', desc: 'Score 13 or more out of 25.', xp: 50, prog: s => [s.mlBest, 13] },
  { g: 'More/Less', id: 'ml20', name: 'Sharp instincts', desc: 'Score 20 or more out of 25.', xp: 150, prog: s => [s.mlBest, 20] },
  { g: 'More/Less', id: 'ml25', name: 'Perfect game', desc: 'Get all 25 right.', xp: 400, prog: s => [s.mlBest, 25] },

  { g: 'Guessless', id: 'gl300', name: 'In the ballpark', desc: 'Score 300 or more out of 500.', xp: 75, prog: s => [s.glBest, 300] },
  { g: 'Guessless', id: 'gl400', name: 'Close call', desc: 'Score 400 or more out of 500.', xp: 150, prog: s => [s.glBest, 400] },
  { g: 'Guessless', id: 'gl450', name: 'Bullseye', desc: 'Score 450 or more out of 500.', xp: 300, prog: s => [s.glBest, 450] },

  { g: 'Clueless', id: 'cl1', name: 'Got a clue', desc: 'Solve your first word.', xp: 50, test: s => s.clSolved >= 1 },
  { g: 'Clueless', id: 'clNoHint', name: 'No help needed', desc: 'Solve a daily word without a hint.', xp: 100, test: s => s.clNoHint },
  { g: 'Clueless', id: 'clFast', name: 'Mind reader', desc: 'Solve a daily word in 20 guesses or fewer.', xp: 200, test: s => s.clFewest > 0 && s.clFewest <= 20 },
  { g: 'Clueless', id: 'cl10', name: 'Wordsmith', desc: 'Solve 10 words.', xp: 200, prog: s => [s.clSolved, 10] },

  { g: 'Wordy', id: 'wd1', name: 'First word', desc: 'Win your first daily Wordy.', xp: 50, test: s => s.wdWon >= 1 },
  { g: 'Wordy', id: 'wd3', name: 'Three and done', desc: 'Win a daily Wordy in three guesses or fewer.', xp: 150, test: s => s.wdFewest > 0 && s.wdFewest <= 3 },
  { g: 'Wordy', id: 'wdS5', name: 'Five alive', desc: 'Win five daily Wordys in a row.', xp: 150, prog: s => [s.wdStreak, 5] },
  { g: 'Wordy', id: 'wdS10', name: 'Unbroken', desc: 'Win ten daily Wordys in a row.', xp: 300, prog: s => [s.wdStreak, 10] },

  { g: 'Atlas', id: 'at1', name: 'Passport stamp', desc: 'Finish your first daily Atlas game.', xp: 50, test: s => s.atDailies >= 1 },
  { g: 'Atlas', id: 'atFlags', name: 'Flag bearer', desc: 'Name all 10 flags in a daily.', xp: 200, prog: s => [s.atFlags, 10] },
  { g: 'Atlas', id: 'atShapes', name: 'Cartographer', desc: 'Get all 10 outlines right in a daily.', xp: 150, prog: s => [s.atShapes, 10] },
  { g: 'Atlas', id: 'atDirect', name: 'As the crow walks', desc: 'Solve a daily Overland on the shortest way.', xp: 150, test: s => s.atDirect },

  { g: 'With friends', id: 'company', name: 'Good company', desc: 'Play on a day when at least three others play too.', xp: 75, flag: true },
  { g: 'With friends', id: 'top', name: 'Top of the table', desc: 'Hold the best result of the day in any game.', xp: 100, flag: true },

  { g: 'Fermi', id: 'tour', name: 'Paid attention', desc: "Sit through Fermi's whole tour.", xp: 25, flag: true },
  { g: 'Fermi', id: 'poke', name: 'There he is', desc: 'Find Fermi somewhere on the site and click him.', xp: 25, flag: true, secret: true },
  { g: 'Fermi', id: 'annoy', name: 'Unwelcome', desc: 'Annoy Fermi until he leaves.', xp: 50, flag: true, secret: true },
  { g: 'Fermi', id: 'flick', name: 'Quick draw', desc: 'Tell Fermi "Not now" on the tour and hit him before he has flown off.', xp: 75, flag: true, secret: true }
];
const BROWSER_FLAGS = ['tour', 'poke', 'annoy', 'flick'];

// ---- streaks, the same rule as window.bpStreak in public/day.js (tests/levels-api.js checks that both agree)
//   live: the days on which something was played on the day itself; saver: Plus forgives one missed day a week
//   (Monday to Sunday), which keeps a streak alive without adding to it; today: a day still open never breaks it.
const DAY = 864e5;
const shift = (k, n) => new Date(Date.parse(k + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const week = k => { const d = new Date(k + 'T12:00:00Z'); return shift(k, -((d.getUTCDay() + 6) % 7)); };
function streak(liveKeys, saver, today){
  const live = liveKeys.slice().sort(), used = {}, saved = []; let best = 0, run = 0, prev = null;
  const bridge = (a, b) => {
    const out = [], mine = {};
    for (let k = shift(a, 1); k < b; k = shift(k, 1)) { const w = week(k); if (!saver || used[w] || mine[w]) return null; mine[w] = 1; out.push(k); }
    return out;
  };
  const take = gap => gap.forEach(g => { used[week(g)] = 1; saved.push(g); });
  for (const k of live) {
    const gap = prev ? bridge(prev, k) : null;
    if (gap) { take(gap); run++; } else run = 1;
    if (run > best) best = run;
    prev = k;
  }
  let now = 0;
  if (prev && prev <= today) { const tail = prev === today ? [] : bridge(prev, today); if (tail) { take(tail); now = run; } }
  return { now, best, days: live.length, saved };
}

// ---- the numbers, from the account's documents and the Atlas record
function gather(docs, atlas, saver, today){
  const atD = (atlas && atlas.days) || {}, atAll = Object.values(atD), atDone = atAll.reduce((n, d) => n + Object.keys(d).length, 0);
  const st = docs.x_stats || {}, ml = st.ml || {}, gl = st.gl || {}, cl = st.cl || {}, wd = docs.x_words || {};
  const svDays = (docs.x_daily || {}).days || {}, mlD = ml.days || {}, glD = gl.days || {}, clD = cl.days || {}, wdD = wd.days || {};
  const runs = Object.entries(docs).filter(([id, d]) => !id.startsWith('x_') && d && typeof d.score === 'number').map(([, d]) => d);
  const svDone = Object.entries(svDays).filter(([, d]) => d && d.score != null);
  const perDay = {}, add = k => { perDay[k] = (perDay[k] || 0) + 1; };
  svDone.forEach(([k]) => add(k)); [mlD, glD, clD, wdD].forEach(D => Object.keys(D).forEach(add));
  const dates = [...new Set(Object.keys(perDay).concat(Object.keys(atD)))].sort();     // an Atlas game counts as having played that day
  // only games played on the day itself count for streaks; games played later through the archive are marked "late"
  const late = (docs.x_late || {}).days || {}, live = new Set();
  const mark = (k, g) => { if (!(late[k] && late[k][g])) live.add(k); };
  svDone.forEach(([k]) => mark(k, 'sv')); [[mlD, 'ml'], [glD, 'gl'], [clD, 'cl'], [wdD, 'wd']].forEach(([D, g]) => Object.keys(D).forEach(k => mark(k, g)));
  Object.keys(atD).forEach(k => { if (Object.values(atD[k]).some(r => !r.late)) live.add(k); });
  const allRuns = runs.concat(svDone.map(([, d]) => d));
  const num = (v, d) => typeof v === 'number' && isFinite(v) ? v : d;
  const min = a => a.length ? Math.min(...a) : 0, max = a => a.length ? Math.max(...a) : 0;
  const clOk = Object.values(clD).filter(d => d && d.solved), wdOk = Object.values(wdD).filter(d => d && d.solved);
  const classic = svDone.length + Object.keys(mlD).length + Object.keys(glD).length + Object.keys(clD).length + Object.keys(wdD).length, dailies = classic + atDone;
  return {
    perDay, days: dates.length, dailies, bestStreak: streak([...live], saver, today).best,
    sweeps: Object.keys(perDay).filter(k => perDay[k] >= 5).length,
    // practice games are counted where the game keeps a counter; Survival keeps its ten best runs
    games: Math.max(classic, svDone.length + runs.length + num(ml.played, 0) + num(gl.played, 0) + num(cl.played, 0) + num(wd.played, 0)) + atDone + num(atlas && atlas.played, 0),
    atDailies: atDone, atFlags: max(atAll.map(d => num(d.flags && d.flags.score, 0))), atShapes: max(atAll.map(d => num(d.shapes && d.shapes.score, 0))),
    atDirect: atAll.some(d => d.route && d.route.won && d.route.used === d.route.between),
    svBest: max(allRuns.map(r => num(r.score, 0))),
    svHeal: allRuns.some(r => Array.isArray(r.h) && r.h.some(q => q && q.dmg < 0)),
    svSharp: allRuns.some(r => num(r.score, 0) >= 10 && typeof r.avg === 'number' && r.avg < 0.3),
    mlBest: Math.max(num(ml.best, 0), max(Object.values(mlD).map(d => num(d && d.score, 0)))),
    glBest: Math.max(num(gl.best, 0), max(Object.values(glD).map(d => num(d && d.total, 0)))),
    clSolved: Math.max(num(cl.solved, 0), clOk.length), clNoHint: clOk.some(d => !d.hints), clFewest: min(clOk.map(d => num(d.guesses, 999))),
    wdWon: Math.max(num(wd.won, 0), wdOk.length), wdFewest: min(wdOk.map(d => num(d.guesses, 9))), wdStreak: Math.max(num(wd.maxStreak, 0), num(wd.streak, 0))
  };
}
const earned = (a, s, flags) => a.flag ? !!flags[a.id] : a.test ? !!a.test(s) : (p => p[0] >= p[1])(a.prog(s));

module.exports = function createLevels({ db, save, send, readBody, today, hasPlus, atlasOf, dailyValues, circle }) {
  const docsOf = u => (db.docs[u] = db.docs[u] || {});
  // "company" and "top", from the daily games finished on the day itself (late ones are left out) by this account and its friends
  const CLASSIC = ['sv', 'ml', 'gl', 'cl', 'wd'];
  function social(u) {
    const out = {}, mine = dailyValues(u), others = circle(u).filter(o => o !== u).map(o => dailyValues(o));
    const won = (g, v) => (g === 'cl' || g === 'wd') ? v > 0 : v != null;                       // a word game counts once solved
    const myDays = new Set(); for (const g of CLASSIC) for (const d of Object.keys(mine[g] || {})) myDays.add(d);
    for (const d of myDays) {
      if (!out.company && others.filter(o => CLASSIC.some(g => o[g] && d in o[g])).length >= 3) out.company = true;
      if (!out.top) for (const g of CLASSIC) {
        const v = mine[g] && mine[g][d]; if (v == null || !won(g, v)) continue;
        const rivals = others.filter(o => o[g] && d in o[g]).map(o => o[g][d]);
        if (rivals.length && rivals.every(r => r <= v)) { out.top = true; break; }
      }
      if (out.company && out.top) break;
    }
    return out;
  }
  // Works out the account's levels. `announce`: this is the account's own look, so what is new gets marked as seen.
  function compute(u, announce) {
    const docs = docsOf(u), first = !docs.x_ach;
    const saved = Object.assign({ got: {}, flags: {}, lvl: 0 }, docs.x_ach || {}); saved.got = Object.assign({}, saved.got); saved.flags = Object.assign({}, saved.flags);
    const s = gather(docs, atlasOf(u), !!hasPlus(u), today());
    for (const id of Object.keys(social(u))) if (!saved.flags[id]) saved.flags[id] = Date.now();
    const have = ACH.filter(a => earned(a, s, saved.flags));
    const fresh = have.filter(a => !saved.got[a.id]);
    fresh.forEach(a => { saved.got[a.id] = Date.now(); });
    const xp = s.dailies * XP_DAILY + s.games * XP_GAME + have.reduce((n, a) => n + a.xp, 0), L = levelFor(xp);
    const levelUp = !first && !!saved.lvl && L.lv > saved.lvl;
    const got = new Set(have.map(a => a.id));
    const view = {
      xp, level: L.lv, into: L.into, need: L.need, title: titleFor(L.lv),
      stats: { days: s.days, dailies: s.dailies, games: s.games, bestStreak: s.bestStreak }, perDay: s.perDay,
      achievements: ACH.map(a => {
        const has = got.has(a.id), hidden = a.secret && !has;
        return { g: a.g, id: a.id, xp: a.xp, got: has, secret: !!a.secret, name: hidden ? null : a.name, desc: hidden ? null : a.desc, prog: !has && a.prog ? a.prog(s) : null };
      })
    };
    if (announce) {
      Object.assign(view, { first, levelUp, fresh: fresh.map(a => ({ id: a.id, name: a.name, desc: a.desc, xp: a.xp })) });
      const before = JSON.stringify(docs.x_ach || null);
      saved.lvl = L.lv;
      docs.x_ach = saved;
      if (JSON.stringify(saved) !== before) save();
    }
    return view;
  }

  async function handle(req, res, url, query, user) {
    if (url === '/api/levels' && req.method === 'GET') { send(res, 200, compute(user, true)); return true; }
    if (url === '/api/levels/flag' && req.method === 'POST') {                     // Fermi, reported by the browser (see the top)
      const id = String((await readBody(req)).id || '');
      if (!BROWSER_FLAGS.includes(id)) { send(res, 400, { error: 'Unknown achievement' }); return true; }
      const docs = docsOf(user), a = docs.x_ach = Object.assign({ got: {}, flags: {}, lvl: 0 }, docs.x_ach || {});
      a.flags = Object.assign({}, a.flags); if (!a.flags[id]) { a.flags[id] = Date.now(); save(); }
      send(res, 200, compute(user, true)); return true;
    }
    return false;
  }
  return { handle, compute };
};
module.exports.streak = streak;
module.exports.levelFor = levelFor;
