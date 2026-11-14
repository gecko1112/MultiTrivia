// Archive: a calendar of every day, with what was played and the streaks, and the way into past days.
//
// Looking at the calendar is free. Playing a past day is part of Plus: it reloads the page for that day
// (see day.js). A game finished later through the archive is remembered as "late": it shows in the
// calendar but does not repair a streak. Streaks only count games played on the day itself.
(function(){
'use strict';
const box = document.getElementById('g-archive'); if (!box) return;
const $ = id => document.getElementById(id);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');
const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const at = k => new Date(k + 'T12:00:00');
const shift = (k, n) => { const d = at(k); d.setDate(d.getDate() + n); return key(d); };
const long = k => at(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const DAY = window.bpDay, REAL = window.bpRealToday(), FIRST = window.bpFirstDay;
// [key, page, name, where its days are saved, finished?, result as text]
const GAMES = [
  ['sv', 'survival', 'Survival', d => (d.x_daily || {}).days, r => r.score != null, r => r.score == null ? 'Unfinished' : r.score + ' survived'],
  ['ml', 'moreless', 'More/Less', d => ((d.x_stats || {}).ml || {}).days, () => true, r => r.score + ' / 25'],
  ['gl', 'guessless', 'Guessless', d => ((d.x_stats || {}).gl || {}).days, () => true, r => r.total + ' / 500'],
  ['cl', 'clueless', 'Clueless', d => ((d.x_stats || {}).cl || {}).days, () => true, r => r.solved ? r.guesses + (r.guesses === 1 ? ' guess' : ' guesses') : 'Gave up'],
  ['wd', 'wordy', 'Wordy', d => (d.x_words || {}).days, () => true, r => r.solved ? r.guesses + ' / 6' : 'Missed']
];
const ATLAS = [['flags', 'Flags', r => r.score + ' / ' + r.n], ['shapes', 'Outlines', r => r.score + ' / ' + r.n], ['route', 'Overland', r => r.won ? r.used + (r.used === 1 ? ' guess' : ' guesses') : 'Not solved']];

let D = null;            // date -> { g: {sv: record, ...}, a: {flags: result, ...}, live: counts for the streak }
let streak = { now: 0, best: 0 }, month = null, picked = null;
const getJSON = async url => { const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };

async function load(){
  const docs = {}; (await getJSON('/api/docs')).docs.forEach(d => { docs[d.id] = d.data; });
  let atlas = { days: {} }; try { atlas = await getJSON('/api/geo/history'); } catch (e) {}
  const late = (docs.x_late || {}).days || {}, out = {};
  const day = k => (out[k] = out[k] || { g: {}, a: {}, live: false });
  for (const [g, , , daysOf] of GAMES) for (const [k, rec] of Object.entries(daysOf(docs) || {})) { if (!rec) continue; day(k).g[g] = rec; if (!(late[k] && late[k][g])) day(k).live = true; }
  for (const [k, modes] of Object.entries(atlas.days || {})) for (const [m, res] of Object.entries(modes)) { day(k).a[m] = res; if (!res.late) day(k).live = true; }
  D = out;
  // streaks: days in a row with something played on the day itself. Today may still be open without breaking it.
  // Counted in day.js. With Plus, the streak saver forgives one missed day a week; those days are drawn dashed.
  streak = window.bpStreak(Object.keys(D).filter(k => D[k].live), !!(window.bpPlus && window.bpPlus.has()), REAL);
  streak.kept = new Set(streak.saved);
}

function render(){
  const y = month.getFullYear(), m = month.getMonth(), first = new Date(y, m, 1, 12), count = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;                               // weeks start on Monday
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span></span>');
  for (let n = 1; n <= count; n++) {
    const k = y + '-' + pad(m + 1) + '-' + pad(n), d = D[k], off = k > REAL || k < FIRST, col = (lead + n - 1) % 7;
    const inRun = x => (D[x] && D[x].live) || streak.kept.has(x), cls = ['ar-d'];
    if (off) cls.push('off'); if (k === REAL) cls.push('today'); if (k === picked) cls.push('sel'); if (k === DAY) cls.push('here');
    if (inRun(k)) { cls.push('live'); if (streak.kept.has(k)) cls.push('kept'); if (col > 0 && inRun(shift(k, -1))) cls.push('jl'); if (col < 6 && inRun(shift(k, 1))) cls.push('jr'); }
    const ticks = off ? '' : '<i class="t5">' + GAMES.map(([g, , , , fin]) => '<u class="' + (d && d.g[g] && fin(d.g[g]) ? 'on' : '') + '"></u>').join('') + '</i>' +
      '<i class="t3">' + ATLAS.map(([a]) => '<u class="' + (d && d.a[a] ? 'on' : '') + '"></u>').join('') + '</i>';
    cells.push('<button type="button" class="' + cls.join(' ') + '" data-day="' + k + '"' + (off ? ' disabled' : '') + ' aria-label="' + E(long(k)) + '"><b>' + n + '</b>' + ticks + '</button>');
  }
  const cell = (l, v) => '<div><span>' + l + '</span><b>' + v + '</b></div>';
  const prevOk = key(new Date(y, m, 1, 12)) > FIRST, nextOk = key(new Date(y, m + 1, 1, 12)) <= REAL;
  box.innerHTML = '<div class="card"><h2 class="gh">Archive</h2>' +
    '<div class="ar-cells">' + cell('Streak', streak.now + (streak.now === 1 ? ' day' : ' days')) + cell('Best streak', streak.best) + cell('Days played', streak.days) + '</div>' +
    '<div class="ar-nav"><button type="button" class="ghost sm" data-move="-1" aria-label="Previous month"' + (prevOk ? '' : ' disabled') + '>◀</button><b>' + month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) + '</b>' +
      '<button type="button" class="ghost sm" data-move="1" aria-label="Next month"' + (nextOk ? '' : ' disabled') + '>▶</button></div>' +
    '<div class="ar-grid">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => '<em>' + w + '</em>').join('') + cells.join('') + '</div>' +
    '<p class="ar-key"><span class="k1">Daily games</span><span class="k2">Atlas</span><span class="k3">Counts for the streak</span>' + (streak.kept.size ? '<span class="k4">Streak saver</span>' : '') + '</p>' +
    '<div id="arDay"></div></div>';
  if (picked) renderDay();
}
function renderDay(){
  const el = $('arDay'); if (!el || !picked) return;
  const d = D[picked] || { g: {}, a: {} };
  let open = null;
  const row = (name, txt, page) => { if (!txt && !open) open = page; return '<div class="prow"><span>' + name + '</span>' + (txt ? '<b>' + E(txt) + '</b>' : '<span class="muted">Open</span>') + '</div>'; };
  const rows = GAMES.map(([g, page, name, , fin, text]) => row(name, d.g[g] && fin(d.g[g]) ? text(d.g[g]) : '', page)).join('') +
    ATLAS.map(([a, name, text]) => row(name, d.a[a] ? text(d.a[a]) : '', 'atlas')).join('');
  const member = window.bpPlus && window.bpPlus.has();
  const btn = !open ? '' : picked === REAL ? '<button type="button" data-go="/#' + open + '">Play today</button>'
    : picked === DAY ? '<button type="button" data-go="#' + open + '">Keep playing</button>'
    : member ? '<button type="button" data-go="/?day=' + picked + '#' + open + '">Play this day</button>'
    : '<button type="button" data-plus="archive">Play this day <span class="ptag">Plus</span></button>';
  el.innerHTML = '<div class="ar-day"><div class="navrow"><h3 class="fh" style="margin:0">' + E(long(picked)) + '</h3>' + btn + '</div><div class="ar-rows">' + rows + '</div></div>';
}
async function show(){
  if (location.hash !== '#archive') return;
  if (!month) { const d = at(DAY || REAL); month = new Date(d.getFullYear(), d.getMonth(), 1, 12); picked = DAY || null; }
  try { await load(); render(); } catch (e) { box.innerHTML = '<div class="card"><h2 class="gh">Archive</h2><p class="lead">Could not load your results. Try again in a moment.</p></div>'; }
}
box.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.move) { month = new Date(month.getFullYear(), month.getMonth() + Number(b.dataset.move), 1, 12); render(); }
  else if (b.dataset.day) { picked = b.dataset.day; box.querySelectorAll('.ar-d').forEach(x => x.classList.toggle('sel', x === b)); renderDay(); }
  else if (b.dataset.go) { if (b.dataset.go[0] === '#') location.hash = b.dataset.go.slice(1); else location.href = b.dataset.go; }
});
window.addEventListener('hashchange', show);

