// Page chrome: light/dark switch, today's results in the games list, the "Friends today" panel,
// and the shared pop-up window and toast helpers.
(function(){
'use strict';
const $ = id => document.getElementById(id);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- light / dark
// No saved choice = follow the device. Clicking the button saves an explicit choice.
const root = document.documentElement;
const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
function savedTheme(){ try { const t = localStorage.getItem('bp_theme'); return t === 'light' || t === 'dark' ? t : null; } catch (e) { return null; } }
function applyTheme(){
  const t = savedTheme() || (mq && mq.matches ? 'dark' : 'light');
  root.setAttribute('data-theme', t);
  const b = $('themeBtn');
  if (b) { const to = t === 'dark' ? 'light' : 'dark'; b.innerHTML = t === 'dark' ? SUN : MOON; b.title = 'Switch to ' + to + ' mode'; b.setAttribute('aria-label', 'Switch to ' + to + ' mode'); }
}
const tb = $('themeBtn');
if (tb) tb.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('bp_theme', next); } catch (e) {}
  applyTheme();
});
if (mq) { const h = () => applyTheme(); if (mq.addEventListener) mq.addEventListener('change', h); else if (mq.addListener) mq.addListener(h); }
applyTheme();

// ---------------------------------------------------------------- today's results
// [key in /api/day, tab, label]
const GAMES = [['sv', 'survival', 'Survival'], ['ml', 'moreless', 'More/Less'], ['gl', 'guessless', 'Guessless'], ['cl', 'clueless', 'Clueless'], ['wd', 'wordy', 'Wordy']];
const layout = $('layout');
let day = null, loggedIn = false, timer = null;

