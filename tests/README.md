# Tests

`node tests/run.js` runs every server test. Each file starts its own server on a spare port with throwaway data in
`tests/.tmp/`, so the real `data/` folder is never touched. `node tests/run.js buy plus` runs only matching files.

| File | What it checks |
|---|---|
| `api.js` | Sign-up, passwords, party lobbies |
| `geo-api.js` | Atlas games |
| `drinks-api.js` | Drinking games and badges |
| `spoiler-api.js` | Friends' details stay hidden until you have played |
| `away-api.js`, `away-all-api.js` | "Left the page" counts |
| `plus-api.js` | Streak rules, head-to-head |
| `buy-api.js` | Plus: test checkout, payment notices, gifts |
| `paddle-api.js` | The Paddle connection, with simulated Paddle messages |
| `account-api.js` | Profile picture, password change, delete account |
| `security-api.js` | Sign-up limit, logins ending after idle time, the move from db.json to SQLite |

`tests/browser/` holds click-through runs in a headless Microsoft Edge (Windows). They are started one at a time,
for example `node tests/browser/v19.js` (add `390 844` for phone size), print what they see and save screenshots to
`tests/.tmp/shots/`. They are checks to read, not pass/fail tests.
