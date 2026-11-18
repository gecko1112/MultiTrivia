// Drinks, browser side: the page that collects the drinking games.
//
// One-phone games (Over or under, Flag round) are dealt and judged by the server (drinks-server.js);
// this file draws the table and reports what the player on turn answered. In the Flag round the players can also
// say the country out loud: the phone shows it after "Show answer" and the table taps Correct or Wrong. The lobby game is the
// Party mode with its drinks rules switched on.
(function(){
'use strict';
const box = document.getElementById('g-drinks'); if (!box) return;
const $ = id => document.getElementById(id);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GAMES = {
  overunder: { t: 'Over or under', d: 'One phone, passed around. Is the real number more or less? Wrong means drink.' },
  flags: { t: 'Flag round', d: 'One phone, passed around. Name the country or drink.' }
};
const RULES = 'Wrong: 2 sips. Three right in a row: everyone else takes 1.';

let T = null;            // the table, exactly as the server describes it
let names = [], pending = null, busy = false;
let say = false;         // Flag round: answers said out loud (the table taps Correct or Wrong) instead of typed
// Remembered on this device only, as a convenience: who sat at the table last time, and that the age note was confirmed.
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const kept = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
try { names = JSON.parse(kept('bp_drinks_names') || '[]').filter(n => typeof n === 'string').slice(0, 12); } catch (e) {}
say = kept('bp_drinks_say') === '1';

async function api(path, body){
  const r = await fetch('/api/drinks/' + path, body ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'same-origin' });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
  return j;
}
const card = html => { box.innerHTML = '<div class="card">' + html + '</div>'; };
const note = t => { const m = $('dkMsg'); if (m) m.textContent = t || ''; };

// ---------------------------------------------------------------- start page
function hub(){
  T = null; pending = null;
  if (kept('bp_drinks_ok') !== '1') return card('<h2 class="gh">Drinks</h2><p class="lead">Drinking games are for adults. Water counts just as well.</p><button type="button" data-act="adult">I am 18 or older</button>');
  card('<h2 class="gh">Drinks</h2><div class="modes at-modes">' +
    '<div class="mode"><div class="mt">Lobby</div><div class="muted md">Everyone on their own phone. Closest guess, or bet sips on the guesses.</div><div class="acts"><button type="button" data-act="lobby">Create lobby</button></div></div>' +
    Object.keys(GAMES).map(g => '<div class="mode"><div class="mt">' + GAMES[g].t + '</div><div class="muted md">' + GAMES[g].d + '</div><div class="acts"><button type="button" data-game="' + g + '">Play</button></div></div>').join('') +
    '</div><div class="parsed" id="dkMsg" role="status" style="color:var(--warn)"></div><div id="dkBadges"></div>');
  badges();
}
// Badges: a separate set of achievements just for the drinking games. Counted by the server, no XP.
const cheer = list => (list || []).forEach(b => { if (window.bpToast) window.bpToast('Drinks badge', b.name, b.desc, null, true); });
async function badges(){
  let j; try { j = await api('badges'); } catch (e) { return; }
  cheer(j.fresh);
  const el = $('dkBadges'); if (!el) return;
  el.innerHTML = '<h3 class="fh">Badges <span class="muted" style="font:500 13px var(--body);letter-spacing:0;text-transform:none">' + j.badges.filter(b => b.got).length + ' of ' + j.badges.length + '</span></h3><div class="ach-grid">' +
    j.badges.map(b => '<div class="ach' + (b.got ? ' got' : '') + '"><span class="mk" aria-hidden="true"></span><div><b>' + E(b.name) + '</b><p>' + E(b.desc) + '</p>' +
      (!b.got && b.need > 1 ? '<div class="pg" title="' + b.have + ' of ' + b.need + '"><i style="width:' + Math.round(100 * b.have / b.need) + '%"></i></div>' : '') + '</div></div>').join('') + '</div>';
}
function setup(game){
  pending = game;
  card('<div class="mlhead"><span>' + GAMES[game].t + '</span><button type="button" class="ghost sm" data-act="hub">All games</button></div>' +
    '<p class="pt-lbl" style="margin:18px 0 10px">Who is at the table</p><div class="dk-names" id="dkNames"></div>' +
    '<form id="dkAdd" autocomplete="off"><input type="text" id="dkName" maxlength="16" placeholder="Name" aria-label="Player name" autocapitalize="words" spellcheck="false"><button class="ghost">Add</button></form>' +
    (game === 'flags' ? '<p class="pt-lbl" id="dkHowLbl" style="margin:20px 0 10px">How players answer</p><div class="seg" role="group" aria-labelledby="dkHowLbl">' +
      '<button type="button" data-say="0" aria-pressed="' + !say + '">Type it</button><button type="button" data-say="1" aria-pressed="' + say + '">Say it</button></div>' : '') +
    '<div class="parsed" id="dkMsg" role="status" style="color:var(--warn)"></div>' +
    '<p class="pt-rule" style="margin:14px 0 20px">' + RULES + '</p><button type="button" data-act="start">Start</button>');
  drawNames(); $('dkName').focus();
}
function drawNames(){
  $('dkNames').innerHTML = names.map((n, i) => '<span class="dk-name">' + E(n) + '<button type="button" data-drop="' + i + '" aria-label="Remove ' + E(n) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>').join('');
  keep('bp_drinks_names', JSON.stringify(names));
}

// ---------------------------------------------------------------- the table
function draw(){
  const p = T.players[T.turn], asking = T.phase === 'ask', L = T.last, judged = T.phase === 'result';
  let mid;
  if (T.game === 'overunder') {
    mid = '<p class="q" style="min-height:0">' + E(T.q.text) + '</p>' +
      (asking
        ? '<p class="dk-shown">More or less than <b>' + E(fmt(T.q.shown)) + '</b> ' + E(T.q.unit) + '?</p><div class="dk-two"><button type="button" data-choice="less">Less</button><button type="button" data-choice="more">More</button></div>'
        : '<p class="dk-shown">It is <b>' + E(fmt(L.answer)) + '</b> ' + E(T.q.unit) + ', ' + (L.answer > T.q.shown ? 'more' : 'less') + ' than ' + E(fmt(T.q.shown)) + '.</p>' + (L.note ? '<div class="fact" style="margin:0 0 6px">' + E(L.note) + '</div>' : ''));
  } else {
    mid = '<div class="at-stage"><img class="at-flag" src="' + E(T.q.img) + '" alt=""></div>' +
      (T.say
        // said out loud: the player says it, the phone shows the country, the table says whether it was right
        ? (asking ? '<button type="button" class="dk-wide" data-act="reveal">Show answer</button>'
          : T.phase === 'judge' ? '<p class="dk-shown"><b>' + E(T.q.name) + '</b></p><div class="dk-two"><button type="button" data-right="0">Wrong</button><button type="button" data-right="1">Correct</button></div>'
          : '<p class="dk-shown"><b>' + E(L.name) + '</b></p>')
        : asking
          ? '<form id="dkAnswer" autocomplete="off"><input type="text" id="dkText" placeholder="Country" aria-label="Country" maxlength="60" autocapitalize="words" autocorrect="off" spellcheck="false"><button>Guess</button><button type="button" class="ghost" data-act="pass">No idea</button></form>'
          : '<p class="dk-shown"><b>' + E(L.name) + '</b></p>');
  }
  const verdict = !judged ? '' : '<p class="dk-verdict ' + L.kind + '">' +
    (L.kind === 'wrong' ? E(p.name) + ' drinks ' + L.drinks[0].sips : L.kind === 'streak' ? 'Everyone else drinks ' + L.drinks[0].sips : 'Safe') + '</p>';
  const next = T.players[(T.turn + 1) % T.players.length].name;
  card('<div class="mlhead"><span>' + GAMES[T.game].t + ', round ' + T.round + '</span><button type="button" class="ghost sm" data-act="end">End game</button></div>' +
    '<p class="dk-turn"><span class="pt-lbl">Turn</span><b>' + E(p.name) + '</b></p>' + mid + verdict +
    (!judged ? '' : '<div class="nextrow" style="margin-top:14px"><span></span><button type="button" data-act="next">Next: ' + E(next) + '</button></div>') +
    '<div class="parsed" id="dkMsg" role="status" style="color:var(--warn)"></div>' +
    '<div class="dk-tally">' + T.players.map((q, i) => '<div class="' + (i === T.turn ? 'on' : '') + '"><span>' + E(q.name) + '</span><i aria-label="' + q.streak + ' right in a row">' + '●'.repeat(q.streak) + '</i><b>' + q.sips + '</b></div>').join('') + '</div>');
  const inp = $('dkText'); if (inp && location.hash === '#drinks') inp.focus();
}
async function send(path, body){
  if (busy) return; busy = true;
  try { const j = await api(path, body || {}); if (j.none) hub(); else { T = j; draw(); cheer(j.fresh); } }
  catch (e) { note(e.message); }
  busy = false;
}

// ---------------------------------------------------------------- what the players do
box.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'adult') { keep('bp_drinks_ok', '1'); return hub(); }
  if (a === 'hub') return hub();
  if (b.dataset.game) return setup(b.dataset.game);
  if (b.dataset.drop) { names.splice(+b.dataset.drop, 1); return drawNames(); }
  if (b.dataset.say) {                                  // Flag round: type or say (remembered on this phone)
    say = b.dataset.say === '1'; keep('bp_drinks_say', say ? '1' : '0');
    box.querySelectorAll('[data-say]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.say === b.dataset.say))); return;
  }
  if (a === 'start') return send('start', { game: pending, players: names, say: pending === 'flags' && say });
  if (a === 'reveal') return send('reveal');
  if (b.dataset.right) return send('answer', { right: b.dataset.right === '1' });
  if (b.dataset.choice) return send('answer', { choice: b.dataset.choice });
  if (a === 'pass') return send('answer', { text: '' });
  if (a === 'next') return send('next');
  if (a === 'end') return send('end');
  if (a === 'lobby' && !busy) {                       // the Party lobby, with its drinks rules already on
    busy = true;
    try {
      const post = async (p, body) => { const r = await fetch('/api/party/' + p, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'Could not open a lobby.'), { j }); return j; };
      const { code } = await post('create'); await post(code + '/join'); await post(code + '/settings', { drinks: true });
      location.hash = 'party'; await window.bpParty.join(code);
    } catch (err) { if (!(window.bpPlus && window.bpPlus.limited(err.j))) note(err.message); }
    busy = false;
  }
});
box.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'dkAdd') {
    const n = $('dkName').value.replace(/\s+/g, ' ').trim().slice(0, 16); if (!n) return;
    if (names.some(x => x.toLowerCase() === n.toLowerCase())) return note('That name is already at the table.');
    if (names.length >= 12) return note('At most 12 players.');
    names.push(n); $('dkName').value = ''; note(''); drawNames();
  }
  if (e.target.id === 'dkAnswer') { const t = $('dkText').value.trim(); if (!t) return note('Type the country, or say you have no idea.'); send('answer', { text: t }); }
});

// a game that is still on the server's table is picked up again, also after a reload
const onRoute = async () => {
  if (location.hash !== '#drinks' || T) return;
  try { const j = await api('state'); if (!j.none) { T = j; draw(); return cheer(j.fresh); } } catch (e) {}
  if (!pending) hub();
};
window.addEventListener('hashchange', onRoute);
if (window.claude && window.claude.use) window.claude.use('user').then(u => u.id()).then(onRoute).catch(() => {}); else onRoute();
})();
