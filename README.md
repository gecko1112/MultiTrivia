# Ballpark: trivia games for your friend group

Games: Survival, More/Less, Guessless, Clueless, Wordy and Lina's Corner (kitty dress-up), with accounts, saved stats and a **Friends** leaderboard.
The server runs on your PC. It's online only while you run it, and all data is in `data/ballpark.sqlite` in this folder.

## 1. Install Node.js (once)

Download the **LTS** version from https://nodejs.org and install it with the default options.
There's nothing else to install: the server has no extra packages.

## 2. Install ngrok (once)

1. Create a free account at https://ngrok.com.
2. Install ngrok. The easiest way is to open PowerShell and run `winget install ngrok.ngrok`, or download it from the ngrok website.
3. Copy your authtoken from the ngrok dashboard (Getting Started → Your Authtoken) and run it once in PowerShell:
   ```
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```

Every free ngrok account gets one fixed **dev domain** (something like `abc123.ngrok-free.dev`).
It stays the same each time you start ngrok, so your friends can bookmark it.
You can see it in the ngrok dashboard under **Gateway → Domains**.

## 3. Start playing

1. Double-click **`start.bat`**. A window opens saying `Ballpark is running: http://localhost:3000`. Keep it open.
2. Double-click **`start-ngrok.bat`**. It shows a `Forwarding https://….ngrok-free.dev` line. That's the link for your friends.
3. Open `http://localhost:3000` yourself and create your account.

To stop, close both windows (or press Ctrl+C in them).

## Hosting it on a real server (works with your PC off)

You need two things first:

- **A server:** any small Ubuntu 24.04 VPS (the cheapest tier is plenty). Add your SSH key when you create it and note its IP address.
- **A domain:** point an `A` record (for example `play.yourdomain.com`) at the server's IP.

Then, in PowerShell from this folder:

```
.\deploy\deploy.ps1 -Server YOUR.SERVER.IP -Setup -Domain play.yourdomain.com -UploadData
```

That installs everything, uploads the game and copies `data/ballpark.sqlite` and the profile pictures over, so everyone keeps their account, password and stats. HTTPS is set up automatically.

| Later on | Command |
|---|---|
| Upload a new version of the game (data on the server is untouched) | `.\deploy\deploy.ps1 -Server YOUR.SERVER.IP` |
| Copy the server's database into `backups\` on this PC | `.\deploy\deploy.ps1 -Server YOUR.SERVER.IP -DownloadData` |

Once the server is live, stop using `start.bat` for real play: the PC copy and the server copy are separate databases and don't sync.

The server also keeps its own daily copies of the database (30 days) in `/var/lib/ballpark/backups`.

## Importing someone's data

Put a file named `<username>.json` in `data/import/` and restart the server. It's merged into that account once and then renamed to `.imported`. It can hold `stats` (More/Less, Guessless, Clueless), `words` (Wordy), `daily` (Survival day results) and `late` (archive marks); results already there win for the same day.

## Bring over your runs from the Claude version

1. In the Claude version, open **Survival → Best runs → Copy my data**.
2. Here, log in, open **Survival → Best runs → Import data from the Claude version**, paste, and click **Import**.

## Message to send your friends

> Ballpark link: https://YOUR-DOMAIN.ngrok-free.dev
> The first time, ngrok shows a warning page. Click "Visit Site" (it's just ngrok checking you're a person).
> Create an account with a username and a password you don't use anywhere else.
> It only works when my PC is on and the game is running.

## Good to know

- **Free ngrok limits:** the free plan has usage limits, such as monthly data transfer. See https://ngrok.com/docs/pricing-limits/free-plan-limits.
  The page is compressed and cached by the browser, so normal play uses little data. Clueless downloads about 1.5 MB the first time someone opens it.
- **ngrok warning page:** free ngrok shows visitors a one-time warning page. After clicking through, it doesn't show again for 7 days.
- **Passwords** are stored hashed (scrypt), never in plain text. Players change their own password under "Account". There is no "forgot password" yet.
- **Backups:** copy `data/ballpark.sqlite` and `data/avatars/` somewhere now and then. That is everyone's accounts, stats and pictures. The server also keeps one copy per day in `data/backups/` (the last 30).
- **Node.js 22.5 or newer** is needed for the database. `node -v` shows your version.
- **Coming from an older version:** the first start moves `data/db.json` into `data/ballpark.sqlite`, checks the copy against the original and keeps the old file as `data/db.json.migrated`.
- **Daily games** use each player's own local date, so friends in the same time zone get the same daily puzzles.
- **Different port:** if port 3000 is taken, edit `start.bat` to run `set PORT=3001` before `node server.js`, and change `3000` in `start-ngrok.bat` to match.

## Ballpark Plus and payments

Who has Plus is decided on the server (`plus-server.js`) and stored with the account.

