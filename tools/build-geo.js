// Builds the geography data the Atlas games use. Run once, the result is kept in ./geo.
//
//   node tools/build-geo.js <ne_50m_admin_0_countries.geojson> <flag-icons/flags/4x3>
//
// Sources (see geo/SOURCES.md): Natural Earth 1:50m countries (public domain), flag-icons (MIT).
// Output: geo/countries.json (names, neighbours, simplified borders) and geo/flags/<id>.svg.
// The geo folder is NOT inside public/: the server hands out single flags and borders during a game,
// so the browser never holds the answers.
const fs = require('fs');
const path = require('path');

const [, , NE, FLAGS] = process.argv;
if (!NE || !FLAGS) { console.error('usage: node tools/build-geo.js <countries.geojson> <flags dir>'); process.exit(1); }
const OUT = path.join(__dirname, '..', 'geo');
const world = JSON.parse(fs.readFileSync(NE, 'utf8'));

// ---- which places count as countries: the 193 UN members plus Vatican, Palestine, Kosovo and Taiwan
const EXTRA = new Set(['USA', 'GBR', 'NZL', 'NLD', 'FRA', 'FIN', 'DNK', 'CHN', 'AUS', 'ISR', 'KOS', 'PSX']);
const MERGE = { SOL: 'SOM', CYN: 'CYP' };            // drawn as part of the country they are internationally counted with
const playable = p => ((p.TYPE === 'Sovereign country' || p.TYPE === 'Sovereignty') && !MERGE[p.ADM0_A3]) || EXTRA.has(p.ADM0_A3);

const NAME = { CHN: 'China', USA: 'United States', COD: 'DR Congo', COG: 'Republic of the Congo', GMB: 'Gambia', BHS: 'Bahamas', FSM: 'Micronesia',
  VAT: 'Vatican City', CZE: 'Czechia', TLS: 'Timor-Leste', CPV: 'Cape Verde', CIV: 'Ivory Coast', SWZ: 'Eswatini', IRL: 'Ireland', PSX: 'Palestine', MKD: 'North Macedonia', GEO: 'Georgia' };
const ALIAS = {
  USA: ['USA', 'US', 'America', 'Amerika', 'Vereinigte Staaten von Amerika'], GBR: ['UK', 'Great Britain', 'Britain', 'England', 'Großbritannien', 'Vereinigtes Königreich'],
  ARE: ['UAE', 'Emirates', 'VAE', 'Emirate'], COD: ['DRC', 'Congo Kinshasa', 'Democratic Republic of Congo', 'Kongo Kinshasa', 'DR Kongo'], COG: ['Congo', 'Congo Brazzaville', 'Kongo', 'Kongo Brazzaville'],
  NLD: ['Holland'], CZE: ['Czech Republic', 'Tschechische Republik'], MMR: ['Burma', 'Birma'], TUR: ['Türkiye', 'Turkiye', 'Türkei'], SWZ: ['Swaziland', 'Swasiland'],
  CIV: ["Cote d'Ivoire", 'Ivory Coast'], MKD: ['Macedonia', 'Mazedonien', 'Nordmazedonien'], BIH: ['Bosnia', 'Bosnien'], VAT: ['Vatican', 'Vatikan', 'Holy See'], KOR: ['Korea', 'Republic of Korea'],
  PRK: ['DPRK'], RUS: ['Russian Federation', 'Russische Föderation'], CHN: ['China', 'PRC'], PSX: ['Palestine', 'Palästina', 'State of Palestine'], TLS: ['East Timor', 'Osttimor'], BLR: ['Weißrussland', 'Weissrussland'],
  CPV: ['Cabo Verde', 'Kap Verde'], KGZ: ['Kirgistan', 'Kirgisistan'], MDA: ['Moldau', 'Moldawien'], LAO: ['Lao'], SYR: ['Syrien'], VNM: ['Viet Nam'], IRN: ['Persia', 'Persien'],
  STP: ['Sao Tome', 'Sao Tome and Principe'], KNA: ['St Kitts'], VCT: ['St Vincent'], LCA: ['St Lucia'], TTO: ['Trinidad'], ATG: ['Antigua'], FSM: ['Mikronesien'], DEU: ['BRD'], DOM: ['Dominican', 'Dom Rep'], CAF: ['CAR', 'Central Africa', 'Zentralafrika'], PNG: ['Papua', 'PNG'], SAU: ['Saudi'], NZL: ['NZ', 'Aotearoa'], ZAF: ['RSA'],
  GNQ: ['Equatorial Guinea'], SLB: ['Solomons'], LKA: ['Ceylon'], BRN: ['Brunei Darussalam'], SSD: ['Südsudan'], SDS: ['Suedsudan'], CHE: ['Schweiz', 'Suisse'], AUT: ['Österreich', 'Oesterreich']
};

