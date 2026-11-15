// Sign-up brake, logins that end after idle time, and the SQLite store (migration from db.json, restart, backups).
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || path.join(__dirname, '..'), { readDb } = require('./db.js'), openStore = require(path.join(project, 'store.js'));
const PORT = 3991, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'secdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = [], ok = (n, v) => out.push([n, !!v]);
  const boot = async env => { const s = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_ADMINS: '', BP_SIGNUPS_PER_HOUR: '', BP_IDLE_DAYS: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); s.log = ''; s.stdout.on('data', d => s.log += d); s.stderr.on('data', d => s.log += d); await wait(1100); return s; };
  const stop = async s => { await wait(450); s.kill(); await wait(400); };
  const jar = {};
  const call = async (who, m, u, b, h) => { const r = await fetch(B + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json', cookie: jar[who] || '' }, h || {}), body: b == null ? undefined : JSON.stringify(b) }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };

  // ---- moving an old db.json into SQLite
  const old = { users: { olduser: { display: 'OldUser', salt: 'ab', hash: 'cd', created: 1 }, quiet: { display: 'quiet', salt: 'ef', hash: '01', created: 2 } }, sessions: { tok1: 'olduser' },
    docs: { olduser: { x_stats: { ml: { days: { '2026-11-01': { score: 12 } } } }, 'run-1': { score: 7, 'ünï': 'cödé "quotes" \\ and | bars' } }, quiet: {} },
    geo: { olduser: { daily: { '2026-11-01': { flags: { score: 8, n: 10 } } } } }, drinks: {}, away: { olduser: { 'gl:2026-11-01': 2 } }, secret: 's3cret', plus: { orders: {}, events: { 'test:e1': 5 } } };
  fs.writeFileSync(path.join(data, 'db.json'), JSON.stringify(old));
  let srv = await boot({});
  ok('an existing db.json is moved into SQLite on the first start', /Moved the data into data\/ballpark\.sqlite: 2 accounts/.test(srv.log) && fs.existsSync(path.join(data, 'ballpark.sqlite')));
  ok('the old file is kept, renamed, with the same content', !fs.existsSync(path.join(data, 'db.json')) && fs.readFileSync(path.join(data, 'db.json.migrated'), 'utf8') === JSON.stringify(old));
  await stop(srv);
  let db = readDb(project, data);
  // (the two old accounts were made friends with each other on that first start; everything else must be as it was)
  const bare = u => { const c = Object.assign({}, u); delete c.friends; delete c.code; return c; };
  ok('the old accounts became friends with each other', !!db.users.olduser.friends.quiet && !!db.users.quiet.friends.olduser);
  ok('accounts, documents, records and the secret arrived unchanged', openStore.same(bare(db.users.olduser), old.users.olduser) && openStore.same(bare(db.users.quiet), old.users.quiet) && openStore.same(db.docs, old.docs) && openStore.same(db.geo, old.geo) && openStore.same(db.away, old.away) && db.secret === 's3cret' && db.plus.events['test:e1'] === 5);
  ok('an old login still works', db.sessions.tok1 === 'olduser');
  ok('a first backup was made', fs.readdirSync(path.join(data, 'backups')).some(f => /^db-\d{4}-\d\d-\d\d\.sqlite$/.test(f)));

  // a damaged db.json must stop the server and change nothing
  const bad = path.join(__dirname, '.tmp', 'secdata-bad'); fs.rmSync(bad, { recursive: true, force: true }); fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, 'db.json'), '{"users": {"a": ');
  const r = spawnSync(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: '3992', HOST: '127.0.0.1', DATA_DIR: bad }, encoding: 'utf8', timeout: 8000 });
  ok('a damaged db.json stops the start and is left alone', r.status === 1 && /Could not read/.test(r.stderr) && fs.readFileSync(path.join(bad, 'db.json'), 'utf8') === '{"users": {"a": ' && !fs.existsSync(path.join(bad, 'ballpark.sqlite')));

  // ---- sign-up brake (default: five an hour from one address)
  srv = await boot({});
  let codes = []; for (let i = 0; i < 7; i++) codes.push((await call('n' + i, 'POST', '/api/signup', { username: 'newbie' + i, password: 'kiwi-lamp-44' + i + '0' })).s);
  ok('five new accounts go through, the sixth and seventh are refused', codes.join() === '200,200,200,200,200,429,429');
  ok('another address is not affected', (await call('o1', 'POST', '/api/signup', { username: 'other1', password: 'kiwi-lamp-4499' }, { 'X-Forwarded-For': '203.0.113.9' })).s === 200);
  ok('a made-up first entry in X-Forwarded-For does not get around it', (await call('o2', 'POST', '/api/signup', { username: 'other2', password: 'kiwi-lamp-4498' }, { 'X-Forwarded-For': '198.51.100.7, 203.0.113.9' })).s === 200
    && (await (async () => { let last = 0; for (let i = 0; i < 6; i++) last = (await call('o' + (3 + i), 'POST', '/api/signup', { username: 'spoof' + i, password: 'kiwi-lamp-447' + i }, { 'X-Forwarded-For': '10.0.0.' + i + ', 203.0.113.9' })).s; return last; })()) === 429);
  ok('logging in is not affected by the sign-up brake', (await call('back', 'POST', '/api/login', { username: 'newbie0', password: 'kiwi-lamp-4400' })).s === 200);
  ok('the refused ones do not exist', (await call('x', 'POST', '/api/login', { username: 'newbie6', password: 'kiwi-lamp-4460' })).s === 401);
  await call('n0', 'PUT', '/api/docs/notes', { days: { '2026-11-13': { score: 21 } } });    // any document the browser owns
  await stop(srv);

  // ---- restart: everything is still there, the old data too
  srv = await boot({});
  ok('after a restart the login is still valid', (await call('n0', 'GET', '/api/me')).s === 200);
  ok('and the saved result is there', (await call('n0', 'GET', '/api/docs/notes')).j.data.days['2026-11-13'].score === 21);
  await stop(srv);
  db = readDb(project, data);
  ok('the migrated accounts are still complete after other accounts changed', openStore.same(bare(db.users.olduser), old.users.olduser) && openStore.same(db.docs.olduser, old.docs.olduser) && Object.keys(db.users).length === 2 + 5 + 2 + 3);   // 2 old, 5 newbies, and 5 from the second address

  // ---- logins end when they are not used (here: after about a second instead of two weeks)
  srv = await boot({ BP_IDLE_DAYS: String(2 / 86400) });
  jar.legacy = 'bp_session=tok1';                    // came over from db.json, where no "last used" was kept
  ok('a login from before the rule is accepted once and starts counting', (await call('legacy', 'GET', '/api/me')).j.id === 'olduser');
  ok('a login last used before the restart has run out', (await call('n1', 'GET', '/api/me')).s === 401);
  await call('fresh', 'POST', '/api/login', { username: 'newbie2', password: 'kiwi-lamp-4420' });
  ok('a fresh login works', (await call('fresh', 'GET', '/api/me')).s === 200);
  await wait(2600);
  ok('after the idle time it is logged out', (await call('fresh', 'GET', '/api/me')).s === 401 && (await call('legacy', 'GET', '/api/me')).s === 401);
  ok('logging in again works', (await call('fresh', 'POST', '/api/login', { username: 'newbie2', password: 'kiwi-lamp-4420' })).s === 200 && (await call('fresh', 'GET', '/api/me')).s === 200);
  await stop(srv);
  db = readDb(project, data);
  ok('ended logins are removed from the database', !Object.values(db.sessions).includes('newbie1') && !db.sessions.tok1);

  // ---- with the normal two weeks, use keeps a login alive
  srv = await boot({});
  ok('with two weeks the same login stays', (await call('fresh', 'GET', '/api/me')).s === 200);
  await stop(srv);

  out.forEach(([n, v]) => console.log((v ? 'ok    ' : 'FAIL  ') + n));
  console.log(out.filter(o => o[1]).length + ' ok, ' + out.filter(o => !o[1]).length + ' failed');
  process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
