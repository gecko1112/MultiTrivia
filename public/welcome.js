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

// Somebody who is already logged in on this browser gets "Play" instead of "Log in" and "Create account".
var known = false; try { known = !!localStorage.getItem('bp_owner'); } catch (e) {}
if (known) {
  document.querySelector('.top nav').innerHTML = '<a class="btn" href="/">Play</a>';
  var go = document.querySelector('.close .go');
  go.querySelector('a').textContent = 'Play'; go.querySelector('p').remove();
}

// Each game's field arrives with the scroll. Once a good part of it is in the window its two halves sweep in from the
// sides; when it has left the window they park again, so the sweep plays on the way back too. With reduced motion,
// or without the observer, the halves simply stand in place.
if (!still && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('sweep');
  var io = new IntersectionObserver(function(es){
    es.forEach(function(e){ if (e.intersectionRatio >= .4) e.target.classList.add('in'); else if (e.intersectionRatio === 0) e.target.classList.remove('in'); });
  }, { threshold: [0, .4], rootMargin: '-1px 0px' });    // the margin makes a field that only touches the window count as gone
  [].forEach.call(document.querySelectorAll('.game'), function(g){ io.observe(g); });
}

// ---- one screen at a time
// The browser's scroll snapping settles on the nearest screen, so one turn of a mouse wheel would spring back to
// where it started. The wheel, the arrow and page keys and the links on the first screen therefore turn the page
// here: one push, one screen, eased out. Touch scrolling is left to the browser's own snapping. A screen that is
// taller than the window scrolls normally until its edge is reached.
(function(){
  var root = document.documentElement, busy = false, settling = false, lastWheel = 0, sum = 0, raf = 0;
  root.classList.add('paged');
  var all = function(sel){ return [].slice.call(document.querySelectorAll(sel)); };
  var topOf = function(el){ return el.getBoundingClientRect().top + window.scrollY; };
  // Where the page can rest: the top, every game, the closing screens, the very end. A screen rests with its top at
  // the top of the window, or centred when the stylesheet says so (narrow screens). Each stop remembers its screen.
  function stops(){
    var vh = window.innerHeight, max = Math.max(0, root.scrollHeight - vh), out = [];
    all('.hero,.game,.plain,.close').forEach(function(s){
      var hero = s.classList.contains('hero'), top = hero ? 0 : topOf(s), h = topOf(s) + s.offsetHeight - top;
      var y = /center/.test(getComputedStyle(s).scrollSnapAlign) && h < vh ? top - (vh - h) / 2 : top;
      y = Math.round(Math.max(0, Math.min(max, y)));
      if (max - y < vh * .25) y = max;                                    // too close to the end to be a stop of its own
      if (out.length && y - out[out.length - 1].y <= 2) { out[out.length - 1].bottom = top + h; return; }
      out.push({ y: y, top: top, bottom: top + h });
    });
    if (out.length && max - out[out.length - 1].y > 2) out.push({ y: max, top: out[out.length - 1].top, bottom: root.scrollHeight });
    else if (out.length) out[out.length - 1].bottom = root.scrollHeight;
    return out;
  }
  function target(dir){
    var y = window.scrollY, vh = window.innerHeight, s = stops(), cur = s[0], i;
    for (i = 0; i < s.length; i++) if (s[i].y <= y + 2) cur = s[i];
    if (cur && cur.bottom - cur.top > vh * 1.15) {                           // a screen taller than the window scrolls normally inside
      if (dir > 0 && cur.bottom > y + vh + 8) return null;
      if (dir < 0 && cur.top < y - 8) return null;
    }
    if (dir > 0) { for (i = 0; i < s.length; i++) if (s[i].y > y + 2) return s[i].y; }
    else { for (i = s.length - 1; i >= 0; i--) if (s[i].y < y - 2) return s[i].y; }
    return null;
  }
  function go(y){
    cancelAnimationFrame(raf);
    var from = window.scrollY, d = y - from;
    if (Math.abs(d) < 1) return;
    root.classList.add('turning');
    if (still) { window.scrollTo(0, y); root.classList.remove('turning'); settling = true; return; }
    busy = true;
    var t0 = null, MS = Math.min(900, 560 + Math.abs(d) * .22);
    var step = function(t){
      if (t0 == null) t0 = t;
      var x = Math.min(1, (t - t0) / MS);
      window.scrollTo(0, from + d * (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)));     // exponential ease-out
      if (x < 1) raf = requestAnimationFrame(step); else { root.classList.remove('turning'); busy = false; settling = true; }
    };
    raf = requestAnimationFrame(step);
  }
  window.addEventListener('wheel', function(e){
    if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;       // zooming, or scrolling sideways
    var now = performance.now(), gap = now - lastWheel; lastWheel = now;
    if (busy) { e.preventDefault(); return; }
    if (settling) { if (gap < 90) { e.preventDefault(); return; } settling = false; }   // the tail of the push that turned the page
    var dir = e.deltaY > 0 ? 1 : -1, y = target(dir);
    if (y == null) { sum = 0; return; }
    e.preventDefault();
    if (gap > 200 || (sum > 0) !== (dir > 0)) sum = 0;
    sum += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
    if (Math.abs(sum) >= 30) { sum = 0; go(y); }
  }, { passive: false });
  window.addEventListener('keydown', function(e){
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    var el = e.target, tag = el && el.tagName, plain = !tag || tag === 'BODY' || tag === 'HTML';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag || '') || (el && el.isContentEditable)) return;
    var dir = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey && plain) ? 1
            : e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey && plain) ? -1 : 0;
    if (!dir) return;
    if (busy) { e.preventDefault(); return; }
    var y = target(dir); if (y != null) { e.preventDefault(); go(y); }
  });
  // the four game links on the first screen travel the same way
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
    var el = document.getElementById(a.getAttribute('href').slice(1)); if (!el) return;
    e.preventDefault();
    var want = topOf(el), list = stops(), best = null;
    list.forEach(function(st){ if (st.top <= want + 2 && st.bottom > want + 2) best = st; });
    go(best ? best.y : Math.min(Math.max(0, root.scrollHeight - window.innerHeight), Math.round(want)));
  });
})();

var next = $('exNext');
next.hidden = false;
next.addEventListener('click', function(){ now = (now + 1) % EX.length; show(now, true); });
show(0, true);
})();
