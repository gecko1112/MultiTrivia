// Levels and achievements on the server (levels-server.js): worked out from recorded results, announced once,
// the browser cannot write them, only Fermi's four achievements are reported by the browser, friends' achievements
// are found by the server, and the streak rule is the same as the browser's (public/day.js).
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { importData } = require('./seed');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 4004, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'lvldata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = [], ok = (n, c) => out.push([n, !!c]);
(async () => {
  // ---- the streak rule: the server's copy against the browser's, on fixed and random cases
  const win = { location: { search: '' } };
  vm.runInNewContext(fs.readFileSync(path.join(project, 'public', 'day.js'), 'utf8'), { window: win, location: win.location, localStorage: { getItem: () => null }, URLSearchParams, Date, String });
  const { streak, levelFor } = require(path.join(project, 'levels-server.js'));
  const day = n => new Date(Date.UTC(2026, 9, 1) + n * 864e5).toISOString().slice(0, 10);
  let same = true, cases = 0;
  for (let i = 0; i < 400; i++) {
    const keys = [...new Set(Array.from({ length: 1 + (i % 25) }, () => day(Math.floor(Math.random() * 60))))];
    const today = day(40 + (i % 25)), saver = i % 2 === 0;
    if (JSON.stringify(streak(keys, saver, today)) !== JSON.stringify(win.bpStreak(keys, saver, today))) same = false;
    cases++;
  }
  ok('the server counts streaks exactly like the browser (' + cases + ' cases)', same);
  ok('levels: 150 XP to level 2, then 200 more to level 3', levelFor(149).lv === 1 && levelFor(150).lv === 2 && levelFor(349).lv === 2 && levelFor(350).lv === 3);

  const boot = () => spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_FRIENDS: 'everyone' }, stdio: 'ignore' });
  let srv = boot(); await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const PW = { anna: 'kiwi-lamp-4461', ben: 'kiwi-lamp-4462', cleo: 'kiwi-lamp-4463', dan: 'kiwi-lamp-4464', eve: 'kiwi-lamp-4465' };
  const signin = async () => { for (const n of Object.keys(PW)) if ((await call(n, 'POST', '/api/signup', { username: n, password: PW[n] })).s !== 200) await call(n, 'POST', '/api/login', { username: n, password: PW[n] }); };
  const restart = async () => { await wait(450); srv.kill(); await wait(400); srv = boot(); await up(PORT); await signin(); };
  const levels = who => call(who, 'GET', '/api/levels').then(r => r.j);
  const got = (v, id) => v.achievements.find(a => a.id === id).got;
  try {
    await signin();
    let v = await levels('anna');
    ok('a new account: level 1, no XP, nothing earned', v.level === 1 && v.xp === 0 && !v.achievements.some(a => a.got) && v.first === true && !v.fresh.length);
    ok('secret achievements keep their name to themselves', v.achievements.filter(a => a.secret).every(a => a.name === null && a.desc === null));
    ok('progress is sent for the counting ones', JSON.stringify(v.achievements.find(a => a.id === 'days7').prog) === '[0,7]');

    // ---- results recorded by the server count; the same day for four players
    const D = '2026-11-10';
    importData(data, {
      anna: { stats: { ml: { days: { [D]: { score: 22 } }, best: 22, played: 1 } } },
      ben: { stats: { ml: { days: { [D]: { score: 18 } }, best: 18, played: 1 } } },
      cleo: { stats: { ml: { days: { [D]: { score: 15 } }, best: 15, played: 1 } } },
      dan: { stats: { ml: { days: { [D]: { score: 9 } }, best: 9, played: 1 } } },
      eve: { stats: { ml: { days: { [D]: { score: 25 } }, best: 25, played: 1 } }, late: { [D]: { ml: 1 } } }
    });
    await restart();
    v = await levels('anna');
    const ids = v.fresh.map(a => a.id).sort().join();
    ok('a recorded daily earns its achievements, announced in this reply', ['first', 'ml13', 'ml20', 'company', 'top'].every(id => ids.includes(id)));
    // 1 daily (40) + 1 game (10) + first 50 + ml13 50 + ml20 150 + company 75 + top 100
    ok('XP adds up: dailies, games and achievements', v.xp === 40 + 10 + 50 + 50 + 150 + 75 + 100);
    ok('levels up from the XP', v.level === levelFor(v.xp).lv && v.title === 'Bench player');
    ok('what was announced is not announced again', !(await levels('anna')).fresh.length);
    const bv = await levels('ben');
    ok('"Good company": three others played that day', got(bv, 'company'));
    ok('"Top of the table": only for the best result of the day', !got(bv, 'top') && got(v, 'top'));
    const ev = await levels('eve');
    ok('a game played later through the archive counts for neither, and beats nobody', !got(ev, 'company') && !got(ev, 'top') && got(v, 'top'));

    // ---- the browser cannot write or remove its achievements
    await call('cleo', 'PUT', '/api/docs/x_ach', { got: {}, flags: { top: 1, company: 1, poke: 1 }, lvl: 30 });
    v = await levels('cleo');
    ok('writing the achievements document from the browser changes nothing', !got(v, 'top') && !got(v, 'poke') && v.level < 5);
    await call('cleo', 'DELETE', '/api/docs/x_ach');
    ok('nor does deleting it', !(await levels('cleo')).first);

    // ---- Fermi: the only achievements the browser reports
    const before = (await levels('ben')).xp;
    let r = await call('ben', 'POST', '/api/levels/flag', { id: 'poke' });
    ok("Fermi's achievements are reported by the browser", r.s === 200 && got(r.j, 'poke') && r.j.xp === before + 25 && r.j.fresh.some(a => a.id === 'poke'));
    ok('and show their name once found', r.j.achievements.find(a => a.id === 'poke').name === 'There he is');
    r = await call('ben', 'POST', '/api/levels/flag', { id: 'poke' });
    ok('only once', r.j.xp === before + 25 && !r.j.fresh.length);
    ok('no other achievement can be reported', (await call('ben', 'POST', '/api/levels/flag', { id: 'top' })).s === 400 && (await call('ben', 'POST', '/api/levels/flag', { id: 'ml25' })).s === 400);
    ok('needs a login', (await call('nobody', 'GET', '/api/levels')).s === 401);

    // ---- level up is announced
    importData(data, { cleo: { stats: { gl: { days: { [D]: { total: 460 } }, best: 460, played: 1 } } } });
    await restart();
    v = await levels('cleo');
    ok('a new level is announced', v.levelUp === true && v.fresh.some(a => a.id === 'gl450'));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
