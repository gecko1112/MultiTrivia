// Oddball (oddball-server.js): questions with many right answers, rarer right answers score more, judged on the server.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 4007, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'oddata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const C = JSON.parse(fs.readFileSync(path.join(project, 'geo', 'countries.json'), 'utf8')).countries, byName = new Map(C.map(c => [c.name, c]));
const cont = c => c.cont.startsWith('Seven') ? (c.sub.endsWith('Africa') ? 'Africa' : 'Asia') : c.cont;
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = [], ok = (n, c) => out.push([n, !!c]);
// a right answer to a question, worked out here from the country data; `rarest` picks the least known one by the server's list
function rightAnswers(text) {
  let m;
  if ((m = /^Name a country in (.+)\.$/.exec(text))) return C.filter(c => cont(c) === m[1] || c.sub === m[1]).map(c => c.name);
  if ((m = /^Name a country that borders (?:the )?(.+)\.$/.exec(text))) { const c = byName.get(m[1]); return c.nb.map(id => C.find(x => x.id === id).name); }
  if ((m = /^Name a country whose name starts with (.)\.$/.exec(text))) return C.filter(c => c.name[0] === m[1]).map(c => c.name);
  return [];
}
(async () => {
  // ---- the questions themselves (the module, without a server)
  const geo = { list: () => C, identify: () => null };
  const odd = require(path.join(project, 'oddball-server.js'))({ geo, fame: require(path.join(project, 'content', 'oddball-fame.js')), send() {}, readBody() {}, records: () => ({}), save() {}, stats: {}, secret: 'x', mayArchive: () => false });
  const Q = odd.questions();
  ok('there are questions of four kinds (' + Q.length + ')', Q.length > 80 && ['cont:', 'sub:', 'nb:', 'letter:'].every(k => Q.some(q => q.id.startsWith(k))));
  ok('every question has at least five right answers', Q.every(q => q.ok.length >= 5));
  ok('points run from 10 for the best known to 100 for the least known', Q.every(q => { const p = Object.values(q.pts); return Math.min(...p) === 10 && Math.max(...p) === 100; }));
  const af = Q.find(q => q.id === 'cont:Africa');
  ok('Africa: Egypt is obvious, Comoros is rare', af.pts.eg < 25 && af.pts.km > 90);
  ok('the island states the map puts in the open ocean belong to their continent', af.ok.includes('mu') && af.ok.includes('sc') && Q.find(q => q.id === 'cont:Asia').ok.includes('mv'));
  ok('a letter question also takes another name that starts with it', odd.judge('letter:C', 'ci', "Côte d'Ivoire").ok && !odd.judge('letter:C', 'ci', 'Ivory Coast').ok && odd.judge('letter:I', 'ci', 'Ivory Coast').ok);
  ok('a neighbour question does not take the country itself', !odd.judge('nb:de', 'de', 'Germany').ok);
  ok('the day\'s questions are of three different kinds and the same all day', (d => d.length === 3 && new Set(d.map(x => x.split(':')[0])).size === 3)(odd.dailyDeal('2026-11-17')) && odd.dailyDeal('2026-11-17').join() === odd.dailyDeal('2026-11-17').join());

  // ---- playing, on a server
  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: 'ignore' });
  await up(PORT);
  const jar = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    await call('anna', 'POST', '/api/signup', { username: 'anna', password: 'kiwi-lamp-4491' });
    let h = (await call('anna', 'GET', '/api/od/home')).j;
    ok('the menu: nothing played yet', h.done === false && h.going === false && h.stats.played === 0);
    let v = (await call('anna', 'POST', '/api/od/start', { daily: true })).j;
    ok('today\'s game starts with the first of three questions', v.i === 0 && v.n === 3 && /^Name a country/.test(v.q.text) && !v.done);
    ok('no right answers are sent with the question', !JSON.stringify(v).includes('"ok"') && !('rare' in v));
    let r = await call('anna', 'POST', '/api/od/answer', { daily: true, i: 0, text: 'Atlantis' });
    ok('a name that is no country is refused and does not use up the question', r.s === 400 && r.j.unknown && (await call('anna', 'POST', '/api/od/start', { daily: true })).j.i === 0);
    // first question: the rarest right answer, typed with a small typo
    const right = rightAnswers(v.q.text);
    const typo = right[right.length - 1];
    r = await call('anna', 'POST', '/api/od/answer', { daily: true, i: 0, text: typo.toLowerCase() });
    ok('a right answer scores, with its question\'s rarest answers shown afterwards', r.s === 200 && r.j.last.ok && r.j.last.pts >= 10 && r.j.last.rare.length === 3 && r.j.last.count === right.length);
    ok('the same question cannot be answered twice', (await call('anna', 'POST', '/api/od/answer', { daily: true, i: 0, text: typo })).s === 409);
    // second question: a wrong country on purpose
    const wrong = C.find(c => !rightAnswers(r.j.q.text).includes(c.name)).name;
    r = await call('anna', 'POST', '/api/od/answer', { daily: true, i: 1, text: wrong });
    ok('a country that does not fit scores 0', r.j.last.ok === false && r.j.last.pts === 0);
    const third = rightAnswers(r.j.q.text)[0];
    r = await call('anna', 'POST', '/api/od/answer', { daily: true, i: 2, text: third });
    ok('after three, the game is over with every result and the total', r.j.done && r.j.results.length === 3 && r.j.total === r.j.results.reduce((s, x) => s + x.pts, 0));
    const total = r.j.total;
    ok('today\'s game cannot be played again', (await call('anna', 'POST', '/api/od/start', { daily: true })).j.done === true && (await call('anna', 'POST', '/api/od/answer', { daily: true, i: 3, text: third })).s === 409);
    h = (await call('anna', 'GET', '/api/od/home')).j;
    ok('the menu shows today\'s total and the stats', h.done && h.total === total && h.stats.played === 1 && h.stats.best === total);
    // practice
    v = (await call('anna', 'POST', '/api/od/start', { daily: false })).j;
    ok('a practice game deals its own questions', v.i === 0 && v.daily === false && v.practiceLeft === null);
    ok('needs a login', (await call('nobody', 'GET', '/api/od/home')).s === 401);
    await wait(450); srv.kill(); await wait(400);
    const db = require('./db.js').readDb(project, data);
    ok('what players answered is counted per question, right answers only', Object.values(db.oddStats).reduce((n, s) => n + Object.values(s).reduce((a, b) => a + b, 0), 0) === 2);
    ok('the day is stored with the account', !!db.od.anna[h.date] && db.od.anna[h.date].moves.length === 3);
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
