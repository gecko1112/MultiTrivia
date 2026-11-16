// Party mode, browser side: a private lobby where everyone estimates the same question at once.
//
// This file only DRAWS what the server sends and REPORTS what the player does (create, join, guess, chat).
// It never knows an answer before the server reveals it and never counts points: see party-server.js.
// Changing anything in here cannot change a score.
(function(){
'use strict';
const box = document.getElementById('g-party'); if (!box) return;
const $ = id => document.getElementById(id);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROUNDS = [5, 10, 15], SECONDS = [15, 25, 40];

let betOn = null, betStake = 1, betRound = 0;   // the betting screen's choices, sent only with "Bet"
let code = null, S = null, es = null, drawn = '', deadline = 0, clock = 0, clockRound = 0, before = null, chatSeen = 0, saveKey = 'bp_party';

box.innerHTML =
  '<div class="card" id="ptStart">' +
    '<h2 class="gh">Party</h2>' +
    '<p class="lead">Everyone estimates the same question at the same time. The closest guess scores most.</p>' +
    '<div class="modes">' +
      '<div class="mode"><div class="mt">New lobby</div><div class="muted md">You get a code to share.</div><button type="button" id="ptCreate">Create lobby</button></div>' +
      '<div class="mode"><div class="mt">Join a lobby</div><div class="muted md">Enter the code from your host.</div>' +
        '<form id="ptJoinForm" autocomplete="off"><input type="text" id="ptCode" placeholder="Code" maxlength="4" autocapitalize="characters" spellcheck="false" aria-label="Lobby code"><button class="ghost">Join</button></form></div>' +
    '</div>' +
    '<div class="parsed" id="ptMsg" role="status" style="color:var(--warn)"></div>' +
  '</div>' +
  '<div class="pt" id="ptRoom" hidden>' +
    '<div class="card" id="ptMain"></div>' +
    '<div class="pt-side">' +
      '<div class="panel" id="ptPlayers"></div>' +
      '<div class="panel"><div class="phd"><h2>Chat</h2></div><div class="pt-log" id="ptLog" aria-live="polite"></div>' +
        '<form class="pt-say" id="ptSay" autocomplete="off"><input type="text" id="ptText" maxlength="200" placeholder="Message" aria-label="Chat message"><button class="ghost sm">Send</button></form></div>' +
    '</div>' +
  '</div>';

async function post(path, body){
  const r = await fetch('/api/party/' + path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Try again.'), { j });
  return j;
}
const remember = c => { try { if (c) localStorage.setItem(saveKey, c); else localStorage.removeItem(saveKey); } catch (e) {} };
const say = t => { $('ptMsg').textContent = t || ''; };
// Leaving the page while a question is open and not yet answered is reported; the server keeps the count for admin accounts.
let goneOff = false;
const wentOff = () => { if (goneOff || !S || !code || S.phase !== 'question' || S.myGuess != null || location.hash !== '#party') return; goneOff = true; post(code + '/away').catch(() => {}); };
document.addEventListener('visibilitychange', () => { if (document.hidden) wentOff(); else goneOff = false; });
window.addEventListener('blur', wentOff); window.addEventListener('focus', () => { goneOff = false; });
const awayPill = p => (p.away && localStorage.getItem('bp_dev') === '1' ? ' <span class="pill" title="Left the page during a question">left ' + p.away + '×</span>' : '');

// ---------------------------------------------------------------- joining and leaving
function connect(c){
  if (es) es.close();
  code = c; remember(c); drawn = ''; before = null; chatSeen = 0; $('ptLog').innerHTML = ''; say('');
  es = new EventSource('/api/party/' + c + '/events');
  es.addEventListener('state', e => { S = JSON.parse(e.data); draw(); });
  es.addEventListener('gone', () => left('That lobby was closed.'));
  // The browser reconnects by itself after a network hiccup. If it gives up, the lobby is probably gone: ask once.
  es.onerror = () => { if (es && es.readyState === 2 && code === c) post(c + '/join').then(() => connect(c)).catch(() => left('That lobby no longer exists.')); };
}
async function join(c){
  c = String(c || '').trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(c)) throw new Error('A lobby code has four letters.');
  await post(c + '/join'); connect(c);
}
function left(msg){
  if (es) { es.close(); es = null; }
  code = null; S = null; remember(null); cancelAnimationFrame(clock); clock = 0; clockRound = 0; closePodium(true);
  $('ptRoom').hidden = true; $('ptStart').style.display = '';
  say(msg);
}

// ---------------------------------------------------------------- drawing
function draw(){
  if (!S) return;
  $('ptStart').style.display = 'none'; $('ptRoom').hidden = false;
  drawPlayers(); drawChat();
  // The middle is only rebuilt when the situation changes, so typing is never interrupted by other players' updates.
  const key = [S.phase, S.round, S.myGuess != null, S.isHost, S.phase === 'lobby' ? S.rounds + '/' + S.seconds + '/' + S.drinks + '/' + S.host + '/' + S.gamesLeft + '/' + S.mode : '',
    S.phase === 'bet' ? JSON.stringify(S.myBet) : '', S.phase === 'reveal' && S.reveal.mode === 'bets' ? S.reveal.rows.map(r => r.sips + ':' + r.give).join() : ''].join('|');
  if (key !== drawn) { drawn = key; drawMain(); }
  if (S.phase === 'question' || S.phase === 'bet') {
    // Every update says how much time is left. Network delay can only make that look later than it really is,
    // so within one question the earliest deadline is the true one and the bar never jumps back.
    const d = performance.now() + S.left;
    const ck = S.phase + S.round;                   // guessing and betting are two clocks in one round
    deadline = clockRound === ck ? Math.min(deadline, d) : d; clockRound = ck;
    cancelAnimationFrame(clock); tickClock();
  } else { cancelAnimationFrame(clock); clock = 0; clockRound = 0; }
  // the podium is shown once, at the moment the last question turns into the final result (not after a reload)
  if (S.phase === 'final' && before === 'reveal' && location.hash === '#party') showPodium();
  else if (S.phase !== 'final') closePodium(true);
  before = S.phase;
}
// The bar is redrawn on every screen frame and only scaled, which the browser can do without re-laying out the page.
function tickClock(){
  clock = 0;
  if (!S || (S.phase !== 'question' && S.phase !== 'bet')) return;
  const ms = Math.max(0, deadline - performance.now()), bar = $('ptBar'), txt = $('ptLeft');
  if (bar) bar.style.transform = 'scaleX(' + (ms / ((S.phase === 'bet' ? S.betSeconds : S.seconds) * 1000)).toFixed(4) + ')';
  const s = Math.ceil(ms / 1000) + 's';
  if (txt && txt.textContent !== s) txt.textContent = s;
  if (ms > 0) clock = requestAnimationFrame(tickClock);
}
// Places come from the scores the server sent. Equal scores share a place.
const ranking = () => { const r = S.players.slice().sort((a, b) => b.score - a.score); r.forEach(p => { p.place = 1 + r.filter(x => x.score > p.score).length; }); return r; };
let podEl = null, podTimer = 0;
function showPodium(){
  closePodium(true);
  const top = ranking().slice(0, 3), n = top.length;
  if (!n) return;
  // on screen: second, first, third. They appear from the lowest place up.
  const col = (p, i) => '<div class="pd-col p' + p.place + (p.id === S.you ? ' me' : '') + '" style="--d:' + (0.25 + (n - 1 - i) * 0.6).toFixed(2) + 's">' +
    '<div class="pd-who"><i class="pd-medal"></i><b>' + E(p.name) + '</b><span>' + p.score + '</span></div><div class="pd-step">' + p.place + '</div></div>';
  podEl = document.createElement('div'); podEl.className = 'pd-back'; podEl.setAttribute('aria-hidden', 'true');   // the same result is in the table underneath
  podEl.innerHTML = '<div class="pd" style="--n:' + n + '">' + [1, 0, 2].filter(i => i < n).map(i => col(top[i], i)).join('') + '</div>';
  podEl.addEventListener('click', () => closePodium());
  document.body.appendChild(podEl);
  box.classList.add('pd-wait');   // the result underneath stays hidden until the podium has told it
  podTimer = setTimeout(closePodium, 6000);
}
function closePodium(now){
  clearTimeout(podTimer);
  const el = podEl; if (!el) return; podEl = null;
  box.classList.remove('pd-wait');
  if (now === true) { el.remove(); return; }
  el.classList.add('out'); setTimeout(() => el.remove(), 300);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePodium(); });
const nameOf = id => { const p = S.players.find(x => x.id === id); return p ? p.name : ''; };
const leaveBtn = '<button type="button" class="ghost sm" data-act="leave">Leave</button>';
// Who drinks is worked out by the server with the points. This only explains it.
const drinkRules = '<p class="pt-rule">Furthest off takes 2 sips. No guess takes 2. A guess within 10% makes everyone else take 1.<br>Adults only. Water counts.</p>';
const betRule = '<p class="pt-rule">Guess, then bet 1 to 3 on the guess you think is closest. Fewer backers pay more.</p>';
const betDrinkRules = '<p class="pt-rule">The stake is sips. Lose a bet: drink it. Win: hand it out. No bet: 1 sip.<br>Adults only. Water counts.</p>';
const rules = () => (S.mode === 'bets' ? betRule : '') + (S.drinks ? (S.mode === 'bets' ? betDrinkRules : drinkRules) : '');
const signed = n => (n > 0 ? '+' : n < 0 ? '\u2212' : '') + Math.abs(n);
const head = () => '<div class="mlhead" style="margin-bottom:18px"><span>Question ' + S.round + ' of ' + S.rounds + '</span>' + leaveBtn + '</div>';

function drawMain(){
  const m = $('ptMain');
  if (S.phase === 'lobby') {
    const opts = (list, cur, attr, unit) => '<div class="opts">' + list.map(v => '<button type="button" class="ghost' + (v === cur ? ' sel' : '') + '" ' + attr + '="' + v + '">' + v + unit + '</button>').join('') + '</div>';
    m.innerHTML = '<div class="navrow"><h2>Lobby</h2>' + leaveBtn + '</div>' +
      '<div class="pt-code"><span>Code</span><b>' + E(S.code) + '</b><button type="button" class="ghost sm" id="ptCopy">Copy invite link</button></div>' +
      (S.isHost
        ? '<div class="pt-set"><span class="pt-lbl">Game</span><div class="opts">' + [['closest', 'Closest guess'], ['bets', 'Bets']].map(o => '<button type="button" class="ghost' + (S.mode === o[0] ? ' sel' : '') + '" data-mode="' + o[0] + '" aria-pressed="' + (S.mode === o[0]) + '">' + o[1] + '</button>').join('') + '</div>' +
            '<span class="pt-lbl">Questions</span>' + opts(ROUNDS, S.rounds, 'data-rounds', '') + '<span class="pt-lbl">Time per question</span>' + opts(SECONDS, S.seconds, 'data-seconds', ' s') +
            '<span class="pt-lbl">Drinks</span><div class="opts">' + [[0, 'Off'], [1, 'On']].map(o => '<button type="button" class="ghost' + (!!o[0] === S.drinks ? ' sel' : '') + '" data-drinks="' + o[0] + '">' + o[1] + '</button>').join('') + '</div>' +
            rules() + '</div>' +
          '<button type="button" data-act="start" id="ptGo">Start game</button>'
        : '<p class="lead" style="margin:0">' + (S.mode === 'bets' ? 'Bets: ' : '') + S.rounds + ' questions, ' + S.seconds + ' s each. Waiting for <b>' + E(nameOf(S.host)) + '</b> to start.</p>' + rules());
    if (window.bpPlus) window.bpPlus.tag($('ptGo'), S.gamesLeft);           // the host's free party games (null: no limit)
  } else if (S.phase === 'question') {
    m.innerHTML = head() +
      '<div class="timerrow"><div class="timer"><i id="ptBar"></i></div><span class="mono tleft" id="ptLeft"></span></div>' +
      '<p class="q">' + E(S.q.text) + '</p>' +
      '<div class="unitbadge"><span class="ul">Answer in</span><span class="uv">' + E(S.q.unit) + '</span></div>' +
      (S.myGuess == null
        ? '<form id="ptGuess" autocomplete="off"><div class="ingroup"><input type="text" id="ptInp" placeholder="Your estimate" inputmode="text" aria-label="Your estimate"><span class="insuffix">' + E(S.q.unit) + '</span></div><button>Guess</button></form>' +
          '<div class="parsed muted mono" id="ptParsed"></div>'
        : '<div class="cbox" style="max-width:340px"><div class="cl">Your guess</div><div class="cv mono">' + E(fmt(S.myGuess)) + '</div></div><p class="muted" style="margin:14px 0 0">Waiting for the others.</p>');
    const inp = $('ptInp'); if (inp && location.hash === '#party') inp.focus();
  } else if (S.phase === 'bet') {
    if (betRound !== S.round) { betRound = S.round; betOn = null; betStake = 1; }
    const mine = S.myBet, chosen = mine ? mine.on : betOn;
    const opt = o => '<button type="button" class="pt-opt' + (chosen === o.id ? ' sel' : '') + '" data-on="' + E(o.id) + '" aria-pressed="' + (chosen === o.id) + '"' + (mine ? ' disabled' : '') + '>' +
      '<b class="mono">' + E(fmt(o.guess)) + '</b><span>' + (o.id === S.you ? 'You' : E(o.name)) + '</span></button>';
    m.innerHTML = head() + '<div class="timerrow"><div class="timer"><i id="ptBar"></i></div><span class="mono tleft" id="ptLeft"></span></div>' +
      '<p class="q">' + E(S.q.text) + '</p>' +
      '<p class="pt-lbl" style="margin:0 0 8px">Back the closest guess, in ' + E(S.q.unit) + '</p><div class="pt-opts">' + S.options.map(opt).join('') + '</div>' +
      (mine ? '<p class="muted" style="margin:16px 0 0">You bet ' + mine.stake + ' on ' + (mine.on === S.you ? 'your own guess' : E(nameOf(mine.on)) + '\'s guess') + '. Waiting for the others.</p>'
        : '<div class="pt-stake"><span class="pt-lbl">Stake</span><div class="opts">' + [1, 2, 3].map(n => '<button type="button" class="ghost' + (betStake === n ? ' sel' : '') + '" data-stake="' + n + '" aria-pressed="' + (betStake === n) + '">' + n + '</button>').join('') + '</div>' +
          '<button type="button" data-act="bet"' + (betOn ? '' : ' disabled') + '>Bet ' + betStake + (S.drinks ? (betStake === 1 ? ' sip' : ' sips') : '') + '</button></div><div class="parsed muted" id="ptParsed"></div>');
  } else if (S.phase === 'reveal' && S.reveal.mode === 'bets') {
    const R = S.reveal, win = R.rows.filter(r => r.winner), me = R.rows.find(r => r.id === S.you);
    const names = win.map(r => r.id === S.you ? 'you' : E(r.name)).join(', ');
    const rows = R.rows.map(r => '<tr' + (r.id === S.you ? ' class="meRow"' : '') + '><td><b>' + E(r.name) + '</b>' + (r.winner ? ' <span class="pill">closest</span>' : '') +
        (r.sips ? ' <span class="pill pt-sips">' + r.sips + (r.sips === 1 ? ' sip' : ' sips') + '</span>' : '') + (r.give ? ' <span class="pill">hands out ' + r.give + '</span>' : '') + '</td>' +
      '<td>' + (r.guess == null ? '<span class="muted">No guess</span>' : E(fmt(r.guess))) + '</td>' +
      '<td>' + (r.bet ? r.bet.stake + ' on ' + (r.bet.on === r.id ? 'own' : E(r.bet.onName)) : '<span class="muted">No bet</span>') + '</td>' +
      '<td style="text-align:right"><b class="' + (r.pts > 0 ? 'pt-up' : r.pts < 0 ? 'pt-down' : '') + '">' + signed(r.pts) + '</b></td></tr>').join('');
    const others = S.players.filter(p => p.id !== S.you);
    m.innerHTML = head() + '<p class="q" style="min-height:0">' + E(S.q.text) + '</p>' +
      '<div class="cmp"><div class="cbox ans"><div class="cl">Correct answer</div><div class="cv mono">' + E(fmt(R.answer)) + ' <span class="pt-unit">' + E(S.q.unit) + '</span></div></div>' +
      '<div class="cbox"><div class="cl">Closest guess</div><div class="cv mono">' + (win.length ? E(fmt(win[0].guess)) : '<span class="muted">None</span>') + '</div><div class="muted pt-paid">' + (win.length ? names + (R.odds ? ', paid \u00d7' + R.odds : ', nobody backed it') : '') + '</div></div></div>' +
      (S.drinks && me && me.give ? '<div class="pt-give"><span class="pt-lbl">Hand out ' + me.give + (me.give === 1 ? ' sip' : ' sips') + '</span><div class="opts">' + others.map(p => '<button type="button" class="ghost sm" data-give="' + E(p.id) + '">' + E(p.name) + '</button>').join('') + '</div></div>' : '') +
      '<div style="overflow-x:auto;margin-top:14px"><table class="ft"><thead><tr><th>Player</th><th>Guess</th><th>Bet</th><th style="text-align:right">Points</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (R.note ? '<div class="fact">' + E(R.note) + '</div>' : '') +
      '<div class="nextrow"><span></span>' + (S.isHost ? '<button type="button" data-act="next">' + (R.last ? 'Final result' : 'Next question') + '</button>' : '<span class="muted">Waiting for ' + E(nameOf(S.host)) + '.</span>') + '</div>';
  } else if (S.phase === 'reveal') {
    const R = S.reveal, mine = R.rows.find(r => r.id === S.you);
    // the scale: the answer in the middle, every guess placed by how many times too high or too low it was
    const span = Math.min(3, Math.max(1, Math.ceil(Math.max(0, ...R.rows.filter(r => r.guess != null).map(r => r.err)))));
    const dots = R.rows.filter(r => r.guess != null).map(r => {
      const x = 50 + 50 * Math.max(-1, Math.min(1, Math.log10(r.guess / R.answer) / span));
      return '<span class="pt-dot' + (r.id === S.you ? ' me' : '') + '" style="left:' + x.toFixed(1) + '%" title="' + E(r.name) + ': ' + E(fmt(r.guess)) + '">' + E(r.name.slice(0, 1).toUpperCase()) + '</span>';
    }).join('');
    const far = Math.pow(10, span).toLocaleString('en-US') + '×';
    const rows = R.rows.map((r, i) => '<tr' + (r.id === S.you ? ' class="meRow"' : '') + '><td>' + (r.guess == null ? '' : i + 1) + '</td><td><b>' + E(r.name) + '</b>' + (r.sips ? ' <span class="pill pt-sips">' + r.sips + (r.sips === 1 ? ' sip' : ' sips') + '</span>' : '') + '</td>' +
      '<td>' + (r.guess == null ? '<span class="muted">No guess</span>' : E(fmt(r.guess))) + '</td><td>' + (r.guess == null ? '' : E(ratioText(r.guess, R.answer))) + '</td>' +
      '<td style="text-align:right"><b>+' + (r.pts + r.bonus) + '</b>' + (r.bonus ? ' <span class="pill">closest</span>' : '') + '</td>' + '</tr>').join('');
    m.innerHTML = head() + '<p class="q" style="min-height:0">' + E(S.q.text) + '</p>' +
      '<div class="cmp"><div class="cbox ans"><div class="cl">Correct answer</div><div class="cv mono">' + E(fmt(R.answer)) + ' <span class="pt-unit">' + E(S.q.unit) + '</span></div></div>' +
      '<div class="cbox"><div class="cl">Your guess</div><div class="cv mono">' + (mine && mine.guess != null ? E(fmt(mine.guess)) : '<span class="muted">None</span>') + '</div></div></div>' +
      '<div class="pt-scale" aria-hidden="true"><i class="pt-ans"></i>' + dots + '<div class="pt-ends"><span>' + far + ' lower</span><span>answer</span><span>' + far + ' higher</span></div></div>' +
      '<div style="overflow-x:auto"><table class="ft"><thead><tr><th></th><th>Player</th><th>Guess</th><th>Off by</th><th style="text-align:right">Points</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (R.note ? '<div class="fact">' + E(R.note) + '</div>' : '') +
      '<div class="nextrow"><span></span>' + (S.isHost ? '<button type="button" data-act="next">' + (R.last ? 'Final result' : 'Next question') + '</button>' : '<span class="muted">Waiting for ' + E(nameOf(S.host)) + '.</span>') + '</div>';
  } else {
    const ranked = ranking(), winners = ranked.filter(p => p.place === 1).map(p => p.name);
    m.innerHTML = '<p class="pt-lbl" style="margin:0 0 6px">Final result</p>' +
      '<p class="pt-win">' + (winners.length > 1 ? 'Tie: ' + winners.slice(0, -1).map(E).join(', ') + ' and ' + E(winners[winners.length - 1]) : E(winners[0] || '') + ' wins') + '</p>' +
      '<table class="ft"><tbody>' + ranked.map((p, i) => '<tr' + (p.id === S.you ? ' class="meRow"' : '') + '><td style="width:44px">' + (p.place <= 3 ? '<i class="pd-rank p' + p.place + '">' + p.place + '</i>' : p.place) + '</td><td><b>' + E(p.name) + '</b>' + awayPill(p) + '</td>' + (S.drinks ? '<td class="muted" style="text-align:right">' + p.sips + (p.sips === 1 ? ' sip' : ' sips') + '</td>' : '') + '<td style="text-align:right"><b>' + p.score + '</b></td></tr>').join('') + '</tbody></table>' +
      '<div class="acts" style="margin-top:22px">' + (S.isHost ? '<button type="button" data-act="again">Play again</button>' : '') + '<button type="button" class="ghost" data-act="leave">Leave</button></div>';
  }
}
function drawPlayers(){
  const asking = S.phase === 'question' || S.phase === 'bet', lobby = S.phase === 'lobby', betting = S.phase === 'bet';
  const list = lobby ? S.players : S.players.slice().sort((a, b) => b.score - a.score);
  const done = S.players.filter(p => p.done).length;
  $('ptPlayers').innerHTML = '<div class="phd"><h2>Players</h2><span>' + (asking ? done + ' of ' + S.players.length + (betting ? ' bet' : ' answered') : E(S.code)) + '</span></div>' +
    list.map((p, i) => '<div class="prow rk' + (p.id === S.you ? ' me' : '') + '"><span class="muted">' + (lobby ? '' : i + 1) + '</span>' +
      '<span class="n">' + (asking ? '<i class="pt-in' + (p.done ? ' on' : '') + '" title="' + (p.done ? (betting ? 'Bet placed' : 'Answered') : 'Still thinking') + '"></i>' : '') + E(p.name) +
      (p.id === S.host ? '<em class="pt-tag">host</em>' : '') + (p.on ? '' : '<em class="pt-tag">away</em>') + '</span><b>' + (lobby ? '' : p.score) + '</b></div>').join('');
}
function drawChat(){
  const log = $('ptLog'), fresh = S.chat.filter(c => c.n > chatSeen);
  if (!fresh.length) return;
  fresh.forEach(c => { const d = document.createElement('div'); d.innerHTML = '<b>' + E(c.name) + '</b>' + E(c.text); log.appendChild(d); chatSeen = c.n; });
  log.scrollTop = log.scrollHeight;
}

// ---------------------------------------------------------------- what the player does
const fail = e => { const p = $('ptParsed'); if (p && S && S.phase === 'question') p.textContent = e.message; else if (window.bpToast) window.bpToast('Party', e.message, ''); };
box.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  try {
    if (b.id === 'ptCreate') { b.disabled = true; try { const j = await post('create'); await join(j.code); } finally { b.disabled = false; } }
    else if (b.id === 'ptCopy') {
      const link = location.origin + '/?party=' + code + '#party';
      try { await navigator.clipboard.writeText(link); b.textContent = 'Copied'; } catch (err) { b.textContent = link; }
      setTimeout(() => { if (b.isConnected) b.textContent = 'Copy invite link'; }, 2500);
    }
    else if (b.dataset.rounds) await post(code + '/settings', { rounds: +b.dataset.rounds });
    else if (b.dataset.seconds) await post(code + '/settings', { seconds: +b.dataset.seconds });
    else if (b.dataset.drinks) await post(code + '/settings', { drinks: b.dataset.drinks === '1' });
    else if (b.dataset.mode) await post(code + '/settings', { mode: b.dataset.mode });
    else if (b.dataset.on) { betOn = b.dataset.on; drawMain(); }
    else if (b.dataset.stake) { betStake = +b.dataset.stake; drawMain(); }
    else if (b.dataset.act === 'bet') { if (betOn) await post(code + '/bet', { on: betOn, stake: betStake }); }
    else if (b.dataset.give) await post(code + '/give', { to: b.dataset.give });
    else if (b.dataset.act === 'leave') { const c = code; left(''); await post(c + '/leave').catch(() => {}); }
    else if (b.dataset.act) await post(code + '/' + b.dataset.act);
  } catch (err) { if (window.bpPlus && window.bpPlus.limited(err.j)) return; if (code) fail(err); else say(err.message); }
});
box.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    if (e.target.id === 'ptJoinForm') await join($('ptCode').value);
    else if (e.target.id === 'ptGuess') {
      const v = parseNum($('ptInp').value);
      if (!(v > 0) || !isFinite(v)) { $('ptParsed').textContent = 'Enter a number, like 5000, 2.5 million or 3e6.'; return; }
      await post(code + '/guess', { value: v });
    }
    else if (e.target.id === 'ptSay') {
      const t = $('ptText').value.trim(); if (!t) return;
      $('ptText').value = '';
      await post(code + '/chat', { text: t });
    }
  } catch (err) { if (code) fail(err); else say(err.message); }
});
box.addEventListener('input', e => {
  if (e.target.id === 'ptCode') e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
  if (e.target.id === 'ptInp') { const v = parseNum(e.target.value); $('ptParsed').textContent = v > 0 && isFinite(v) && S && S.q ? '= ' + fmt(v) + ' ' + S.q.unit : ''; }
});

window.bpParty = { join };   // lets the Drinks page open a lobby it has just created

// ---------------------------------------------------------------- start: an invite link, or the lobby you were in before a reload
if (window.claude && window.claude.use) window.claude.use('user').then(u => u.id()).then(async id => {
  saveKey = 'bp_party_' + id;
  const invited = new URLSearchParams(location.search).get('party');
  let saved = null; try { saved = localStorage.getItem(saveKey); } catch (e) {}
  if (invited) {
    // window.history on purpose: Survival has its own variable called "history"
    try { window.history.replaceState(null, '', location.pathname + '#party'); } catch (e) {}
    if (location.hash !== '#party') location.hash = 'party'; else window.dispatchEvent(new Event('hashchange'));
    try { await join(invited); } catch (e) { say(e.message); }
  } else if (saved) { try { await join(saved); } catch (e) { remember(null); } }
}).catch(() => {});
})();
