// Wordy is picked and judged on the server: the browser never learns the word before its game is over, the server
// checks and colours every guess, keeps today's game, and owns the account's Wordy results (x_words).
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 3999, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'wddata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'admins.txt'), 'anna');
const wait = ms => new Promise(r => setTimeout(r, ms));
const { today } = require(path.join(project, 'games-common.js'));
const words = require(path.join(project, 'content/wordy.js'));
const picker = require(path.join(project, 'wordy-server.js'))({ words, send() {}, readBody() {}, records: () => ({}), docsOf: () => ({}), save() {}, mayArchive: () => true });
(async () => {
  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_FRIENDS: 'everyone' }, stdio: 'ignore' }); await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} return { s: r.status, j, t }; };
  let bad = 0; const ok = (name, cond, extra) => { if (cond) console.log('ok   ' + name); else { bad++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra).slice(0, 300) : '')); } };
  try {
    for (const n of ['anna', 'ben', 'cleo']) await call(n, 'POST', '/api/signup', { username: n, password: 'kiwi-lamp-66' + n.length });
    const D = today(), T = picker.dailyWord(D), other = words.answers.find(w => w !== T && ![...w].some(c => T.includes(c))) || words.answers.find(w => w !== T);
    const g = (who, word, i, extra) => call(who, 'POST', '/api/wd/guess', Object.assign({ daily: true, i, word }, extra));

    ok('the word lists are no longer a public file', (await call('anna', 'GET', '/wordy-data.js')).s === 404 && (await call('anna', 'GET', '/content/wordy.js')).s === 404);
    let r = await call('anna', 'POST', '/api/wd/start', { daily: true });
    ok('today\'s board starts empty, without the word', r.s === 200 && r.j.daily && r.j.rows.length === 0 && !r.j.done && !('word' in r.j) && !r.t.includes(T), r.j);
    ok('opening the board alone stores nothing', (await call('anna', 'GET', '/api/wd/home')).j.going === false);
    ok('too few letters are refused', (await g('anna', 'abc', 0)).s === 400);
    r = await g('anna', 'zqzqz', 0);
    ok('a word that is not in the list is refused, and says so', r.s === 400 && r.j.notWord === true && /word list/.test(r.j.error), r.j);
    r = await g('anna', other, 0);
    ok('a guess is coloured by the server, still without the word', r.s === 200 && r.j.rows.length === 1 && r.j.rows[0].res.join('') === picker.score(other, T).join('') && !r.j.done && !('word' in r.j) && !r.t.includes(T), r.j);
    ok('now the game is going', (await call('anna', 'GET', '/api/wd/home')).j.going === true);
    ok('the same guess cannot be made twice', (await g('anna', other, 0)).s === 409);
    r = await call('anna', 'POST', '/api/wd/start', { daily: true });
    ok('opening it again continues the same game', r.j.rows.length === 1 && r.j.rows[0].w === other, r.j);
    r = await g('anna', T, 1);
    ok('the right word wins in two, and only now the word comes back', r.j.done && r.j.won && r.j.word === T && r.j.fresh === true && r.j.stats.played === 1 && r.j.stats.won === 1 && r.j.stats.streak === 1 && r.j.stats.dist[1] === 1, r.j);
    let w = (await call('anna', 'GET', '/api/docs/x_words')).j.data;
    ok('the result is stored in x_words, in the old shape', w.days[D].solved === true && w.days[D].guesses === 2 && w.days[D].word === T && w.days[D].words.join() === other + ',' + T && w.lastWin === D, w);
    ok('a finished game takes no more guesses', (await g('anna', T, 2)).s === 409);
    r = await call('anna', 'POST', '/api/wd/start', { daily: true });
    ok('opening it again shows the finished game', r.j.done && r.j.won && r.j.word === T && r.j.rows.length === 2 && !r.j.fresh, r.j);
    ok('friends see the result', ((await call('ben', 'GET', '/api/day?date=' + D)).j.players.find(p => p.id === 'anna') || {}).wd.guesses === 2);

    await call('anna', 'PUT', '/api/docs/x_words', { days: { [D]: { solved: true, guesses: 1 } }, played: 50, won: 50, streak: 50 });
    w = (await call('anna', 'GET', '/api/docs/x_words')).j.data;
    ok('a browser upload cannot change the Wordy results', w.days[D].guesses === 2 && w.played === 1 && w.streak === 1, w);
    await call('anna', 'DELETE', '/api/docs/x_words');
    ok('nor can deleting them', (await call('anna', 'GET', '/api/docs/x_words')).j.data.days[D].guesses === 2);
    await call('cleo', 'PUT', '/api/docs/x_words', { days: { [D]: { solved: true, guesses: 1 } } });
    ok('an account that never played shows no result, whatever it uploads', !((await call('ben', 'GET', '/api/day?date=' + D)).j.players.find(p => p.id === 'cleo') || {}).wd);

    r = await call('ben', 'POST', '/api/wd/start', { daily: false });
    ok('a practice word starts, without the word', r.s === 200 && !r.j.daily && !('word' in r.j));
    let v = r.j; for (let i = 0; !v.done && i < 6; i++) v = (await call('ben', 'POST', '/api/wd/guess', { daily: false, i, word: other })).j;
    w = (await call('ben', 'GET', '/api/docs/x_words')).j;
    ok('a practice word ends after six tries with the word, and counts for nothing', v.done && typeof v.word === 'string' && v.word.length === 5 && !v.stats && (!w.exists || !(w.data.played > 0)), { v, w });

    await call('cleo', 'PUT', '/api/docs/x_run', { day: D, games: { wd: { n: 2, s: { t: T, rows: [other] } } } });
    r = await call('cleo', 'POST', '/api/wd/start', { daily: true });
    ok('a game started in the browser before continues with its guesses', r.j.rows.length === 1 && r.j.rows[0].w === other, r.j);

    const Y = new Date(Date.parse(D + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10), YT = picker.dailyWord(Y);
    ok('a past day needs Plus', (await call('ben', 'POST', '/api/wd/start', { daily: true, day: Y })).s === 403);
    await call('anna', 'POST', '/api/admin/plus', { user: 'anna', on: true });
    r = await g('anna', YT, 0, { day: Y });
    w = (await call('anna', 'GET', '/api/docs/x_words')).j.data;
    const late = (await call('anna', 'GET', '/api/docs/x_late')).j.data;
    ok('with Plus a past day has that day\'s word, is marked late, and leaves the streak alone', r.j.done && r.j.won && r.j.word === YT && w.days[Y].guesses === 1 && w.played === 2 && w.streak === 1 && w.lastWin === D && late.days[Y].wd === 1, { r: r.j, w, late });
    r = await call('anna', 'GET', '/api/account/export');
    ok('the data download includes the Wordy games', r.j.wordy && r.j.wordy[D] && r.j.wordy[D].moves.length === 2);
  } catch (e) { bad++; console.log('FAIL crashed: ' + e.stack); }
  srv.kill(); await wait(200);
  process.exitCode = bad ? 1 : 0;
})();
