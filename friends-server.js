// Friends: who may see whose results and picture.
//
// A player sees the daily results, leaderboards, head-to-head record and profile picture of friends only. Becoming
// friends takes both sides: one sends a request (by username or by the other's friend code), the other accepts.
// Everything is kept with the account:
//   users[name].friends  { otherName: since }      the same entry exists on both sides
//   users[name].reqOut   { otherName: when }       requests I sent that are still open
//   users[name].reqIn    { otherName: when }       requests waiting for my answer
//   users[name].code     the friend code, made the first time it is asked for
//
// The accounts that existed when this was introduced were one friend group that saw each other anyway, so they are
// made friends with each other once (db.friendsInit). Accounts created later start with no friends.
//
// BP_FRIENDS=everyone switches the whole idea off: everybody sees everybody. Meant for a private server and the tests.
const crypto = require('crypto');

module.exports = function createFriends({ db, save, send, readBody, avatarOf }) {
  const OPEN = process.env.BP_FRIENDS === 'everyone';
  const MAX_FRIENDS = 300, MAX_OPEN = 30, TRIES = 40, HOUR = 60 * 60 * 1000;
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';         // no 0/O, 1/I/L
  const U = n => db.users[n];
  const map = (n, k) => (U(n)[k] = U(n)[k] || {});

  if (!db.friendsInit) {
    const all = Object.keys(db.users), now = Date.now();
    for (const a of all) for (const b of all) if (a !== b) map(a, 'friends')[b] = map(a, 'friends')[b] || now;
    db.friendsInit = now; save();
    if (all.length > 1) console.log('  Friends: the ' + all.length + ' existing accounts are now friends with each other.');
  }

  const areFriends = (a, b) => a === b || OPEN || !!(U(a) && U(b) && (U(a).friends || {})[b]);
  // me and my friends: the people whose results I may see
  const circle = user => OPEN ? Object.keys(db.users) : [user].concat(Object.keys((U(user) && U(user).friends) || {}).filter(n => U(n)));
  function codeOf(user) {
    const u = U(user);
    if (!u.code) { const taken = new Set(Object.values(db.users).map(x => x.code)); do { u.code = Array.from(crypto.randomBytes(8), b => ALPHABET[b % ALPHABET.length]).join(''); } while (taken.has(u.code)); save(); }
    return u.code;
  }
  const card = n => ({ id: n, name: U(n).display || n, av: avatarOf(n) });
  const list = (user, k, withPic) => Object.keys(U(user)[k] || {}).filter(n => U(n)).sort().map(n => withPic ? card(n) : { id: n, name: U(n).display || n });
  const view = user => ({ code: codeOf(user), open: OPEN, friends: list(user, 'friends', true), incoming: list(user, 'reqIn'), outgoing: list(user, 'reqOut') });
  function link(a, b) {
    const now = Date.now(); map(a, 'friends')[b] = now; map(b, 'friends')[a] = now;
    for (const [x, y] of [[a, b], [b, a]]) { delete map(x, 'reqIn')[y]; delete map(x, 'reqOut')[y]; }
  }
  // An account is deleted: it disappears from everybody's lists.
  function forget(user) {
    for (const u of Object.values(db.users)) for (const k of ['friends', 'reqIn', 'reqOut']) if (u[k]) delete u[k][user];
  }
  // a brake on trying out names and codes
  const tries = new Map();
  const mayTry = user => { const t = tries.get(user); if (!t || Date.now() - t.t > HOUR) tries.set(user, { n: 0, t: Date.now() }); const c = tries.get(user); c.n++; return c.n <= TRIES; };
  setInterval(() => { const now = Date.now(); for (const [k, t] of tries) if (now - t.t > HOUR) tries.delete(k); }, 10 * 60 * 1000).unref();

  async function handle(req, res, url, query, user) {
    if (!url.startsWith('/api/friends')) return false;
    if (url === '/api/friends' && req.method === 'GET') { send(res, 200, view(user)); return true; }
    if (req.method !== 'POST') return false;
    const body = await readBody(req);

    if (url === '/api/friends/add') {
      if (!mayTry(user)) { send(res, 429, { error: 'Too many tries. Wait an hour.' }); return true; }
      const text = String(body.who || '').trim().slice(0, 40);
      const asCode = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
      let other = /^[A-Za-z0-9_\-]{2,20}$/.test(text) && U(text.toLowerCase()) ? text.toLowerCase() : null;
      if (!other && asCode.length === 8) other = Object.keys(db.users).find(n => U(n).code === asCode) || null;
      if (!other) { send(res, 404, { error: 'No player with that name or friend code' }); return true; }
      if (other === user) { send(res, 400, { error: 'That is you' }); return true; }
      if ((U(user).friends || {})[other]) { send(res, 409, { error: 'You are already friends with ' + (U(other).display || other) }); return true; }
      if (Object.keys(U(user).friends || {}).length >= MAX_FRIENDS) { send(res, 400, { error: 'Your friends list is full' }); return true; }
      if ((U(user).reqIn || {})[other]) { link(user, other); save(); send(res, 200, Object.assign({ now: 'friends', name: U(other).display || other }, view(user))); return true; }   // they had asked already
      if (!(U(user).reqOut || {})[other]) {
        if (Object.keys(U(user).reqOut || {}).length >= MAX_OPEN) { send(res, 400, { error: 'Too many open requests. Wait for answers or take some back.' }); return true; }
        map(user, 'reqOut')[other] = Date.now(); map(other, 'reqIn')[user] = Date.now(); save();
      }
      send(res, 200, Object.assign({ now: 'asked', name: U(other).display || other }, view(user))); return true;
    }

    const other = String(body.user || '').toLowerCase();
    if (!U(other) || other === user) { send(res, 404, { error: 'No such player' }); return true; }
    if (url === '/api/friends/accept') {
      if (!(U(user).reqIn || {})[other]) { send(res, 400, { error: 'There is no request from that player' }); return true; }
      if (Object.keys(U(user).friends || {}).length >= MAX_FRIENDS) { send(res, 400, { error: 'Your friends list is full' }); return true; }
      link(user, other);
    } else if (url === '/api/friends/decline') { delete map(user, 'reqIn')[other]; delete map(other, 'reqOut')[user]; }
    else if (url === '/api/friends/cancel') { delete map(user, 'reqOut')[other]; delete map(other, 'reqIn')[user]; }
    else if (url === '/api/friends/remove') { delete map(user, 'friends')[other]; delete map(other, 'friends')[user]; }
    else return false;
    save(); send(res, 200, view(user)); return true;
  }
  return { handle, areFriends, circle, forget };
};
