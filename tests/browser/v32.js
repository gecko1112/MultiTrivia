// Party "Bets" in the browser: the game choice in the lobby, the betting screen, the reveal and handing out sips.
// gecko plays in the page (the host); lini and fickric play from here, with their event streams open like real players.
const { start, wait } = require('./lib');
const path = require('path');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv32' + (W < 600 ? 'm' : ''), THEME = process.argv[5] || 'dark';
const B = 'http://127.0.0.1:3977';
(async () => { const t = await start(process.argv[2] || path.join(__dirname, '..', '..'), W, H, TAG); const { ev, cdp, shot } = t;
  const txt = sel => ev(`(document.querySelector('${sel}')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()`);
  const out = [], ok = (n, c) => out.push([n, !!c]);
  const jar = {}, aborts = [];
  const call = async (who, m, u, b) => { const r = await fetch(B + u, { method: m, headers: { 'Content-Type': 'application/json', cookie: jar[who] || '' }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const listen = async (who, code) => { const ac = new AbortController(); aborts.push(ac); const res = await fetch(B + '/api/party/' + code + '/events', { headers: { cookie: jar[who] }, signal: ac.signal }); const rd = res.body.getReader(); (async () => { try { for (;;) { const { done } = await rd.read(); if (done) break; } } catch (e) {} })(); };
  try {
    await ev(`localStorage.setItem('bp_theme','${THEME}')`);
    await cdp('Page.navigate', { url: 'http://localhost:3977/#party' }); await wait(300); await cdp('Page.reload'); await wait(3200);
    await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    await ev(`document.getElementById('ptCreate').click()`); await wait(1500);
    const code = await ev(`(document.querySelector('.pt-code b')||{}).textContent`);
    for (const n of ['lini', 'fickric']) { await call(n, 'POST', '/api/login', { username: n, password: 'kiwi-lamp-4421' }); await call(n, 'POST', '/api/party/' + code + '/join'); await listen(n, code); }
    await wait(800);
    ok('the lobby offers both games', /Closest guess/.test(await txt('#ptMain')) && /Bets/.test(await txt('#ptMain')));
    await ev(`document.querySelector('[data-mode=bets]').click()`); await wait(600);
    await ev(`document.querySelector('[data-drinks="1"]').click()`); await wait(600);
    ok('choosing Bets shows its rules', /bet 1 to 3/.test(await txt('#ptMain')) && /Lose a bet: drink it/.test(await txt('#ptMain')));
    await shot('lobby-' + THEME);

    await ev(`document.querySelector('[data-act=start]').click()`); await wait(800);
    await ev(`(()=>{ const i=document.getElementById('ptInp'); i.value='500'; i.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('ptGuess').requestSubmit(); })()`); await wait(300);
    await call('lini', 'POST', '/api/party/' + code + '/guess', { value: 2000 });
    await call('fickric', 'POST', '/api/party/' + code + '/guess', { value: 90 });
    await wait(900);
    ok('with all guesses in, the betting screen opens', await ev(`document.querySelectorAll('.pt-opt').length===3`));
    ok('the guesses are sorted low to high, yours marked', (await ev(`[...document.querySelectorAll('.pt-opt span')].map(s=>s.textContent).join()`)) === 'fickric,You,lini');
    ok('"Bet" waits for a pick', await ev(`document.querySelector('[data-act=bet]').disabled`));
    await ev(`document.querySelector('.pt-opt[data-on=lini]').click()`); await wait(150);
    await ev(`document.querySelector('[data-stake="2"]').click()`); await wait(150);
    ok('picking a guess and a stake', await ev(`document.querySelector('.pt-opt[data-on=lini]').classList.contains('sel')`) && /Bet 2 sips/.test(await txt('[data-act=bet]')));
    await shot('bet-' + THEME);
    await ev(`document.querySelector('[data-act=bet]').click()`); await wait(600);
    ok('after betting, it says what you bet', /You bet 2 on lini's guess/.test(await txt('#ptMain')));
    await call('lini', 'POST', '/api/party/' + code + '/bet', { on: 'gecko', stake: 1 });
    await call('fickric', 'POST', '/api/party/' + code + '/bet', { on: 'fickric', stake: 3 });
    await wait(1000);
    ok('the reveal shows the answer, the closest guess and every bet', /Correct answer/.test(await txt('#ptMain')) && /Closest guess/.test(await txt('#ptMain')) && /2 on lini/.test(await txt('#ptMain')) && /3 on own/.test(await txt('#ptMain')));
    const iWon = await ev(`!!document.querySelector('[data-give]')`);
    if (iWon) {
      await shot('reveal-give-' + THEME);
      await ev(`document.querySelector('[data-give]').click()`); await wait(700);
      ok('handing out a sip counts down', /Hand out 1 sip/.test(await txt('.pt-give')));
    } else ok('a lost bet shows the sips to drink', /2 sips/.test(await txt('#ptMain')));
    await shot('reveal-' + THEME);
    ok('no script errors', !t.errors.length);
    if (t.errors.length) console.log(t.errors.join('\n'));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  aborts.forEach(a => a.abort());
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  t.done(out.every(o => o[1]) ? 0 : 1);
})();
