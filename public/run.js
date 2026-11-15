// Today's daily games in progress, kept on the server (account doc "x_run") as well as in this browser.
//
// Why: a daily game may be played once. While its progress lived only in this browser, leaving a game, clearing the
// browser's storage, a private window or a second device handed out the same questions again, with the answers
// already seen. So every step of a daily game is reported here, and a game that was started is continued from the
// furthest point any device reached. The server only ever moves a game forward (mergeRun in server.js).
//
// Not used in the Archive (?day=...): past days keep their own copy in the browser, as before.
// Loaded right after day.js, before the games.
(function(){
'use strict';
var GAMES = ['sv', 'ml', 'gl', 'cl', 'wd'];
var live = !window.bpDay, doc = { day: '', games: {} }, timer = null, dirty = false, loaded = null;
var today = function(){ return window.bpRealToday(); };
function fresh(){ if (doc.day !== today()) doc = { day: today(), games: {} }; }
// take over whatever is further along than what is known here
function take(d){
  if (!d || d.day !== today() || !d.games) return;
  fresh();
  GAMES.forEach(function(g){ var a = d.games[g], b = doc.games[g]; if (a && typeof a.n === 'number' && (!b || a.n > b.n)) doc.games[g] = a; });
}
function push(){
  timer = null; if (!dirty) return; dirty = false;
  fetch('/api/docs/x_run', { method: 'PUT', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) })
    .then(function(r){ if (!r.ok) throw new Error('not saved'); return r.json(); })
    .then(function(j){ if (j && j.data) take(j.data); })
    .catch(function(){ dirty = true; });                       // sent again with the next step
}
function entry(g){ return live && doc.day === today() ? doc.games[g] : null; }
window.bpRun = {
  // Resolves once the server's copy has been read. Asked again after a failed try (for instance before logging in).
  ready: function(){
    if (!live) return Promise.resolve();
    if (!loaded) loaded = fetch('/api/docs/x_run', { credentials: 'same-origin' })
      .then(function(r){ if (!r.ok) { loaded = null; return null; } return r.json(); })
      .then(function(j){ if (j && j.exists) take(j.data); })
      .catch(function(){ loaded = null; });
    return loaded;
  },
  // what a game saved for today, or null (also null once the game is finished)
  get: function(g){ var x = entry(g); return x && !x.done ? x.s : null; },
  // how far today's game is: the step count it was last saved with, 0 if it was never started
  n: function(g){ var x = entry(g); return x ? x.n : 0; },
  // n counts the steps taken so far and only goes up; s is whatever the game needs to continue
  set: function(g, n, s){
    if (!live) return; fresh();
    var b = doc.games[g]; if (b && b.n > n) return;
    doc.games[g] = { n: n, s: s }; dirty = true;
    if (!timer) timer = setTimeout(push, 400);
  },
  // the game is finished: nothing is left to continue, and nothing to start again
  done: function(g){
    if (!live) return; fresh();
    doc.games[g] = { n: 1e9, done: true }; dirty = true;
    clearTimeout(timer); timer = setTimeout(push, 100);
  }
};
window.addEventListener('pagehide', function(){ if (dirty) { clearTimeout(timer); push(); } });
})();
