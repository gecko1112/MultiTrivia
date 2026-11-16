// Survival's question packs: one "Questions" select. Without Plus, picking a pack opens the Plus window and the choice
// goes back to Standard; with Plus, a practice run uses the chosen pack. gecko is the admin who gives himself Plus.
const { start, wait } = require('./lib');
const fs = require('fs'), path = require('path');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv30', THEME = process.argv[5] || 'dark';
(async () => { const t = await start(process.argv[2] || path.join(__dirname, '..', '..'), W, H, TAG); const { ev, cdp, shot } = t;
  fs.writeFileSync(path.join(__dirname, '..', '.tmp', 'xdata-' + TAG, 'admins.txt'), 'gecko\n');
  const txt = sel => ev(`(document.querySelector('${sel}')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()`);
  const go = async () => { await cdp('Page.navigate', { url: 'http://localhost:3977/#survival' }); await wait(300); await cdp('Page.reload'); await wait(3200); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`); };
  const choose = v => ev(`(s=>{ s.value='${v}'; s.dispatchEvent(new Event('change',{bubbles:true})); })(document.getElementById('packSel'))`);
  const out = [], ok = (n, c) => out.push([n, !!c]);
  try {
    await ev(`localStorage.setItem('bp_theme','${THEME}')`);
    await go();
    const names = await ev(`[...document.querySelectorAll('#packSel option')].map(o=>o.textContent)`);
    ok('the select lists Standard and every pack', names[0] === 'Standard' && ['Countries by size', 'Neighbours', 'Animals', 'Sports and games', 'Food and drink'].every(n => names.includes(n)));
    ok('one Plus tag on the label for a free account', await ev(`getComputedStyle(document.querySelector('.pick-lbl .ptag')).display!=='none'`));
    await choose('animals'); await wait(700);
    ok('without Plus, a pack opens the Plus window', /Question packs are part of Plus/.test(await txt('.bpm')));
    ok('and the choice goes back to Standard', (await ev(`document.getElementById('packSel').value`)) === '');
    await ev(`document.querySelector('.bpm-x').click()`); await wait(300);
    await shot('basic-' + THEME);

    await ev(`fetch('/api/admin/plus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:'gecko',on:true})})`); await wait(300);
    await go(); await wait(600);
    ok('with Plus the tag is gone', await ev(`getComputedStyle(document.querySelector('.pick-lbl .ptag')).display==='none'`));
    await choose('animals'); await wait(300);
    ok('a pack can be chosen and is marked', (await ev(`document.getElementById('packSel').value`)) === 'animals' && await ev(`document.getElementById('packSel').classList.contains('on')`));
    await shot('plus-' + THEME);
    await ev(`document.getElementById('go').click()`); await wait(1000);
    const q = await txt('#q');
    const animals = require(path.join(__dirname, '..', '..', 'content', 'packs', 'animals.js')).q.map(x => x.q);
    ok('the practice run asks a question from that pack', animals.includes(q));
    ok('no script errors', !t.errors.length);
    if (t.errors.length) console.log(t.errors.join('\n'));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  t.done(out.every(o => o[1]) ? 0 : 1);
})();
