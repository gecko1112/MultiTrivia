// Kitty dress-up: delete asks first, and several saved kitties go into one scene.
const { start, wait } = require('./lib');
const W = Number(process.argv[3]) || 1440, H = Number(process.argv[4]) || 900, TAG = 'wv20' + (W < 600 ? 'm' : '');
(async () => { const t = await start(process.argv[2] || require('path').join(__dirname, '..', '..'), W, H, TAG); const { ev, shot, reload } = t;
  const n = sel => ev(`document.querySelectorAll('${sel}').length`);
  const ox = () => ev(`document.documentElement.scrollWidth-innerWidth`);
  try {
    await reload('#lina'); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    // five different kitties into the closet
    for (const name of ['Mochi', 'Pixel', 'Queen Biscuit', 'Tofu', 'Nori', 'Sixth']) {
      await ev(`document.getElementById('linaRandom').click(); (()=>{const i=document.getElementById('linaName'); i.value='${name}'; i.dispatchEvent(new Event('input'));})(); document.getElementById('linaSave').click()`); await wait(120); }
    console.log('closet', await n('#linaCloset .cl'), '| scene empty text:', await ev(`document.getElementById('linaScene').innerText.slice(0,60)`), '| scene buttons hidden', await ev(`document.getElementById('linaSceneDl').hidden`));
    // delete asks first
    await ev(`document.querySelector('#linaCloset [data-del="0"]').click()`); await wait(100);
    console.log('after x: closet', await n('#linaCloset .cl'), '| asks:', await ev(`document.querySelector('.clsure').innerText.split(String.fromCharCode(10)).join(' | ')`));
    await ev(`document.getElementById('linaCloset').scrollIntoView({block:'center'})`); await shot('01-delete-ask');
    await ev(`document.querySelector('[data-no]').click()`); await wait(100); console.log('keep: closet', await n('#linaCloset .cl'), 'asking', await n('.clsure'));
    await ev(`document.querySelector('#linaCloset [data-del="0"]').click()`); await wait(100); await ev(`document.querySelector('[data-yes]').click()`); await wait(200);
    console.log('delete: closet', await n('#linaCloset .cl'), '| first is now', await ev(`document.querySelector('#linaCloset .cln').textContent`));
    // scene
    for (let i = 0; i < 5; i++) { await ev(`document.querySelector('#linaCloset [data-add="${i}"]').click()`); await wait(80); }
    console.log('scene cats', await n('#linaScene .kitty'), '| chips', await ev(`[...document.querySelectorAll('#linaSceneCats button')].map(b=>b.textContent).join(', ')`), '| note:', await ev(`document.getElementById('linaSceneNote').textContent`));
    await ev(`document.querySelector('#linaCloset [data-add="0"]').click()`); await wait(80);
    console.log('sixth:', await ev(`document.getElementById('linaSceneNote').textContent`), '| cats', await n('#linaScene .kitty'));
    await ev(`document.getElementById('linaScene').scrollIntoView({block:'center'})`); await shot('02-scene-5'); console.log('overflowX', await ox());
    await ev(`document.querySelector('[data-sbg=night]').click()`); await wait(100); await ev(`document.querySelector('[data-out="4"]').click(); document.querySelector('[data-out="3"]').click()`); await wait(150);
    await ev(`document.getElementById('linaScene').scrollIntoView({block:'center'})`); await shot('03-scene-3-night');
    console.log('3 cats on night:', await n('#linaScene .kitty'), await ev(`document.querySelector('[data-sbg].sel').textContent`));
    for (const b of ['room','garden','beach','cafe','clouds']) { await ev(`document.querySelector('[data-sbg=${b}]').click()`); await wait(80); await ev(`document.getElementById('linaScene').scrollIntoView({block:'center'})`); await shot('04-bg-' + b); }
    // download gives a picture
    console.log('download:', await ev(`new Promise(r=>{const o=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){ if(this.download){HTMLAnchorElement.prototype.click=o; r(this.download+' '+this.href.slice(0,22)+' len '+this.href.length);} else o.call(this); }; document.getElementById('linaSceneDl').click(); setTimeout(()=>r('nothing'),4000);})`));
    // saved with the account, and still there after a reload
    await wait(600); console.log('saved on server:', await ev(`fetch('/api/docs/x_lina').then(r=>r.json()).then(j=>j.data.looks.length+' looks, scene '+j.data.scene.bg+' '+j.data.scene.cats.length)`));
    await reload('#lina'); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    console.log('after reload: scene cats', await n('#linaScene .kitty'), '| closet', await n('#linaCloset .cl'));
    await ev(`document.getElementById('linaSceneClear').click()`); await wait(80); console.log('clear asks:', await ev(`document.getElementById('linaSceneClear').textContent`), '| cats', await n('#linaScene .kitty'));
    await ev(`document.getElementById('linaSceneClear').click()`); await wait(150); console.log('cleared: cats', await n('#linaScene .kitty'), '| closet untouched', await n('#linaCloset .cl'));
    console.log('ERRORS', JSON.stringify(t.errors)); t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); } })();
