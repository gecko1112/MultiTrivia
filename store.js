// Where Ballpark keeps its data: one SQLite file, data/ballpark.sqlite (SQLite is built into Node.js 22.5 and later,
// so there is still nothing to install).
//
// The server works on one object in memory, `db`, exactly as before. What changed is how it reaches the disk:
// every account, login, saved document and record is its own row, and a save writes only the rows that differ
// from what was written last, inside one transaction. A crash in the middle leaves the previous state, never half
// of a new one, and one player's game no longer rewrites everybody's data.
//
//   users(name, data)            one row per account (password hash, picture, Plus, friends ...)
//   sessions(token, user, seen)  one row per login; seen = last use, logins end after two idle weeks
//   docs(user, id, data)         what the games save: results, statistics, achievements ...
//   records(kind, user, data)    per-account records kept by the server: geo, drinks, away
//   meta(key, value)             everything else: the secret, open orders, seen payment notices
//
// MOVING FROM data/db.json. On the first start with this file, an existing db.json is copied into SQLite, read back
// and compared with the original, value for value. Only if they are identical does the server go on, and db.json is
// kept, renamed to db.json.migrated. If anything differs, nothing is renamed, the new file is removed and the server
// stops with a message.
const fs = require('fs'), path = require('path');

const PER_USER = ['geo', 'drinks', 'away', 'ml', 'gl'];        // db[kind][user] -> records
const sorted = v => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => (o[k] = sorted(v[k]), o), {}) : v;
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