const curTab = () => (location.hash || '').replace('#', '') || 'survival';
function todayKey(){ const d = window.bpNow(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function resultText(k, d){
  if (k === 'sv') return d.score == null ? 'Unfinished' : d.score + ' survived';
  if (k === 'ml') return d.score + ' / 25';
  if (k === 'gl') return d.total + ' / 500';
  if (k === 'cl') return d.solved ? d.guesses + (d.guesses === 1 ? ' guess' : ' guesses') : 'Gave up';
  return d.solved ? d.guesses + ' / 6' : 'Missed';
}
// Higher is better, so one sort works for every game.
function rankValue(k, d){
  if (k === 'sv') return d.score == null ? -1 : d.score;
  if (k === 'ml') return d.score || 0;
  if (k === 'gl') return d.total || 0;
  return d.solved ? 1e6 - (d.guesses || 0) : -1;
}

function render(){
  if (!layout) return;
  root.setAttribute('data-view', curTab());                     // lets the page style itself per view (phones: no footer on games)
  const g = GAMES.find(x => x[1] === curTab());
  paintSide();
  if (!g && $('sdFriends')) $('sdFriends').innerHTML = '';     // "Friends today" belongs to a game
  if (!loggedIn || !day) return;
  const me = day.players.find(p => p.me) || {};

  // The games list doubles as today's checklist: each game shows its result, or "Open".
  let done = 0;
  GAMES.forEach(x => {
    const d = me[x[0]], el = $('st-' + x[0]); if (!el) return;
    const fin = d && !(x[0] === 'sv' && d.score == null); if (fin) done++;
    el.textContent = d ? resultText(x[0], d) : 'Open';
    el.classList.toggle('open', !d);
    el.parentNode.classList.toggle('done', !!fin);
  });
  if ($('navDone')) $('navDone').textContent = done + ' of ' + GAMES.length;
  // Nothing left to play today is the one moment the archive is worth mentioning.
  if ($('navNote')) $('navNote').innerHTML = done === GAMES.length ? 'All done. <a href="#" data-plus="archive">Play earlier days</a>' : '';

  const box = $('sdFriends');
  if (!g || !box) return;
  const k = g[0];
  const ranked = day.players.filter(p => p[k]).sort((a, b) => rankValue(k, b[k]) - rankValue(k, a[k]));
  let rows = ranked.slice(0, 8);
  const mine = ranked.findIndex(p => p.me);
  if (mine >= 8) rows = rows.slice(0, 7).concat(ranked[mine]);
  const friends = rows.length
    ? rows.map(p => '<div class="prow rk' + (p.me ? ' me' : '') + '"><span class="muted">' + (ranked.indexOf(p) + 1) + '</span><span class="n">' + (p.me ? '<b>' + E(p.name) + '</b>' : E(p.name)) + '</span><b>' + E(resultText(k, p[k])) + '</b></div>').join('')
    : '<div class="pnote">Nobody yet.</div>';
  box.innerHTML = '<div class="panel"><div class="phd"><h2>' + (window.bpDay ? 'Friends that day' : 'Friends today') + '</h2><span>' + g[2] + '</span></div>' + friends + '</div>';
}

// ---------------------------------------------------------------- the side panel (level, friends today)
// Closed until the level chip in the top bar is pressed. Next to a game on a wide screen it opens as a third column
// and that choice is remembered (bp_side). Everywhere else it is a drawer: it slides in, and closes again with its
// own button, Escape, a click beside it, or a change of page. The tour can show it for one step (peek).
const side = $('side'), chip = $('lvlChip'), wideMq = window.matchMedia ? matchMedia('(min-width:1240px)') : null;
let drawerOpen = false, peek = null;
const sidePref = () => { try { return localStorage.getItem('bp_side') === '1'; } catch (e) { return false; } };
const dockable = () => !!(wideMq && wideMq.matches && GAMES.some(x => x[1] === curTab()));
function sideOpen(){ return loggedIn && (peek != null ? peek : dockable() ? sidePref() : drawerOpen); }
function paintSide(){
  if (!layout || !side) return;
  const dock = loggedIn && dockable(), open = sideOpen();
  layout.classList.toggle('split', dock && open);
  side.classList.toggle('drawer', !dock);
  side.classList.toggle('open', !dock && open);
  if (chip) chip.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function setSide(on){
  if (dockable()) { try { localStorage.setItem('bp_side', on ? '1' : '0'); } catch (e) {} }
  else drawerOpen = on;
  paintSide();
  if (dockable()) return;
  const to = on ? $('sdClose') : chip;                         // the drawer takes the focus and hands it back
  if (to && (on || side.contains(document.activeElement))) { try { to.focus({ preventScroll: true }); } catch (e) {} }
}
window.bpSide = { toggle(){ setSide(!sideOpen()); }, peek(on){ peek = on == null ? null : !!on; paintSide(); } };
if ($('sdClose')) $('sdClose').addEventListener('click', () => setSide(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawerOpen && !dockable() && peek == null) setSide(false); });
document.addEventListener('click', e => {
  if (!drawerOpen || dockable() || peek != null || !side || side.contains(e.target) || (chip && chip.contains(e.target))) return;
  if (e.target.closest && e.target.closest('#layout, .topbar, .sitefoot')) setSide(false);   // not for clicks in pop-up windows
});
if (wideMq) { const h = () => paintSide(); if (wideMq.addEventListener) wideMq.addEventListener('change', h); else if (wideMq.addListener) wideMq.addListener(h); }

async function load(){
  if (!loggedIn || document.hidden) return;
  try {
    const r = await fetch('/api/day?date=' + todayKey(), { credentials: 'same-origin' });
    if (!r.ok) return;
    day = await r.json(); render();
  } catch (e) {}
}
function soon(){ clearTimeout(timer); timer = setTimeout(load, 500); }

// On phones the games list scrolls sideways: keep the selected one in view.
function showSelectedTab(){
  const tabs = $('tabs'), a = tabs && tabs.querySelector('a.sel');
  if (!a || tabs.scrollWidth <= tabs.clientWidth) return;
  const t = tabs.getBoundingClientRect(), r = a.getBoundingClientRect();
  tabs.scrollLeft += (r.left + r.width / 2) - (t.left + t.width / 2);
}

// "How to play" links on the games open the how-to page at that game's card and mark it briefly.
document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('[data-how]'); if (!el) return;
  e.preventDefault();
  const card = $('how-' + el.getAttribute('data-how'));
  location.hash = 'howto';
  setTimeout(() => {
    if (!card) return;
    try { card.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {}
    card.classList.add('hit'); setTimeout(() => card.classList.remove('hit'), 2400);
  }, 120);
});

window.addEventListener('hashchange', () => { drawerOpen = false; render(); soon(); showSelectedTab(); });
window.addEventListener('load', showSelectedTab);
window.addEventListener('bp-saved', soon);                      // a game just saved a result
document.addEventListener('visibilitychange', () => { if (!document.hidden) soon(); });
setInterval(load, 60000);
render();
if (window.claude && window.claude.use) window.claude.use('user').then(() => { loggedIn = true; render(); load(); }).catch(() => {});

// ---------------------------------------------------------------- pop-up window (shared)
// A drawn cross (the side panel uses the same one): a typed "×" sits off centre, its place depends on the font.
const XICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>';
let modal = null;
function closeModal(){
  if (!modal) return;
  modal.back.remove(); document.removeEventListener('keydown', modal.onKey, true);
  try { if (modal.from && modal.from.focus) modal.from.focus(); } catch (e) {}
  modal = null;
}
// bpModal.open({ title, html, wide }) returns the body element so the caller can wire up its own buttons.
window.bpModal = {
  open(o){
    closeModal();
    const back = document.createElement('div'); back.className = 'bpm-back';
    back.innerHTML = '<div class="bpm' + (o.wide ? ' wide' : '') + '" role="dialog" aria-modal="true"><div class="bpm-hd"><h2>' + o.title + '</h2><button type="button" class="bpm-x" aria-label="Close">' + XICON + '</button></div><div class="bpm-body">' + o.html + '</div></div>';
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModal(); } };
    modal = { back, onKey, from: document.activeElement };
    back.addEventListener('mousedown', e => { if (e.target === back) closeModal(); });
    back.querySelector('.bpm-x').addEventListener('click', closeModal);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(back);
    back.querySelector('.bpm-x').focus();
    return back.querySelector('.bpm-body');
  },
  close: closeModal
};

