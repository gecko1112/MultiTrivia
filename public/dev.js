// Developer preview: alternative colour palettes, to try on the real pages, and for admin accounts the Plus switches.
//
// Hidden for everyone by default. To switch it on in your own browser, open the site once with ?dev=1
// (for example http://localhost:3000/?dev=1). A small panel appears bottom-left. ?dev=0 hides it again,
// puts the standard colours back. The colours are saved in this browser only, so nobody else sees them.
// The Plus switches are different: they change the account on the server, and the server only lets admin accounts
// (data/admins.txt) use them.
//
// The palettes are variations on: Verdigris #1B998B, Space Indigo #2D3047, Canary Yellow #FFFD82,
// Tangerine Dream #FF9B71, Watermelon #E84855. "By game" is the standard look for everyone; "Original" is the earlier orange theme.
//   "One accent" palettes use a single colour for everything that stands out.
//   "Mixed" palettes give each colour a job:
//     --accent / --accent-ink   buttons, links, the selected game
//     --a2 / --a2-ink           progress: level bar, "Open" in the games list, the bar under headings
//     --a3 / --on-a3            the Plus tag and Plus button
//   "By game" gives every game its own colour and paints the page in it while you are on that game.
(function(){
'use strict';
const root = document.documentElement;
const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} };
const plus = () => window.bpPlus || { has: () => false, setPlan: () => Promise.reject(new Error('not loaded')) };

const q = new URLSearchParams(location.search).get('dev');
if (q === '1') set('bp_dev', '1');
if (q === '0') { set('bp_dev', null); set('bp_palette', null); set('bp_dev_shut', null); root.setAttribute('data-palette', 'games'); }
if (get('bp_dev') !== '1') return;

// [id, label, colours shown on its button, group]
const PALETTES = [
  ['', 'Original', ['#c2410c'], 'one'],
  ['verdigris', 'Verdigris', ['#1B998B'], 'one'],
  ['tangerine', 'Tangerine', ['#FF9B71'], 'one'],
  ['watermelon', 'Watermelon', ['#E84855'], 'one'],
  ['calm', 'Verdigris lead', ['#1B998B', '#FF9B71', '#FFFD82'], 'mix'],
  ['warm', 'Tangerine lead', ['#FF9B71', '#1B998B', '#FFFD82'], 'mix'],
  ['canary', 'Indigo + Canary', ['#2D3047', '#FFFD82', '#FF9B71'], 'mix'],
  ['games', 'By game', ['#E84855', '#FF9B71', '#FFFD82', '#1B998B', '#5a60b8'], 'mix']
];

