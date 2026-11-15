// Ballpark trivia game server: zero dependencies, needs only Node.js (22.5 or newer for the SQLite database).
// Run:  node server.js      (or double-click start.bat)
// Data is stored in ./data/ballpark.sqlite next to this file (see store.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const HOST = process.env.HOST || undefined; // e.g. 127.0.0.1 when running behind a reverse proxy
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const MAX_BODY = 2 * 1024 * 1024; // 2 MB

// ---------- the database: everything lives in the object `db` in memory; store.js keeps it on disk (SQLite) ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
const store = require('./store.js')(DATA_DIR);
const db = store.db;
if (!db.seen) db.seen = {};                       // login token -> when it was last used
// ---------- automatic backups: one copy of the database per day in data/backups, newest 30 kept ----------
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
async function backup() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const target = path.join(BACKUP_DIR, `db-${new Date().toISOString().slice(0, 10)}${store.backupExt}`);
    if (!fs.existsSync(target) && fs.existsSync(store.file)) await store.backup(target);
    const old = fs.readdirSync(BACKUP_DIR).filter(f => /^db-\d{4}-\d{2}-\d{2}\.(json|sqlite)$/.test(f)).sort().slice(0, -30);
    for (const f of old) fs.unlinkSync(path.join(BACKUP_DIR, f));
  } catch (e) { console.error('Backup failed:', e.message); }
}
backup();
setInterval(backup, 6 * 60 * 60 * 1000).unref();

// ---------- one-time imports: drop data/import/<username>.json and restart ----------
(function runImports(){
  const dir = path.join(DATA_DIR, 'import');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!f.toLowerCase().endsWith('.json')) continue;
    const user = f.slice(0, -5).toLowerCase(), file = path.join(dir, f);
    if (!db.users[user]) { console.log(`  Import skipped: no account named "${user}" (${f})`); continue; }
    try {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'));
      const docs = db.docs[user] = db.docs[user] || {};
      let n = 0;
      for (const r of (d.runs || [])) {
        if (r && r.id && typeof r.score === 'number' && !docs[r.id]) { const { id, ...rest } = r; docs[id] = rest; n++; }
      }
      if (d.stats) {
        const cur = docs.x_stats || {}, out = {};
        for (const k of ['ml', 'gl', 'cl']) {
          const A = cur[k] || {}, B = d.stats[k] || {};
          out[k] = { days: Object.assign({}, B.days || {}, A.days || {}) }; // existing results win for the same day
          for (const fld of ['best', 'played', 'solved']) if (fld in A || fld in B) out[k][fld] = Math.max(A[fld] || 0, B[fld] || 0);
        }
        docs.x_stats = Object.assign({}, cur, out);
      }
      fs.renameSync(file, file + '.imported');
      console.log(`  Imported ${n} runs${d.stats ? ' and game stats' : ''} into "${db.users[user].display}".`);
      store.save();
    } catch (e) { console.log(`  Import failed for ${f}: ${e.message}`); }
  }
})();

let saveTimer = null;
// Writes at most 200 ms after the first change. The timer is not pushed back by later changes: under steady traffic
// that would postpone the write for as long as the traffic lasts.
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { store.save(); } catch (e) { console.error('Saving failed:', e.message); }     // only the rows that changed, in one transaction
  }, 200);
}
function flushAndExit() { clearTimeout(saveTimer); try { store.save(); } catch (e) {} process.exit(0); }
process.on('SIGINT', flushAndExit); process.on('SIGTERM', flushAndExit);

