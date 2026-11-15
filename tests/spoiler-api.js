const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { importStats } = require('./seed');
const project = process.argv[2] || require('path').join(__dirname, '..'), readDb = require('./db.js').readDb, patchDb = require('./db.js').patchDb, PORT = 3983, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'sdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const boot = () => spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: 'ignore' });
  let srv = boot(); await wait(900);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };
  await call('anna', 'POST', '/api/signup', { username: 'anna', password: 'kiwi-lamp-4421' });
  await call('ben', 'POST', '/api/signup', { username: 'ben', password: 'kiwi-lamp-4422' });
  const D = '2026-11-12';
  const full = {
    x_stats: { ml: { days: { [D]: { score: 20, grid: [[1, 0]], cats: ['SECRETCAT'], log: [{ a: 'SECRETA', b: 'SECRETB', av: 1, bv: 2, ch: 'more', ok: true }] } } },
      gl: { days: { [D]: { total: 300, res: [{ cat: 'c', q: 'SECRETQ', g: 1, a: 2, u: 'm', pts: 50 }] } } },
      cl: { days: { [D]: { solved: true, guesses: 12, hints: 1, word: 'SECRETWORD', list: [['SECRETGUESS', 3]] } } } },
    x_words: { days: { [D]: { solved: true, guesses: 4, word: 'SECRETWD', rows: ['ggggg'], words: ['SECRT'] } } },
    x_daily: { days: { [D]: { score: 7, avg: 0.5, t: 1, h: [{ q: 'SECRETSV' }] } } },
  };
  for (const id of Object.keys(full)) await call('anna', 'PUT', '/api/docs/' + id, full[id]);
  importStats(data, { anna: { ml: full.x_stats.ml } });                      // More/Less results come from the server, not the browser
  await wait(450); srv.kill(); await wait(400); srv = boot(); await wait(900);   // the wait lets the server write to disk first
  const out = [];
  const day = async who => (await call(who, 'GET', '/api/day?date=' + D)).j;
  let j = await day('ben'), a = j.players.find(p => p.name === 'anna');
  out.push(['nothing secret reaches a player who has not played', !JSON.stringify(j).includes('SECRET')]);
  out.push(['the scores still do', a.ml.score === 20 && a.gl.total === 300 && a.cl.guesses === 12 && a.cl.hints === 1 && a.wd.guesses === 4 && a.wd.solved === true && a.sv.score === 7]);
  out.push(['every game is marked locked', ['sv', 'ml', 'gl', 'cl', 'wd'].every(k => a[k].locked === true)]);
  out.push(['the owner sees their own details', JSON.stringify((await day('anna')).players.find(p => p.me)).includes('SECRETWORD')]);
  await call('ben', 'PUT', '/api/docs/x_words', { days: { [D]: { solved: false, guesses: 6, word: 'x', rows: [], words: [] } } });
  j = await day('ben'); a = j.players.find(p => p.name === 'anna');
  out.push(['after playing Wordy: Wordy opens', !a.wd.locked && a.wd.word === 'SECRETWD']);
  out.push(['the other four stay shut', ['sv', 'ml', 'gl', 'cl'].every(k => a[k].locked) && !JSON.stringify(a).includes('SECRETWORD')]);
  await call('ben', 'PUT', '/api/docs/x_daily', { days: { [D]: { score: null, started: 1 } } });
  a = (await day('ben')).players.find(p => p.name === 'anna');
  out.push(['a Survival daily that was only started does not open it', a.sv.locked === true && !a.sv.h]);
  await call('ben', 'PUT', '/api/docs/x_daily', { days: { [D]: { score: 3, avg: 1, t: 1, h: [] } } });
  a = (await day('ben')).players.find(p => p.name === 'anna');
  out.push(['a finished one does', !a.sv.locked && a.sv.h.length === 1]);
  out.push(['another day is judged on its own', !JSON.stringify(await (async () => { await call('anna', 'PUT', '/api/docs/x_words', { days: { [D]: full.x_words.days[D], '2026-11-11': { solved: true, guesses: 2, word: 'SECRETOLD', rows: [], words: [] } } }); return (await call('ben', 'GET', '/api/day?date=2026-11-11')).j; })()).includes('SECRETOLD')]);
  out.forEach(([n, ok]) => console.log((ok ? 'ok    ' : 'FAIL  ') + n));
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
