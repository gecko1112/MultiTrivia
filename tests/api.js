// Server-only checks: password rules, login rate limit, and that party mode cannot be cheated from a client.
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const project = process.argv[2] || require('path').join(__dirname, '..'), readDb = require('./db.js').readDb, patchDb = require('./db.js').patchDb, PORT = 3978, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, 'xdata-api'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: ['ignore', 'ignore', 'inherit'] });
const wait = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, failn = 0;
const ok = (c, label, extra) => { if (c) pass++; else failn++; console.log((c ? 'ok   ' : 'FAIL ') + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };
function client(name) {
  let cookie = '';
  const call = async (method, url, body, hdr) => {
    const r = await fetch(B + url, { method, headers: Object.assign({ 'Content-Type': 'application/json', cookie }, hdr || {}), body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let j = {}; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j };
  };
  const c = { name, call, state: null, states: [], post: (p, b) => call('POST', '/api/party/' + p, b || {}) };
  c.listen = async code => {
    const r = await fetch(B + '/api/party/' + code + '/events', { headers: { cookie } });
    c.streamStatus = r.status; if (r.status !== 200) return;
    (async () => {
      const dec = new TextDecoder(); let buf = '';
      try {
        for await (const chunk of r.body) {
          buf += dec.decode(chunk, { stream: true }); let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const ev = buf.slice(0, i); buf = buf.slice(i + 2);
            const d = ev.split('\n').find(l => l.startsWith('data: '));
            if (ev.includes('event: state') && d) { c.state = JSON.parse(d.slice(6)); c.states.push(c.state); }
            if (ev.includes('event: gone')) c.gone = true;
          }
        }
      } catch (e) {}
    })();
  };
  return c;
}
(async () => {
  await wait(1200);
  try {
    // ---- passwords
    const x = client('x');
    for (const [pw, want] of [['short1', 400], ['aaaaaaaaaaaa', 400], ['password123', 400], ['1234567890', 400], ['Passwort2024!', 400], ['anna-is-great-1', 400], ['kiwi-lamp-4421', 200]]) {
      const r = await x.call('POST', '/api/signup', { username: 'anna', password: pw }); ok(r.s === want, 'signup "' + pw + '" -> ' + r.s, r.j.error);
    }
    // ---- login rate limit
    let last; for (let i = 0; i < 9; i++) last = await client('y').call('POST', '/api/login', { username: 'anna', password: 'wrong-password-' + i });
    ok(last.s === 429, '9th wrong password is blocked', last.j.error);
    const blocked = await client('y').call('POST', '/api/login', { username: 'anna', password: 'kiwi-lamp-4421' });
    ok(blocked.s === 429, 'even the right password waits while blocked');
    const other = await client('y').call('POST', '/api/login', { username: 'anna', password: 'kiwi-lamp-4421' }, { 'x-forwarded-for': '10.1.2.3' });
    ok(other.s === 200, 'the same account from another address still gets in');

    // ---- party
    const A = client('host'), Bc = client('bea'), C = client('cem'), D = client('out');
    for (const c of [A, Bc, C, D]) await c.call('POST', '/api/signup', { username: c.name, password: 'kiwi-lamp-4421' });
    ok((await client('anon').post('create')).s === 401, 'no lobby without login');
    const made = await A.post('create'); const code = made.j.code;
    ok(made.s === 200 && /^[A-Z]{4}$/.test(code), 'host creates a lobby', code);
    ok((await Bc.post(code + '/guess', { value: 5 })).s === 403, 'not in the lobby: no guessing');
    await D.listen(code); ok(D.streamStatus === 403, 'not in the lobby: no listening');
    for (const c of [A, Bc, C]) { ok((await c.post(code + '/join')).s === 200, c.name + ' joins'); await c.listen(code); }
    await wait(300);
    ok(A.state.players.length === 3 && A.state.isHost && !Bc.state.isHost, 'everyone sees three players, one host');
    ok((await Bc.post(code + '/start')).s === 403, 'a guest cannot start');
    ok((await Bc.post(code + '/settings', { rounds: 15 })).s === 403, 'a guest cannot change settings');
    await A.post(code + '/settings', { rounds: 5, seconds: 15 });
    await A.post(code + '/settings', { rounds: 999, seconds: 1 }); await wait(100);
    ok(A.state.rounds === 5 && A.state.seconds === 15, 'settings stay within the allowed values', [A.state.rounds, A.state.seconds]);
    ok((await A.post(code + '/next')).s === 409, 'no "next" before a round');
    await A.post(code + '/start'); await wait(200);
    const q1 = JSON.stringify(Bc.state);
    ok(Bc.state.phase === 'question' && Bc.state.q && Bc.state.q.text, 'question arrives', Bc.state.q);
    ok(!/"answer"|"a":|"note"|"n":"/.test(q1) && Bc.state.reveal === null && Object.keys(Bc.state.q).join() === 'text,unit', 'the answer is NOT in what players receive during the question');
    ok((await Bc.post(code + '/guess', { value: 'lots' })).s === 400 && (await Bc.post(code + '/guess', { value: -5 })).s === 400 && (await Bc.post(code + '/guess', { value: null })).s === 400, 'nonsense guesses are refused');
    ok((await Bc.post(code + '/guess', { value: 123457 })).s === 200, 'bea guesses');
    ok((await Bc.post(code + '/guess', { value: 200 })).s === 409, 'bea cannot change her guess');
    await wait(100);
    ok(A.state.players.find(p => p.name === 'bea').done && A.state.myGuess === null && !JSON.stringify(A.state).includes('123457'), 'others see THAT bea answered, not WHAT');
    ok((await Bc.post(code + '/next')).s === 403, 'a guest cannot skip ahead');
    await A.post(code + '/guess', { value: 1000 }); await C.post(code + '/guess', { value: 1e6 }); await wait(200);
    ok(A.state.phase === 'reveal', 'all answered: the round closes early');
    const R = A.state.reveal; console.log('     reveal:', JSON.stringify(R));
    const sum = r => r.pts + r.bonus;
    ok(R.rows.filter(r => r.bonus).length >= 1 && R.rows[0].bonus === 25 && R.rows.every(r => r.pts === Math.round(100 * Math.max(0, 1 - Math.abs(Math.log10(r.guess / R.answer))))), 'points match the formula, closest gets the bonus');
    ok(A.state.players.every(p => p.score === sum(R.rows.find(r => r.id === p.id))), 'scores were added by the server');
    ok((await Bc.post(code + '/guess', { value: R.answer })).s === 409, 'no guessing after the reveal');
    // round 2: only one answers, the clock has to end it
    await A.post(code + '/next'); await wait(200);
    ok(A.state.phase === 'question' && A.state.round === 2, 'round 2 starts');
    await Bc.post(code + '/guess', { value: 42 });
    await wait(15800);
    ok(A.state.phase === 'reveal', 'time is up: the server closes the round by itself');
    ok((await C.post(code + '/guess', { value: A.state.reveal.answer })).s === 409, 'a late guess with the now-known answer is refused');
    const cem = A.state.reveal.rows.find(r => r.name === 'cem');
    ok(cem.guess === null && cem.pts === 0 && cem.bonus === 0, 'no guess = no points');
    // chat
    ok((await Bc.post(code + '/chat', { text: '  <b>hi</b>   there  ' })).s === 200, 'chat line accepted'); await wait(100);
    ok(A.state.chat.length === 1 && A.state.chat[0].text === '<b>hi</b> there' && A.state.chat[0].name === 'bea', 'chat arrives as plain text', A.state.chat[0]);
    ok((await Bc.post(code + '/chat', { text: 'again' })).s === 429, 'chat is rate limited');
    await wait(900); await Bc.post(code + '/chat', { text: 'y'.repeat(500) }); await wait(100);
    ok(A.state.chat[A.state.chat.length - 1].text.length === 200, 'long chat lines are cut to 200 characters');
    // finish the game
    for (let r = 3; r <= 5; r++) { await A.post(code + '/next'); await wait(150); for (const c of [A, Bc, C]) await c.post(code + '/guess', { value: 10 * r }); await wait(200); }
    ok(A.state.phase === 'reveal' && A.state.round === 5 && A.state.reveal.last, 'five rounds played');
    await A.post(code + '/next'); await wait(150);
    ok(A.state.phase === 'final' && A.state.q === null, 'final result', A.state.players.map(p => p.name + ' ' + p.score));
    ok((await Bc.post(code + '/again')).s === 403, 'a guest cannot restart');
    // host leaves: someone else becomes host
    await A.post(code + '/leave'); await wait(200);
    ok(Bc.state.players.length === 2 && Bc.state.players.some(p => p.id === Bc.state.host), 'host left: another player is host now', Bc.state.host);
    await Bc.post(code + '/leave'); await C.post(code + '/leave'); await wait(100);
    ok((await C.post(code + '/join')).s === 404, 'empty lobby is gone');
    console.log('\n' + pass + ' passed, ' + failn + ' failed');
  } catch (e) { console.error('CRASH', e); failn++; }
  srv.kill(); process.exit(failn ? 1 : 0);
})();
