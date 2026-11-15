// Results the server decides (More/Less, Guessless, ...) can no longer be uploaded by a browser: the server ignores that part
// of x_stats. Tests put such results in place the way an operator would, with a file per account in data/import/ and a
// restart of the server, which merges it into the account's x_stats once (runImports in server.js).
//   importStats(dataDir, { anna: { ml: { days: { '2026-11-13': { score: 20 } } } } })   then restart the server
const fs = require('fs'), path = require('path');
exports.importStats = function (dataDir, perUser) {
  const dir = path.join(dataDir, 'import'); fs.mkdirSync(dir, { recursive: true });
  for (const [user, stats] of Object.entries(perUser)) fs.writeFileSync(path.join(dir, user.toLowerCase() + '.json'), JSON.stringify({ stats }));
};
