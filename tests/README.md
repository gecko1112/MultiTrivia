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
| `reports-api.js` | Reported pictures: friends only, once a day, nothing automatic, the admin's copy, remove and dismiss, account deletion |
| `content-api.js` | The questions themselves: every pack well formed, no question asked twice (no server) |
| `limits-api.js` | Free limits: practice games a day in each game, party games to try, who has them, kept across restarts |
| `paddle-api.js` | The Paddle connection, with simulated Paddle messages |
| `account-api.js` | Profile picture, password change, delete account |
| `security-api.js` | Sign-up limit, logins ending after idle time, the move from db.json to SQLite |
| `run-api.js` | Today's daily games in progress (`x_run`): only ever move forward, cannot be deleted |
| `moreless-api.js` | More/Less dealt and judged on the server: no number before its call, the result can't be uploaded |
| `guessless-api.js` | Guessless dealt and scored on the server: no answer before its estimate, the result can't be uploaded |
| `clueless-api.js` | Clueless picked and judged on the server: ranks only for guesses, hints from the server, no word before the end |
| `survival-api.js` | Survival dealt, timed and judged on the server: no answer before its estimate, late answers count as time's up, results and best runs can't be uploaded |
| `wordy-api.js` | Wordy picked and judged on the server: no word before the end, the results (`x_words`) can't be uploaded |

Results the server decides (all five daily games) can't be uploaded by a browser. A test that needs such a result puts it
in place the way an operator would, with `importStats` or `importData` from `seed.js` and a restart of its server.

`tests/browser/` holds click-through runs in a headless Microsoft Edge (Windows). They are started one at a time,
for example `node tests/browser/v19.js` (add `390 844` for phone size), print what they see and save screenshots to
`tests/.tmp/shots/`. They are checks to read, not pass/fail tests. Recent ones: `v24` German legal pages and the language switch,
`v25` the Ballpark name leading to the landing page, `v26` the landing page turning one screen at a time,
`v27` leaving, reloading and emptying the browser's storage during each of the five daily games.
