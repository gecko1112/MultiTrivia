// Party mode, server side: private lobbies where everyone estimates the same question at the same time.
//
// THE SERVER DECIDES EVERYTHING. It picks the questions, keeps the answers to itself until the reveal,
// runs the clock, checks every guess and counts the points. A browser only sends "create", "join",
// "start", "my guess is 5000", "next" or a chat line, and receives a picture of the lobby to draw.
// Nothing a player changes in their own browser can alter a score. Keep it that way when adding modes.
//
// The questions come from content/survival.js, which is never sent to the browser.
//
// Hosting: anybody can open a lobby and join one. Starting a game in a lobby opened without Plus uses one of the
// host's free party games (limits-server.js decides, and counts).
//
// Lobbies live in memory only: restarting the server ends all running parties. Chat is never stored.
// Updates reach the players over Server-Sent Events (one long-lived GET per player), so no extra
// packages are needed and it works through ngrok and a reverse proxy.
const crypto = require('crypto');
const { NO_LIMITS } = require('./limits-server.js');

const MAX_PLAYERS = 12, MAX_ROOMS = 200, MAX_CHAT = 40, CHAT_LEN = 200;
const ROUNDS = [5, 10, 15], SECONDS = [15, 25, 40];
const CLOSEST_BONUS = 25;                 // on top of the 0-100 points for closeness
// Drinks rules (a lobby setting): who has to drink is decided here too, with the points.
const SIPS_NO_GUESS = 2, SIPS_FURTHEST = 2, SIPS_BULLSEYE = 1;
const BULLSEYE = Math.log10(1.1);         // a guess within 10% of the answer: everyone else drinks
// "Bets" (a lobby setting next to "Closest guess"): everyone guesses, then sees all guesses and backs the one they
// think is closest with a stake of 1 to 3. The closest guess wins. Backing it pays stake x odds, where the odds come
// from the bets themselves: bettors / backers of the winner, at least 2. A lost bet costs the stake, and the owner of
// the winning guess gets WIN_GUESS_BONUS. With drinks on, the stake is sips: a lost bet is drunk, a won bet is handed
// out to other players one sip at a time, and not betting costs SIPS_NO_BET.
const MODES = ['closest', 'bets'], BET_SECONDS = 20, STAKES = [1, 2, 3], WIN_GUESS_BONUS = 2, SIPS_NO_BET = 1;
const HOST_AWAY_MS = 20 * 1000;           // host gone this long: the next player takes over
const EMPTY_ROOM_MS = 10 * 60 * 1000;     // nobody connected this long: the lobby is removed
const IDLE_ROOM_MS = 3 * 60 * 60 * 1000;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they get mistaken for 1 and 0

function usable(list) {
  return list.filter(q => q && typeof q.q === 'string' && typeof q.a === 'number' && q.a > 0 && isFinite(q.a));
}

