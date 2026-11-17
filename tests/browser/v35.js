// Hunch in the browser: the start card, hints that get more specific, wrong guesses, "Next hint", the end.
const { start, wait } = require('./lib');
const path = require('path');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv35' + (W < 600 ? 'm' : ''), THEME = process.argv[5] || 'dark';
const project = process.argv[2] || path.join(__dirname, '..', '..');
(async () => { const t = await start(project, W, H, TAG); const { ev, cdp, shot } = t;
  const txt = sel => ev(`(document.querySelector('${sel}')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()`);
  const type = async v => { await ev(`(()=>{ const i=document.getElementById('huInp'); i.value=${JSON.stringify(v)}; i.dispatchEvent(new Event('input',{bubbles:true})); })()`); await wait(250); };
  const out = [], ok = (n, c) => out.push([n, !!c]);
  try {
    // today's hero, worked out with the test server's secret (read only)
    const theme = require(path.join(project, 'content', 'hunch-dota.js'));
    const secret = require('../db.js').readDb(project, path.join(__dirname, '..', '.tmp', 'xdata-' + TAG)).secret;
    const date = await ev(`fetch('/api/hu/home').then(r=>r.json()).then(j=>j.date)`);
    const answer = theme.cards[require(path.join(project, 'hunch-server.js'))({ theme, send() {}, readBody() {}, records: () => ({}), save() {}, secret, mayArchive: () => false }).dailyCard(date)].name;
    const notIt = theme.heroes.find(n => !theme.cards.some(c => c.name === n));

    await ev(`localStorage.setItem('bp_theme','${THEME}')`);
    await cdp('Page.navigate', { url: 'http://localhost:3977/#hunch' }); await wait(300); await cdp('Page.reload'); await wait(3200);
    await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    ok('Hunch is in the games list, open', /Open/.test(await txt('#st-hu')));
    ok('the start card explains it in one line', /Every hint makes it easier, and worth less/.test(await txt('#g-hunch .lead')));
    await shot('intro-' + THEME);
    await ev(`document.querySelector('#g-hunch [data-act=daily]').click()`); await wait(900);
    ok('one hint shown, four still locked, worth 100', await ev(`document.querySelectorAll('.hu-hints li:not(.locked)').length===1 && document.querySelectorAll('.hu-hints li.locked').length===4`) && (await txt('.hu-worth')) === '100');
    await type('Mario'); await ev(`document.getElementById('huForm').requestSubmit()`); await wait(700);
    ok('a name not on the list is refused, nothing lost', /isn't on the list/.test(await txt('#huNote')) && (await txt('.hu-worth')) === '100');
    await type(notIt.slice(0, 3));
    ok('suggestions come from the list of heroes', await ev(`document.querySelectorAll('#huList li').length>0`));
    await type(notIt); await ev(`document.getElementById('huForm').requestSubmit()`); await wait(800);
    ok('a wrong guess shows the next hint and the wrong name', await ev(`document.querySelectorAll('.hu-hints li:not(.locked)').length===2`) && (await txt('.hu-wrong')).includes(notIt) && (await txt('.hu-worth')) === '80');
    await ev(`document.querySelector('[data-act=hint]').click()`); await wait(800);
    ok('"Next hint" shows the third, the newest is marked', await ev(`document.querySelectorAll('.hu-hints li:not(.locked)').length===3 && document.querySelector('.hu-hints li.new')===document.querySelectorAll('.hu-hints li')[2]`));
    await shot('play-' + THEME);
    await type(answer.toLowerCase()); await ev(`document.getElementById('huForm').requestSubmit()`); await wait(900);
    ok('the right name: the answer, the points and every hint', (await txt('.hu-answer')).toLowerCase() === answer.toLowerCase() && /\+60 points/.test(await txt('#g-hunch .card')) && await ev(`document.querySelectorAll('.hu-hints li').length===5 && !document.querySelector('.hu-hints li.locked')`));
    ok('the games list shows today\'s points', /\+60/.test(await txt('#st-hu')));
    await shot('end-' + THEME);
    ok('no script errors', !t.errors.length);
    if (t.errors.length) console.log(t.errors.join('\n'));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  t.done(out.every(o => o[1]) ? 0 : 1);
})();
