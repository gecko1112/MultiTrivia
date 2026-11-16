// Reported profile pictures.
//
// A player can report a friend's picture (the only pictures anybody else ever sees). A report changes nothing by
// itself: the picture stays and nobody is told. It is kept on the server for the site owner, who sees the open
// reports in the developer panel (admin accounts only, ?dev=1) and decides: remove the picture, or dismiss the
// reports. Every report is also written to the server's console.
//
// One report per player per reported account per day (the day turns at midnight in BP_TZ, as the dailies do).
// A copy of the picture as it was when reported is kept in data/reports, so changing it afterwards does not hide
// what was reported. Reports and copies go when the admin deals with them, and when either account is deleted.
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const TYPES = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

module.exports = function createReports({ db, save, send, readBody, dataDir, canSee, isAdmin, today, removePicture, log = console.log }) {
  if (!db.reports || !Array.isArray(db.reports.list)) db.reports = { list: [] };
  const DIR = path.join(dataDir, 'reports'), AVATARS = path.join(dataDir, 'avatars');
  const list = () => db.reports.list;
  // who reported whom today ("reporter|account"), kept apart from the reports so dealing with them does not reset the limit
  function todays() { const d = today(), t = db.reports.today; if (!t || t.day !== d || !Array.isArray(t.pairs)) db.reports.today = { day: d, pairs: [] }; return db.reports.today.pairs; }
  const copyOf = (u, v) => path.join(DIR, u + '-' + v + '.img');         // usernames are [a-z0-9_-], versions are numbers
  const name = u => (db.users[u] && db.users[u].display) || u;
  // copies that no open report refers to any more
  function tidy() {
    const keep = new Set(list().map(r => path.basename(copyOf(r.user, r.v))));
    let files = []; try { files = fs.readdirSync(DIR); } catch (e) { return; }
    for (const f of files) if (!keep.has(f)) { try { fs.unlinkSync(path.join(DIR, f)); } catch (e) {} }
  }
  // open reports, one entry per picture (account + version), newest first
  function grouped() {
    const by = new Map();
    for (const r of list()) {
      const k = r.user + '|' + r.v;
      if (!by.has(k)) by.set(k, { user: r.user, name: name(r.user), v: r.v, current: !!(db.users[r.user] && db.users[r.user].avatar && db.users[r.user].avatar.v === r.v), count: 0, by: [], last: 0 });
      const g = by.get(k); g.count++; g.last = Math.max(g.last, r.at); if (!g.by.includes(name(r.by))) g.by.push(name(r.by));
    }
    return [...by.values()].sort((a, b) => b.last - a.last);
  }

  async function handle(req, res, url, query, user) {
    if (url === '/api/report/picture' && req.method === 'POST') {
      const who = String((await readBody(req)).user || '').toLowerCase();
      const a = who !== user && canSee(user, who) && db.users[who] && db.users[who].avatar;      // friends' pictures only
      if (!a) { send(res, 404, { error: 'There is no picture to report.' }); return true; }
      const day = today(), pair = user + '|' + who;
      if (todays().includes(pair) || list().some(r => r.by === user && r.user === who && r.day === day)) { send(res, 409, { error: 'You already reported this picture today.', already: true }); return true; }
      try { fs.mkdirSync(DIR, { recursive: true }); if (!fs.existsSync(copyOf(who, a.v))) fs.copyFileSync(path.join(AVATARS, who + '.img'), copyOf(who, a.v)); } catch (e) {}
      list().push({ id: crypto.randomBytes(6).toString('hex'), at: Date.now(), day, by: user, user: who, v: a.v, type: a.type });
      todays().push(pair);
      save();
      log('  Picture report: ' + user + ' reported the profile picture of ' + who + '. Open reports: ' + grouped().length + ' (developer panel, ?dev=1).');
      send(res, 200, { ok: true }); return true;
    }

    if (!url.startsWith('/api/admin/reports')) return false;
    if (!isAdmin(user)) { send(res, 403, { error: 'Admins only' }); return true; }
    if (url === '/api/admin/reports' && req.method === 'GET') { send(res, 200, { reports: grouped() }); return true; }
    const pic = url.match(/^\/api\/admin\/reports\/picture\/([a-z0-9_\-]{2,20})\/(\d+)$/);
    if (pic && req.method === 'GET') {
      const r = list().find(x => x.user === pic[1] && String(x.v) === pic[2]); let data = null;
      if (r) try { data = fs.readFileSync(copyOf(r.user, r.v)); } catch (e) {}
      if (!data) { send(res, 404, { error: 'no copy' }); return true; }
      res.writeHead(200, { 'Content-Type': TYPES[r.type] || 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
      res.end(data); return true;
    }
    // "remove": the picture goes (only if it is still the one that was reported); "dismiss": the reports go, the picture stays
    if (url === '/api/admin/reports/resolve' && req.method === 'POST') {
      const b = await readBody(req), who = String(b.user || '').toLowerCase(), v = Number(b.v);
      if (!list().some(r => r.user === who && r.v === v)) { send(res, 404, { error: 'No such report' }); return true; }
      if (b.action !== 'remove' && b.action !== 'dismiss') { send(res, 400, { error: 'Remove or dismiss?' }); return true; }
      const cur = db.users[who] && db.users[who].avatar;
      if (b.action === 'remove' && cur && cur.v === v) removePicture(who);
      db.reports.list = list().filter(r => !(r.user === who && r.v === v));
      save(); tidy();
      send(res, 200, { reports: grouped() }); return true;
    }
    send(res, 404, { error: 'not found' }); return true;
  }

  // an account is deleted: its reports, the reports about it and the copies of its pictures go
  function forget(u) {
    db.reports.list = list().filter(r => r.by !== u && r.user !== u);
    db.reports.today = { day: today(), pairs: todays().filter(p => !p.split('|').includes(u)) };
    tidy();
  }
  // for the account's data download: the reports this account made
  const madeBy = u => list().filter(r => r.by === u).map(r => ({ picture: name(r.user), at: new Date(r.at).toISOString() }));
  return { handle, forget, madeBy, open: () => grouped().length };
};
