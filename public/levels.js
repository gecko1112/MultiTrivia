// Levels and achievements.
// Everything is worked out from the results a player already has saved, so there is nothing extra to keep in sync:
//   XP = points for every game played + points for every achievement.
// The only things stored separately (in the "x_ach" document) are achievements that can't be recomputed later,
// such as finding the robot, and the list of what has already been announced with a toast.
(function(){
'use strict';
const $ = id => document.getElementById(id);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const XP_DAILY = 40;      // per finished daily game
const XP_GAME = 10;       // per game of any kind, practice included
const TITLES = [[1, 'Rookie'], [3, 'Bench player'], [5, 'Regular'], [8, 'Starter'], [12, 'Slugger'], [16, 'All-Star'], [20, 'MVP'], [25, 'Legend'], [30, 'Hall of Famer']];
// XP needed to go from one level to the next grows by 50 each time: 150, 200, 250, ...
function levelFor(xp){ let lv = 1, need = 150, into = xp; while (into >= need) { into -= need; lv++; need = 150 + 50 * (lv - 1); } return { lv, into, need }; }
function titleFor(lv){ let t = TITLES[0][1]; for (const [n, name] of TITLES) if (lv >= n) t = name; return t; }

// s = the numbers from gather(). "prog" (optional) returns [current, target] for the progress bar.
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

// ---------------------------------------------------------------- numbers from the saved results
// "atlas" is what the server recorded for the Atlas games (/api/geo/history): those results never pass through the browser.
function gather(docs, atlas){
  const atD = (atlas && atlas.days) || {}, atAll = Object.values(atD), atDone = atAll.reduce((n, d) => n + Object.keys(d).length, 0);
  const st = docs.x_stats || {}, ml = st.ml || {}, gl = st.gl || {}, cl = st.cl || {}, wd = docs.x_words || {};
  const svDays = (docs.x_daily || {}).days || {}, mlD = ml.days || {}, glD = gl.days || {}, clD = cl.days || {}, wdD = wd.days || {};
  const runs = Object.entries(docs).filter(([id, d]) => !id.startsWith('x_') && d && typeof d.score === 'number').map(([, d]) => d);
  const svDone = Object.entries(svDays).filter(([, d]) => d && d.score != null);
  const perDay = {};
  const add = k => { perDay[k] = (perDay[k] || 0) + 1; };
  svDone.forEach(([k]) => add(k)); [mlD, glD, clD, wdD].forEach(D => Object.keys(D).forEach(add));
  const dates = [...new Set(Object.keys(perDay).concat(Object.keys(atD)))].sort();   // an Atlas game counts as having played that day
  // only games played on the day itself count here; "late" ones are noted by archive.js (classic games) and the server (Atlas)
  const late = (docs.x_late || {}).days || {}, live = new Set();
  const mark = (k, g) => { if (!(late[k] && late[k][g])) live.add(k); };
  svDone.forEach(([k]) => mark(k, 'sv')); [[mlD, 'ml'], [glD, 'gl'], [clD, 'cl'], [wdD, 'wd']].forEach(([D, g]) => Object.keys(D).forEach(k => mark(k, g)));
  Object.keys(atD).forEach(k => { if (Object.values(atD[k]).some(r => !r.late)) live.add(k); });
  // counted in day.js; with Plus the streak saver forgives one missed day a week
  const bestStreak = window.bpStreak([...live], !!(window.bpPlus && window.bpPlus.has()), window.bpRealToday()).best;
  const allRuns = runs.concat(svDone.map(([, d]) => d));
  const num = (v, d) => typeof v === 'number' && isFinite(v) ? v : d;
  const min = a => a.length ? Math.min.apply(null, a) : 0;
  const max = a => a.length ? Math.max.apply(null, a) : 0;
  const clOk = Object.values(clD).filter(d => d && d.solved), wdOk = Object.values(wdD).filter(d => d && d.solved);
  const classic = svDone.length + Object.keys(mlD).length + Object.keys(glD).length + Object.keys(clD).length + Object.keys(wdD).length, dailies = classic + atDone;
  return {
    perDay, days: dates.length, dailies, bestStreak,
    sweeps: Object.keys(perDay).filter(k => perDay[k] >= 5).length,
    // Practice games are only counted where the game keeps a counter; Survival keeps its ten best runs.
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
function earned(a, s, flags){
  if (a.flag) return !!flags[a.id];
  if (a.test) return !!a.test(s);
  const p = a.prog(s); return p[0] >= p[1];
}

// ---------------------------------------------------------------- state
let me = null, S = null, saved = null, view = null, busy = false, again = false, timer = null;

async function getJSON(url){ const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
// Saved with a plain fetch on purpose: it must not trigger the "a game was saved" refresh that calls us.
function store(){ return fetch('/api/docs/x_ach', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(saved) }).catch(() => {}); }
function todayKey(){ const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function rankValue(k, d){
  if (k === 'sv') return d.score == null ? -1 : d.score;
  if (k === 'ml') return d.score || 0;
  if (k === 'gl') return d.total || 0;
  return d.solved ? 1e6 - (d.guesses || 0) : -1;
}
// Achievements that depend on other players can only be seen on the day itself, so they are remembered once earned.
function socialFlags(day){
  const KEYS = ['sv', 'ml', 'gl', 'cl', 'wd'], out = [];
  const mine = day.players.find(p => p.me); if (!mine) return out;
  const played = p => KEYS.some(k => p[k] && !(k === 'sv' && p.sv.score == null));
  if (played(mine) && day.players.filter(p => !p.me && played(p)).length >= 3) out.push('company');
  for (const k of KEYS) {
    if (!mine[k] || rankValue(k, mine[k]) < 0) continue;
    const others = day.players.filter(p => !p.me && p[k]);
    if (others.length && others.every(p => rankValue(k, p[k]) <= rankValue(k, mine[k]))) { out.push('top'); break; }
  }
  return out;
}

async function refresh(){
  if (!me) return;
  if (busy) { again = true; return; }
  busy = true;
  try {
    const j = await getJSON('/api/docs');
    const docs = {}; j.docs.forEach(d => { docs[d.id] = d.data; });
    const first = !docs.x_ach;
    saved = Object.assign({ got: {}, flags: {}, lvl: 0 }, docs.x_ach || {});
    saved.got = saved.got || {}; saved.flags = saved.flags || {};
    let atlas = null; try { atlas = await getJSON('/api/geo/history'); } catch (e) {}
    S = gather(docs, atlas);
    let dirty = false;
    try { socialFlags(await getJSON('/api/day?date=' + todayKey())).forEach(id => { if (!saved.flags[id]) { saved.flags[id] = Date.now(); dirty = true; } }); } catch (e) {}

    const have = ACH.filter(a => earned(a, S, saved.flags));
    const fresh = have.filter(a => !saved.got[a.id]);
    fresh.forEach(a => { saved.got[a.id] = Date.now(); dirty = true; });
    const xp = S.dailies * XP_DAILY + S.games * XP_GAME + have.reduce((n, a) => n + a.xp, 0);
    const L = levelFor(xp);
    view = { xp, L, title: titleFor(L.lv), have, total: ACH.length };

    // Announce what is new. The very first time, a player may already have a pile of them: say so once.
    if (first) { if (fresh.length) window.bpToast('Achievements', fresh.length + ' unlocked', 'You start at level ' + L.lv + '.', openProfile, true); }
    else {
      if (fresh.length > 3) window.bpToast('Achievements', fresh.length + ' unlocked', '', openProfile, true);
      else fresh.forEach(a => window.bpToast('Achievement, +' + a.xp + ' XP', a.name, a.desc, openProfile, true));
      if (L.lv > (saved.lvl || 0) && saved.lvl) window.bpToast('Level up', 'Level ' + L.lv, view.title, openProfile, true);
    }
    if (L.lv !== saved.lvl) { saved.lvl = L.lv; dirty = true; }
    if (dirty) await store();
    render();
    window.dispatchEvent(new CustomEvent('bp-level', { detail: { perDay: S.perDay, level: L.lv } }));
  } catch (e) { /* offline or logged out: leave the chip as it is */ }
  busy = false;
  if (again) { again = false; refresh(); }
}
function soon(){ clearTimeout(timer); timer = setTimeout(refresh, 900); }

// ---------------------------------------------------------------- what you see
function render(){
  if (!view) return;
  const pct = Math.round(100 * view.L.into / view.L.need);
  const chip = $('lvlChip');
  if (chip) { chip.classList.add('on'); chip.innerHTML = 'LV ' + view.L.lv + '<i><u style="width:' + pct + '%"></u></i>'; chip.setAttribute('aria-label', 'Level ' + view.L.lv + ', ' + view.title + '. Show your level and friends'); chip.title = 'Your level and friends'; }
  const box = $('sdLevel');
  if (box) box.innerHTML = '<div class="panel"><div class="phd"><h2>Level ' + view.L.lv + '</h2><span>' + E(view.title) + '</span></div>' +
    '<div class="pbody"><div class="xpbar"><i style="width:' + pct + '%"></i></div><div class="xpnote">' + (view.L.need - view.L.into) + ' XP to level ' + (view.L.lv + 1) + '</div></div>' +
    '<div class="prow" style="border-top:1px solid var(--line)"><span>Achievements</span><a href="#" data-profile="1">' + view.have.length + ' of ' + view.total + '</a></div></div>';
}
function openProfile(){
  if (!view || !window.bpModal) return;
  const got = new Set(view.have.map(a => a.id)), pct = Math.round(100 * view.L.into / view.L.need);
  const cell = (l, v) => '<div><span>' + l + '</span><b>' + v + '</b></div>';
  const groups = [...new Set(ACH.map(a => a.g))].map(g => {
    const list = ACH.filter(a => a.g === g);
    return '<h3 class="fh">' + E(g) + ' <span class="muted" style="font:500 13px var(--body);letter-spacing:0;text-transform:none">' + list.filter(a => got.has(a.id)).length + ' of ' + list.length + '</span></h3><div class="ach-grid">' +
      list.map(a => {
        const has = got.has(a.id), hidden = a.secret && !has;
        let bar = '';
        if (!has && a.prog) { const p = a.prog(S), w = Math.max(0, Math.min(100, Math.round(100 * p[0] / p[1]))); bar = '<div class="pg" title="' + p[0] + ' of ' + p[1] + '"><i style="width:' + w + '%"></i></div>'; }
        return '<div class="ach' + (has ? ' got' : '') + '"><span class="mk" aria-hidden="true"></span><div><b>' + (hidden ? 'Secret' : E(a.name)) + '</b><p>' + (hidden ? 'Hidden until you find it.' : E(a.desc)) + '</p>' + bar + '</div><span class="xp">' + (has ? '+' : '') + a.xp + ' XP</span></div>';
      }).join('') + '</div>';
  }).join('');
  window.bpModal.open({ title: 'Profile', wide: true, html:
    '<div class="pf-top"><div class="pf-lv"><span>Level</span><b>' + view.L.lv + '</b></div><div><div class="pf-title">' + E(me.name || '') + ', ' + E(view.title) + '</div>' +
    '<div class="xpbar"><i style="width:' + pct + '%"></i></div><div class="xpnote">' + (view.L.need - view.L.into) + ' XP to level ' + (view.L.lv + 1) + '</div></div></div>' +
    '<div class="pf-cells">' + cell('Days played', S.days) + cell('Daily games', S.dailies) + cell('All games', S.games) + cell('Best streak', S.bestStreak) + cell('Achievements', view.have.length + ' of ' + view.total) + '</div>' +
    '<div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ghost sm" id="sfxBtn"></button><button type="button" class="ghost sm" data-account="1">Account and picture</button></div>' + groups });
  // the achievement chime can be switched off here
  const sfx = $('sfxBtn'), label = () => { sfx.textContent = window.bpSound.on() ? 'Sound on' : 'Sound off'; };
  label(); sfx.addEventListener('click', () => { window.bpSound.set(!window.bpSound.on()); label(); window.bpSound.chime(); });
}

function setFlag(id){
  if (!saved || saved.flags[id]) return;
  saved.flags[id] = Date.now(); store().then(refresh);
}

document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-profile]'); if (a) { e.preventDefault(); openProfile(); } });
// the chip opens the side panel (ui.js); the achievements window opens from the link inside it
const chipEl = $('lvlChip'); if (chipEl) chipEl.addEventListener('click', () => { if (window.bpSide) window.bpSide.toggle(); else openProfile(); });
window.addEventListener('bp-saved', soon);
window.addEventListener('bp-bot', e => setFlag(e.detail));           // 'tour', 'poke', 'annoy' or 'flick', sent by bot.js
window.bpLevel = { open: openProfile, refresh };

if (window.claude && window.claude.use) {
  window.claude.use('user').then(u => u.id())
    .then(id => getJSON('/api/me').catch(() => ({})).then(m => { me = { id, name: m.username || id }; refresh(); }))
    .catch(() => {});
}
})();
