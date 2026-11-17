// Oddball in the browser: the start card, a question with suggestions, the result of an answer, the end screen.
const { start, wait } = require('./lib');
const fs = require('fs'), path = require('path');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv34' + (W < 600 ? 'm' : ''), THEME = process.argv[5] || 'dark';
const project = process.argv[2] || path.join(__dirname, '..', '..');
const C = JSON.parse(fs.readFileSync(path.join(project, 'geo', 'countries.json'), 'utf8')).countries, byName = new Map(C.map(c => [c.name, c]));
const cont = c => c.cont.startsWith('Seven') ? (c.sub.endsWith('Africa') ? 'Africa' : 'Asia') : c.cont;
function rightAnswers(text) {
  let m;
  if ((m = /^Name a country in (.+)\.$/.exec(text))) return C.filter(c => cont(c) === m[1] || c.sub === m[1]).map(c => c.name);
  if ((m = /^Name a country that borders (?:the )?(.+)\.$/.exec(text))) return byName.get(m[1]).nb.map(id => C.find(x => x.id === id).name);
  if ((m = /^Name a country whose name starts with (.)\.$/.exec(text))) return C.filter(c => c.name[0] === m[1]).map(c => c.name);
  return [];
}
(async () => { const t = await start(project, W, H, TAG); const { ev, cdp, shot } = t;
  const txt = sel => ev(`(document.querySelector('${sel}')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()`);
  const type = async v => { await ev(`(()=>{ const i=document.getElementById('odInp'); i.value=${JSON.stringify(v)}; i.dispatchEvent(new Event('input',{bubbles:true})); })()`); await wait(250); };
  const out = [], ok = (n, c) => out.push([n, !!c]);
  try {
    await ev(`localStorage.setItem('bp_theme','${THEME}')`);
    await cdp('Page.navigate', { url: 'http://localhost:3977/#oddball' }); await wait(300); await cdp('Page.reload'); await wait(3200);
    await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    ok('Oddball is in the games list, open', /Open/.test(await txt('#st-od')));
    ok('the start card explains it in one line', /rarer your right answer/.test(await txt('#g-oddball .lead')));
    await shot('intro-' + THEME);
    await ev(`document.querySelector('#g-oddball [data-act=daily]').click()`); await wait(900);
    let q = await txt('#g-oddball .q');
    ok('a question with many right answers', /^Name a country/.test(q));
    const answers = rightAnswers(q), pick = answers[answers.length - 1];
    await type(pick.slice(0, 2));
    ok('no suggestions before three letters', await ev(`document.getElementById('odList').hidden`));
    await type(pick.slice(0, 4));
    ok('suggestions from three letters on', await ev(`!document.getElementById('odList').hidden && document.querySelectorAll('#odList li').length>0`));
    await shot('question-' + THEME);
    await type(pick); await ev(`document.getElementById('odForm').requestSubmit()`); await wait(900);
    ok('the answer\'s points, where it sits and the rarest right answers', /Your answer/.test(await txt('.od-res')) && /\+\d+/.test(await txt('.od-pts')) && await ev(`!!document.querySelector('.od-scale i')`) && /Rarest right answers/.test(await txt('.od-rare')));
    await shot('result-' + THEME);
    await ev(`document.querySelector('[data-act=next]').click()`); await wait(400);
    q = await txt('#g-oddball .q');
    const wrong = C.find(c => !rightAnswers(q).includes(c.name)).name;
    await type(wrong); await ev(`document.getElementById('odForm').requestSubmit()`); await wait(900);
    ok('a country that does not fit says so and scores 0', /Does not fit/.test(await txt('.od-res')) && (await txt('.od-pts')) === '0');
    await ev(`document.querySelector('[data-act=next]').click()`); await wait(400);
    q = await txt('#g-oddball .q');
    await type('Atlantis'); await ev(`document.getElementById('odForm').requestSubmit()`); await wait(700);
    ok('a name that is no country is refused, the question stays', /isn't a country/.test(await txt('#odNote')) && !!(await ev(`document.getElementById('odInp')`)));
    await type(rightAnswers(q)[0]); await ev(`document.getElementById('odForm').requestSubmit()`); await wait(900);
    await ev(`document.querySelector('[data-act=next]').click()`); await wait(900);
    ok('the end: the total out of 300 and every answer', /out of 300/.test(await txt('#g-oddball .card')) && await ev(`document.querySelectorAll('#g-oddball .hrow').length===3`));
    ok('the games list shows today\'s score', /\/ 300/.test(await txt('#st-od')));
    await shot('end-' + THEME);
    ok('no script errors', !t.errors.length);
    if (t.errors.length) console.log(t.errors.join('\n'));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  t.done(out.every(o => o[1]) ? 0 : 1);
})();
