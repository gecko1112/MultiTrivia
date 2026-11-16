// Reporting a friend's picture from the Friends list, and the admin's list of reported pictures in the developer panel.
// Friends rules are on (BP_FRIENDS empty), so the Friends box with "Manage" is shown. gecko is the admin.
process.env.BP_FRIENDS = '';
const { start, wait } = require('./lib');
const fs = require('fs'), path = require('path');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv29', THEME = process.argv[5] || 'dark';
(async () => { const t = await start(process.argv[2] || path.join(__dirname, '..', '..'), W, H, TAG); const { ev, cdp, shot } = t;
  fs.writeFileSync(path.join(__dirname, '..', '.tmp', 'xdata-' + TAG, 'admins.txt'), 'gecko\n');
  const txt = sel => ev(`(document.querySelector('${sel}')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()`);
  const go = async url => { await cdp('Page.navigate', { url: 'http://localhost:3977/' + url }); await wait(300); await cdp('Page.reload'); await wait(3200); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`); };
  const out = [], ok = (n, c) => out.push([n, !!c]);
  try {
    // lini gets a picture and asks gecko to be friends; gecko accepts
    await ev(`(async()=>{ const J=(m,u,b)=>fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});
      await J('POST','/api/logout'); await J('POST','/api/login',{username:'lini',password:'kiwi-lamp-4421'});
      const c=document.createElement('canvas'); c.width=c.height=96; const x=c.getContext('2d'); x.fillStyle='#e0697a'; x.fillRect(0,0,96,96); x.fillStyle='#fff'; x.beginPath(); x.arc(48,40,18,0,7); x.fill(); x.fillRect(22,64,52,32);
      await J('PUT','/api/account/avatar',{image:c.toDataURL('image/png')}); await J('POST','/api/friends/add',{who:'gecko'});
      await J('POST','/api/logout'); await J('POST','/api/login',{username:'gecko',password:'kiwi-lamp-4421'}); await J('POST','/api/friends/accept',{user:'lini'});
      localStorage.setItem('bp_theme','${THEME}'); localStorage.setItem('bp_bot_tour_gecko','1'); })()`);
    await go('#friends');
    await ev(`document.getElementById('frManage').click()`); await wait(400);
    ok('a friend with a picture has a report button', await ev(`!!document.querySelector('[data-fr=report][data-u=lini]')`));
    ok('a friend without a picture has none', !(await ev(`!!document.querySelector('[data-fr=report]:not([data-u=lini])')`)));
    await shot('list-' + THEME);
    await ev(`document.querySelector('[data-fr=report][data-u=lini]').click()`); await wait(200);
    ok('the first click asks', (await txt('[data-fr=report][data-u=lini]')) === 'Report picture?');
    await shot('confirm-' + THEME);
    await ev(`document.querySelector('[data-fr=report][data-u=lini]').click()`); await wait(800);
    ok('the second click reports and says so', /Reported\. We'll take a look\./.test(await txt('#frMsg')));
    await shot('reported-' + THEME);
    await ev(`document.querySelector('[data-fr=report][data-u=lini]').click()`); await wait(200); await ev(`document.querySelector('[data-fr=report][data-u=lini]').click()`); await wait(800);
    ok('a second report the same day is refused calmly', /already reported/.test(await txt('#frMsg')) && !(await ev(`document.getElementById('frMsg').classList.contains('bad')`)));

    // ---- the admin's list
    await go('?dev=1#friends');
    await ev(`(()=>{ const b=document.querySelector('.devbar'); if(b&&b.classList.contains('shut')) document.getElementById('dvToggle').click(); })()`); await wait(800);
    ok('the developer panel lists the reported picture', /Reported pictures/.test(await txt('#dvReports')) && /lini/.test(await txt('#dvReports')) && /Reported by gecko/.test(await txt('#dvReports')));
    ok('with the picture as it was reported', await ev(`(i=>!!i&&i.complete&&i.naturalWidth>0)(document.querySelector('#dvReports img'))`));
    await shot('dev-' + THEME);
    await ev(`document.getElementById('dvToggle').click()`); await wait(300);
    ok('closed, the panel still shows the count', /1 report/.test(await txt('#dvNow')));
    await ev(`document.getElementById('dvToggle').click()`); await wait(300);
    await ev(`document.querySelector('[data-rep=remove]').click()`); await wait(150);
    ok('removing asks first', /Remove for good\?/.test(await txt('[data-rep=remove]')));
    await ev(`document.querySelector('[data-rep=remove]').click()`); await wait(900);
    ok('removed: the list is empty and the picture is gone', !(await txt('#dvReports')) && (await ev(`fetch('/api/avatar/lini').then(r=>r.status)`)) === 404);
    ok('no script errors', !t.errors.length);
    if (t.errors.length) console.log(t.errors.join('\n'));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  t.done(out.every(o => o[1]) ? 0 : 1);
})();