- **Admin accounts:** one username per line in `data/admins.txt`. Admins can give or take Plus in the developer panel (`?dev=1`) and are the only ones who can use a test checkout.
- **Without Paddle:** admins get a stand-in checkout that charges nothing. Everybody else is told that Plus is not on sale yet.
- **With Paddle:** copy `deploy/paddle.example.json` to `data/paddle.json` and fill it in. No restart needed. The API key and the webhook secret are passwords: they belong in that file only.
  - `"env": "sandbox"` uses Paddle's test environment (fake cards). Only admin accounts can buy.
  - `"env": "live"` takes real money from everybody. Do not set it before the legal pages exist and Paddle has verified the account.
- **In Paddle:** one product with a monthly and a yearly price, and a notification destination `https://<your address>/api/plus/webhook/paddle` with all `subscription` events ticked. The API key needs the permission to write subscriptions (for "Cancel subscription").

### What a free account gets

Counted on the server (`limits-server.js`):

- **Practice:** 3 practice games a day in each game. Continuing a game that is already going is free. Daily games are never limited.
- **Party:** anyone can open or join a lobby. Starting a game in a lobby uses one of the host's 3 free party games, once and for all. A lobby opened by a Plus account has no limit, even after someone else becomes host.

The limits only apply to accounts that could buy Plus right now. Without Paddle that means admin accounts without Plus, which is how you try the limits: switch yourself to Basic in the developer panel. With Paddle `live`, every account without Plus has them.

To change the numbers, change `PRACTICE_PER_DAY` and `PARTY_TRIALS` in `limits-server.js` and `BP_FREE` in `public/site-info.js` together. `tests/limits-api.js` fails if they differ.

### Reported pictures

Players can report a friend's picture from the Friends list ("Manage", the flag next to the name), once a day per account. A report changes nothing by itself. It is printed in the server window and listed for admins in the developer panel (`?dev=1`), with a copy of the picture as it was reported. There you remove the picture or dismiss the report.

## Branches

- `main` is the stable version, the one that gets deployed. It changes only when `dev` has been tried and is merged into it.
- `dev` is where development comes together.
- Each piece of work gets its own branch off `dev` (`feature/...`, `fix/...`, `chore/...`) and comes back through a pull request into `dev`.
- Every pull request and every push to `dev` or `main` runs the server tests on GitHub (`.github/workflows/tests.yml`). The browser checks in `tests/browser` are run by hand.

## Files

| File | What it is |
|---|---|
| `server.js` | The server (accounts, saving, leaderboard, serves the pages) |
| `account-server.js` | Profile picture, password change, data download, delete account |
| `plus-server.js` | Ballpark Plus: who has it, checkout, payment notices |
| `oddball-server.js` | Oddball: questions with many right answers, the rarer your right answer the more points. Rarity is estimated for now (`content/oddball-fame.js`); what players answer is counted for later |
| `hunch-server.js` | Hunch: guess the game character from hints that get more specific, fewer hints are worth more. Characters from Dota 2, World of Warcraft, League of Legends, Overwatch and Valorant, one file per game in `content/hunch/` (rules in `content/hunch.js`); Plus members can switch games off |
| `security.js` | Security headers on every response, a content security policy per page (inline scripts allowed by fingerprint), and refusing changes requested from other sites |
| `party-server.js` | Party lobbies, judged on the server: "Closest guess" and "Bets" (bet 1 to 3 on the guess you think is closest; with drinks on, the stake is sips) |
| `levels-server.js` | Levels, XP and achievements, worked out from the results the server recorded. Only Fermi's four achievements are reported by the browser |
| `reports-server.js` | Reported profile pictures: kept for the admin, nothing happens automatically |
| `limits-server.js` | What a free account may do: practice games a day, party games to try. Counted on the server |
| `moreless-server.js` | More/Less: deals the pairs, judges every call and stores the result. The browser never gets a number before its call |
| `guessless-server.js` | Guessless: deals the five questions, scores every estimate and stores the result. The browser never gets an answer before its estimate |
| `wordy-server.js` | Wordy: picks the word, checks and colours every guess, stores the result. The browser learns the word only at the end |
| `clueless-server.js` | Clueless: picks the hidden word, ranks every guess, gives hints, stores the result. The browser no longer downloads the 2 MB word data |
| `survival-server.js` | Survival: deals the questions, runs the 15-second clock (it never pauses), works out life and score, keeps the day result and the best runs |
| `games-common.js` | What the server-judged daily games share: the day, the archive rule, where results are kept |
| `content/` | Game content only the server reads, never sent to the browser (More/Less cards, Guessless questions, Wordy's word lists, Clueless's words and rankings, Survival's questions and packs) |
| `data/avatars/` | Profile pictures. Back this folder up together with `data/ballpark.sqlite` |
| `public/` | The game pages. `public/de/` holds the German versions of the four legal pages. The daily games' questions and answers are not here: they live in `content/` and stay on the server |
| `store.js` | Reads and writes the database |
| `data/ballpark.sqlite` | Created on first start: accounts and all saved data |
| `tests/` | Automated checks. `node tests/run.js` runs all server tests against throwaway data |
| `start.bat` / `start-ngrok.bat` | Double-click starters |
