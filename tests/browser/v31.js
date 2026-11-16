// Levels in the browser, now drawn from the server (levels-server.js): the chip, the side panel, the first-time toast,
// the profile window, and a Fermi achievement reported by the page.
const { start, wait } = require('./lib');
const path = require('path');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv31';
(async () => { const t = await start(process.argv[2] || path.join(__dirname, '..', '..'), W, H, TAG); const { ev, cdp, shot } = t;
  const txt = sel => ev(`(document.querySelector('${sel}')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()`);
  const out = [], ok = (n, c) => out.push([n, !!c]);
  try {
    const server = await ev(`fetch('/api/levels').then(r=>r.json())`);   // what the server says (this also announces it)
    await cdp('Page.reload'); await wait(3200);
    ok('the chip shows the server\'s level', (await txt('#lvlChip')).startsWith('LV ' + server.level));
    ok('gecko\'s two daily results earned achievements', server.achievements.filter(a => a.got).length >= 3 && server.stats.dailies === 2);
    await ev(`document.getElementById('lvlChip').click()`); await wait(500);
    ok('the side panel shows the level and the count', new RegExp('Level ' + server.level).test(await txt('#sdLevel')) && /Achievements\s*\d+ of 37/.test(await txt('#sdLevel')));
    await ev(`document.querySelector('#side [data-profile]').click()`); await wait(600);
    ok('the profile window lists every group', await (async () => { const m = await txt('.bpm'); return ['Overall', 'Survival', 'More/Less', 'Atlas', 'With friends', 'Fermi'].every(g => m.includes(g)); })());
    ok('progress bars are drawn for counting achievements', await ev(`document.querySelectorAll('.bpm .ach .pg').length>0`));
    ok('secret ones stay secret', /Hidden until you find it/.test(await txt('.bpm')));
    await shot('profile');
    await ev(`document.querySelector('.bpm-x').click()`); await wait(300);
    await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    // Fermi: bot.js sends this event when he is found
    await ev(`window.dispatchEvent(new CustomEvent('bp-bot',{detail:'poke'}))`); await wait(1200);
    ok('finding Fermi is announced with its name', /There he is/.test(await txt('.bpt')));
    await shot('toast');
    const after = await ev(`fetch('/api/levels').then(r=>r.json())`);
    ok('and counted on the server', after.achievements.find(a => a.id === 'poke').got && after.xp === server.xp + 25);
    ok('no script errors', !t.errors.length);
    if (t.errors.length) console.log(t.errors.join('\n'));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  t.done(out.every(o => o[1]) ? 0 : 1);
})();
