// For tests: look into a test server's database, or change it while the server is stopped.
const path = require('path');
// These tests were written when every player saw every other player. They still run that way; the friends rules
// have their own test (friends-api.js), which does not load this file.
if (process.env.BP_FRIENDS == null) process.env.BP_FRIENDS = 'everyone';
exports.readDb = (project, dataDir) => { const st = require(path.join(project, 'store.js'))(dataDir); const db = JSON.parse(JSON.stringify(st.db)); if (st.close) st.close(); return db; };
exports.patchDb = (project, dataDir, change) => { const st = require(path.join(project, 'store.js'))(dataDir); change(st.db); st.save(); if (st.close) st.close(); };
