// Who runs Ballpark and what Plus costs. The public pages (pricing, terms, privacy, refunds, legal notice) and the
// Plus window all read from here, so each fact is written down once.
//
// FILL IN BEFORE GOING PUBLIC. Anything left empty shows up on the pages as a red "[... missing]" marker.
window.BP_LEGAL = {
  name: '',          // your full name, or the registered name of your business
  street: '',        // street and house number
  city: '',          // postcode and town
  country: 'Germany',
  email: '',         // an address people can write to; it is shown publicly
  host: '',          // the company the server is rented from, for example "Hetzner Online GmbH, Germany"
  updated: '13 November 2026'   // change this whenever one of the legal pages changes
};
// PLACEHOLDER PRICES. They must be the same as the prices set up in Paddle.
window.BP_PRICE = { month: '€2.99', year: '€24.99', yearNote: 'About 30% less than paying monthly' };

// ---- the rest only runs on the public pages (they have <body data-page>)
(function(){
'use strict';
if (!document.body || !document.body.hasAttribute('data-page')) return;
var L = window.BP_LEGAL, P = window.BP_PRICE;
var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
var PAGES = [['/pricing', 'Pricing'], ['/terms', 'Terms'], ['/privacy', 'Privacy'], ['/refunds', 'Refunds'], ['/imprint', 'Impressum']];
var here = document.body.getAttribute('data-page');
var nav = PAGES.map(function(p){ return '<a href="' + p[0] + '"' + (p[0] === '/' + here ? ' aria-current="page"' : '') + '>' + p[1] + '</a>'; }).join('');
document.body.insertAdjacentHTML('afterbegin', '<div class="top"><div class="in"><a class="logo" href="/">Ballpark</a><a class="play" href="/">Play</a></div></div>');
document.body.insertAdjacentHTML('beforeend', '<footer><nav aria-label="About this site">' + nav + '</nav></footer>');
document.querySelectorAll('[data-op]').forEach(function(el){
  var k = el.getAttribute('data-op'), v = L[k];
  if (!v) { el.innerHTML = '<mark>[' + esc(k) + ' missing]</mark>'; return; }
  if (k === 'email') el.innerHTML = '<a href="mailto:' + esc(v) + '">' + esc(v) + '</a>'; else el.textContent = v;
});
document.querySelectorAll('[data-price]').forEach(function(el){ el.textContent = P[el.getAttribute('data-price')] || ''; });
})();
