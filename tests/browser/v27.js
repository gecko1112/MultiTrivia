// A daily game that was started is continued, never dealt again: leaving it, reloading, and even emptying the
// browser's storage bring every one of the five daily games back to where it was (the server keeps today's progress).
const { start, wait } = require('./lib');
const path = require('path');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv27';
(async () => { const t = await start(process.argv[2] || path.join(__dirname, '..', '..'), W, H, TAG); const { ev, cdp } = t;
  const txt = sel => ev(`(document.querySelector('${sel}')||{innerText:''}).innerText.replace(/\\s+/g,' ').trim()`);
  const shown = id => ev(`(e=>!!e&&e.style.display!=='none'&&e.getClientRects().length>0)(document.getElementById('${id}'))`);
  const go = async hash => { await cdp('Page.navigate', { url: 'http://localhost:3977/#' + hash }); await wait(300); await cdp('Page.reload'); await wait(3200); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`); };
  // what a cleared browser looks like: nothing stored, still logged in (the login is a cookie)
  const wipe = () => ev(`(()=>{ const keep=localStorage.getItem('bp_theme'); localStorage.clear(); if(keep) localStorage.setItem('bp_theme',keep); return localStorage.length; })()`);
  const key = k => ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'${k}',bubbles:true,cancelable:true}))`);
  try {
    // a fresh account: nothing played today
    await ev(`(async()=>{ const J=(m,u,b)=>fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}); await J('POST','/api/logout'); await J('POST','/api/signup',{username:'runner',password:'kiwi-lamp-4421'}); })()`);
    await ev(`localStorage.clear()`);

    // ---- More/Less
    await go('moreless');
    console.log('ML button before:', await txt('#mlDaily'));
    await ev(`document.getElementById('mlDaily').click()`); await wait(700);
    for (let i = 0; i < 3; i++) { await ev(`document.querySelector('#mlBoard [data-c=more]').click()`); await wait(2600); }
    const mlAt = await txt('#mlCat') + ' | ' + await txt('#mlScore') + ' | ' + await ev(`[...document.querySelectorAll('#mlBoard .nm')].map(n=>n.textContent).join(' vs ')`);
    console.log('ML after 3 answers:', mlAt);
    await ev(`document.getElementById('mlQuit').click()`); await wait(400);
    console.log('  leave: menu shown', await shown('mlIntro'), '| warning asked', /Progress is lost/.test(await txt('#mlQuit')), '| button now:', await txt('#mlDaily'));
    await ev(`document.getElementById('mlDaily').click()`); await wait(700);
    console.log('  continue -> same place:', (await txt('#mlCat') + ' | ' + await txt('#mlScore') + ' | ' + await ev(`[...document.querySelectorAll('#mlBoard .nm')].map(n=>n.textContent).join(' vs ')`)) === mlAt);
    await wait(700); console.log('  storage emptied, keys left:', await wipe()); await go('moreless');
    console.log('  after reload with empty storage -> same place:', (await txt('#mlCat') + ' | ' + await txt('#mlScore') + ' | ' + await ev(`[...document.querySelectorAll('#mlBoard .nm')].map(n=>n.textContent).join(' vs ')`)) === mlAt, '| playing', await shown('mlPlay'));
    // More/Less is dealt and judged on the server: starting again continues, and an answered pair cannot be called again
    console.log('  asking the server to start again:', await ev(`fetch('/api/ml/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({daily:true})}).then(r=>r.json()).then(j=>'calls made stay '+j.i)`),
      '| calling the first pair again:', await ev(`fetch('/api/ml/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({daily:true,i:0,choice:'more'})}).then(r=>r.status)`));
    // a practice game is still thrown away, after asking
    await ev(`document.getElementById('mlQuit').click()`); await wait(300); await ev(`document.getElementById('mlPractice').click()`); await wait(700);
    await ev(`document.getElementById('mlQuit').click()`); await wait(200);
    console.log('  practice game, leave asks first:', await txt('#mlQuit'));
    await ev(`document.getElementById('mlQuit').click()`); await wait(300);
    console.log('  daily still waiting after the practice game:', await txt('#mlDaily'));

    // ---- Guessless
    await go('guessless');
    await ev(`document.getElementById('glDaily').click()`); await wait(600);
    await ev(`(()=>{ const i=document.getElementById('glInp'); i.value='100'; i.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('glForm').requestSubmit(); })()`); await wait(600);
    await ev(`document.getElementById('glNext').click()`); await wait(600);
    const glAt = await txt('#glCat') + ' | ' + await txt('#glTotal') + ' | ' + await txt('#glQ');
    console.log('GL at question 2:', glAt);
    await ev(`document.getElementById('glQuit').click()`); await wait(400);
    console.log('  leave: warning asked', /Progress is lost/.test(await txt('#glQuit')), '| button now:', await txt('#glDaily'));
    await wait(700); await wipe(); await go('guessless');
    console.log('  after reload with empty storage -> same place:', (await txt('#glCat') + ' | ' + await txt('#glTotal') + ' | ' + await txt('#glQ')) === glAt);

    // ---- Wordy
    await go('wordy'); await wait(500);
    await ev(`document.activeElement&&document.activeElement.blur()`);
    for (const k of ['c', 'r', 'a', 'n', 'e', '⏎']) { await ev(`document.querySelector('#wdKb [data-k="${k}"]').click()`); await wait(150); }   // the on-screen keyboard
    await wait(2200);
    const wdAt = await ev(`[...document.querySelectorAll('#wdGrid > *')].slice(0,1).map(r=>r.innerText.replace(/\\s+/g,'')).join('')`) + ' | ' + await txt('#wdSub');
    console.log('WD after one try:', wdAt);
    await wait(600); await wipe(); await go('wordy'); await wait(800);
    console.log('  after reload with empty storage -> same place:', (await ev(`[...document.querySelectorAll('#wdGrid > *')].slice(0,1).map(r=>r.innerText.replace(/\\s+/g,'')).join('')`) + ' | ' + await txt('#wdSub')) === wdAt, '|', await txt('#wdSub'));

    // ---- Clueless
    await go('clueless');
    await ev(`document.getElementById('clDaily').click()`); await wait(2500);
    for (const w of ['water', 'house']) { await ev(`(()=>{ document.getElementById('clInp').value='${w}'; document.getElementById('clForm').requestSubmit(); })()`); await wait(500); }
    const clAt = await txt('#clCount');
    console.log('CL after two guesses:', clAt, '|', (await txt('#clList')).slice(0, 60));
    await wait(600); await wipe(); await go('clueless');
    console.log('  button with empty storage:', await txt('#clDaily'));
    await ev(`document.getElementById('clDaily').click()`); await wait(2500);
    console.log('  after reload with empty storage -> same guesses:', (await txt('#clCount')) === clAt, '|', (await txt('#clList')).slice(0, 60));

    // ---- Survival
    await go('survival');
    await ev(`document.getElementById('goDaily').click()`); await wait(700);
    const q1 = await txt('#q');
    await ev(`(()=>{ const i=document.getElementById('inp'); i.value='100'; i.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('f').requestSubmit(); })()`); await wait(900);
    await ev(`document.getElementById('next').click()`); await wait(900);
    const svAt = await txt('#score') + ' | ' + await txt('#q');
    console.log('SV at question 2:', svAt, '| first question was different:', q1 !== await txt('#q'));
    await wait(700); await wipe(); await go('survival');
    console.log('  after reload with empty storage -> same place:', (await txt('#score') + ' | ' + await txt('#q')) === svAt, '| in the game', await ev(`document.getElementById('game').classList.contains('on')`));

    console.log('server copy:', await ev(`fetch('/api/docs/x_run').then(r=>r.json()).then(j=>Object.entries(j.data.games).map(([g,v])=>g+':'+(v.done?'done':v.n)).join(' '))`),
      '| More/Less on the server:', await ev(`fetch('/api/ml/home').then(r=>r.json()).then(j=>j.going?'going':j.done?'done':'not started')`));
    console.log('ERRORS', JSON.stringify(t.errors.filter(e => !/401/.test(e)))); t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); } })();
