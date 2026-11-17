// Atlas, server side: the geography games (Flags, Outlines, Overland).
//
// THE SERVER DECIDES EVERYTHING, like in party-server.js. It picks the countries, keeps the answers,
// judges every pick and guess and stores the daily result. The browser gets a flag or a border without
// a name and four choices, or two countries to connect. It finds out what was right only after answering.
// In Flags the player types the name, and the server decides whether the spelling is close enough.
// The country data and the flags live in ./geo, outside the public folder, for that reason.
//
// Daily games: one per mode and day, the same for everyone, played once. Progress is saved after every
// answer, so a reload or a server restart continues the same game. Practice games live in memory only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { NO_LIMITS } = require('./limits-server.js');
const zlib = require('zlib');

const OUTLINE_CHOICES = 6;               // names to choose from in Outlines: six, so a lucky guess is rarer
const QUIZ_N = 10;                       // questions in Flags and Outlines
const EXTRA_GUESSES = 4;                 // Overland: guesses allowed on top of the shortest way
const MIN_OUTLINE_KM2 = 2000;            // smaller countries are only a dot at this map scale
const TWINS = [['td', 'ro'], ['id', 'mc']];   // flags that are practically identical: never offered against each other
const MODES = ['flags', 'shapes', 'route'];
const TZ = process.env.BP_TZ || 'Europe/Berlin';   // the day changes at midnight in this time zone
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dayFmt.format(new Date());

