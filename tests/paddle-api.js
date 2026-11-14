// The Paddle provider, tested with notices signed the way Paddle signs them and a stand-in for Paddle's API.
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), crypto = require('crypto'), http = require('http');
const project = process.argv[2] || require('path').join(__dirname, '..'), readDb = require('./db.js').readDb, patchDb = require('./db.js').patchDb, PORT = 3987, APIPORT = 3988, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'paddata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'admins.txt'), 'anna\n');
const SECRET = 'pdl_ntfset_01testtesttesttesttesttest_abcdefghijklmnopqrstuvwxyz012345';
const conf = (env, extra) => fs.writeFileSync(path.join(data, 'paddle.json'), JSON.stringify(Object.assign({ env, clientToken: 'test_abc123def456', prices: { month: 'pri_month1', year: 'pri_year1' }, webhookSecret: SECRET, apiKey: 'pdl_sdbx_apikey_x', api: 'http://127.0.0.1:' + APIPORT }, extra || {})));
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = [], ok = (n, v) => out.push([n, !!v]);
  // stand-in for Paddle's API: remembers the call, answers with the subscription scheduled to cancel
  const seen = []; let apiStatus = 200;
  const iso = t => new Date(t).toISOString(), END = Date.now() + 20 * 864e5;
  const sub = o => Object.assign({ id: 'sub_1', status: 'active', customer_id: 'ctm_1', custom_data: { bp_user: 'ben' }, items: [{ price: { id: 'pri_month1' }, quantity: 1 }],
    current_billing_period: { starts_at: iso(END - 30 * 864e5), ends_at: iso(END) }, next_billed_at: iso(END), scheduled_change: null, canceled_at: null, paused_at: null }, o || {});
  const api = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { seen.push({ url: req.url, m: req.method, auth: req.headers.authorization, body: b });
    res.writeHead(apiStatus, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: sub({ scheduled_change: { action: 'cancel', effective_at: iso(END), resume_at: null } }) })); }); }).listen(APIPORT, '127.0.0.1');

  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_ADMINS: '' }, stdio: 'ignore' }); await wait(900);
  const jar = {};
  const call = async (who, m, u, b, h) => { const r = await fetch(B + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', cookie: jar[who] || '' }, h || {}), body: b == null ? undefined : typeof b === 'string' ? b : JSON.stringify(b) }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {} return { s: r.status, j, t }; };
  for (const [n, p] of [['anna', 'kiwi-lamp-4421'], ['ben', 'kiwi-lamp-4422']]) await call(n, 'POST', '/api/signup', { username: n, password: p });
  let n = 0;
  const notice = (type, d, at) => JSON.stringify({ event_id: 'evt_' + (++n), event_type: type, occurred_at: iso(at || Date.now()), notification_id: 'ntf_' + n, data: d });
  const hook = (raw, o) => { o = o || {}; const ts = String(o.ts || Math.floor(Date.now() / 1000)); const h1 = crypto.createHmac('sha256', o.secret || SECRET).update(ts + ':' + raw).digest('hex');
    return call('nobody', 'POST', '/api/plus/webhook/paddle', raw, { 'Paddle-Signature': o.header || ('ts=' + ts + ';h1=' + h1) }); };
  const st = who => call(who, 'GET', '/api/plus').then(r => r.j);

  // ---- not set up
  ok('without paddle.json the admin gets the test checkout', (await st('anna')).shop === 'test');
  ok('and a Paddle notice is refused', (await hook(notice('subscription.created', sub()))).s === 400);
  conf('sandbox', { apiKey: '' });
  ok('an incomplete paddle.json does not switch Paddle on', (await st('anna')).shop === 'test');

  // ---- sandbox: admins only
  conf('sandbox');
  ok('sandbox: the admin buys at Paddle', (await st('anna')).shop === 'paddle-sandbox' && (await st('anna')).onSale);
  ok('sandbox: a normal account cannot buy', (await st('ben')).onSale === false && (await call('ben', 'POST', '/api/plus/checkout', { plan: 'year' })).s === 503);
  let r = await call('anna', 'POST', '/api/plus/checkout', { plan: 'year' });
  ok('checkout hands the browser token, price and account', r.s === 200 && r.j.paddle && r.j.paddle.env === 'sandbox' && r.j.paddle.token === 'test_abc123def456' && r.j.paddle.priceId === 'pri_year1' && r.j.paddle.customData.bp_user === 'anna');
  ok('the answer holds no secrets', !/pdl_/.test(r.t));
  ok('the monthly plan gets the monthly price', (await call('anna', 'POST', '/api/plus/checkout', { plan: 'month' })).j.paddle.priceId === 'pri_month1');

  // ---- signatures
  let raw = notice('subscription.created', sub());
  ok('no signature: refused', (await call('nobody', 'POST', '/api/plus/webhook/paddle', raw)).s === 400);
  ok('wrong secret: refused', (await hook(raw, { secret: 'pdl_ntfset_wrong' })).s === 400);
  ok('an old timestamp: refused', (await hook(raw, { ts: Math.floor(Date.now() / 1000) - 3600 })).s === 400);
  ok('a changed body: refused', (await (async () => { const ts = String(Math.floor(Date.now() / 1000)); const h1 = crypto.createHmac('sha256', SECRET).update(ts + ':' + raw).digest('hex'); return call('nobody', 'POST', '/api/plus/webhook/paddle', raw.replace('ben', 'anna'), { 'Paddle-Signature': 'ts=' + ts + ';h1=' + h1 }); })()).s === 400);
  ok('none of them gave Plus', !(await st('ben')).active && !(await st('anna')).active);

  // ---- the life of a subscription
  ok('subscription.created switches Plus on', (await hook(raw)).s === 200 && (await st('ben')).active);
  let s = await st('ben');
  ok('monthly, renewing, until the end of the period plus a short grace', s.plan === 'month' && s.renews === true && s.until > END && s.until < END + 7 * 3600e3);
  ok('head-to-head opens', (await call('ben', 'GET', '/api/h2h')).s === 200);
  ok('two signatures while the secret is rotated: one match is enough', (await (async () => { const b = notice('subscription.updated', sub()); const ts = String(Math.floor(Date.now() / 1000)); const h1 = crypto.createHmac('sha256', SECRET).update(ts + ':' + b).digest('hex'); return hook(b, { header: 'ts=' + ts + ';h1=' + 'a'.repeat(64) + ';h1=' + h1 }); })()).s === 200);
  ok('buying again is refused while it runs', (await call('ben', 'POST', '/api/plus/checkout', { plan: 'year' })).s !== 200);
  const END2 = END + 30 * 864e5;
  await hook(notice('subscription.updated', sub({ current_billing_period: { starts_at: iso(END), ends_at: iso(END2) } })));
  ok('a renewal moves the end date', (await st('ben')).until > END2);
  await hook(notice('subscription.updated', sub({ status: 'past_due', current_billing_period: { starts_at: iso(END), ends_at: iso(END2) } })));
  ok('a failed renewal payment keeps Plus for the period', (await st('ben')).active);
  await hook(notice('transaction.completed', { id: 'txn_1', status: 'completed', custom_data: { bp_user: 'ben' } }));
  ok('other kinds of notice are accepted and change nothing', (await st('ben')).until > END2);
  await hook(notice('subscription.updated', sub({ current_billing_period: { starts_at: iso(END - 60 * 864e5), ends_at: iso(END - 30 * 864e5) } }), Date.now() - 3600e3));
  ok('an older notice arriving late is ignored', (await st('ben')).active && (await st('ben')).until > END2);

  // ---- cancelling from the site
  apiStatus = 500;
  r = await call('ben', 'POST', '/api/plus/cancel');
  ok('if Paddle fails, the member is told and nothing changes', r.s === 502 && (await st('ben')).renews === true);
  apiStatus = 200; seen.length = 0;
  r = await call('ben', 'POST', '/api/plus/cancel');
  ok('cancel calls Paddle for this subscription with the key', seen.length === 1 && seen[0].m === 'POST' && seen[0].url === '/subscriptions/sub_1/cancel' && seen[0].auth === 'Bearer pdl_sdbx_apikey_x' && JSON.parse(seen[0].body).effective_from === 'next_billing_period');
  ok('afterwards: still Plus, no renewal, ends with the period', r.s === 200 && r.j.active && r.j.renews === false && Math.abs(r.j.until - END) < 2000);
  ok('nothing left to cancel', (await call('ben', 'POST', '/api/plus/cancel')).s === 400);
  await hook(notice('subscription.canceled', sub({ status: 'canceled', current_billing_period: null, canceled_at: iso(Date.now()), scheduled_change: null }), Date.now() + 1000));
  ok('subscription.canceled ends Plus', !(await st('ben')).active && (await call('ben', 'GET', '/api/h2h')).s === 403);

  // ---- odd notices
  ok('a subscription without our account in it is accepted and ignored', (await hook(notice('subscription.created', sub({ id: 'sub_2', custom_data: null })))).s === 200);
  ok('one for an unknown account too', (await hook(notice('subscription.created', sub({ id: 'sub_3', custom_data: { bp_user: 'ghost' } })))).s === 200);
  await hook(notice('subscription.created', sub({ id: 'sub_4', items: [{ price: { id: 'pri_other' } }] }), Date.now() + 2000));
  ok('an unknown price gives nothing', !(await st('ben')).active);
  await hook(notice('subscription.created', sub({ id: 'sub_5', items: [{ price: { id: 'pri_year1' } }] }), Date.now() + 3000));
  ok('a new subscription after the old one ended works, yearly', (await st('ben')).active && (await st('ben')).plan === 'year');
  await hook(notice('subscription.canceled', sub({ id: 'sub_1', status: 'canceled', current_billing_period: null, canceled_at: iso(Date.now()) }), Date.now() + 4000));
  ok('a late notice about the OLD subscription does not end the new one', (await st('ben')).active);
  await hook(notice('subscription.paused', sub({ id: 'sub_5', status: 'paused', current_billing_period: null, paused_at: iso(Date.now()) }), Date.now() + 5000));
  ok('a paused subscription has no Plus', !(await st('ben')).active);

  // ---- live: everybody
  conf('live', { clientToken: 'live_abc123def456' });
  r = await call('ben', 'POST', '/api/plus/checkout', { plan: 'month' });
  ok('live: a normal account can buy', (await st('ben')).shop === 'paddle-live' && r.s === 200 && r.j.paddle.env === 'live');

  out.forEach(([n2, v]) => console.log((v ? 'ok    ' : 'FAIL  ') + n2));
  console.log(out.filter(o => o[1]).length + ' ok, ' + out.filter(o => !o[1]).length + ' failed');
  srv.kill(); api.close(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
