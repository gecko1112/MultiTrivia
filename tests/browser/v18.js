// Public pages: reachable without login, links, fonts from our own server, no outside requests.
const { start, wait } = require('./lib');
const W = Number(process.argv[3]) || 1440, H = Number(process.argv[4]) || 900, TAG = 'wv18' + (W < 600 ? 'm' : '');
(async () => { const t = await start(process.argv[2] || require('path').join(__dirname, '..', '..'), W, H, TAG); const { ev, shot, cdp, reload } = t;
  const outside = []; 
  try {
    await cdp('Network.enable');
    // (lib does not expose events; ask the page instead through the resource timing list)
    const ext = () => ev(`performance.getEntriesByType('resource').map(e=>e.name).filter(n=>!n.startsWith(location.origin)).join(' ')`);
    await reload('#survival'); await ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
    console.log('game page: outside requests [' + await ext() + '] | head font', await ev(`getComputedStyle(document.querySelector('h1')).fontFamily.split(',')[0]`), '| loaded', await ev(`document.fonts.check('700 30px "Barlow Condensed"')+'/'+document.fonts.check('400 16px Inter')`));
    console.log('footer:', await ev(`[...document.querySelectorAll('.sitefoot a')].map(a=>a.getAttribute('href')).join(' ')`), '| overflowX', await ev(`document.documentElement.scrollWidth-innerWidth`));
    await ev(`document.querySelector('.sitefoot').scrollIntoView()`); await shot('00-footer');
    await ev(`document.getElementById('plusBtn').click()`); await wait(300);
    console.log('plus window prices:', await ev(`[...document.querySelectorAll('.plus-opt b')].map(b=>b.textContent).join(' ')`), '| links', await ev(`[...document.querySelectorAll('.plus-note a')].map(a=>a.getAttribute('href')).join(' ')`));
    await ev(`fetch('/api/logout',{method:'POST'})`); await wait(300);
    for (const p of ['pricing', 'terms', 'privacy', 'refunds', 'imprint']) {
      await cdp('Page.navigate', { url: 'http://localhost:3977/' + p }); await wait(1500);
      console.log(p + ':', await ev(`document.querySelector('h1').textContent`), '| words', await ev(`document.querySelector('main').innerText.split(/\s+/).length`), '| missing', await ev(`document.querySelectorAll('mark').length`), '| prices', await ev(`[...document.querySelectorAll('[data-price]')].map(e=>e.textContent).join(' ')`),
        '| nav', await ev(`document.querySelectorAll('footer a').length+' cur='+(document.querySelector('footer a[aria-current]')||{}).textContent`), '| outside [' + await ext() + ']', '| overflowX', await ev(`document.documentElement.scrollWidth-innerWidth`));
      await shot(p);
    }
    await cdp('Page.navigate', { url: 'http://localhost:3977/' }); await wait(2000);
    console.log('logged out home: gate', await ev(`getComputedStyle(document.getElementById('authGate')).display`), '| links', await ev(`[...document.querySelectorAll('.authlinks a')].map(a=>a.textContent).join(', ')`)); await shot('gate');
    console.log('ERRORS', JSON.stringify(t.errors)); t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); } })();
