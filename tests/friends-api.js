// Friends: requests by name or code, and that results and pictures reach friends only.
// (Does not load ./db.js on purpose: that would switch the server to "everybody sees everybody".)
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { importStats } = require('./seed');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 3993, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'frdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAPHRFWHRBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUGZ5pDrAAAAAElFTkSuQmCC', 'base64');
(async () => {
  const out = [], ok = (n, v) => out.push([n, !!v]);
  const boot = async env => { const s = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_ADMINS: '', BP_SIGNUPS_PER_HOUR: '1000', BP_FRIENDS: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); s.log = ''; s.stdout.on('data', d => s.log += d); await wait(1100); return s; };
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b == null ? undefined : JSON.stringify(b) }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const names = (who, date) => call(who, 'GET', '/api/day?date=' + date).then(r => r.j.players.map(p => p.id).sort().join());
  const D = '2026-11-13';

  // ---- the accounts that exist when friends are introduced become friends with each other, once
  fs.writeFileSync(path.join(data, 'db.json'), JSON.stringify({ users: { gecko: { display: 'gecko', salt: 'a', hash: 'b' }, lini: { display: 'lini', salt: 'a', hash: 'b' }, nima: { display: 'nima', salt: 'a', hash: 'b' } }, sessions: { tg: 'gecko', tl: 'lini' }, docs: { gecko: {}, lini: { x_stats: { ml: { days: { [D]: { score: 17 } } } } }, nima: {} } }));
  let srv = await boot({});
  jar.gecko = 'bp_session=tg'; jar.lini = 'bp_session=tl';
  ok('the existing accounts are friends with each other from the start', /3 existing accounts are now friends/.test(srv.log) && (await call('gecko', 'GET', '/api/friends')).j.friends.map(f => f.id).join() === 'lini,nima');
  ok('so they still see each other', (await names('gecko', D)) === 'gecko,lini,nima');

  for (const [n, p] of [['anna', 'kiwi-lamp-4421'], ['Ben', 'kiwi-lamp-4422'], ['cleo', 'kiwi-lamp-4423']]) await call(n.toLowerCase(), 'POST', '/api/signup', { username: n, password: p });
  importStats(data, { ben: { ml: { days: { [D]: { score: 20 } } } } });      // a More/Less result comes from the server, not the browser
  await wait(450); srv.kill(); await wait(400); srv = await boot({});
  await call('ben', 'PUT', '/api/account/avatar', { image: 'data:image/png;base64,' + PNG.toString('base64') });

  // ---- a new account sees nobody, and nobody sees it
  let me = (await call('anna', 'GET', '/api/friends')).j;
  ok('a new account has no friends and gets a friend code', me.friends.length === 0 && /^[A-Z2-9]{8}$/.test(me.code) && me.open === false);
  ok('the code stays the same', (await call('anna', 'GET', '/api/friends')).j.code === me.code);
  ok('a new account sees only itself in the day table', (await names('anna', D)) === 'anna');
  ok('and only itself on the leaderboard', (await call('anna', 'GET', '/api/leaderboard?date=' + D)).j.players.map(p => p.id).join() === 'anna');
  ok('the old group does not see the new accounts', (await names('gecko', D)) === 'gecko,lini,nima');
  ok('a stranger\'s picture is not handed out', (await call('anna', 'GET', '/api/avatar/ben')).s === 404);
  ok('the owner sees their own picture', (await call('ben', 'GET', '/api/avatar/ben')).s === 200);

  // ---- asking by name
  let r = await call('anna', 'POST', '/api/friends/add', { who: 'BEN' });
  ok('a request by username (any capitals) is sent', r.s === 200 && r.j.now === 'asked' && r.j.outgoing.map(x => x.id).join() === 'ben' && r.j.friends.length === 0);
  ok('asking twice changes nothing', (await call('anna', 'POST', '/api/friends/add', { who: 'ben' })).j.outgoing.length === 1);
  ok('the other side has it waiting', (await call('ben', 'GET', '/api/friends')).j.incoming.map(x => x.name).join() === 'anna');
  ok('an open request shows nothing yet', (await names('anna', D)) === 'anna' && (await call('anna', 'GET', '/api/avatar/ben')).s === 404 && (await names('ben', D)) === 'ben');
  ok('nobody can accept for somebody else', (await call('anna', 'POST', '/api/friends/accept', { user: 'ben' })).s === 400 && (await call('cleo', 'POST', '/api/friends/accept', { user: 'anna' })).s === 400);
  r = await call('ben', 'POST', '/api/friends/accept', { user: 'anna' });
  ok('accepting makes both friends', r.s === 200 && r.j.friends.map(f => f.id).join() === 'anna' && r.j.incoming.length === 0 && (await call('anna', 'GET', '/api/friends')).j.friends[0].id === 'ben' && (await call('anna', 'GET', '/api/friends')).j.outgoing.length === 0);
  ok('now they see each other\'s results', (await names('anna', D)) === 'anna,ben' && (await names('ben', D)) === 'anna,ben');
  ok('and the picture', (await call('anna', 'GET', '/api/avatar/ben')).s === 200 && (await call('anna', 'GET', '/api/friends')).j.friends[0].av > 0);
  ok('a third player still sees neither', (await names('cleo', D)) === 'cleo' && (await call('cleo', 'GET', '/api/avatar/ben')).s === 404);
  ok('the leaderboard follows', (await call('anna', 'GET', '/api/leaderboard?date=' + D)).j.players.map(p => p.id).sort().join() === 'anna,ben');
  ok('already friends: said so', (await call('anna', 'POST', '/api/friends/add', { who: 'ben' })).s === 409);

  // ---- asking by code, and the shortcut when both ask
  const cleoCode = (await call('cleo', 'GET', '/api/friends')).j.code;
  r = await call('anna', 'POST', '/api/friends/add', { who: cleoCode.slice(0, 4).toLowerCase() + '-' + cleoCode.slice(4) });
  ok('a request by friend code works, however it is typed', r.s === 200 && r.j.now === 'asked' && r.j.name === 'cleo');
  r = await call('cleo', 'POST', '/api/friends/add', { who: 'anna' });
  ok('if the other one asks back, they are friends at once', r.j.now === 'friends' && r.j.friends.map(f => f.id).join() === 'anna' && r.j.incoming.length === 0);
  ok('friends of a friend do not see each other', (await names('ben', D)) === 'anna,ben' && (await names('cleo', D)) === 'anna,cleo' && (await names('anna', D)) === 'anna,ben,cleo');

  // ---- wrong input
  ok('an unknown name or code', (await call('anna', 'POST', '/api/friends/add', { who: 'nobody-here' })).s === 404 && (await call('anna', 'POST', '/api/friends/add', { who: 'ZZZZZZZZ' })).s === 404);
  ok('yourself', (await call('anna', 'POST', '/api/friends/add', { who: 'anna' })).s === 400);
  ok('needs a login', (await call('none', 'GET', '/api/friends')).s === 401 && (await call('none', 'POST', '/api/friends/add', { who: 'anna' })).s === 401);

  // ---- decline, take back, remove
  await call('gecko', 'POST', '/api/friends/add', { who: 'cleo' });
  ok('declining removes the request on both sides', (await call('cleo', 'POST', '/api/friends/decline', { user: 'gecko' })).j.incoming.length === 0 && (await call('gecko', 'GET', '/api/friends')).j.outgoing.length === 0 && (await names('cleo', D)) === 'anna,cleo');
  await call('gecko', 'POST', '/api/friends/add', { who: 'cleo' });
  ok('a request can be taken back', (await call('gecko', 'POST', '/api/friends/cancel', { user: 'cleo' })).j.outgoing.length === 0 && (await call('cleo', 'GET', '/api/friends')).j.incoming.length === 0);
  r = await call('ben', 'POST', '/api/friends/remove', { user: 'anna' });
  ok('removing a friend ends it for both', r.j.friends.length === 0 && (await call('anna', 'GET', '/api/friends')).j.friends.map(f => f.id).join() === 'cleo');
  ok('and they stop seeing each other', (await names('anna', D)) === 'anna,cleo' && (await names('ben', D)) === 'ben' && (await call('anna', 'GET', '/api/avatar/ben')).s === 404);

  // ---- head-to-head counts friends only
  importStats(data, { anna: { ml: { days: { [D]: { score: 15 } } } }, cleo: { ml: { days: { [D]: { score: 11 } } } } });
  await wait(450); srv.kill(); await wait(400); srv = await boot({});
  fs.writeFileSync(path.join(data, 'admins.txt'), 'anna');
  await call('anna', 'POST', '/api/admin/plus', { user: 'anna', on: true });
  ok('head-to-head lists friends only', (await call('anna', 'GET', '/api/h2h')).j.players.map(p => p.name).join() === 'cleo');

  // ---- deleting an account takes it out of everybody's lists
  await call('gecko', 'POST', '/api/friends/add', { who: 'cleo' });
  ok('delete works', (await call('cleo', 'POST', '/api/account/delete', { password: 'kiwi-lamp-4423' })).s === 200);
  me = (await call('anna', 'GET', '/api/friends')).j;
  ok('the deleted account is gone from friends and open requests', me.friends.length === 0 && (await call('gecko', 'GET', '/api/friends')).j.outgoing.length === 0);
  await call('cleo2', 'POST', '/api/signup', { username: 'cleo', password: 'fresh-start-5521' });
  ok('a new account with the same name does not inherit the friends', (await names('cleo2', D)) === 'cleo' && (await call('anna', 'GET', '/api/friends')).j.friends.length === 0);

  // ---- survives a restart; the first-time linking does not run again
  await wait(450); srv.kill(); await wait(400); srv = await boot({});
  ok('friends are still there after a restart', (await call('gecko', 'GET', '/api/friends')).j.friends.length === 2);
  ok('later accounts were not swept into the old group', !/existing accounts are now friends/.test(srv.log) && (await names('ben', D)) === 'ben');
  await wait(300); srv.kill(); await wait(400);

  // ---- the "everybody" switch for a private server
  srv = await boot({ BP_FRIENDS: 'everyone' });
  ok('with BP_FRIENDS=everyone all players see each other', (await names('ben', D)) === 'anna,ben,cleo,gecko,lini,nima' && (await call('ben', 'GET', '/api/friends')).j.open === true);
  srv.kill();

  out.forEach(([n, v]) => console.log((v ? 'ok    ' : 'FAIL  ') + n));
  console.log(out.filter(o => o[1]).length + ' ok, ' + out.filter(o => !o[1]).length + ' failed');
  process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
