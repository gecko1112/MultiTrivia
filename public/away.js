// Tells the server when the player leaves the page (another tab, app or window) in the middle of a daily game.
//
// Each game registers a check that answers "is my daily game in play on screen right now?". A page cannot see what
// the player does elsewhere, only that it lost them. The count is kept on the server and shown to admin accounts only.
// It is a note, not proof: nothing is punished, and somebody who tampers with the page can leave the report out.
(function(){
'use strict';
const checks = [];
let gone = false;
const day = () => { const d = window.bpNow(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function left(){
  if (gone) return; gone = true;
  for (const [game, playing] of checks) {
    let yes = false; try { yes = !!playing(); } catch (e) {}
    if (yes) fetch('/api/away', { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game, day: day() }) }).catch(() => {});
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) left(); else gone = false; });
window.addEventListener('blur', left);
window.addEventListener('focus', () => { gone = false; });
window.bpAway = { watch: (game, playing) => { checks.push([game, playing]); } };
})();
