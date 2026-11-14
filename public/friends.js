// The friends box at the top of the Friends tab: your friend code, adding somebody by username or code,
// answering requests, and the list of friends. The server decides who is a friend (friends-server.js); results and
// pictures are only shown between friends.
(function(){
'use strict';
const $ = id => document.getElementById(id);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const call = (method, url, body) => fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  .then(r => r.json().catch(() => ({})).then(j => { if (!r.ok) throw new Error(j.error || 'That did not work. Try again in a moment.'); return j; }));
const pretty = c => c.slice(0, 4) + '-' + c.slice(4);
let state = null, note = '', bad = false;

// a small number on the Friends tab while requests are waiting
function badge(){
  const tab = document.querySelector('#tabs a[data-g="friends"] .tl'); if (!tab) return;
  const n = state && !state.open ? state.incoming.length : 0;
  let b = tab.querySelector('.frn');
  if (!n) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'frn'; tab.appendChild(b); }
  b.textContent = n; b.setAttribute('aria-label', n + (n === 1 ? ' friend request' : ' friend requests'));
}
function draw(){
  const box = $('frBox'); if (!box) return;
  if (!state || state.open) { box.innerHTML = ''; return; }           // a private server where everybody sees everybody
  const av = f => window.bpAvatar ? window.bpAvatar(f.id, f.name, f.av, 24) : '';
  const row = (title, items) => items.length ? '<div class="fr-row"><span class="fr-lbl">' + title + '</span>' + items.join('') + '</div>' : '';
  box.innerHTML = '<div class="fr">' +
    '<div class="fr-head"><form id="frAdd" class="fr-add"><input type="text" id="frWho" maxlength="40" placeholder="Username or friend code" aria-label="Username or friend code" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="submit" class="sm">Add friend</button></form>' +
      '<div class="fr-code">Your friend code <b class="mono">' + pretty(state.code) + '</b><button type="button" class="ghost sm" id="frCopy">Copy</button></div></div>' +
    '<p class="fr-msg' + (bad ? ' bad' : '') + '" id="frMsg" role="status">' + E(note) + '</p>' +
    row('Wants to be your friend', state.incoming.map(f => '<span class="fr-chip">' + E(f.name) + '<button type="button" class="sm" data-fr="accept" data-u="' + E(f.id) + '">Accept</button><button type="button" class="ghost sm" data-fr="decline" data-u="' + E(f.id) + '">Decline</button></span>')) +
    row('Waiting for an answer', state.outgoing.map(f => '<span class="fr-chip">' + E(f.name) + '<button type="button" class="ghost sm" data-fr="cancel" data-u="' + E(f.id) + '">Take back</button></span>')) +
    (state.friends.length
      ? row('Friends', state.friends.map(f => '<span class="fr-chip">' + av(f) + E(f.name) + '<button type="button" class="fr-x" data-fr="remove" data-u="' + E(f.id) + '" data-n="' + E(f.name) + '" title="Remove" aria-label="Remove ' + E(f.name) + '">×</button></span>'))
      : '<p class="muted fr-none">No friends yet. Results, leaderboards and pictures are shared between friends only: give somebody your code, or add them by username.</p>') +
    '</div>';
}
async function load(){
  try { state = await call('GET', '/api/friends'); } catch (e) { return; }
  badge(); draw();
}
function say(text, isBad){ note = text || ''; bad = !!isBad; }

document.addEventListener('submit', async e => {
  if (e.target.id !== 'frAdd') return;
  e.preventDefault();
  const who = $('frWho').value.trim(); if (!who) return;
  try {
    const j = await call('POST', '/api/friends/add', { who }); state = j;
    say(j.now === 'friends' ? 'You and ' + j.name + ' are friends now.' : 'Request sent to ' + j.name + '.');
    badge(); draw(); if (j.now === 'friends' && window.onFriendsTab) window.onFriendsTab();
  } catch (err) { say(err.message, true); draw(); $('frWho').value = who; }
});
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-fr], #frCopy'); if (!b) return;
  if (b.id === 'frCopy') {
    try { await navigator.clipboard.writeText(pretty(state.code)); b.textContent = 'Copied'; } catch (err) { b.textContent = pretty(state.code); }
    setTimeout(() => { if (b.isConnected) b.textContent = 'Copy'; }, 1500); return;
  }
  const what = b.dataset.fr, user = b.dataset.u;
  // removing a friend asks first
  if (what === 'remove' && !b.dataset.sure) { b.dataset.sure = '1'; b.classList.add('sure'); b.textContent = 'Remove ' + b.dataset.n + '?'; return; }
  try {
    state = await call('POST', '/api/friends/' + what, { user });
    say(what === 'accept' ? 'Accepted.' : what === 'remove' ? 'Removed.' : '');
    badge(); draw(); if ((what === 'accept' || what === 'remove') && window.onFriendsTab) window.onFriendsTab();
  } catch (err) { say(err.message, true); draw(); }
});

window.bpFriends = { load, draw };
if (window.claude && window.claude.use) window.claude.use('user').then(u => u.id()).then(load).catch(() => {});
// requests can arrive while the page is open
setInterval(() => { if (!document.hidden && state) load(); }, 120000);
})();
