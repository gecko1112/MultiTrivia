// The content security policy (security.js) must not block anything the site itself does. Every page and game tab is
// opened with a recorder for policy violations that is in place before any script runs.
const { start, wait } = require('./lib');
const path = require('path');
const W = Number(process.argv[3]) || 1280, H = Number(process.argv[4]) || 900, TAG = 'wv33';
(async () => { const t = await start(process.argv[2] || path.join(__dirname, '..', '..'), W, H, TAG); const { ev, cdp } = t;
  const out = [], ok = (n, c) => out.push([n, !!c]);
  try {
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "window.__csp=[];document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+(e.blockedURI||'inline')+' '+(e.sourceFile||'')+':'+(e.lineNumber||'')));" });
    const visit = async (url, act) => {
      await cdp('Page.navigate', { url: 'http://localhost:3977' + url }); await wait(300); await cdp('Page.reload'); await wait(2600);   // a new page each time, so the recorder is in place
      if (act) { await ev(act); await wait(900); }
      const v = await ev('window.__csp||["recorder missing"]');
      ok(url + (act ? ' (' + act.slice(0, 40) + '…)' : '') + ': nothing blocked' + (v.length ? ' — ' + v.slice(0, 3).join(' | ') : ''), !v.length);
    };
    for (const tab of ['survival', 'moreless', 'guessless', 'clueless', 'wordy', 'atlas', 'party', 'drinks', 'archive', 'friends', 'howto', 'lina']) await visit('/#' + tab);
    await visit('/#survival', "document.querySelector('[data-plus]').click()");                     // the Plus window
    await visit('/#survival', "document.getElementById('lvlChip').click(); setTimeout(()=>document.querySelector('#side [data-profile]').click(),300)");
    await visit('/?dev=1#friends');
    for (const p of ['/welcome', '/pricing', '/terms', '/privacy', '/refunds', '/imprint', '/de/terms', '/de/privacy']) await visit(p);
    // a game still plays: start a practice More/Less and make one call
    await cdp('Page.navigate', { url: 'http://localhost:3977/#moreless' }); await wait(2600);
    await ev(`document.getElementById('mlPractice').click()`); await wait(900);
    await ev(`document.querySelector('#mlBoard [data-c=more]').click()`); await wait(1200);
    ok('a game still plays under the policy', /practice/.test(await ev(`document.getElementById('mlCat').textContent`)) && !(await ev('window.__csp.length')));
    ok('no script errors', !t.errors.length);
    if (t.errors.length) console.log(t.errors.slice(0, 5).join('\n'));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  t.done(out.every(o => o[1]) ? 0 : 1);
})();
