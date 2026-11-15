// Shared by the daily games that are dealt and judged on the server (moreless-server.js, guessless-server.js, ...).
//   - the browser's old random numbers, unchanged, so a day's game stays the game it always was
//   - the number formatting the cards and answers use
//   - the day (midnight in one time zone, as in the Atlas) and the archive rule for past days
//   - the place results are kept: the account's x_stats.<game> and the late marks in x_late, the documents every reader
//     of results already uses. server.js keeps those parts out of the browser's reach (SERVER_GAMES).
'use strict';
const TZ = process.env.BP_TZ || 'Europe/Berlin';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const today = () => dayFmt.format(new Date());
const FIRST_DAY = '2026-01-01';

// ---- the browser's random numbers and helpers, unchanged (they lived in public/games.js and public/index.html)
function hashStr(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}return ()=>{h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return (h^=h>>>16)>>>0;};}
function rngFrom(seed){let a=hashStr(seed)();return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function pick(arr,r){return arr[Math.floor(r()*arr.length)];}
function shuffleR(a,r){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function sup(n){const m={"-":"⁻","0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹"};return String(n).split('').map(c=>m[c]).join('');}
function fmt(v){
  if(!isFinite(v)) return "—";
  const a = Math.abs(v);
  if(a>=1e15 || (a<0.001 && a>0)){ const e=Math.floor(Math.log10(a)); const c=v/Math.pow(10,e); return (+c.toPrecision(3))+" × 10"+sup(e); }
  const names=[[1e12,"trillion"],[1e9,"billion"],[1e6,"million"]];
  for(const [d,n] of names) if(a>=d) return (+(v/d).toPrecision(3))+" "+n;
  if(a>=1000) return Math.round(v).toLocaleString('en-US');
  return (+v.toPrecision(4)).toString();
}

// A past day (the Archive, a Plus feature). null for today, the date for an allowed past day, false for anything else.
function pastDay(v, allowed) {
  if (v == null || v === '' || v === today()) return null;
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(v) || isNaN(Date.parse(v + 'T12:00:00Z')) || v > today() || v < FIRST_DAY) return false;
  return allowed ? v : false;
}
// The account's results for one game (x_stats.<game>: { days, best, played }), created when missing.
function resultsOf(docs, game) {
  const st = docs.x_stats = (docs.x_stats && typeof docs.x_stats === 'object') ? docs.x_stats : {};
  const r = st[game] = (st[game] && typeof st[game] === 'object') ? st[game] : {};
  if (!r.days || typeof r.days !== 'object') r.days = {};
  r.best = r.best || 0; r.played = r.played || 0;
  return r;
}
const resultOn = (docs, game, date) => { const st = docs.x_stats, d = st && st[game] && st[game].days; return (d && d[date]) || null; };
// A daily game played later through the archive: marked so it does not count for streaks or head-to-head.
function markLate(docs, game, date) {
  const late = docs.x_late = (docs.x_late && typeof docs.x_late === 'object') ? docs.x_late : {};
  late.days = late.days || {}; late.days[date] = Object.assign({}, late.days[date], { [game]: 1 });
}

module.exports = { today, FIRST_DAY, hashStr, rngFrom, pick, shuffleR, fmt, pastDay, resultsOf, resultOn, markLate };
