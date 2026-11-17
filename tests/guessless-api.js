// Guessless is dealt and scored on the server: the browser never sees an answer before its estimate, the server
// scores it, keeps today's game, and owns the Guessless part of the results (x_stats.gl) and archive marks.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 3997, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'gldata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'admins.txt'), 'anna');
const wait = ms => new Promise(r => setTimeout(r, ms));
const { today } = require(path.join(project, 'games-common.js'));
const dealer = require(path.join(project, 'guessless-server.js'))({ cats: require(path.join(project, 'content/guessless.js')), send() {}, readBody() {}, records: () => ({}), docsOf: () => ({}), save() {}, mayArchive: () => true });
(async () => {
  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_FRIENDS: 'everyone' }, stdio: 'ignore' }); await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { s: r.status, j, t }; };
  let bad = 0; const ok = (name, cond, extra) => { if (cond) console.log('ok   ' + name); else { bad++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 300) : '')); } };
  try {
    for (const n of ['anna', 'ben', 'cleo']) await call(n, 'POST', '/api/signup', { username: n, password: 'kiwi-lamp-55' + n.length });
    const D = today(), qs = dealer.dailyDeal(D);
    // two lists: days before NEW_FROM keep the first (frozen) list, later days get the new one; a started game keeps its list
    const OLD = require(path.join(project, 'content/guessless-old.js')), NEW = require(path.join(project, 'content/guessless.js'));
    const from = (list, deal) => deal.every((q, i) => list[i].qs.some(x => x.q === q.q && x.a === q.a));
    const before = '2026-11-10', after = '2026-12-01';
    ok('the switch to the new questions is ' + dealer.NEW_FROM, dealer.NEW_FROM > before && dealer.NEW_FROM < after);
    ok('a day before the switch is dealt from the first list, as it always was', from(OLD, dealer.dailyDeal(before)) && JSON.stringify(dealer.dailyDeal(before)) === JSON.stringify(dealer.dailyDeal(before, { moves: [] })));
    ok('a day after the switch is dealt from the new list', from(NEW, dealer.dailyDeal(after)) && from(NEW, dealer.dailyDeal(after, { v: 2, moves: [] })));
    ok('a game started from the first list keeps it, whatever the date', from(OLD, dealer.dailyDeal(after, { moves: [1] })));
    ok('practice games use the new list', from(NEW, dealer.deal('glp-test')));

    ok('the questions and answers are no longer a public file', (await call('anna', 'GET', '/games-data.js')).s === 404 && (await call('anna', 'GET', '/content/guessless.js')).s === 404);
    let r = await call('anna', 'POST', '/api/gl/start', { daily: true }), v = r.j;
    ok('today\'s game starts with its first question', r.s === 200 && v.daily && v.day === D && v.i === 0 && v.q.q === qs[0].q && v.q.u === qs[0].u && v.q.cat === qs[0].cat, v);
    ok('  without its answer or note', !('a' in v.q) && !('n' in v.q) && !r.t.includes(qs[0].n), v.q);

    r = await call('anna', 'POST', '/api/gl/answer', { daily: true, i: 0, g: qs[0].a });
    ok('a spot-on estimate scores 100, and the answer and note come back', r.s === 200 && r.j.last.pts === 100 && r.j.last.a === qs[0].a && r.j.last.note === qs[0].n && r.j.total === 100, r.j);
    ok('  together with the next question, still without its answer', r.j.q.q === qs[1].q && !('a' in r.j.q));
    r = await call('anna', 'POST', '/api/gl/answer', { daily: true, i: 1, g: qs[1].a * 10 });
    ok('ten times off scores 0', r.j.last.pts === 0 && r.j.total === 100, r.j.last);
    ok('the same question cannot be answered twice', (await call('anna', 'POST', '/api/gl/answer', { daily: true, i: 1, g: qs[1].a })).s === 409);
    ok('only positive numbers count', (await call('anna', 'POST', '/api/gl/answer', { daily: true, i: 2, g: 0 })).s === 400 && (await call('anna', 'POST', '/api/gl/answer', { daily: true, i: 2, g: -5 })).s === 400 && (await call('anna', 'POST', '/api/gl/answer', { daily: true, i: 2, g: '7' })).s === 400);
    r = await call('anna', 'POST', '/api/gl/start', { daily: true });
    ok('starting again continues the same game', r.j.i === 2 && r.j.q.q === qs[2].q && r.j.total === 100, r.j);
    v = r.j;
    while (!v.done) v = (await call('anna', 'POST', '/api/gl/answer', { daily: true, i: v.i, g: qs[v.i].a * 2 })).j;
    const pts2 = Math.round(100 * (1 - Math.log10(2)));
    ok('the end: the total, the result and the new numbers', v.done && v.total === 100 + 3 * pts2 && v.rec.total === v.total && v.rec.res.length === 5 && v.stats.best === v.total && v.stats.played === 1 && v.stats.day === D, v);
    let st = (await call('anna', 'GET', '/api/docs/x_stats')).j.data;
    ok('the result is stored in x_stats.gl', st.gl.days[D].total === v.total && st.gl.days[D].res[0].g === qs[0].a, st.gl);
    ok('a finished game takes no more estimates', (await call('anna', 'POST', '/api/gl/answer', { daily: true, i: 5, g: 1 })).s === 409);
    ok('opening it again shows the result', (await call('anna', 'POST', '/api/gl/start', { daily: true })).j.rec.total === v.total);
    ok('friends see the total', ((await call('ben', 'GET', '/api/day?date=' + D)).j.players.find(p => p.id === 'anna') || {}).gl.total === v.total);

    await call('anna', 'PUT', '/api/docs/x_stats', { gl: { days: { [D]: { total: 500 } }, best: 500 }, settings: { sound: 'off' } });
    st = (await call('anna', 'GET', '/api/docs/x_stats')).j.data;
    ok('a browser upload cannot change the Guessless results', st.gl.days[D].total === v.total && st.gl.best === v.total && st.settings.sound === 'off', st.gl);
    await call('cleo', 'PUT', '/api/docs/x_stats', { gl: { days: { [D]: { total: 500 } } } });
    ok('an account that never played shows no total, whatever it uploads', !((await call('ben', 'GET', '/api/day?date=' + D)).j.players.find(p => p.id === 'cleo') || {}).gl);

    r = await call('ben', 'POST', '/api/gl/start', { daily: false }); v = r.j;
    ok('a practice game starts, without answers', r.s === 200 && !v.daily && v.q && !('a' in v.q));
    while (!v.done) v = (await call('ben', 'POST', '/api/gl/answer', { daily: false, i: v.i, g: 100 })).j;
    st = (await call('ben', 'GET', '/api/docs/x_stats')).j.data;
    ok('a finished practice game counts as played, but is no day result', v.done && st.gl.played === 1 && !Object.keys(st.gl.days).length, st.gl);

    await call('cleo', 'PUT', '/api/docs/x_run', { day: D, games: { gl: { n: 5, s: { day: D, gl: { daily: true, qs, i: 2, answered: true, res: [{ q: qs[0].q, g: 5 }, { q: qs[1].q, g: 7 }] } } } } });
    r = await call('cleo', 'POST', '/api/gl/start', { daily: true });
    ok('a game started in the browser before continues with its estimates', r.j.i === 2 && r.j.q.q === qs[2].q, r.j);

    const Y = new Date(Date.parse(D + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10), yq = dealer.dailyDeal(Y);
    ok('a past day needs Plus', (await call('ben', 'POST', '/api/gl/start', { daily: true, day: Y })).s === 403);
    await call('anna', 'POST', '/api/admin/plus', { user: 'anna', on: true });
    r = await call('anna', 'POST', '/api/gl/start', { daily: true, day: Y }); v = r.j;
    ok('with Plus a past day is dealt as that day', r.s === 200 && v.q.q === yq[0].q, v);
    while (!v.done) v = (await call('anna', 'POST', '/api/gl/answer', { daily: true, day: Y, i: v.i, g: yq[v.i].a })).j;
    const late = (await call('anna', 'GET', '/api/docs/x_late')).j.data;
    ok('and marked late', v.done && v.total === 500 && late.days[Y].gl === 1, late);
    r = await call('anna', 'GET', '/api/account/export');
    ok('the data download includes the Guessless games', r.j.guessless && r.j.guessless[D] && r.j.guessless[D].moves.length === 5);
  } catch (e) { bad++; console.log('FAIL crashed: ' + e.stack); }
  srv.kill(); await wait(200);
  process.exitCode = bad ? 1 : 0;
})();
