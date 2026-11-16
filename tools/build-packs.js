// Builds the question packs that are made from data: content/packs/countries.js and content/packs/neighbours.js.
//
//   node tools/build-packs.js
//
// Both come from geo/countries.json, which tools/build-geo.js makes from the Natural Earth 1:50m borders (public
// domain). Hand-written packs (animals.js, sports.js, ...) live next to them in content/packs/ and are edited by hand;
// this tool never touches them.
//
// "Countries by size": areas measured from the map, rounded to three figures. Close to the official numbers, not
// identical. Very small countries are left out because the map is too coarse for them.
// "Neighbours": land borders between the countries of the Atlas map. Like the map, it leaves out far-away overseas
// parts (France has no border with Brazil here) and follows the Atlas's choices of countries (see geo/SOURCES.md).
// Every answer note lists the neighbours by name, so a player can see what was counted.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'content', 'packs');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'geo', 'countries.json'), 'utf8')).countries;
const byId = new Map(C.map(c => [c.id, c]));

const round3 = n => { const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 2)); return Math.round(n / p) * p; };
const THE = /^(United|Republic|Democratic|Central African|Dominican|Czech Republic|Netherlands|Philippines|Bahamas|Gambia|Maldives|Seychelles|Comoros|Vatican)|Islands$/;
const named = n => (THE.test(n) ? 'the ' : '') + n;
const list = names => names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

const countries = C.filter(c => c.km2 >= 2000).sort((a, b) => a.name.localeCompare(b.name)).map(c => {
  const a = round3(c.km2), parts = c.main && c.main < c.km2 * 0.9;
  return { q: 'How large is ' + named(c.name) + '?', a, u: 'square kilometres',
    n: 'About ' + a.toLocaleString('en-GB') + ' km²' + (parts ? ', counting its islands and overseas parts' : '') + '. Measured from Natural Earth map data.' };
});
const neighbours = C.filter(c => c.nb.length).sort((a, b) => a.name.localeCompare(b.name)).map(c => {
  const names = c.nb.map(id => byId.get(id).name).sort();
  return { q: 'How many countries share a land border with ' + named(c.name) + '?', a: names.length, u: 'countries',
    n: names.length + ' on the Atlas map: ' + list(names) + '.' };
});

const PACKS = {
  countries: { name: 'Countries by size', order: 10, about: 'Areas measured from Natural Earth 1:50m map data (public domain).', q: countries },
  neighbours: { name: 'Neighbours', order: 11, about: 'Land borders on the Atlas map, from Natural Earth 1:50m data (public domain).', q: neighbours }
};
fs.mkdirSync(OUT, { recursive: true });
for (const [id, p] of Object.entries(PACKS)) {
  const body = '// Survival question pack "' + p.name + '". SERVER ONLY. Made by tools/build-packs.js: change that, not this file.\n' +
    'module.exports = ' + JSON.stringify(p).replace(/\},\{"q"/g, '},\n{"q"') + ';\n';
  fs.writeFileSync(path.join(OUT, id + '.js'), body);
}
console.log(Object.entries(PACKS).map(([k, p]) => k + ': ' + p.q.length + ' questions').join(', '));
