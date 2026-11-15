// Shared test harness: throwaway server + headless Edge driven over CDP.
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
exports.wait = wait;
exports.start = async function (project, W, H, TAG) {
  const OUT = path.join(__dirname, '..', '.tmp', 'shots'); fs.mkdirSync(OUT, { recursive: true });
  const PORT = 3977, DBG = 9333;
  const killEdge = () => { try { execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='msedge.exe'\\" | Where-Object { $_.CommandLine -like '*xedge-*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`, { stdio: 'ignore' }); } catch (e) {} };
  killEdge(); await wait(500);
  const data = path.join(__dirname, '..', '.tmp', 'xdata-' + TAG); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
  const prof = path.join(__dirname, '..', '.tmp', 'xedge-' + TAG); try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  const boot = () => spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data, BP_SIGNUPS_PER_HOUR: '1000', BP_FRIENDS: process.env.BP_FRIENDS == null ? 'everyone' : process.env.BP_FRIENDS }, stdio: 'ignore' });
  let srv = boot();
  spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof, `--window-size=${W},${H}`, '--no-first-run', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  let tabs;
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json(); if (tabs.find(t => t.type === 'page')) break; } catch (e) {} await wait(250); }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console: ' + d.params.args.map(a => a.value || a.description).join(' ')); };
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error((r.result.exceptionDetails.exception?.description || 'eval failed') + ' :: ' + expr.slice(0, 90)); return r.result.result.value; };
  const shot = async name => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, TAG + '-' + name + '.png'), Buffer.from(r.result.data, 'base64')); };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });
  const URL0 = `http://localhost:${PORT}/`;
  const reload = async (hash, ms) => { await cdp('Page.navigate', { url: URL0 + (hash || '') }); await wait(300); await cdp('Page.reload'); await wait(ms || 3000); };
  const done = code => { try { srv.kill(); } catch (e) {} killEdge(); process.exit(code); };
  await cdp('Page.navigate', { url: URL0 }); await wait(1500);
  // four accounts with results for today; "gecko" stays logged in and has seen the tour
  await ev(`(async()=>{
    const J=(m,u,b)=>fetch(u,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined}).then(r=>r.status);
    const d=new Date(), k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const mk=async(name,sv,ml,gl,wd)=>{ await J('POST','/api/signup',{username:name,password:'kiwi-lamp-4421'});
      if(sv!=null) await J('PUT','/api/docs/x_daily',{days:{[k]:{score:sv,avg:0.31,t:Date.now()}}});
      await J('PUT','/api/docs/x_stats',{ml:{days:ml!=null?{[k]:{score:ml}}:{},best:ml||0,played:1},gl:{days:{[k]:{total:gl}},best:gl,played:1},cl:{days:{},solved:0,played:0}});
      if(wd) await J('PUT','/api/docs/x_words',{days:{[k]:{solved:true,guesses:wd,word:'plant',rows:[],words:[]}},played:1,won:1,streak:1,maxStreak:1,dist:[0,0,1,0,0,0]});
      await J('POST','/api/logout'); };
    await mk('lini',17,21,388,3); await mk('fickric',14,18,430,4); await mk('maximdog',9,null,365,0);
    await J('POST','/api/signup',{username:'gecko',password:'kiwi-lamp-4421'});
    await J('PUT','/api/docs/x_stats',{ml:{days:{[k]:{score:19}},best:19,played:1},gl:{days:{[k]:{total:412}},best:412,played:1},cl:{days:{},solved:0,played:0}});
    localStorage.setItem('bp_bot_tour_gecko','1'); return 'ok'; })()`);
  // More/Less results come from the server, not the browser: put in place as an operator would (tests/seed.js), then
  // restart the server. The page stays logged in (the login is kept in the database).
  const d = new Date(), k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const res = (ml, gl) => Object.assign(ml == null ? {} : { ml: { days: { [k]: { score: ml } }, best: ml, played: 1 } }, { gl: { days: { [k]: { total: gl } }, best: gl, played: 1 } });
  const wd = n => ({ days: { [k]: { solved: true, guesses: n, word: 'plant', rows: [], words: [] } }, played: 1, won: 1, streak: 1, maxStreak: 1, dist: [0, 0, 0, 0, 0, 0].map((x, i) => (i === n - 1 ? 1 : 0)) });
  const sd = n => ({ days: { [k]: { score: n, avg: 0.31, t: Date.now() } } });
  require('../seed').importData(data, { lini: { stats: res(21, 388), words: wd(3), daily: sd(17) }, fickric: { stats: res(18, 430), words: wd(4), daily: sd(14) }, maximdog: { stats: res(null, 365), daily: sd(9) }, gecko: { stats: res(19, 412) } });
  await wait(450); srv.kill(); await wait(400); srv = boot(); await wait(900);
  return { cdp, ev, shot, reload, done, errors, wait };
};
