// Account management on the server: picture, password, export, log out everywhere, delete.
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const project = process.argv[2] || require('path').join(__dirname, '..'), readDb = require('./db.js').readDb, patchDb = require('./db.js').patchDb, PORT = 3989, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'acdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'admins.txt'), 'anna\n');
const wait = ms => new Promise(r => setTimeout(r, ms));
// a real, tiny PNG (1x1)
const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
const chunk = (type, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0]))), chunk('tEXt', Buffer.alloc(60, 65)), chunk('IEND', Buffer.alloc(0))]);
const url = (type, buf) => 'data:image/' + type + ';base64,' + buf.toString('base64');
(async () => {
  const out = [], ok = (n, v) => out.push([n, !!v]);
  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_ADMINS: '' }, stdio: 'ignore' }); await wait(900);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b == null ? undefined : JSON.stringify(b) }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; const buf = Buffer.from(await r.arrayBuffer()); let j = {}; try { j = JSON.parse(buf.toString()); } catch (e) {} return { s: r.status, j, buf, h: r.headers }; };
  const PW = { anna: 'kiwi-lamp-4421', ben: 'kiwi-lamp-4422', cleo: 'kiwi-lamp-4423' };
  for (const n of Object.keys(PW)) await call(n, 'POST', '/api/signup', { username: n === 'ben' ? 'Ben' : n, password: PW[n] });

  // ---- picture
  ok('no picture to begin with', (await call('ben', 'GET', '/api/me')).j.avatar === null && (await call('anna', 'GET', '/api/avatar/ben')).s === 404);
  let r = await call('ben', 'PUT', '/api/account/avatar', { image: url('png', PNG) });
  ok('a PNG is accepted', r.s === 200 && typeof r.j.avatar === 'number');
  r = await call('anna', 'GET', '/api/avatar/ben');
  ok('other players get exactly that picture, as an image that is not guessed at', r.s === 200 && r.buf.equals(PNG) && r.h.get('content-type') === 'image/png' && r.h.get('x-content-type-options') === 'nosniff');
  ok('it is not handed out without a login', (await call('nobody', 'GET', '/api/avatar/ben')).s === 401);
  ok('the friends table carries it', (await call('anna', 'GET', '/api/day?date=2026-11-13')).j.players.find(p => p.id === 'ben').av > 0);
  ok('it is a file, not part of the database', fs.existsSync(path.join(data, 'avatars', 'ben.img')));
  ok('text dressed up as a PNG is refused', (await call('ben', 'PUT', '/api/account/avatar', { image: url('png', Buffer.from('<script>alert(1)</script>'.repeat(10))) })).s === 400);
  ok('a PNG called JPEG is refused', (await call('ben', 'PUT', '/api/account/avatar', { image: url('jpeg', PNG) })).s === 400);
  ok('SVG is refused', (await call('ben', 'PUT', '/api/account/avatar', { image: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'.repeat(5)).toString('base64') })).s === 400);
  ok('too large is refused', (await call('ben', 'PUT', '/api/account/avatar', { image: url('png', Buffer.concat([PNG, Buffer.alloc(200 * 1024)])) })).s === 400);
  ok('the refused ones left the picture alone', (await call('anna', 'GET', '/api/avatar/ben')).buf.equals(PNG));
  ok('nobody can reach outside the picture folder', (await call('anna', 'GET', '/api/avatar/..%2Fdb')).s === 404 && (await call('anna', 'GET', '/api/avatar/../db.json')).s === 404);
  ok('a normal account cannot remove somebody else\'s picture', (await call('cleo', 'POST', '/api/admin/avatar', { user: 'ben' })).s === 403);
  ok('an admin can', (await call('anna', 'POST', '/api/admin/avatar', { user: 'ben' })).s === 200 && (await call('anna', 'GET', '/api/avatar/ben')).s === 404);
  await call('ben', 'PUT', '/api/account/avatar', { image: url('png', PNG) });
  ok('the owner removes it', (await call('ben', 'DELETE', '/api/account/avatar')).j.avatar === null && !fs.existsSync(path.join(data, 'avatars', 'ben.img')));

  // ---- password
  jar.ben2 = (await (async () => { const x = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'ben', password: PW.ben }) }); return x.headers.get('set-cookie').split(';')[0]; })());
  ok('a second device is logged in', (await call('ben2', 'GET', '/api/me')).s === 200);
  ok('wrong current password: refused', (await call('ben', 'POST', '/api/account/password', { current: 'nope-nope-nope', next: 'plum-chair-9917' })).s === 403);
  ok('weak new password: refused', (await call('ben', 'POST', '/api/account/password', { current: PW.ben, next: 'short' })).s === 400);
  ok('the username as password: refused', (await call('ben', 'POST', '/api/account/password', { current: PW.ben, next: 'benbenben-1234' })).s === 400);
  ok('the same password again: refused', (await call('ben', 'POST', '/api/account/password', { current: PW.ben, next: PW.ben })).s === 400);
  ok('a good one is accepted', (await call('ben', 'POST', '/api/account/password', { current: PW.ben, next: 'plum-chair-9917' })).s === 200);
  ok('this device stays logged in, the other is logged out', (await call('ben', 'GET', '/api/me')).s === 200 && (await call('ben2', 'GET', '/api/me')).s === 401);
  ok('the old password no longer works, the new one does', (await call('x1', 'POST', '/api/login', { username: 'ben', password: PW.ben })).s === 401 && (await call('ben3', 'POST', '/api/login', { username: 'ben', password: 'plum-chair-9917' })).s === 200);
  ok('log out everywhere else', (await call('ben', 'POST', '/api/account/logout-all')).s === 200 && (await call('ben3', 'GET', '/api/me')).s === 401 && (await call('ben', 'GET', '/api/me')).s === 200);

  // ---- export
  await call('ben', 'PUT', '/api/docs/x_stats', { ml: { days: { '2026-11-13': { score: 18 } } } });
  await call('ben', 'POST', '/api/away', { game: 'gl', day: new Date().toISOString().slice(0, 10) });
  r = await call('ben', 'GET', '/api/account/export');
  ok('the export holds the account\'s own data', r.s === 200 && r.j.account.username === 'Ben' && r.j.saved.x_stats.ml.days['2026-11-13'].score === 18 && Object.keys(r.j.leftThePage).length === 1 && /attachment/.test(r.h.get('content-disposition')));
  ok('and neither the password nor anybody else', !/salt|hash|anna|cleo/.test(r.buf.toString()));

  // ---- delete
  await call('anna', 'POST', '/api/admin/plus', { user: 'ben', on: true });
  await call('ben', 'PUT', '/api/account/avatar', { image: url('png', PNG) });
  ok('delete without the password: refused', (await call('ben', 'POST', '/api/account/delete', {})).s === 403);
  ok('delete with a wrong password: refused, account intact', (await call('ben', 'POST', '/api/account/delete', { password: PW.ben })).s === 403 && (await call('ben', 'GET', '/api/me')).s === 200);
  ok('nobody deletes somebody else', (await call('cleo', 'POST', '/api/account/delete', { password: 'plum-chair-9917', user: 'ben' })).s === 403 && (await call('ben', 'GET', '/api/me')).s === 200);
  r = await call('ben', 'POST', '/api/account/delete', { password: 'plum-chair-9917' });
  ok('with the right password the account is deleted', r.s === 200 && /bp_session=;/.test(r.h.get('set-cookie') || ''));
  ok('logged out everywhere', (await call('ben', 'GET', '/api/me')).s === 401);
  ok('cannot log in any more', (await call('x2', 'POST', '/api/login', { username: 'ben', password: 'plum-chair-9917' })).s === 401);
  ok('gone from the friends table and the leaderboard', !(await call('anna', 'GET', '/api/day?date=2026-11-13')).j.players.some(p => p.id === 'ben') && !(await call('anna', 'GET', '/api/leaderboard?date=2026-11-13')).j.players.some(p => p.name === 'Ben'));
  ok('the picture is gone', !fs.existsSync(path.join(data, 'avatars', 'ben.img')) && (await call('anna', 'GET', '/api/avatar/ben')).s === 404);
  await wait(500);
  const d = readDb(project, data);
  ok('nothing of it is left in the database', !d.users.ben && !d.docs.ben && !(d.away || {}).ben && !Object.values(d.sessions).includes('ben'));
  ok('the others are untouched', !!d.users.anna && !!d.users.cleo && (await call('cleo', 'GET', '/api/me')).s === 200);
  ok('the name can be registered again and starts empty', (await call('newben', 'POST', '/api/signup', { username: 'ben', password: 'fresh-start-5521' })).s === 200 && (await call('newben', 'GET', '/api/docs')).j.docs.length === 0 && (await call('newben', 'GET', '/api/plus')).j.active === false);

  // ---- brake on guessing
  let last = 0; for (let i = 0; i < 9; i++) last = (await call('cleo', 'POST', '/api/account/delete', { password: 'wrong-wrong-' + i })).s;
  ok('guessing the password to delete is slowed down', last === 429 && (await call('cleo', 'POST', '/api/account/delete', { password: PW.cleo })).s === 429 && (await call('cleo', 'GET', '/api/me')).s === 200);

  out.forEach(([n, v]) => console.log((v ? 'ok    ' : 'FAIL  ') + n));
  console.log(out.filter(o => o[1]).length + ' ok, ' + out.filter(o => !o[1]).length + ' failed');
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
