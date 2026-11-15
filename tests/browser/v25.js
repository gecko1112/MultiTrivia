// The Ballpark name in the top left leads to the landing page, from the game and from the legal pages; the landing
// page offers "Play" to somebody who is logged in and "Log in" / "Create account" to everybody else.
const { start, wait } = require('./lib');
const path = require('path');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv25' + (W < 600 ? 'm' : '');
(async () => { const t = await start(process.argv[2] || path.join(__dirname, '..', '..'), W, H, TAG); const { ev, cdp, shot, reload } = t;
  const go = async u => { await cdp('Page.navigate', { url: 'http://localhost:3977' + u }); await wait(1000); };
  const top = () => ev(`[...document.querySelectorAll('.top nav a')].map(a=>a.textContent+'='+a.getAttribute('href')).join('  ')`);
  try {
    await reload('', 3000);
    console.log('game: name is', await ev(`document.querySelector('header h1 a').textContent+' -> '+document.querySelector('header h1 a').getAttribute('href')`), '| colour same as heading', await ev(`getComputedStyle(document.querySelector('header h1 a')).color===getComputedStyle(document.querySelector('header h1')).color`), '| underline', await ev(`getComputedStyle(document.querySelector('header h1 a')).textDecorationLine`));
    await shot('game-top');
    await ev(`document.querySelector('header h1 a').click()`); await wait(1200);
    console.log('logged in, after clicking the name:', await ev(`location.pathname`), '| top:', await top(), '| bottom:', await ev(`document.querySelector('.close .go').innerText.split(String.fromCharCode(10)).join(' / ')`), '| overflowX', await ev(`document.documentElement.scrollWidth-innerWidth`));
    await shot('welcome-in');
    await ev(`document.querySelector('.top nav a').click()`); await wait(2500);
    console.log('"Play" leads to', await ev(`location.pathname`), '| logged in there', await ev(`getComputedStyle(document.getElementById('authGate')).display==='none'`));
    await go('/terms'); await ev(`document.querySelector('.logo').click()`); await wait(1000);
    console.log('legal page, name leads to', await ev(`location.pathname`));
    await go('/'); await wait(2000); await ev(`document.getElementById('logoutBtn').click()`); await wait(2500);
    await ev(`document.querySelector('header h1 a').click()`); await wait(1200);
    console.log('logged out, after clicking the name:', await ev(`location.pathname`), '| top:', await top(), '| bottom:', await ev(`document.querySelector('.close .go').innerText.split(String.fromCharCode(10)).join(' / ')`));
    console.log('ERRORS', JSON.stringify(t.errors.filter(e => !/401/.test(e)))); t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); } })();