// ---- geometry helpers (rings are arrays of [lon, lat])
const bboxOf = ring => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of ring) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; } return [a, b, c, d]; };
function areaKm2(ring) {
  let s = 0, lat = 0; for (let i = 0; i < ring.length - 1; i++) { s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]; lat += ring[i][1]; }
  return Math.abs(s / 2) * Math.cos((lat / Math.max(1, ring.length - 1)) * Math.PI / 180) * 111.32 * 111.32;
}
function simplify(ring, tol) {                       // Douglas-Peucker, never below 4 points
  if (ring.length <= 5) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let worst = 0, at = -1;
    const [x1, y1] = ring[a], [x2, y2] = ring[b], dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = ring[i]; let t = len ? ((x - x1) * dx + (y - y1) * dy) / len : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)); if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol && at > 0) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring.filter((_, i) => i % Math.ceil(ring.length / 4) === 0 || i === ring.length - 1);
}

// ---- 1. collect polygons per country
const byA3 = new Map();
const polysOf = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
for (const f of world.features) {
  const p = f.properties, a3 = MERGE[p.ADM0_A3] || p.ADM0_A3;
  if (!playable(p) && !MERGE[p.ADM0_A3]) continue;
  if (!byA3.has(a3)) byA3.set(a3, { polys: [] });
  const c = byA3.get(a3);
  if (!MERGE[p.ADM0_A3]) c.p = p;
  for (const rings of polysOf(f)) c.polys.push({ rings });
}
// Crimea: Natural Earth draws it with Russia (who controls it). It is internationally recognised as part of Ukraine, so it goes there.
{
  const ru = byA3.get('RUS'), ua = byA3.get('UKR');
  const i = ru.polys.findIndex(q => { const b = bboxOf(q.rings[0]); const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; return cx > 32.5 && cx < 36.7 && cy > 44.3 && cy < 46.3; });
  if (i < 0) throw new Error('Crimea polygon not found'); ua.polys.push(ru.polys.splice(i, 1)[0]);
}

// ---- 2. per country: drop far-away overseas parts, note border points, simplify
const pointOwners = new Map();                       // "lon,lat" -> set of country ids, to find neighbours
const list = [];
for (const [a3, c] of byA3) {
  const p = c.p, id = String(p.ISO_A2_EH).toLowerCase();
  if (!/^[a-z]{2}$/.test(id)) throw new Error('no code for ' + a3);
  for (const q of c.polys) { q.area = areaKm2(q.rings[0]); q.shift = 0; q.box = bboxOf(q.rings[0]); }
  const main = c.polys.reduce((a, b) => (b.area > a.area ? b : a));
  const mc = (main.box[0] + main.box[2]) / 2;
  for (const q of c.polys) {                         // parts on the other side of the date line are moved next to the main part
    const qc = (q.box[0] + q.box[2]) / 2; q.shift = qc - mc > 180 ? -360 : mc - qc > 180 ? 360 : 0;
    q.box = [q.box[0] + q.shift, q.box[1], q.box[2] + q.shift, q.box[3]];
  }
  // everything that belongs to the home area: grown outwards from the main part, 20 degrees at a time
  let home = main.box.slice(); const near = new Set([main]); let grew = true;
  const gap = (a, b) => Math.max(0, a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);
  while (grew) { grew = false; for (const q of c.polys) if (!near.has(q) && q.area > 2000 && gap(q.box, home) < 12) { near.add(q); home = [Math.min(home[0], q.box[0]), Math.min(home[1], q.box[1]), Math.max(home[2], q.box[2]), Math.max(home[3], q.box[3])]; grew = true; } }
  const kept = c.polys.filter(q => near.has(q) || gap(q.box, home) < 12);
  for (const q of kept) for (const ring of q.rings) for (const [x, y] of ring) { const k = x + ',' + y; let s = pointOwners.get(k); if (!s) pointOwners.set(k, s = new Set()); s.add(id); }
  const total = kept.reduce((s, q) => s + q.area, 0);
  const shown = kept.filter(q => q === main || q.area >= total * 0.005).sort((a, b) => b.area - a.area).slice(0, 40);
  const size = Math.sqrt(total / (111.32 * 111.32)), tol = Math.max(0.0004, Math.min(0.06, size * 0.006));
  const polys = shown.map(q => { const r = simplify(q.rings[0], tol); const flat = []; for (const [x, y] of r) flat.push(Math.round((x + q.shift) * 1000), Math.round(y * 1000)); return flat; });
  const names = new Set([p.NAME, p.NAME_LONG, p.NAME_EN, p.NAME_DE, p.NAME_ALT, ...(ALIAS[a3] || [])].filter(Boolean));
  const name = NAME[a3] || p.NAME_EN; names.delete(name);
  let lx = p.LABEL_X, ly = p.LABEL_Y; if (!(lx >= home[0] - 1 && lx <= home[2] + 1)) lx += lx < home[0] ? 360 : -360;
  if (!(lx >= home[0] - 1 && lx <= home[2] + 1 && ly >= home[1] - 1 && ly <= home[3] + 1)) { lx = (main.box[0] + main.box[2]) / 2; ly = (main.box[1] + main.box[3]) / 2; }
  list.push({ id, name, alt: [...names], cont: p.CONTINENT, sub: p.SUBREGION, km2: Math.round(total), main: Math.round(main.area), label: [+lx.toFixed(3), +ly.toFixed(3)], nb: [], polys });
}

