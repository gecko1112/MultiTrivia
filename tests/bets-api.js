// Party "Bets" (party-server.js): guesses, then bets on the guesses, then the answer. Odds from the bets, payouts,
// drinks (lost bets drunk, won bets handed out), and nothing about the answer before the reveal.
// The three players keep their event streams open, so the server waits for all of them as at a real table.
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 4005, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'betdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = [], ok = (n, c) => out.push([n, !!c]);
(async () => {
  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: 'ignore' });
  await up(PORT);
  const jar = {}, last = {}, streams = {};
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const P = (who, act, b) => call(who, 'POST', '/api/party/' + act, b);
  // a player's open event stream: keeps the latest state the server sent
  const listen = async (who, code) => {
    const ac = new AbortController(); streams[who] = ac;
    const res = await fetch(B + '/api/party/' + code + '/events', { headers: { cookie: jar[who] }, signal: ac.signal });
    const rd = res.body.getReader(); let buf = '';
    (async () => { try { for (;;) { const { value, done } = await rd.read(); if (done) break; buf += Buffer.from(value).toString();
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const msg = buf.slice(0, i); buf = buf.slice(i + 2); const m = /event: state\ndata: (.*)/.exec(msg); if (m) last[who] = JSON.parse(m[1]); } } } catch (e) {} })();
  };
  const until = async (who, test, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (last[who] && test(last[who])) return last[who]; await wait(50); } return last[who]; };
  try {
    for (const [n, p] of [['anna', 'kiwi-lamp-4471'], ['ben', 'kiwi-lamp-4472'], ['cleo', 'kiwi-lamp-4473']]) await call(n, 'POST', '/api/signup', { username: n, password: p });
    const code = (await P('anna', 'create')).j.code;
    for (const n of ['anna', 'ben', 'cleo']) { await P(n, code + '/join'); await listen(n, code); }
    await until('anna', s => s.players.length === 3 && s.players.every(p => p.on));
    ok('the lobby starts on "Closest guess"', last.anna.mode === 'closest');
    ok('only the host picks the game', (await P('ben', code + '/settings', { mode: 'bets' })).s === 403);
    await P('anna', code + '/settings', { mode: 'bets', drinks: true });
    ok('the host switches to "Bets"', (await until('ben', s => s.mode === 'bets')).mode === 'bets');
    ok('an unknown game is ignored', (await P('anna', code + '/settings', { mode: 'poker' })).s === 200 && (await until('anna', s => true)).mode === 'bets');

    // ---- round 1: three guesses, then bets
    await P('anna', code + '/start');
    await until('anna', s => s.phase === 'question');
    await P('anna', code + '/guess', { value: 10 }); await P('ben', code + '/guess', { value: 1000 });
    ok('the round waits for every guess', (await until('anna', s => s.phase === 'bet', 300)).phase === 'question');
    await P('cleo', code + '/guess', { value: 1e6 });
    let s = await until('ben', x => x.phase === 'bet');
    ok('with all guesses in, betting opens', s.phase === 'bet' && s.left > 0 && s.left <= 20000);
    ok('everyone sees all guesses, low to high, with names', JSON.stringify(s.options.map(o => [o.name, o.guess])) === JSON.stringify([['anna', 10], ['ben', 1000], ['cleo', 1e6]]));
    ok('but not the answer', s.reveal === null && !/"a":|answer/.test(JSON.stringify(s)));
    ok('guessing is over', (await P('anna', code + '/guess', { value: 5 })).s === 409);
    ok('a stake must be 1, 2 or 3', (await P('anna', code + '/bet', { on: 'ben', stake: 5 })).s === 400);
    ok('a bet must be on one of the guesses', (await P('anna', code + '/bet', { on: 'nobody', stake: 1 })).s === 400);
    ok('a bet on your own guess is fine', (await P('anna', code + '/bet', { on: 'anna', stake: 3 })).s === 200);
    ok('one bet per round', (await P('anna', code + '/bet', { on: 'ben', stake: 1 })).s === 409);
    await P('ben', code + '/bet', { on: 'ben', stake: 2 });        // every guess has one backer, so exactly one bet wins
    ok('the round waits for every bet', (await until('ben', x => x.phase === 'reveal', 300)).phase === 'bet' && last.ben.players.filter(p => p.done).length === 2);
    await P('cleo', code + '/bet', { on: 'cleo', stake: 1 });
    s = await until('anna', x => x.phase === 'reveal');
    const R = s.reveal, A = R.answer;
    ok('with all bets in, the answer is revealed', s.phase === 'reveal' && R.mode === 'bets' && A > 0);
    // what the payouts must be, worked out here from the revealed answer
    const G = { anna: 10, ben: 1000, cleo: 1e6 }, BET = { anna: ['anna', 3], ben: ['ben', 2], cleo: ['cleo', 1] };
    const err = id => Math.abs(Math.log10(G[id] / A)), best = Math.min(...Object.keys(G).map(err));
    const win = new Set(Object.keys(G).filter(id => err(id) === best));
    const backers = Object.values(BET).filter(([on]) => win.has(on)).length, odds = backers ? Math.max(2, Math.floor(3 / backers)) : 0;
    const pts = id => (win.has(BET[id][0]) ? BET[id][1] * odds : -BET[id][1]) + (win.has(id) ? 2 : 0);
    ok('the odds come from the bets', R.odds === odds);
    ok('each bet pays stake × odds or costs the stake, the winning guess gets +2', ['anna', 'ben', 'cleo'].every(id => R.rows.find(r => r.id === id).pts === pts(id)));
    ok('and the scores add up', ['anna', 'ben', 'cleo'].every(id => s.players.find(p => p.id === id).score === pts(id)));
    ok('a lost bet is drunk, a won bet is handed out', ['anna', 'ben', 'cleo'].every(id => { const r = R.rows.find(x => x.id === id), won = win.has(BET[id][0]); return won ? r.sips === 0 && r.give === BET[id][1] : r.sips === BET[id][1] && r.give === 0; }));

    // ---- handing out
    const giver = ['anna', 'ben', 'cleo'].find(id => win.has(BET[id][0])), loser = ['anna', 'ben', 'cleo'].find(id => !win.has(BET[id][0]));
    const target = ['anna', 'ben', 'cleo'].find(id => id !== giver);
    if (giver) {
      const had = R.rows.find(r => r.id === target).sips;
      ok('a winner hands a sip to somebody', (await P(giver, code + '/give', { to: target })).s === 200 && (await until(target, x => x.reveal.rows.find(r => r.id === target).sips === had + 1)).reveal.rows.find(r => r.id === target).sips === had + 1);
      ok('not to themselves', (await P(giver, code + '/give', { to: giver })).s === 400);
      for (let i = 1; i < BET[giver][1]; i++) await P(giver, code + '/give', { to: target });
      ok('and no more than they won', (await P(giver, code + '/give', { to: target })).s === 409);
    }
    if (loser) ok('a loser has nothing to hand out', (await P(loser, code + '/give', { to: giver || 'anna' })).s === 409);

    // ---- round 2: somebody at the table who does not bet drinks 1 when the time runs out
    await P('anna', code + '/next');
    await until('anna', x => x.phase === 'question' && x.round === 2);
    for (const n of ['anna', 'ben', 'cleo']) await P(n, code + '/guess', { value: 500 });
    await until('anna', x => x.phase === 'bet');
    await P('anna', code + '/bet', { on: 'ben', stake: 1 }); await P('ben', code + '/bet', { on: 'ben', stake: 1 });
    s = await until('cleo', x => x.phase === 'reveal', 23000);
    const c = s.reveal.rows.find(r => r.id === 'cleo');
    ok('no bet: 1 sip, no points from betting', c.sips === 1 && c.bet === null && c.pts === (c.winner ? 2 : 0));
    ok('equal guesses all win', s.reveal.rows.filter(r => r.winner).length === 3);
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  for (const ac of Object.values(streams)) ac.abort();
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
