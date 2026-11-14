// Drinks, server side: drinking games for one phone that is passed around the table.
//
// THE SERVER DECIDES EVERYTHING here too (see party-server.js): it deals the question or the flag,
// keeps the answer until the player on turn has answered, and says who drinks how much.
// The browser sends "start with these names", "more", "less", a typed country, or "next".
//
// A table belongs to the account that is logged in on that phone. The names at the table are just
// names typed in, not accounts. Tables live in memory only and nothing here counts for levels.
//
// Badges are a separate, not too serious set of achievements for the drinking games: no XP, no effect
// on levels. They are counted here, per account: what happened at the table of that phone, plus that
// player's own sips in drinks lobbies (party-server.js reports those through party.hooks).
const crypto = require('crypto');

const GAMES = ['overunder', 'flags'];
const SIPS_WRONG = 2;                    // a wrong answer
const STREAK = 3, SIPS_STREAK = 1;       // three right in a row: everyone else drinks
const MAX_PLAYERS = 12, NAME_LEN = 16, IDLE_MS = 6 * 60 * 60 * 1000;

// Every badge is "have at least this many of that". The texts are first suggestions and easy to change.
const BADGES = [
  { id: 'first', name: 'First round', desc: 'Play one round of a drinking game.', of: s => [s.rounds, 1] },
  { id: 'regulars', name: "Regulars' table", desc: 'Play 100 rounds at your table.', of: s => [s.rounds, 100] },
  { id: 'openbar', name: 'Open bar', desc: 'Hand out 100 sips at your table.', of: s => [s.dealt, 100] },
  { id: 'full', name: 'Full house', desc: 'Start a game with six or more players.', of: s => [s.big, 1] },
  { id: 'onme', name: 'This one is on everyone', desc: 'Three right in a row: the rest of the table drinks.', of: s => [s.treats, 1] },
  { id: 'bartender', name: 'Bartender', desc: 'Make the rest of the table drink ten times.', of: s => [s.treats, 10] },
  { id: 'thirsty', name: 'Thirsty work', desc: 'One player collects 20 sips in a single game.', of: s => [s.tally, 20] },
  { id: 'driver', name: 'Designated driver', desc: 'Someone gets through 15 rounds without a single sip.', of: s => [s.dry, 1] },
  { id: 'group', name: 'Group effort', desc: 'Everyone at the table gets it wrong, one after another.', of: s => [s.lap, 1] },
  { id: 'honest', name: 'Honest, at least', desc: 'Admit "No idea" ten times in the Flag round.', of: s => [s.noIdea, 10] },
  { id: 'geo', name: 'Geography was never the plan', desc: 'Five wrong flags in a row at your table.', of: s => [s.flagMiss, 5] },
  { id: 'bull', name: 'Bullseye, bottoms up', desc: 'In a drinks lobby, guess within 10% so the others drink.', of: s => [s.bull, 1] },
  { id: 'asleep', name: 'Asleep at the bar', desc: 'In a drinks lobby, forget to guess three times.', of: s => [s.missed, 3] },
  { id: 'tab', name: 'Running a tab', desc: 'Take 50 sips in drinks lobbies.', of: s => [s.lobbySips, 50] }
];
const ZERO = { rounds: 0, dealt: 0, treats: 0, tally: 0, dry: 0, lap: 0, noIdea: 0, flagMiss: 0, big: 0, lobbySips: 0, bull: 0, missed: 0 };