// ---------- helpers ----------
function hashPassword(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
function send(res, code, obj, headers = {}) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function cookies(req) {
  const out = {}; (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
// A login ends when it has not been used for two weeks. "Used" is noted at most once an hour, to keep writes down.
const IDLE_MS = (Number(process.env.BP_IDLE_DAYS) || 14) * 864e5, SEEN_STEP = 60 * 60 * 1000;
function endSession(t) { delete db.sessions[t]; delete db.seen[t]; }
function currentUser(req) {
  const t = cookies(req).bp_session; if (!t || !db.sessions[t]) return null;
  const now = Date.now(), seen = db.seen[t];
  if (seen && now - seen > IDLE_MS) { endSession(t); save(); return null; }
  if (!seen || now - seen > SEEN_STEP) { db.seen[t] = now; save(); }           // (logins from before this rule start counting now)
  return db.sessions[t];
}
function sweepSessions() {
  const now = Date.now(); let n = 0;
  for (const t of Object.keys(db.sessions)) if (db.seen[t] && now - db.seen[t] > IDLE_MS) { endSession(t); n++; }
  for (const t of Object.keys(db.seen)) if (!db.sessions[t]) { delete db.seen[t]; n++; }
  if (n) save();
}
sweepSessions(); setInterval(sweepSessions, SEEN_STEP).unref();
function newSession(req, res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions[token] = user; db.seen[token] = Date.now(); save();
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''; // set by the reverse proxy / ngrok
  return { 'Set-Cookie': `bp_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}` };
}
const validName = n => typeof n === 'string' && /^[A-Za-z0-9_\-]{2,20}$/.test(n);
// New passwords have to be reasonably strong. Checked here, on the server: the hint in the browser is only a hint.
// Accounts that already exist keep their password; this only applies when an account is created.
const EASY = new Set(['1234567890', '0123456789', '12345678910', '0987654321', '1q2w3e4r5t', '1qaz2wsx3edc', 'qwertyuiop', 'qwertzuiop', 'asdfghjkl;', 'abcdefghij', 'abc1234567', 'administrator', 'trustno1234']);
const EASY_WORDS = /^(password|passwort|qwerty|qwertz|letmein|welcome|willkommen|iloveyou|ballpark|admin|hallo|hello|geheim|secret|test)+[\d\W_]*$/;
function passwordProblem(pw, username) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password: at least 10 characters';
  if (pw.length > 200) return 'Password: at most 200 characters';
  const low = pw.toLowerCase(), name = String(username || '').toLowerCase();
  if (new Set(low).size < 5) return 'Password: use more different characters';
  if (name.length >= 3 && low.includes(name)) return 'Password: must not contain your username';
  if (EASY.has(low) || EASY_WORDS.test(low)) return 'Password: too easy to guess';
  return null;
}
// Slows down password guessing: after 8 wrong passwords for one account from one address, wait 10 minutes.
const FAILS = new Map(), FAIL_MAX = 8, FAIL_WINDOW = 10 * 60 * 1000;
// The address is the last entry of X-Forwarded-For: the one our own proxy (Caddy, ngrok) added. Earlier entries can be made up by the sender.
const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '';
function loginBlocked(key) { const f = FAILS.get(key); if (f && Date.now() - f.t > FAIL_WINDOW) FAILS.delete(key); return !!FAILS.get(key) && FAILS.get(key).n >= FAIL_MAX; }
function loginFailed(key) { const f = FAILS.get(key) || { n: 0, t: Date.now() }; f.n++; FAILS.set(key, f); }
setInterval(() => { const now = Date.now(); for (const [k, f] of FAILS) if (now - f.t > FAIL_WINDOW) FAILS.delete(k); }, 60 * 1000).unref();
// Slows down mass sign-ups: at most 5 new accounts an hour from one address (BP_SIGNUPS_PER_HOUR changes it), and at
// most 30 attempts, counting the refused ones.
const SIGNUP_MAX = Number(process.env.BP_SIGNUPS_PER_HOUR) || 5, SIGNUPS = new Map(), HOUR = 60 * 60 * 1000;
function signupLeft(ip) { const s = SIGNUPS.get(ip); if (s && Date.now() - s.t > HOUR) SIGNUPS.delete(ip); const c = SIGNUPS.get(ip) || { made: 0, tries: 0 }; return c.made < SIGNUP_MAX && c.tries < Math.max(30, SIGNUP_MAX * 6); }
function signupCount(ip, made) { const c = SIGNUPS.get(ip) || { made: 0, tries: 0, t: Date.now() }; c.tries++; if (made) c.made++; SIGNUPS.set(ip, c); }
setInterval(() => { const now = Date.now(); for (const [k, c] of SIGNUPS) if (now - c.t > HOUR) SIGNUPS.delete(k); }, 10 * 60 * 1000).unref();
const validDocId = id => typeof id === 'string' && /^[A-Za-z0-9_\-.:~@+]{1,100}$/.test(id);

// ---------- results the server decides ----------
// The games judged on the server write their results into the same account documents the browser games use, so every
// reader of results keeps working: x_stats.<game> holds the results, x_late.days[day].<game> marks an archive game.
// Those parts belong to the server. Whatever the browser sends for them is replaced by what the server has, and
// deleting the document keeps them.
const SERVER_GAMES = ['ml', 'gl'];
function keepServerParts(id, old, body) {
  if (id === 'x_stats') {
    const out = Object.assign({}, body);
    for (const g of SERVER_GAMES) { if (old && old[g]) out[g] = old[g]; else delete out[g]; }
    return out;
  }
  if (id === 'x_late') {
    const out = Object.assign({}, body), was = (old && old.days) || {};
    out.days = Object.assign({}, out.days && typeof out.days === 'object' ? out.days : {});
    for (const d of Object.keys(out.days)) { const day = out.days[d] = Object.assign({}, out.days[d]); for (const g of SERVER_GAMES) delete day[g]; }
    for (const [d, marks] of Object.entries(was)) for (const g of SERVER_GAMES) if (marks && marks[g]) out.days[d] = Object.assign({}, out.days[d], { [g]: marks[g] });
    for (const d of Object.keys(out.days)) if (!Object.keys(out.days[d]).length) delete out.days[d];
    if (!Object.keys(out.days).length && !(old && old.days)) delete out.days;
    return out;
  }
  return body;
}

// ---------- today's daily games in progress (account doc "x_run": { day, games: { ml: { n, s }, ... } }) ----------
// A daily game may be played once, so a game that was started can only move forward. An upload for an earlier day, or
// with fewer steps (n) for the same day, does not replace what is stored; the browser gets the stored state back and
// continues from there (public/run.js). The doc cannot be deleted through the API.
const RUN_GAMES = ['sv', 'ml', 'gl', 'cl', 'wd'];
function mergeRun(old, neu) {
  const okDay = d => typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d);
  const steps = g => (g && typeof g.n === 'number' && isFinite(g.n) ? g.n : -1);
  const kept = old && okDay(old.day) && old.games && typeof old.games === 'object' ? old : null;
  if (!neu || !okDay(neu.day) || !neu.games || typeof neu.games !== 'object') return kept || { day: '', games: {} };
  const latest = new Date(Date.now() + 36 * 36e5).toISOString().slice(0, 10);   // no day further ahead than any time zone's tomorrow
  if (neu.day > latest || (kept && neu.day < kept.day)) return kept || { day: '', games: {} };
  const games = kept && kept.day === neu.day ? Object.assign({}, kept.games) : {};
  for (const g of RUN_GAMES) { const n = neu.games[g]; if (n && typeof n === 'object' && steps(n) >= 0 && steps(n) >= steps(games[g])) games[g] = n; }
  return { day: neu.day, games };
}

// ---------- leaderboard ----------
function leaderboard(date, players) {
  return players.map(u => {
    const docs = db.docs[u] || {};
    const runs = Object.entries(docs).filter(([id, d]) => !id.startsWith('x_') && d && typeof d.score === 'number').map(([, d]) => d);
    const best = runs.sort((a, b) => b.score - a.score || (a.avg ?? 99) - (b.avg ?? 99))[0] || null;
    const st = docs.x_stats || {};
    const ml = st.ml || {}, gl = st.gl || {}, cl = st.cl || {};
    const mlT = ml.days && ml.days[date], glT = gl.days && gl.days[date], clT = cl.days && cl.days[date];
    const wd = docs.x_words || {}, wdT = wd.days && wd.days[date];
    const svd = (docs.x_daily && docs.x_daily.days && docs.x_daily.days[date]) || null;
    return {
      name: db.users[u].display || u, id: u, av: account.avatarOf(u),
      survival: best ? { score: best.score, avg: best.avg ?? null } : null,
      survivalRuns: runs.length,
      ml: { today: mlT ? mlT.score : null, best: ml.best || 0, played: ml.played || 0 },
      gl: { today: glT ? glT.total : null, best: gl.best || 0, played: gl.played || 0 },
      cl: { today: clT ? { solved: !!clT.solved, guesses: clT.guesses, hints: clT.hints || 0 } : null, solved: cl.solved || 0, played: cl.played || 0 },
      sv: { today: svd ? (svd.score == null ? 0 : svd.score) : null },
      wd: { today: wdT ? { solved: !!wdT.solved, guesses: wdT.guesses } : null, won: wd.won || 0, played: wd.played || 0, streak: wd.streak || 0 }
    };
  });
}

// ---------- static files ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const zlib = require('zlib');
const gzCache = new Map(); // file -> {etag, raw, gz}
function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/') p = '/index.html';
  // the public pages, readable without an account; the four legal ones also exist in German under /de/
  if (p === '/welcome' || p === '/pricing' || /^\/(de\/)?(terms|privacy|refunds|imprint)$/.test(p)) p += '.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const etag = `"${st.size}-${st.mtimeMs}"`;
    const headers = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'ETag': etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    let c = gzCache.get(file);
    if (!c || c.etag !== etag) { const raw = fs.readFileSync(file); c = { etag, raw, gz: zlib.gzipSync(raw, { level: 9 }) }; gzCache.set(file, c); }
    if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { headers['Content-Encoding'] = 'gzip'; headers['Vary'] = 'Accept-Encoding'; res.writeHead(200, headers); return res.end(c.gz); }
    res.writeHead(200, headers); res.end(c.raw);
  });
}

