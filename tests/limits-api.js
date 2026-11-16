// Free limits (limits-server.js): practice games a day in each game, party games to try. Counted on the server.
// anna and ben are admins without Plus: the test checkout is open to them, so the limits apply.
// cleo is not an admin: Plus is not on sale for her, so nothing is limited. dan is an admin with Plus.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path'), vm = require('vm');
const project = process.argv[2] || path.join(__dirname, '..'), { readDb, patchDb } = require('./db.js'), PORT = 4002, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'limdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'admins.txt'), 'anna\nben\ndan\n');
const { PRACTICE_PER_DAY: N, PARTY_TRIALS: T } = require(path.join(project, 'limits-server.js'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = [], ok = (n, c) => out.push([n, !!c]);
(async () => {
  const boot = () => spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: 'ignore' });
  let srv = boot(); await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const login = async () => { for (const [n, p] of [['anna', 'kiwi-lamp-4431'], ['ben', 'kiwi-lamp-4432'], ['cleo', 'kiwi-lamp-4433'], ['dan', 'kiwi-lamp-4434']]) { const r = await call(n, 'POST', '/api/signup', { username: n, password: p }); if (r.s !== 200) await call(n, 'POST', '/api/login', { username: n, password: p }); } };
  await login();
  await call('dan', 'POST', '/api/admin/plus', { user: 'dan', on: true });
  const restart = async () => { await wait(450); srv.kill(); await wait(400); srv = boot(); await up(PORT); };
  try {
    // ---- the numbers on the pages are the numbers the server counts with
    const win = {}; vm.runInNewContext(fs.readFileSync(path.join(project, 'public', 'site-info.js'), 'utf8'), { window: win, document: { body: null, documentElement: {}, addEventListener() {} }, navigator: {}, localStorage: { getItem: () => null } });
    ok('site-info.js says the same numbers as limits-server.js', win.BP_FREE && win.BP_FREE.practicePerDay === N && win.BP_FREE.partyGames === T);

    // ---- practice: each game has its own allowance
    const GAMES = [['ml', '/api/ml', {}], ['gl', '/api/gl', {}], ['cl', '/api/cl', {}], ['wd', '/api/wd', {}], ['sv', '/api/sv', { timer: 0 }],
      ['flags', '/api/geo', { mode: 'flags' }], ['shapes', '/api/geo', { mode: 'shapes' }], ['route', '/api/geo', { mode: 'route' }]];
    const homeLeft = async (who, g, base) => { const j = (await call(who, 'GET', base + '/home')).j; return base === '/api/geo' ? j.practiceLeft && j.practiceLeft[g] : j.practiceLeft; };
    ok('a free account sees ' + N + ' practice games at the start', await homeLeft('anna', 'ml', '/api/ml') === N);
    let r, lefts = [];
    for (let i = 0; i < N; i++) { r = await call('anna', 'POST', '/api/ml/start', { daily: false }); lefts.push(r.j.practiceLeft); }
    ok('every new practice game counts down', JSON.stringify(lefts) === JSON.stringify([...Array(N)].map((_, i) => N - 1 - i)));
    ok('the menu says none are left', await homeLeft('anna', 'ml', '/api/ml') === 0);
    r = await call('anna', 'POST', '/api/ml/start', { daily: false });
    ok('one more is refused, with a reason the page can show', r.s === 403 && r.j.limit === 'practice' && /left today/.test(r.j.error));
    ok('the game that is going can still be continued', (await call('anna', 'POST', '/api/ml/start', { daily: false, resume: true })).s === 200);
    ok("today's daily game is not limited", (await call('anna', 'POST', '/api/ml/start', { daily: true })).s === 200);
    ok('another game still has its own ' + N, await homeLeft('anna', 'gl', '/api/gl') === N);
    for (const [g, base, extra] of GAMES.slice(1)) {
      for (let i = 0; i < N; i++) await call('anna', 'POST', base + '/start', Object.assign({ daily: false }, extra));
      r = await call('anna', 'POST', base + '/start', Object.assign({ daily: false }, extra));
      ok(g + ': refused after ' + N, r.s === 403 && r.j.limit === 'practice' && await homeLeft('anna', g, base) === 0);
    }
    ok('Survival: continuing a run does not count', (await call('anna', 'POST', '/api/sv/start', { daily: false, resume: true })).s === 200);
    ok('Atlas: the daily is not limited', (await call('anna', 'POST', '/api/geo/start', { mode: 'flags', daily: true })).s === 200);

    // ---- who is limited
    ok('Plus not on sale for this account: no limit shown', await homeLeft('cleo', 'ml', '/api/ml') === null);
    for (let i = 0; i < N + 2; i++) r = await call('cleo', 'POST', '/api/ml/start', { daily: false });
    ok('and none applied', r.s === 200 && r.j.practiceLeft === null);
    ok('a Plus account has no limit either', await homeLeft('dan', 'ml', '/api/ml') === null);
    await call('dan', 'POST', '/api/admin/plus', { user: 'anna', on: true });
    r = await call('anna', 'POST', '/api/ml/start', { daily: false });
    ok('getting Plus lifts the limit at once', r.s === 200 && r.j.practiceLeft === null);
    await call('dan', 'POST', '/api/admin/plus', { user: 'anna', on: false });
    ok('losing it brings back what was used today', (await call('anna', 'POST', '/api/ml/start', { daily: false })).s === 403);

    // ---- kept across a restart, new every day
    await restart();
    ok('the count survives a restart', (await call('anna', 'POST', '/api/gl/start', { daily: false })).s === 403);
    await wait(300); srv.kill(); await wait(400);
    patchDb(project, data, db => { db.limits.anna.day = '2026-01-01'; });
    srv = boot(); await up(PORT);
    ok('a new day brings a fresh allowance', await homeLeft('anna', 'ml', '/api/ml') === N && (await call('anna', 'POST', '/api/ml/start', { daily: false })).j.practiceLeft === N - 1);

    // ---- party: opening and joining are free, starting a game uses one of the host's free games
    const P = (who, act, b) => call(who, 'POST', '/api/party/' + act, b);
    const state = async (who, code) => { const res = await fetch(B + '/api/party/' + code + '/events', { headers: { cookie: jar[who] } }); const rd = res.body.getReader(); let t = ''; while (!t.includes('event: state')) t += Buffer.from((await rd.read()).value).toString(); await rd.cancel().catch(() => {}); return JSON.parse(t.split('data: ')[1].split('\n')[0]); };
    const playThrough = async (who, code) => {            // five questions, then back to the lobby
      for (let i = 0; i < 5; i++) { await P(who, code + '/guess', { value: 10 }); await P(who, code + '/next'); }
      return P(who, code + '/again');
    };
    let code = (await P('ben', 'create')).j.code; await P('ben', code + '/join');
    ok('a free account can open a lobby', /^[A-Z]{4}$/.test(code));
    ok('the host is told how many free games are left', (await state('ben', code)).gamesLeft === T);
    const started = [];
    for (let i = 0; i < T; i++) { started.push((await P('ben', code + '/start')).s); await playThrough('ben', code); }
    ok('each game started uses one', started.every(s => s === 200) && (await state('ben', code)).gamesLeft === 0);
    r = await P('ben', code + '/start');
    ok('the next one is refused, with a reason', r.s === 403 && r.j.limit === 'party' && /joining stays free/.test(r.j.error));
    await wait(3100);
    r = await P('ben', 'create');
    ok('no free games left: no new lobby either', r.s === 403 && r.j.limit === 'party');
    const plusCode = (await P('dan', 'create')).j.code; await P('dan', plusCode + '/join'); await P('ben', plusCode + '/join');
    ok('joining is always free', (await state('ben', plusCode)).players.length === 2);
    ok('players who are not the host are told nothing', (await state('ben', plusCode)).gamesLeft === null);
    await P('dan', plusCode + '/leave');
    r = await P('ben', plusCode + '/start');
    ok("a lobby opened with Plus plays freely after the host's role passes on", r.s === 200);
    code = (await P('cleo', 'create')).j.code; await P('cleo', code + '/join');
    for (let i = 0; i < T + 1; i++) { r = await P('cleo', code + '/start'); if (r.s !== 200) break; await playThrough('cleo', code); }
    ok('Plus not on sale for the host: no limit', r.s === 200 && (await state('cleo', code)).gamesLeft === null);

    // ---- the account's own data
    const exp = (await call('anna', 'GET', '/api/account/export')).j;
    ok('the data download includes the counts', exp.freeLimits && exp.freeLimits.used && exp.freeLimits.used.ml === 1);
    await wait(450); srv.kill(); await wait(400);
    const db = readDb(project, data);
    ok('the counts are stored with the account', db.limits.ben.party === T && db.limits.anna.used.ml === 1);
    srv = boot(); await up(PORT);
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
