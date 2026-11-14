// Atlas and drinks rules, server only: can a player learn or change anything they should not?
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || require('path').join(__dirname, '..'), readDb = require('./db.js').readDb, patchDb = require('./db.js').patchDb, PORT = 3978, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'gdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('FAIL  ' + name + (extra ? '  ' + extra : '')); } };
const boot = () => spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: 'ignore' });
function player() {
  let cookie = '';
  const p = {
    async call(method, url, body) {
      const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const text = await r.text(); let j = {}; try { j = JSON.parse(text); } catch (e) {} return { s: r.status, j, text, type: r.headers.get('content-type') || '' };
    },
    post: (u, b) => p.call('POST', u, b || {}), get: u => p.call('GET', u), cookie: () => cookie
  };
  return p;
}
(async () => {
  let srv = boot(); await wait(900);
  const C = JSON.parse(fs.readFileSync(path.join(project, 'geo', 'countries.json'), 'utf8')).countries, byId = new Map(C.map(c => [c.id, c]));
  const A = player(), Z = player();
  ok('not logged in is refused', (await A.get('/api/geo/home')).s === 401);
  await A.post('/api/signup', { username: 'anna', password: 'kiwi-lamp-4421' }); await Z.post('/api/signup', { username: 'zoe', password: 'kiwi-lamp-4421' });
  ok('geo data is not in the public folder', (await A.get('/geo/countries.json')).s === 404 && (await A.get('/geo/flags/de.svg')).s === 404);
  const home = (await A.get('/api/geo/home')).j;
  ok('home: nothing played yet', /^\d{4}-\d\d-\d\d$/.test(home.date) && home.daily.flags === null && home.daily.route === null);
  const names = (await A.get('/api/geo/names')).j.names;
  ok('names list has 197 countries', names.length === 197 && names.some(n => n[0] === 'de' && n.includes('Deutschland')));

  // ---- Flags, daily: the name is typed
  ok('answer before start is refused', (await A.post('/api/geo/answer', { mode: 'flags', daily: true, i: 0, text: 'x' })).s === 409);
  let v = (await A.post('/api/geo/start', { mode: 'flags', daily: true })).j;
  ok('flags: first question, nothing to choose from', v.i === 0 && v.n === 10 && v.q.type === true && !v.q.options && !v.done && v.last === null && v.review === null);
  const leak = JSON.stringify(v);
  ok('flags: the question carries no answer', !/"answer"|"name"/.test(leak) && !/flags\/[a-z]{2}\.svg/.test(leak) && !/[?&]id=/.test(v.q.img));
  const img = await A.get(v.q.img);
  ok('flags: picture is an SVG without the country code', img.s === 200 && img.type.includes('svg') && !/flag-icons-/.test(img.text) && img.text.includes('<svg'));
  ok('flags: a later flag is not handed out early', (await A.get(v.q.img.replace('i=0', 'i=1'))).s === 404 && (await A.get(v.q.img.replace('i=0', 'i=9'))).s === 404);
  ok('flags: another player without a game gets nothing', (await Z.get(v.q.img)).s === 404);
  ok('flags: picking from a list is gone', (await A.post('/api/geo/pick', { mode: 'flags', daily: true, i: 0, id: 'de' })).s === 404);
  ok('flags: answering a later question is refused', (await A.post('/api/geo/answer', { mode: 'flags', daily: true, i: 3, text: 'Germany' })).s === 409);
  let w = (await A.post('/api/geo/answer', { mode: 'flags', daily: true, i: 0, text: 'Atlantis' })).j;
  ok('flags: a wrong name is marked wrong and the right one is told', w.i === 1 && w.last.ok === false && typeof w.last.name === 'string' && w.marks.length === 1 && w.marks[0] === false);
  ok('flags: the same question cannot be answered twice', (await A.post('/api/geo/answer', { mode: 'flags', daily: true, i: 0, text: w.last.name })).s === 409);
  const again = (await A.post('/api/geo/start', { mode: 'flags', daily: true })).j;
  ok('flags: starting the daily again continues it', again.i === 1 && JSON.stringify(again.q) === JSON.stringify(w.q));
  const zv = (await Z.post('/api/geo/start', { mode: 'flags', daily: true })).j;
  // Zoe gets the same flag and types the name carelessly: capitals, no accents, no punctuation
  const sloppy = w.last.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z ]/g, ' ');
  const z1 = (await Z.post('/api/geo/answer', { mode: 'flags', daily: true, i: 0, text: sloppy })).j;
  ok('daily is the same for everyone, careless spelling is accepted', zv.q.img === v.q.img && z1.last.ok === true && z1.last.name === w.last.name && z1.score === 1, sloppy);

  // restart the server in the middle: the daily continues where it was
  await wait(400); srv.kill(); await wait(400); srv = boot(); await wait(900);
  const back = (await A.post('/api/geo/start', { mode: 'flags', daily: true })).j;
  ok('daily survives a server restart', back.i === 1 && back.marks[0] === false && back.q.img === w.q.img);
  v = back;
  while (!v.done) v = (await A.post('/api/geo/answer', { mode: 'flags', daily: true, i: v.i, text: '' })).j;   // skips the rest
  ok('flags: finished with a score counted by the server', v.done && v.review.length === 10 && v.score === 0 && v.review[0].picked === 'Atlantis' && v.review[1].picked === '' && v.ms > 0 && v.q === null);
  ok('flags: no more answers after the end', (await A.post('/api/geo/answer', { mode: 'flags', daily: true, i: 10, text: 'Germany' })).s === 409);
  const h2 = (await A.get('/api/geo/home')).j;
  ok('home shows the daily result', h2.daily.flags.done && h2.daily.flags.score === 0);
  const re = (await A.post('/api/geo/start', { mode: 'flags', daily: true })).j;
  ok('a finished daily cannot be replayed', re.done && re.score === 0);
  await wait(500);                                    // the server writes its file a moment after a change
  const saved = readDb(project, data);
  ok('result is stored on the server', saved.geo && saved.geo.anna && saved.geo.anna['flags:' + home.date].moves.length === 10 && saved.geo.anna['flags:' + home.date].res.score === 0 && typeof saved.secret === 'string');
  const hist = (await A.get('/api/geo/history')).j;
  ok('history lists the finished daily for the levels', hist.days[home.date].flags.score === 0 && hist.days[home.date].flags.n === 10 && hist.played === 0);
  const dayA = (await A.get('/api/day?date=' + home.date)).j;
  ok('friends table gets finished Atlas games only', dayA.players.find(p => p.me).at.flags.score === 0 && dayA.players.find(p => !p.me).at === null && dayA.dates.includes(home.date));

  // ---- Outlines, practice
  let s = (await A.post('/api/geo/start', { mode: 'shapes', daily: false })).j;
  ok('outlines: a border drawing and four names', typeof s.q.shape === 'string' && s.q.shape.startsWith('M') && s.q.options.length === 6 && new Set(s.q.options.map(o => o.id)).size === 6 && !('img' in s.q));
  const s2 = (await A.post('/api/geo/start', { mode: 'shapes', daily: false })).j;
  ok('practice: a new start gives a new game', JSON.stringify(s2.q) !== JSON.stringify(s.q));
  s = s2; while (!s.done) s = (await A.post('/api/geo/pick', { mode: 'shapes', daily: false, i: s.i, id: s.q.options[0].id })).j;
  ok('outlines: practice ends after ten', s.review.length === 10 && s.review.every(r => r.shape && r.name));
  ok('practice leaves the daily alone', (await A.get('/api/geo/home')).j.daily.shapes === null);
  ok('practice games are counted', (await A.get('/api/geo/history')).j.played === 1);

  // ---- Overland
  let r = (await A.post('/api/geo/start', { mode: 'route', daily: false })).j;
  const dist = (from, to) => { const m = new Map([[from, 0]]), q = [from]; for (let i = 0; i < q.length; i++) for (const n of byId.get(q[i]).nb) if (!m.has(n)) { m.set(n, m.get(q[i]) + 1); q.push(n); } return to ? m.get(to) : m; };
  ok('overland: start, end and a fair number of guesses', r.a.d && r.b.d && r.between >= 2 && r.between <= 5 && r.max === r.between + 4 && dist(r.a.id, r.b.id) === r.between + 1 && r.solution === null && !r.done);
  ok('overland: unknown country refused', (await A.post('/api/geo/guess', { mode: 'route', daily: false, id: 'zz' })).s === 400);
  ok('overland: start country refused', (await A.post('/api/geo/guess', { mode: 'route', daily: false, id: r.a.id })).s === 409);
  r = (await A.post('/api/geo/guess', { mode: 'route', daily: false, id: 'is' })).j;
  ok('overland: an island is no help and costs a guess', r.guesses[0].grade === 'far' && r.left === r.max - 1 && !r.done);
  ok('overland: the same country twice is refused', (await A.post('/api/geo/guess', { mode: 'route', daily: false, id: 'is' })).s === 409);
  // walk a shortest way
  const toB = dist(r.b.id); let at = r.a.id; const way = [];
  while (true) { at = byId.get(at).nb.find(n => toB.get(n) === toB.get(at) - 1); if (at === r.b.id) break; way.push(at); }
  for (const id of way) { ok('overland: not won before the last link', !r.done); r = (await A.post('/api/geo/guess', { mode: 'route', daily: false, id })).j; }
  ok('overland: connected means won', r.done && r.won && r.guesses.slice(1).every(g => g.grade === 'good') && r.solution.length === r.between && r.ms > 0);
  ok('overland: no guesses after the end', (await A.post('/api/geo/guess', { mode: 'route', daily: false, id: 'jp' })).s === 409);
  // run out of guesses
  r = (await A.post('/api/geo/start', { mode: 'route', daily: false })).j;
  const islands = C.filter(c => !c.nb.length).map(c => c.id);
  for (let i = 0; !r.done; i++) r = (await A.post('/api/geo/guess', { mode: 'route', daily: false, id: islands[i] })).j;
  ok('overland: out of guesses means lost, the way is shown', r.done && !r.won && r.guesses.length === r.max && r.solution.length === r.between && r.solution.every(x => x.d));
  // give up, daily
  let d = (await A.post('/api/geo/start', { mode: 'route', daily: true })).j;
  const dz = (await Z.post('/api/geo/start', { mode: 'route', daily: true })).j;
  ok('overland daily is the same for everyone', d.a.id === dz.a.id && d.b.id === dz.b.id);
  d = (await A.post('/api/geo/giveup', { mode: 'route', daily: true })).j;
  ok('overland: giving up ends the daily for good', d.done && !d.won && (await A.post('/api/geo/start', { mode: 'route', daily: true })).j.done);
  ok('unknown game refused', (await A.post('/api/geo/start', { mode: 'capitals', daily: false })).s === 400);

  // ---- every pair the game can ask is really connected, every flag exists
  ok('all 197 flags are there and clean', C.every(c => { const f = path.join(project, 'geo', 'flags', c.id + '.svg'); return fs.existsSync(f) && !/flag-icons-|<script/i.test(fs.readFileSync(f, 'utf8')); }));
  ok('borders go both ways', C.every(c => c.nb.every(n => byId.get(n).nb.includes(c.id))));

  // ---- drinks rules in party mode
  const code = (await A.post('/api/party/create')).j.code; await A.post('/api/party/' + code + '/join'); await Z.post('/api/party/' + code + '/join');
  const listen = p => { const st = { last: null }; fetch(B + '/api/party/' + code + '/events', { headers: { cookie: p.cookie() } }).then(async res => { let buf = ''; for await (const chunk of res.body) { buf += Buffer.from(chunk).toString(); let m; while ((m = buf.match(/event: state\ndata: (.*)\n\n/))) { st.last = JSON.parse(m[1]); buf = buf.slice(m.index + m[0].length); } } }).catch(() => {}); return st; };
  const sa = listen(A), sz = listen(Z); await wait(400);
  ok('drinks are off in a new lobby', sa.last.drinks === false);
  ok('a guest cannot switch drinks on', (await Z.post('/api/party/' + code + '/settings', { drinks: true })).s === 403);
  await A.post('/api/party/' + code + '/settings', { drinks: true, seconds: 15 }); await wait(200);
  ok('host switched drinks on, everyone sees it', sz.last.drinks === true && sz.last.seconds === 15);
  await A.post('/api/party/' + code + '/start'); await wait(200);
  await A.post('/api/party/' + code + '/guess', { value: 1e30 }); await Z.post('/api/party/' + code + '/guess', { value: 1 }); await wait(300);
  let rows = sa.last.reveal.rows; const far = rows[rows.length - 1], near = rows[0];
  ok('furthest off takes 2 sips, closest none', sa.last.phase === 'reveal' && far.sips === 2 && near.sips === 0 && far.err > near.err);
  await A.post('/api/party/' + code + '/next'); await wait(200);
  await A.post('/api/party/' + code + '/guess', { value: 1000 });
  await wait(16200);                                  // Zoe stays at the table but does not answer: the server closes the round
  rows = sa.last.reveal.rows;
  ok('no guess takes 2 sips, a lone guesser none', sa.last.phase === 'reveal' && rows.find(x => x.id === 'zoe').sips === 2 && (rows.find(x => x.id === 'anna').sips || 0) <= 0);
  const tot = Object.fromEntries(sa.last.players.map(p => [p.id, p.sips]));
  ok('sips are added up by the server', tot.anna + tot.zoe === 4);
  ok('a player cannot send sips or points', (await Z.post('/api/party/' + code + '/settings', { sips: 0, score: 999 })).s === 403);
  console.log('PASSED ' + pass + ', FAILED ' + fail);
  srv.kill(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASHED', e); process.exit(1); });
