// Sets a new password for one account, for when somebody forgot theirs. Run by whoever runs the server.
//
//   1. Stop the server (Ctrl+C in its window).
//   2. node tools/reset-password.js lini              -> makes up a password and prints it
//      node tools/reset-password.js lini "my new pw"  -> uses the one you give (at least 10 characters)
//   3. Start the server again.
//
// The server must be stopped: it keeps all accounts in memory and would write the old password back.
// The account is logged out everywhere. Results, levels and everything else stay as they are.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [, , name, given] = process.argv;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT) || 3000;
const stop = msg => { console.error('\n  ' + msg + '\n'); process.exit(1); };

(async () => {
  if (!name) stop('Usage: node tools/reset-password.js <username> ["new password"]');
  if (!fs.existsSync(DB_FILE)) stop('No database found at ' + DB_FILE);
  try { const r = await fetch('http://127.0.0.1:' + PORT + '/api/health', { signal: AbortSignal.timeout(1500) }); if (r.ok) stop('The server is still running. Stop it first (Ctrl+C in its window), then run this again.'); } catch (e) { /* not running: good */ }

  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')), key = name.toLowerCase(), user = db.users && db.users[key];
  if (!user) stop('No account named "' + name + '". Accounts: ' + Object.keys(db.users || {}).join(', '));

  // made-up passwords: three short words' worth of letters and digits, easy to read out, no look-alike characters
  const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
  const chunk = () => Array.from({ length: 4 }, () => ABC[crypto.randomInt(ABC.length)]).join('');
  const password = given || [chunk(), chunk(), chunk()].join('-');
  if (password.length < 10) stop('The new password needs at least 10 characters.');
  if (password.length > 200) stop('The new password is too long.');

  fs.copyFileSync(DB_FILE, path.join(DATA_DIR, 'db-before-reset-' + key + '.json'));       // one step back, just in case
  user.salt = crypto.randomBytes(16).toString('hex');
  user.hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
  let out = 0; for (const t of Object.keys(db.sessions || {})) if (db.sessions[t] === key) { delete db.sessions[t]; out++; }
  const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE);

  console.log('\n  New password for ' + (user.display || key) + ':  ' + password);
  console.log('  Logged out on ' + out + ' device' + (out === 1 ? '' : 's') + '. Start the server again now.\n');
})();
