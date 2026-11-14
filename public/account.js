// The account window: profile picture, password, log out everywhere, delete account.
// (A copy of everything stored about an account is still available at /api/account/export, for data requests.)
// Opened from the name at the top right (anything marked data-account). The server does the work and asks for the
// password again before anything that cannot be undone (account-server.js).
(function(){
'use strict';
const $ = id => document.getElementById(id);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const call = (method, url, body) => fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  .then(r => r.json().catch(() => ({})).then(j => { if (!r.ok) throw new Error(j.error || 'That did not work. Try again in a moment.'); return j; }));

// A player's picture, or the first letter of the name when there is none. v is the picture's version (null = none).
window.bpAvatar = function(id, name, v, size){
  size = size || 28;
  const st = 'width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.5) + 'px';
  return v ? '<img class="av" alt="" src="/api/avatar/' + encodeURIComponent(id) + '?v=' + v + '" style="' + st + '">'
    : '<span class="av" aria-hidden="true" style="' + st + '">' + E(String(name || '?').charAt(0).toUpperCase()) + '</span>';
};

// Cut the middle square out of the chosen file and shrink it to 192 px, so only a small picture is ever uploaded.
function shrink(file){
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas'); c.width = c.height = 192;
      c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 192, 192);
      URL.revokeObjectURL(url);
      let d = c.toDataURL('image/webp', 0.85); if (d.indexOf('data:image/webp') !== 0) d = c.toDataURL('image/jpeg', 0.85);
      ok(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('That file is not a picture.')); };
    img.src = url;
  });
}

let me = null;
function paintChip(){ const el = $('chipAv'); if (el && me) el.innerHTML = window.bpAvatar(me.id, me.username, me.avatar, 26); }