// The greys every palette shares and the "By game" palette, which is the site's standard look, live in index.html.
const css = `
/* ---- one accent ---- */
:root[data-palette=verdigris]{--accent:#1B998B;--on-accent:#ffffff;--accent-ink:#0c6b63;--hl:#d3eee9}
:root[data-theme=dark][data-palette=verdigris]{--accent:#1B998B;--on-accent:#ffffff;--accent-ink:#45d3c2;--hl:#1d4745}
:root[data-palette=tangerine]{--accent:#FF9B71;--on-accent:#2D3047;--accent-ink:#a8431c;--hl:#ffe3d6}
:root[data-theme=dark][data-palette=tangerine]{--accent:#FF9B71;--on-accent:#2D3047;--accent-ink:#FF9B71;--hl:#4c3233}
:root[data-palette=watermelon]{--accent:#E84855;--on-accent:#ffffff;--accent-ink:#b82533;--hl:#fbdcdf}
:root[data-theme=dark][data-palette=watermelon]{--accent:#E84855;--on-accent:#ffffff;--accent-ink:#ff7b85;--hl:#4a2633}

/* ---- mixed ---- */
/* Verdigris lead: verdigris acts, tangerine shows progress, canary marks Plus */
:root[data-palette=calm]{--accent:#14857a;--on-accent:#ffffff;--accent-ink:#0c6b63;--hl:#d3eee9;--a2:#FF9B71;--a2-ink:#a8431c;--a3:#FFFD82;--on-a3:#2D3047;--ghbar:block}
:root[data-theme=dark][data-palette=calm]{--accent:#2ec4b3;--on-accent:#12141f;--accent-ink:#45d3c2;--hl:#1d4745;--a2-ink:#FF9B71}
/* Tangerine lead: tangerine acts, verdigris shows progress, canary marks Plus */
:root[data-palette=warm]{--accent:#FF9B71;--on-accent:#2D3047;--accent-ink:#a8431c;--hl:#ffe3d6;--a2:#1B998B;--a2-ink:#0c6b63;--a3:#FFFD82;--on-a3:#2D3047;--ghbar:block}
:root[data-theme=dark][data-palette=warm]{--accent-ink:#FF9B71;--hl:#4c3233;--a2:#2ec4b3;--a2-ink:#45d3c2}
/* Indigo + Canary: indigo buttons with canary lettering, verdigris links, tangerine progress */
:root[data-palette=canary]{--accent:#2D3047;--on-accent:#FFFD82;--accent-ink:#0c6b63;--hl:#fffbb0;--a2:#FF9B71;--a2-ink:#a8431c;--a3:#FFFD82;--on-a3:#2D3047;--ghbar:block}
:root[data-theme=dark][data-palette=canary]{--accent:#FFFD82;--on-accent:#2D3047;--accent-ink:#FFFD82;--hl:#45452c;--a2-ink:#FF9B71;--a3:#2ec4b3;--on-a3:#12141f}

/* ---- the developer panel itself ---- */
.devbar{position:fixed;left:14px;bottom:14px;z-index:140;width:min(318px,calc(100vw - 28px));background:#14161f;color:#fff;border:1px solid #4d5278;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);font:600 12px/1.2 system-ui,sans-serif}
.devbar.shut{width:auto;border-radius:999px}
.devbar.shut .dv-body{display:none}
.devbar button{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;background:transparent;color:#fff;border:1px solid transparent;border-radius:999px;font:600 12px/1 system-ui,sans-serif;letter-spacing:0;text-transform:none;white-space:nowrap;box-shadow:none}
.devbar button:hover{background:#2a2e45;transform:none;box-shadow:none}
.devbar button.sel{border-color:#fff}
.devbar .dv-hd{width:100%;justify-content:space-between;padding:9px 14px;letter-spacing:.1em}
.devbar .dv-hd span{opacity:.7;letter-spacing:0;font-weight:500}
.devbar .dv-body{padding:0 8px 10px}
.devbar .dv-lbl{margin:8px 6px 5px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.6}
.devbar .dv-row{display:flex;flex-wrap:wrap;gap:3px}
.devbar .sw{display:inline-flex}
.devbar .sw i{width:12px;height:12px;border-radius:50%;display:block;box-shadow:0 0 0 1.5px #14161f}
.devbar .sw i+i{margin-left:-4px}
/* reported pictures (admins): the picture as reported, who reported it, and the two ways to deal with it */
.devbar .dv-rep{display:grid;grid-template-columns:40px 1fr;gap:4px 10px;align-items:center;padding:8px 6px;border-top:1px solid #2a2e45}
.devbar .dv-rep img{width:40px;height:40px;border-radius:50%;object-fit:cover;grid-row:span 2;background:#2a2e45}
.devbar .dv-rep b{font-size:13px}
.devbar .dv-rep small{display:block;font-weight:500;opacity:.7;margin-top:2px;line-height:1.35}
.devbar .dv-rep .dv-row{grid-column:2}
.devbar .dv-rep button{border-color:#4d5278}
.devbar .dv-rep button.bad{border-color:#e5484d;color:#ff8f8f}
`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

const bar = document.createElement('div'); bar.className = 'devbar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Developer preview');
const chips = group => PALETTES.filter(p => p[3] === group).map(p =>
  '<button type="button" data-p="' + p[0] + '"><span class="sw">' + p[2].map(c => '<i style="background:' + c + '"></i>').join('') + '</span>' + p[1] + '</button>').join('');
bar.innerHTML = '<button type="button" class="dv-hd" id="dvToggle" aria-expanded="true">DEV <span id="dvNow"></span></button>' +
  '<div class="dv-body">' +
    '<div class="dv-lbl">One accent</div><div class="dv-row">' + chips('one') + '</div>' +
    '<div class="dv-lbl">Mixed</div><div class="dv-row">' + chips('mix') + '</div>' +
    '<div class="dv-lbl">This account</div><div class="dv-row"><button type="button" data-plan="basic">Basic</button><button type="button" data-plan="plus">Plus</button></div>' +
    '<div id="dvReports"></div><div id="dvAdmin"></div><div class="dv-lbl" id="dvMsg" role="status" style="text-transform:none;letter-spacing:0"></div>' +
  '</div>';

