// Buying Plus in the browser: offer, test checkout, member view, cancel, dev-panel switches.
const fs = require('fs'), path = require('path');
const { start, wait } = require('./lib');
const project = process.argv[2] || require('path').join(__dirname, '..', '..'), W = Number(process.argv[3]) || 1440, H = Number(process.argv[4]) || 900, TAG = 'wv16' + (W < 600 ? 'm' : '');
(async () => {
  const t = await start(project, W, H, TAG);
  const { ev, shot, reload, cdp } = t;
  const txt = sel => ev(`(document.querySelector('${sel}')||{innerText:''}).innerText.replace(/\\s*[\\r\\n]+\\s*/g,' | ')`);
  const clean = () => ev(`document.querySelectorAll('.bpt').forEach(x=>x.remove())`);
  const ox = () => ev(`document.documentElement.scrollWidth-innerWidth`);
  const modal = () => ev(`(()=>{const n=document.getElementById('plusNote'); const m=n&&n.closest('[role=dialog]')||document.querySelector('[role=dialog]'); return m?m.innerText.replace(/\\s*[\\r\\n]+\\s*/g,' | '):''})()`);
  const btn = () => ev(`document.getElementById('plusBtn').textContent+' / plan='+document.documentElement.getAttribute('data-plan')+' / cache='+localStorage.getItem('bp_plus')`);
  try {
    // ---- a normal account
    await reload('#survival'); await clean();
    console.log('1 normal:', await btn());
    await ev(`document.getElementById('plusBtn').click()`); await wait(300);
    console.log('  offer:', (await modal()).slice(0, 90), '...', (await modal()).slice(-120));
    await ev(`document.getElementById('plusGo').click()`); await wait(600);
    console.log('  after Get Plus:', await txt('#plusNote'), '| url', await ev(`location.pathname+location.search`));
    await shot('01-offer-closed'); await ev(`window.bpModal.close()`);
    // a faked browser memory does not get past the server
    await ev(`localStorage.setItem('bp_plus','1')`); await cdp('Page.navigate', { url: 'http://localhost:3977/?day=2026-11-10#friends' }); await wait(3500);
    console.log('  faked cache -> after load:', await btn(), '| archive day', await ev(`String(window.bpDay)`), '| url', await ev(`location.pathname+location.search`));
    await ev(`localStorage.setItem('bp_dev','1')`); await reload('#survival'); await clean();
    await ev(`document.querySelector('.devbar [data-plan=plus]').click()`); await wait(700);
    console.log('  dev switch as non-admin:', await txt('#dvMsg'), '|', await btn(), '| list:', await txt('#dvAdmin'));

    // ---- the same account as admin: the test checkout
    fs.writeFileSync(path.join(__dirname, '..', '.tmp', 'xdata-' + TAG, 'admins.txt'), 'gecko');
    await ev(`localStorage.setItem('bp_dev_shut','1')`); await reload('#survival'); await clean();
    await ev(`document.getElementById('plusBtn').click()`); await wait(300);
    console.log('2 admin offer:', (await modal()).slice(0, 40), '...', await txt('#plusNote'));
    await ev(`document.querySelector('.plus-opt[data-bill=month]').click()`); await shot('02-offer-open');
    await ev(`document.getElementById('plusGo').click()`); await wait(1500);
    console.log('  checkout page:', await ev(`location.pathname`), '|', await txt('main')); await shot('03-checkout'); console.log('  overflowX', await ox());
    await ev(`document.getElementById('pay').click()`); await wait(11000); await clean();
    console.log('  back:', await ev(`location.pathname+location.search+location.hash`), '|', await btn());
    console.log('  member:', await modal()); await shot('04-welcome'); console.log('  overflowX', await ox());
    await ev(`document.getElementById('plusEnd').click()`); await wait(200);
    console.log('  cancel step 1:', await txt('#plusEnd'), '|', await txt('#plusNote'));
    await ev(`document.getElementById('plusEnd').click()`); await wait(800);
    console.log('  cancel step 2:', (await modal()).slice(0, 110), '| button left:', await ev(`!!document.getElementById('plusEnd')`)); await shot('05-cancelled');
    await ev(`window.bpModal.close()`);
    await ev(`location.hash='friends'`); await wait(1500);
    console.log('  h2h:', (await txt('#h2h')).slice(0, 80));
    await cdp('Page.navigate', { url: 'http://localhost:3977/?day=2026-11-10#survival' }); await wait(3000);
    console.log('  archive day as member:', await ev(`String(window.bpDay)`));

    // ---- dev panel: gifts
    await ev(`localStorage.setItem('bp_dev_shut','0')`); await reload('#survival'); await clean();
    console.log('3 dev list:', await txt('#dvAdmin'), '| pressed:', await ev(`[...document.querySelectorAll('[data-give][aria-pressed=true]')].map(b=>b.textContent).join(',')`));
    await ev(`document.querySelector('[data-give=lini]').click()`); await wait(900);
    console.log('  after giving lini:', await ev(`[...document.querySelectorAll('[data-give][aria-pressed=true]')].map(b=>b.textContent).join(',')`));
    await shot('06-dev'); console.log('  overflowX', await ox());
    await ev(`document.querySelector('.devbar [data-plan=basic]').click()`); await wait(4000); await clean();
    console.log('  after Basic:', await btn(), '| pressed:', await ev(`[...document.querySelectorAll('[data-give][aria-pressed=true]')].map(b=>b.textContent).join(',')`));
    await ev(`document.querySelector('.devbar [data-plan=plus]').click()`); await wait(4000); await clean();
    console.log('  after Plus:', await btn());
    await ev(`document.getElementById('plusBtn').click()`); await wait(300);
    console.log('  gift member view:', (await modal()).slice(0, 90));
    console.log('ERRORS', JSON.stringify(t.errors));
    t.done(0);
  } catch (e) { console.error('FAILED', e); console.log('ERRORS', JSON.stringify(t.errors)); t.done(1); }
})();
