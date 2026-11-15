// Results the server decides (More/Less, Guessless, Wordy, ...) can no longer be uploaded by a browser: the server
// ignores those parts. Tests put such results in place the way an operator would, with a file per account in
// data/import/ and a restart of the server, which merges it into the account once (runImports in server.js).
//   importStats(dataDir, { anna: { ml: { days: { '2026-11-13': { score: 20 } } } } })        x_stats parts
//   importData(dataDir, { anna: { stats: {...}, words: { days: {...} }, daily: { days: {...} }, late: { '2026-11-11': { wd: 1 } } } })
// then restart the server. Several calls before one restart add up.
const fs = require('fs'), path = require('path');
function importData(dataDir, perUser) {
  const dir = path.join(dataDir, 'import'); fs.mkdirSync(dir, { recursive: true });
  for (const [user, add] of Object.entries(perUser)) {
    const file = path.join(dir, user.toLowerCase() + '.json');
    let cur = {}; try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
    for (const k of ['stats', 'words', 'late', 'daily']) if (add[k]) cur[k] = Object.assign({}, cur[k], add[k]);
    fs.writeFileSync(file, JSON.stringify(cur));
  }
}
exports.importData = importData;
exports.importStats = (dataDir, perUser) => importData(dataDir, Object.fromEntries(Object.entries(perUser).map(([u, stats]) => [u, { stats }])));
