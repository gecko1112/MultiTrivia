// The landing page's one moving part: the reveal. A guess sits on the number line, the answer marker travels from
// the guess to its true place while the multiplier counts up, the way a Survival answer is revealed in the game.
// The questions and answers are real ones from the Survival set; the guesses are examples. Nothing here is scored.
// Without JavaScript the page shows the first example in its finished state.
(function(){
'use strict';
var EX = [
  { q: 'How tall are the Petronas Towers in Kuala Lumpur?', a: 452, g: 400, u: 'metres', ticks: [300, 400, 500, 600] },
  { q: 'How long does Neptune take to orbit the Sun?', a: 165, g: 250, u: 'Earth years', ticks: [100, 150, 200, 250, 300] },
  { q: 'How many time zones does Russia span?', a: 11, g: 9, u: 'time zones', ticks: [6, 8, 10, 12, 14, 16] }
];
var $ = function(id){ return document.getElementById(id); };
var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
var fmt = function(n){ return n.toLocaleString('en-GB'); };
var now = 0, frame = 0;

function show(i, animate){
  var e = EX[i], lo = Math.log(e.ticks[0]), span = Math.log(e.ticks[e.ticks.length - 1]) - lo;
  var at = function(v){ return 100 * (Math.log(v) - lo) / span; };
  var pg = at(e.g), pa = at(e.a), ratio = Math.max(e.a / e.g, e.g / e.a);
  $('exQ').textContent = e.q;
  $('exT').innerHTML = e.ticks.map(function(t){ return '<i style="left:' + at(t).toFixed(2) + '%"><u>' + fmt(t) + '</u></i>'; }).join('');
  $('exGv').textContent = fmt(e.g) + ' ' + e.u;
  $('exAv').textContent = fmt(e.a) + ' ' + e.u;
  $('exW').textContent = e.g < e.a ? 'too low' : 'too high';
  $('exS').setAttribute('aria-label', 'A number line. A guess of ' + fmt(e.g) + ' ' + e.u + ' sits ' + (e.g < e.a ? 'below' : 'above') + ' the answer, ' + fmt(e.a) + ' ' + e.u + '.');
  // labels near an edge hang inwards so they never leave the screen
  var side = function(el, p){ el.classList.toggle('r', p > 78); el.classList.toggle('l', p < 22); };
  $('exMg').style.left = pg + '%'; side($('exMg'), pg); side($('exMa'), pa);
  var place = function(k){                                   // k: 0 = the answer still sits on the guess, 1 = revealed
    var p = pg + (pa - pg) * k;
    $('exMa').style.left = p + '%';
    $('exG').style.left = Math.min(pg, p) + '%'; $('exG').style.width = Math.abs(p - pg) + '%';
    $('exX').textContent = (1 + (ratio - 1) * k).toFixed(2) + '×';
  };
  cancelAnimationFrame(frame);
  if (!animate || still) { place(1); return; }
  var t0 = null, MS = 1100;
  place(0);
  var step = function(t){
    if (t0 == null) t0 = t;
    var x = Math.min(1, (t - t0) / MS);
    place(x === 1 ? 1 : 1 - Math.pow(2, -10 * x));            // exponential ease-out
    if (x < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(function(t){ setTimeout(function(){ frame = requestAnimationFrame(step); }, 350); });
}

var next = $('exNext');
next.hidden = false;
next.addEventListener('click', function(){ now = (now + 1) % EX.length; show(now, true); });
show(0, true);
})();
