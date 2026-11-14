// The account window in the browser.
const { start, wait } = require('./lib');
const W = Number(process.argv[3]) || 1440, H = Number(process.argv[4]) || 900, TAG = 'wv19' + (W < 600 ? 'm' : '');
(async () => { const t = await start(process.argv[2] || require('path').join(__dirname, '..', '..'), W, H, TAG); const { ev, shot, reload } = t;
  const txt = id => ev(`(document.getElementById('${id}')||{textContent:''}).textContent`);
  const ox = () => ev(`document.documentElement.scrollWidth-innerWidth`);
  try {
    await reload('#friends'); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    console.log('chip:', await ev(`document.querySelector('.acctbtn').innerText.trim()+' | av='+document.querySelector('#chipAv .av').tagName+' "'+document.querySelector('#chipAv .av').textContent+'"'`), '| table avatars', await ev(`document.querySelectorAll('#dayBody td .av').length`));
    await ev(`document.querySelector('.acctbtn').click()`); await wait(900);
    console.log('window:', await ev(`document.querySelector('.bpm-body').innerText.split(String.fromCharCode(10)).map(x=>x.trim()).filter(Boolean).join(' | ').slice(0,260)`));
    await shot('01-account'); console.log('overflowX', await ox());
    // a 600x400 picture, as a file in the hidden input
    await ev(`(async()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle='#1B998B';x.fillRect(0,0,600,400);x.fillStyle='#FFFD82';x.beginPath();x.arc(300,200,150,0,7);x.fill();
      const b=await new Promise(r=>c.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([b],'me.png',{type:'image/png'}));const i=document.getElementById('acFile');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(1500);
    console.log('after upload:', await txt('acPicMsg'), '| preview', await ev(`(()=>{const i=document.querySelector('#acPic img');return i?i.naturalWidth+'x'+i.naturalHeight:'none'})()`), '| chip', await ev(`document.querySelector('#chipAv .av').tagName`), '| remove shown', await ev(`!document.getElementById('acNoPic').hidden`));
    await shot('02-picture');
    await ev(`document.getElementById('acCur').value='wrong-password-1'; document.getElementById('acNew').value='plum-chair-9917'; document.getElementById('acPw').requestSubmit()`); await wait(500);
    console.log('wrong pw:', await txt('acPwMsg'));
    await ev(`document.getElementById('acCur').value='kiwi-lamp-4421'; document.getElementById('acNew').value='plum-chair-9917'; document.getElementById('acPw').requestSubmit()`); await wait(700);
    console.log('right pw:', await txt('acPwMsg'));
    await ev(`document.getElementById('acOutAll').click()`); await wait(500); console.log('logout all:', await txt('acDevMsg'));
    console.log('export link:', await ev(`fetch('/api/account/export').then(r=>r.json()).then(j=>j.account.username+' picture='+j.account.picture)`));
    await ev(`document.getElementById('acDel').click()`); await wait(200);
    console.log('warning:', await ev(`document.getElementById('acDelBox').innerText.split(String.fromCharCode(10)).map(x=>x.trim()).filter(Boolean).join(' | ')`));
    await ev(`document.getElementById('acDelBox').scrollIntoView({block:'center'})`); await shot('03-delete-warning'); console.log('overflowX', await ox());
    await ev(`document.getElementById('acKeep').click()`); await wait(100); console.log('keep -> box hidden', await ev(`document.getElementById('acDelBox').hidden`));
    await ev(`window.bpModal.close(); location.hash='friends'`); await wait(200); await reload('#friends'); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    console.log('friends table picture:', await ev(`(()=>{const i=document.querySelector('#dayBody tr.meRow td img.av');return i?i.naturalWidth+'px':'none'})()`)); await shot('04-friends');
    await ev(`document.getElementById('lvlChip').click()`); await wait(600); console.log('profile has account button:', await ev(`!!document.querySelector('.bpm-body [data-account]')`));
    await ev(`document.querySelector('.bpm-body [data-account]').click()`); await wait(900);
    await ev(`document.getElementById('acDel').click(); document.getElementById('acDelPw').value='nope-nope-nope'; document.getElementById('acDelForm').requestSubmit()`); await wait(600);
    console.log('delete, wrong pw:', await txt('acDelMsg'));
    await ev(`document.getElementById('acDelPw').value='plum-chair-9917'; document.getElementById('acDelForm').requestSubmit()`); await wait(3500);
    console.log('after delete: gate', await ev(`getComputedStyle(document.getElementById('authGate')).display`), '| me', await ev(`fetch('/api/me').then(r=>r.status)`), '| leftover keys', await ev(`Object.keys(localStorage).filter(k=>k.startsWith('bp_')).join(',')`));
    console.log('ERRORS', JSON.stringify(t.errors.filter(e => !/401/.test(e)))); t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); } })();
