// Security headers, page policies and the same-site check (security.js), and party steps outside a request that must
// not stop the server when they fail (the guard in party-server.js).
const { spawn } = require('child_process');
const up = require('./up');
const fs = require('fs'), path = require('path'), crypto = require('crypto'), EventEmitter = require('events');
const project = process.argv[2] || path.join(__dirname, '..'), PORT = 4006, B = 'http://127.0.0.1:' + PORT;
const data = path.join(__dirname, '.tmp', 'hdrdata'); fs.rmSync(data, { recursive: true, force: true }); fs.mkdirSync(data, { recursive: true });
const out = [], ok = (n, c) => out.push([n, !!c]);
(async () => {
  const srv = spawn(process.execPath, [path.join(project, 'server.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: data }, stdio: 'ignore' });
  await up(PORT);
  const get = (u, h) => fetch(B + u, { headers: h || {} });
  const post = (u, h, body) => fetch(B + u, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h || {}), body: JSON.stringify(body || {}) });
  try {
    // ---- headers on every response
    let r = await get('/');
    const csp = r.headers.get('content-security-policy') || '';
    ok('pages are not to be framed by other sites', r.headers.get('x-frame-options') === 'DENY' && /frame-ancestors 'none'/.test(csp));
    ok('no MIME sniffing, a careful Referer, no camera or microphone', r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('referrer-policy') === 'strict-origin-when-cross-origin' && /camera=\(\)/.test(r.headers.get('permissions-policy') || ''));
    ok('scripts only from this site and Paddle, no "unsafe-inline" for scripts', /script-src 'self' [^;]*https:\/\/cdn\.paddle\.com/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp) && /object-src 'none'/.test(csp));
    // every inline script of the page is allowed by its own fingerprint, and nothing else is
    const html = fs.readFileSync(path.join(project, 'public', 'index.html'), 'utf8').replace(/\r\n?/g, '\n');   // as a browser reads it
    const want = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => "'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
    ok('each inline script of the page is allowed by its fingerprint (' + want.length + ')', want.length > 0 && want.every(h => csp.includes(h)) && (csp.match(/'sha256-/g) || []).length === want.length);
    for (const p of ['/welcome', '/pricing', '/privacy', '/de/terms']) { const c = (await get(p)).headers.get('content-security-policy') || ''; ok(p + ' has its policy', /default-src 'self'/.test(c) && /'sha256-/.test(c)); }
    ok('files that are not pages carry no page policy', !(await get('/plus.js')).headers.get('content-security-policy') && (await get('/plus.js')).headers.get('x-content-type-options') === 'nosniff');
    r = await get('/api/me');
    ok('API replies get the headers too', r.headers.get('x-content-type-options') === 'nosniff' && r.headers.get('x-frame-options') === 'DENY');
    ok('HSTS only when the request came over HTTPS', !(await get('/')).headers.get('strict-transport-security') && /max-age=31536000/.test((await get('/', { 'X-Forwarded-Proto': 'https' })).headers.get('strict-transport-security') || ''));

    // ---- the same-site check on changes
    const login = { username: 'nobody', password: 'kiwi-lamp-4481' };
    const host = '127.0.0.1:' + PORT, refused = async res => res.status === 403 && /another site/.test((await res.json()).error || '');
    ok('a change from another site is refused', await refused(await post('/api/login', { Origin: 'https://evil.example' }, login)));
    ok('so is one a browser marks as cross-site', await refused(await post('/api/login', { 'Sec-Fetch-Site': 'cross-site' }, login)));
    ok('and one from a sandboxed frame or a file', await refused(await post('/api/login', { Origin: 'null' }, login)));
    r = await post('/api/login', { Origin: 'http://' + host, 'Sec-Fetch-Site': 'same-origin' }, login);
    ok('the same site gets through', r.status === 401);
    ok('behind a proxy the forwarded host counts', (await post('/api/login', { Origin: 'https://ballpark.example', 'X-Forwarded-Host': 'ballpark.example' }, login)).status === 401);
    ok('requests without browser headers get through (other servers, scripts)', (await post('/api/login', {}, login)).status === 401);
    ok('reading is never refused', (await get('/api/me', { Origin: 'https://evil.example' })).status === 401);
    ok('payment webhooks are not refused by it', !(await refused(await post('/api/plus/webhook/paddle', { Origin: 'https://evil.example' }, {}))));

    // ---- a failing party step outside a request is logged, not fatal
    let boom = false, logged = '';
    const party = require(path.join(project, 'party-server.js'))({ questions: [{ q: 'How far?', a: 10, u: 'km' }], displayName: u => u,
      send: (res, code, body) => { res.code = code; res.body = body; }, readBody: async () => ({}),
      isAdmin: () => { if (boom) throw new Error('a bug'); return false; } });
    const res = () => ({ writeHead() {}, write() {}, end() {} });
    const c = res(); await party.handle({ method: 'POST' }, c, '/api/party/create', 'anna');
    const code = c.body.code;
    await party.handle({ method: 'POST' }, res(), '/api/party/' + code + '/join', 'anna');
    await party.handle({ method: 'POST' }, res(), '/api/party/' + code + '/join', 'ben');
    const stream = new EventEmitter(); await party.handle(Object.assign(stream, { method: 'GET' }), res(), '/api/party/' + code + '/events', 'anna');
    const ben = new EventEmitter(); await party.handle(Object.assign(ben, { method: 'GET' }), res(), '/api/party/' + code + '/events', 'ben');
    boom = true;
    const orig = console.error; console.error = m => { logged += m; };
    let threw = false; try { ben.emit('close'); } catch (e) { threw = true; }
    console.error = orig; boom = false;
    ok('a bug while a player leaves does not escape (it would stop the server)', !threw);
    ok('it is written to the log with what was happening', /Party, a player went away: Error: a bug/.test(logged));
  } catch (e) { console.log('FAIL  stopped: ' + (e.stack || e)); out.push(['ran to the end', false]); }
  out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
  srv.kill(); process.exitCode = out.every(o => o[1]) ? 0 : 1;
})();