// ---------- party mode (lobbies, judged entirely on the server) ----------
const party = require('./party-server.js')({ publicDir: PUBLIC, send, readBody, displayName: u => (db.users[u] && db.users[u].display) || u, isAdmin });

// ---------- admin accounts: one username per line in data/admins.txt (or BP_ADMINS=name,name). Read on every use, no restart needed.
// Admins see what other players are not shown, such as how often somebody left the page during an Atlas game.
function isAdmin(u) {
  let names = String(process.env.BP_ADMINS || '').split(',');
  try { names = names.concat(fs.readFileSync(path.join(DATA_DIR, 'admins.txt'), 'utf8').split(/\s+/)); } catch (e) {}
  return names.some(n => n.trim().toLowerCase() === u);
}

// ---------- Plus: subscriptions are kept with the account and decided in plus-server.js, never in the browser.
if (!db.secret) { db.secret = crypto.randomBytes(24).toString('hex'); save(); }   // signs the test checkout, makes the daily puzzles unpredictable
const plus = require('./plus-server.js')({ db, save, send, isAdmin, secret: db.secret, dataDir: DATA_DIR });
const hasPlus = user => plus.has(user);

// ---------- Head-to-head (Plus): the asker's record against every other player.
// One point of comparison is one daily game that both finished on the day itself. Games played later through the
// archive are left out. Only counts leave the server, never anybody's answers.
const H2H_VALUE = {                      // higher is better; null = not finished
  sv: r => (typeof r.score === 'number' ? r.score : null),
  ml: r => (typeof r.score === 'number' ? r.score : null),
  gl: r => (typeof r.total === 'number' ? r.total : null),
  cl: r => (r.solved ? 1e6 - (r.guesses || 0) * 100 - (r.hints || 0) : 0),          // solved beats gave up, then fewer guesses, then fewer hints
  wd: r => (r.solved ? 10 - (r.guesses || 6) : 0),
  flags: r => r.score, shapes: r => r.score,
  route: r => (r.won ? 1000 - r.used : 0)
};
function dailyValues(u) {
  const docs = db.docs[u] || {}, st = docs.x_stats || {}, late = (docs.x_late || {}).days || {}, out = {};
  const days = { sv: (docs.x_daily || {}).days, ml: (st.ml || {}).days, gl: (st.gl || {}).days, cl: (st.cl || {}).days, wd: (docs.x_words || {}).days };
  for (const g of Object.keys(days)) for (const [d, r] of Object.entries(days[g] || {})) {
    if (!r || (late[d] && late[d][g])) continue;
    const v = H2H_VALUE[g](r); if (v != null) (out[g] = out[g] || {})[d] = v;
  }
  for (const d of geo.datesOf(u)) for (const [m, r] of Object.entries(geo.dayOf(u, d) || {})) if (!r.late) (out[m] = out[m] || {})[d] = H2H_VALUE[m](r);
  return out;
}
function headToHead(user) {
  const mine = dailyValues(user), rows = [];
  for (const u of friends.circle(user)) {
    if (u === user) continue;
    const theirs = dailyValues(u), games = {}, sum = [0, 0, 0];
    for (const g of Object.keys(mine)) for (const d of Object.keys(mine[g])) {
      if (!theirs[g] || !(d in theirs[g])) continue;
      const i = mine[g][d] > theirs[g][d] ? 0 : mine[g][d] < theirs[g][d] ? 1 : 2;       // won, lost, tied
      (games[g] = games[g] || [0, 0, 0])[i]++; sum[i]++;
    }
    if (sum[0] + sum[1] + sum[2]) rows.push({ name: db.users[u].display || u, won: sum[0], lost: sum[1], tied: sum[2], games });
  }
  return rows.sort((a, b) => (b.won + b.lost + b.tied) - (a.won + a.lost + a.tied));
}

