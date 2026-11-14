// The landing page (/welcome): screenshots at desktop and phone size, light and dark, plus basic checks.
const { start, wait } = require('./lib');
const fs = require('fs'), path = require('path');
const W = Number(process.argv[3]) || 1440, H = Number(process.argv[4]) || 900, TAG = 'wv22' + (W < 600 ? 'm' : '');
(async () => { const t = await start(process.argv[2] || path.join(__dirname, '..', '..'), W, H, TAG); const { ev, cdp } = t;
  const out = path.join(__dirname, '..', '..', '.impeccable', 'review'); fs.mkdirSync(out, { recursive: true });
  // full page: captured beyond the viewport, so sections sized to the window keep their real height
  const snap = async (name, full) => { const o = { format: 'png' }; if (full) { const h = await ev(`document.documentElement.scrollHeight`); o.captureBeyondViewport = true; o.clip = { x: 0, y: 0, width: W, height: h, scale: 1 }; }
    const r = await cdp('Page.captureScreenshot', o); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.result.data, 'base64')); };
  try {
    await ev(`fetch('/api/logout',{method:'POST'})`);
    for (const theme of ['dark', 'light']) {
      await ev(`localStorage.setItem('bp_theme','${theme}')`);
      await cdp('Page.navigate', { url: 'http://localhost:3977/welcome' }); await wait(2600);
      const d = W < 600 ? 'mobile' : 'desktop';
      await snap(d + '-' + theme + '-first'); await snap(d + (theme === 'dark' ? '' : '-light'), true);
      console.log(theme, '| overflowX', await ev(`document.documentElement.scrollWidth-innerWidth`), '| verdict', await ev(`document.getElementById('exV').innerText.split(String.fromCharCode(10)).join(' ')`), '| hero h', await ev(`Math.round(document.querySelector('.hero').getBoundingClientRect().height)`), 'vh', await ev(`innerHeight`),
        '| rest bottom', await ev(`Math.round(document.querySelector('.rest').getBoundingClientRect().bottom)`), '| outside', await ev(`performance.getEntriesByType('resource').map(e=>e.name).filter(n=>!n.startsWith(location.origin)).length`),
        '| clipped labels', await ev(`[...document.querySelectorAll('.mark span,.ticks u')].filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth}).length`));
    }
    await ev(`document.getElementById('exNext').click()`); await wait(1900);
    console.log('next:', await ev(`document.getElementById('exQ').textContent+' -> '+document.getElementById('exV').innerText.split(String.fromCharCode(10)).join(' ')+' | guess '+document.getElementById('exGv').textContent+' answer '+document.getElementById('exAv').textContent`), '| clipped', await ev(`[...document.querySelectorAll('.mark span,.ticks u')].filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth}).length`));
    await snap((W < 600 ? 'mobile' : 'desktop') + '-example2');
    await ev(`document.getElementById('exNext').click()`); await wait(1900);
    console.log('next:', await ev(`document.getElementById('exQ').textContent+' -> '+document.getElementById('exV').innerText.split(String.fromCharCode(10)).join(' ')`), '| clipped', await ev(`[...document.querySelectorAll('.mark span,.ticks u')].filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth}).length`));
    console.log('links:', await ev(`[...document.querySelectorAll('a')].map(a=>a.getAttribute('href')).filter((v,i,a)=>a.indexOf(v)===i).join(' ')`));
    console.log('ERRORS', JSON.stringify(t.errors.filter(e => !/401/.test(e)))); t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); } })();