module.exports = function createDrinks({ send, readBody, party, geo, records }) {
  const mine = user => { const r = records(user); r.n = Object.assign({}, ZERO, r.n); r.got = r.got || {}; return r; };
  const news = new Map();                // account id -> badges earned since the phone last asked
  function award(user) {
    const r = mine(user);
    for (const b of BADGES) { const [have, need] = b.of(r.n); if (have >= need && !r.got[b.id]) { r.got[b.id] = Date.now(); news.set(user, (news.get(user) || []).concat({ name: b.name, desc: b.desc })); } }
    records.save();
  }
  const takeNews = user => { const n = news.get(user) || []; news.delete(user); return n; };
  const badgeList = user => { const r = mine(user); return BADGES.map(b => { const [have, need] = b.of(r.n); return { id: b.id, name: b.name, desc: b.desc, got: !!r.got[b.id], have: Math.min(have, need), need }; }); };
  // sips a player takes in a drinks lobby (reported by party-server.js when a round is closed)
  party.hooks.sips = (user, e) => { const s = mine(user).n; s.lobbySips += e.sips || 0; if (e.noGuess) s.missed++; if (e.bull) s.bull++; award(user); };

  const tables = new Map();              // account id -> table
  setInterval(() => { const now = Date.now(); for (const [k, t] of tables) if (now - t.touched > IDLE_MS) tables.delete(k); }, 10 * 60 * 1000).unref();

  function deal(t) {
    t.round++; t.phase = 'ask'; t.last = null;
    if (t.game === 'overunder') {
      const q = party.randomQuestion();
      // the number on the table is clearly off: between 1.6 and 6 times too high or too low
      const f = Math.pow(10, 0.2 + Math.random() * 0.6);
      let shown = Number((q.a * (Math.random() < 0.5 ? f : 1 / f)).toPrecision(2));
      if (shown === q.a) shown = Number((q.a * 2).toPrecision(2));
      t.q = { text: q.q, unit: q.u, a: q.a, note: q.n || '', shown };
    } else {
      const c = geo.randomCountry();
      t.q = { id: c.id, name: c.name, key: crypto.randomBytes(6).toString('hex') };
    }
  }
  function view(t, user) {
    return {
      fresh: takeNews(user),             // badges earned just now, told once
      game: t.game, phase: t.phase, round: t.round, turn: t.turn,
      players: t.players.map(p => ({ name: p.name, sips: p.sips, streak: p.streak })),
      q: t.game === 'overunder' ? { text: t.q.text, unit: t.q.unit, shown: t.q.shown } : { img: '/api/drinks/flag?k=' + t.q.key },
      last: t.last                       // holds the answer, and exists only after the player has answered
    };
  }

  // Returns true when the request was for the drinking games. `user` is the logged-in account id.
  async function handle(req, res, url, query, user) {
    if (!url.startsWith('/api/drinks/')) return false;
    const act = url.slice('/api/drinks/'.length), t = tables.get(user);
    if (t) t.touched = Date.now();

    if (req.method === 'GET') {
      if (act === 'state') { send(res, 200, t ? view(t, user) : { none: true }); return true; }
      if (act === 'badges') { send(res, 200, { badges: badgeList(user), fresh: takeNews(user) }); return true; }
      if (act === 'flag') {
        if (!t || t.game !== 'flags' || query.get('k') !== t.q.key) { res.writeHead(404); res.end(); return true; }
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
        res.end(geo.flagOf(t.q.id)); return true;
      }
      send(res, 404, { error: 'not found' }); return true;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'not allowed' }); return true; }
    const body = await readBody(req);

    if (act === 'start') {
      if (!GAMES.includes(body.game)) { send(res, 400, { error: 'Unknown game' }); return true; }
      if (body.game === 'overunder' && !party.questionCount()) { send(res, 503, { error: 'This game is not available right now' }); return true; }
      const names = Array.isArray(body.players) ? body.players.map(n => (typeof n === 'string' ? n.replace(/\s+/g, ' ').trim().slice(0, NAME_LEN) : '')).filter(Boolean) : [];
      if (names.length < 2) { send(res, 400, { error: 'Add at least two players' }); return true; }
      if (names.length > MAX_PLAYERS) { send(res, 400, { error: 'At most ' + MAX_PLAYERS + ' players' }); return true; }
      if (new Set(names.map(n => n.toLowerCase())).size !== names.length) { send(res, 400, { error: 'Two players have the same name' }); return true; }
      if (tables.size > 3000) tables.clear();
      const table = { game: body.game, players: names.map(name => ({ name, sips: 0, streak: 0 })), turn: 0, round: 0, phase: 'ask', q: null, last: null, touched: Date.now(), wrongRun: 0, dry: false };
      deal(table); tables.set(user, table);
      if (names.length >= 6) { mine(user).n.big = 1; award(user); }
      send(res, 200, view(table, user)); return true;
    }
    if (act === 'end') { tables.delete(user); send(res, 200, { none: true }); return true; }
    if (!t) { send(res, 409, { error: 'Start a game first' }); return true; }

    if (act === 'answer') {
      if (t.phase !== 'ask') { send(res, 409, { error: 'Already answered' }); return true; }
      let ok, said;
      if (t.game === 'overunder') {
        if (body.choice !== 'more' && body.choice !== 'less') { send(res, 400, { error: 'More or less?' }); return true; }
        said = body.choice; ok = (t.q.a > t.q.shown) === (said === 'more');
      } else {
        said = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 60) : '';   // empty = does not know
        ok = geo.nameFits(said, t.q.id);
      }
      const p = t.players[t.turn], drinks = [];
      let kind = 'safe';
      if (!ok) { kind = 'wrong'; p.streak = 0; p.sips += SIPS_WRONG; drinks.push({ name: p.name, sips: SIPS_WRONG }); }
      else if (++p.streak >= STREAK) { kind = 'streak'; p.streak = 0; for (const o of t.players) if (o !== p) { o.sips += SIPS_STREAK; drinks.push({ name: o.name, sips: SIPS_STREAK }); } }
      t.last = Object.assign({ ok, kind, said, drinks }, t.game === 'overunder' ? { answer: t.q.a, note: t.q.note } : { name: t.q.name });
      t.phase = 'result';
      // what this round means for the badges of the account whose table this is
      const s = mine(user).n;
      s.rounds++; s.dealt += drinks.reduce((n, d) => n + d.sips, 0);
      if (kind === 'streak') s.treats++;
      t.wrongRun = ok ? 0 : t.wrongRun + 1;
      if (t.wrongRun === Math.max(3, t.players.length)) s.lap++;
      if (t.game === 'flags') { if (!said) s.noIdea++; s.flagMiss = Math.max(s.flagMiss, t.wrongRun); }
      s.tally = Math.max(s.tally, ...t.players.map(q => q.sips));
      if (!t.dry && t.round >= 15 && t.players.some(q => q.sips === 0)) { t.dry = true; s.dry++; }
      award(user);
      send(res, 200, view(t, user)); return true;
    }
    if (act === 'next') {
      if (t.phase !== 'result') { send(res, 409, { error: 'Answer first' }); return true; }
      t.turn = (t.turn + 1) % t.players.length; deal(t);
      send(res, 200, view(t, user)); return true;
    }
    send(res, 404, { error: 'not found' }); return true;
  }
  return { handle };
};
