// Hunch: guess who it is from hints that start vague and get more and more specific. The fewer hints you needed,
// the more it is worth: 100 with one hint, then 80, 60, 40, 20. A wrong guess or "Next hint" shows the next hint;
// a wrong guess on the last hint ends the round with 0.
//
// THE SERVER DECIDES. It picks the answer, hands out one hint at a time, recognises the typed name (small typos and
// the nicknames players use are fine) and counts the points. The browser never has the answer before the end.
//
// The characters come from several games (content/hunch.js: Dota 2, World of Warcraft, League of Legends, Overwatch,
// Valorant). Everybody plays with all of them; Plus members can switch games off (records(user).skip). Which game a
// character is from is not shown before the end: working that out is part of the puzzle.
//
// Today's character: the day's seed puts the games in an order and picks one character from each. A player gets the
// character of the first game in that order they have switched on, so everybody who plays with all games, and every
// Plus member who kept that game on, gets the same one. A round keeps its character and its games once it started.
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

module.exports = function createHunch({ games, send, readBody, records, save, secret, mayArchive, hasPlus = () => false, limits = NO_LIMITS }) {
  const GAMES = games, IDS = GAMES.map(g => g.id), BY = new Map(GAMES.map(g => [g.id, g]));
  const CARD = new Map();                                // 'wow:Onyxia' -> the card, with its game
  for (const g of GAMES) for (const c of g.cards) CARD.set(g.id + ':' + c.name, Object.assign({ game: g.id }, c));
  const GONE = { game: '', name: '?', alt: [], hints: ['', '', '', '', ''] };   // a card taken out of the content since
  // every name players may guess, the games it is in ("Viper": Dota 2 and Valorant), and every spelling that means it
  const NAMES = new Map();
  const entry = n => NAMES.get(n) || NAMES.set(n, { games: [], keys: new Set([norm(n)]) }).get(n);
  for (const g of GAMES) for (const n of g.names) { const e = entry(n); if (!e.games.includes(g.id)) e.games.push(g.id); }
  for (const c of CARD.values()) { const e = entry(c.name); if (!e.games.includes(c.game)) e.games.push(c.game); c.alt.forEach(a => e.keys.add(norm(a))); }
  // The name a text means, or null. Exact spellings first; otherwise the closest name within a small slack, and only
  // if no other name is just as close.
  function identify(text) {
    const t = norm(text); if (!t) return null;
    for (const [n, e] of NAMES) if (e.keys.has(t)) return n;
    const slack = k => (k.length <= 4 ? 0 : k.length <= 7 ? 1 : 2);
    let best = 9, who = null, tie = false;
    for (const [n, e] of NAMES) for (const k of e.keys) { const d = typos(t, k); if (d > slack(k)) continue; if (d < best) { best = d; who = n; tie = false; } else if (d === best && n !== who) tie = true; }
    return tie ? null : who;
  }

  function rngFor(seed) {
    let x = crypto.createHmac('sha256', secret).update(seed).digest().readUInt32LE(0) || 1;
    return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  }
  // The games a player plays with: all of them, or for Plus members the ones they kept on (never none).
  function poolOf(user) {
    const skip = hasPlus(user) ? records(user).skip || [] : [];
    const p = IDS.filter(id => !skip.includes(id));
    return p.length ? p : IDS.slice();
  }
  // The day's character for these games: not guessable in advance, the same for everybody with the same first game.
  function dailyCard(date, pool) {
    pool = pool || IDS;
    const r = rngFor('hunch:games:' + date), order = IDS.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const g = BY.get(order.find(id => pool.includes(id)) || IDS[0]);
    return g.id + ':' + g.cards[Math.floor(rngFor('hunch:' + g.id + ':' + date)() * g.cards.length)].name;
  }
  // rounds from before there were several games kept no card: it was the day's Dota 2 hero
  function oldCard(date) {
    const g = BY.get('dota'); if (!g) return dailyCard(date);
    return 'dota:' + g.cards[Math.floor(rngFor('hunch:' + date)() * g.cards.length)].name;
  }
  const gameInfo = (pool) => GAMES.map(g => ({ id: g.id, name: g.name, short: g.short, on: pool.includes(g.id) }));

  // ---- a round: the card, the games it was dealt from, and the moves so far (a guess, or "next hint")
  const practice = new Map();
  function getRun(user, daily, create, day) {
    if (!daily) {
      if (create) {
        if (practice.size > 5000) practice.clear();
        const pool = poolOf(user), not = dailyCard(today(), pool);
        const ids = [...CARD.keys()].filter(id => pool.includes(CARD.get(id).game) && id !== not);
        const list = ids.length ? ids : [not];
        practice.set(user, { user, daily: false, card: list[crypto.randomInt(list.length)], pool, rec: { moves: [] } });
      }
      return practice.get(user) || null;
    }
    const date = day || today(), mine = records(user);
    let rec = mine[date];
    if (!rec) {
      if (!create) return null;
      const pool = poolOf(user);
      rec = mine[date] = { t0: Date.now(), t1: 0, moves: [], card: dailyCard(date, pool), pool };
      if (date !== today()) rec.late = true;
      save();
    }
    if (!rec.card) { rec.card = oldCard(date); rec.pool = IDS.slice(); }
    if (!rec.t1 && !CARD.has(rec.card)) { rec.card = dailyCard(date, rec.pool); rec.moves = []; save(); }   // its card was taken out: dealt again
    return { user, daily: true, day: date, card: rec.card, pool: rec.pool, rec };
  }
  function walk(run) {
    const card = CARD.get(run.card) || GONE; let k = 1, won = false, lost = false; const wrong = [];
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
    if (run.daily) { run.rec.t1 = Date.now(); run.rec.res = { won: w.won, pts: w.pts, k: w.k }; } else practice.delete(run.user);
    save();
  }
  function view(run) {
    const w = walk(run);
    const out = { daily: run.daily, day: run.daily ? run.day : null, games: run.pool, n: run.rec.moves.length, k: w.k, hints: w.card.hints.slice(0, w.k), worth: PTS[w.k - 1], wrong: w.wrong, done: w.done, won: w.won };
    if (w.done) Object.assign(out, { answer: w.card.name, game: BY.has(w.card.game) ? BY.get(w.card.game).name : '', pts: w.pts, hints: w.card.hints });   // only at the end
    return out;
  }

  async function handle(req, res, url, query, user) {
    if (!url.startsWith('/api/hu/')) return false;
    const act = url.slice('/api/hu/'.length);
    if (req.method === 'GET') {
      if (act === 'names') {                         // every name there is, and its games: not a secret
        send(res, 200, { games: GAMES.map(g => ({ id: g.id, name: g.name, short: g.short })), names: [...NAMES].map(([n, e]) => ({ n, g: e.games })) }); return true;
      }
      if (act === 'home') {
        const day = pastDay(query.get('day'), mayArchive(user)); if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }
        const date = day || today(), mine = records(user), rec = mine[date];
        const w = rec && rec.t1 ? rec.res || walk({ card: rec.card || oldCard(date), rec }) : null;
        send(res, 200, { date, done: !!w, going: !!rec && !rec.t1, result: w ? { won: w.won, pts: w.pts, k: w.k } : null, practice: practice.has(user), practiceLeft: limits.practiceLeft(user, 'hu'),
          games: gameInfo(poolOf(user)), choose: !!hasPlus(user), stats: mine.stats || { played: 0, won: 0, points: 0 } }); return true;
      }
      send(res, 404, { error: 'not found' }); return true;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'not allowed' }); return true; }
    const body = await readBody(req), daily = body.daily === true;

    if (act === 'games') {                           // Plus: the games to play with. Rounds already dealt keep theirs.
      if (!hasPlus(user)) { send(res, 403, { error: 'Choosing the games is part of Plus.' }); return true; }
      if (!Array.isArray(body.skip) || !body.skip.every(id => IDS.includes(id))) { send(res, 400, { error: 'Unknown game' }); return true; }
      const skip = IDS.filter(id => body.skip.includes(id));
      if (skip.length >= IDS.length) { send(res, 400, { error: 'Keep at least one game.' }); return true; }
      const mine = records(user); if (skip.length) mine.skip = skip; else delete mine.skip;
      save(); send(res, 200, { games: gameInfo(poolOf(user)) }); return true;
    }

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
      if (!NAMES.get(who).games.some(g => run.pool.includes(g))) { send(res, 400, { error: who + ' isn\'t in the games you picked.', unknown: true }); return true; }
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
  return { handle, identify, dailyCard, poolOf, card: id => CARD.get(id) || null, names: () => [...NAMES.keys()] };
};
