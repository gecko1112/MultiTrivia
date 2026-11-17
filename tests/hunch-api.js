// Hunch (hunch-server.js): guess who it is from hints that get more specific; fewer hints, more points.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 4008, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'hudata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const theme = require(path.join(project, 'content', 'hunch-dota.js')), create = require(path.join(project, 'hunch-server.js'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = [], ok = (n, c) => out.push([n, !!c]);
(async () => {
  // ---- the content
  const names = new Set(theme.heroes);
  ok('every hero that can come up is also a name players can guess', theme.cards.every(c => names.has(c.name)));
  ok('every hero has five hints', theme.cards.every(c => c.hints.length === 5 && c.hints.every(h => typeof h === 'string' && h.length > 8)));
  // hints 1 to 4 (lore, looks, what the hero does) name neither the hero nor a nickname; the last one never the hero's name
  const has = (h, n) => h.toLowerCase().includes(n.toLowerCase());
  const leaks = theme.cards.filter(c => c.hints.some((h, i) => (i < 4 ? [c.name, ...c.alt.filter(a => a.length >= 4)] : [c.name]).some(n => has(h, n))));
  ok('no hint gives away the name or a nickname' + (leaks.length ? ' (' + leaks.map(c => c.name).join(', ') + ')' : ''), !leaks.length);
  // only the last hint names an ability, so the first four have to be worked out from lore and looks
  const ability = /^One of (his|her|its) (abilities|spells) is /;
  const early = theme.cards.filter(c => c.hints.slice(0, 4).some(h => ability.test(h)) || !ability.test(c.hints[4]));
  ok('only the last hint names an ability' + (early.length ? ' (' + early.map(c => c.name).join(', ') + ')' : ''), !early.length);
  ok('no hero comes up twice', new Set(theme.cards.map(c => c.name)).size === theme.cards.length);
  const h = create({ theme, send() {}, readBody() {}, records: () => ({}), save() {}, secret: 'x', mayArchive: () => false });
  ok('names are recognised with small typos and nicknames', h.identify('pudge') === 'Pudge' && h.identify('Pudgee') === 'Pudge' && h.identify('sf') === 'Shadow Fiend' && h.identify('anti mage') === 'Anti-Mage' && h.identify('Nature\'s prophet') === "Nature's Prophet");
  ok('short names need the exact spelling ("Lina" is never "Lion")', h.identify('lina') === 'Lina' && h.identify('lion') === 'Lion' && h.identify('lino') === null);
  ok('a name that is not on the list is not recognised', h.identify('Mario') === null && h.identify('') === null);

  // ---- playing, on a server (its secret picks the day's hero, so it is read from its database first)
  const boot = () => spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: 'ignore' });
  let srv = boot(); await up(PORT); await wait(450); srv.kill(); await wait(400);
  const secret = require('./db.js').readDb(project, data).secret;
  srv = boot(); await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    await call('anna', 'POST', '/api/signup', { username: 'anna', password: 'kiwi-lamp-44a1' });
    const home = (await call('anna', 'GET', '/api/od/home')).j;                // only for today's date as the server sees it
    const answer = theme.cards[create({ theme, send() {}, readBody() {}, records: () => ({}), save() {}, secret, mayArchive: () => false }).dailyCard(home.date)].name;
    const wrongs = theme.cards.map(c => c.name).filter(n => n !== answer);
    let v = (await call('anna', 'POST', '/api/hu/start', { daily: true })).j;
    ok('today\'s round starts with one hint, worth 100', v.k === 1 && v.hints.length === 1 && v.worth === 100 && !v.done);
    ok('the answer is not sent before the end', !('answer' in v) && !JSON.stringify(v).includes(answer));
    let r = await call('anna', 'POST', '/api/hu/guess', { daily: true, n: 0, text: 'Mario' });
    ok('a name not on the list is refused and costs nothing', r.s === 400 && r.j.unknown && (await call('anna', 'POST', '/api/hu/start', { daily: true })).j.k === 1);
    r = await call('anna', 'POST', '/api/hu/guess', { daily: true, n: 0, text: wrongs[0] });
    ok('a wrong guess shows the next hint, now worth 80', r.j.k === 2 && r.j.worth === 80 && r.j.wrong[0] === wrongs[0]);
    ok('the same wrong name twice is refused', (await call('anna', 'POST', '/api/hu/guess', { daily: true, n: 1, text: wrongs[0] })).s === 400);
    r = await call('anna', 'POST', '/api/hu/hint', { daily: true, n: 1 });
    ok('"Next hint" shows the next one too', r.j.k === 3 && r.j.hints.length === 3);
    ok('a step from an old screen is refused', (await call('anna', 'POST', '/api/hu/hint', { daily: true, n: 1 })).s === 409);
    r = await call('anna', 'POST', '/api/hu/guess', { daily: true, n: 2, text: answer.toLowerCase() });
    ok('the right name with three hints shown is worth 60, and the answer and all hints are shown', r.j.done && r.j.won && r.j.pts === 60 && r.j.answer === answer && r.j.hints.length === 5);
    ok('today\'s round cannot be played again', (await call('anna', 'POST', '/api/hu/start', { daily: true })).j.done && (await call('anna', 'POST', '/api/hu/hint', { daily: true, n: 3 })).s === 409);
    const hm = (await call('anna', 'GET', '/api/hu/home')).j;
    ok('the menu shows today\'s result and the stats', hm.done && hm.result.won && hm.result.pts === 60 && hm.stats.played === 1 && hm.stats.points === 60);
    // practice: four hints, then the last one cannot be skipped, and a wrong guess ends it with 0
    v = (await call('anna', 'POST', '/api/hu/start', { daily: false })).j;
    for (let n = 0; n < 4; n++) v = (await call('anna', 'POST', '/api/hu/hint', { daily: false, n })).j;
    ok('after five hints there are no more', v.k === 5 && v.worth === 20 && (await call('anna', 'POST', '/api/hu/hint', { daily: false, n: 4 })).s === 409);
    const notIt = theme.heroes.find(n => !theme.cards.some(c => c.name === n));       // a hero that can never be the answer
    r = await call('anna', 'POST', '/api/hu/guess', { daily: false, n: 4, text: notIt });
    ok('a wrong guess on the last hint ends the round with 0', r.j.done && !r.j.won && r.j.pts === 0 && !!r.j.answer);
    v = (await call('anna', 'POST', '/api/hu/start', { daily: false })).j;
    r = await call('anna', 'POST', '/api/hu/giveup', { daily: false, n: 0 });
    ok('giving up ends it too', r.j.done && !r.j.won);
    ok('every name for the suggestions', (await call('anna', 'GET', '/api/hu/names')).j.names.length === theme.heroes.length);
    ok('needs a login', (await call('nobody', 'GET', '/api/hu/home')).s === 401);
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
