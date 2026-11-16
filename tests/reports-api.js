// Reported profile pictures (reports-server.js): friends' pictures only, once a day per player per reported account,
// nothing happens automatically, the admin sees a copy and removes or dismisses, deleting an account clears its reports.
// Friends rules are on here (BP_FRIENDS is not "everyone"), so this file does not load tests/db.js.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 4003, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'repdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'admins.txt'), 'anna\n');
const wait = ms => new Promise(r => setTimeout(r, ms));
// real, tiny PNGs; the text chunk makes them differ and long enough for the server's size check
const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
const chunk = (type, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const png = note => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])), chunk('IDAT', zlib.deflateSync(Buffer.from([0, 255, 0, 0]))), chunk('tEXt', Buffer.from(('Comment\0' + note).padEnd(80, '.'))), chunk('IEND', Buffer.alloc(0))]);
const url = buf => 'data:image/png;base64,' + buf.toString('base64');
const out = [], ok = (n, v) => out.push([n, !!v]);
(async () => {
  let log = '';
  const boot = () => { const p = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_ADMINS: '', BP_FRIENDS: '' }, stdio: ['ignore', 'pipe', 'ignore'] }); p.stdout.on('data', d => { log += d; }); return p; };
  let srv = boot(); await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b == null ? undefined : JSON.stringify(b) }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; const buf = Buffer.from(await r.arrayBuffer()); let j = {}; try { j = JSON.parse(buf.toString()); } catch (e) {} return { s: r.status, j, buf }; };
  const PW = { anna: 'kiwi-lamp-4451', ben: 'kiwi-lamp-4452', cleo: 'kiwi-lamp-4453', dora: 'kiwi-lamp-4454' };
  const signin = async () => { for (const n of Object.keys(PW)) if ((await call(n, 'POST', '/api/signup', { username: n, password: PW[n] })).s !== 200) await call(n, 'POST', '/api/login', { username: n, password: PW[n] }); };
  try {
    await signin();
    // anna, ben and dora are friends with each other; cleo is nobody's friend
    for (const [a, b] of [['anna', 'ben'], ['dora', 'ben'], ['anna', 'dora']]) { await call(a, 'POST', '/api/friends/add', { who: b }); await call(b, 'POST', '/api/friends/accept', { user: a }); }
    const PIC1 = png('first'), PIC2 = png('second');
    ok('setup: ben has a picture', (await call('ben', 'PUT', '/api/account/avatar', { image: url(PIC1) })).s === 200);

    // ---- reporting
    let r = await call('anna', 'POST', '/api/report/picture', { user: 'ben' });
    ok('a friend can report a picture', r.s === 200);
    r = await call('anna', 'POST', '/api/report/picture', { user: 'BEN' });
    ok('the same player cannot report the same account twice in a day', r.s === 409 && r.j.already && /already reported/.test(r.j.error));
    ok('another friend can report it too', (await call('dora', 'POST', '/api/report/picture', { user: 'ben' })).s === 200);
    ok('somebody who cannot see the picture cannot report it', (await call('cleo', 'POST', '/api/report/picture', { user: 'ben' })).s === 404);
    ok('nobody reports their own picture', (await call('ben', 'POST', '/api/report/picture', { user: 'ben' })).s === 404);
    ok('no picture, nothing to report', (await call('ben', 'POST', '/api/report/picture', { user: 'anna' })).s === 404);
    ok('needs a login', (await call('nobody', 'POST', '/api/report/picture', { user: 'ben' })).s === 401);
    ok('nothing happens to the picture by itself', (await call('anna', 'GET', '/api/avatar/ben')).s === 200);
    ok('the report is written to the server console', /Picture report: anna reported the profile picture of ben/.test(log));

    // ---- what the admin sees
    let list = (await call('anna', 'GET', '/api/admin/reports')).j.reports;
    ok('the admin sees one entry for the picture, with both reporters', list.length === 1 && list[0].user === 'ben' && list[0].count === 2 && list[0].by.join() === 'anna,dora' && list[0].current);
    ok('only admins see reports', (await call('ben', 'GET', '/api/admin/reports')).s === 403 && (await call('dora', 'GET', '/api/admin/reports')).s === 403);
    r = await call('anna', 'GET', '/api/admin/reports/picture/ben/' + list[0].v);
    ok('the admin gets the picture as it was reported', r.s === 200 && r.buf.equals(PIC1));
    ok('nobody else does', (await call('dora', 'GET', '/api/admin/reports/picture/ben/' + list[0].v)).s === 403);
    await wait(5);
    await call('ben', 'PUT', '/api/account/avatar', { image: url(PIC2) });
    list = (await call('anna', 'GET', '/api/admin/reports')).j.reports;
    r = await call('anna', 'GET', '/api/admin/reports/picture/ben/' + list[0].v);
    ok('after a change the reported copy is still there, marked as changed', !list[0].current && r.buf.equals(PIC1));
    r = await call('anna', 'POST', '/api/admin/reports/resolve', { user: 'ben', v: list[0].v, action: 'remove' });
    ok('"remove" leaves a picture alone that is no longer the reported one', r.s === 200 && (await call('dora', 'GET', '/api/avatar/ben')).s === 200 && r.j.reports.length === 0);
    ok('and the copy is gone', !fs.readdirSync(path.join(data, 'reports')).length);

    // ---- a new day, a new report allowed
    await wait(450); srv.kill(); await wait(400);
    { const st = require(path.join(project, 'store.js'))(data); st.db.reports.list.push({ id: 'x', at: Date.now() - 864e5, day: '2026-01-01', by: 'anna', user: 'ben', v: st.db.users.ben.avatar.v, type: 'png' }); st.db.reports.today.day = '2026-01-01'; st.save(); st.close(); }
    srv = boot(); await up(PORT); await signin();
    ok('a report from an earlier day does not block today', (await call('anna', 'POST', '/api/report/picture', { user: 'ben' })).s === 200);
    list = (await call('anna', 'GET', '/api/admin/reports')).j.reports;
    r = await call('anna', 'POST', '/api/admin/reports/resolve', { user: 'ben', v: list[0].v, action: 'dismiss' });
    ok('"dismiss" clears the reports and keeps the picture', r.s === 200 && !r.j.reports.length && (await call('anna', 'GET', '/api/avatar/ben')).s === 200);
    await call('anna', 'POST', '/api/report/picture', { user: 'dora' });          // dora has no picture: refused
    await call('dora', 'PUT', '/api/account/avatar', { image: url(PIC1) });
    ok('dismissing does not reset the daily limit', (await call('anna', 'POST', '/api/report/picture', { user: 'ben' })).s === 409);
    await call('ben', 'POST', '/api/report/picture', { user: 'dora' });
    list = (await call('anna', 'GET', '/api/admin/reports')).j.reports;
    r = await call('anna', 'POST', '/api/admin/reports/resolve', { user: 'dora', v: list[0].v, action: 'remove' });
    ok('"remove" takes the reported picture down', r.s === 200 && (await call('ben', 'GET', '/api/avatar/dora')).s === 404 && !(await call('dora', 'GET', '/api/me')).j.avatar);
    ok('unknown reports and actions are refused', (await call('anna', 'POST', '/api/admin/reports/resolve', { user: 'dora', v: 1, action: 'remove' })).s === 404);

    // ---- the account's own data
    await call('dora', 'POST', '/api/report/picture', { user: 'ben' });
    const exp = (await call('dora', 'GET', '/api/account/export')).j;
    ok('the data download lists the reports you made', Array.isArray(exp.picturesYouReported) && exp.picturesYouReported.some(x => x.picture === 'ben'));
    ok("but not who reported you", !JSON.stringify((await call('ben', 'GET', '/api/account/export')).j).includes('dora reported'));
    r = await call('dora', 'POST', '/api/account/delete', { password: PW.dora });
    list = (await call('anna', 'GET', '/api/admin/reports')).j.reports;
    ok("deleting an account removes the reports it made", r.s === 200 && !list.some(g => g.by.includes('dora')));
    await call('anna', 'POST', '/api/report/picture', { user: 'ben' }).catch(() => {});
    await wait(450); srv.kill(); await wait(400);
    { const st = require(path.join(project, 'store.js'))(data); st.db.reports.list.push({ id: 'y', at: Date.now(), day: '2026-01-02', by: 'anna', user: 'ben', v: st.db.users.ben.avatar.v, type: 'png' }); st.save(); st.close(); }
    srv = boot(); await up(PORT); await signin();
    await call('anna', 'GET', '/api/admin/reports');
    fs.copyFileSync(path.join(data, 'avatars', 'ben.img'), path.join(data, 'reports', 'ben-' + (await call('anna', 'GET', '/api/admin/reports')).j.reports[0].v + '.img'));
    r = await call('ben', 'POST', '/api/account/delete', { password: PW.ben });
    list = (await call('anna', 'GET', '/api/admin/reports')).j.reports;
    ok('deleting the reported account removes the reports about it and the copies', r.s === 200 && !list.length && !fs.readdirSync(path.join(data, 'reports')).length);
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
