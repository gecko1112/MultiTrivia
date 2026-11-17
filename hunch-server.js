// Hunch: guess who it is from hints that start vague and get more and more specific. The fewer hints you needed,
// the more it is worth: 100 with one hint, then 80, 60, 40, 20. A wrong guess or "Next hint" shows the next hint;
// a wrong guess on the last hint ends the round with 0.
//
// THE SERVER DECIDES. It picks the answer, hands out one hint at a time, recognises the typed name (small typos and
// the nicknames players use are fine) and counts the points. The browser never has the answer before the end.
//
// A theme is a content file (content/hunch-*.js) with every name a player may guess and the "cards" that can come
// up, each with five hints. The first theme is Dota 2; more themes can be added the same way.
'use strict';
const crypto = require('crypto');
const { NO_LIMITS } = require('./limits-server.js');
const { today, pastDay } = require('./games-common.js');
const PTS = [100, 80, 60, 40, 20], HINTS = 5;
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
function typos(a, b) {                                   // wrong, missing, extra or swapped letters between two spellings
  if (Math.abs(a.length - b.length) > 2) return 9;
  let p2 = [], p1 = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(p1[j] + 1, row[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], p2[j - 2] + 1);
    }
    p2 = p1; p1 = row;
  }
  return p1[b.length];
}