// ---------- which of the five browser-run dailies an account has finished on a day, and how often it left the page meanwhile
if (!db.away) db.away = {};
const AWAY_GAMES = ['sv', 'ml', 'gl', 'cl', 'wd'];
function finishedOn(user, date) {
  const docs = db.docs[user] || {}, st = docs.x_stats || {}, on = o => (o && o.days && o.days[date]) || null, sv = on(docs.x_daily);
  return { sv: !!sv && sv.score != null, ml: !!on(st.ml), gl: !!on(st.gl), cl: !!on(st.cl), wd: !!on(docs.x_words) };
}

// ---------- Atlas (geography games, judged entirely on the server; results kept in db.geo) ----------
if (!db.geo) db.geo = {};
const geo = require('./geo-server.js')({ dir: path.join(ROOT, 'geo'), send, readBody, secret: db.secret,
  records: Object.assign(u => (db.geo[u] = db.geo[u] || {}), { save }),
  mayArchive: u => hasPlus(u), isAdmin });   // past days are a Plus feature

// ---------- More/Less (dealt and judged on the server; daily calls in db.ml, results in the account's x_stats.ml) ----------
if (!db.ml) db.ml = {};
const moreless = require('./moreless-server.js')({ cats: require('./content/moreless.js'), publicDir: PUBLIC, send, readBody, save,
  records: u => (db.ml[u] = db.ml[u] || {}), docsOf: u => (db.docs[u] = db.docs[u] || {}),
  mayArchive: u => hasPlus(u) });                   // past days are a Plus feature