async function open(){
  if (!window.bpModal) return;
  const body = window.bpModal.open({ title: 'Account', html: '<p class="muted" style="margin:0">Loading…</p>' });
  try { me = await call('GET', '/api/me'); } catch (e) { body.innerHTML = '<p class="muted" style="margin:0">Could not load your account. Try again in a moment.</p>'; return; }
  if (!body.isConnected) return;
  const since = me.created ? 'Playing since ' + new Date(me.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  body.innerHTML =
    '<div class="ac-top"><span id="acPic"></span><div><div class="ac-name">' + E(me.username) + '</div><div class="muted">' + since + '</div>' +
      '<div class="ac-row"><button type="button" class="ghost sm" id="acPick">Choose picture</button><button type="button" class="ghost sm" id="acNoPic">Remove</button></div>' +
      '<input type="file" id="acFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden></div></div>' +
    '<p class="ac-msg" id="acPicMsg" role="status"></p>' +

    '<h3 class="fh">Password</h3>' +
    '<form id="acPw" class="ac-form" autocomplete="on"><input type="text" autocomplete="username" value="' + E(me.username) + '" hidden>' +
      '<input type="password" id="acCur" placeholder="Current password" autocomplete="current-password" aria-label="Current password">' +
      '<input type="password" id="acNew" placeholder="New password, at least 10 characters" autocomplete="new-password" aria-label="New password">' +
      '<div><button type="submit" class="ghost sm">Change password</button></div></form>' +
    '<p class="ac-msg" id="acPwMsg" role="status"></p>' +

    '<h3 class="fh">Devices</h3>' +
    '<div class="ac-row"><button type="button" class="ghost sm" id="acOut">Log out</button><button type="button" class="ghost sm" id="acOutAll">Log out everywhere else</button></div>' +
    '<p class="ac-msg" id="acDevMsg" role="status"></p>' +

    '<h3 class="fh">Delete account</h3>' +
    '<div id="acDelStart"><button type="button" class="ghost sm ac-danger" id="acDel">Delete my account…</button></div>' +
    '<div class="ac-warn" id="acDelBox" hidden><b>This cannot be undone.</b>' +
      '<ul><li>All your results, statistics, streaks, your level and your achievements are deleted.</li>' +
      '<li>You disappear from your friends\' lists, tables and leaderboards.</li>' +
      (window.bpPlus && window.bpPlus.has() ? '<li>Your Plus subscription is cancelled and the time left on it is lost. A refund is only possible under the <a href="/refunds">refund policy</a>.</li>' : '') +
      '<li>Your username becomes free for anybody to take.</li></ul>' +
      '<form id="acDelForm" class="ac-form"><input type="password" id="acDelPw" placeholder="Your password, to confirm" autocomplete="current-password" aria-label="Your password, to confirm">' +
      '<div class="ac-row"><button type="submit" class="ac-kill">Delete for good</button><button type="button" class="ghost sm" id="acKeep">Keep my account</button></div></form>' +
      '<p class="ac-msg" id="acDelMsg" role="status"></p></div>';

  const say = (id, text, bad) => { const el = $(id); el.textContent = text || ''; el.classList.toggle('bad', !!bad); };
  const pic = () => { $('acPic').innerHTML = window.bpAvatar(me.id, me.username, me.avatar, 84); $('acNoPic').hidden = !me.avatar; paintChip(); };
  pic();

  // ---- picture
  $('acPick').addEventListener('click', () => $('acFile').click());
  $('acFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    say('acPicMsg', 'Uploading…');
    try { me.avatar = (await call('PUT', '/api/account/avatar', { image: await shrink(f) })).avatar; pic(); say('acPicMsg', 'Picture saved. Your friends see it too.'); }
    catch (err) { say('acPicMsg', err.message, true); }
  });
  $('acNoPic').addEventListener('click', async () => {
    try { await call('DELETE', '/api/account/avatar'); me.avatar = null; pic(); say('acPicMsg', 'Picture removed.'); } catch (err) { say('acPicMsg', err.message, true); }
  });

  // ---- password
  $('acPw').addEventListener('submit', async e => {
    e.preventDefault();
    try { await call('POST', '/api/account/password', { current: $('acCur').value, next: $('acNew').value }); $('acCur').value = $('acNew').value = ''; say('acPwMsg', 'Password changed. Your other devices have been logged out.'); }
    catch (err) { say('acPwMsg', err.message, true); }
  });

  // ---- devices
  const leave = () => { try { localStorage.removeItem('bp_owner'); localStorage.removeItem('bp_plus'); } catch (e) {} location.href = '/'; };
  $('acOut').addEventListener('click', async () => { try { await call('POST', '/api/logout'); } catch (e) {} leave(); });
  $('acOutAll').addEventListener('click', async () => {
    try { await call('POST', '/api/account/logout-all'); say('acDevMsg', 'Done. Only this device is still logged in.'); } catch (err) { say('acDevMsg', err.message, true); }
  });

  // ---- delete
  $('acDel').addEventListener('click', () => { $('acDelStart').hidden = true; $('acDelBox').hidden = false; $('acDelPw').focus(); });
  $('acKeep').addEventListener('click', () => { $('acDelBox').hidden = true; $('acDelStart').hidden = false; $('acDelPw').value = ''; say('acDelMsg'); });
  $('acDelForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('.ac-kill'); btn.disabled = true; say('acDelMsg', 'Deleting…');
    try {
      await call('POST', '/api/account/delete', { password: $('acDelPw').value });
      // nothing of the account stays behind in this browser either
      try { Object.keys(localStorage).filter(k => k.indexOf('bp_') === 0 && k !== 'bp_theme').forEach(k => localStorage.removeItem(k)); } catch (err) {}
      body.innerHTML = '<p style="margin:0">Your account has been deleted.</p>'; setTimeout(() => { location.href = '/'; }, 1500);
    } catch (err) { say('acDelMsg', err.message, true); btn.disabled = false; }
  });
}

document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('[data-account]'); if (el) { e.preventDefault(); open(); } });
window.bpAccount = { open };
if (window.claude && window.claude.use) window.claude.use('user').then(u => u.id()).then(() => call('GET', '/api/me')).then(m => { me = m; paintChip(); }).catch(() => {});
})();
