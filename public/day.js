// Which day the daily games are played for. Normally today. In the Archive (a Plus feature) the page is
// opened with ?day=2026-11-10 and every daily game then deals, resumes and saves for that day instead.
// Loaded before all other scripts: they ask bpNow() wherever they used to ask the clock for "today".
(function(){
'use strict';
var pad = function(n){ return String(n).padStart(2, '0'); };
var key = function(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
var FIRST = '2026-01-01';                 // the daily games are defined from this day on
var day = null;
try {
  var q = new URLSearchParams(location.search).get('day');
  // What the server last said about this account (plus.js keeps it up to date and reloads the page when it changes).
  // Only a memory for a fast start: the server decides, and refuses the Plus routes whatever is stored here.
  var plus = localStorage.getItem('bp_plus') === '1';
  if (plus && q && /^\d{4}-\d\d-\d\d$/.test(q) && key(new Date(q + 'T12:00:00')) === q && q >= FIRST && q < key(new Date())) day = q;
} catch (e) {}
window.bpDay = day;                                             // null = today
window.bpFirstDay = FIRST;
window.bpRealToday = function(){ return key(new Date()); };
window.bpNow = function(){ return day ? new Date(day + 'T12:00:00') : new Date(); };
// A game in progress is remembered per day, so a look into the archive never wipes today's half-played game.
window.bpRunKey = function(k){ return day ? k + '_' + day : k; };

// Streaks, counted in one place for the profile and the calendar.
//   liveKeys: the days on which something was played on the day itself
//   saver:    the Plus streak saver. One missed day per calendar week (Monday to Sunday) is forgiven. A forgiven day keeps
//             the streak alive but does not add to it.
//   today:    the real today. A day that is still open never breaks a streak.
// Returns { now, best, days, saved: [the forgiven days] }.
window.bpStreak = function(liveKeys, saver, today){
  var live = liveKeys.slice().sort(), used = {}, saved = [], best = 0, run = 0, prev = null;
  var shift = function(k, n){ var d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() + n); return key(d); };
  var week = function(k){ var d = new Date(k + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return key(d); };
  // the days strictly between a and b, if every one of them can be forgiven; otherwise null
  var bridge = function(a, b){
    var out = [], mine = {};
    for (var k = shift(a, 1); k < b; k = shift(k, 1)) { var w = week(k); if (!saver || used[w] || mine[w]) return null; mine[w] = 1; out.push(k); }
    return out;
  };
  var take = function(gap){ gap.forEach(function(g){ used[week(g)] = 1; saved.push(g); }); };
  live.forEach(function(k){
    var gap = prev ? bridge(prev, k) : null;
    if (gap) { take(gap); run++; } else run = 1;
    if (run > best) best = run;
    prev = k;
  });
  var now = 0;
  if (prev && prev <= today) { var tail = prev === today ? [] : bridge(prev, today); if (tail) { take(tail); now = run; } }
  return { now: now, best: best, days: live.length, saved: saved };
};
})();
