// Hunch (hunch-server.js): guess the game character from hints that get more specific; fewer hints, more points.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 4008, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'hudata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
fs.writeFileSync(path.join(data, 'admins.txt'), 'dan\n');
const games = require(path.join(project, 'content', 'hunch.js')), create = require(path.join(project, 'hunch-server.js'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = [], ok = (n, c) => out.push([n, !!c]);
const make = secret => create({ games, send() {}, readBody() {}, records: () => ({}), save() {}, secret, mayArchive: () => false });
const list = xs => (xs.length ? ' (' + xs.slice(0, 6).join(', ') + ')' : '');
(async () => {
  // ---- the content, every game
  const ids = games.map(g => g.id);
  ok('five games, each with an id, a name and a short name', ids.join() === 'dota,wow,lol,overwatch,valorant' && games.every(g => g.name && g.short && g.short.length <= 10));
  const cards = games.flatMap(g => g.cards.map(c => Object.assign({ game: g.id }, c)));
  ok('every character that can come up is also a name players can guess' + list(cards.filter(c => !games.find(g => g.id === c.game).names.includes(c.name)).map(c => c.name)), cards.every(c => games.find(g => g.id === c.game).names.includes(c.name)));
  ok('no name twice in one game', games.every(g => new Set(g.names).size === g.names.length));
  ok('at least 15 characters in each game', games.every(g => g.cards.length >= 15));
  // Dota 2, League and Overwatch: every character can come up (the owner asked for all of them, 2026-11-17)
  const NOT_YET = ['Kez'];                               // not enough known about him for fair hints
  const missing = games.filter(g => ['dota', 'lol', 'overwatch'].includes(g.id)).flatMap(g => g.names.filter(n => !NOT_YET.includes(n) && !g.cards.some(c => c.name === n)));
  ok('every Dota 2, League and Overwatch character can come up' + list(missing), !missing.length);
  ok('every character has five hints', cards.every(c => c.hints.length === 5 && c.hints.every(h => typeof h === 'string' && h.length > 8)));
  // hints 1 to 4 (lore, looks, what the character does) name neither the character nor a nickname; the last one never the name
  const has = (h, n) => h.toLowerCase().includes(n.toLowerCase());
  const leaks = cards.filter(c => c.hints.some((h, i) => (i < 4 ? [c.name, ...c.alt.filter(a => a.length >= 4)] : [c.name]).some(n => has(h, n))));
  ok('no hint gives away the name or a nickname' + list(leaks.map(c => c.name)), !leaks.length);
  // only the last hint names an ability, so the first four have to be worked out from lore and looks
  const ability = /^One of (his|her|its|their) (abilities|spells) is /;
  const early = cards.filter(c => c.hints.slice(0, 4).some(h => ability.test(h)) || !ability.test(c.hints[4]));
  ok('only the last hint names an ability' + list(early.map(c => c.name)), !early.length);
  ok('no character comes up twice in one game', games.every(g => new Set(g.cards.map(c => c.name)).size === g.cards.length));
  // one spelling never means two different characters (a name in two games is the same answer: "Viper")
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
  const owner = new Map(), clash = [];
  for (const g of games) for (const n of g.names) { const k = norm(n); if (owner.has(k) && owner.get(k) !== n) clash.push(n); owner.set(k, n); }
  for (const c of cards) for (const a of c.alt) { const k = norm(a); if (owner.has(k) && owner.get(k) !== c.name) clash.push(a + ' (' + c.name + ', ' + owner.get(k) + ')'); owner.set(k, c.name); }
  ok('no spelling means two different characters' + list(clash), !clash.length);

  const h = make('x');
  ok('names are recognised with small typos and nicknames', h.identify('pudge') === 'Pudge' && h.identify('Pudgee') === 'Pudge' && h.identify('sf') === 'Shadow Fiend' && h.identify('anti mage') === 'Anti-Mage' && h.identify('Nature\'s prophet') === "Nature's Prophet");
  ok('the other games\' names too ("mccree", "lich king", "soldier 76", "lucio", "kaisa")', h.identify('mccree') === 'Cassidy' && h.identify('lich king') === 'Arthas Menethil' && h.identify('soldier 76') === 'Soldier: 76' && h.identify('lucio') === 'Lúcio' && h.identify('kaisa') === "Kai'Sa" && h.identify('Sylvanass') === 'Sylvanas Windrunner');
  ok('short names need the exact spelling ("Lina" is never "Lion")', h.identify('lina') === 'Lina' && h.identify('lion') === 'Lion' && h.identify('lino') === null);
  ok('a name that is not on the list is not recognised', h.identify('Mario') === null && h.identify('') === null);
  const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));
  const picked = new Set(days.map(d => h.dailyCard(d).split(':')[0]));
  ok('over two months, today\'s character comes from every game', ids.every(id => picked.has(id)));
  ok('with only one game on, today\'s character is from that game', days.every(d => h.dailyCard(d, ['valorant']).startsWith('valorant:')));
  ok('a player who kept today\'s game on gets the same character as everybody', days.every(d => { const all = h.dailyCard(d), g = all.split(':')[0]; return h.dailyCard(d, [g, ids.find(x => x !== g)]) === all; }));

  // ---- playing, on a server (its secret picks the day's character, so it is read from its database first)
  const boot = () => spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: 'ignore' });
  let srv = boot(); await up(PORT); await wait(450); srv.kill(); await wait(400);
  const secret = require('./db.js').readDb(project, data).secret;
  srv = boot(); await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    await call('anna', 'POST', '/api/signup', { username: 'anna', password: 'kiwi-lamp-44a1' });
    const S = make(secret);
    let home = (await call('anna', 'GET', '/api/hu/home')).j;
    const card = S.card(S.dailyCard(home.date)), answer = card.name;
    ok('the menu lists the five games, all on, and no choice without Plus', home.games.length === 5 && home.games.every(g => g.on) && home.choose === false);
    ok('without Plus the games cannot be changed', (await call('anna', 'POST', '/api/hu/games', { skip: ['wow'] })).s === 403);
    const wrongs = cards.map(c => c.name).filter(n => n !== answer);
    let v = (await call('anna', 'POST', '/api/hu/start', { daily: true })).j;
    ok('today\'s round starts with one hint, worth 100', v.k === 1 && v.hints.length === 1 && v.worth === 100 && !v.done && v.games.length === 5);
    ok('neither the answer nor its game is sent before the end', !('answer' in v) && !('game' in v) && !JSON.stringify(v).includes(answer));
    let r = await call('anna', 'POST', '/api/hu/guess', { daily: true, n: 0, text: 'Mario' });
    ok('a name not on the list is refused and costs nothing', r.s === 400 && r.j.unknown && (await call('anna', 'POST', '/api/hu/start', { daily: true })).j.k === 1);
    r = await call('anna', 'POST', '/api/hu/guess', { daily: true, n: 0, text: wrongs[0] });
    ok('a wrong guess shows the next hint, now worth 80', r.j.k === 2 && r.j.worth === 80 && r.j.wrong[0] === wrongs[0]);
    ok('the same wrong name twice is refused', (await call('anna', 'POST', '/api/hu/guess', { daily: true, n: 1, text: wrongs[0] })).s === 400);
    r = await call('anna', 'POST', '/api/hu/hint', { daily: true, n: 1 });
    ok('"Next hint" shows the next one too', r.j.k === 3 && r.j.hints.length === 3);
    ok('a step from an old screen is refused', (await call('anna', 'POST', '/api/hu/hint', { daily: true, n: 1 })).s === 409);
    r = await call('anna', 'POST', '/api/hu/guess', { daily: true, n: 2, text: answer.toLowerCase() });
    ok('the right name with three hints shown is worth 60; the answer, its game and all hints are shown', r.j.done && r.j.won && r.j.pts === 60 && r.j.answer === answer && r.j.game === games.find(g => g.id === card.game).name && r.j.hints.length === 5);
    ok('today\'s round cannot be played again', (await call('anna', 'POST', '/api/hu/start', { daily: true })).j.done && (await call('anna', 'POST', '/api/hu/hint', { daily: true, n: 3 })).s === 409);
    const hm = (await call('anna', 'GET', '/api/hu/home')).j;
    ok('the menu shows today\'s result and the stats', hm.done && hm.result.won && hm.result.pts === 60 && hm.stats.played === 1 && hm.stats.points === 60);
    // practice: four hints, then the last one cannot be skipped, and a wrong guess ends it with 0
    v = (await call('anna', 'POST', '/api/hu/start', { daily: false })).j;
    for (let n = 0; n < 4; n++) v = (await call('anna', 'POST', '/api/hu/hint', { daily: false, n })).j;
    ok('after five hints there are no more', v.k === 5 && v.worth === 20 && (await call('anna', 'POST', '/api/hu/hint', { daily: false, n: 4 })).s === 409);
    const notIt = games.flatMap(g => g.names).find(n => !cards.some(c => c.name === n));       // a character that can never be the answer
    r = await call('anna', 'POST', '/api/hu/guess', { daily: false, n: 4, text: notIt });
    ok('a wrong guess on the last hint ends the round with 0', r.j.done && !r.j.won && r.j.pts === 0 && !!r.j.answer && !!r.j.game);
    v = (await call('anna', 'POST', '/api/hu/start', { daily: false })).j;
    r = await call('anna', 'POST', '/api/hu/giveup', { daily: false, n: 0 });
    ok('giving up ends it too', r.j.done && !r.j.won);
    const nm = (await call('anna', 'GET', '/api/hu/names')).j;
    ok('every name for the suggestions, with its games ("Viper": Dota 2 and Valorant)', nm.games.length === 5 && nm.names.length === new Set(games.flatMap(g => g.names)).size && nm.names.find(x => x.n === 'Viper').g.join() === 'dota,valorant');
    ok('needs a login', (await call('nobody', 'GET', '/api/hu/home')).s === 401);

    // ---- Plus: switching games off
    await call('dan', 'POST', '/api/signup', { username: 'dan', password: 'kiwi-lamp-44a4' });
    await call('dan', 'POST', '/api/admin/plus', { user: 'dan', on: true });
    ok('Plus members may choose', (await call('dan', 'GET', '/api/hu/home')).j.choose === true);
    ok('switching every game off is refused', (await call('dan', 'POST', '/api/hu/games', { skip: ids })).s === 400);
    ok('an unknown game is refused', (await call('dan', 'POST', '/api/hu/games', { skip: ['tetris'] })).s === 400);
    r = await call('dan', 'POST', '/api/hu/games', { skip: ['dota', 'wow', 'lol', 'overwatch'] });
    ok('four games off: only Valorant is left on', r.s === 200 && r.j.games.filter(g => g.on).map(g => g.id).join() === 'valorant');
    v = (await call('dan', 'POST', '/api/hu/start', { daily: true })).j;
    const mine = S.card(S.dailyCard(home.date, ['valorant']));
    ok('today\'s round comes from the games left on', v.games.join() === 'valorant');
    ok('a name from a game that is off is refused and costs nothing', (r = await call('dan', 'POST', '/api/hu/guess', { daily: true, n: 0, text: 'Pudge' })).s === 400 && /isn't in the games you picked/.test(r.j.error));
    ok('a name in two games counts for the one that is on', (r = await call('dan', 'POST', '/api/hu/guess', { daily: true, n: 0, text: 'Viper' })).s === 200);
    await call('dan', 'POST', '/api/hu/games', { skip: [] });
    v = (await call('dan', 'POST', '/api/hu/start', { daily: true })).j;
    ok('a round that started keeps its games when they are changed', v.games.join() === 'valorant' && v.n === 1);
    r = await call('dan', 'POST', '/api/hu/guess', { daily: true, n: 1, text: mine.name });
    ok('...and its character', mine.name === 'Viper' ? r.s === 409 : r.j.won && r.j.answer === mine.name && r.j.game === 'Valorant');
    await call('dan', 'POST', '/api/hu/games', { skip: ['valorant'] });
    await call('dan', 'POST', '/api/admin/plus', { user: 'dan', on: false });
    ok('when Plus ends, all games are back on (the choice is kept for later)', (await call('dan', 'GET', '/api/hu/home')).j.games.every(g => g.on));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
