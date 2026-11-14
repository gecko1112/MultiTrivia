// The remaining Plus features in the browser: question packs, head-to-head, statistics, streak saver.
const { start, wait } = require('./lib');
const project = process.argv[2] || require('path').join(__dirname, '..', '..'), W = Number(process.argv[3]) || 1440, H = Number(process.argv[4]) || 900, TAG = 'wv15' + (W < 600 ? 'm' : '');
(async () => {
  const t = await start(project, W, H, TAG);
  const { ev, shot, reload } = t;
  const txt = sel => ev(`(document.querySelector('${sel}')||{innerText:''}).innerText.replace(/\\s*[\\r\\n]+\\s*/g,' | ')`);
  const clean = () => ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
  const ox = () => ev(`document.documentElement.scrollWidth-innerWidth`);
  try {
    // a history with a gap for the streak saver, and categories for the statistics
    await ev(`(async()=>{ const k=n=>{const d=new Date();d.setHours(12);d.setDate(d.getDate()-n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
      const ml={},gl={}; [0,1,3,4,5,6,7,8].forEach((n,i)=>{ ml[k(n)]={score:15+i,grid:[[1,1,1,0,1],[1,0,0,0,1]],cats:['Spotify','Movies']}; gl[k(n)]={total:300+i*10,res:[{cat:'Space',q:'q',g:1,a:1,u:'m',pts:90-i},{cat:'History',q:'q',g:1,a:1,u:'m',pts:30+i}]}; });
      await fetch('/api/docs/x_stats',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({ml:{days:ml,best:22,played:8},gl:{days:gl,best:370,played:8},cl:{days:{},solved:0,played:0}})}); })()`);
    // ---- Basic
    await reload('#survival'); await clean();
    console.log('basic, pack row:', await txt('#packOpts'));
    await ev(`document.querySelector('#packOpts [data-pack=countries]').click()`); await wait(300);
    console.log('basic, pack click ->', await txt('.plus-lead'), '| still standard:', await ev(`document.querySelector('#packOpts .sel').textContent`));
    await ev(`window.bpModal.close()`); await shot('01-basic-start'); console.log('overflowX', await ox());
    await ev(`location.hash='friends'`); await wait(1200);
    console.log('basic, h2h:', await txt('#h2h'));
    await ev(`location.hash='archive'`); await wait(1200);
    console.log('basic, archive cells:', await txt('.ar-cells'), '| kept days:', await ev(`document.querySelectorAll('.ar-d.kept').length`));

    // ---- Plus
    await ev(`localStorage.setItem('bp_dev','1'); localStorage.setItem('bp_dev_shut','1'); localStorage.setItem('bp_plus','1'); fetch('/api/admin/plus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:'gecko',on:true})}).then(r=>r.status)`);
    await reload('#survival'); await clean();
    console.log('plus, pack row:', await txt('#packOpts'));
    await ev(`document.querySelector('#packOpts [data-pack=countries]').click()`); await wait(200);
    console.log('selected:', await ev(`document.querySelector('#packOpts .sel').textContent`)); await shot('02-plus-start');
    await ev(`document.getElementById('go').click()`); await wait(500);
    const q1 = await txt('#q'); console.log('pack question:', q1, '| unit:', await txt('#unit'));
    await reload('#survival', 2500); await clean();
    console.log('after reload, same question:', (await txt('#q')) === q1);
    await ev(`document.getElementById('inp').value='500000'; document.getElementById('f').requestSubmit()`); await wait(900);
    console.log('reveal:', (await txt('#rev')).slice(0, 160));
    const before = await ev(`fetch('/api/docs').then(r=>r.json()).then(j=>j.docs.filter(d=>!d.id.startsWith('x_')).length)`);
    await ev(`document.getElementById('endRun').click()`); await wait(300); await ev(`document.getElementById('endRun').click()`); await wait(1200);
    console.log('over:', await txt('#finalSub'), '| saved runs before/after:', before, await ev(`fetch('/api/docs').then(r=>r.json()).then(j=>j.docs.filter(d=>!d.id.startsWith('x_')).length)`));

    await ev(`location.hash='friends'`); await wait(1500);
    console.log('plus, h2h:', await txt('#h2h'));
    await ev(`document.querySelector('[data-h2h]').click()`); await wait(200);
    console.log('h2h detail:', await txt('#h2h .detbox')); await ev(`document.getElementById('h2h').scrollIntoView()`); await shot('03-h2h'); console.log('overflowX', await ox());

    await ev(`location.hash='moreless'`); await wait(500);
    await ev(`document.querySelector('#g-moreless [data-plus=stats]').click()`); await wait(1200);
    console.log('stats:', (await txt('.bpm-body, .modal, [role=dialog]')).slice(0, 700)); await shot('04-stats');
    await ev(`window.bpModal.close()`);

    await ev(`location.hash='archive'`); await wait(1500);
    console.log('plus, archive cells:', await txt('.ar-cells'), '| kept days:', await ev(`document.querySelectorAll('.ar-d.kept').length`), '| key:', await txt('.ar-key'));
    await shot('05-archive'); console.log('overflowX', await ox());
    await ev(`document.getElementById('lvlChip').click()`); await wait(800);
    console.log('profile best streak:', (await txt('.pf-cells')));
    console.log('ERRORS', JSON.stringify(t.errors));
    t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); }
})();
