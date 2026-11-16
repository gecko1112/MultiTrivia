// Atlas, browser side: the geography games (Flags, Outlines, Overland).
//
// This file only DRAWS what the server sends and REPORTS what the player picks or types.
// It never knows which country a flag or a border belongs to before the server says so: see geo-server.js.
(function(){
'use strict';
const box = document.getElementById('g-atlas'); if (!box) return;
const $ = id => document.getElementById(id);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MODES = {
  flags:  { t: 'Flags',    d: 'Which country flies this flag?', one: 'Flag' },
  shapes: { t: 'Outlines', d: 'Name the country from its border.', one: 'Outline' },
  route:  { t: 'Overland', d: 'Get from one country to another by naming the countries in between.' }
};
const ICON = {
  flags: '<path d="M6 21V4"/><path d="M6 5c4-2 6 2 12 0v8c-6 2-8-2-12 0"/>',
  shapes: '<path d="M8 3l7 1 4 5-2 4 2 5-6 3-5-2-4-6 2-4z"/>',
  route: '<circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="6" r="2.2"/><path d="M7 17c5-1 3-9 10-10" stroke-dasharray="2.5 3"/>'
};

let V = null;            // the game on screen, exactly as the server describes it
let NAMES = null;        // every country with its other spellings, for the suggestions while typing
let busy = false, mapNow = null, mapAnim = 0, wait = 0, picks = [], sel = 0, fresh = null;

async function api(path, body){
  // inside a past day (the Archive) every request says which day it is about
  if (window.bpDay) { if (body) body = Object.assign({ day: window.bpDay }, body); else if (path === 'home') path += '?day=' + window.bpDay; }
  const r = await fetch('/api/geo/' + path, body ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'same-origin' });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Try again.'), { j });
  return j;
}
// A free account's practice games left today in each mode, on every practice button (null: no limit, no tag).
let practiceLeft = {};
const tags = () => { if (window.bpPlus) box.querySelectorAll('button[data-start]:not([data-daily])').forEach(b => window.bpPlus.tag(b, practiceLeft[b.dataset.start] ?? null)); };
const clock = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
// Leaving the page in the middle of a game (another tab, app or window) is reported to the server and noted next to the result.
let gone = false;
const left = () => { if (gone || !V || V.done || location.hash !== '#atlas') return; gone = true; api('away', { mode: V.mode, daily: V.daily }).catch(() => {}); };
document.addEventListener('visibilitychange', () => { if (document.hidden) left(); else gone = false; });
window.addEventListener('blur', left); window.addEventListener('focus', () => { gone = false; });
// Only an admin account is sent this number, and it is only drawn in developer mode.
const dev = () => { try { return localStorage.getItem('bp_dev') === '1'; } catch (e) { return false; } };
const awayNote = () => (V.away && dev() ? 'Left the page ' + V.away + (V.away === 1 ? ' time' : ' times') + ' during the game.' : '');
const backBtn = '<button type="button" class="ghost sm" data-act="hub">All games</button>';

// ---------------------------------------------------------------- start page
// today's Atlas games in the games list on the left: how many of the three are done
function status(home){
  const el = $('st-at'); if (!el) return;
  const n = Object.values(home.daily).filter(s => s && s.done).length;
  el.textContent = n ? n + ' / 3' : 'Open'; el.classList.toggle('open', !n);
}
// A finished game: the levels and the games list take note. Only the server's own record counts there.
function finished(){
  window.dispatchEvent(new Event('bp-saved'));
  if (V && V.daily) api('home').then(status).catch(() => {});
}
async function hub(){
  V = null; clearTimeout(wait); cancelAnimationFrame(mapAnim); mapNow = null;
  let home = { daily: {} }, err = '';
  try { home = await api('home'); status(home); practiceLeft = home.practiceLeft || {}; } catch (e) { err = e.message; }
  const today = m => {
    const s = home.daily[m];
    if (!s) return '<button type="button" data-start="' + m + '" data-daily="1">Daily</button>';
    if (!s.done) return '<button type="button" data-start="' + m + '" data-daily="1">Continue daily</button>';
    const txt = m === 'route' ? (s.won ? 'Today: ' + s.used + (s.used === 1 ? ' guess' : ' guesses') : 'Today: not solved') : 'Today: ' + s.score + ' of ' + s.n;
    return '<button type="button" class="ghost at-done" data-start="' + m + '" data-daily="1">' + txt + '</button>';
  };
  box.innerHTML = '<div class="card"><h2 class="gh">Atlas</h2>' +
    '<div class="modes at-modes">' + Object.keys(MODES).map(m =>
      '<div class="mode"><svg class="at-ico" viewBox="0 0 24 24" aria-hidden="true">' + ICON[m] + '</svg><div class="mt">' + MODES[m].t + '</div><div class="muted md">' + MODES[m].d + '</div>' +
      '<div class="acts">' + today(m) + '<button type="button" class="ghost" data-start="' + m + '">Practice</button></div></div>').join('') +
    '</div><div class="parsed" id="atMsg" role="status" style="color:var(--warn)">' + E(err) + '</div></div>';
  tags();
}
async function start(mode, daily){
  if (busy) return; busy = true;
  try {
    if (mode === 'route' && !NAMES) NAMES = (await api('names')).names.map(([id, name, ...alt]) => ({ id, name, keys: [name, ...alt].map(norm) }));
    V = await api('start', { mode, daily }); fresh = null; mapNow = null;
    if (V.practiceLeft !== undefined) practiceLeft[mode] = V.practiceLeft;
    box.innerHTML = '<div class="card" id="atMain"></div>';
    draw();
  } catch (e) {
    if (window.bpPlus && window.bpPlus.limited(e.j)) { practiceLeft[mode] = 0; tags(); }
    else { const m = $('atMsg'); if (m) m.textContent = e.message; }
  }
  busy = false;
}
const draw = () => { if (V.mode === 'route') drawRoute(); else if (V.done) drawQuizEnd(); else drawQuiz(); tags(); };

// ---------------------------------------------------------------- Flags and Outlines
const picture = (o, cls) => (o.img ? '<img class="at-flag ' + cls + '" src="' + E(o.img) + '" alt="">' : '<svg class="at-shape ' + cls + '" viewBox="-5 -5 110 110" aria-hidden="true"><path d="' + o.shape + '"/></svg>');
const marks = () => '<div class="at-marks" aria-hidden="true">' + Array.from({ length: V.n }, (_, i) => '<i class="' + (i < V.marks.length ? (V.marks[i] ? 'ok' : 'no') : i === V.i ? 'now' : '') + '"></i>').join('') + '</div>';
function drawQuiz(){
  const M = MODES[V.mode];
  $('atMain').innerHTML = '<div class="mlhead"><span>' + M.one + ' ' + (V.i + 1) + ' of ' + V.n + '</span>' + backBtn + '</div>' + marks() +
    '<div class="at-stage">' + picture(V.q, '') + '</div>' +
    (V.q.type
      ? '<form id="atAnswer" autocomplete="off"><input type="text" id="atName" placeholder="Country" aria-label="Country" maxlength="60" autocapitalize="words" autocorrect="off" spellcheck="false"><button>Guess</button><button type="button" class="ghost" data-act="skip">Skip</button></form>' +
        '<div class="at-said" id="atSaid" role="status"></div>'
      : '<div class="at-opts">' + V.q.options.map(o => '<button type="button" class="ghost" data-pick="' + o.id + '">' + E(o.name) + '</button>').join('') + '</div>');
  const inp = $('atName'); if (inp && location.hash === '#atlas') inp.focus();
}
// Flags: the name is typed. Whether the spelling is close enough is the server's call.
async function answer(text){
  if (busy || !V || V.done || !V.q.type) return;
  const said = $('atSaid');
  if (text !== null && !text.trim()) { said.className = 'at-said'; said.textContent = 'Type the country, or skip.'; return; }
  busy = true;
  try {
    V = await api('answer', { mode: V.mode, daily: V.daily, i: V.i, text: text || '' });
    box.querySelectorAll('#atAnswer input, #atAnswer button').forEach(el => { el.disabled = true; });
    said.className = 'at-said ' + (V.last.ok ? 'ok' : 'no'); said.textContent = V.last.name;
    const m = box.querySelector('.at-marks'); if (m) m.outerHTML = marks();
    if (V.q && V.q.img) new Image().src = V.q.img;
    if (V.done) finished();
    clearTimeout(wait); wait = setTimeout(() => { busy = false; if (V) draw(); }, V.last.ok ? 800 : 1700);
  } catch (e) { busy = false; said.className = 'at-said'; said.textContent = e.message; }
}
async function pick(id){
  if (busy || !V || V.done) return; busy = true;
  const asked = V.i;
  try {
    V = await api('pick', { mode: V.mode, daily: V.daily, i: asked, id });
    // show what was right on the question still on screen, then move on
    box.querySelectorAll('[data-pick]').forEach(b => { b.disabled = true; if (b.dataset.pick === V.last.answer) b.classList.add('ok'); else if (b.dataset.pick === V.last.pick) b.classList.add('no'); });
    const m = box.querySelector('.at-marks'); if (m) m.outerHTML = marks();
    if (V.done) finished();
    clearTimeout(wait); wait = setTimeout(() => { busy = false; if (V) draw(); }, V.last.ok ? 750 : 1500);
  } catch (e) { busy = false; if (window.bpToast) window.bpToast('Atlas', e.message, ''); }
}
function drawQuizEnd(){
  const M = MODES[V.mode];
  $('atMain').innerHTML = '<div class="mlhead"><span>' + M.t + (V.daily ? ', daily' : ', practice') + '</span>' + backBtn + '</div>' +
    '<p class="at-big">' + V.score + ' <span>of ' + V.n + '</span></p><p class="muted" style="margin:0 0 20px">' + clock(V.ms) + ' min' + (awayNote() ? '. ' + awayNote() : '') + '</p>' +
    '<div class="at-review">' + V.review.map(r => '<div class="' + (r.ok ? 'ok' : 'no') + '">' + picture(r, 'sm') + '<b>' + E(r.name) + '</b>' + (r.ok || !r.picked ? '' : '<s>' + E(r.picked) + '</s>') + '</div>').join('') + '</div>' +
    '<div class="acts" style="margin-top:22px"><button type="button" data-start="' + V.mode + '">' + (V.daily ? 'Practice' : 'Play again') + '</button></div>';
}

// ---------------------------------------------------------------- Overland
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
function suggest(text){
  const q = norm(text); if (!q) return [];
  const taken = new Set([V.a.id, V.b.id, ...V.guesses.map(g => g.id)]), out = [];
  for (const c of NAMES) {
    if (taken.has(c.id)) continue;
    let rank = 9;
    c.keys.forEach((k, i) => { const r = k.startsWith(q) ? (i ? 1 : 0) : k.split(' ').some(w => w.startsWith(q)) ? 2 : q.length >= 3 && k.includes(q) ? 3 : 9; if (r < rank) rank = r; });
    if (rank < 9) out.push([rank, c]);
  }
  return out.sort((x, y) => x[0] - y[0] || x[1].name.localeCompare(y[1].name)).slice(0, 6).map(x => x[1]);
}
function drawRoute(){
  const left = V.left + (V.left === 1 ? ' guess left' : ' guesses left');
  const chips = V.guesses.map(g => '<span class="at-chip k-' + g.grade + '">' + E(g.name) + '</span>').join('');
  let end = '';
  if (V.done) {
    const way = [V.a.name, ...V.solution.map(s => s.name), V.b.name].map(E).join(' <i>→</i> ');
    const used = V.guesses.length, verdict = V.won ? (used === V.between ? 'Shortest way found.' : 'Arrived with ' + used + (used === 1 ? ' guess.' : ' guesses.')) : 'Not this time.';
    end = '<p class="at-verdict' + (V.won ? ' won' : '') + '">' + verdict + '</p>' + (awayNote() ? '<p class="muted" style="margin:-6px 0 14px">' + awayNote() + '</p>' : '') + (V.solution.some(s => s.d) ? '<p class="at-way"><span class="pt-lbl">Shortest way</span>' + way + '</p>' : '') +
      '<div class="acts"><button type="button" data-start="route">' + (V.daily ? 'Practice' : 'New route') + '</button></div>';
  }
  $('atMain').innerHTML = '<div class="mlhead"><span>' + (V.done ? 'Overland' + (V.daily ? ', daily' : ', practice') : left) + '</span>' + backBtn + '</div>' +
    '<p class="at-ends"><b>' + E(V.a.name) + '</b><i>→</i><b>' + E(V.b.name) + '</b></p>' +
    '<svg class="at-map" id="atMap" role="img" aria-label="Map of the countries named so far"></svg>' +
    (V.done ? '' :
      '<form id="atGuess" autocomplete="off"><div class="at-ac"><input type="text" id="atInp" placeholder="Country" aria-label="Country" autocapitalize="words" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="atList"><ul id="atList" role="listbox" hidden></ul></div><button>Guess</button></form>' +
      '<div class="parsed" id="atNote" role="status"></div>') +
    (chips ? '<div class="at-chips">' + chips + '</div>' : '') +
    (V.done ? end : '<div class="at-legend"><span class="k-good">on the shortest way</span><span class="k-near">a small detour</span><span class="k-far">no help</span>' +
      '<button type="button" class="ghost sm" data-act="giveup">Give up</button></div>');
  drawMap();
  const inp = $('atInp'); if (inp && location.hash === '#atlas' && innerWidth > 700) inp.focus();
}
// The map shows only what is known: start, end, and every country named so far. It zooms to fit them.
function drawMap(){
  const svg = $('atMap'); if (!svg) return;
  const shown = [...V.guesses.map(g => Object.assign({ cls: 'k-' + g.grade }, g)), ...(V.solution || []).filter(s => s.d).map(s => Object.assign({ cls: 'k-shown' }, s)),
    Object.assign({ cls: 'k-end' }, V.a), Object.assign({ cls: 'k-end' }, V.b)];
  const area = c => (c.box[2] - c.box[0]) * (c.box[3] - c.box[1]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of shown) { x0 = Math.min(x0, c.box[0]); y0 = Math.min(y0, c.box[1]); x1 = Math.max(x1, c.box[2]); y1 = Math.max(y1, c.box[3]); }
  let w = Math.max(x1 - x0, 3) * 1.16, h = Math.max(y1 - y0, 3) * 1.22;
  const ratio = (svg.clientWidth || 800) / (svg.clientHeight || 500);
  if (w / h < ratio) w = h * ratio; else h = w / ratio;
  const to = [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
  svg.innerHTML = '<g>' + shown.slice().sort((a, b) => area(b) - area(a)).map(c => '<path class="' + c.cls + (c.id === fresh ? ' new' : '') + '" d="' + c.d + '"><title>' + E(c.name) + '</title></path>').join('') + '</g>' +
    '<g id="atDots">' + shown.filter(c => Math.max(c.box[2] - c.box[0], c.box[3] - c.box[1]) < to[2] * 0.02).map(c => '<circle class="' + c.cls + '" cx="' + c.at[0] + '" cy="' + c.at[1] + '"/>').join('') + '</g>' +
    '<g id="atLabels">' + labels(shown, to, svg) + '</g>';
  // glide from the old view to the new one
  const from = mapNow || to, t0 = performance.now(), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  cancelAnimationFrame(mapAnim);
  (function frame(){
    const p = still ? 1 : Math.min(1, (performance.now() - t0) / 550), e = 1 - Math.pow(1 - p, 3);
    mapNow = from.map((v, i) => v + (to[i] - v) * e);
    svg.setAttribute('viewBox', mapNow.map(v => +v.toFixed(3)).join(' '));
    const px = mapNow[2] / (svg.clientWidth || 800), lab = $('atLabels');
    if (lab) { lab.setAttribute('font-size', (13 * px).toFixed(3)); lab.setAttribute('stroke-width', (3.5 * px).toFixed(3)); }
    svg.querySelectorAll('#atDots circle').forEach(c => c.setAttribute('r', (9 * px).toFixed(3)));
    if (p < 1) mapAnim = requestAnimationFrame(frame);
  })();
}
// Names on the map must not sit on top of each other: start and end go first, the newest guess next.
// A name that has no room moves one line down or up, and is left out if that does not help (it is in the list below the map).
function labels(shown, view, svg){
  const size = 13 * view[2] / (svg.clientWidth || 800), h = size * 1.3, placed = [];
  return shown.slice().reverse().map(c => {
    const w = (c.name.length * 0.6 + 0.8) * size, x = Math.max(view[0] + w / 2, Math.min(view[0] + view[2] - w / 2, c.at[0]));
    for (const dy of [0, h, -h]) {
      const r = [x - w / 2, c.at[1] + dy - h / 2, x + w / 2, c.at[1] + dy + h / 2];
      if (placed.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) continue;
      placed.push(r); return '<text class="' + c.cls + '" x="' + +x.toFixed(3) + '" y="' + +(c.at[1] + dy).toFixed(3) + '">' + E(c.name) + '</text>';
    }
    return '';
  }).join('');
}
function drawList(){
  const ul = $('atList'), inp = $('atInp'); if (!ul) return;
  picks = suggest(inp.value); sel = Math.min(sel, Math.max(0, picks.length - 1));
  ul.hidden = !picks.length; inp.setAttribute('aria-expanded', String(!!picks.length));
  ul.innerHTML = picks.map((c, i) => '<li role="option" data-id="' + c.id + '"' + (i === sel ? ' class="sel" aria-selected="true"' : '') + '>' + E(c.name) + '</li>').join('');
}
async function guess(id){
  if (busy || !V || V.done) return;
  const note = $('atNote');
  if (!id) { if (note) note.textContent = $('atInp').value.trim() ? 'Pick a country from the list.' : ''; return; }
  busy = true;
  try { V = await api('guess', { mode: 'route', daily: V.daily, id }); fresh = id; drawRoute(); if (V.done) finished(); }
  catch (e) { if (note) note.textContent = e.message; }
  busy = false;
}

// ---------------------------------------------------------------- what the player does
box.addEventListener('click', async e => {
  const li = e.target.closest('#atList li'); if (li) return guess(li.dataset.id);
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.start) return start(b.dataset.start, b.dataset.daily === '1');
  if (b.dataset.pick) return pick(b.dataset.pick);
  if (b.dataset.act === 'hub') { busy = false; return hub(); }
  if (b.dataset.act === 'giveup' && !busy) { busy = true; try { V = await api('giveup', { mode: 'route', daily: V.daily }); fresh = null; drawRoute(); finished(); } catch (err) {} busy = false; }
  if (b.dataset.act === 'skip') return answer(null);
});
box.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'atGuess') guess(picks[sel] ? picks[sel].id : null); if (e.target.id === 'atAnswer') answer($('atName').value); });
box.addEventListener('input', e => { if (e.target.id === 'atInp') { sel = 0; $('atNote').textContent = ''; drawList(); } });
box.addEventListener('keydown', e => {
  if (e.target.id !== 'atInp' || !picks.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : picks.length - 1)) % picks.length; drawList(); }
  if (e.key === 'Escape') { picks = []; $('atList').hidden = true; }
});
window.addEventListener('resize', () => { if (V && V.mode === 'route') { mapNow = null; drawMap(); } });

// the start page is filled when the Atlas is opened; a game in progress stays on screen
const onRoute = () => { if (location.hash === '#atlas' && !V) hub(); else if (!V) api('home').then(status).catch(() => {}); };
window.addEventListener('hashchange', onRoute);
if (window.claude && window.claude.use) window.claude.use('user').then(u => u.id()).then(onRoute).catch(() => {}); else onRoute();
})();
