// Drinks, server only: the one-phone games are dealt and judged by the server.
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || require('path').join(__dirname, '..'), readDb = require('./db.js').readDb, patchDb = require('./db.js').patchDb, PORT = 3979, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'ddata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('FAIL  ' + name + (extra ? '  ' + extra : '')); } };
function player() {
  let cookie = '';
  const p = { async call(method, url, body) {
    const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let j = {}; try { j = JSON.parse(text); } catch (e) {} return { s: r.status, j, text, type: r.headers.get('content-type') || '' };
  }, post: (u, b) => p.call('POST', '/api/drinks/' + u, b || {}), get: u => p.call('GET', '/api/drinks/' + u), cookie: () => cookie };
  return p;
}
(async () => {
  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: 'ignore' }); await wait(900);
  const A = player(), Z = player();
  ok('not logged in is refused', (await A.get('state')).s === 401);
  await A.call('POST', '/api/signup', { username: 'anna', password: 'kiwi-lamp-4421' }); await Z.call('POST', '/api/signup', { username: 'zoe', password: 'kiwi-lamp-4421' });
  ok('no table yet', (await A.get('state')).j.none === true && (await A.post('answer', { choice: 'more' })).s === 409);
  ok('one player is not enough', (await A.post('start', { game: 'overunder', players: ['Tom'] })).s === 400);
  ok('same name twice refused', (await A.post('start', { game: 'overunder', players: ['Tom', 'tom'] })).s === 400);
  ok('unknown game refused', (await A.post('start', { game: 'kings', players: ['Tom', 'Ida'] })).s === 400);
  ok('too many players refused', (await A.post('start', { game: 'flags', players: Array.from({ length: 13 }, (_, i) => 'P' + i) })).s === 400);

  // ---- Over or under
  let t = (await A.post('start', { game: 'overunder', players: ['Tom', ' Ida ', 'Max'] })).j;
  ok('over/under: a question, a number, no answer', t.phase === 'ask' && t.round === 1 && t.turn === 0 && t.players[1].name === 'Ida' && typeof t.q.shown === 'number' && t.last === null && !/"answer"|"a":|"note"/.test(JSON.stringify(t)));
  ok('another account has no table', (await Z.get('state')).j.none === true);
  ok('nonsense answer refused', (await A.post('answer', { choice: 'maybe' })).s === 400);
  ok('next before answering refused', (await A.post('next')).s === 409);
  let wrongs = 0, streaks = 0;
  for (let i = 0; i < 40; i++) {
    const before = t.players.map(p => p.sips), turn = t.turn, shown = t.q.shown, streak = t.players[turn].streak;
    const r = (await A.post('answer', { choice: 'more' })).j, L = r.last;
    const truth = L.answer > shown;                          // "more" was right exactly when the answer is above the number shown
    const delta = r.players.map((p, k) => p.sips - before[k]);
    if (i === 0) ok('answering twice refused', (await A.post('answer', { choice: 'less' })).s === 409);
    if (!truth) { wrongs++; ok('wrong: the player on turn takes 2, nobody else', L.ok === false && L.kind === 'wrong' && delta[turn] === 2 && delta.every((d, k) => k === turn || d === 0) && r.players[turn].streak === 0); }
    else if (streak === 2) { streaks++; ok('third right in a row: everyone else takes 1', L.kind === 'streak' && delta[turn] === 0 && delta.every((d, k) => k === turn || d === 1) && r.players[turn].streak === 0); }
    else ok('right: safe, the streak grows', L.ok === true && L.kind === 'safe' && delta.every(d => d === 0) && r.players[turn].streak === streak + 1);
    ok('the number shown is clearly off', Math.max(L.answer / shown, shown / L.answer) >= 1.4, L.answer + ' vs ' + shown);
    t = (await A.post('next')).j;
    ok('next: the turn moves on, new question', t.turn === (turn + 1) % 3 && t.phase === 'ask' && t.last === null && t.round === i + 2);
  }
  console.log('  (40 rounds: ' + wrongs + ' wrong, ' + streaks + ' streak rounds)');
  ok('state returns the running table', (await A.get('state')).j.round === t.round);
  let bd = (await A.get('badges')).j.badges; const B1 = id => bd.find(b => b.id === id);
  ok('badges: counted by the server from what happened at the table', bd.length === 14 && B1('first').got && B1('regulars').have === 40 && !B1('regulars').got && B1('onme').got === streaks > 0 && B1('openbar').have === Math.min(100, wrongs * 2 + streaks * 2) && !B1('full').got);
  ok('badges: another account starts at zero', (await Z.get('badges')).j.badges.every(b => !b.got && b.have === 0));
  ok('badges: a player cannot hand himself one', (await A.post('badges', { got: { tab: 1 } })).s === 404 && !(await A.get('badges')).j.badges.find(b => b.id === 'tab').got);
  const fullHouse = (await A.post('start', { game: 'overunder', players: ['a', 'b', 'c', 'd', 'e', 'f'] })).j;
  ok('badges: a new one is announced once', fullHouse.fresh.some(b => b.name === 'Full house') && (await A.get('state')).j.fresh.length === 0);

  // ---- Flag round
  t = (await A.post('start', { game: 'flags', players: ['Tom', 'Ida'] })).j;
  ok('flags: a picture, no name', t.game === 'flags' && /^\/api\/drinks\/flag\?k=[0-9a-f]+$/.test(t.q.img) && !/"name":"(?!Tom|Ida)/.test(JSON.stringify(t)) && t.players.every(p => p.sips === 0));
  const img = await A.call('GET', t.q.img);
  ok('flags: the picture is a clean SVG', img.s === 200 && img.type.includes('svg') && !/flag-icons-/.test(img.text));
  ok('flags: wrong key or other account gets nothing', (await A.call('GET', '/api/drinks/flag?k=abc')).s === 404 && (await Z.call('GET', t.q.img)).s === 404);
  let r = (await A.post('answer', { text: 'Atlantis' })).j;
  ok('flags: wrong name drinks 2 and the country is told', r.last.ok === false && r.last.kind === 'wrong' && typeof r.last.name === 'string' && r.players[0].sips === 2);
  const firstName = r.last.name;
  r = (await A.post('next')).j; r = (await A.post('answer', { text: '' })).j;
  ok('flags: "no idea" counts as wrong', r.last.ok === false && r.players[1].sips === 2);
  ok('a player cannot set sips', (await A.post('start', { game: 'flags', players: [{ name: 'Tom', sips: -5 }, 'Ida'] })).s === 400);
  ok('ending removes the table', (await A.post('end')).j.none === true && (await A.get('state')).j.none === true && (await A.post('next')).s === 409);
  ok('first flag had a real country name', firstName.length > 2);
  // ---- sips in a drinks lobby count for the player's own badges
  const P = (p, u, b) => p.call('POST', '/api/party/' + u, b || {});
  const code = (await P(A, 'create')).j.code; await P(A, code + '/join'); await P(Z, code + '/join');
  const listen = p => { fetch(B + '/api/party/' + code + '/events', { headers: { cookie: p.cookie() } }).then(async res => { for await (const c of res.body) {} }).catch(() => {}); };
  listen(A); listen(Z); await wait(300);
  await P(A, code + '/settings', { drinks: true, seconds: 15 }); await P(A, code + '/start');
  await P(A, code + '/guess', { value: 1000 }); await wait(16300);        // Zoe sits there and does not guess
  const zb = (await Z.get('badges')).j.badges, ab = (await A.get('badges')).j.badges;
  ok('lobby: the no-guess penalty counts for that player only', zb.find(b => b.id === 'asleep').have === 1 && zb.find(b => b.id === 'tab').have === 2 && ab.find(b => b.id === 'asleep').have === 0 && ab.find(b => b.id === 'tab').have === 0);
  await wait(400);
  const saved = readDb(project, data);
  ok('badges are stored on the server', saved.drinks.anna.got.first > 0 && saved.drinks.zoe.n.missed === 1);
  console.log('PASSED ' + pass + ', FAILED ' + fail);
  srv.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASHED', e); process.exit(1); });
