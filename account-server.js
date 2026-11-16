// Account management: profile picture, password change, data download, log out everywhere, delete account.
// Everything here acts on the logged-in account only, and the dangerous ones ask for the password again.
//
// Profile pictures are small square images the browser has already cut and shrunk (public/account.js). The server
// still checks what it is given: only PNG, JPEG or WebP by their first bytes, and a size limit. They are kept as
// files in data/avatars, not in the database, and are only handed to the owner and the owner's friends.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

module.exports = function createAccount({ db, save, send, readBody, dataDir, hashPassword, passwordProblem, sessionToken, guard, plus, isAdmin, canSee, onDelete, reportsBy = () => [] }) {
  const DIR = path.join(dataDir, 'avatars'), MAX = 120 * 1024;
  const TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
  const file = u => path.join(DIR, u + '.img');            // usernames are [a-z0-9_-] only, so this cannot leave the folder
  const looksLike = (b, t) => t === 'png' ? b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : t === 'jpeg' ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    : b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP';
  const avatarOf = u => (db.users[u] && db.users[u].avatar && db.users[u].avatar.v) || null;
  function dropAvatar(u) { try { fs.unlinkSync(file(u)); } catch (e) {} if (db.users[u]) delete db.users[u].avatar; }
  // the password again, with the same brake on guessing as the login
  function passwordOk(req, res, user, pw) {
    const u = db.users[user];
    if (guard.blocked(req, user)) { send(res, 429, { error: 'Too many wrong passwords. Try again in 10 minutes.' }); return false; }
    const ok = typeof pw === 'string' && pw.length <= 200 && crypto.timingSafeEqual(Buffer.from(hashPassword(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) { guard.failed(req, user); send(res, 403, { error: 'That is not your current password' }); return false; }
    guard.clear(req, user); return true;
  }
  const dropSessions = (user, keep) => { for (const [t, u] of Object.entries(db.sessions)) if (u === user && t !== keep) { delete db.sessions[t]; if (db.seen) delete db.seen[t]; } };

  async function handle(req, res, url, query, user) {
    // ---- picture
    const m = url.match(/^\/api\/avatar\/([a-z0-9_\-]{2,20})$/);
    if (m && req.method === 'GET') {
      const a = canSee(user, m[1]) && db.users[m[1]] && db.users[m[1]].avatar; let data = null;      // friends only; no hint whether one exists
      if (a) try { data = fs.readFileSync(file(m[1])); } catch (e) {}
      if (!data) { send(res, 404, { error: 'no picture' }); return true; }
      // the address carries the picture's version, so a copy can be kept for a long time
      res.writeHead(200, { 'Content-Type': TYPES[a.type], 'Content-Length': data.length, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
      res.end(data); return true;
    }
    if (url === '/api/account/avatar' && req.method === 'PUT') {
      const { image } = await readBody(req);
      const d = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(typeof image === 'string' ? image : '');
      if (!d) { send(res, 400, { error: 'That is not a picture this site can use' }); return true; }
      const buf = Buffer.from(d[2], 'base64');
      if (buf.length < 100 || buf.length > MAX || !looksLike(buf, d[1])) { send(res, 400, { error: buf.length > MAX ? 'That picture is too large' : 'That is not a picture this site can use' }); return true; }
      fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file(user), buf);
      db.users[user].avatar = { type: d[1], v: Date.now() }; save();
      send(res, 200, { avatar: avatarOf(user) }); return true;
    }
    if (url === '/api/account/avatar' && req.method === 'DELETE') { dropAvatar(user); save(); send(res, 200, { avatar: null }); return true; }
    // an admin removes somebody's picture (for one that should not be shown)
    if (url === '/api/admin/avatar' && req.method === 'POST') {
      if (!isAdmin(user)) { send(res, 403, { error: 'Admins only' }); return true; }
      const who = String((await readBody(req)).user || '').toLowerCase();
      if (!db.users[who]) { send(res, 404, { error: 'No such account' }); return true; }
      dropAvatar(who); save(); send(res, 200, { ok: true }); return true;
    }

    // ---- password
    if (url === '/api/account/password' && req.method === 'POST') {
      const { current, next } = await readBody(req);
      if (!passwordOk(req, res, user, current)) return true;
      const weak = passwordProblem(next, user);
      if (weak) { send(res, 400, { error: weak.replace(/^Password: /, 'New password: ') }); return true; }
      if (next === current) { send(res, 400, { error: 'New password: it is the same as the old one' }); return true; }
      const salt = crypto.randomBytes(16).toString('hex');
      db.users[user].salt = salt; db.users[user].hash = hashPassword(next, salt);
      dropSessions(user, sessionToken(req)); save();          // every other device has to log in again
      send(res, 200, { ok: true }); return true;
    }
    if (url === '/api/account/logout-all' && req.method === 'POST') {
      dropSessions(user, sessionToken(req)); save(); send(res, 200, { ok: true }); return true;
    }

    // ---- a copy of everything stored about the account
    if (url === '/api/account/export' && req.method === 'GET') {
      const u = db.users[user];
      const out = { exported: new Date().toISOString(), account: { username: u.display, created: u.created ? new Date(u.created).toISOString() : null, picture: !!u.avatar, plus: plus.status(user) },
        saved: db.docs[user] || {}, atlas: (db.geo || {})[user] || {}, moreLess: (db.ml || {})[user] || {}, guessless: (db.gl || {})[user] || {}, wordy: (db.wd || {})[user] || {}, clueless: (db.cl || {})[user] || {}, survival: (db.sv || {})[user] || {}, drinks: (db.drinks || {})[user] || {}, leftThePage: (db.away || {})[user] || {}, freeLimits: (db.limits || {})[user] || {}, picturesYouReported: reportsBy(user) };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="ballpark-' + user + '.json"', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(out, null, 1)); return true;
    }

    // ---- delete: the account and everything saved for it. Cannot be undone.
    if (url === '/api/account/delete' && req.method === 'POST') {
      const { password } = await readBody(req);
      if (!passwordOk(req, res, user, password)) return true;
      // a running subscription has to stop first, or the money would keep being taken for an account that is gone
      try { await plus.stopRenewal(user); }
      catch (e) { console.error('Delete: could not stop the subscription of ' + user + ': ' + e.message); send(res, 502, { error: 'Your subscription could not be cancelled just now, so nothing was deleted. Try again in a moment.' }); return true; }
      dropAvatar(user);
      for (const part of ['docs', 'geo', 'ml', 'gl', 'wd', 'cl', 'sv', 'drinks', 'away', 'limits']) if (db[part]) delete db[part][user];
      dropSessions(user, null); delete db.users[user]; onDelete(user); save();
      send(res, 200, { ok: true }, { 'Set-Cookie': 'bp_session=; Path=/; Max-Age=0' }); return true;
    }
    return false;
  }
  return { handle, avatarOf, dropAvatar: u => { dropAvatar(u); save(); } };
};