// ---------------------------------------------------------------- inside a past day
if (DAY) {
  const bar = document.createElement('div'); bar.className = 'ar-bar';
  bar.innerHTML = '<span class="pt-lbl">Archive</span><b>' + E(long(DAY)) + '</b><a href="#archive">Calendar</a><a href="/">Back to today</a>';
  const layout = $('layout'); if (layout) layout.parentNode.insertBefore(bar, layout);
  const head = document.querySelector('#tabs .navhd span'); if (head) head.textContent = at(DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  // Which games get their result only now: those are "late". Compared with what the day already had when it was opened.
  let base = null, timer = 0;
  const mine = async () => { const j = await getJSON('/api/day?date=' + DAY); const p = j.players.find(x => x.me) || {}; return GAMES.map(g => g[0]).filter(g => p[g]); };
  const note = async () => {
    try {
      if (!base) { base = await mine(); return; }
      const fresh = (await mine()).filter(g => !base.includes(g)); if (!fresh.length) return;
      const cur = await getJSON('/api/docs/x_late'), doc = (cur.exists && cur.data) || {}; doc.days = doc.days || {}; doc.days[DAY] = doc.days[DAY] || {};
      fresh.forEach(g => { doc.days[DAY][g] = 1; base.push(g); });
      // a plain request on purpose: it must not announce itself as "a game was saved"
      await fetch('/api/docs/x_late', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
    } catch (e) {}
  };
  window.addEventListener('bp-saved', () => { clearTimeout(timer); timer = setTimeout(note, 700); });
  if (window.claude && window.claude.use) window.claude.use('user').then(u => u.id()).then(note).catch(() => {}); else note();
}
if (window.claude && window.claude.use) window.claude.use('user').then(u => u.id()).then(show).catch(() => {}); else show();
})();