module.exports = function openStore(dataDir) {
  const FILE = path.join(dataDir, 'ballpark.sqlite'), JSON_FILE = path.join(dataDir, 'db.json');
  const fresh = () => ({ users: {}, sessions: {}, docs: {} });
  let sqlite = null;
  try { sqlite = require('node:sqlite'); } catch (e) {}

  // ---- Node too old for SQLite: carry on with db.json as before, but never next to an existing SQLite file
  if (!sqlite) {
    if (fs.existsSync(FILE)) { console.error('The data is in data/ballpark.sqlite, which needs Node.js 22.5 or newer. This is ' + process.version + '. Update Node.js (nodejs.org) and start again.'); process.exit(1); }
    console.log('  Note: this Node.js (' + process.version + ') has no built-in SQLite, so data stays in data/db.json. Node.js 22.5 or newer switches to SQLite.');
    let db = fresh();
    if (fs.existsSync(JSON_FILE)) { try { db = Object.assign(db, JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'))); } catch (e) { console.error('Could not read data/db.json:', e.message); process.exit(1); } }
    return { db, kind: 'json', file: JSON_FILE,
      save() { const tmp = JSON_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, JSON_FILE); },
      backup(target) { if (fs.existsSync(JSON_FILE)) fs.copyFileSync(JSON_FILE, target); return Promise.resolve(); }, backupExt: '.json' };
  }

  const open = () => {
    const d = new sqlite.DatabaseSync(FILE);
    d.exec(`PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS users(name TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user);
      CREATE TABLE IF NOT EXISTS docs(user TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(user, id)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL, user TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind, user)) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;`);
    return d;
  };

  // The object in memory <-> rows. Each row has an address ("users|anna", "docs|anna|x_stats", ...) and a text.
  function rowsOf(db) {
    const rows = new Map();
    for (const [n, u] of Object.entries(db.users || {})) rows.set('users|' + n, JSON.stringify(u));
    for (const [t, u] of Object.entries(db.sessions || {})) rows.set('sessions|' + t, JSON.stringify([u, (db.seen || {})[t] || 0]));
    for (const [u, docs] of Object.entries(db.docs || {})) { rows.set('docs|' + u + '|', '1'); for (const [id, d] of Object.entries(docs || {})) rows.set('docs|' + u + '|' + id, JSON.stringify(d)); }
    for (const kind of PER_USER) for (const [u, r] of Object.entries(db[kind] || {})) rows.set('records|' + kind + '|' + u, JSON.stringify(r));
    for (const [k, v] of Object.entries(db)) if (v !== undefined && !['users', 'sessions', 'seen', 'docs'].includes(k) && !PER_USER.includes(k)) rows.set('meta|' + k, JSON.stringify(v));
    return rows;
  }
  function read(d) {
    const db = fresh(); db.seen = {};
    for (const r of d.prepare('SELECT name, data FROM users').all()) db.users[r.name] = JSON.parse(r.data);
    for (const r of d.prepare('SELECT token, user, seen FROM sessions').all()) { db.sessions[r.token] = r.user; if (r.seen) db.seen[r.token] = r.seen; }
    for (const r of d.prepare('SELECT user, id, data FROM docs').all()) { const mine = db.docs[r.user] = db.docs[r.user] || {}; if (r.id !== '') mine[r.id] = JSON.parse(r.data); }
    for (const r of d.prepare('SELECT kind, user, data FROM records').all()) (db[r.kind] = db[r.kind] || {})[r.user] = JSON.parse(r.data);
    for (const r of d.prepare('SELECT key, value FROM meta').all()) db[r.key] = JSON.parse(r.value);
    return db;
  }
  function write(d, db, last) {
    const rows = rowsOf(db);
    const put = {
      users: d.prepare('INSERT INTO users(name, data) VALUES(?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data'),
      sessions: d.prepare('INSERT INTO sessions(token, user, seen) VALUES(?, ?, ?) ON CONFLICT(token) DO UPDATE SET user = excluded.user, seen = excluded.seen'),
      docs: d.prepare('INSERT INTO docs(user, id, data) VALUES(?, ?, ?) ON CONFLICT(user, id) DO UPDATE SET data = excluded.data'),
      records: d.prepare('INSERT INTO records(kind, user, data) VALUES(?, ?, ?) ON CONFLICT(kind, user) DO UPDATE SET data = excluded.data'),
      meta: d.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    };
    const del = {
      users: d.prepare('DELETE FROM users WHERE name = ?'), sessions: d.prepare('DELETE FROM sessions WHERE token = ?'),
      docs: d.prepare('DELETE FROM docs WHERE user = ? AND id = ?'), records: d.prepare('DELETE FROM records WHERE kind = ? AND user = ?'), meta: d.prepare('DELETE FROM meta WHERE key = ?')
    };
    const parts = a => { const i = a.indexOf('|'), t = a.slice(0, i), rest = a.slice(i + 1); if (t !== 'docs' && t !== 'records') return [t, rest]; const j = rest.indexOf('|'); return [t, rest.slice(0, j), rest.slice(j + 1)]; };
    let n = 0;
    d.exec('BEGIN IMMEDIATE');
    try {
      for (const [a, text] of rows) {
        if (last.get(a) === text) continue;
        const [t, k, k2] = parts(a); n++;
        if (t === 'sessions') { const [u, seen] = JSON.parse(text); put.sessions.run(k, u, seen); }
        else if (t === 'docs' || t === 'records') put[t].run(k, k2, text);
        else put[t].run(k, text);
      }
      for (const a of last.keys()) if (!rows.has(a)) { const [t, k, k2] = parts(a); n++; if (t === 'docs' || t === 'records') del[t].run(k, k2); else del[t].run(k); }
      d.exec('COMMIT');
    } catch (e) { try { d.exec('ROLLBACK'); } catch (_) {} throw e; }
    return { rows, n };
  }

  // ---- first start after db.json: copy, read back, compare
  if (!fs.existsSync(FILE) && fs.existsSync(JSON_FILE)) {
    let old;
    try { old = Object.assign(fresh(), JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'))); } catch (e) { console.error('Could not read data/db.json:', e.message); process.exit(1); }
    let ok = false, why = '';
    try {
      const d = open(); write(d, old, new Map()); d.close();
      const d2 = open(), back = read(d2); d2.close();
      if (!Object.keys(back.seen).length) delete back.seen;
      for (const u of Object.keys(old.users)) if (!old.docs[u]) delete back.docs[u];      // (an account without a docs entry reads back without one)
      // an empty list of records and no list at all mean the same thing
      const norm = o => { const c = Object.assign({}, o); for (const k of PER_USER) if (!c[k] || !Object.keys(c[k]).length) delete c[k]; return c; };
      const A = norm(old), B = norm(back);
      ok = same(A, B);
      if (!ok) why = 'the copy read back from SQLite is not identical to db.json (' + [...new Set(Object.keys(A).concat(Object.keys(B)))].filter(k => !same(A[k], B[k])).join(', ') + ')';
    } catch (e) { why = e.message; }
    if (!ok) { try { fs.unlinkSync(FILE); } catch (e) {} console.error('Moving data/db.json into SQLite did not work: ' + why + '\nNothing was changed. db.json is untouched.'); process.exit(1); }
    fs.renameSync(JSON_FILE, JSON_FILE + '.migrated');
    console.log('  Moved the data into data/ballpark.sqlite: ' + Object.keys(old.users).length + ' accounts, checked against the original. The old file is kept as data/db.json.migrated.');
  }

  const d = open();
  const db = read(d);
  let last = rowsOf(db);
  return { db, kind: 'sqlite', file: FILE, backupExt: '.sqlite',
    save() { last = write(d, db, last).rows; },
    backup(target) { return sqlite.backup(d, target); },
    close() { d.close(); } };
};
module.exports.same = same;
