// Hunch, browser side: guess the game character from hints that get more specific. The fewer hints, the more it is
// worth. This file only DRAWS what the server sends and REPORTS what the player types. It never has the answer, or
// the game it is from, before the round is over: see hunch-server.js.
// The start card lists the games; Plus members switch them on and off there (saved on the server), everybody else
// sees them all on, and a click shows the Plus offer.
(function(){
'use strict';
const box = document.getElementById('g-hunch'); if (!box) return;
const $ = id => document.getElementById(id);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

let home = null, V = null, busy = false, names = null, short = {}, picks = [], sel = 0, gseq = 0;
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

async function api(act, body){
  if (window.bpDay) { if (body) body = Object.assign({ day: window.bpDay }, body); else if (act === 'home') act += '?day=' + window.bpDay; }
  const r = await fetch('/api/hu/' + act, body ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Try again.'), { j });
  return j;
}
function status(){
  const el = $('st-hu'); if (!el || !home) return;
  el.textContent = home.done ? (home.result.won ? '+' + home.result.pts : 'Missed') : 'Open'; el.classList.toggle('open', !home.done);
}
async function load(){ try { home = await api('home'); status(); } catch (e) {} }

// ---------------------------------------------------------------- the start card
function intro(err){
  V = null;
  const st = (home && home.stats) || { played: 0, won: 0, points: 0 }, done = home && home.done, going = home && home.going;
  box.innerHTML = '<div class="card"><h2 class="gh">Hunch</h2>' +
    '<p class="lead">Guess the game character. Every hint makes it easier, and worth less.</p>' +
    (home && home.games ? '<div class="hu-games" role="group" aria-labelledby="huGl"><span class="pick-lbl" id="huGl">Games' + (home.choose ? '' : '<span class="ptag">Plus</span>') + '</span><div class="hu-chips" id="huChips">' + chips() + '</div></div>' : '') +
    '<div class="acts"><button type="button" data-act="daily">' + (done ? "See today's character" : going ? "Continue today's character" : "Play today's character") + '</button>' +
      '<button type="button" class="ghost" data-act="practice" id="huPractice">Practice</button></div>' +
    '<div class="parsed" id="huMsg" role="status" style="color:var(--warn)">' + E(err || '') + '</div>' +
    '<div class="statstrip"><div class="cells">' + window.statCells([['Today', done ? (home.result.won ? home.result.pts + ' points' : 'Missed') : '–'], ['Won', st.won + ' of ' + st.played], ['Points', st.points]]) + '</div></div></div>';
  if (window.bpPlus) window.bpPlus.tag($('huPractice'), home ? home.practiceLeft : null);
}
// the games: on (a tick) or off (dashed). At least one stays on; the server checks that too.
const chips = () => home.games.map(g => '<button type="button" data-game="' + E(g.id) + '" aria-pressed="' + !!g.on + '">' + CHECK + E(g.short) + '</button>').join('');
function paintGames(){                               // in place, so the button keeps the keyboard focus
  const el = $('huChips'); if (!el || !home || !home.games) return;
  home.games.forEach(g => { const b = el.querySelector('[data-game="' + g.id + '"]'); if (b) b.setAttribute('aria-pressed', String(!!g.on)); });
}
async function toggleGame(id){
  const m = $('huMsg'); if (m) m.textContent = '';
  if (!home || !home.games) return;
  if (!home.choose) { if (window.bpPlus) window.bpPlus.open('hunch'); return; }
  const g = home.games.find(x => x.id === id); if (!g) return;
  if (g.on && home.games.filter(x => x.on).length === 1) { if (m) m.textContent = 'Keep at least one game.'; return; }
  g.on = !g.on; paintGames();
  const mine = ++gseq;                               // several quick clicks: only the last answer counts
  try { const j = await api('games', { skip: home.games.filter(x => !x.on).map(x => x.id) }); if (mine === gseq) { home.games = j.games; paintGames(); } }
  catch (e) { if (mine === gseq) { await load(); paintGames(); const mm = $('huMsg'); if (mm) mm.textContent = e.message; } }
}
async function start(daily){
  if (busy) return; busy = true;
  try { show(await api('start', { daily })); }
  catch (e) {
    if (window.bpPlus && window.bpPlus.limited(e.j)) { if (home) home.practiceLeft = 0; intro(); }
    else { const m = $('huMsg'); if (m) m.textContent = e.message; }
  }
  busy = false;
}
function show(v){
  V = v;
  if (v.practiceLeft !== undefined && home) home.practiceLeft = v.practiceLeft;
  if (!names) fetch('/api/hu/names', { credentials: 'same-origin' }).then(r => r.json()).then(j => {
    j.games.forEach(g => { short[g.id] = g.short; });
    names = j.names.map(x => ({ n: x.n, k: norm(x.n), g: x.g }));
  }).catch(() => {});
  if (v.done) return end();
  draw();
}

// ---------------------------------------------------------------- a round: the hints so far, five places in all
const hintList = (v, all) => '<ol class="hu-hints">' + [0, 1, 2, 3, 4].map(i => i < v.hints.length && (all || i < v.k)
  ? '<li class="' + (!all && i === v.k - 1 ? 'new' : all && i >= v.k ? 'late' : '') + '"><span class="hu-n">' + (i + 1) + '</span>' + E(v.hints[i]) + '</li>'
  : '<li class="locked"><span class="hu-n">' + (i + 1) + '</span>Hint ' + (i + 1) + '</li>').join('') + '</ol>';
function draw(){
  const v = V, last = v.k >= 5;
  box.innerHTML = '<div class="card hu"><div class="mlhead" style="margin-bottom:16px"><span>' + (v.daily ? 'Worth ' : 'Practice, worth ') + '<b class="hu-worth">' + v.worth + '</b></span><button type="button" class="ghost sm" data-act="menu">← Menu</button></div>' +
    hintList(v) +
    (v.wrong.length ? '<div class="hu-wrong">' + v.wrong.map(w => '<s>' + E(w) + '</s>').join('') + '</div>' : '') +
    '<form id="huForm" autocomplete="off"><div class="at-ac"><input type="text" id="huInp" placeholder="Character" aria-label="Your guess" autocapitalize="words" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="huList">' +
    '<ul id="huList" role="listbox" hidden></ul></div><button>Guess</button></form>' +
    '<div class="nextrow"><span class="parsed" id="huNote" role="status"></span><button type="button" class="ghost" data-act="' + (last ? 'giveup' : 'hint') + '">' + (last ? 'Give up' : 'Next hint') + '</button></div></div>';
  const inp = $('huInp'); if (location.hash === '#hunch' && innerWidth > 700) inp.focus();
}
// names from the round's games only, each with its game (or both, for a name like Viper)
const inRound = x => !V || !V.games || x.g.some(g => V.games.includes(g));
const gamesOf = x => x.g.filter(g => !V || !V.games || V.games.includes(g)).map(g => short[g] || g).join(', ');
function suggest(text){
  const q = norm(text); if (q.length < 2 || !names) return [];
  return names.filter(inRound).filter(x => x.k.startsWith(q) || x.k.split(' ').some(w => w.startsWith(q)) || x.k.replace(/ /g, '').startsWith(q.replace(/ /g, '')))
    .sort((a, b) => (b.k.startsWith(q) - a.k.startsWith(q)) || a.n.localeCompare(b.n)).slice(0, 6);
}
function drawList(){
  const ul = $('huList'), inp = $('huInp'); if (!ul) return;
  picks = suggest(inp.value); sel = Math.min(sel, Math.max(0, picks.length - 1));
  ul.hidden = !picks.length; inp.setAttribute('aria-expanded', String(!!picks.length));
  ul.innerHTML = picks.map((x, i) => '<li role="option" data-name="' + E(x.n) + '"' + (i === sel ? ' class="sel" aria-selected="true"' : '') + '>' + E(x.n) + '<small>' + E(gamesOf(x)) + '</small></li>').join('');
}
async function act(what, text){
  if (busy || !V || V.done) return;
  busy = true;
  try { show(await api(what, { daily: V.daily, n: V.n, text })); }
  catch (e) { const n = $('huNote'); if (n) n.textContent = e.message; }
  busy = false;
}

// ---------------------------------------------------------------- the end of a round
function end(){
  const v = V;
  if (v.daily && home) { home.done = true; home.going = false; home.result = { won: v.won, pts: v.pts, k: v.k }; status(); load(); }
  box.innerHTML = '<div class="card hu"><div class="center" style="margin-bottom:18px"><div class="muted">' + (v.won ? 'You got it with ' + v.k + (v.k === 1 ? ' hint' : ' hints') : 'Not this time. It was') + '</div>' +
    '<div class="hu-answer">' + E(v.answer) + '</div>' + (v.game ? '<div class="hu-game">' + E(v.game) + '</div>' : '') + '<div class="muted mono">' + (v.won ? '+' + v.pts + ' points' : '0 points') + '</div></div>' +
    hintList(v, true) +
    '<div class="center" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px"><button type="button" data-act="copy">Copy result</button><button type="button" class="ghost" data-act="practice" id="huAgain">Practice</button><button type="button" class="ghost" data-act="menu">Back</button></div></div>';
  if (window.bpPlus) window.bpPlus.tag($('huAgain'), home ? home.practiceLeft : null);
}

// ---------------------------------------------------------------- what the player does
box.addEventListener('click', async e => {
  const li = e.target.closest('#huList li'); if (li) return act('guess', li.dataset.name);
  const gb = e.target.closest('[data-game]'); if (gb) return toggleGame(gb.dataset.game);
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'daily') return start(true);
  if (a === 'practice') return start(false);
  if (a === 'hint') return act('hint');
  if (a === 'giveup') {
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Sure? Click again'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Give up'; } }, 3000); return; }
    return act('giveup');
  }
  if (a === 'menu') {
    if (V && !V.daily && !V.done && !b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Leave? Progress is lost'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = '← Menu'; } }, 3000); return; }
    if (V && !V.daily && !V.done) api('quit', { daily: false }).catch(() => {});
    await load(); return intro();
  }
  if (a === 'copy') {
    const t = 'Ballpark Hunch ' + (V.daily ? (V.day || home.date) : '(practice)') + ': ' + (V.won ? V.k + '/5 hints, ' + V.pts + ' points' : 'missed') + '\n' + [0, 1, 2, 3, 4].map(i => i >= V.k ? '⬜' : V.won && i === V.k - 1 ? '\u{1F7E9}' : '\u{1F7E5}').join('');   // hints used red, the one that did it green
    try { await navigator.clipboard.writeText(t); b.textContent = 'Copied!'; } catch (err) { b.textContent = 'Copy failed'; }
    setTimeout(() => { if (b.isConnected) b.textContent = 'Copy result'; }, 1500);
  }
});
box.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'huForm') { const t = $('huInp').value; act('guess', picks[sel] && norm(t).length >= 2 ? picks[sel].n : t); } });
box.addEventListener('input', e => { if (e.target.id === 'huInp') { sel = 0; const n = $('huNote'); if (n) n.textContent = ''; drawList(); } });
box.addEventListener('keydown', e => {
  if (e.target.id !== 'huInp' || !picks.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : picks.length - 1)) % picks.length; drawList(); }
  if (e.key === 'Escape') { picks = []; $('huList').hidden = true; }
});

const onRoute = async () => {
  if (location.hash !== '#hunch') { if (!home) load(); return; }
  if (V) return;
  await load();
  if (home && home.going) { try { return show(await api('start', { daily: true })); } catch (e) {} }
  intro();
};
window.addEventListener('hashchange', onRoute);
if (window.claude && window.claude.use) window.claude.use('user').then(u => u.id()).then(onRoute).catch(() => {}); else onRoute();
})();
