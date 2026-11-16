// Survival question packs (a Plus feature, practice only). SERVER ONLY, like content/survival.js.
//
// One file per pack in content/packs/, and the file name is the pack's id:
//   module.exports = { name: 'Animals', order: 20, about: 'where the facts come from', q: [{ q, a, u, n }, ...] }
//     q  the question          a  the answer, a number above zero      u  the unit, shown with the question
//     n  the note shown with the answer: the exact figure, a range, or where it comes from
//     order  where the pack appears in the list (lower first)
// Hand-written packs are edited in their file. The ones made from data say so at the top and are rebuilt with
// tools/build-packs.js. A new pack is a new file: nothing else needs to change (tests/content-api.js checks it).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'packs');
module.exports = Object.fromEntries(fs.readdirSync(dir).filter(f => /^[a-z0-9-]+\.js$/.test(f))
  .map(f => [f.slice(0, -3), require(path.join(dir, f))])
  .sort((a, b) => (a[1].order || 99) - (b[1].order || 99) || a[1].name.localeCompare(b[1].name)));
