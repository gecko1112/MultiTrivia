// Clueless is picked and judged on the server: the browser learns a word's rank only by guessing it and the hidden
// word only at the end; hints come from the server; today's game is kept there; x_stats.cl belongs to the server.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 4000, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'cldata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'admins.txt'), 'anna');
const wait = ms => new Promise(r => setTimeout(r, ms));
const { today } = require(path.join(project, 'games-common.js'));
const C = require(path.join(project, 'content/clueless.js'));
const judge = require(path.join(project, 'clueless-server.js'))({ data: C, send() {}, readBody() {}, records: () => ({}), docsOf: () => ({}), save() {}, mayArchive: () => true });
(async () => {
  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_FRIENDS: 'everyone' }, stdio: 'ignore' }); await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { s: r.status, j, t }; };
  let bad = 0; const ok = (name, cond, extra) => { if (cond) console.log('ok   ' + name); else { bad++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 300) : '')); } };
  try {
    for (const n of ['anna', 'ben', 'cleo']) await call(n, 'POST', '/api/signup', { username: n, password: 'kiwi-lamp-77' + n.length });
    const D = today(), T = judge.dailyTarget(D);
    const far = C.words.find(w => w !== T && judge.rankOf(T, w) > 5000), mid = C.words.find(w => w !== T && judge.rankOf(T, w) > 200 && judge.rankOf(T, w) < 1000);
    const act = (who, a, body) => call(who, 'POST', '/api/cl/' + a, Object.assign({ daily: true }, body));

    ok('the word list and rankings are no longer a public file', (await call('anna', 'GET', '/clueless-data.js')).s === 404 && (await call('anna', 'GET', '/content/clueless.js')).s === 404);
    let r = await act('anna', 'start', {});
    ok('today\'s game starts empty, without the word', r.s === 200 && r.j.daily && r.j.guesses.length === 0 && !r.j.done && !('word' in r.j) && !('closest' in r.j) && r.j.size === C.words.length, r.j);
    ok('letters only', (await act('anna', 'guess', { i: 0, word: 'two words' })).s === 400);
    r = await act('anna', 'guess', { i: 0, word: 'qwzxqwzx' });
    ok('a word the list does not know is refused, and says so', r.s === 400 && r.j.unknown === true, r.j);
    r = await act('anna', 'guess', { i: 0, word: far });
    ok('a guess comes back with its rank from the server, still without the word', r.s === 200 && r.j.guesses[0].w === far && r.j.guesses[0].r === judge.rankOf(T, far) && !r.j.done && !('word' in r.j) && !r.t.includes('"' + T + '"'), r.j);
    r = await act('anna', 'guess', { i: 0, word: mid });
    ok('a second request for the same step is refused (a double click, a second tab)', r.s === 409);
    r = await act('anna', 'guess', { i: 1, word: far.toUpperCase() });
    ok('a word already guessed is not counted again', r.s === 200 && r.j.dup === far && r.j.guesses.length === 1, r.j);
    r = await act('anna', 'guess', { i: 1, word: mid });
    const best = judge.rankOf(T, mid);
    r = await act('anna', 'hint', { i: 2 });
    ok('a hint is a word at half the best rank or closer, counted as a guess', r.s === 200 && r.j.hints === 1 && r.j.guesses.length === 3 && judge.rankOf(T, r.j.hint) <= Math.max(2, Math.floor(best / 2)) && judge.rankOf(T, r.j.hint) >= 2, { best, hint: r.j.hint, rank: r.j.hint && judge.rankOf(T, r.j.hint) });
    r = await act('anna', 'start', {});
    ok('opening it again continues the same game', r.j.guesses.length === 3 && r.j.hints === 1 && !r.j.done, r.j);
    r = await act('anna', 'guess', { i: 3, word: T });
    ok('the hidden word wins, and only now it comes back with the 30 closest', r.j.done && r.j.won && r.j.word === T && r.j.closest.length === 30 && r.j.stats.played === 1 && r.j.stats.solved === 1, r.j);
    let st = (await call('anna', 'GET', '/api/docs/x_stats')).j.data;
    ok('the result is stored in x_stats.cl, in the old shape', st.cl.days[D].solved === true && st.cl.days[D].guesses === 4 && st.cl.days[D].hints === 1 && st.cl.days[D].word === T && st.cl.days[D].list.length === 4, st.cl.days[D]);
    ok('a finished game takes no more guesses or hints', (await act('anna', 'guess', { i: 4, word: far })).s === 409 && (await act('anna', 'hint', { i: 4 })).s === 409);
    ok('friends see the result', ((await call('ben', 'GET', '/api/day?date=' + D)).j.players.find(p => p.id === 'anna') || {}).cl.guesses === 4);
    await call('anna', 'PUT', '/api/docs/x_stats', { cl: { days: { [D]: { solved: true, guesses: 1 } }, solved: 99, played: 99 } });
    st = (await call('anna', 'GET', '/api/docs/x_stats')).j.data;
    ok('a browser upload cannot change the Clueless results', st.cl.days[D].guesses === 4 && st.cl.played === 1, st.cl);
    await call('cleo', 'PUT', '/api/docs/x_stats', { cl: { days: { [D]: { solved: true, guesses: 1 } } } });
    ok('an account that never played shows no result, whatever it uploads', !((await call('ben', 'GET', '/api/day?date=' + D)).j.players.find(p => p.id === 'cleo') || {}).cl);

    r = await call('ben', 'POST', '/api/cl/start', { daily: false });
    ok('a practice game starts, without the word', r.s === 200 && !r.j.daily && !('word' in r.j));
    r = await call('ben', 'POST', '/api/cl/giveup', { daily: false, i: 0 });
    st = (await call('ben', 'GET', '/api/docs/x_stats')).j.data;
    ok('giving up shows the word; a practice game counts as played but is no day result', r.j.done && !r.j.won && typeof r.j.word === 'string' && r.j.word !== T && st.cl.played === 1 && !Object.keys(st.cl.days).length, { r: r.j, cl: st.cl });

    await call('cleo', 'PUT', '/api/docs/x_run', { day: D, games: { cl: { n: 3, s: { t: T, g: [far, mid], h: 1, done: false } } } });
    r = await call('cleo', 'POST', '/api/cl/start', { daily: true });
    ok('a game started in the browser before continues with its guesses', r.j.guesses.length === 2 && r.j.hints === 1, r.j);

    const Y = new Date(Date.parse(D + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10), YT = judge.dailyTarget(Y);
    ok('a past day needs Plus', (await call('ben', 'POST', '/api/cl/start', { daily: true, day: Y })).s === 403);
    await call('anna', 'POST', '/api/admin/plus', { user: 'anna', on: true });
    await act('anna', 'start', { day: Y });
    r = await act('anna', 'guess', { day: Y, i: 0, word: YT });
    const late = (await call('anna', 'GET', '/api/docs/x_late')).j.data;
    ok('with Plus a past day has that day\'s word and is marked late', r.j.done && r.j.word === YT && late.days[Y].cl === 1, { r: r.j, late });
    r = await call('anna', 'GET', '/api/account/export');
    ok('the data download includes the Clueless games', r.j.clueless && r.j.clueless[D] && r.j.clueless[D].moves.length === 4);
  } catch (e) { bad++; console.log('FAIL crashed: ' + e.stack); }
  srv.kill(); await wait(200);
  process.exitCode = bad ? 1 : 0;
})();
