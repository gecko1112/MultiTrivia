// Oddball, browser side: a question with many right answers, and the rarer your right answer, the more it scores.
// This file only DRAWS what the server sends and REPORTS what the player types. It never knows the right answers or
// their points before the server says so: see oddball-server.js.
(function(){
'use strict';
const box = document.getElementById('g-oddball'); if (!box) return;
const $ = id => document.getElementById(id);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

let home = null, V = null, busy = false, names = null, picks = [], sel = 0, after = null;

async function api(act, body){
  if (window.bpDay) { if (body) body = Object.assign({ day: window.bpDay }, body); else if (act === 'home') act += '?day=' + window.bpDay; }
  const r = await fetch('/api/od/' + act, body ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Try again.'), { j });
  return j;
}
// the games list on the left: open, or today's score
function status(){
  const el = $('st-od'); if (!el || !home) return;
  el.textContent = home.done ? home.total + ' / 300' : 'Open'; el.classList.toggle('open', !home.done);
}

// ---------------------------------------------------------------- the start card
function intro(err){
  V = null; after = null;
  const st = (home && home.stats) || { played: 0, best: 0 }, done = home && home.done, going = home && home.going;
  box.innerHTML = '<div class="card"><h2 class="gh">Oddball</h2>' +
    '<p class="lead">Three questions with many right answers. The rarer your right answer, the more it scores.</p>' +
    '<div class="acts"><button type="button" data-act="daily">' + (done ? "See today's result" : going ? "Continue today's 3" : "Play today's 3") + '</button>' +
      '<button type="button" class="ghost" data-act="practice" id="odPractice">Practice</button></div>' +
    '<div class="parsed" id="odMsg" role="status" style="color:var(--warn)">' + E(err || '') + '</div>' +
    '<div class="statstrip"><div class="cells">' + window.statCells([['Today', done ? home.total + ' / 300' : '–'], ['Best', st.best ? st.best + ' / 300' : '–'], ['Played', st.played]]) + '</div></div></div>';
  if (window.bpPlus) window.bpPlus.tag($('odPractice'), home ? home.practiceLeft : null);
}
async function load(){ try { home = await api('home'); status(); } catch (e) {} }

async function start(daily){
  if (busy) return; busy = true;
  try { show(await api('start', { daily })); }
  catch (e) {
    if (window.bpPlus && window.bpPlus.limited(e.j)) { if (home) home.practiceLeft = 0; intro(); }
    else { const m = $('odMsg'); if (m) m.textContent = e.message; }
  }
  busy = false;
}
function show(v){
  V = v; after = null;
  if (v.practiceLeft !== undefined && home) home.practiceLeft = v.practiceLeft;
  if (v.done) return end();
  ask();
}

// ---------------------------------------------------------------- a question
const head = () => '<div class="mlhead" style="margin-bottom:18px"><span>Question ' + Math.min(V.i + 1, V.n) + ' of ' + V.n + (V.daily ? '' : ', practice') + '</span><button type="button" class="ghost sm" data-act="menu">← Menu</button></div>';
function ask(){
  box.innerHTML = '<div class="card od">' + head() + '<p class="q">' + E(V.q.text) + '</p>' +
    '<form id="odForm" autocomplete="off"><div class="at-ac"><input type="text" id="odInp" placeholder="Country" aria-label="Your answer" autocapitalize="words" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="odList">' +
    '<ul id="odList" role="listbox" hidden></ul></div><button>Answer</button></form><div class="parsed" id="odNote" role="status"></div></div>';
  const inp = $('odInp'); if (location.hash === '#oddball' && innerWidth > 700) inp.focus();
  if (!names) fetch('/api/geo/names', { credentials: 'same-origin' }).then(r => r.json()).then(j => { names = j.names.map(([id, name, ...alt]) => ({ id, name, keys: [name, ...alt].map(norm) })); }).catch(() => {});
}
// Suggestions start at three letters, so a single letter cannot list every country that starts with it.
function suggest(text){
  const q = norm(text); if (q.length < 3 || !names) return [];
  return names.map(c => [c.keys.reduce((r, k) => Math.min(r, k.startsWith(q) ? 0 : k.split(' ').some(w => w.startsWith(q)) ? 1 : 9), 9), c]).filter(x => x[0] < 9)
    .sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, 6).map(x => x[1]);
}
function drawList(){
  const ul = $('odList'), inp = $('odInp'); if (!ul) return;
  picks = suggest(inp.value); sel = Math.min(sel, Math.max(0, picks.length - 1));
  ul.hidden = !picks.length; inp.setAttribute('aria-expanded', String(!!picks.length));
  ul.innerHTML = picks.map((c, i) => '<li role="option" data-name="' + E(c.name) + '"' + (i === sel ? ' class="sel" aria-selected="true"' : '') + '>' + E(c.name) + '</li>').join('');
}
async function answer(text){
  if (busy || !V || V.done) return;
  text = String(text || '').trim(); if (!text) return;
  busy = true;
  try { const v = await api('answer', { daily: V.daily, i: V.i, text }); after = v; result(v.last, v); }
  catch (e) { const n = $('odNote'); if (n) n.textContent = e.message; }
  busy = false;
}

// ---------------------------------------------------------------- what an answer was worth
function result(r, v){
  const pos = Math.round((r.pts - 10) / 90 * 100);
  box.innerHTML = '<div class="card od">' + head() + '<p class="q" style="min-height:0">' + E(r.q) + '</p>' +
    '<div class="od-res' + (r.ok ? '' : ' no') + '"><div><span class="pt-lbl">' + (r.ok ? 'Your answer' : 'Does not fit') + '</span><b>' + E(r.said) + '</b></div><div class="od-pts mono">' + (r.ok ? '+' + r.pts : '0') + '</div></div>' +
    (r.ok ? '<div class="od-scale" aria-hidden="true"><i style="left:' + pos + '%"></i></div><div class="od-ends"><span>Obvious</span><span>Rare</span></div>' : '') +
    '<p class="od-rare"><span class="pt-lbl">Rarest right answers</span>' + r.rare.map(E).join(', ') + '</p>' +
    '<p class="muted od-count">' + r.count + ' right answers in all.' + (r.note ? ' ' + E(r.note) : '') + '</p>' +
    '<div class="nextrow"><span class="muted mono">' + v.total + ' so far</span><button type="button" data-act="next">' + (v.done ? 'See result' : 'Next question') + '</button></div></div>';
  const b = box.querySelector('[data-act=next]'); if (b) b.focus();
}
function end(){
  const v = V;
  if (v.daily && home) { home.done = true; home.going = false; home.total = v.total; status(); load(); }
  box.innerHTML = '<div class="card od"><div class="center"><div class="muted">' + (v.daily ? "Today's score" : 'Practice score') + '</div><div class="big mono">' + v.total + '</div><div class="muted">out of 300</div></div>' +
    '<div class="hist" style="margin-top:18px">' + v.results.map(r => '<div class="hrow"><div><div class="hq">' + E(r.q) + '</div><div class="hsub">' + E(r.said) + (r.ok ? '' : ', does not fit') + '. Rarest: ' + r.rare.map(E).join(', ') + '</div></div><div class="hd mono" style="color:' + (r.ok ? 'var(--good)' : 'var(--bad)') + '">' + r.pts + '</div></div>').join('') + '</div>' +
    '<div class="center" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px"><button type="button" data-act="copy">Copy result</button><button type="button" class="ghost" data-act="practice" id="odAgain">Practice</button><button type="button" class="ghost" data-act="menu">Back</button></div></div>';
  if (window.bpPlus) window.bpPlus.tag($('odAgain'), home ? home.practiceLeft : null);
}

// ---------------------------------------------------------------- what the player does
box.addEventListener('click', async e => {
  const li = e.target.closest('#odList li'); if (li) return answer(li.dataset.name);
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'daily') return start(true);
  if (a === 'practice') return start(false);
  if (a === 'next') { const v = after; after = null; V = v; return v.done ? end() : ask(); }
  if (a === 'menu') {
    // leaving today's game only puts it aside; a practice game asks first, then is thrown away
    if (V && !V.daily && !V.done && !b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Leave? Progress is lost'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = '← Menu'; } }, 3000); return; }
    if (V && !V.daily && !V.done) api('quit', { daily: false }).catch(() => {});
    await load(); return intro();
  }
  if (a === 'copy') {
    const t = 'Ballpark Oddball ' + (V.daily ? (V.day || home.date) : '(practice)') + ': ' + V.total + '/300\n' + V.results.map(r => (r.ok ? r.pts : 0) + ' ' + (r.ok ? '\u{1F7EA}' : '⬜')).join(' ');
    try { await navigator.clipboard.writeText(t); b.textContent = 'Copied!'; } catch (err) { b.textContent = 'Copy failed'; }
    setTimeout(() => { if (b.isConnected) b.textContent = 'Copy result'; }, 1500);
  }
});
box.addEventListener('submit', e => { e.preventDefault(); if (e.target.id === 'odForm') answer(picks[sel] && $('odInp').value.trim().length >= 3 ? picks[sel].name : $('odInp').value); });
box.addEventListener('input', e => { if (e.target.id === 'odInp') { sel = 0; const n = $('odNote'); if (n) n.textContent = ''; drawList(); } });
box.addEventListener('keydown', e => {
  if (e.target.id !== 'odInp' || !picks.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : picks.length - 1)) % picks.length; drawList(); }
  if (e.key === 'Escape') { picks = []; $('odList').hidden = true; }
});

// the start card is drawn when Oddball is opened; a game in progress stays on screen
const onRoute = async () => {
  if (location.hash !== '#oddball') { if (!home) load(); return; }
  if (V) return;
  await load();
  if (home && home.going) { try { return show(await api('start', { daily: true })); } catch (e) {} }
  intro();
};
window.addEventListener('hashchange', onRoute);
if (window.claude && window.claude.use) window.claude.use('user').then(u => u.id()).then(onRoute).catch(() => {}); else onRoute();
})();
