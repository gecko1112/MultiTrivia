// Who runs Ballpark and what Plus costs. The public pages (pricing, terms, privacy, refunds, legal notice) and the
// Plus window all read from here, so each fact is written down once.
//
// FILL IN BEFORE GOING PUBLIC. Anything left empty shows up on the pages as a red "[... missing]" marker.
window.BP_LEGAL = {
  name: '',          // your full name, or the registered name of your business
  street: '',        // street and house number
  city: '',          // postcode and town
  country: 'Germany',
  countryDe: 'Deutschland',   // the same country, as the German pages show it
  email: '',         // an address people can write to; it is shown publicly
  host: '',          // the company the server is rented from, for example "Hetzner Online GmbH, Germany"
  updated: '2026-11-15'       // year-month-day. Change this whenever one of the legal pages changes
};
// PLACEHOLDER PRICES. They must be the same as the prices set up in Paddle.
window.BP_PRICE = { month: '€2.99', year: '€24.99', yearNote: 'About 30% less than paying monthly' };
// What a free account gets, for the pages. The server counts with PRACTICE_PER_DAY and PARTY_TRIALS in
// limits-server.js; change both together (tests/limits-api.js checks that they match).
window.BP_FREE = { practicePerDay: 3, partyGames: 3 };

// ---- Language. The game is English. Only the four legal pages (terms, privacy, refunds, Impressum) also exist in
// German, under /de/. A reader's choice is kept in the browser (bp_lang); without one, a German browser gets German.
(function(){
'use strict';
var LEGAL = /^\/(terms|privacy|refunds|imprint)$/;
function lang(){
  var v = null; try { v = localStorage.getItem('bp_lang'); } catch (e) {}
  if (v === 'de' || v === 'en') return v;
  return /^de\b/i.test(navigator.language || '') ? 'de' : 'en';
}
var page = document.body && document.body.getAttribute('data-page');

// On the game pages and the landing page: a link to a legal page opens in the reader's language.
if (!page) {
  var point = function(e){
    var a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a) return;
    var m = LEGAL.exec(a.getAttribute('href'));
    if (m && lang() === 'de') a.setAttribute('href', '/de/' + m[1]);
  };
  ['click', 'auxclick', 'contextmenu'].forEach(function(t){ document.addEventListener(t, point, true); });
  return;
}

// ---- the rest only runs on the public pages (they have <body data-page>)
var L = window.BP_LEGAL, P = window.BP_PRICE;
var de = document.documentElement.lang === 'de';
var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
var PAGES = de
  ? [['/pricing', 'Pricing'], ['/de/terms', 'Nutzungsbedingungen'], ['/de/privacy', 'Datenschutz'], ['/de/refunds', 'Erstattung'], ['/de/imprint', 'Impressum']]
  : [['/pricing', 'Pricing'], ['/terms', 'Terms'], ['/privacy', 'Privacy'], ['/refunds', 'Refunds'], ['/imprint', 'Impressum']];
var nav = PAGES.map(function(p){ return '<a href="' + p[0] + '"' + (p[0].split('/').pop() === page ? ' aria-current="page"' : '') + '>' + p[1] + '</a>'; }).join('');
// the switch to the other language, only on pages that have one
var other = !LEGAL.test('/' + page) ? '' : de
  ? '<a class="lang" data-lang="en" lang="en" hreflang="en" href="/' + page + '">English</a>'
  : '<a class="lang" data-lang="de" lang="de" hreflang="de" href="/de/' + page + '">Deutsch</a>';
document.body.insertAdjacentHTML('afterbegin', '<div class="top"><div class="in"><a class="logo" href="/welcome">Ballpark</a><span class="side">' + other + '<a class="play" href="/">' + (de ? 'Spielen' : 'Play') + '</a></span></div></div>');
document.body.insertAdjacentHTML('beforeend', '<footer><nav aria-label="' + (de ? 'Über diese Seite' : 'About this site') + '">' + nav + '</nav></footer>');
var sw = document.querySelector('.lang');
if (sw) sw.addEventListener('click', function(){ try { localStorage.setItem('bp_lang', sw.getAttribute('data-lang')); } catch (e) {} });

var day = function(iso){
  var d = new Date(iso + 'T12:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString(de ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
};
document.querySelectorAll('[data-op]').forEach(function(el){
  var k = el.getAttribute('data-op'), v = L[k];
  if (!v) { el.innerHTML = '<mark>[' + esc(k) + (de ? ' fehlt' : ' missing') + ']</mark>'; return; }
  if (k === 'email') el.innerHTML = '<a href="mailto:' + esc(v) + '">' + esc(v) + '</a>';
  else el.textContent = k === 'updated' ? day(v) : k === 'country' && de && L.countryDe ? L.countryDe : v;
});
document.querySelectorAll('[data-price]').forEach(function(el){ el.textContent = P[el.getAttribute('data-price')] || ''; });
document.querySelectorAll('[data-free]').forEach(function(el){ el.textContent = (window.BP_FREE || {})[el.getAttribute('data-free')]; });
})();
