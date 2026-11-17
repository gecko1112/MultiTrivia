// Hunch in the browser: the start card with its games, hints that get more specific, wrong guesses, "Next hint",
// the end with the character's game, and Plus members switching games off.
const { start, wait } = require('./lib');
const path = require('path'), fs = require('fs');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv35' + (W < 600 ? 'm' : ''), THEME = process.argv[5] || 'dark';
const project = process.argv[2] || path.join(__dirname, '..', '..');
(async () => { const t = await start(project, W, H, TAG); const { ev, cdp, shot } = t;
  const txt = sel => ev(`(document.querySelector('${sel}')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()`);
  const type = async v => { await ev(`(()=>{ const i=document.getElementById('huInp'); i.value=${JSON.stringify(v)}; i.dispatchEvent(new Event('input',{bubbles:true})); })()`); await wait(250); };
  const pressed = () => ev(`[...document.querySelectorAll('#huChips [data-game]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.game).join()`);
  const out = [], ok = (n, c) => out.push([n, !!c]);
  try {
    // today's character, worked out with the test server's secret (read only)
    const games = require(path.join(project, 'content', 'hunch.js'));
    const dataDir = path.join(__dirname, '..', '.tmp', 'xdata-' + TAG);
    const secret = require('../db.js').readDb(project, dataDir).secret;
    const date = await ev(`fetch('/api/hu/home').then(r=>r.json()).then(j=>j.date)`);
    const S = require(path.join(project, 'hunch-server.js'))({ games, send() {}, readBody() {}, records: () => ({}), save() {}, secret, mayArchive: () => false });
    const card = S.card(S.dailyCard(date)), answer = card.name, gameName = games.find(g => g.id === card.game).name;
    const notIt = games.flatMap(g => g.names).find(n => !games.some(g => g.cards.some(c => c.name === n)));

    await ev(`localStorage.setItem('bp_theme','${THEME}')`);
    await cdp('Page.navigate', { url: 'http://localhost:3977/#hunch' }); await wait(300); await cdp('Page.reload'); await wait(3200);
    await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    ok('Hunch is in the games list, open', /Open/.test(await txt('#st-hu')));
    ok('the start card explains it in one line', /Guess the game character\. Every hint makes it easier, and worth less/.test(await txt('#g-hunch .lead')));
    ok('the five games are listed, all on, with the Plus tag', (await pressed()) === 'dota,wow,lol,overwatch,valorant' && /Games\s*Plus/.test(await txt('.hu-games .pick-lbl')));
    await shot('intro-' + THEME);
    await ev(`document.querySelector('#huChips [data-game=wow]').click()`); await wait(600);
    ok('without Plus, a game shows the Plus offer and stays on', await ev(`!!document.querySelector('.bpm')`) && /Picking the games in Hunch is part of Plus/.test(await ev(`document.querySelector('.bpm').textContent`)) && (await pressed()).includes('wow'));
    await ev(`window.bpModal.close()`); await wait(200);

    await ev(`document.querySelector('#g-hunch [data-act=daily]').click()`); await wait(900);
    ok('one hint shown, four still locked, worth 100, no game named', await ev(`document.querySelectorAll('.hu-hints li:not(.locked)').length===1 && document.querySelectorAll('.hu-hints li.locked').length===4`) && (await txt('.hu-worth')) === '100' && !/Dota|Warcraft|League|Overwatch|Valorant/.test(await txt('.mlhead')));
    await type('Mario'); await ev(`document.getElementById('huForm').requestSubmit()`); await wait(700);
    ok('a name not on the list is refused, nothing lost', /isn't on the list/.test(await txt('#huNote')) && (await txt('.hu-worth')) === '100');
    await type('vip');
    ok('suggestions name their game, both for a name in two games', /Viper\s*Dota 2, Valorant/.test(await txt('#huList')));
    await type(notIt.slice(0, 3));
    ok('suggestions come from the list of characters', await ev(`document.querySelectorAll('#huList li').length>0`));
    await type(notIt); await ev(`document.getElementById('huForm').requestSubmit()`); await wait(800);
    ok('a wrong guess shows the next hint and the wrong name', await ev(`document.querySelectorAll('.hu-hints li:not(.locked)').length===2`) && (await txt('.hu-wrong')).includes(notIt) && (await txt('.hu-worth')) === '80');
    await ev(`document.querySelector('[data-act=hint]').click()`); await wait(800);
    ok('"Next hint" shows the third, the newest is marked', await ev(`document.querySelectorAll('.hu-hints li:not(.locked)').length===3 && document.querySelector('.hu-hints li.new')===document.querySelectorAll('.hu-hints li')[2]`));
    await type('vip'); await shot('play-' + THEME); await type('');
    await type(answer.toLowerCase()); await ev(`document.getElementById('huForm').requestSubmit()`); await wait(900);
    ok('the right name: the answer, its game, the points and every hint', (await txt('.hu-answer')).toLowerCase() === answer.toLowerCase() && (await txt('.hu-game')) === gameName && /\+60 points/.test(await txt('#g-hunch .card')) && await ev(`document.querySelectorAll('.hu-hints li').length===5 && !document.querySelector('.hu-hints li.locked')`));
    ok('the games list shows today\'s points', /\+60/.test(await txt('#st-hu')));
    await shot('end-' + THEME);

    // ---- Plus: the games can be switched off (an admin gives the account Plus, as in the developer panel)
    fs.writeFileSync(path.join(dataDir, 'admins.txt'), 'gecko\n');
    await ev(`fetch('/api/admin/plus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user:'gecko',on:true})}).then(r=>r.status)`);
    await cdp('Page.reload'); await wait(3200);
    await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    ok('with Plus, no Plus tag', !/Plus/.test(await txt('.hu-games .pick-lbl')));
    await ev(`document.querySelector('#huChips [data-game=dota]').focus(); document.querySelector('#huChips [data-game=dota]').click()`); await wait(600);
    ok('a game switches off, and keeps the keyboard focus', (await pressed()) === 'wow,lol,overwatch,valorant' && await ev(`document.activeElement===document.querySelector('#huChips [data-game=dota]')`));
    ok('...and the server has it', await ev(`fetch('/api/hu/home').then(r=>r.json()).then(j=>j.games.filter(g=>!g.on).map(g=>g.id).join())`) === 'dota');
    for (const g of ['wow', 'lol', 'overwatch']) { await ev(`document.querySelector('#huChips [data-game=${g}]').click()`); await wait(450); }
    await shot('games-' + THEME);
    await ev(`document.querySelector('#huChips [data-game=valorant]').click()`); await wait(450);
    ok('the last game cannot be switched off', (await pressed()) === 'valorant' && /Keep at least one game/.test(await txt('#huMsg')));
    await ev(`document.querySelector('#huChips [data-game=dota]').click()`); await wait(600);
    ok('a game switches back on', (await pressed()) === 'dota,valorant' && !(await txt('#huMsg')));
    await cdp('Page.reload'); await wait(3200);
    ok('the choice is kept', (await pressed()) === 'dota,valorant');
    ok('no script errors', !t.errors.length);
    if (t.errors.length) console.log(t.errors.join('\n'));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  t.done(out.every(o => o[1]) ? 0 : 1);
})();
