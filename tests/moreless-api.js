// More/Less is dealt and judged on the server: the browser never sees a number before its call, the server decides
// what was right, keeps today's game, and owns the More/Less part of the results (x_stats.ml) and archive marks.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 3996, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'mldata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'admins.txt'), 'anna');
const wait = ms => new Promise(r => setTimeout(r, ms));
// The test knows the answers the way only the server does: from the same dealing and the server-only data.
const dealer = require(path.join(project, 'moreless-server.js'))({ cats: require(path.join(project, 'content/moreless.js')), questions: require(path.join(project, 'content/survival.js')), send() {}, readBody() {}, records: () => ({}), docsOf: () => ({}), save() {}, mayArchive: () => true });
const rightCall = (cats, ci, si) => (cats[ci].chain[si + 1].v > cats[ci].chain[si].v ? 'more' : 'less');
(async () => {
  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_FRIENDS: 'everyone' }, stdio: 'ignore' }); await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { s: r.status, j, t }; };
  let bad = 0; const ok = (name, cond, extra) => { if (cond) console.log('ok   ' + name); else { bad++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 300) : '')); } };
  try {
    for (const n of ['anna', 'ben', 'cleo', 'dora']) { const s = await call(n, 'POST', '/api/signup', { username: n, password: 'kiwi-lamp-44' + n.length }); if (s.s !== 200) console.log('signup ' + n + ': ' + s.s + ' ' + s.t); }
    const D = dealer.today(), cats = dealer.dailyDeal(D);

    // nothing about the numbers is public any more
    ok('the public data file has no More/Less numbers', !/ML_CATS|Blinding Lights/.test((await call('anna', 'GET', '/games-data.js')).t));
    ok('the server-only data is not served', (await call('anna', 'GET', '/content/moreless.js')).s === 404 && (await call('anna', 'GET', '/../content/moreless.js')).s !== 200);
    ok('the games need a login', (await call('nobody', 'POST', '/api/ml/start', { daily: true })).s === 401);

    let r = await call('anna', 'GET', '/api/ml/home');
    ok('the menu: today, nothing started', r.s === 200 && r.j.date === D && !r.j.done && !r.j.going, r.j);
    r = await call('anna', 'POST', '/api/ml/start', { daily: true });
    let v = r.j;
    ok('today\'s game starts with the first pair', r.s === 200 && v.daily && v.day === D && v.i === 0 && v.ci === 0 && v.si === 0 && v.left.name === cats[0].chain[0].name && v.right.name === cats[0].chain[1].name, v);
    ok('  the left card shows its number, the right card does not', typeof v.left.v === 'number' && v.left.show && !('v' in v.right) && !('show' in v.right), v);
    ok('  and nothing else in the answer gives it away', !r.t.includes(cats[0].chain[1].show) && !JSON.stringify(v).includes(String(cats[0].chain[1].v)));
    ok('the menu now says the game is going', (await call('anna', 'GET', '/api/ml/home')).j.going === true);

    // the server judges: a right call and a wrong call
    r = await call('anna', 'POST', '/api/ml/answer', { daily: true, i: 0, choice: rightCall(cats, 0, 0) });
    ok('a right call is judged right, and the card\'s number comes back', r.s === 200 && r.j.last.ok === true && r.j.last.b.v === cats[0].chain[1].v && r.j.score === 1 && r.j.si === 1, r.j);
    const wrong = rightCall(cats, 0, 1) === 'more' ? 'less' : 'more';
    r = await call('anna', 'POST', '/api/ml/answer', { daily: true, i: 1, choice: wrong });
    ok('a wrong call is judged wrong', r.j.last.ok === false && r.j.score === 1 && r.j.i === 2, r.j);
    ok('the same pair cannot be called twice (a double click, a second tab)', (await call('anna', 'POST', '/api/ml/answer', { daily: true, i: 1, choice: wrong })).s === 409);
    ok('nonsense calls are refused', (await call('anna', 'POST', '/api/ml/answer', { daily: true, i: 2, choice: 'maybe' })).s === 400);
    r = await call('anna', 'POST', '/api/ml/start', { daily: true });
    ok('starting again continues the same game, never a new one', r.j.i === 2 && r.j.score === 1 && r.j.si === 2 && r.j.left.name === cats[0].chain[2].name, r.j);

    // play to the end with right calls
    v = r.j;
    while (!v.done) v = (await call('anna', 'POST', '/api/ml/answer', { daily: true, i: v.i, choice: rightCall(cats, v.ci, v.si) })).j;
    ok('the end: 24 of 25, with the result and the new numbers', v.done && v.score === 24 && v.rec.score === 24 && v.rec.grid.length === 5 && v.rec.log.length === 25 && v.stats.best === 24 && v.stats.played === 1 && v.stats.day === D, v);
    let st = (await call('anna', 'GET', '/api/docs/x_stats')).j;
    ok('the result is stored where every reader looks (x_stats.ml)', st.exists && st.data.ml.days[D].score === 24 && st.data.ml.best === 24 && st.data.ml.played === 1, st);
    ok('a finished game cannot be called on any more', (await call('anna', 'POST', '/api/ml/answer', { daily: true, i: 25, choice: 'more' })).s === 409);
    r = await call('anna', 'POST', '/api/ml/start', { daily: true });
    ok('opening it again shows the result', r.j.done && r.j.rec.score === 24, r.j);
    ok('the menu says done', (await call('anna', 'GET', '/api/ml/home')).j.done === true);
    r = await call('ben', 'GET', '/api/day?date=' + D);
    ok('friends see the score in the day table', (r.j.players.find(p => p.id === 'anna') || {}).ml && r.j.players.find(p => p.id === 'anna').ml.score === 24, r.j);

    // the browser cannot write More/Less results
    r = await call('anna', 'PUT', '/api/docs/x_stats', { ml: { days: { [D]: { score: 25 }, '2026-01-05': { score: 25 } }, best: 25, played: 99 }, settings: { sound: 'off' } });
    st = (await call('anna', 'GET', '/api/docs/x_stats')).j.data;
    ok('a browser upload cannot change the More/Less results', r.s === 200 && st.ml.days[D].score === 24 && !st.ml.days['2026-01-05'] && st.ml.best === 24 && st.ml.played === 1, st.ml);
    ok('  the rest of the upload is kept', st.settings && st.settings.sound === 'off');
    await call('anna', 'DELETE', '/api/docs/x_stats');
    st = (await call('anna', 'GET', '/api/docs/x_stats')).j;
    ok('deleting the document keeps the More/Less results', st.exists && st.data.ml.days[D].score === 24 && !st.data.gl, st);
    await call('cleo', 'PUT', '/api/docs/x_stats', { ml: { days: { [D]: { score: 25 } }, best: 25 } });
    r = await call('ben', 'GET', '/api/day?date=' + D);
    ok('an account that never played shows no score, whatever it uploads', !(r.j.players.find(p => p.id === 'cleo') || {}).ml, r.j.players.find(p => p.id === 'cleo'));

    // practice: new games, judged the same way, counted but not kept as a day
    r = await call('ben', 'POST', '/api/ml/start', { daily: false });
    v = r.j;
    ok('a practice game starts', r.s === 200 && v.daily === false && v.i === 0 && !('v' in v.right), v);
    ok('  and is a different deal from today\'s', v.left.name !== cats[0].chain[0].name || v.right.name !== cats[0].chain[1].name);
    r = await call('ben', 'POST', '/api/ml/answer', { daily: false, i: 0, choice: 'more' });
    ok('  its calls are judged on the server too', r.s === 200 && typeof r.j.last.ok === 'boolean' && typeof r.j.last.b.v === 'number', r.j);
    ok('  "continue" picks it up again', (await call('ben', 'POST', '/api/ml/start', { daily: false, resume: true })).j.i === 1);
    v = r.j; while (!v.done) v = (await call('ben', 'POST', '/api/ml/answer', { daily: false, i: v.i, choice: 'more' })).j;
    st = (await call('ben', 'GET', '/api/docs/x_stats')).j.data;
    ok('a finished practice game counts as played, but is no day result', v.done && v.stats.played === 1 && !v.stats.day && st.ml.played === 1 && !Object.keys(st.ml.days).length, st.ml);
    ok('  and there is nothing left to continue', (await call('ben', 'POST', '/api/ml/start', { daily: false, resume: true })).s === 404);
    await call('ben', 'POST', '/api/ml/start', { daily: false });
    await call('ben', 'POST', '/api/ml/quit', { daily: false });
    ok('a practice game can be thrown away', (await call('ben', 'POST', '/api/ml/start', { daily: false, resume: true })).s === 404 && (await call('ben', 'GET', '/api/ml/home')).j.practice === false);

    // a game started in the browser before the server dealt More/Less continues where it was
    await call('dora', 'PUT', '/api/docs/x_run', { day: D, games: { ml: { n: 4, s: { seed: 'ml-' + D, daily: true, day: D, ci: 0, si: 3, log: [{ choice: 'more' }, { choice: 'less' }, { choice: 'more' }] } } } });
    ok('the menu sees the game in progress', (await call('dora', 'GET', '/api/ml/home')).j.going === true);
    r = await call('dora', 'POST', '/api/ml/start', { daily: true });
    ok('  and it continues with the calls already made', r.j.i === 3 && r.j.si === 3 && r.j.res[0].length === 3, r.j);

    // past days: Plus only, and marked late
    const Y = new Date(Date.parse(D + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
    ok('a past day needs Plus', (await call('ben', 'POST', '/api/ml/start', { daily: true, day: Y })).s === 403 && (await call('ben', 'GET', '/api/ml/home?day=' + Y)).s === 403);
    await call('anna', 'POST', '/api/admin/plus', { user: 'anna', on: true });
    r = await call('anna', 'POST', '/api/ml/start', { daily: true, day: Y });
    const ycats = dealer.dailyDeal(Y);
    ok('with Plus a past day is dealt as that day', r.s === 200 && r.j.day === Y && r.j.left.name === ycats[0].chain[0].name, r.j);
    ok('  but not a day in the future', (await call('anna', 'POST', '/api/ml/start', { daily: true, day: '2099-01-01' })).s === 403);
    v = r.j; while (!v.done) v = (await call('anna', 'POST', '/api/ml/answer', { daily: true, day: Y, i: v.i, choice: rightCall(ycats, v.ci, v.si) })).j;
    const late = (await call('anna', 'GET', '/api/docs/x_late')).j;
    st = (await call('anna', 'GET', '/api/docs/x_stats')).j.data;
    ok('a past day played late is stored and marked late', v.done && st.ml.days[Y].score === 25 && late.exists && late.data.days[Y].ml === 1, { late, y: st.ml.days[Y] });
    await call('anna', 'PUT', '/api/docs/x_late', { days: { [Y]: { xx: 1 } } });
    const late2 = (await call('anna', 'GET', '/api/docs/x_late')).j.data;
    ok('the browser cannot take the late mark away, but keeps its own marks', late2.days[Y].ml === 1 && late2.days[Y].xx === 1, late2);
    await call('anna', 'DELETE', '/api/docs/x_late');
    ok('  not even by deleting the document', (await call('anna', 'GET', '/api/docs/x_late')).j.data.days[Y].ml === 1);

    // the data download includes the calls
    r = await call('anna', 'GET', '/api/account/export');
    ok('the data download includes the More/Less games', r.s === 200 && r.j && r.j.moreLess && r.j.moreLess[D] && r.j.moreLess[D].moves.length === 25, r.s);
  } catch (e) { bad++; console.log('FAIL crashed: ' + e.stack); }
  srv.kill(); await wait(200);
  process.exitCode = bad ? 1 : 0;
})();