module.exports = function createHunch({ theme, send, readBody, records, save, secret, mayArchive, limits = NO_LIMITS }) {
  const CARDS = theme.cards, NAMES = theme.heroes;
  // every spelling that means a name: the name itself and, for the cards, the other names players use
  const keys = new Map(NAMES.map(n => [n, [norm(n)]]));
  for (const c of CARDS) keys.set(c.name, [norm(c.name), ...c.alt.map(norm)]);
  // The name a text means, or null. Exact spellings first; otherwise the closest name within a small slack, and only
  // if no other name is just as close.
  function identify(text) {
    const t = norm(text); if (!t) return null;
    for (const [n, ks] of keys) if (ks.includes(t)) return n;
    const slack = k => (k.length <= 4 ? 0 : k.length <= 7 ? 1 : 2);
    let best = 9, who = null, tie = false;
    for (const [n, ks] of keys) for (const k of ks) { const d = typos(t, k); if (d > slack(k)) continue; if (d < best) { best = d; who = n; tie = false; } else if (d === best && n !== who) tie = true; }
    return tie ? null : who;
  }

  function rngFor(seed) {
    let x = crypto.createHmac('sha256', secret).update(seed).digest().readUInt32LE(0) || 1;
    return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  }
  const dailyCard = date => Math.floor(rngFor('hunch:' + date)() * CARDS.length);   // the same for everybody, not guessable in advance

  // ---- a round: the card and the moves so far (a guess, or "next hint")
  const practice = new Map();
  function getRun(user, daily, create, day) {
    if (!daily) {
      if (create) {
        if (practice.size > 5000) practice.clear();
        const not = dailyCard(today()); let c; do { c = crypto.randomInt(CARDS.length); } while (c === not && CARDS.length > 1);
        practice.set(user, { user, daily: false, card: c, rec: { moves: [] } });
      }
      return practice.get(user) || null;
    }
    const date = day || today(), mine = records(user);
    if (!mine[date]) { if (!create) return null; mine[date] = { t0: Date.now(), t1: 0, moves: [] }; if (date !== today()) mine[date].late = true; save(); }
    return { user, daily: true, day: date, card: dailyCard(date), rec: mine[date] };
  }
  function walk(run) {
    const card = CARDS[run.card]; let k = 1, won = false, lost = false; const wrong = [];
    for (const m of run.rec.moves) {
      if (m.g === card.name) { won = true; break; }
      if (m.g) wrong.push(m.g);
      if (m.giveup || k >= HINTS) { lost = true; break; }
      k++;
    }
    return { card, k, won, lost, done: won || lost, wrong, pts: won ? PTS[k - 1] : 0 };
  }
  function finish(run, w) {
    const mine = records(run.user), st = mine.stats = mine.stats || { played: 0, won: 0, points: 0 };
    st.played++; if (w.won) st.won++; st.points += w.pts;
    if (run.daily) run.rec.t1 = Date.now(); else practice.delete(run.user);
    save();
  }
  function view(run) {
    const w = walk(run);
    const out = { daily: run.daily, day: run.daily ? run.day : null, theme: theme.name, n: run.rec.moves.length, k: w.k, hints: w.card.hints.slice(0, w.k), worth: PTS[w.k - 1], wrong: w.wrong, done: w.done, won: w.won };
    if (w.done) Object.assign(out, { answer: w.card.name, pts: w.pts, hints: w.card.hints });     // the answer and every hint, only at the end
    return out;
  }

  async function handle(req, res, url, query, user) {
    if (!url.startsWith('/api/hu/')) return false;
    const act = url.slice('/api/hu/'.length);
    if (req.method === 'GET') {
      if (act === 'names') { send(res, 200, { theme: theme.name, names: NAMES }); return true; }   // every name there is: not a secret
      if (act === 'home') {
        const day = pastDay(query.get('day'), mayArchive(user)); if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }
        const date = day || today(), mine = records(user), rec = mine[date];
        const w = rec && rec.t1 ? walk({ card: dailyCard(date), rec }) : null;
        send(res, 200, { date, theme: theme.name, done: !!w, going: !!rec && !rec.t1, result: w ? { won: w.won, pts: w.pts, k: w.k } : null, practice: practice.has(user), practiceLeft: limits.practiceLeft(user, 'hu'), stats: mine.stats || { played: 0, won: 0, points: 0 } }); return true;
      }
      send(res, 404, { error: 'not found' }); return true;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'not allowed' }); return true; }
    const body = await readBody(req), daily = body.daily === true;
    const day = daily ? pastDay(body.day, mayArchive(user)) : null;
    if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }

    if (act === 'start') {                           // today's round continues where it was, never dealt again
      const t = !daily && !body.resume ? limits.takePractice(user, 'hu') : null;
      if (t && !t.ok) { send(res, 403, t.refusal); return true; }
      const run = daily || !body.resume ? getRun(user, daily, true, day) : getRun(user, false, false);
      if (!run) { send(res, 404, { error: 'No game to continue' }); return true; }
      send(res, 200, t ? Object.assign(view(run), { practiceLeft: t.left }) : view(run)); return true;
    }
    if (act === 'quit') { if (!daily) practice.delete(user); send(res, 200, { ok: true }); return true; }
    const run = getRun(user, daily, false, day);
    if (!run) { send(res, 409, { error: 'Start a game first' }); return true; }
    const w = walk(run);
    if (w.done) { send(res, 409, { error: 'This round is over' }); return true; }
    if (body.n !== run.rec.moves.length) { send(res, 409, { error: 'That was already done' }); return true; }   // a double click, or a second tab
    if (act === 'guess') {
      const text = typeof body.text === 'string' ? body.text.slice(0, 60) : '', who = identify(text);
      if (!who) { send(res, 400, { error: text.trim() ? 'That name isn\'t on the list. Check the spelling.' : 'Type a name.', unknown: true }); return true; }   // not used up
      if (w.wrong.includes(who)) { send(res, 400, { error: 'You already guessed ' + who + '.', unknown: true }); return true; }
      run.rec.moves.push({ g: who });
    } else if (act === 'hint') {
      if (w.k >= HINTS) { send(res, 409, { error: 'That was the last hint' }); return true; }
      run.rec.moves.push({ hint: true });
    } else if (act === 'giveup') {
      run.rec.moves.push({ giveup: true });
    } else { send(res, 404, { error: 'not found' }); return true; }
    const after = walk(run);
    if (after.done) finish(run, after); else save();
    send(res, 200, view(run)); return true;
  }
  return { handle, identify, dailyCard, cards: () => CARDS.map(c => c.name) };
};
