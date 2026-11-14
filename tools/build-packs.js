// Builds public/packs-data.js: the extra question packs for Survival practice runs (a Plus feature).
//
//   node tools/build-packs.js
//
// "Countries by size" is made from geo/countries.json, which tools/build-geo.js measures from the Natural Earth
// 1:50m borders (public domain). The areas are therefore map measurements, rounded to three figures: close to the
// official numbers, not identical. Very small countries are left out because the map is too coarse for them.
// To add a hand-written pack, add it to PACKS below in the same shape as the questions in index.html.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'geo', 'countries.json'), 'utf8')).countries;

const round3 = n => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 2)); return Math.round(n / p) * p; };
const THE = /^(United|Republic|Democratic|Central African|Dominican|Czech Republic|Netherlands|Philippines|Bahamas|Gambia|Maldives|Seychelles|Comoros|Vatican)|Islands$/;
const named = n => (THE.test(n) ? 'the ' : '') + n;

const countries = C.filter(c => c.km2 >= 2000).sort((a, b) => a.name.localeCompare(b.name)).map(c => {
  const a = round3(c.km2), parts = c.main && c.main < c.km2 * 0.9;
  return { q: 'How large is ' + named(c.name) + '?', a, u: 'square kilometres',
    n: 'About ' + a.toLocaleString('en-GB') + ' km²' + (parts ? ', counting its islands and overseas parts' : '') + '. Measured from Natural Earth map data.' };
});

const PACKS = {
  countries: { name: 'Countries by size', q: countries }
};
const out = '// Extra question packs for Survival practice runs (Plus). Made by tools/build-packs.js: change that, not this file.\n' +
  'window.BP_PACKS = ' + JSON.stringify(PACKS).replace(/\},\{"q"/g, '},\n{"q"') + ';\n';
fs.writeFileSync(path.join(ROOT, 'public', 'packs-data.js'), out);
console.log(Object.entries(PACKS).map(([k, p]) => k + ': ' + p.q.length + ' questions').join(', '));
