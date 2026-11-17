// The question content itself (no server needed): every Survival pack and the Guessless questions are well formed, and
// no question is asked twice: not inside a pack, not across packs, not in Guessless, and not against Survival's.
const path = require('path'), fs = require('fs');
const project = process.argv[2] || path.join(__dirname, '..');
const PACKS = require(path.join(project, 'content', 'packs.js')), STANDARD = require(path.join(project, 'content', 'survival.js'));
const out = [], ok = (n, c) => out.push([n, !!c]);
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

ok('there are packs', Object.keys(PACKS).length >= 1);
const seen = new Map(STANDARD.map(q => [norm(q.q), 'the standard questions']));
for (const [id, p] of Object.entries(PACKS)) {
  ok(id + ': has a name and a line about where its facts come from', typeof p.name === 'string' && p.name.length > 1 && typeof p.about === 'string' && p.about.length > 10);
  ok(id + ': at least 20 questions', Array.isArray(p.q) && p.q.length >= 20);
  const bad = p.q.filter(x => !(typeof x.q === 'string' && /\?$/.test(x.q) && typeof x.a === 'number' && isFinite(x.a) && x.a > 0 && typeof x.u === 'string' && x.u && typeof x.n === 'string' && x.n.length > 2));
  ok(id + ': every question has a question mark, an answer above zero, a unit and a note' + (bad.length ? ' (not: ' + bad.map(x => x.q).slice(0, 3).join(' | ') + ')' : ''), !bad.length);
  const twice = [];
  for (const x of p.q) { const k = norm(x.q); if (seen.has(k)) twice.push(x.q + ' (also in ' + seen.get(k) + ')'); else seen.set(k, 'pack ' + id); }
  ok(id + ': no question asked twice' + (twice.length ? ' (' + twice.slice(0, 3).join(' | ') + ')' : ''), !twice.length);
}
// the packs made from data must be what tools/build-packs.js makes, not edited by hand
const made = fs.readdirSync(path.join(project, 'content', 'packs')).filter(f => /Made by tools\/build-packs\.js/.test(fs.readFileSync(path.join(project, 'content', 'packs', f), 'utf8')));
ok('the packs made from data say so', made.includes('countries.js') && made.includes('neighbours.js'));
// Guessless (content/guessless.js): five categories, well formed, and none of its questions repeats one from Survival or
// a pack, so a player who plays both does not meet the same question twice (the first list had 41 such repeats).
const GL = require(path.join(project, 'content', 'guessless.js'));
ok('Guessless: five categories, each with at least 50 questions', GL.length === 5 && GL.every(c => c.key && c.name && Array.isArray(c.qs) && c.qs.length >= 50));
const glBad = GL.flatMap(c => c.qs).filter(x => !(typeof x.q === 'string' && /\?$/.test(x.q) && typeof x.a === 'number' && isFinite(x.a) && x.a > 0 && typeof x.u === 'string' && x.u && typeof x.n === 'string' && x.n.length > 3));
ok('Guessless: every question has a question mark, an answer above zero, a unit and a note' + (glBad.length ? ' (not: ' + glBad.map(x => x.q).slice(0, 3).join(' | ') + ')' : ''), !glBad.length);
const glTwice = [];
for (const c of GL) for (const x of c.qs) { const k = norm(x.q); if (seen.has(k)) glTwice.push(x.q + ' (also in ' + seen.get(k) + ')'); else seen.set(k, 'Guessless'); }
ok('Guessless: no question repeats one from Survival, a pack, or Guessless itself' + (glTwice.length ? ' (' + glTwice.slice(0, 3).join(' | ') + ')' : ''), !glTwice.length);
out.forEach(([n, good]) => console.log((good ? 'ok    ' : 'FAIL  ') + n));
process.exitCode = out.every(o => o[1]) ? 0 : 1;
