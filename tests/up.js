// Waits until a test server answers on its port (any reply counts) instead of guessing how long starting takes:
// a fixed pause was too short now and then on GitHub's machines.
module.exports = async function up(port, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { await fetch('http://127.0.0.1:' + port + '/api/me'); return; } catch (e) {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('The test server on port ' + port + ' did not start');
};