module.exports = function createParty({ questions, send, readBody, displayName, isAdmin = () => false, limits = NO_LIMITS }) {
  const QUESTIONS = usable(Array.isArray(questions) ? questions : []);
  if (!QUESTIONS.length) console.error('Party mode is off: no questions');
  const rooms = new Map();
  const hooks = {};                         // other parts of the server can listen in here (the Drinks badges do)

  function newCode() {
    for (let i = 0; i < 50; i++) {
      let c = ''; for (let k = 0; k < 4; k++) c += LETTERS[crypto.randomInt(LETTERS.length)];
      if (!rooms.has(c)) return c;
    }
    return null;
  }
  function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const connected = p => p.streams.size > 0;

  // ---- what one player is allowed to see right now
  function viewFor(room, me) {
    const asking = room.phase === 'question', betting = room.phase === 'bet', admin = isAdmin(me.id);   // only admin accounts are told who left the page
    return {
      code: room.code, phase: room.phase, you: me.id, host: room.host, isHost: room.host === me.id,
      rounds: room.rounds, seconds: room.seconds, drinks: room.drinks, round: room.round, mode: room.mode, betSeconds: BET_SECONDS,
      // while betting: every guess, low to high, with whose it is (the answer is still only on the server)
      options: betting ? [...room.guesses].map(([id, g]) => ({ id, name: (room.players.get(id) || {}).name || '', guess: g })).sort((a, b) => a.guess - b.guess) : null,
      myBet: betting && room.bets.has(me.id) ? room.bets.get(me.id) : null,
      gamesLeft: room.host === me.id && room.phase === 'lobby' ? limits.gamesLeft(room.owner, me.id) : null,   // the host's free games; null = no limit here
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, sips: p.sips, on: connected(p), done: asking ? room.guesses.has(p.id) : betting && room.bets.has(p.id), away: admin && p.away ? p.away : undefined })),
      q: room.q && room.phase !== 'lobby' && room.phase !== 'final' ? { text: room.q.q, unit: room.q.u } : null,
      left: asking || betting ? Math.max(0, room.endsAt - Date.now()) : 0,
      myGuess: (asking || betting) && room.guesses.has(me.id) ? room.guesses.get(me.id) : null,
      reveal: room.phase === 'reveal' ? room.reveal : null,          // the answer exists in here only after the round is closed
      chat: room.chat
    };
  }
  function push(room) {
    room.touched = Date.now();
    for (const p of room.players.values()) {
      if (!p.streams.size) continue;
      const msg = 'event: state\ndata: ' + JSON.stringify(viewFor(room, p)) + '\n\n';
      for (const res of p.streams) { try { res.write(msg); } catch (e) {} }
    }
  }
  function closeRoom(room) {
    clearTimeout(room.timer);
    for (const p of room.players.values()) for (const res of p.streams) { try { res.write('event: gone\ndata: {}\n\n'); res.end(); } catch (e) {} }
    rooms.delete(room.code);
  }

  // ---- one round
  function ask(room) {
    room.round++; room.q = room.deck.pop(); room.guesses = new Map(); room.reveal = null;
    room.phase = 'question'; room.endsAt = Date.now() + room.seconds * 1000;
    clearTimeout(room.timer);
    room.timer = setTimeout(() => closeRound(room), room.seconds * 1000 + 400);   // a little slack for slow connections
    push(room);
  }
  function closeRound(room) {
    if (room.phase !== 'question') return;
    clearTimeout(room.timer);
    if (room.mode === 'bets') {                       // the guesses are in: now the bets (nobody guessed: straight to the answer)
      if (!room.guesses.size) return closeBets(room);
      room.phase = 'bet'; room.bets = new Map(); room.endsAt = Date.now() + BET_SECONDS * 1000;
      room.timer = setTimeout(() => closeBets(room), BET_SECONDS * 1000 + 400);
      push(room); return;
    }
    const a = room.q.a;
    const rows = [...room.players.values()].map(p => {
      const g = room.guesses.has(p.id) ? room.guesses.get(p.id) : null;
      const err = g == null ? null : Math.abs(Math.log10(g / a));                  // how many powers of ten off
      return { id: p.id, name: p.name, guess: g, err, pts: g == null ? 0 : Math.round(100 * Math.max(0, 1 - err)), bonus: 0 };
    });
    const best = Math.min(...rows.filter(r => r.err != null).map(r => r.err));
    for (const r of rows) {
      if (r.err != null && r.err === best) r.bonus = CLOSEST_BONUS;
      room.players.get(r.id).score += r.pts + r.bonus;
    }
    if (room.drinks) {
      const guessed = rows.filter(r => r.err != null), worst = Math.max(...guessed.map(r => r.err)), bull = guessed.some(r => r.err <= BULLSEYE);
      for (const r of rows) {
        const p = room.players.get(r.id);
        if (r.err == null && !connected(p)) continue;                                // away from the table: nothing to drink
        r.sips = r.err == null ? SIPS_NO_GUESS : 0;
        if (r.err != null && guessed.length > 1 && worst > best && r.err === worst) r.sips += SIPS_FURTHEST;
        if (bull && !(r.err != null && r.err <= BULLSEYE)) r.sips += SIPS_BULLSEYE;
        p.sips += r.sips;
        if (hooks.sips) { try { hooks.sips(r.id, { sips: r.sips, noGuess: r.err == null, bull: rows.length > 1 && r.err != null && r.err <= BULLSEYE }); } catch (e) {} }
      }
    }
    rows.sort((x, y) => (x.err == null) - (y.err == null) || x.err - y.err);
    room.reveal = { answer: a, note: room.q.n || '', rows, last: room.round >= room.rounds };
    room.phase = 'reveal';
    push(room);
  }
  // the bets are in (or the time is up): the answer, the winning guess, and what every bet paid
  function closeBets(room) {
    if (room.phase !== 'bet' && room.phase !== 'question') return;
    clearTimeout(room.timer);
    const a = room.q.a, bets = room.bets || new Map();
    const errOf = id => room.guesses.has(id) ? Math.abs(Math.log10(room.guesses.get(id) / a)) : null;
    const guessed = [...room.guesses.keys()], best = guessed.length ? Math.min(...guessed.map(errOf)) : null;
    const winners = new Set(guessed.filter(id => errOf(id) === best));
    const backers = [...bets.values()].filter(b => winners.has(b.on)).length;
    const odds = backers ? Math.max(2, Math.floor(bets.size / backers)) : 0;
    room.give = new Map();
    const rows = [...room.players.values()].map(p => {
      const b = bets.get(p.id) || null, won = !!b && winners.has(b.on);
      const pts = (b ? (won ? b.stake * odds : -b.stake) : 0) + (winners.has(p.id) ? WIN_GUESS_BONUS : 0);
      p.score += pts;
      const row = { id: p.id, name: p.name, guess: room.guesses.has(p.id) ? room.guesses.get(p.id) : null, err: errOf(p.id), winner: winners.has(p.id),
        bet: b ? { on: b.on, onName: (room.players.get(b.on) || {}).name || '', stake: b.stake } : null, won, pts, sips: 0, give: 0 };
      if (room.drinks && (b || connected(p))) {                                       // away from the table: nothing to drink
        row.sips = b ? (won ? 0 : b.stake) : SIPS_NO_BET;
        if (won) { row.give = b.stake; room.give.set(p.id, b.stake); }
        p.sips += row.sips;
        if (row.sips && hooks.sips) { try { hooks.sips(p.id, { sips: row.sips, noGuess: !b && !room.guesses.has(p.id), bull: false }); } catch (e) {} }
      }
      return row;
    });
    rows.sort((x, y) => (x.err == null) - (y.err == null) || x.err - y.err);
    room.reveal = { mode: 'bets', answer: a, note: room.q.n || '', rows, odds, last: room.round >= room.rounds };
    room.phase = 'reveal';
    push(room);
  }
  function maybeCloseEarly(room) {
    const waiting = [...room.players.values()].filter(p => connected(p) && !(room.phase === 'bet' ? room.bets : room.guesses).has(p.id));
    if (room.phase === 'question' && !waiting.length && room.guesses.size) closeRound(room);
    else if (room.phase === 'bet' && !waiting.length && room.bets.size) closeBets(room);
  }

  // ---- housekeeping: hand the host role on, drop dead lobbies
  setInterval(() => {
    const now = Date.now();
    for (const room of [...rooms.values()]) {
      const online = [...room.players.values()].filter(connected);
      if (online.length) room.lastOnline = now;
      if (now - room.lastOnline > EMPTY_ROOM_MS || now - room.touched > IDLE_ROOM_MS) { closeRoom(room); continue; }
      const host = room.players.get(room.host);
      if ((!host || (!connected(host) && now - host.goneAt > HOST_AWAY_MS)) && online.length) { room.host = online[0].id; push(room); }
    }
  }, 5000).unref();
  setInterval(() => {                       // keeps proxies from closing a quiet connection
    for (const room of rooms.values()) for (const p of room.players.values()) for (const res of p.streams) { try { res.write(': hb\n\n'); } catch (e) {} }
  }, 15000).unref();

  const lastCreate = new Map();

  // Returns true when the request was for party mode. `user` is the logged-in account id.
  async function handle(req, res, url, user) {
    if (!url.startsWith('/api/party')) return false;
    if (!QUESTIONS.length) { send(res, 503, { error: 'Party mode is not available right now' }); return true; }

    if (url === '/api/party/create' && req.method === 'POST') {
      const now = Date.now();
      if (now - (lastCreate.get(user) || 0) < 3000) { send(res, 429, { error: 'One moment, then try again' }); return true; }
      const may = limits.mayOpen(user); if (!may.ok) { send(res, 403, may.refusal); return true; }
      if (rooms.size >= MAX_ROOMS) { send(res, 503, { error: 'Too many lobbies are open right now' }); return true; }
      const code = newCode(); if (!code) { send(res, 503, { error: 'Could not open a lobby' }); return true; }
      lastCreate.set(user, now);
      rooms.set(code, { code, owner: user, host: user, phase: 'lobby', rounds: 5, seconds: 25, drinks: false, round: 0, deck: [], q: null, endsAt: 0, timer: null,
        mode: 'closest', guesses: new Map(), bets: new Map(), give: new Map(), reveal: null, chat: [], chatSeq: 0, players: new Map(), touched: now, lastOnline: now });
      send(res, 200, { code }); return true;
    }

    const m = url.match(/^\/api\/party\/([A-Za-z]{4})\/(join|events|settings|start|guess|bet|give|next|again|chat|leave|away)$/);
    if (!m) { send(res, 404, { error: 'not found' }); return true; }
    const room = rooms.get(m[1].toUpperCase()), act = m[2];
    if (!room) { send(res, 404, { error: 'No lobby with that code' }); return true; }

    if (act === 'join' && req.method === 'POST') {
      if (!room.players.has(user)) {
        if (room.players.size >= MAX_PLAYERS) { send(res, 409, { error: 'That lobby is full' }); return true; }
        room.players.set(user, { id: user, name: displayName(user), score: 0, sips: 0, streams: new Set(), goneAt: Date.now(), lastChat: 0 });
        push(room);
      }
      send(res, 200, { code: room.code }); return true;
    }

    const me = room.players.get(user);
    if (!me) { send(res, 403, { error: 'Join the lobby first' }); return true; }

    if (act === 'events' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 2000\n\n');
      me.streams.add(res);
      req.on('close', () => {
        me.streams.delete(res);
        if (!me.streams.size) me.goneAt = Date.now();
        if (rooms.get(room.code) === room) { maybeCloseEarly(room); push(room); }
      });
      push(room); return true;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'not allowed' }); return true; }
    const body = await readBody(req);
    const hostOnly = () => { if (room.host === user) return false; send(res, 403, { error: 'Only the host can do that' }); return true; };

    // "Left the page while a question was open and not yet answered", reported by the player's browser. A note, not proof.
    if (act === 'away') {
      if (room.phase === 'question' && !room.guesses.has(user)) me.away = Math.min(99, (me.away || 0) + 1);
      send(res, 200, { ok: true }); return true;
    }
    if (act === 'settings') {
      if (hostOnly()) return true;
      if (room.phase !== 'lobby') { send(res, 409, { error: 'The game is already running' }); return true; }
      if (ROUNDS.includes(body.rounds)) room.rounds = body.rounds;
      if (MODES.includes(body.mode)) room.mode = body.mode;
      if (SECONDS.includes(body.seconds)) room.seconds = body.seconds;
      if (typeof body.drinks === 'boolean') room.drinks = body.drinks;
      push(room); send(res, 200, { ok: true }); return true;
    }
    if (act === 'start') {
      if (hostOnly()) return true;
      if (room.phase !== 'lobby') { send(res, 409, { error: 'The game is already running' }); return true; }
      const t = limits.takeGame(room.owner, user); if (!t.ok) { send(res, 403, t.refusal); return true; }
      room.deck = shuffled(QUESTIONS).slice(0, room.rounds); room.round = 0;
      for (const p of room.players.values()) { p.score = 0; p.sips = 0; p.away = 0; }
      ask(room); send(res, 200, { ok: true }); return true;
    }
    if (act === 'guess') {
      const v = body.value;
      if (room.phase !== 'question' || Date.now() > room.endsAt + 400) { send(res, 409, { error: 'Too late for this question' }); return true; }
      if (room.guesses.has(user)) { send(res, 409, { error: 'You already answered' }); return true; }
      if (typeof v !== 'number' || !isFinite(v) || v <= 0 || v > 1e40) { send(res, 400, { error: 'Enter a number above zero' }); return true; }
      room.guesses.set(user, v);
      send(res, 200, { ok: true });
      push(room); maybeCloseEarly(room); return true;
    }
    // "Bets": back one of the guesses with a stake of 1 to 3 (any guess, your own too). One bet per round.
    if (act === 'bet') {
      if (room.phase !== 'bet' || Date.now() > room.endsAt + 400) { send(res, 409, { error: 'Betting is closed' }); return true; }
      if (room.bets.has(user)) { send(res, 409, { error: 'You already bet' }); return true; }
      const on = String(body.on || '');
      if (!room.guesses.has(on)) { send(res, 400, { error: 'Pick one of the guesses' }); return true; }
      if (!STAKES.includes(body.stake)) { send(res, 400, { error: 'Bet 1, 2 or 3' }); return true; }
      room.bets.set(user, { on, stake: body.stake });
      send(res, 200, { ok: true });
      push(room); maybeCloseEarly(room); return true;
    }
    // "Bets" with drinks: a won bet is handed out, one sip per tap, to anybody else at the table
    if (act === 'give') {
      const left = room.give.get(user) || 0;
      if (room.phase !== 'reveal' || !room.reveal || room.reveal.mode !== 'bets' || !left) { send(res, 409, { error: 'Nothing to hand out' }); return true; }
      const to = String(body.to || ''), p = room.players.get(to);
      if (!p || to === user) { send(res, 400, { error: 'Pick another player' }); return true; }
      room.give.set(user, left - 1); p.sips++;
      for (const r of room.reveal.rows) { if (r.id === to) r.sips++; if (r.id === user) r.give = left - 1; }
      if (hooks.sips) { try { hooks.sips(to, { sips: 1, noGuess: false, bull: false }); } catch (e) {} }
      send(res, 200, { ok: true }); push(room); return true;
    }
    if (act === 'next') {
      if (hostOnly()) return true;
      if (room.phase !== 'reveal') { send(res, 409, { error: 'Not now' }); return true; }
      if (room.round >= room.rounds) { room.phase = 'final'; room.q = null; room.reveal = null; push(room); }
      else ask(room);
      send(res, 200, { ok: true }); return true;
    }
    if (act === 'again') {
      if (hostOnly()) return true;
      if (room.phase !== 'final') { send(res, 409, { error: 'Not now' }); return true; }
      room.phase = 'lobby'; room.round = 0; for (const p of room.players.values()) { p.score = 0; p.sips = 0; }
      push(room); send(res, 200, { ok: true }); return true;
    }
    if (act === 'chat') {
      const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, CHAT_LEN) : '';
      if (!text) { send(res, 400, { error: 'Empty message' }); return true; }
      if (Date.now() - me.lastChat < 800) { send(res, 429, { error: 'Slow down a little' }); return true; }
      me.lastChat = Date.now();
      room.chat.push({ n: ++room.chatSeq, id: user, name: me.name, text });
      if (room.chat.length > MAX_CHAT) room.chat.shift();
      push(room); send(res, 200, { ok: true }); return true;
    }
    if (act === 'leave') {
      for (const s of me.streams) { try { s.end(); } catch (e) {} }
      room.players.delete(user); room.guesses.delete(user); if (room.bets) room.bets.delete(user);
      if (!room.players.size) closeRoom(room);
      else { if (room.host === user) room.host = ([...room.players.values()].find(connected) || [...room.players.values()][0]).id; maybeCloseEarly(room); push(room); }
      send(res, 200, { ok: true }); return true;
    }
    send(res, 404, { error: 'not found' }); return true;
  }
  return { handle, hooks, questionCount: () => QUESTIONS.length, randomQuestion: () => QUESTIONS[crypto.randomInt(QUESTIONS.length)] };
};
