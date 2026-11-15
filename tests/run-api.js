// Today's daily games in progress (account doc "x_run"): the server only ever moves a started game forward.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 3994, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'rundata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const iso = ms => new Date(ms).toISOString().slice(0, 10);
(async () => {
  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: 'ignore' }); await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; let j = null; try { j = await r.json(); } catch (e) {} return { s: r.status, j }; };
  let bad = 0; const ok = (name, cond, extra) => { if (cond) console.log('ok   ' + name); else { bad++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); } };
  try {
    await call('anna', 'POST', '/api/signup', { username: 'anna', password: 'kiwi-lamp-4421' });
    await call('ben', 'POST', '/api/signup', { username: 'ben', password: 'kiwi-lamp-4422' });
    const D = iso(Date.now()), Y = iso(Date.now() - 864e5), FAR = iso(Date.now() + 5 * 864e5);
    const stored = async who => (await call(who, 'GET', '/api/docs/x_run')).j;
    const put = (who, body) => call(who, 'PUT', '/api/docs/x_run', body);

    ok('nothing stored before a game is started', (await stored('anna')).exists === false);
    let r = await put('anna', { day: D, games: { ml: { n: 4, s: { ci: 0, si: 3 } } } });
    ok('a started game is stored and handed back', r.s === 200 && r.j.data.games.ml.n === 4 && r.j.data.games.ml.s.si === 3, r);
    r = await put('anna', { day: D, games: { ml: { n: 9, s: { ci: 1, si: 3 } } } });
    ok('further progress replaces it', r.j.data.games.ml.n === 9);
    r = await put('anna', { day: D, games: { ml: { n: 1, s: { ci: 0, si: 0 } } } });
    ok('a fresh start for the same day is not accepted: the stored game comes back', r.s === 200 && r.j.data.games.ml.n === 9 && r.j.data.games.ml.s.ci === 1, r);
    ok('  and stays stored', (await stored('anna')).data.games.ml.n === 9);
    r = await put('anna', { day: D, games: { gl: { n: 3, s: { gl: { i: 1 } } } } });
    ok('another game is added without touching the first', r.j.data.games.gl.n === 3 && r.j.data.games.ml.n === 9, r);
    r = await put('anna', { day: D, games: {} });
    ok('an upload without games removes nothing', r.j.data.games.ml.n === 9 && r.j.data.games.gl.n === 3, r);
    r = await put('anna', { day: Y, games: { ml: { n: 1, s: {} } } });
    ok('an earlier day does not replace today', r.j.data.day === D && r.j.data.games.ml.n === 9, r);
    r = await put('anna', { day: FAR, games: { ml: { n: 1, s: {} } } });
    ok('a day far ahead is not accepted either', r.j.data.day === D && r.j.data.games.ml.n === 9, r);
    r = await put('anna', { day: D, games: { ml: { n: 1e9, done: true } } });
    ok('finishing is the last step', r.j.data.games.ml.done === true);
    r = await put('anna', { day: D, games: { ml: { n: 2, s: {} } } });
    ok('  and a finished game cannot be reopened', r.j.data.games.ml.done === true && r.j.data.games.ml.n === 1e9, r);
    r = await put('anna', { day: D, games: { xx: { n: 5, s: {} }, ml: 'broken', gl: { n: 'many' } } });
    ok('unknown games and broken entries are ignored', !r.j.data.games.xx && r.j.data.games.ml.done === true && r.j.data.games.gl.n === 3, r);
    r = await put('anna', { nonsense: true });
    ok('a malformed upload changes nothing', r.s === 200 && r.j.data.games.gl.n === 3, r);
    r = await call('anna', 'DELETE', '/api/docs/x_run');
    ok('the stored games cannot be deleted', r.s === 403 && (await stored('anna')).data.games.gl.n === 3, r);
    ok('other documents can still be deleted', (await call('anna', 'PUT', '/api/docs/note', { a: 1 })).s === 200 && (await call('anna', 'DELETE', '/api/docs/note')).s === 200 && (await call('anna', 'GET', '/api/docs/note')).j.exists === false);
    ok('other accounts have their own', (await stored('ben')).exists === false);
    r = await put('ben', { day: D, games: { wd: { n: 2, s: { t: 'plant', rows: ['crane'] } } } });
    ok('  and start from the beginning', r.j.data.games.wd.n === 2 && !r.j.data.games.ml);
    ok('nobody reads them without logging in', (await call('nobody', 'GET', '/api/docs/x_run')).s === 401);
    ok("a friend's day view does not show a game in progress", !JSON.stringify((await call('ben', 'GET', '/api/day?date=' + D)).j).includes('crane'));
  } catch (e) { bad++; console.log('FAIL crashed: ' + e.message); }
  srv.kill(); await wait(200);
  process.exitCode = bad ? 1 : 0;
})();
