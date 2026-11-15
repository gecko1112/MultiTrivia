// The friends box in the Friends tab (real friends rules: BP_FRIENDS is switched off for this run).
process.env.BP_FRIENDS = '';
const { start, wait } = require('./lib');
const W = Number(process.argv[3]) || 1440, H = Number(process.argv[4]) || 900, TAG = 'wv21' + (W < 600 ? 'm' : '');
(async () => { const t = await start(process.argv[2] || require('path').join(__dirname, '..', '..'), W, H, TAG); const { ev, shot, reload } = t;
  const box = () => ev(`document.getElementById('frBox').innerText.split(String.fromCharCode(10)).map(x=>x.trim()).filter(Boolean).join(' | ')`);
  const table = () => ev(`[...document.querySelectorAll('#dayBody .daytable tr td:first-child')].map(td=>td.innerText.trim()).filter(Boolean).join(',')`);
  const as = (name, fn) => ev(`(async()=>{ const J=(m,u,b)=>fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(r=>r.json()); await J('POST','/api/logout'); await J('POST','/api/login',{username:'${name}',password:'kiwi-lamp-4421'}); const out=await (${fn})(J); await J('POST','/api/logout'); await J('POST','/api/login',{username:'gecko',password:'kiwi-lamp-4421'}); return JSON.stringify(out); })()`);
  try {
    await reload('#friends'); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    console.log('1 new account:', await box()); console.log('  table:', await table()); await shot('01-empty'); console.log('  overflowX', await ev(`document.documentElement.scrollWidth-innerWidth`));
    await ev(`document.getElementById('frWho').value='nobody-here'; document.getElementById('frAdd').requestSubmit()`); await wait(500);
    console.log('  unknown:', await ev(`document.getElementById('frMsg').textContent`));
    await ev(`document.getElementById('frWho').value='LINI'; document.getElementById('frAdd').requestSubmit()`); await wait(600);
    console.log('2 asked lini:', await box());
    // fickric asks gecko; lini accepts gecko
    console.log('  others:', await as('fickric', `J=>J('POST','/api/friends/add',{who:'gecko'}).then(j=>j.now)`), await as('lini', `J=>J('POST','/api/friends/accept',{user:'gecko'}).then(j=>j.friends.length)`));
    await reload('#friends'); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    console.log('3 after reload:', await box()); console.log('  tab badge:', await ev(`(document.querySelector('.frn')||{textContent:'none'}).textContent`), '| table:', await table());
    await shot('02-request'); console.log('  overflowX', await ev(`document.documentElement.scrollWidth-innerWidth`));
    await ev(`document.querySelector('[data-fr=accept]').click()`); await wait(1200);
    console.log('4 accepted:', await box()); console.log('  badge:', await ev(`(document.querySelector('.frn')||{textContent:'none'}).textContent`), '| table:', await table(), '| side panel:', await ev(`document.getElementById('sdFriends').innerText.split(String.fromCharCode(10)).join(' ').slice(0,80)`));
    // the friend list with its remove buttons sits behind "Manage"
    console.log('  manage closed, remove buttons:', await ev(`document.querySelectorAll('[data-fr=remove]').length`)); await ev(`document.getElementById('frManage').click()`); await wait(200);
    await ev(`document.querySelector('[data-fr=remove][data-u=lini]').click()`); await wait(150);
    console.log('5 remove asks:', await ev(`document.querySelector('[data-fr=remove][data-u=lini]').textContent`), '| still friends', await ev(`document.querySelectorAll('[data-fr=remove]').length`));
    await shot('03-friends');
    await ev(`document.querySelector('[data-fr=remove][data-u=lini]').click()`); await wait(1200);
    console.log('  removed:', await box()); console.log('  table:', await table());
    console.log('ERRORS', JSON.stringify(t.errors)); t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); } })();
