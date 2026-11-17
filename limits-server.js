// What a free account may do, counted on the server. Plus has no limits.
//
//   - Practice games: PRACTICE_PER_DAY in each game, every day. The day turns at midnight in BP_TZ, as the dailies do.
//     Continuing a practice game that is already going costs nothing; every new one counts, "Play again" included.
//   - Party: a free account can open lobbies and join any lobby. Starting a game in a lobby uses one of the host's
//     PARTY_TRIALS free games, once and for all. A lobby opened by an account without limits plays freely, whoever
//     hosts it later, and so does a lobby whose current host has no limits.
//
// WHO IS LIMITED. Only accounts that could buy Plus right now (plus-server.js decides who that is). While Plus is not
// on sale for an account, nothing is limited for it, so nobody runs into a wall they cannot get past. Today that means
// admin accounts without Plus (the test checkout); once Paddle is live, every account without Plus.
//
// The browser is told how many are left and draws that. The server refuses a start beyond the limit whatever the
// browser shows. The two numbers are repeated for the pages in public/site-info.js (BP_FREE), and
// tests/limits-api.js checks that both files say the same.
'use strict';
const PRACTICE_PER_DAY = 3;
const PARTY_TRIALS = 3;
const GAMES = ['sv', 'ml', 'gl', 'cl', 'wd', 'flags', 'shapes', 'route', 'od'];

// For a module that was built without limits (the tests build the game modules directly): everything is allowed.
const NO_LIMITS = { limited: () => false, practiceLeft: () => null, takePractice: () => ({ ok: true, left: null }),
  gamesLeft: () => null, mayOpen: () => ({ ok: true }), takeGame: () => ({ ok: true, left: null }) };

// records(user) -> the account's record, created when missing; records.peek(user) -> the record or null; records.save()
module.exports = function createLimits({ records, hasPlus, onSale, today }) {
  const limited = u => !hasPlus(u) && !!onSale(u);

  // ---- practice
  const usedToday = (u, game) => { const r = records.peek(u); return r && r.day === today() && r.used ? (r.used[game] | 0) : 0; };
  // practice games left today in one game, or null when there is no limit
  function practiceLeft(u, game) { return limited(u) ? Math.max(0, PRACTICE_PER_DAY - usedToday(u, game)) : null; }
  // A new practice game is about to be dealt. { ok, left } or { ok: false, refusal } (the reply to send).
  function takePractice(u, game) {
    if (!GAMES.includes(game)) throw new Error('No practice allowance for ' + game);
    const left = practiceLeft(u, game);
    if (left == null) return { ok: true, left: null };
    if (left <= 0) return { ok: false, refusal: { error: 'No practice games left today. Free accounts get ' + PRACTICE_PER_DAY + ' a day in each game.', limit: 'practice', practiceLeft: 0 } };
    const r = records(u);
    if (r.day !== today() || !r.used || typeof r.used !== 'object') { r.day = today(); r.used = {}; }
    r.used[game] = (r.used[game] | 0) + 1; records.save();
    return { ok: true, left: left - 1 };
  }

  // ---- party
  const trialsLeft = u => { if (!limited(u)) return null; const r = records.peek(u); return Math.max(0, PARTY_TRIALS - ((r && r.party) | 0)); };
  const PARTY_REFUSAL = { error: 'Your ' + PARTY_TRIALS + ' free party games are used up. Hosting is part of Plus, joining stays free.', limit: 'party' };
  // free games the host of a lobby has left, or null when games in this lobby are not limited
  function gamesLeft(owner, host) { return trialsLeft(owner) == null ? null : trialsLeft(host); }
  // Opening a lobby: refused only when it could never start a game.
  function mayOpen(u) { const l = trialsLeft(u); return l == null || l > 0 ? { ok: true } : { ok: false, refusal: PARTY_REFUSAL }; }
  // A game is about to start in a lobby opened by `owner`, started by its host.
  function takeGame(owner, host) {
    const left = gamesLeft(owner, host);
    if (left == null) return { ok: true, left: null };
    if (left <= 0) return { ok: false, refusal: PARTY_REFUSAL };
    const r = records(host); r.party = (r.party | 0) + 1; records.save();
    return { ok: true, left: left - 1 };
  }

  return { limited, practiceLeft, takePractice, gamesLeft, mayOpen, takeGame };
};
module.exports.PRACTICE_PER_DAY = PRACTICE_PER_DAY;
module.exports.PARTY_TRIALS = PARTY_TRIALS;
module.exports.NO_LIMITS = NO_LIMITS;
