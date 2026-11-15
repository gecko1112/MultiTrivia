// The landing page moves one screen at a time: a turn of the mouse wheel settles on the next game, filling the window,
// and the game's two halves sweep in from the sides. Also: links from the first screen, and the way back up.
const { start, wait } = require('./lib');
const fs = require('fs'), path = require('path');
const W = Number(process.argv[3]) || 1440, H = Number(process.argv[4]) || 900, TAG = 'wv26' + (W < 600 ? 'm' : '');
(async () => { const t = await start(process.argv[2] || path.join(__dirname, '..', '..'), W, H, TAG); const { ev, cdp, shot } = t;
  const wheel = dy => cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(W / 2), y: Math.round(H / 2), deltaX: 0, deltaY: dy });
  // where the window rests: which section starts at its top edge, and whether that section's halves have arrived
  const at = () => ev(`(()=>{ const y=Math.round(scrollY), s=[...document.querySelectorAll('.hero,.game,.plain,.close')].map(e=>({n:e.id||e.className.split(' ')[0],top:Math.round(e.getBoundingClientRect().top),h:Math.round(e.getBoundingClientRect().height),e}));
    const on=s.filter(x=>Math.abs(x.top)<=2||(x.n==='hero'&&x.top===60))[0]; const g=on&&on.e.classList.contains('game')?on.e:null;
    return 'y='+y+' at='+(on?on.n+' (height '+on.h+' of '+innerHeight+')':'between sections')+(g?' in='+g.classList.contains('in')+' halves moved='+[...g.querySelectorAll('.tell,.demo')].map(n=>Math.round(new DOMMatrix(getComputedStyle(n).transform).m41)).join('/'):''); })()`);
  try {
    await ev(`fetch('/api/logout',{method:'POST'})`); await ev(`localStorage.setItem('bp_theme','dark')`);
    await cdp('Page.navigate', { url: 'http://localhost:3977/welcome' }); await wait(2500);
    console.log('start:', await at(), '| sweep on', await ev(`document.documentElement.classList.contains('sweep')`), '| parked halves', await ev(`[...document.querySelectorAll('.game .tell')].map(n=>Math.round(new DOMMatrix(getComputedStyle(n).transform).m41)).join('/')`), '| overflowX', await ev(`document.documentElement.scrollWidth-innerWidth`));
    for (let i = 1; i <= 6; i++) { await wheel(120); await wait(1700); console.log('wheel down ' + i + ':', await at()); if (i <= 4) await shot('game' + i + '-' + W + 'x' + H); }
    console.log('bottom reached:', await ev(`Math.round(scrollY+innerHeight)>=document.documentElement.scrollHeight-2`), '| overflowX', await ev(`document.documentElement.scrollWidth-innerWidth`)); await shot('end');
    for (let i = 1; i <= 2; i++) { await wheel(-120); await wait(1700); console.log('wheel up ' + i + ':', await at()); }
    await ev(`scrollTo({top:0,behavior:'instant'})`); await wait(900);
    await ev(`document.querySelector('.rest a[href="#clueless"]').click()`); await wait(1900);
    console.log('link "Clueless":', await at());
    // a section that left the window is parked again, so the sweep also plays on the way back
    console.log('parked after leaving:', await ev(`[...document.querySelectorAll('.game')].map(g=>g.id+'='+g.classList.contains('in')).join(' ')`));
    // a small nudge does not leave the window between two games
    await wheel(30); await wait(1700); console.log('small nudge:', await at());
    console.log('ERRORS', JSON.stringify(t.errors.filter(e => !/401/.test(e)))); t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); } })();
