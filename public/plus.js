// Ballpark Plus in the browser: the offer, the way to the checkout, and the member view.
// Whether an account has Plus is decided on the server (plus-server.js). This file asks GET /api/plus and shows
// what it is told. No real payment provider is connected yet, so nobody can be charged: admin accounts get a
// test checkout, everybody else is told that Plus is not on sale yet.
// Where the offer appears:
//   - the "Plus" button in the top bar
//   - the Archive panel next to the games (past days are the main thing Plus opens up)
//   - the "Detailed statistics" link on each game's start card
//   - one line in the Today panel once all five daily games are done
// Anything marked data-plus="..." leads here; the value says which part was asked for.
//
(function(){
'use strict';
const $ = id => document.getElementById(id);
const root = document.documentElement;

// The prices are written down once, in site-info.js, for this window and the public pricing page.
const PRICE = window.BP_PRICE || { month: '', year: '', yearNote: '' };

// What a free account gets: the numbers are in site-info.js, the server counts with the same (limits-server.js).
const FREE = window.BP_FREE || { practicePerDay: 3, partyGames: 3 };
// [feature, explanation, in the free version? (true, false, or what a free account gets), already built?]
const FEATURES = [
  ["Today's five daily games", '', true, true],
  ['Practice games', 'In each game.', FREE.practicePerDay + ' a day', true],
  ['Hosting party games', 'Joining is always free.', FREE.partyGames + ' to try', true],
  ['Friends and leaderboards', '', true, true],
  ['Levels and achievements', '', true, true],
  ['Archive', 'Play any past day.', false, true],
  ['Detailed statistics', 'Trends, accuracy by category, best and worst topics.', false, true],
  ['Streak saver', 'One missed day a week is forgiven.', false, true],
  ['Head-to-head', 'Your record against each friend.', false, true],
  ['Extra question packs', '', false, true]
];
const LEADS = {
  top: "Today's games stay free.",
  archive: 'Past days are part of Plus.',
  stats: 'Detailed statistics are part of Plus.',
  h2h: 'Head-to-head is part of Plus.',
  packs: 'Question packs are part of Plus.',
  practice: 'Unlimited practice is part of Plus.',
  party: 'Hosting party games is part of Plus.'
};
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The server's answer. Until it arrives, the answer from the last visit is used so the page does not flicker.
const cached = () => { try { return localStorage.getItem('bp_plus') === '1'; } catch (e) { return false; } };
let state = { active: cached() };
function has(){ return !!state.active; }
// Buying Plus is switched off for now: nothing can be paid for yet. Outside the developer preview (?dev=1) the
// Plus button in the top bar is hidden and the offer shows no prices and no "Get Plus". Members still see their button.
// To switch buying back on for everybody, make this return true.
function canBuy(){ try { return localStorage.getItem('bp_dev') === '1'; } catch (e) { return false; } }
const post = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
  .then(r => r.json().catch(() => ({})).then(j => { if (!r.ok) throw new Error(j.error || 'That did not work. Try again in a moment.'); return j; }));
const date = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
async function refresh(){
  let s; try { const r = await fetch('/api/plus', { credentials: 'same-origin' }); if (!r.ok) return state; s = await r.json(); } catch (e) { return state; }
  const before = cached(); state = s;
  if (before !== !!s.active) {
    // Plus started or ended since the last visit. Every part of the page asked has() while it was drawn, so draw it again.
    let stored = false;
    try { if (s.active) localStorage.setItem('bp_plus', '1'); else localStorage.removeItem('bp_plus'); stored = cached() === !!s.active; } catch (e) {}
    if (stored) { if (!s.active && window.bpDay) location.href = '/'; else location.reload(); return new Promise(() => {}); }
  }
  paint(); return state;
}
// For the developer panel: an admin account gives itself Plus or takes it away again. The server refuses anybody else.
async function setPlan(plus){
  const id = await window.claude.use('user').then(u => u.id());
  await post('/api/admin/plus', { user: id, on: !!plus });
  return refresh();
}
let lastPerDay = null;
function paint(){
  const on = has();
  if (on) root.setAttribute('data-plan', 'plus'); else root.removeAttribute('data-plan');
  const b = $('plusBtn');
  if (b) { b.style.display = on || canBuy() ? '' : 'none'; b.classList.toggle('on', on); b.textContent = on ? 'Plus ✓' : 'Plus'; b.setAttribute('aria-label', on ? 'Ballpark Plus: you are a member' : 'Ballpark Plus'); }
  renderArchive(lastPerDay);
}

// ---------------------------------------------------------------- Basic: the offer
// `lead`: the server's own words when it refused something (a limit), shown instead of the usual first line.
function open(reason, lead){
  if (!window.bpModal) return;
  const rows = FEATURES.map(([name, note, free]) =>
    '<tr class="' + (free ? '' : 'only') + '"><td>' + name + (note ? '<small>' + note + '</small>' : '') + '</td>' +
    '<td>' + (free === true ? '<span class="y" aria-label="included">✓</span>' : free ? '<span class="part">' + E(free) + '</span>' : '<span class="n" aria-label="not included">–</span>') + '</td>' +
    '<td>' + (typeof free === 'string' ? '<span class="y lim">No limit</span>' : '<span class="y" aria-label="included">✓</span>') + '</td></tr>').join('');
  const sale = !!state.onSale;
  const body = window.bpModal.open({ title: 'Ballpark Plus' + (sale ? '' : ' <span class="ptag">Preview</span>'), html:
    '<p class="plus-lead">' + (lead ? E(lead) : LEADS[reason] || LEADS.top) + '</p>' +
    '<table class="plus-cmp"><thead><tr><th>What you get</th><th>Free</th><th>Plus</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="plus-bill" role="radiogroup" aria-label="Billing">' +
      '<button type="button" class="plus-opt" role="radio" aria-checked="false" data-bill="month"><b>' + PRICE.month + '</b>per month<br><span>Cancel any time</span></button>' +
      '<button type="button" class="plus-opt sel" role="radio" aria-checked="true" data-bill="year"><b>' + PRICE.year + '</b>per year<br><span>' + PRICE.yearNote + '</span></button>' +
    '</div>' +
    '<div class="plus-cta"><button type="button" id="plusGo">Get Plus</button><button type="button" class="ghost" id="plusNo">Not now</button></div>' +
    '<p class="plus-note">Renews automatically until cancelled. <a href="/terms">Terms</a>, <a href="/refunds">refunds</a>, <a href="/privacy">privacy</a>.</p>' +
    '<p class="plus-note" id="plusNote" role="status">' + (!sale ? 'Plus is not on sale yet.' : state.shop === 'test' ? 'Test checkout for admin accounts. No money is charged.'
      : state.shop === 'paddle-sandbox' ? 'Paddle sandbox for admin accounts: test cards only, no money is charged.' : 'Payment is handled by Paddle, our reseller.') + '</p>' });
  if (!canBuy()) {
    body.querySelectorAll('.plus-bill, #plusGo, .plus-note:not(#plusNote)').forEach(n => n.remove());
    $('plusNo').textContent = 'Close'; $('plusNote').textContent = 'Plus is not available yet.';
  }
  body.querySelectorAll('.plus-opt').forEach(b => b.addEventListener('click', () => {
    body.querySelectorAll('.plus-opt').forEach(x => { x.classList.toggle('sel', x === b); x.setAttribute('aria-checked', String(x === b)); });
  }));
  // The server answers with the checkout page to go to, or says why not.
  if ($('plusGo')) $('plusGo').addEventListener('click', async () => {
    const go = $('plusGo'), plan = (body.querySelector('.plus-opt.sel') || {}).dataset.bill;
    go.disabled = true;
    try { const j = await post('/api/plus/checkout', { plan }); if (j.paddle) await paddleCheckout(j.paddle); else location.href = j.url; }
    catch (e) { $('plusNote').textContent = e.message; go.disabled = false; }
  });
  $('plusNo').addEventListener('click', window.bpModal.close);
}

// Paddle's payment form. Its script is only fetched now, when somebody actually wants to buy, so a normal visit
// never contacts Paddle. The form opens as Paddle's own overlay; afterwards Paddle sends the buyer to /?plus=done.
let paddleReady = null;
function paddleCheckout(p){
  paddleReady = paddleReady || new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
    s.onload = () => { try { if (p.env === 'sandbox') window.Paddle.Environment.set('sandbox'); window.Paddle.Initialize({ token: p.token }); ok(); } catch (e) { fail(e); } };
    s.onerror = () => { paddleReady = null; fail(new Error('The payment page could not be loaded. Check your connection or ad blocker.')); };
    document.head.appendChild(s);
  });
  return paddleReady.then(() => {
    window.bpModal.close();
    window.Paddle.Checkout.open({ items: [{ priceId: p.priceId, quantity: 1 }], customData: p.customData,
      settings: { displayMode: 'overlay', theme: root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light', locale: 'en', successUrl: location.origin + '/?plus=done' } });
  });
}

// ---------------------------------------------------------------- Plus: the member view
function openMember(welcome){
  if (!window.bpModal) return;
  const s = state, plan = s.plan === 'year' ? 'Yearly plan. ' : s.plan === 'month' ? 'Monthly plan. ' : '';
  const lead = s.gift ? 'Plus is on the house for this account' + (s.until ? ' until ' + date(s.until) + '.' : '.')
    : s.renews ? plan + 'Renews on ' + date(s.until) + '.'
    : 'Cancelled. Plus stays until ' + date(s.until) + '.';
  const rows = FEATURES.filter(f => !f[2]).map(([name, note]) =>
    '<tr class="only"><td>' + name + (note ? '<small>' + note + '</small>' : '') + '</td><td><span class="y" aria-label="included">✓</span></td></tr>').join('');
  const body = window.bpModal.open({ title: 'Ballpark Plus <span class="ptag">Member</span>', html:
    '<p class="plus-lead">' + (welcome ? 'Welcome to Plus. ' : '') + lead + '</p>' +
    '<table class="plus-cmp"><tbody>' + rows + '</tbody></table>' +
    (s.renews ? '<div class="plus-cta" style="margin-top:16px"><button type="button" class="ghost" id="plusEnd">Cancel subscription</button></div>' : '') +
    '<p class="plus-note" id="plusNote" role="status"></p>' });
  const end = $('plusEnd'); if (!end) return;
  // two steps: the first click only asks
  end.addEventListener('click', async () => {
    if (!end.dataset.sure) { end.dataset.sure = '1'; end.textContent = 'Yes, cancel'; $('plusNote').textContent = 'Plus stays until ' + date(s.until) + ' and does not renew.'; return; }
    end.disabled = true;
    try { state = await post('/api/plus/cancel'); if (body.isConnected) openMember(); }
    catch (e) { $('plusNote').textContent = e.message; end.disabled = false; }
  });
}
// Back from the checkout (/?plus=done). The payment notice can take a moment longer than the buyer, so ask a few times.
async function afterCheckout(){
  let q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
  const how = q.get('plus'); if (!how) return;
  const strip = () => { q.delete('plus'); const rest = q.toString(); window.history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash); };
  if (how !== 'done') return strip();
  for (let i = 0; i < 6 && !has(); i++) { await new Promise(r => setTimeout(r, 1500)); await refresh(); }
  strip();
  if (has()) openMember(true);
  else if (window.bpModal) window.bpModal.open({ title: 'Ballpark Plus', html: '<p class="plus-lead" style="margin:0">Your payment is still being confirmed. Plus switches on by itself as soon as it is.</p>' });
}
// A member goes straight into that day (day.js reloads the page for it), or to the calendar when no day was named.
function openArchive(day){
  if (day) location.href = '/?day=' + day + '#survival';
  else location.hash = 'archive';
}

// Detailed statistics, first version: one row per game from the saved daily results.
// [name, where its days are saved, the number that counts for one day (null = not finished or not solved), lower is better?]
const STAT_GAMES = [
  ['Survival', d => (d.x_daily || {}).days, r => r.score, false],
  ['More/Less', d => ((d.x_stats || {}).ml || {}).days, r => r.score, false],
  ['Guessless', d => ((d.x_stats || {}).gl || {}).days, r => r.total, false],
  ['Clueless', d => ((d.x_stats || {}).cl || {}).days, r => r.solved ? r.guesses : null, true],
  ['Wordy', d => (d.x_words || {}).days, r => r.solved ? r.guesses : null, true]
];
async function openStats(){
  if (!window.bpModal) return;
  const body = window.bpModal.open({ title: 'Statistics', wide: true, html: '<p class="plus-lead" style="margin:0">Loading…</p>' });
  let docs = {};
  try {
    const r = await fetch('/api/docs', { credentials: 'same-origin' }); if (!r.ok) throw new Error('HTTP ' + r.status);
    (await r.json()).docs.forEach(d => { docs[d.id] = d.data; });
  } catch (e) { body.innerHTML = '<p class="plus-lead" style="margin:0">Could not load your results. Try again in a moment.</p>'; return; }
  if (!body.isConnected) return;
  const week = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i); week.push(d); }
  const num = v => typeof v === 'number' && isFinite(v) ? v : null;
  const show = v => v == null ? '–' : String(Math.round(v * 10) / 10);
  const rows = STAT_GAMES.map(([name, daysOf, valueOf, low]) => {
    const days = daysOf(docs) || {};
    const played = Object.values(days).filter(Boolean);
    const vals = played.map(r => num(valueOf(r))).filter(v => v != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const best = vals.length ? (low ? Math.min : Math.max).apply(null, vals) : null;
    const cells = week.map(d => {
      const r = days[dayKey(d)], v = r ? num(valueOf(r)) : null;
      const label = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      return '<span title="' + label + '"' + (r ? '' : ' class="no"') + '>' + (r ? (v == null ? '✕' : show(v)) : '–') + '</span>';
    }).join('');
    // trend: the seven most recent results against everything before them (needs at least three on each side)
    const inOrder = Object.keys(days).sort().map(k => days[k] ? num(valueOf(days[k])) : null).filter(v => v != null);
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    let trend = '<span class="muted">–</span>';
    if (inOrder.length >= 6) {
      const cut = Math.max(3, inOrder.length - 7), diff = mean(inOrder.slice(cut)) - mean(inOrder.slice(0, cut)), better = low ? diff < 0 : diff > 0;
      if (Math.abs(diff) >= 0.05) trend = '<span style="color:var(--' + (better ? 'good' : 'bad') + ')">' + (diff > 0 ? '▲ ' : '▼ ') + show(Math.abs(diff)) + '</span>';
      else trend = 'Level';
    }
    return '<tr><td><b>' + name + '</b></td><td>' + played.length + '</td><td>' + show(avg) + '</td><td>' + show(best) + '</td><td>' + trend + '</td><td><div class="st7">' + cells + '</div></td></tr>';
  }).join('');

  // By topic: Guessless saves the points for every question with its category, More/Less saves right and wrong per category.
  const topics = {}, topic = n => (topics[n] = topics[n] || { gl: [0, 0], ml: [0, 0] });
  Object.values(((docs.x_stats || {}).gl || {}).days || {}).forEach(d => (d && Array.isArray(d.res) ? d.res : []).forEach(r => { if (r && r.cat && num(r.pts) != null) { const t = topic(r.cat).gl; t[0] += r.pts; t[1]++; } }));
  Object.values(((docs.x_stats || {}).ml || {}).days || {}).forEach(d => (d && Array.isArray(d.grid) ? d.grid : []).forEach((row, i) => { const n = (d.cats || [])[i]; if (!n || !Array.isArray(row)) return; const t = topic(n).ml; row.forEach(x => { t[0] += x ? 1 : 0; t[1]++; }); }));
  const names = Object.keys(topics).sort();
  const glOf = n => topics[n].gl[1] ? topics[n].gl[0] / topics[n].gl[1] : null, mlOf = n => topics[n].ml[1] ? 100 * topics[n].ml[0] / topics[n].ml[1] : null;
  const edge = of => { const have = names.filter(n => of(n) != null); if (have.length < 2) return [null, null]; const s = have.slice().sort((a, b) => of(b) - of(a)); return of(s[0]) === of(s[s.length - 1]) ? [null, null] : [s[0], s[s.length - 1]]; };
  const glEdge = edge(glOf), mlEdge = edge(mlOf);
  const mark = (n, e, text) => text == null ? '<span class="muted">–</span>' : n === e[0] ? '<b style="color:var(--good)">' + text + '</b>' : n === e[1] ? '<b style="color:var(--bad)">' + text + '</b>' : text;
  const topicRows = names.map(n => '<tr><td>' + esc(n) + '</td><td class="mono">' + mark(n, glEdge, glOf(n) == null ? null : show(glOf(n))) + '</td><td class="mono">' + mark(n, mlEdge, mlOf(n) == null ? null : Math.round(mlOf(n)) + '%') + '</td></tr>').join('');

  body.innerHTML = '<div style="overflow-x:auto"><table class="ft"><thead><tr><th>Game</th><th>Days played</th><th>Average</th><th>Best</th><th>Trend</th><th>Last 7 days, today last</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="plus-note">Daily games only. Clueless and Wordy count guesses, so lower is better. Trend compares your last seven results with the ones before.</p>' +
    (topicRows ? '<h3 class="fh">By topic</h3><div style="overflow-x:auto"><table class="ft"><thead><tr><th>Topic</th><th>Guessless, points per question</th><th>More/Less, right</th></tr></thead><tbody>' + topicRows + '</tbody></table></div>' +
      '<p class="plus-note">Green is your best topic in that game, red your worst.</p>' : '');
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- Archive panel
function dayKey(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function renderArchive(perDay){
  lastPerDay = perDay || lastPerDay;
  const box = $('sdArchive'); if (!box) return;
  if (!lastPerDay) { box.innerHTML = ''; return; }           // nothing loaded yet (not logged in)
  box.innerHTML = '<div class="panel"><div class="prow" style="border-top:0"><span>Archive</span><a href="#archive">Calendar and streaks</a></div></div>';
}

document.addEventListener('click', e => {
  const el = e.target.closest && e.target.closest('[data-plus]');
  if (!el) return;
  e.preventDefault();
  const why = el.getAttribute('data-plus');
  if (!has()) open(why);
  else if (why === 'stats') openStats();
  else if (why === 'archive') openArchive(el.getAttribute('data-day'));
  else openMember();
});
window.addEventListener('bp-level', e => renderArchive(e.detail && e.detail.perDay));

// ---------------------------------------------------------------- free limits (counted on the server, limits-server.js)
// How many a free account has left, drawn on the button that uses one: "2 left", or the Plus tag once none are left.
// null means no limit (Plus, or Plus not on sale for this account): no tag at all. Call it again after the button's
// text was replaced.
function tag(btn, left){
  if (!btn) return;
  let t = btn.querySelector('.left-tag');
  if (left == null) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement('span'); btn.appendChild(t); }
  t.className = left > 0 ? 'left-tag' : 'left-tag ptag';
  t.textContent = left > 0 ? left + ' left' : 'Plus';
}
// The server refused something because of a limit: show the offer with its reason. True when that was the case.
function limited(j){
  if (!j || (j.limit !== 'practice' && j.limit !== 'party')) return false;
  open(j.limit, j.error); return true;
}
window.bpPlus = { open, has, setPlan, refresh, tag, limited };
paint();
// ask the server once the account is known
if (window.claude && window.claude.use) window.claude.use('user').then(u => u.id()).then(refresh).then(afterCheckout).catch(e => console.error('Plus:', e));
})();