// ---------- Guessless (dealt and scored on the server; daily estimates in db.gl, results in the account's x_stats.gl) ----------
if (!db.gl) db.gl = {};
const guessless = require('./guessless-server.js')({ cats: require('./content/guessless.js'), send, readBody, save,
  records: u => (db.gl[u] = db.gl[u] || {}), docsOf: u => (db.docs[u] = db.docs[u] || {}),
  mayArchive: u => hasPlus(u) });

// ---------- Drinks (one-phone drinking games, dealt and judged on the server) ----------
if (!db.drinks) db.drinks = {};                     // per account: counters and earned badges of the drinking games
const drinks = require('./drinks-server.js')({ send, readBody, party, geo, records: Object.assign(u => (db.drinks[u] = db.drinks[u] || {}), { save }) });

// ---------- friends: results and pictures are shown to friends only
const friends = require('./friends-server.js')({ db, save, send, readBody, avatarOf: u => account.avatarOf(u) });

// ---------- account management (picture, password, data download, delete)
const account = require('./account-server.js')({ db, save, send, readBody, dataDir: DATA_DIR, hashPassword, passwordProblem, plus, isAdmin,
  canSee: (viewer, owner) => friends.areFriends(viewer, owner), onDelete: u => friends.forget(u),
  sessionToken: req => cookies(req).bp_session,
  guard: { blocked: (req, u) => loginBlocked(u + '|' + clientIp(req)), failed: (req, u) => loginFailed(u + '|' + clientIp(req)), clear: (req, u) => FAILS.delete(u + '|' + clientIp(req)) } });

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  const query = new URLSearchParams(req.url.split('?')[1] || '');
  try {
    if (!url.startsWith('/api/')) return serveStatic(req, res, req.url);

    if (url === '/api/health') return send(res, 200, { ok: true, users: Object.keys(db.users).length });

    if (url === '/api/signup' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      const ip = clientIp(req);
      if (!signupLeft(ip)) return send(res, 429, { error: 'Too many new accounts from this connection. Try again in an hour.' });
      signupCount(ip, false);
      if (!validName(username)) return send(res, 400, { error: 'Username: 2–20 letters, numbers, _ or -' });
      const weak = passwordProblem(password, username);
      if (weak) return send(res, 400, { error: weak });
      const key = username.toLowerCase();
      if (db.users[key]) return send(res, 409, { error: 'That username is taken' });
      const salt = crypto.randomBytes(16).toString('hex');
      db.users[key] = { display: username, salt, hash: hashPassword(password, salt), created: Date.now() };
      db.docs[key] = {}; save(); signupCount(ip, true);
      return send(res, 200, { username }, newSession(req, res, key));
    }
    if (url === '/api/login' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      const key = String(username || '').toLowerCase(); const u = db.users[key];
      const attempt = key + '|' + clientIp(req);
      if (loginBlocked(attempt)) return send(res, 429, { error: 'Too many wrong passwords. Try again in 10 minutes.' });
      if (!u || typeof password !== 'string') { loginFailed(attempt); return send(res, 401, { error: 'Wrong username or password' }); }
      const h = hashPassword(password, u.salt);
      if (!crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(u.hash, 'hex'))) { loginFailed(attempt); return send(res, 401, { error: 'Wrong username or password' }); }
      FAILS.delete(attempt);
      return send(res, 200, { username: u.display }, newSession(req, res, key));
    }
    if (url === '/api/logout' && req.method === 'POST') {
      const t = cookies(req).bp_session; if (t) { endSession(t); save(); }
      return send(res, 200, { ok: true }, { 'Set-Cookie': 'bp_session=; Path=/; Max-Age=0' });
    }

    if (await plus.handlePublic(req, res, url)) return;       // payment provider webhooks: signed, no login

    const user = currentUser(req);
    if (!user) return send(res, 401, { error: 'Not logged in' });

    if (await party.handle(req, res, url, user)) return;
    if (await geo.handle(req, res, url, query, user)) return;
    if (await moreless.handle(req, res, url, query, user)) return;
    if (await guessless.handle(req, res, url, query, user)) return;
    if (await drinks.handle(req, res, url, query, user)) return;
    if (await plus.handle(req, res, url, query, user)) return;
    if (await account.handle(req, res, url, query, user)) return;
    if (await friends.handle(req, res, url, query, user)) return;
    if (url === '/api/me') return send(res, 200, { username: db.users[user].display, id: user, plus: hasPlus(user), admin: isAdmin(user), avatar: account.avatarOf(user), created: db.users[user].created || null });
    // "Left the page in the middle of a daily game", reported by the browser (public/away.js) for the five games that run there.
    // Counted until that game of that day is finished, kept in db.away and handed out to admin accounts only.
    if (url === '/api/away' && req.method === 'POST') {
      const { game, day } = await readBody(req);
      const last = new Date(Date.now() + 864e5).toISOString().slice(0, 10);          // generous: any time zone's "today"
      if (!AWAY_GAMES.includes(game) || !/^\d{4}-\d{2}-\d{2}$/.test(String(day)) || day < '2026-01-01' || day > last) return send(res, 400, { error: 'bad request' });
      if (!finishedOn(user, day)[game]) { const mine = db.away[user] = db.away[user] || {}; mine[game + ':' + day] = Math.min(99, (mine[game + ':' + day] || 0) + 1); save(); }
      return send(res, 200, { ok: true });
    }
    if (url === '/api/day') {
      const date = String(query.get('date') || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return send(res, 400, { error: 'bad date' });
      const admin = isAdmin(user);
      const DAY_SUMMARY = { sv: ['score', 'avg'], ml: ['score'], gl: ['total'], cl: ['solved', 'guesses', 'hints'], wd: ['solved', 'guesses'] };
      const finished = finishedOn(user, date);
      const seen = friends.circle(user);
      const players = seen.map(u => {
        const docs = db.docs[u] || {}, st = docs.x_stats || {};
        const pick = (o) => (o && o.days && o.days[date]) || null;
        const row = { sv: pick(docs.x_daily), ml: pick(st.ml), gl: pick(st.gl), cl: pick(st.cl), wd: pick(docs.x_words) };
        // Somebody else's details (words, answers, guesses) would give the solution away, and a past day can still be played
        // through the archive. So until the asker has finished that game of that day, only the score leaves the server.
        if (u !== user) for (const k of Object.keys(row)) if (row[k] && !finished[k]) {
          const cut = { locked: true }; for (const f of DAY_SUMMARY[k]) if (f in row[k]) cut[f] = row[k][f];
          row[k] = cut;
        }
        if (admin) for (const k of Object.keys(row)) { const n = (db.away[u] || {})[k + ':' + date]; if (n && row[k]) row[k] = Object.assign({}, row[k], { away: n }); }
        return Object.assign({ name: db.users[u].display || u, id: u, av: account.avatarOf(u), me: u === user }, row, { at: geo.dayOf(u, date, admin) });
      });
      const dates = new Set();
      for (const u of seen) {
        const docs = db.docs[u] || {}, st = docs.x_stats || {};
        for (const o of [docs.x_daily, st.ml, st.gl, st.cl, docs.x_words]) if (o && o.days) Object.keys(o.days).forEach(d => dates.add(d));
        geo.datesOf(u).forEach(d => dates.add(d));
      }
      return send(res, 200, { date, players, dates: [...dates].sort() });
    }
    if (url === '/api/h2h') return hasPlus(user) ? send(res, 200, { players: headToHead(user) }) : send(res, 403, { error: 'Head-to-head is part of Plus' });
    if (url === '/api/leaderboard') return send(res, 200, { date: query.get('date'), players: leaderboard(String(query.get('date') || ''), friends.circle(user)) });

    if (url === '/api/docs' && req.method === 'GET') {
      const docs = db.docs[user] || {};
      return send(res, 200, { docs: Object.entries(docs).map(([id, data]) => ({ id, data })) });
    }
    const m = url.match(/^\/api\/docs\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!validDocId(id)) return send(res, 400, { error: 'bad id' });
      db.docs[user] = db.docs[user] || {};
      if (req.method === 'GET') { const d = db.docs[user][id]; return send(res, 200, d ? { exists: true, data: d } : { exists: false }); }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'body must be an object' });
        if (id === 'x_run') { const run = mergeRun(db.docs[user][id], body); db.docs[user][id] = run; save(); return send(res, 200, { ok: true, data: run }); }
        db.docs[user][id] = keepServerParts(id, db.docs[user][id], body); save(); return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        if (id === 'x_run') return send(res, 403, { error: 'A daily game in progress cannot be discarded.' });
        const kept = keepServerParts(id, db.docs[user][id], {});
        if (Object.keys(kept).length) db.docs[user][id] = kept; else delete db.docs[user][id];
        save(); return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    if (res.headersSent) { try { res.end(); } catch (_) {} return; }
    send(res, 400, { error: 'Bad request' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Ballpark is running:  http://localhost:${PORT}`);
  console.log(`  Share it with friends: run start-ngrok.bat in a second window.`);
  console.log(`  Stop the server with Ctrl+C.\n`);
});
