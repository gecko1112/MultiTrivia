// The legal pages in two languages: the switch, the remembered choice, links from the game, and phone width.
const { start, wait } = require('./lib');
const path = require('path');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv24' + (W < 600 ? 'm' : '');
(async () => { const t = await start(process.argv[2] || path.join(__dirname, '..', '..'), W, H, TAG); const { ev, cdp, shot } = t;
  const go = async u => { await cdp('Page.navigate', { url: 'http://localhost:3977' + u }); await wait(900); };
  const where = () => ev(`location.pathname`);
  try {
    await ev(`fetch('/api/logout',{method:'POST'})`); await ev(`localStorage.removeItem('bp_lang')`);
    for (const p of ['terms', 'privacy', 'refunds', 'imprint']) {
      await go('/de/' + p);
      console.log('/de/' + p, '| lang', await ev(`document.documentElement.lang`), '| h1', await ev(`document.querySelector('h1').textContent`), '| switch', await ev(`(document.querySelector('.lang')||{}).textContent+' -> '+(document.querySelector('.lang')||{getAttribute(){}}).getAttribute('href')`),
        '| overflowX', await ev(`document.documentElement.scrollWidth-innerWidth`), '| h1 wider than page', await ev(`document.querySelector('h1').scrollWidth>document.querySelector('main').clientWidth`),
        '| current', await ev(`(document.querySelector('footer [aria-current]')||{}).textContent`), '| english left', await ev(`/Last changed|missing\\]/.test(document.body.innerText)`));
      if (p === 'terms') { console.log('  nav:', await ev(`[...document.querySelectorAll('footer a')].map(a=>a.textContent+'='+a.getAttribute('href')).join('  ')`)); console.log('  date:', await ev(`document.querySelector('[data-op=updated]').textContent`), '| country:', await ev(`document.querySelector('[data-op=country]').textContent`), '| marker:', await ev(`document.querySelector('[data-op=name]').textContent`), '| play:', await ev(`document.querySelector('.play').textContent`)); await shot('de-terms'); }
      if (p === 'privacy') await shot('de-privacy');
    }
    await go('/terms');
    console.log('/terms | date', await ev(`document.querySelector('[data-op=updated]').textContent`), '| switch', await ev(`document.querySelector('.lang').textContent`), '| stored', await ev(`localStorage.getItem('bp_lang')`));
    await shot('en-terms');
    await ev(`document.querySelector('.lang').click()`); await wait(900);
    console.log('after "Deutsch":', await where(), '| stored', await ev(`localStorage.getItem('bp_lang')`));
    await ev(`[...document.querySelectorAll('footer a')].find(a=>a.textContent==='Datenschutz').click()`); await wait(900);
    console.log('footer "Datenschutz":', await where());
    await go('/pricing'); console.log('/pricing | switch shown', await ev(`!!document.querySelector('.lang')`), '| nav', await ev(`[...document.querySelectorAll('footer a')].map(a=>a.getAttribute('href')).join(' ')`));
    // from the game (login box) and the landing page, with German chosen
    await go('/'); await wait(1500);
    await ev(`[...document.querySelectorAll('a')].find(a=>a.getAttribute('href')==='/privacy').click()`); await wait(900);
    console.log('game link "Privacy", German chosen:', await where());
    await ev(`document.querySelector('.lang').click()`); await wait(900);
    console.log('after "English":', await where(), '| stored', await ev(`localStorage.getItem('bp_lang')`));
    await go('/welcome'); await wait(800);
    await ev(`[...document.querySelectorAll('footer a')].find(a=>a.getAttribute('href')==='/imprint').click()`); await wait(900);
    console.log('landing link "Impressum", English chosen:', await where());
    await ev(`localStorage.removeItem('bp_lang')`); await go('/welcome'); await wait(800);
    console.log('no choice, browser language', await ev(`navigator.language`));
    await ev(`[...document.querySelectorAll('footer a')].find(a=>a.getAttribute('href')==='/terms').click()`); await wait(900);
    console.log('  landing link "Terms":', await where());
    await go('/welcome'); await wait(800); await ev(`Object.defineProperty(navigator,'language',{get:()=>'de-DE'})`);
    await ev(`[...document.querySelectorAll('footer a')].find(a=>a.getAttribute('href')==='/terms').click()`); await wait(900);
    console.log('  the same with a German browser:', await where());
    console.log('status:', await ev(`Promise.all(['/de/terms','/de/pricing','/de/welcome','/de/../server.js','/imprint'].map(u=>fetch(u).then(r=>u+' '+r.status))).then(a=>a.join(' | '))`));
    console.log('ERRORS', JSON.stringify(t.errors.filter(e => !/401/.test(e)))); t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); } })();
