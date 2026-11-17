// Oddball: a question with many right answers ("Name a country in Africa"). Any right answer scores, and the rarer it
// is, the more: from 10 points for the best-known right answer to 100 for the least known. A wrong one scores 0.
//
// THE SERVER DECIDES. It deals the questions, recognises the country that was typed (small typos are fine, the same
// slack as Flags), judges it and counts the points. The browser shows the question and sends the text.
//
// RARITY is estimated for now: how well known each country is (content/oddball-fame.js), larger countries counting as
// better known within a tier. Every right answer is also counted per question in db.oddStats, so once enough players
// have answered, what people really say can replace the estimate.
//
// The questions come from the Atlas's country data: the countries of a continent or of a UN region, the neighbours of
// a country, names starting with a letter. A day has three of different kinds, the same for everybody.
'use strict';
const crypto = require('crypto');
const { NO_LIMITS } = require('./limits-server.js');
const { today, pastDay } = require('./games-common.js');
const N = 3;
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^the\s+/, '').trim();

module.exports = function createOddball({ geo, fame, send, readBody, records, save, stats, secret, mayArchive, limits = NO_LIMITS }) {
  const C = geo.list(), byId = new Map(C.map(c => [c.id, c]));
  const tierOf = {}; for (const [t, s] of Object.entries(fame)) for (const id of s.split(/\s+/)) if (id) tierOf[id] = Number(t);
  const known = id => { const c = byId.get(id); return (tierOf[id] || 2) + Math.log10(Math.max(c.km2, 1)) / 10; };   // the tier first, then the size
  const cont = c => c.cont.startsWith('Seven') ? (c.sub.endsWith('Africa') ? 'Africa' : 'Asia') : c.cont;    // the island states Natural Earth puts in the open ocean
  const THE = /^(United|Republic|Democratic|Central African|Dominican|Czech Republic|Netherlands|Philippines|Bahamas|Gambia|Maldives|Seychelles|Comoros|Vatican)|Islands$/;
  const named = n => (THE.test(n) ? 'the ' : '') + n;

  // ---- the questions: an id, the text, the right answers, and their points
  const Q = [];
  for (const k of ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania']) Q.push({ id: 'cont:' + k, text: 'Name a country in ' + k + '.', ok: C.filter(c => cont(c) === k).map(c => c.id) });
  const subs = {}; for (const c of C) (subs[c.sub] = subs[c.sub] || []).push(c.id);
  for (const [k, ids] of Object.entries(subs)) if (ids.length >= 5 && k !== 'South America') Q.push({ id: 'sub:' + k, text: 'Name a country in ' + k + '.', ok: ids, note: 'Regions as the United Nations groups them.' });
  for (const c of C) if (c.nb.length >= 5) Q.push({ id: 'nb:' + c.id, text: 'Name a country that borders ' + named(c.name) + '.', ok: c.nb.slice(), note: 'Land borders on the Atlas map.' });
  const letters = {}; for (const c of C) (letters[c.name[0]] = letters[c.name[0]] || []).push(c.id);
  for (const [l, ids] of Object.entries(letters)) if (ids.length >= 5) Q.push({ id: 'letter:' + l, text: 'Name a country whose name starts with ' + l + '.', ok: ids, letter: l });
  for (const q of Q) {                                // best known first: 10 points, least known last: 100
    const order = q.ok.slice().sort((a, b) => known(b) - known(a));
    q.pts = {}; order.forEach((id, i) => { q.pts[id] = Math.round(10 + 90 * i / Math.max(1, order.length - 1)); });
    q.rare = order.slice().reverse();
  }
  const byQ = new Map(Q.map(q => [q.id, q]));

  // Right or wrong, and the points. A letter question also takes another name that starts with the letter, as typed
  // ("Czech Republic", "Côte d'Ivoire"); such a country is placed among the others by how well known it is.
  function judge(q, id, text) {
    if (q.pts[id] != null) return { ok: true, pts: q.pts[id] };
    if (q.letter && norm(text).startsWith(q.letter.toLowerCase())) {
      const better = q.ok.filter(o => known(o) > known(id)).length;
      return { ok: true, pts: Math.round(10 + 90 * better / Math.max(1, q.ok.length)) };
    }
    return { ok: false, pts: 0 };
  }

  // ---- dealing: three questions of different kinds. The day's are the same for everybody and cannot be worked out
  // in advance (the server's secret is in the seed); practice games are random.
  function rngFor(seed) {
    let x = crypto.createHmac('sha256', secret).update(seed).digest().readUInt32LE(0) || 1;
    return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  }
  function deal(r) {
    const kinds = ['cont', 'sub', 'nb', 'letter'];
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    return kinds.slice(0, N).map(k => { const pool = Q.filter(q => q.id.startsWith(k + ':')); return pool[Math.floor(r() * pool.length)].id; });
  }
  const dailies = new Map();
  const dailyDeal = date => { if (!dailies.has(date)) { if (dailies.size > 40) dailies.clear(); dailies.set(date, deal(rngFor('oddball:' + date))); } return dailies.get(date); };

  // ---- a game: the questions and the answers so far ("rec")
  const practice = new Map();
  function getRun(user, daily, create, day) {
    if (!daily) {
      if (create) { if (practice.size > 5000) practice.clear(); practice.set(user, { user, daily: false, qs: deal(() => crypto.randomInt(1e9) / 1e9), rec: { moves: [] } }); }
      return practice.get(user) || null;
    }
    const date = day || today(), mine = records(user);
    if (!mine[date]) { if (!create) return null; mine[date] = { t0: Date.now(), t1: 0, moves: [] }; if (date !== today()) mine[date].late = true; save(); }
    return { user, daily: true, day: date, qs: dailyDeal(date), rec: mine[date] };
  }
  function results(run) {
    return run.rec.moves.map((m, j) => {
      const q = byQ.get(run.qs[j]), r = judge(q, m.id, m.t);
      return { q: q.text, said: byId.get(m.id).name, ok: r.ok, pts: r.pts, count: q.ok.length, rare: q.rare.slice(0, 3).map(id => byId.get(id).name), note: q.note || '' };
    });
  }
  function finish(run) {
    const mine = records(run.user), st = mine.stats = mine.stats || { played: 0, best: 0 }, total = results(run).reduce((s, r) => s + r.pts, 0);
    st.played++; st.best = Math.max(st.best, total);
    if (run.daily) run.rec.t1 = Date.now(); else practice.delete(run.user);
    save();
  }
  function view(run) {
    const res = results(run), i = res.length, done = i >= N;
    const out = { daily: run.daily, day: run.daily ? run.day : null, i, n: N, done, total: res.reduce((s, r) => s + r.pts, 0) };
    if (!done) out.q = { text: byQ.get(run.qs[i]).text };
    if (i) out.last = res[i - 1];                    // the question just answered, now with its rarest answers
    if (done) out.results = res;
    return out;
  }

  async function handle(req, res, url, query, user) {
    if (!url.startsWith('/api/od/')) return false;
    const act = url.slice('/api/od/'.length);
    if (req.method === 'GET') {
      if (act === 'home') {
        const day = pastDay(query.get('day'), mayArchive(user)); if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }
        const date = day || today(), mine = records(user), rec = mine[date];
        const total = rec && rec.t1 ? results({ rec, qs: dailyDeal(date) }).reduce((s, r) => s + r.pts, 0) : null;
        send(res, 200, { date, done: !!(rec && rec.t1), going: !!rec && !rec.t1, total, practice: practice.has(user), practiceLeft: limits.practiceLeft(user, 'od'), stats: mine.stats || { played: 0, best: 0 } }); return true;
      }
      send(res, 404, { error: 'not found' }); return true;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'not allowed' }); return true; }
    const body = await readBody(req), daily = body.daily === true;
    const day = daily ? pastDay(body.day, mayArchive(user)) : null;
    if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }

    if (act === 'start') {                           // today's game continues where it was, never dealt again
      const t = !daily && !body.resume ? limits.takePractice(user, 'od') : null;
      if (t && !t.ok) { send(res, 403, t.refusal); return true; }
      const run = daily || !body.resume ? getRun(user, daily, true, day) : getRun(user, false, false);
      if (!run) { send(res, 404, { error: 'No game to continue' }); return true; }
      send(res, 200, t ? Object.assign(view(run), { practiceLeft: t.left }) : view(run)); return true;
    }
    if (act === 'quit') { if (!daily) practice.delete(user); send(res, 200, { ok: true }); return true; }
    if (act === 'answer') {
      const run = getRun(user, daily, false, day);
      if (!run) { send(res, 409, { error: 'Start a game first' }); return true; }
      const i = run.rec.moves.length;
      if (i >= N) { send(res, 409, { error: 'This game is over' }); return true; }
      if (body.i !== i) { send(res, 409, { error: 'That question was already answered' }); return true; }   // a double click, or a second tab
      const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
      const id = text ? geo.identify(text) : null;
      if (!id) { send(res, 400, { error: text ? 'That isn\'t a country we know. Check the spelling.' : 'Type a country.', unknown: true }); return true; }   // not used up: try again
      run.rec.moves.push({ id, t: text });
      const q = byQ.get(run.qs[i]);
      if (judge(q, id, text).ok) { const s = stats[q.id] = stats[q.id] || {}; s[id] = (s[id] || 0) + 1; }   // what players really say, for later
      if (run.rec.moves.length >= N) finish(run); else save();       // (practice too: the answer counts were updated)
      send(res, 200, view(run)); return true;
    }
    send(res, 404, { error: 'not found' }); return true;
  }
  return { handle, questions: () => Q.map(q => ({ id: q.id, text: q.text, ok: q.ok.slice(), pts: Object.assign({}, q.pts) })), dailyDeal, judge: (qid, id, text) => judge(byQ.get(qid), id, text || '') };
};
