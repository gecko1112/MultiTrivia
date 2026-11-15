// Survival is dealt, timed and judged on the server: no answer before its estimate, the server's clock decides what was
// too late (and never pauses), the server works out life and score, keeps today's run, the day result (x_daily) and the
// best runs, none of which a browser can upload.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 4001, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'svdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'admins.txt'), 'anna');
const wait = ms => new Promise(r => setTimeout(r, ms));
const { today } = require(path.join(project, 'games-common.js'));
const Q = require(path.join(project, 'content/survival.js')), PACKS = require(path.join(project, 'content/packs.js'));
const dealer = require(path.join(project, 'survival-server.js'))({ questions: Q, packs: PACKS, send() {}, readBody() {}, records: () => ({}), docsOf: () => ({}), save() {}, mayArchive: () => true, hasPlus: () => true });
(async () => {
  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_FRIENDS: 'everyone' }, stdio: 'ignore' }); await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { s: r.status, j, t }; };
  let bad = 0; const ok = (name, cond, extra) => { if (cond) console.log('ok   ' + name); else { bad++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 300) : '')); } };
  const near = (x, y) => Math.abs(x - y) < 1e-9;
  try {
    for (const n of ['anna', 'ben', 'cleo']) await call(n, 'POST', '/api/signup', { username: n, password: 'kiwi-lamp-88' + n.length });
    const D = today(), seq = dealer.dailySeq(D, 30);
    const act = (who, a, body) => call(who, 'POST', '/api/sv/' + a, Object.assign({ daily: true }, body));

    const page = (await call('anna', 'GET', '/')).t;
    ok('the questions and answers are no longer in the page or a public file', !page.includes(Q[0].q) && !page.includes(Q[5].n) && (await call('anna', 'GET', '/packs-data.js')).s === 404 && (await call('anna', 'GET', '/content/survival.js')).s === 404);
    let r = await act('anna', 'start', {});
    ok('today\'s run starts with its first question, ten lives and the 15-second clock running', r.s === 200 && r.j.daily && r.j.q.q === seq[0].q && r.j.life === 10 && r.j.timer === 15 && r.j.left > 13000 && r.j.left <= 15000, r.j);
    ok('  without the answer or its note', !('a' in r.j.q) && !r.t.includes(seq[0].n));
    ok('the menu now says the run is going', (await call('anna', 'GET', '/api/sv/home')).j.going === true);

    r = await act('anna', 'answer', { i: 0, g: seq[0].a });
    ok('a spot-on estimate heals (life stays at the most, ten) and counts', r.j.last.healed && near(r.j.last.dmg, -0.2) && r.j.life === 10 && r.j.score === 1 && r.j.last.a === seq[0].a && r.j.last.note === seq[0].n, r.j.last);
    ok('  the next question comes with it, without its answer', r.j.q.q === seq[1].q && !('a' in r.j.q));
    r = await act('anna', 'answer', { i: 1, g: seq[1].a * 10 });
    ok('ten times off costs one life', near(r.j.last.dmg, 1) && near(r.j.life, 9) && r.j.score === 2, r.j.last);
    r = await act('anna', 'answer', { i: 2, g: null });
    ok('running out of time costs two', r.j.last.timeout && r.j.last.dmg === 2 && near(r.j.life, 7), r.j.last);
    ok('the same question cannot be answered twice', (await act('anna', 'answer', { i: 2, g: 5 })).s === 409);
    ok('only positive numbers, or "time\'s up"', (await act('anna', 'answer', { i: 3, g: -1 })).s === 400 && (await act('anna', 'answer', { i: 3, g: 'x' })).s === 400);
    await wait(1200);
    r = await act('anna', 'start', {});
    ok('opening it again continues the same run, and its clock has kept running', r.j.i === 3 && r.j.q.q === seq[3].q && near(r.j.life, 7) && r.j.left < 14000, r.j);
    let v = r.j;
    while (!v.done) v = (await act('anna', 'answer', { i: v.i, g: seq[v.i].a * 1e5 })).j;
    ok('the run ends when the lives are gone (the answer that leaves 2 still counts): score, result and its place in the best runs', v.done && v.score === 4 && v.result.score === 4 && v.result.h.length === 5 && v.result.placed === 0 && typeof v.result.id === 'string', v);
    let x = (await call('anna', 'GET', '/api/docs/x_daily')).j.data;
    ok('the day result is stored in x_daily, in the old shape', x.days[D].score === 4 && x.days[D].h.length === 5 && typeof x.days[D].avg === 'number', x);
    let docs = (await call('anna', 'GET', '/api/docs')).j.docs, runs = docs.filter(d => !d.id.startsWith('x_') && typeof d.data.score === 'number');
    ok('and the run is one of the best runs', runs.length === 1 && runs[0].data.score === 4 && runs[0].data.timer === 15, runs);
    ok('a finished run takes no more answers', (await act('anna', 'answer', { i: 5, g: 1 })).s === 409);
    ok('opening it again shows the result; the menu says done', (await act('anna', 'start', {})).j.done === true && (await call('anna', 'GET', '/api/sv/home')).j.done === true);
    ok('friends see the score', ((await call('ben', 'GET', '/api/day?date=' + D)).j.players.find(p => p.id === 'anna') || {}).sv.score === 4);

    await call('anna', 'PUT', '/api/docs/x_daily', { days: { [D]: { score: 99, h: [] } } });
    ok('a browser upload cannot change the day result', (await call('anna', 'GET', '/api/docs/x_daily')).j.data.days[D].score === 4);
    ok('nor upload a run', (await call('anna', 'PUT', '/api/docs/9999-fake', { t: 1, score: 99, h: [] })).s === 403);
    ok('nor change or delete one', (await call('anna', 'PUT', '/api/docs/' + runs[0].id, { note: 'x' })).s === 403 && (await call('anna', 'DELETE', '/api/docs/' + runs[0].id)).s === 403);
    await call('cleo', 'PUT', '/api/docs/x_daily', { days: { [D]: { score: 50, h: [] } } });
    ok('an account that never played shows no score, whatever it uploads', !((await call('ben', 'GET', '/api/day?date=' + D)).j.players.find(p => p.id === 'cleo') || {}).sv);

    // practice: timer choice, the clock judged by the server, End run, packs
    r = await call('ben', 'POST', '/api/sv/start', { daily: false, timer: 0 });
    ok('a practice run without a timer has no clock', r.s === 200 && !r.j.daily && r.j.timer === 0 && r.j.left === null && !('a' in r.j.q), r.j);
    r = await call('ben', 'POST', '/api/sv/end', { daily: false });
    ok('"End run" ends it with the score so far', r.j.done && r.j.result.score === 0, r.j);
    r = await call('ben', 'POST', '/api/sv/start', { daily: false, timer: 15 });
    ok('a practice run with the 15-second clock', r.j.timer === 15 && r.j.left > 13000);
    await wait(16800);
    r = await call('ben', 'POST', '/api/sv/answer', { daily: false, i: 0, g: 123 });
    ok('an estimate that arrives after the time is up counts as running out of time, whatever it says', r.s === 200 && r.j.last.timeout === true && r.j.last.dmg === 2, r.j.last);
    await call('ben', 'POST', '/api/sv/end', { daily: false });
    ok('a question pack needs Plus', (await call('ben', 'POST', '/api/sv/start', { daily: false, pack: 'countries' })).s === 403);
    await call('anna', 'POST', '/api/admin/plus', { user: 'anna', on: true });
    r = await call('anna', 'POST', '/api/sv/start', { daily: false, pack: 'countries', timer: 0 });
    ok('with Plus a pack run asks the pack\'s questions', r.s === 200 && r.j.pack === PACKS.countries.name && PACKS.countries.q.some(q => q.q === r.j.q.q), r.j);
    r = await call('anna', 'POST', '/api/sv/end', { daily: false });
    ok('  and is not ranked among the best runs', r.j.done && r.j.result.placed === undefined && (await call('anna', 'GET', '/api/docs')).j.docs.filter(d => !d.id.startsWith('x_') && typeof d.data.score === 'number').length === 1, r.j);
    const home = (await call('anna', 'GET', '/api/sv/home')).j;
    ok('the menu lists the packs by name only', Array.isArray(home.packs) && home.packs[0].name === PACKS.countries.name && !JSON.stringify(home).includes(String(PACKS.countries.q[0].a)), home);

    // a run started in the browser before carries over; past days; clearing runs; the data download
    await call('cleo', 'PUT', '/api/docs/x_run', { day: D, games: { sv: { n: 3, s: { mode: 'daily', day: D, life: 9, score: 1, history: [{ q: seq[0].q, u: seq[0].u, a: seq[0].a, g: seq[0].a * 10, dmg: 1 }], answered: true } } } });
    r = await call('cleo', 'POST', '/api/sv/start', { daily: true });
    ok('a daily run started in the browser before continues with its estimates', r.j.i === 1 && near(r.j.life, 9) && r.j.q.q === seq[1].q, r.j);
    const Y = new Date(Date.parse(D + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10), yseq = dealer.dailySeq(Y, 3);
    ok('a past day needs Plus', (await call('ben', 'POST', '/api/sv/start', { daily: true, day: Y })).s === 403);
    r = await act('anna', 'start', { day: Y });
    ok('with Plus a past day asks that day\'s questions', r.s === 200 && r.j.q.q === yseq[0].q, r.j);
    await act('anna', 'end', { day: Y });
    const late = (await call('anna', 'GET', '/api/docs/x_late')).j.data;
    ok('and is marked late', late.days[Y].sv === 1, late);
    r = await call('anna', 'GET', '/api/account/export');
    ok('the data download includes the Survival runs', r.j.survival && r.j.survival[D] && r.j.survival[D].moves.length === 5);
    await call('anna', 'POST', '/api/sv/clear-runs', {});
    ok('"Clear saved runs" removes the best runs', (await call('anna', 'GET', '/api/docs')).j.docs.filter(d => !d.id.startsWith('x_') && typeof d.data.score === 'number').length === 0);
  } catch (e) { bad++; console.log('FAIL crashed: ' + e.stack); }
  srv.kill(); await wait(200);
  process.exitCode = bad ? 1 : 0;
})();
