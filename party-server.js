// Party mode, server side: private lobbies where everyone estimates the same question at the same time.
//
// THE SERVER DECIDES EVERYTHING. It picks the questions, keeps the answers to itself until the reveal,
// runs the clock, checks every guess and counts the points. A browser only sends "create", "join",
// "start", "my guess is 5000", "next" or a chat line, and receives a picture of the lobby to draw.
// Nothing a player changes in their own browser can alter a score. Keep it that way when adding modes.
//
// The questions come from content/survival.js, which is never sent to the browser.
//
// Lobbies live in memory only: restarting the server ends all running parties. Chat is never stored.
// Updates reach the players over Server-Sent Events (one long-lived GET per player), so no extra
// packages are needed and it works through ngrok and a reverse proxy.
const crypto = require('crypto');

const MAX_PLAYERS = 12, MAX_ROOMS = 200, MAX_CHAT = 40, CHAT_LEN = 200;
const ROUNDS = [5, 10, 15], SECONDS = [15, 25, 40];
const CLOSEST_BONUS = 25;                 // on top of the 0-100 points for closeness
// Drinks rules (a lobby setting): who has to drink is decided here too, with the points.
const SIPS_NO_GUESS = 2, SIPS_FURTHEST = 2, SIPS_BULLSEYE = 1;
const BULLSEYE = Math.log10(1.1);         // a guess within 10% of the answer: everyone else drinks
const HOST_AWAY_MS = 20 * 1000;           // host gone this long: the next player takes over
const EMPTY_ROOM_MS = 10 * 60 * 1000;     // nobody connected this long: the lobby is removed
const IDLE_ROOM_MS = 3 * 60 * 60 * 1000;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: they get mistaken for 1 and 0

function usable(list) {
  return list.filter(q => q && typeof q.q === 'string' && typeof q.a === 'number' && q.a > 0 && isFinite(q.a));
}

module.exports = function createParty({ questions, send, readBody, displayName, isAdmin = () => false }) {
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
    const asking = room.phase === 'question', admin = isAdmin(me.id);   // only admin accounts are told who left the page
    return {
      code: room.code, phase: room.phase, you: me.id, host: room.host, isHost: room.host === me.id,
      rounds: room.rounds, seconds: room.seconds, drinks: room.drinks, round: room.round,
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, sips: p.sips, on: connected(p), done: asking && room.guesses.has(p.id), away: admin && p.away ? p.away : undefined })),
      q: room.q && room.phase !== 'lobby' && room.phase !== 'final' ? { text: room.q.q, unit: room.q.u } : null,
      left: asking ? Math.max(0, room.endsAt - Date.now()) : 0,
      myGuess: asking && room.guesses.has(me.id) ? room.guesses.get(me.id) : null,
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
  function maybeCloseEarly(room) {
    if (room.phase !== 'question') return;
    const waiting = [...room.players.values()].filter(p => connected(p) && !room.guesses.has(p.id));
    if (!waiting.length && room.guesses.size) closeRound(room);
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
      if (rooms.size >= MAX_ROOMS) { send(res, 503, { error: 'Too many lobbies are open right now' }); return true; }
      const code = newCode(); if (!code) { send(res, 503, { error: 'Could not open a lobby' }); return true; }
      lastCreate.set(user, now);
      rooms.set(code, { code, host: user, phase: 'lobby', rounds: 5, seconds: 25, drinks: false, round: 0, deck: [], q: null, endsAt: 0, timer: null,
        guesses: new Map(), reveal: null, chat: [], chatSeq: 0, players: new Map(), touched: now, lastOnline: now });
      send(res, 200, { code }); return true;
    }

    const m = url.match(/^\/api\/party\/([A-Za-z]{4})\/(join|events|settings|start|guess|next|again|chat|leave|away)$/);
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
      if (SECONDS.includes(body.seconds)) room.seconds = body.seconds;
      if (typeof body.drinks === 'boolean') room.drinks = body.drinks;
      push(room); send(res, 200, { ok: true }); return true;
    }
    if (act === 'start') {
      if (hostOnly()) return true;
      if (room.phase !== 'lobby') { send(res, 409, { error: 'The game is already running' }); return true; }
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
      room.players.delete(user); room.guesses.delete(user);
      if (!room.players.size) closeRoom(room);
      else { if (room.host === user) room.host = ([...room.players.values()].find(connected) || [...room.players.values()][0]).id; maybeCloseEarly(room); push(room); }
      send(res, 200, { ok: true }); return true;
    }
    send(res, 404, { error: 'not found' }); return true;
  }
  return { handle, hooks, questionCount: () => QUESTIONS.length, randomQuestion: () => QUESTIONS[crypto.randomInt(QUESTIONS.length)] };
};
