// Streak saver rules (day.js, run here without a browser) and head-to-head on the server.
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { importStats } = require('./seed');
const project = process.argv[2] || require('path').join(__dirname, '..'), readDb = require('./db.js').readDb, patchDb = require('./db.js').patchDb, PORT = 3985, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'pdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true }); fs.writeFileSync(path.join(data, 'admins.txt'), 'anna');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const out = [];
  // ---- streaks
  const win = { location: { search: '' }, localStorage: { getItem: () => null } };
  vm.runInNewContext(fs.readFileSync(path.join(project, 'public', 'day.js'), 'utf8'), { window: win, location: win.location, localStorage: win.localStorage, URLSearchParams, Date, String });
  const S = win.bpStreak, eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // 2026-11-02 is a Monday
  let r = S(['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06'], false, '2026-11-06');
  out.push(['without Plus a gap breaks the streak', r.now === 2 && r.best === 2 && r.saved.length === 0]);
  r = S(['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06'], true, '2026-11-06');
  out.push(['with Plus one missed day is forgiven and not counted', r.now === 4 && r.best === 4 && eq(r.saved, ['2026-11-04'])]);
  r = S(['2026-11-02', '2026-11-04', '2026-11-06'], true, '2026-11-06');
  out.push(['a second miss in the same week breaks it', r.now === 1 && r.best === 2 && eq(r.saved, ['2026-11-03'])]);
  r = S(['2026-11-02', '2026-11-05'], true, '2026-11-05');
  out.push(['two missed days in a row in one week are not forgiven', r.now === 1 && r.saved.length === 0]);
  r = S(['2026-11-07', '2026-11-10'], true, '2026-11-10');
  out.push(['Sunday and Monday missed: one from each week', r.now === 2 && eq(r.saved, ['2026-11-08', '2026-11-09'])]);
  r = S(['2026-11-02', '2026-11-03'], false, '2026-11-04');
  out.push(['today still open does not break it', r.now === 2]);
  r = S(['2026-11-02', '2026-11-03'], true, '2026-11-05');
  out.push(['yesterday missed, today open: still alive with Plus', r.now === 2 && eq(r.saved, ['2026-11-04'])]);
  r = S(['2026-11-02', '2026-11-03'], false, '2026-11-05');
  out.push(['and gone without', r.now === 0 && r.best === 2]);
  r = S([], true, '2026-11-05');
  out.push(['nothing played', r.now === 0 && r.best === 0 && r.days === 0]);

  // ---- head-to-head
  const boot = () => spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: 'ignore' });
  let srv = boot(); await wait(900);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };
  for (const [n, p] of [['anna', 'kiwi-lamp-4421'], ['ben', 'kiwi-lamp-4422'], ['cleo', 'kiwi-lamp-4423']]) await call(n, 'POST', '/api/signup', { username: n, password: p });
  for (const n of ['anna', 'ben']) await call('anna', 'POST', '/api/admin/plus', { user: n, on: true });
  const put = (who, id, d) => call(who, 'PUT', '/api/docs/' + id, d);
  await put('anna', 'x_stats', { ml: { days: { '2026-11-10': { score: 20 }, '2026-11-11': { score: 15 }, '2026-11-12': { score: 18 } } }, gl: { days: { '2026-11-10': { total: 300 } } }, cl: { days: { '2026-11-10': { solved: true, guesses: 30, hints: 0 }, '2026-11-11': { solved: false, guesses: 50 } } } });
  await put('ben', 'x_stats', { ml: { days: { '2026-11-10': { score: 18 }, '2026-11-11': { score: 15 }, '2026-11-12': { score: 22 } } }, gl: { days: { '2026-11-09': { total: 400 } } }, cl: { days: { '2026-11-10': { solved: true, guesses: 12, hints: 2 }, '2026-11-11': { solved: true, guesses: 90 } } } });
  await put('anna', 'x_words', { days: { '2026-11-10': { solved: true, guesses: 3, word: 'crane' }, '2026-11-11': { solved: true, guesses: 2, word: 'plant' } } });
  await put('ben', 'x_words', { days: { '2026-11-10': { solved: false, guesses: 6, word: 'crane' }, '2026-11-11': { solved: true, guesses: 5, word: 'plant' } } });
  await put('ben', 'x_late', { days: { '2026-11-11': { wd: 1 } } });
  await put('anna', 'x_daily', { days: { '2026-11-10': { score: 9, h: [] }, '2026-11-11': { score: null, started: 1 } } });
  await put('ben', 'x_daily', { days: { '2026-11-10': { score: 9, h: [] }, '2026-11-11': { score: 4, h: [] } } });
  // More/Less results come from the server, not the browser: put in place as an operator would (tests/seed.js)
  importStats(data, { anna: { ml: { days: { '2026-11-10': { score: 20 }, '2026-11-11': { score: 15 }, '2026-11-12': { score: 18 } } } },
    ben: { ml: { days: { '2026-11-10': { score: 18 }, '2026-11-11': { score: 15 }, '2026-11-12': { score: 22 } } } } });
  await wait(450); srv.kill(); await wait(400); srv = boot(); await wait(900);   // the wait lets the server write to disk first
  const a = (await call('anna', 'GET', '/api/h2h')).j.players, b = (await call('ben', 'GET', '/api/h2h')).j.players;
  const vb = a.find(p => p.name === 'ben');
  out.push(['only players with a shared game are listed', a.length === 1 && !!vb]);
  out.push(['More/Less: one won, one lost, one tied', eq(vb.games.ml, [1, 1, 1])]);
  out.push(['Guessless on different days is not compared', !vb.games.gl]);
  out.push(['Clueless: fewer guesses wins, solving beats giving up', eq(vb.games.cl, [0, 2, 0])]);
  out.push(['Wordy: a late game is left out', eq(vb.games.wd, [1, 0, 0])]);
  out.push(['Survival: equal score ties, an unfinished run is not compared', eq(vb.games.sv, [0, 0, 1])]);
  out.push(['totals add up', vb.won === 2 && vb.lost === 3 && vb.tied === 2]);
  const va = b.find(p => p.name === 'anna');
  out.push(['the other side sees the mirror image', va.won === 3 && va.lost === 2 && va.tied === 2]);
  out.push(['no answers in the reply', !/crane|plant/.test(JSON.stringify(a))]);
  out.push(['needs a login', (await call('nobody', 'GET', '/api/h2h')).s === 401]);
  out.forEach(([n, ok]) => console.log((ok ? 'ok    ' : 'FAIL  ') + n));
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