// ---------------------------------------------------------------- sound: one soft two-note chime, made in the browser
// Quiet on purpose. Off entirely when the player switches sound off in their profile.
let audio = null, lastChime = 0;
window.bpSound = {
  on(){ try { return localStorage.getItem('bp_sfx') !== 'off'; } catch (e) { return true; } },
  set(v){ try { localStorage.setItem('bp_sfx', v ? 'on' : 'off'); } catch (e) {} },
  chime(){
    if (!this.on() || Date.now() - lastChime < 1500) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      audio = audio || new AC();
      if (audio.state === 'suspended') audio.resume();
      if (audio.state !== 'running') return;                    // browsers stay silent until the player has clicked something
      lastChime = Date.now();
      const t = audio.currentTime;
      [[659.25, 0], [987.77, 0.12]].forEach(([freq, at]) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t + at); g.gain.linearRampToValueAtTime(0.05, t + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.55);
        o.connect(g); g.connect(audio.destination); o.start(t + at); o.stop(t + at + 0.6);
      });
    } catch (e) {}
  }
};

// ---------------------------------------------------------------- toasts
// bpToast(heading, title, text, onClick, celebrate): a card at the top of the page. Stays 12 s, longer while the mouse is on it; its × closes it at once.
// "celebrate" adds a short glow, a few specks and the chime: used for achievements and level-ups.
const TOAST_MS = 12000;
function specks(){
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fx = document.createElement('div'); fx.className = 'bpt-fx';
  const colors = ['var(--accent)', 'var(--good)', 'var(--present)'];
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('i'), a = Math.random() * Math.PI * 2, r = 110 + Math.random() * 150;
    s.style.background = colors[i % 3];
    s.style.setProperty('--dx', Math.round(Math.cos(a) * r) + 'px'); s.style.setProperty('--dy', Math.round(Math.sin(a) * r * 0.6) + 'px');
    s.style.animationDelay = (Math.random() * 0.15) + 's';
    fx.appendChild(s);
  }
  document.body.appendChild(fx); setTimeout(() => fx.remove(), 1500);
}
window.bpToast = function(heading, title, text, onClick, celebrate){
  let wrap = document.querySelector('.bpt-wrap');
  if (!wrap) { wrap = document.createElement('div'); wrap.className = 'bpt-wrap'; wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
  while (wrap.children.length >= 3) wrap.firstChild.remove();
  const t = document.createElement('button'); t.type = 'button'; t.className = 'bpt' + (celebrate ? ' cele' : '');
  t.innerHTML = '<span class="th">' + E(heading) + '</span><span class="tb"><b>' + E(title) + '</b>' + E(text || '') + '</span><span class="tx" title="Close" aria-label="Close">' + XICON + '</span><span class="tm"></span>';
  let left = TOAST_MS, since = Date.now(), timer = null;
  const gone = () => { t.classList.add('out'); setTimeout(() => t.remove(), 320); };
  const run = () => { since = Date.now(); timer = setTimeout(gone, left); };
  t.addEventListener('mouseenter', () => { clearTimeout(timer); left = Math.max(1500, left - (Date.now() - since)); });
  t.addEventListener('mouseleave', run);
  // the × only closes; a click anywhere else on the card also opens what it announces
  t.addEventListener('click', e => { clearTimeout(timer); t.remove(); if (onClick && !e.target.closest('.tx')) onClick(); });
  wrap.appendChild(t); run();
  if (celebrate) { specks(); window.bpSound.chime(); }
};
})();