let openReports = 0;              // reported pictures waiting for an admin (see below)
function paint(){
  const id = root.getAttribute('data-palette') || '', isPlus = plus().has();
  bar.querySelectorAll('[data-p]').forEach(b => { const on = b.dataset.p === id; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on)); });
  bar.querySelectorAll('[data-plan]').forEach(b => { const on = (b.dataset.plan === 'plus') === isPlus; b.classList.toggle('sel', on); b.setAttribute('aria-pressed', String(on)); });
  const shut = bar.classList.contains('shut');
  bar.querySelector('#dvToggle').setAttribute('aria-expanded', String(!shut));
  // closed, the panel still says what is switched on
  bar.querySelector('#dvNow').textContent = shut ? (PALETTES.find(p => p[0] === id) || PALETTES[0])[1] + ', ' + (isPlus ? 'Plus' : 'Basic') + (openReports ? ', ' + openReports + (openReports === 1 ? ' report' : ' reports') : '') : 'hide';
}
function apply(id){
  if (id) { root.setAttribute('data-palette', id); set('bp_palette', id); }
  else { root.removeAttribute('data-palette'); set('bp_palette', 'original'); }   // the old orange theme: no palette at all
  paint();
}
bar.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'dvToggle') { const shut = bar.classList.toggle('shut'); set('bp_dev_shut', shut ? '1' : '0'); paint(); }
  else if (b.dataset.plan) plus().setPlan(b.dataset.plan === 'plus').then(() => { paint(); accounts(); }, say);     // reloads the page when it changed
  else if (b.dataset.give) give(b.dataset.give, b.getAttribute('aria-pressed') !== 'true');
  else if (b.dataset.rep) resolve(b);
  else apply(b.dataset.p);
});
// Admin accounts: who has Plus, and a click gives it or takes it away. Everybody else gets no list (the server says no).
const say = e => { bar.querySelector('#dvMsg').textContent = e && e.message === 'Admins only' ? 'Plus switches need an admin account (data/admins.txt).' : (e && e.message) || ''; };
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function accounts(){
  const r = await fetch('/api/admin/plus', { credentials: 'same-origin' }); if (!r.ok) return;
  const list = (await r.json()).accounts.slice(0, 40);
  bar.querySelector('#dvAdmin').innerHTML = '<div class="dv-lbl">Plus for</div><div class="dv-row">' + list.map(a =>
    '<button type="button" data-give="' + E(a.id) + '" aria-pressed="' + !!a.active + '" class="' + (a.active ? 'sel' : '') + '"' + (a.active && !a.gift ? ' title="paid"' : '') + '>' + E(a.name) + '</button>').join('') + '</div>';
}
async function give(id, on){
  try {
    const r = await fetch('/api/admin/plus', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: id, on }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'That did not work.');
    say(); await accounts(); if (plus().refresh) await plus().refresh(); paint();
  } catch (e) { say(e); }
}
accounts().catch(() => {});

// Reported pictures (admins only; reports-server.js). Nothing happened to them automatically: remove or dismiss here.
const day = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
function drawReports(list){
  openReports = list.length; paint();
  bar.querySelector('#dvReports').innerHTML = !list.length ? '' : '<div class="dv-lbl">Reported pictures</div>' + list.map(r =>
    '<div class="dv-rep"><img alt="" src="/api/admin/reports/picture/' + encodeURIComponent(r.user) + '/' + r.v + '">' +
      '<div><b>' + E(r.name) + '</b><small>' + (r.count === 1 ? 'Reported by ' : r.count + ' reports by ') + E(r.by.join(', ')) + ', last ' + day(r.last) + (r.current ? '' : '. Changed since') + '</small></div>' +
      '<div class="dv-row">' + (r.current ? '<button type="button" class="bad" data-rep="remove" data-u="' + E(r.user) + '" data-v="' + r.v + '">Remove picture</button>' : '') +
        '<button type="button" data-rep="dismiss" data-u="' + E(r.user) + '" data-v="' + r.v + '">Dismiss</button></div></div>').join('');
}
async function reports(){
  const r = await fetch('/api/admin/reports', { credentials: 'same-origin' }); if (!r.ok) return;
  drawReports((await r.json()).reports);
}
async function resolve(b){
  // removing asks first, like everywhere else on the site
  if (b.dataset.rep === 'remove' && !b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Remove for good?'; return; }
  try {
    const r = await fetch('/api/admin/reports/resolve', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: b.dataset.u, v: Number(b.dataset.v), action: b.dataset.rep }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'That did not work.');
    say(); drawReports(j.reports);
  } catch (e) { say(e); }
}
reports().catch(() => {});
document.body.appendChild(bar);
// starts closed on phones, where it would cover the game
const shutSaved = get('bp_dev_shut');
if (shutSaved === '1' || (shutSaved == null && window.innerWidth < 700)) bar.classList.add('shut');
const savedPal = get('bp_palette');
apply(savedPal === 'original' ? '' : PALETTES.some(p => p[0] && p[0] === savedPal) ? savedPal : 'games');
})();
