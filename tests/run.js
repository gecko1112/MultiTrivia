// Runs every server test, one after the other, each against its own throwaway server and database (tests/.tmp).
//   node tests/run.js            all of them
//   node tests/run.js buy plus   only the files whose name contains one of these words
// Nothing here touches data/. The browser runs in tests/browser are started by hand (see tests/README.md).
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter(f => /(^|-)api\.js$/.test(f) && (!only.length || only.some(w => f.includes(w)))).sort();
fs.mkdirSync(path.join(__dirname, '.tmp'), { recursive: true });
let bad = 0, total = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', env: { ...process.env, BP_ADMINS: '', BP_SIGNUPS_PER_HOUR: process.env.BP_SIGNUPS_PER_HOUR || '1000' }, timeout: 180000 });
  const out = (r.stdout || '') + (r.stderr || '');
  // two output styles: one line per check ("ok ..." / "FAIL ..."), or only a summary "PASSED 51, FAILED 0"
  const sum = /PASSED (\d+), FAILED (\d+)/.exec(out);
  const passed = sum ? Number(sum[1]) : (out.match(/^\s*ok\b/gim) || []).length, failed = out.split('\n').filter(l => /^\s*FAIL\s/.test(l));
  const crashed = r.status !== 0 && !failed.length || (sum && Number(sum[2]) > 0 && !failed.length);
  total += passed; bad += failed.length + (crashed ? 1 : 0);
  console.log((failed.length || crashed ? 'FAIL  ' : 'ok    ') + f.padEnd(20) + String(passed).padStart(4) + ' checks' + (failed.length ? ', ' + failed.length + ' failed' : '') + (crashed ? ', stopped with an error' : ''));
  failed.forEach(l => console.log('        ' + l.trim()));
  if (crashed) console.log(out.trim().split('\n').slice(-6).map(l => '        ' + l).join('\n'));
}
console.log('\n' + total + ' checks passed' + (bad ? ', ' + bad + ' problems' : ', no problems') + ' in ' + files.length + ' files');
process.exitCode = bad ? 1 : 0;