// ---- 3. neighbours: two countries that share at least two border points
const shared = new Map();
for (const owners of pointOwners.values()) {
  if (owners.size < 2) continue; const ids = [...owners].sort();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const k = ids[i] + ids[j]; shared.set(k, (shared.get(k) || 0) + 1); }
}
const byId = new Map(list.map(c => [c.id, c]));
for (const [k, n] of shared) { if (n < 2) continue; const a = byId.get(k.slice(0, 2)), b = byId.get(k.slice(2)); a.nb.push(b.id); b.nb.push(a.id); }
// borders too short to show up at this map scale
for (const [x, y] of [['bw', 'zm']]) { if (!byId.get(x).nb.includes(y)) { byId.get(x).nb.push(y); byId.get(y).nb.push(x); } }
for (const c of list) c.nb.sort();
list.sort((a, b) => a.name.localeCompare(b.name));

// ---- 4. flags: copied without the id that names the country
fs.rmSync(path.join(OUT, 'flags'), { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'flags'), { recursive: true });
let flagBytes = 0;
for (const c of list) {
  let svg = fs.readFileSync(path.join(FLAGS, c.id + '.svg'), 'utf8').replace(/\s+id="flag-icons-[a-z-]+"/, '');
  if (/<script|onload=|javascript:/i.test(svg)) throw new Error('unexpected script in flag ' + c.id);
  flagBytes += svg.length; fs.writeFileSync(path.join(OUT, 'flags', c.id + '.svg'), svg);
}
const json = JSON.stringify({ v: 1, built: new Date().toISOString().slice(0, 10), countries: list });
fs.writeFileSync(path.join(OUT, 'countries.json'), json);
fs.writeFileSync(path.join(OUT, 'SOURCES.md'),
`# Where the geography data comes from

- **Borders, names, neighbours:** Natural Earth, 1:50m "Admin 0 - Countries" (naturalearthdata.com). Public domain.
  Changes made here: borders simplified, far-away overseas parts left out, Crimea drawn with Ukraine,
  Somaliland with Somalia and Northern Cyprus with Cyprus. Countries are the 193 UN members plus
  Vatican City, Palestine, Kosovo and Taiwan.
- **Flags:** flag-icons by Panayiotis Lipiridis (github.com/lipis/flag-icons). MIT License, copyright (c) 2013 Panayiotis Lipiridis.

Rebuild with \`node tools/build-geo.js <countries.geojson> <flag-icons/flags/4x3>\`.
`);
const pts = list.reduce((s, c) => s + c.polys.reduce((t, q) => t + q.length / 2, 0), 0);
console.log(list.length + ' countries, ' + pts + ' border points, countries.json ' + Math.round(json.length / 1024) + ' KB, flags ' + Math.round(flagBytes / 1024) + ' KB');
console.log('with neighbours: ' + list.filter(c => c.nb.length).length);
for (const id of ['de', 'fr', 'br', 'ru', 'ua', 'es', 'ma', 'zm', 'bw', 'na', 'zw', 'az', 'tr', 'ao', 'cg', 'ls', 'gb', 'us', 'cn', 'in', 'my', 'om', 'sa', 'il', 'cy', 'dk', 'kr', 'it'])
  console.log(' ' + id + ' (' + byId.get(id).name + ', ' + byId.get(id).polys.length + ' parts): ' + byId.get(id).nb.join(' '));
