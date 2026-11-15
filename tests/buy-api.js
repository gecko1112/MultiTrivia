// Plus on the server: who has it, the test checkout, the webhook, cancelling, admin gifts.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const project = process.argv[2] || require('path').join(__dirname, '..'), readDb = require('./db.js').readDb, patchDb = require('./db.js').patchDb, PORT = 3986, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'bdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'admins.txt'), 'anna\n');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = [], ok = (n, v) => out.push([n, !!v]);
  const boot = async () => { const s = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_ADMINS: '' }, stdio: 'ignore' }); await up(PORT); return s; };
  let srv = await boot();
  const jar = {};
  const call = async (who, m, u, b, h) => { const r = await fetch(B + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', cookie: jar[who] || '' }, h || {}), body: b == null ? undefined : typeof b === 'string' ? b : JSON.stringify(b) }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {} return { s: r.status, j, t }; };
  for (const [n, p] of [['anna', 'kiwi-lamp-4421'], ['ben', 'kiwi-lamp-4422']]) await call(n, 'POST', '/api/signup', { username: n, password: p });

  // ---- nobody has Plus to begin with
  let r = await call('ben', 'GET', '/api/plus');
  ok('a new account is Basic and cannot buy yet', r.s === 200 && r.j.active === false && r.j.onSale === false);
  ok('/api/me says so too', (await call('ben', 'GET', '/api/me')).j.plus === false);
  ok('head-to-head is refused without Plus', (await call('ben', 'GET', '/api/h2h')).s === 403);
  ok('a past Atlas day is refused without Plus', (await call('ben', 'GET', '/api/geo/daily?mode=flags&day=2026-11-01')).s !== 200);
  ok('status needs a login', (await call('nobody', 'GET', '/api/plus')).s === 401);
  r = await call('ben', 'POST', '/api/plus/checkout', { plan: 'year' });
  ok('a normal account is told Plus is not on sale', r.s === 503 && !r.j.url);
  ok('a normal account cannot reach the test checkout', (await call('ben', 'GET', '/api/plus/test-checkout?order=' + 'a'.repeat(24))).s === 403);
  ok('a normal account cannot give itself Plus', (await call('ben', 'POST', '/api/admin/plus', { user: 'ben', on: true })).s === 403 && (await call('ben', 'GET', '/api/admin/plus')).s === 403);
  ok('writing "plus" into a saved document changes nothing', (await call('ben', 'PUT', '/api/docs/x_plus', { active: true })).s === 200 && (await call('ben', 'GET', '/api/plus')).j.active === false);

  // ---- the admin buys through the test checkout
  ok('the admin can buy', (await call('anna', 'GET', '/api/plus')).j.onSale === true);
  ok('a plan has to be named', (await call('anna', 'POST', '/api/plus/checkout', { plan: 'forever' })).s === 400);
  r = await call('anna', 'POST', '/api/plus/checkout', { plan: 'year' });
  const order = (r.j.url || '').split('order=')[1];
  ok('checkout answers with a page to go to', r.s === 200 && /^[0-9a-f]{24}$/.test(order || ''));
  r = await call('anna', 'GET', r.j.url);
  ok('the test checkout page names the plan and the account', r.s === 200 && /Test checkout/.test(r.t) && /one year/.test(r.t) && /anna/.test(r.t));
  ok('still Basic before paying', (await call('anna', 'GET', '/api/plus')).j.active === false);
  r = await call('anna', 'POST', '/api/plus/test-pay', { order });
  ok('paying switches Plus on', r.s === 200 && r.j.active && r.j.plan === 'year' && r.j.renews === true && r.j.gift === false);
  ok('for about a year', Math.abs(r.j.until - Date.now() - 365 * 864e5) < 60000);
  ok('an order works once', (await call('anna', 'POST', '/api/plus/test-pay', { order })).s === 404);
  ok('head-to-head opens', (await call('anna', 'GET', '/api/h2h')).s === 200);
  ok('buying twice is refused', (await call('anna', 'POST', '/api/plus/checkout', { plan: 'month' })).s === 409);

  // ---- cancelling keeps the paid time
  r = await call('anna', 'POST', '/api/plus/cancel');
  ok('cancel stops the renewal, Plus stays', r.s === 200 && r.j.active && r.j.renews === false);
  ok('nothing left to cancel afterwards', (await call('anna', 'POST', '/api/plus/cancel')).s === 400);
  ok('Basic has nothing to cancel', (await call('ben', 'POST', '/api/plus/cancel')).s === 400);

  // ---- the webhook only believes a correct signature
  await wait(400); srv.kill(); await wait(500);
  const secret = readDb(project, data).secret;
  srv = await boot();
  ok('Plus survives a restart', (await call('anna', 'GET', '/api/plus')).j.active === true);
  const hook = (body, sig) => call('nobody', 'POST', '/api/plus/webhook/test', body, { 'x-bp-signature': sig });
  const sign = raw => crypto.createHmac('sha256', secret).update(raw).digest('hex');
  let raw = JSON.stringify({ id: 'e1', type: 'paid', user: 'ben', plan: 'month', until: Date.now() + 30 * 864e5, ref: 'sub1' });
  ok('a notice without a signature is refused', (await hook(raw, '')).s === 400);
  ok('a notice with a wrong signature is refused', (await hook(raw, sign(raw + ' '))).s === 400);
  ok('and gave nothing', (await call('ben', 'GET', '/api/plus')).j.active === false);
  ok('an unknown provider is refused', (await call('nobody', 'POST', '/api/plus/webhook/nope', raw)).s === 404);
  ok('a signed notice is accepted', (await hook(raw, sign(raw))).s === 200 && (await call('ben', 'GET', '/api/plus')).j.plan === 'month');
  raw = JSON.stringify({ id: 'e2', type: 'cancelled', user: 'ben', ref: 'other-sub' });
  ok('a cancel for a different subscription changes nothing', (await hook(raw, sign(raw))).s === 200 && (await call('ben', 'GET', '/api/plus')).j.renews === true);
  raw = JSON.stringify({ id: 'e3', type: 'paid', user: 'ben', plan: 'month', until: Date.now() + 60 * 864e5, ref: 'sub1' });
  await hook(raw, sign(raw)); const until = (await call('ben', 'GET', '/api/plus')).j.until;
  ok('a renewal moves the end date', until - Date.now() > 59 * 864e5);
  raw = JSON.stringify({ id: 'e1', type: 'paid', user: 'ben', plan: 'month', until: Date.now() + 5 * 864e5, ref: 'sub1' });
  ok('the same notice twice is applied once', (await hook(raw, sign(raw))).s === 200 && (await call('ben', 'GET', '/api/plus')).j.until === until);
  raw = JSON.stringify({ id: 'e4', type: 'paid', user: 'ghost', plan: 'month', until: Date.now() + 5 * 864e5, ref: 'x' });
  ok('a notice for an unknown account is refused', (await hook(raw, sign(raw))).s === 422);
  raw = JSON.stringify({ id: 'e5', type: 'ended', user: 'ben', ref: 'sub1' });
  ok('a refund ends Plus at once', (await hook(raw, sign(raw))).s === 200 && (await call('ben', 'GET', '/api/plus')).j.active === false && (await call('ben', 'GET', '/api/h2h')).s === 403);

  // ---- admin gifts
  r = await call('anna', 'POST', '/api/admin/plus', { user: 'Ben', on: true });
  ok('an admin gives Plus without an end', r.s === 200 && r.j.active && r.j.gift && r.j.until === null);
  raw = JSON.stringify({ id: 'e6', type: 'ended', user: 'ben', ref: 'sub1' });
  await hook(raw, sign(raw));
  ok('an old payment notice does not end a gift', (await call('ben', 'GET', '/api/plus')).j.active === true);
  r = await call('anna', 'GET', '/api/admin/plus'); if (!r.j.accounts) { console.log('DEBUG', r.s, r.t); r.j.accounts = []; }
  ok('the admin list shows both accounts', r.j.accounts.length === 2 && r.j.accounts.every(a => a.active));
  ok('the list holds no password data', !/salt|hash/.test(r.t));
  r = await call('anna', 'POST', '/api/admin/plus', { user: 'ben', on: true, days: 7 });
  ok('a gift can have an end', Math.abs(r.j.until - Date.now() - 7 * 864e5) < 60000);
  ok('an admin takes it away again', (await call('anna', 'POST', '/api/admin/plus', { user: 'ben', on: false })).j.active === false);
  ok('unknown account', (await call('anna', 'POST', '/api/admin/plus', { user: 'ghost', on: true })).s === 404);

  // ---- running out
  await wait(400); srv.kill(); await wait(500);
  patchDb(project, data, db => { db.users.anna.plus.until = Date.now() - 1000; });
  srv = await boot();
  r = await call('anna', 'GET', '/api/plus');
  ok('Plus ends by itself when the time is up', r.j.active === false && typeof r.j.ended === 'number' && (await call('anna', 'GET', '/api/h2h')).s === 403);

  out.forEach(([n, v]) => console.log((v ? 'ok    ' : 'FAIL  ') + n));
  console.log(out.filter(o => o[1]).length + ' ok, ' + out.filter(o => !o[1]).length + ' failed');
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
