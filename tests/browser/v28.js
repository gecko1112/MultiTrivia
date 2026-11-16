// Free limits in the browser: the practice buttons show how many are left, the Plus tag once none are, and a refused
// start opens the Plus window with the server's reason. The party host sees their free games on "Start game".
// The account is an admin without Plus: the test checkout is open to it, so the limits apply (limits-server.js).
const { start, wait } = require('./lib');
const fs = require('fs'), path = require('path');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv28';
(async () => { const t = await start(process.argv[2] || path.join(__dirname, '..', '..'), W, H, TAG); const { ev, cdp, shot } = t;
  fs.writeFileSync(path.join(__dirname, '..', '.tmp', 'xdata-' + TAG, 'admins.txt'), 'tester\n');
  // textContent, not innerText: buttons are drawn in capitals by the stylesheet
  const txt = sel => ev(`(document.querySelector('${sel}')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()`);
  const go = async hash => { await cdp('Page.navigate', { url: 'http://localhost:3977/#' + hash }); await wait(300); await cdp('Page.reload'); await wait(3200); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`); };
  const post = (u, b) => ev(`fetch('${u}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(b || {})})}).then(r=>r.status)`);
  const out = [], ok = (n, c) => { out.push([n, !!c]); };
  try {
    await ev(`(async()=>{ const J=(m,u,b)=>fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}); await J('POST','/api/logout'); await J('POST','/api/signup',{username:'tester',password:'kiwi-lamp-4421'}); localStorage.setItem('bp_bot_tour_tester','1'); })()`);

    // ---- More/Less: count, then none left, then the Plus window
    await go('moreless');
    ok('More/Less shows 3 left', /Practice game\s*3 left/.test(await txt('#mlPractice')));
    await shot('ml-3-left');
    for (let i = 0; i < 3; i++) await post('/api/ml/start', { daily: false });
    await post('/api/ml/quit', { daily: false });                  // otherwise the page brings the last practice game back
    await go('moreless');
    ok('with none left it shows the Plus tag', await ev(`!!document.querySelector('#mlPractice .left-tag.ptag')`) && /Plus/.test(await txt('#mlPractice')));
    await ev(`document.getElementById('mlPractice').click()`); await wait(900);
    const modal = await txt('.bpm');
    ok('a refused start opens the Plus window with the reason', /No practice games left today/.test(modal));
    ok('the window lists what free accounts get', /3 a day/.test(modal) && /3 to try/.test(modal) && /No limit/.test(modal));
    await shot('ml-plus-window');
    ok('the game did not start', await ev(`document.getElementById('mlPlay').style.display==='none'`));

    // ---- the other games show their own counts
    await go('guessless'); ok('Guessless shows 3 left', /3 left/.test(await txt('#glPractice')));
    await go('clueless'); ok('Clueless shows 3 left', /3 left/.test(await txt('#clPractice')));
    await go('wordy'); ok('Wordy shows 3 left', /3 left/.test(await txt('#wdPractice')));
    await shot('wordy');
    await go('survival'); ok('Survival shows 3 left', /3 left/.test(await txt('#go')));
    await shot('survival');
    // a practice run counts down on the screen at the end
    await ev(`document.getElementById('go').click()`); await wait(900);
    await ev(`document.getElementById('endRun').click()`); await wait(200); await ev(`document.getElementById('endRun').click()`); await wait(900);
    ok('after a practice run "Play again" shows 2 left', /Play again\s*2 left/.test(await txt('#again')));
    await go('atlas');
    ok('Atlas: each practice button shows 3 left', await ev(`[...document.querySelectorAll('#g-atlas button[data-start]:not([data-daily])')].every(b=>/3 left/.test(b.textContent))`));
    await shot('atlas');

    // ---- party: the host's free games on "Start game"
    await go('party');
    await ev(`document.getElementById('ptCreate').click()`); await wait(1500);
    ok('the host sees 3 left on Start game', /Start game\s*3 left/.test(await txt('#ptGo')));
    await shot('party-lobby');

    // ---- with Plus, no tags at all
    await post('/api/admin/plus', { user: 'tester', on: true });
    await go('moreless'); await wait(800);
    ok('with Plus there is no tag', await ev(`!document.querySelector('#mlPractice .left-tag')`));

    ok('no script errors', !t.errors.length);
    if (t.errors.length) console.log(t.errors.join('\n'));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  t.done(out.every(o => o[1]) ? 0 : 1);
})();
