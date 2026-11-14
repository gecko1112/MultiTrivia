// The Plus button and the buy options are hidden outside the developer preview.
const { start, wait } = require('./lib');
const W = Number(process.argv[3]) || 1440, H = Number(process.argv[4]) || 900;
(async () => { const t = await start(process.argv[2] || require('path').join(__dirname, '..', '..'), W, H, 'wv23'); const { ev, reload } = t;
  const btn = () => ev(`(()=>{const b=document.getElementById('plusBtn');return getComputedStyle(b).display+' "'+b.textContent+'"'})()`);
  const offer = () => ev(`(()=>{const m=document.querySelector('.bpm-body');return m?('prices:'+m.querySelectorAll('.plus-opt').length+' getPlus:'+!!document.getElementById('plusGo')+' note:"'+document.getElementById('plusNote').textContent+'" close:"'+document.getElementById('plusNo').textContent+'" table rows:'+m.querySelectorAll('.plus-cmp tbody tr').length):'no window'})()`);
  try {
    await reload('#friends'); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    console.log('normal: button', await btn());
    await ev(`document.querySelector('[data-plus=h2h]').click()`); await wait(300);
    console.log('normal: offer from a teaser ->', await offer()); await ev(`window.bpModal.close()`);
    await ev(`localStorage.setItem('bp_dev','1'); localStorage.setItem('bp_dev_shut','1')`); await reload('#friends'); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    console.log('dev: button', await btn());
    await ev(`document.getElementById('plusBtn').click()`); await wait(300);
    console.log('dev: offer ->', await offer()); await ev(`window.bpModal.close()`);
    // a member outside dev still sees the button
    require('fs').writeFileSync(require('path').join(__dirname, '..', '.tmp', 'xdata-wv23', 'admins.txt'), 'gecko');
    await ev(`fetch('/api/admin/plus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:'gecko',on:true})}).then(r=>r.status)`);
    await ev(`localStorage.removeItem('bp_dev')`); await reload('#friends'); await wait(2500); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    console.log('member, not dev: button', await btn());
    console.log('ERRORS', JSON.stringify(t.errors)); t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); } })();