module.exports = function createGeo({ dir, send, readBody, secret, records, mayArchive, isAdmin, limits = NO_LIMITS }) {
  const seesAway = user => !!(isAdmin && user && isAdmin(user));
  let C = [];
  try { C = JSON.parse(fs.readFileSync(path.join(dir, 'countries.json'), 'utf8')).countries; }
  catch (e) { console.error('Atlas is off: ' + e.message + ' (build it with tools/build-geo.js)'); }
  const byId = new Map(C.map(c => [c.id, c]));

  // ---- typed names (Flags): case, accents, punctuation, spaces and little words do not matter, and a very small typo is let through
  const SAME = { st: 'saint', sankt: 'saint', sainte: 'saint' }, LITTLE = new Set(['and', 'und', 'the', 'of']);
  const spell = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim()
    .split(' ').map(w => SAME[w] || w).filter(w => w && !LITTLE.has(w)).join('');
  for (const c of C) c.keys = [...new Set([c.name, ...c.alt].map(spell).filter(Boolean))];
  const slack = k => (k.length < 5 ? 0 : k.length < 9 ? 1 : 2);      // letters that may be wrong: none in short names, one, or two in long names
  function typos(a, b) {                              // wrong, missing, extra or swapped letters between two spellings
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
  const off = (t, c) => Math.min(...c.keys.map(k => { const d = typos(t, k); return d <= slack(k) ? d : 9; }));
  // Right when the text is close enough to this country and not just as close to another one ("Niger" is never "Nigeria").
  function nameFits(text, id) {
    const t = spell(text); if (!t) return false;
    const mine = off(t, byId.get(id));
    return mine === 0 || (mine < 9 && !C.some(c => c.id !== id && off(t, c) <= mine));
  }

  // ---- drawings, made once: the border on a shared map (Mercator) and alone in a 100 x 100 box
  const merc = lat => -(180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  for (const c of C) {
    const prec = c.km2 < 3000 ? 4 : c.km2 < 200000 ? 3 : 2;
    let d = '', x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, la = 0, n = 0;
    for (const flat of c.polys) {
      for (let i = 0; i < flat.length; i += 2) {
        const x = flat[i] / 1000, y = merc(flat[i + 1] / 1000);
        d += (i ? 'L' : 'M') + +x.toFixed(prec) + ' ' + +y.toFixed(prec);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; la += flat[i + 1] / 1000; n++;
      }
      d += 'Z';
    }
    c.map = { d, box: [x0, y0, x1, y1].map(v => +v.toFixed(3)), at: [c.label[0], +merc(c.label[1]).toFixed(3)] };
    const k = Math.cos((la / n) * Math.PI / 180); let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
    for (const flat of c.polys) for (let i = 0; i < flat.length; i += 2) { const x = flat[i] / 1000 * k, y = -flat[i + 1] / 1000; if (x < a0) a0 = x; if (x > a1) a1 = x; if (y < b0) b0 = y; if (y > b1) b1 = y; }
    const s = 100 / Math.max(a1 - a0, b1 - b0, 1e-9), ox = (100 - (a1 - a0) * s) / 2, oy = (100 - (b1 - b0) * s) / 2;
    c.outline = c.polys.map(flat => { let o = ''; for (let i = 0; i < flat.length; i += 2) o += (i ? 'L' : 'M') + +((flat[i] / 1000 * k - a0) * s + ox).toFixed(1) + ' ' + +((-flat[i + 1] / 1000 - b0) * s + oy).toFixed(1); return o + 'Z'; }).join('');
  }
  const drawing = c => ({ id: c.id, name: c.name, d: c.map.d, box: c.map.box, at: c.map.at });

  // ---- the border graph: how many borders you cross from one country to another
  const distCache = new Map();
  function distFrom(id) {
    let m = distCache.get(id); if (m) return m;
    m = new Map([[id, 0]]); const queue = [id];
    for (let i = 0; i < queue.length; i++) for (const nb of byId.get(queue[i]).nb) if (!m.has(nb)) { m.set(nb, m.get(queue[i]) + 1); queue.push(nb); }
    distCache.set(id, m); return m;
  }
  const pairs = { 3: [], 4: [], 5: [], 6: [] };     // start and end, by the number of borders between them
  for (const a of C) if (a.nb.length) for (const [b, d] of distFrom(a.id)) if (a.id < b && pairs[d]) pairs[d].push([a.id, b]);

  // ---- random numbers: from a secret and the date for the daily games, so tomorrow cannot be worked out in advance
  function rngFor(...parts) {
    let a = crypto.createHash('sha256').update(secret + '|' + parts.join('|')).digest().readUInt32LE(0);
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  const shuffle = (list, rnd) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const twins = (a, b) => TWINS.some(t => t.includes(a) && t.includes(b));

  function buildPuzzle(mode, rnd) {
    if (mode === 'route') {
      const d = [3, 3, 4, 4, 4, 5, 5, 6][Math.floor(rnd() * 8)], [x, y] = pairs[d][Math.floor(rnd() * pairs[d].length)];
      const [a, b] = rnd() < 0.5 ? [x, y] : [y, x];
      return { a, b, d, max: d - 1 + EXTRA_GUESSES };
    }
    const pool = mode === 'shapes' ? C.filter(c => c.main >= MIN_OUTLINE_KM2) : C;
    return { items: shuffle(pool, rnd).slice(0, QUIZ_N).map(c => {
      // wrong choices come from the same part of the world, so they are plausible
      const ok = o => o.id !== c.id && !twins(o.id, c.id);
      const close = shuffle(C.filter(o => ok(o) && o.sub === c.sub), rnd).slice(0, 3);
      const wider = shuffle(C.filter(o => ok(o) && o.cont === c.cont && !close.includes(o)), rnd);
      const any = shuffle(C.filter(o => ok(o) && o.cont !== c.cont), rnd);
      return { id: c.id, options: shuffle([c, ...[...close, ...wider, ...any].slice(0, OUTLINE_CHOICES - 1)], rnd).map(o => o.id) };
    }) };
  }
  const dailyPuzzles = new Map();
  function dailyPuzzle(mode, date) {
    const k = mode + ':' + date;
    if (!dailyPuzzles.has(k)) { if (dailyPuzzles.size > 12) dailyPuzzles.clear(); dailyPuzzles.set(k, buildPuzzle(mode, rngFor(mode, date))); }
    return dailyPuzzles.get(k);
  }

  // ---- a game in progress: the puzzle plus what the player has answered so far ("rec")
  const practice = new Map();                        // "user|mode" -> run
  function getRun(user, mode, daily, create, day) {
    if (!daily) {
      const k = user + '|' + mode;
      if (create) { if (practice.size > 5000) practice.clear(); practice.set(k, { user, mode, daily: false, key: crypto.randomBytes(6).toString('hex'), puzzle: buildPuzzle(mode, rngFor(crypto.randomBytes(12).toString('hex'))), rec: { t0: Date.now(), t1: 0, moves: [] } }); }
      return practice.get(k) || null;
    }
    const date = day || today(), mine = records(user), k = mode + ':' + date;
    if (!mine[k]) { if (!create) return null; mine[k] = { t0: Date.now(), t1: 0, moves: [] }; if (date !== today()) mine[k].late = true; records.save(); }   // late: played through the archive, does not count for streaks
    return { user, mode, daily: true, key: date, puzzle: dailyPuzzle(mode, date), rec: mine[k] };
  }
  // The outcome in a few numbers. Written into the record when a game ends, so later changes to the data never alter old results.
  function result(run) {
    if (run.mode === 'route') { const st = routeState(run); return { done: st.done, won: st.won, used: run.rec.moves.length, between: run.puzzle.d - 1 }; }
    return { done: run.rec.moves.length >= run.puzzle.items.length, score: quizScore(run), n: run.puzzle.items.length };
  }
  function finish(run) {
    run.rec.t1 = Date.now(); run.rec.res = result(run);
    if (!run.daily) { const mine = records(run.user); mine.played = (mine.played || 0) + 1; records.save(); }   // practice games only count, they are not kept
  }
  const persist = run => { if (run.daily) records.save(); };
  const DAILY_KEY = /^(flags|shapes|route):(\d{4}-\d\d-\d\d)$/;
  // Finished daily games of one player: for the friends table and the levels.
  // `admin`: the one asking is an admin account and also gets how often the player left the page. Nobody else is told.
  function dayOf(user, date, admin) {
    const mine = records(user), out = {};
    for (const m of MODES) { const rec = mine[m + ':' + date]; if (rec && rec.t1) out[m] = Object.assign({}, rec.res || result({ mode: m, daily: true, puzzle: dailyPuzzle(m, date), rec }), rec.late ? { late: true } : null, admin && rec.away ? { away: rec.away } : null); }
    return Object.keys(out).length ? out : null;
  }
  // every finished daily of a player, plus how many practice games (the history route and the levels)
  function history(user) {
    const mine = records(user), days = {};
    for (const k of Object.keys(mine)) { const m = k.match(DAILY_KEY); if (m && mine[k].t1) (days[m[2]] = days[m[2]] || {})[m[1]] = dayOf(user, m[2])[m[1]]; }
    return { days, played: mine.played || 0 };
  }
  const datesOf = user => [...new Set(Object.keys(records(user)).map(k => DAILY_KEY.test(k) && records(user)[k].t1 ? k.match(DAILY_KEY)[2] : null).filter(Boolean))];

  // ---- Flags and Outlines
  // A move is the chosen country (Outlines) or what was typed together with the verdict given at that moment (Flags).
  const rightAt = (run, j) => { const m = run.rec.moves[j]; return typeof m === 'string' ? m === run.puzzle.items[j].id : !!m.ok; };
  const saidAt = (run, j) => { const m = run.rec.moves[j]; return typeof m === 'string' ? byId.get(m).name : m.t; };
  const quizScore = run => run.rec.moves.filter((m, j) => rightAt(run, j)).length;
  const flagUrl = (run, i) => '/api/geo/flag?daily=' + (run.daily ? 1 : 0) + '&i=' + i + '&k=' + run.key;
  function quizView(run) {
    const { items } = run.puzzle, { moves } = run.rec, i = moves.length, done = i >= items.length, typed = run.mode === 'flags';
    const picture = j => (run.mode === 'flags' ? { img: flagUrl(run, j) } : { shape: byId.get(items[j].id).outline });
    return {
      mode: run.mode, daily: run.daily, n: items.length, i, done, score: quizScore(run),
      marks: moves.map((m, j) => rightAt(run, j)),
      q: done ? null : Object.assign(typed ? { type: true } : { options: items[i].options.map(id => ({ id, name: byId.get(id).name })) }, picture(i)),
      // the right answer to a question leaves the server only after that question was answered
      last: i ? { ok: rightAt(run, i - 1), answer: items[i - 1].id, name: byId.get(items[i - 1].id).name, pick: typed ? null : moves[i - 1] } : null,
      review: done ? items.map((it, j) => Object.assign({ name: byId.get(it.id).name, ok: rightAt(run, j), picked: saidAt(run, j) }, picture(j))) : null,
      away: seesAway(run.user) ? run.rec.away || 0 : undefined, ms: done ? run.rec.t1 - run.rec.t0 : 0
    };
  }

  // ---- Overland
  function routeState(run) {
    const { a, b, max } = run.puzzle, { moves } = run.rec, open = new Set([...moves, b]), seen = new Set([a]), queue = [a];
    let won = false;
    for (let i = 0; i < queue.length && !won; i++) for (const nb of byId.get(queue[i]).nb) { if (nb === b) { won = true; break; } if (open.has(nb) && !seen.has(nb)) { seen.add(nb); queue.push(nb); } }
    return { won, done: won || moves.length >= max || !!run.rec.gaveUp };
  }
  function grade(run, id) {                          // good: on a shortest way. near: a way one border longer. far: no help.
    const { a, b, d } = run.puzzle, x = distFrom(a).get(id), y = distFrom(b).get(id);
    return x == null || y == null ? 'far' : x + y === d ? 'good' : x + y === d + 1 ? 'near' : 'far';
  }
  function shortest(run) {                           // one shortest way, through countries the player named where possible
    const { a, b } = run.puzzle, toB = distFrom(b), named = new Set(run.rec.moves), way = [];
    for (let at = a; at !== b;) { const next = byId.get(at).nb.filter(n => toB.get(n) === toB.get(at) - 1); at = next.find(n => named.has(n)) || next[0]; if (at !== b) way.push(at); }
    return way;
  }
  function routeView(run) {
    const { a, b, d, max } = run.puzzle, { moves } = run.rec, st = routeState(run);
    return {
      mode: 'route', daily: run.daily, a: drawing(byId.get(a)), b: drawing(byId.get(b)), between: d - 1, max, left: Math.max(0, max - moves.length),
      guesses: moves.map(id => Object.assign(drawing(byId.get(id)), { grade: grade(run, id) })),
      done: st.done, won: st.won,
      solution: st.done ? shortest(run).map(id => (moves.includes(id) ? { id, name: byId.get(id).name } : drawing(byId.get(id)))) : null,
      away: seesAway(run.user) ? run.rec.away || 0 : undefined, ms: st.done ? run.rec.t1 - run.rec.t0 : 0
    };
  }
  const view = run => (run.mode === 'route' ? routeView(run) : quizView(run));
  const summary = (user, mode, day) => { const run = getRun(user, mode, true, false, day); return run ? result(run) : null; };
  // A past day (the Archive, a Plus feature). Returns null for today, the date for an allowed past day, false for anything else.
  const FIRST_DAY = '2026-01-01';
  function pastDay(user, v) {
    if (v == null || v === '' || v === today()) return null;
    if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(v) || isNaN(Date.parse(v + 'T12:00:00Z')) || v > today() || v < FIRST_DAY) return false;
    return mayArchive(user) ? v : false;
  }

  // ---- answers go out compressed: a map with a dozen borders is a few hundred KB otherwise
  function sendBig(req, res, obj, cache) {
    const raw = Buffer.from(JSON.stringify(obj)), headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache || 'no-store' };
    if (raw.length < 1500 || !/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { res.writeHead(200, headers); return res.end(raw); }
    headers['Content-Encoding'] = 'gzip'; headers['Vary'] = 'Accept-Encoding'; res.writeHead(200, headers); res.end(zlib.gzipSync(raw));
  }
  const flagCache = new Map();
  const namesList = { names: C.map(c => [c.id, c.name, ...c.alt]) };

  // Returns true when the request was for the Atlas. `user` is the logged-in account id.
  async function handle(req, res, url, query, user) {
    if (!url.startsWith('/api/geo/')) return false;
    if (!C.length) { send(res, 503, { error: 'The Atlas is not available right now' }); return true; }
    const act = url.slice('/api/geo/'.length);

    if (req.method === 'GET') {
      if (act === 'names') { sendBig(req, res, namesList, 'private, max-age=3600'); return true; }          // every country there is: not a secret
      if (act === 'home') {
        const day = pastDay(user, query.get('day')); if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }
        const daily = {}, practiceLeft = {}; for (const m of MODES) { daily[m] = summary(user, m, day); practiceLeft[m] = limits.practiceLeft(user, m); }
        send(res, 200, { date: day || today(), daily, practiceLeft }); return true;
      }
      if (act === 'history') {                                                                             // every finished daily of this player, plus how many practice games
        send(res, 200, history(user)); return true;
      }
      if (act === 'flag') {
        const isDaily = query.get('daily') === '1', day = isDaily ? pastDay(user, query.get('k')) : null;                // a daily flag address carries its day
        const run = day === false ? null : getRun(user, 'flags', isDaily, false, day), i = Number(query.get('i'));
        // only flags that were already shown to this player in this game
        if (!run || query.get('k') !== run.key || !Number.isInteger(i) || i < 0 || i >= run.puzzle.items.length || i > run.rec.moves.length) { res.writeHead(404); res.end(); return true; }
        const id = run.puzzle.items[i].id;
        if (!flagCache.has(id)) flagCache.set(id, fs.readFileSync(path.join(dir, 'flags', id + '.svg')));
        res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
        res.end(flagCache.get(id)); return true;
      }
      send(res, 404, { error: 'not found' }); return true;
    }
    if (req.method !== 'POST') { send(res, 405, { error: 'not allowed' }); return true; }
    const body = await readBody(req), mode = body.mode, daily = body.daily === true;
    if (!MODES.includes(mode)) { send(res, 400, { error: 'Unknown game' }); return true; }
    const day = daily ? pastDay(user, body.day) : null;
    if (day === false) { send(res, 403, { error: 'That day is not available' }); return true; }

    if (act === 'start') {                                                                                   // a daily that exists is continued, never restarted
      const t = daily ? null : limits.takePractice(user, mode);                                              // every practice game is new and counts for a free account
      if (t && !t.ok) { send(res, 403, t.refusal); return true; }
      const v = view(getRun(user, mode, daily, true, day)); sendBig(req, res, t ? Object.assign(v, { practiceLeft: t.left }) : v); return true;
    }
    const run = getRun(user, mode, daily, false, day);
    if (!run) { send(res, 409, { error: 'Start a game first' }); return true; }

    if (act === 'answer' && mode === 'flags') {
      const { items } = run.puzzle, i = run.rec.moves.length;
      if (i >= items.length) { send(res, 409, { error: 'This game is over' }); return true; }
      if (body.i !== i) { send(res, 409, { error: 'That flag was already answered' }); return true; }
      const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 60) : '';   // empty = skipped
      run.rec.moves.push({ t: text, ok: nameFits(text, items[i].id) });
      if (run.rec.moves.length >= items.length) finish(run);
      persist(run); sendBig(req, res, view(run)); return true;
    }
    // The count is kept on the server and only shown to admin accounts (see isAdmin in server.js), never to other players.
    // "The player left the page during the game" (switched tab, app or window). A page cannot see WHICH other tab is open,
    // browsers do not allow that, so this is all there is to know. It is reported by the browser, which means somebody who
    // tampers with the page can leave it out: it is a deterrent and a note next to the result, not proof, and nothing is punished.
    if (act === 'away') {
      const over = mode === 'route' ? routeState(run).done : run.rec.moves.length >= run.puzzle.items.length;
      if (!over) { run.rec.away = Math.min(99, (run.rec.away || 0) + 1); persist(run); }
      send(res, 200, { ok: true }); return true;
    }
    if (act === 'pick' && mode === 'shapes') {
      const { items } = run.puzzle, i = run.rec.moves.length;
      if (i >= items.length) { send(res, 409, { error: 'This game is over' }); return true; }
      if (body.i !== i) { send(res, 409, { error: 'That question was already answered' }); return true; }
      if (!items[i].options.includes(body.id)) { send(res, 400, { error: 'Pick one of the choices' }); return true; }
      run.rec.moves.push(body.id);
      if (run.rec.moves.length >= items.length) finish(run);
      persist(run); sendBig(req, res, view(run)); return true;
    }
    if (act === 'guess' && mode === 'route') {
      const id = body.id, { a, b } = run.puzzle;
      if (routeState(run).done) { send(res, 409, { error: 'This game is over' }); return true; }
      if (typeof id !== 'string' || !byId.has(id)) { send(res, 400, { error: 'Pick a country from the list' }); return true; }
      if (id === a || id === b) { send(res, 409, { error: 'That one is already on the map' }); return true; }
      if (run.rec.moves.includes(id)) { send(res, 409, { error: 'You already named that one' }); return true; }
      run.rec.moves.push(id);
      if (routeState(run).done) finish(run);
      persist(run); sendBig(req, res, view(run)); return true;
    }
    if (act === 'giveup' && mode === 'route') {
      if (!routeState(run).done) { run.rec.gaveUp = true; finish(run); persist(run); }
      sendBig(req, res, view(run)); return true;
    }
    send(res, 404, { error: 'not found' }); return true;
  }
  const flagOf = id => { if (!flagCache.has(id)) flagCache.set(id, fs.readFileSync(path.join(dir, 'flags', id + '.svg'))); return flagCache.get(id); };
  // the country a typed name means, with the same slack for typos as Flags, or null (Oddball uses this)
  const identify = text => { for (const c of C) if (nameFits(text, c.id)) return c.id; return null; };
  return { handle, dayOf, datesOf, history, identify, list: () => C, nameFits, flagOf, randomCountry: () => C[crypto.randomInt(C.length)], countries: () => C.length };
};
