// Fermi, the Ballpark robot.
//  - Guided tour: flies to each part of the site, greys out the rest and explains it.
//  - Easter egg: now and then he turns up small somewhere on the page. Click him for a remark.
//    Click him too often and he leaves, slightly annoyed, and stays away for a while.
// Self-contained: injects its own styles and elements. Debug hooks: bpBot.tour(), bpBot.egg('perch'|'peek'|'flyby').
(function(){
'use strict';

const NAME = 'Fermi';
const EGG_CHANCE = 0.2;            // chance per tab visit that he shows up
const EGG_MIN_GAP = 2 * 60 * 1000; // at least this long between two appearances
const SULK_TIME = 10 * 60 * 1000;  // how long he stays away after being annoyed
const MAX_POKES = 5;               // the click that makes him leave

const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const curGame = () => (location.hash || '').replace('#', '') || 'survival';

// ---------------------------------------------------------------- what he says
const STEPS = [
  { text: "I'm " + NAME + ", your guide. One minute, then you're free.", next: 'Show me', skip: 'Not now' },
  { sel: '#tabs', text: "The games. Each one shows today's result, so this is also your to-do list." },
  { tab: 'survival', sel: ['#start', '#g-survival'], text: "Survival. Estimate real numbers. Bad guesses cost life." },
  { tab: 'moreless', sel: ['#mlIntro', '#g-moreless'], text: "More or Less. A coin would score about twelve. Beat the coin." },
  { tab: 'guessless', sel: ['#glIntro', '#g-guessless'], text: "Guessless. Five questions, no timer, no excuses." },
  { tab: 'clueless', sel: ['#clIntro', '#g-clueless'], text: "Clueless. Guess the secret word. I tell you how close you are." },
  { tab: 'wordy', sel: ['#g-wordy'], text: "Wordy. Five letters, six tries. Yes, it looks familiar." },
  { tab: 'howto', sel: ['#g-howto'], text: "Every rule, with moving pictures. For when I'm not around." },
  { tab: 'friends', sel: ['#g-friends'], text: "Friends. Everyone's results, side by side. This is the real game." },
  { tab: 'lina', sel: ['#g-lina'], text: "Lina's Corner. A cat you can dress up. Nobody loses here." },
  { sel: '#lvlChip', text: "Your level. It rewards turning up more than talent." },
  { tab: 'survival', side: true, sel: '#side', text: "Press it and this slides out. Your progress, and what your friends scored. Close it when it hurts." },
  { sel: '#bpTourBtn', text: "That's it. I'll be around. Don't poke me.", next: 'Done' }
];

const QUIPS = {
  any: [
    "You found me. There's no prize.",
    "I'm not hiding. I'm supervising.",
    "Clicking me doesn't improve your score. I checked.",
    "I was built to calculate orbits. Now I watch people guess the height of a giraffe.",
    "Careful. I bruise easily. Emotionally.",
    "Yes, I'm real. No, I don't take requests.",
    "By my numbers, you should be playing right now.",
    "This is my break. Apparently it's also yours.",
    "If you want hints, I charge by the letter.",
    "I've read your guess history. I have notes."
  ],
  survival: ["Being wrong by a factor of ten is still called a ballpark. Barely.", "When in doubt, guess bigger. Nobody ever does."],
  moreless: ["Bigger or smaller. People have built whole careers on less."],
  guessless: ["One guess per question. Choose your regrets carefully."],
  clueless: ["The word isn't 'robot'. I already tried."],
  wordy: ["I know today's word. I'm not telling. This is the best part of my day."],
  friends: ["Comparing yourself to others. Very healthy."],
  lina: ["The cat has more outfits than I have updates."]
};
const HIT = ["Ow. I was leaving.", "Good reflexes. Rude, though.", "You've done this before."];
const TOUR_QUIPS =["I'm mid-sentence.", "Hands off the guide.", "Do you poke all your teachers?"];
const WARN = "That's four. I'm counting. It's what I do.";
const TOUR_WARN = "One more and the tour is over.";
const BYE = "Right. I'm leaving. Guess your own numbers.";
const TOUR_BYE = "Fine. Work it out yourself.";
const GRUDGE = "I'm back. We don't talk about last time.";
const BUSY = "Finish your game first. I don't give tours to people on a clock.";

// ---------------------------------------------------------------- styles + elements
const css = `
.bpb{--bpb-ac:var(--accent,#8ee55a);position:fixed;left:0;top:0;z-index:204;width:56px;padding:0;margin:0;border:0;border-radius:0;background:none;cursor:pointer;display:none;
  transform:translate3d(-200px,-200px,0);transition:transform var(--bpb-dur,1s) var(--bpb-ease,cubic-bezier(.45,.05,.2,1));-webkit-tap-highlight-color:transparent}
.bpb.on{display:block}
.bpb.egg{width:34px;opacity:.94}
.bpb:focus-visible{outline:2px solid var(--bpb-ac);outline-offset:4px;border-radius:10px}
.bpb svg{display:block;width:100%;height:auto;overflow:visible}
.bpb-tilt{transition:transform .4s ease}
.bpb.go-r .bpb-tilt{transform:rotate(11deg)} .bpb.go-l .bpb-tilt{transform:rotate(-11deg)} .bpb.peek .bpb-tilt{transform:rotate(-16deg)}
.bpb-bob{animation:bpbBob 2.6s ease-in-out infinite}
@keyframes bpbBob{50%{transform:translateY(-5px)}}
.bpb-rotor{transform-box:fill-box;transform-origin:center;animation:bpbRot .18s linear infinite}
@keyframes bpbRot{50%{transform:scaleX(.25)}}
.bpb-flame{transform-box:fill-box;transform-origin:50% 0;animation:bpbFl .2s ease-in-out infinite alternate}
@keyframes bpbFl{to{transform:scaleY(.55);opacity:.7}}
.bpb-eye{transform-box:fill-box;transform-origin:center;animation:bpbBlink 5.2s infinite}
@keyframes bpbBlink{0%,93%,100%{transform:scaleY(1)}96.5%{transform:scaleY(.1)}}
.bpb-led{animation:bpbLed 1.8s ease-in-out infinite}
@keyframes bpbLed{50%{opacity:.35}}
.bpb-lid{transition:transform .2s,opacity .15s}
.bpb.wow .bpb-lid{opacity:0}
.bpb.annoyed .bpb-lid{transform:translateY(2.6px)}
.bpb-brow,.bpb-flat{opacity:0;transition:opacity .15s}
.bpb.annoyed .bpb-brow,.bpb.annoyed .bpb-flat{opacity:1}
.bpb.annoyed .bpb-smirk{opacity:0}
.bpb-steam circle{opacity:0;transform-box:fill-box;transform-origin:center}
.bpb.annoyed .bpb-steam circle{animation:bpbSteam .9s ease-out infinite}
.bpb.annoyed .bpb-steam circle+circle{animation-delay:.3s}
@keyframes bpbSteam{0%{opacity:.9;transform:translateY(0) scale(.6)}100%{opacity:0;transform:translateY(-14px) scale(1.5)}}
.bpb-fx.spin{animation:bpbSpin .7s cubic-bezier(.3,.7,.3,1)}
@keyframes bpbSpin{to{transform:rotate(360deg)}}
.bpb-fx.flip{animation:bpbFlip .85s ease}
@keyframes bpbFlip{30%{transform:translateY(-22px) rotate(0)}70%{transform:translateY(-22px) rotate(-360deg)}100%{transform:translateY(0) rotate(-360deg)}}
.bpb-fx.jolt{animation:bpbJolt .5s}
@keyframes bpbJolt{20%{transform:translateX(-5px) rotate(-9deg)}40%{transform:translateX(5px) rotate(9deg)}60%{transform:translateX(-3px) rotate(-5deg)}80%{transform:translateX(3px) rotate(5deg)}}
.bpb-fx.huff{animation:bpbHuff .45s 2}
@keyframes bpbHuff{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}

.bpb-block{position:fixed;inset:0;z-index:200;display:none}
.bpb-block.on{display:block}
.bpb-ring{position:fixed;z-index:201;left:50%;top:50%;width:0;height:0;border-radius:16px;pointer-events:none;display:none;
  box-shadow:0 0 0 200vmax rgba(92,97,106,.82);transition:left .45s ease,top .45s ease,width .45s ease,height .45s ease}
.bpb-ring.on{display:block}
.bpb-ring.lit{outline:3px solid var(--accent,#8ee55a);outline-offset:0}

.bpb-bubble,.bpb-mini{position:fixed;left:0;top:0;box-sizing:border-box;background:var(--panel,#161b22);color:var(--text,#e8ecf1);border:2px solid var(--accent,#8ee55a);
  font-family:inherit;line-height:1.45;box-shadow:0 10px 30px rgba(0,0,0,.35);opacity:0;pointer-events:none}
.bpb-bubble{z-index:203;border-radius:14px;padding:14px 16px 12px;font-size:15px;transition:opacity .25s,transform .5s cubic-bezier(.45,.05,.2,1)}
.bpb-bubble.on{opacity:1;pointer-events:auto}
.bpb-bubble::before{content:"";position:absolute;left:34px;top:-8px;width:12px;height:12px;background:inherit;border-left:2px solid var(--accent,#8ee55a);border-top:2px solid var(--accent,#8ee55a);transform:rotate(45deg)}
.bpb-name{display:flex;justify-content:space-between;align-items:baseline;font:700 17px/1.2 var(--head,inherit);letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink,var(--accent,#8ee55a));margin-bottom:6px}
.bpb-name span{font:500 12px var(--body,inherit);color:var(--muted,#8b95a3);letter-spacing:0}
.bpb-ctl{display:flex;gap:8px;align-items:center;margin-top:12px}
.bpb-ctl .sp{flex:1}
.bpb-mini{z-index:205;max-width:230px;border-radius:12px;padding:8px 12px;font-size:13.5px;transition:opacity .2s}
.bpb-mini.on{opacity:1}

@media (prefers-reduced-motion: reduce){
  .bpb-bob,.bpb-rotor,.bpb-flame,.bpb-eye,.bpb-led,.bpb-fx,.bpb.annoyed .bpb-steam circle{animation:none!important}
  .bpb,.bpb-ring,.bpb-bubble{transition:none!important}
}`;

const svg = `<svg viewBox="0 0 64 72" aria-hidden="true" focusable="false">
<g class="bpb-steam" fill="#c9d1db"><circle cx="8" cy="18" r="3"/><circle cx="56" cy="18" r="3"/></g>
<ellipse class="bpb-flame" cx="32" cy="61" rx="3.6" ry="6" fill="#ffb547"/>
<path d="M26 49h12l-2.5 6h-7z" fill="#7d8794" stroke="#1b222c" stroke-width="1.6" stroke-linejoin="round"/>
<line x1="32" y1="9" x2="32" y2="17" stroke="#1b222c" stroke-width="2.4" stroke-linecap="round"/>
<ellipse class="bpb-rotor" cx="32" cy="8" rx="15" ry="2.6" fill="#aeb7c2" stroke="#1b222c" stroke-width="1.4"/>
<line x1="47" y1="20" x2="52" y2="13" stroke="#1b222c" stroke-width="1.8" stroke-linecap="round"/>
<circle class="bpb-led" cx="52.5" cy="12" r="2.6" fill="var(--bpb-ac)" stroke="#1b222c" stroke-width="1.2"/>
<rect x="5" y="31" width="7" height="11" rx="3.5" fill="#aeb7c2" stroke="#1b222c" stroke-width="1.6"/>
<rect x="52" y="31" width="7" height="11" rx="3.5" fill="#aeb7c2" stroke="#1b222c" stroke-width="1.6"/>
<rect x="11" y="17" width="42" height="33" rx="11" fill="#dfe4ea" stroke="#1b222c" stroke-width="2"/>
<rect x="16.5" y="22.5" width="31" height="15" rx="7.5" fill="#10151c"/>
<rect class="bpb-eye" x="23.5" y="26" width="5.5" height="8.5" rx="2.75" fill="var(--bpb-ac)"/>
<rect class="bpb-eye" x="35" y="26" width="5.5" height="8.5" rx="2.75" fill="var(--bpb-ac)"/>
<rect class="bpb-lid" x="21" y="23.5" width="22" height="5.2" fill="#10151c"/>
<path class="bpb-brow" d="M22 24.5l7.5 3M42 24.5l-7.5 3" stroke="var(--bpb-ac)" stroke-width="1.7" stroke-linecap="round" fill="none"/>
<path class="bpb-smirk" d="M27 44h6l3.5-2.2" stroke="#1b222c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
<path class="bpb-flat" d="M27.5 43.5h9" stroke="#1b222c" stroke-width="1.8" stroke-linecap="round" fill="none"/>
</svg>`;

let bot, fxEl, blocker, ring, bubble, bText, bStep, bBack, bNext, bSkip, mini;
let pos = { x: -200, y: -200 };
let ready = false, userId = '';
let tour = null, egg = null, eggTimer = null, miniTimer = null, lastEgg = 0, placeQueued = false;

function build(){
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  bot = document.createElement('button'); bot.type = 'button'; bot.className = 'bpb'; bot.id = 'bpBot';
  bot.setAttribute('aria-label', NAME + ', the tour robot');
  bot.innerHTML = '<div class="bpb-tilt"><div class="bpb-bob"><div class="bpb-fx">' + svg + '</div></div></div>';
  fxEl = bot.querySelector('.bpb-fx');
  blocker = document.createElement('div'); blocker.className = 'bpb-block';
  ring = document.createElement('div'); ring.className = 'bpb-ring';
  bubble = document.createElement('div'); bubble.className = 'bpb-bubble'; bubble.setAttribute('role', 'dialog'); bubble.setAttribute('aria-label', 'Tour');
  bubble.innerHTML = '<div class="bpb-name">' + NAME + '<span></span></div><div class="bpb-text" aria-live="polite"></div>' +
    '<div class="bpb-ctl"><button type="button" class="ghost sm" data-a="skip">Skip</button><span class="sp"></span>' +
    '<button type="button" class="ghost sm" data-a="back">Back</button><button type="button" class="sm" data-a="next">Next</button></div>';
  bText = bubble.querySelector('.bpb-text'); bStep = bubble.querySelector('.bpb-name span');
  bSkip = bubble.querySelector('[data-a=skip]'); bBack = bubble.querySelector('[data-a=back]'); bNext = bubble.querySelector('[data-a=next]');
  mini = document.createElement('div'); mini.className = 'bpb-mini'; mini.setAttribute('aria-live', 'polite');
  document.body.append(blocker, ring, bubble, mini, bot);

  bot.addEventListener('click', e => { e.stopPropagation(); poke(); });
  bSkip.addEventListener('click', () => { if (tour && tour.i === 0) tour.fleeing = true; endTour(); });   // "Not now": he can be hit on his way out
  bBack.addEventListener('click', () => step(-1));
  bNext.addEventListener('click', () => step(1));
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onMove);
  window.addEventListener('scroll', onMove, true);
  window.addEventListener('hashchange', () => { if (tour) return; if (egg && !egg.leaving) eggLeave(); maybeEgg(); });

  const tabs = $('tabs');
  if (tabs) {
    const a = document.createElement('a'); a.href = '#'; a.id = 'bpTourBtn'; a.className = 'bpb-tour'; a.textContent = 'Tour';
    a.title = 'Let ' + NAME + ' show you around';
    a.addEventListener('click', e => { e.preventDefault(); startTour(); });
    tabs.appendChild(a);
  }
}

// ---------------------------------------------------------------- movement
function botSize(){ const w = bot.classList.contains('egg') ? 34 : 56; return { w, h: Math.round(w * 72 / 64) }; }
function jump(x, y){
  pos = { x, y };
  bot.style.setProperty('--bpb-dur', '0s');
  bot.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
  void bot.offsetWidth;
}
function fly(x, y, secs, ease){
  const dx = x - pos.x; pos = { x, y };
  if (RM) secs = 0;
  bot.style.setProperty('--bpb-dur', secs + 's');
  bot.style.setProperty('--bpb-ease', ease || 'cubic-bezier(.45,.05,.2,1)');
  bot.classList.toggle('go-r', dx > 30); bot.classList.toggle('go-l', dx < -30);
  bot.style.transform = 'translate3d(' + Math.round(x) + 'px,' + Math.round(y) + 'px,0)';
  const id = (bot._fly = (bot._fly || 0) + 1);
  return wait(secs * 1000).then(() => { if (bot._fly === id) bot.classList.remove('go-r', 'go-l'); });
}
function fx(name){ fxEl.className = 'bpb-fx'; void fxEl.offsetWidth; fxEl.classList.add(name); }
function wow(){ bot.classList.add('wow'); setTimeout(() => bot.classList.remove('wow'), 700); }

function say(text, ms){
  clearTimeout(miniTimer);
  mini.textContent = text; mini.classList.add('on');
  const s = botSize(), vw = innerWidth, vh = innerHeight, w = mini.offsetWidth, h = mini.offsetHeight;
  let x, y;
  if (tour) { x = pos.x + s.w + 10; y = pos.y + 8; }                                   // beside him, above the tour bubble
  else if (pos.x > vw - s.w - 6) { x = pos.x - w - 10; y = pos.y; }                     // peeking in from the right edge
  else { x = pos.x + s.w / 2 - w / 2; y = pos.y - h - 10; if (y < 8) y = pos.y + s.h + 10; }
  mini.style.transform = 'translate3d(' + Math.round(clamp(x, 8, vw - w - 8)) + 'px,' + Math.round(clamp(y, 8, vh - h - 8)) + 'px,0)';
  miniTimer = setTimeout(hideMini, ms || 3000);
}
function hideMini(){ clearTimeout(miniTimer); mini.classList.remove('on'); }

async function flyOff(fast){
  const x = pos.x > innerWidth / 2 ? innerWidth + 90 : -90;
  await fly(x, pos.y - 140, fast ? 0.6 : 1.3, fast ? 'cubic-bezier(.6,0,.9,.4)' : undefined);
  bot.classList.remove('on', 'egg', 'annoyed', 'peek', 'wow');
  hideMini();
}

// ---------------------------------------------------------------- being poked
function sulkUntil(){ try { return Number(sessionStorage.getItem('bp_bot_sulk')) || 0; } catch (e) { return 0; } }
function startSulk(){ try { sessionStorage.setItem('bp_bot_sulk', String(Date.now() + SULK_TIME)); sessionStorage.setItem('bp_bot_grudge', '1'); } catch (e) {} }
function takeGrudge(){ try { if (sessionStorage.getItem('bp_bot_grudge')) { sessionStorage.removeItem('bp_bot_grudge'); return true; } } catch (e) {} return false; }

// Never repeats a remark until he has used up every one that fits the current page.
function nextQuip(){
  let used = []; try { used = JSON.parse(sessionStorage.getItem('bp_bot_said') || '[]'); } catch (e) {}
  const own = QUIPS[curGame()] || [];
  let fresh = own.filter(q => !used.includes(q));
  if (!fresh.length || Math.random() < 0.5) { const general = QUIPS.any.filter(q => !used.includes(q)); if (general.length) fresh = general; }
  if (!fresh.length) { const last = used[used.length - 1]; used = []; fresh = QUIPS.any.concat(own).filter(q => q !== last); }
  const line = pick(fresh); used.push(line);
  try { sessionStorage.setItem('bp_bot_said', JSON.stringify(used)); } catch (e) {}
  return line;
}

async function poke(){
  const ctx = tour || egg;
  // Sent away with "Not now" and clicked in the second he takes to fly off: a hidden achievement.
  if (tour && tour.ending && tour.fleeing && !tour.hit) {
    tour.hit = true; fx('spin'); wow();
    let n = 0; try { n = Number(sessionStorage.getItem('bp_bot_hit')) || 0; sessionStorage.setItem('bp_bot_hit', String(n + 1)); } catch (e) {}
    say(HIT[n % HIT.length], 1200);
    window.dispatchEvent(new CustomEvent('bp-bot', { detail: 'flick' }));
    return;
  }
  if (!ctx || ctx.leaving || ctx.ending) return;
  if (egg && egg.mode === 'flyby') {                       // stop mid-flight where he is
    const r = bot.getBoundingClientRect(); jump(r.left, r.top); egg.mode = 'hover';
  }
  ctx.clicks = (ctx.clicks || 0) + 1;
  if (ctx.clicks >= MAX_POKES) {
    bot.classList.add('annoyed'); fx('huff'); say(tour ? TOUR_BYE : BYE, 1600);
    startSulk();
    window.dispatchEvent(new CustomEvent('bp-bot', { detail: 'annoy' }));
    if (tour) { tour.ending = true; await wait(1400); tour.ending = false; endTour(true); }
    else { egg.leaving = true; clearTimeout(egg.timer); await wait(1400); await flyOff(true); egg = null; lastEgg = Date.now(); }
    return;
  }
  if (ctx.clicks === MAX_POKES - 1) { bot.classList.add('annoyed'); fx('huff'); say(tour ? TOUR_WARN : WARN, 3200); }
  else {
    fx(pick(['spin', 'flip', 'jolt'])); wow();
    let line;
    if (tour) line = TOUR_QUIPS[(ctx.clicks - 1) % TOUR_QUIPS.length];
    else if (ctx.clicks === 1 && takeGrudge()) line = GRUDGE;
    else line = nextQuip();
    say(line);
    if (egg && ctx.clicks === 1) window.dispatchEvent(new CustomEvent('bp-bot', { detail: 'poke' }));   // found him: counts as an achievement
  }
  if (egg) { clearTimeout(egg.timer); egg.timer = setTimeout(eggLeave, 7000); }
}

// ---------------------------------------------------------------- tour
function visible(el){ if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && el.getClientRects().length > 0; }
function findTarget(sel){
  if (!sel) return null;
  for (const s of [].concat(sel)) { const el = document.querySelector(s); if (visible(el)) return el; }
  return null;
}
function busyGame(){
  const g = $('game'); if (g && g.classList.contains('on')) return true;
  return ['mlPlay', 'glPlay'].some(id => { const el = $(id); return el && el.style.display !== 'none' && visible(el); });
}

async function startTour(){
  if (!ready || tour) return;
  if (busyGame()) { if (!egg) eggAppear({ force: true, mode: 'perch', say: BUSY }); else say(BUSY); return; }
  clearTimeout(eggTimer);
  if (egg) { clearTimeout(egg.timer); egg = null; }
  hideMini();
  tour = { i: 0, home: curGame(), clicks: 0, tk: 0 };
  bot.classList.remove('egg', 'peek', 'annoyed'); bot.classList.add('on');
  jump(innerWidth + 80, 60);
  blocker.classList.add('on'); ring.classList.add('on');
  show(0);
}

async function show(i){
  if (!tour) return;
  const tk = ++tour.tk; tour.i = i;
  const s = STEPS[i];
  if (s.tab && curGame() !== s.tab) { location.hash = s.tab; await wait(90); if (!tour || tour.tk !== tk) return; }
  // one stop opens the side panel; every other stop leaves it as the player had it
  if (window.bpSide) { window.bpSide.peek(s.side ? true : null); if (s.side) { await wait(RM ? 40 : 380); if (!tour || tour.tk !== tk) return; } }
  const el = findTarget(s.sel);
  if (el) { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {} await wait(30); if (!tour || tour.tk !== tk) return; }
  bText.textContent = s.text;
  bStep.textContent = (i + 1) + ' / ' + STEPS.length;
  bSkip.textContent = s.skip || 'Skip'; bSkip.style.visibility = i === STEPS.length - 1 ? 'hidden' : 'visible';
  bBack.style.display = i === 0 ? 'none' : '';
  bNext.textContent = s.next || 'Next';
  bubble.classList.add('on');
  place(false);
  try { bNext.focus({ preventScroll: true }); } catch (e) {}
}
function step(d){
  if (!tour || tour.ending) return;
  const n = tour.i + d;
  if (n >= STEPS.length) { window.dispatchEvent(new CustomEvent('bp-bot', { detail: 'tour' })); return endTour(); }
  if (n >= 0) show(n);
}

function place(quick){
  if (!tour) return;
  const s = STEPS[tour.i], vw = innerWidth, vh = innerHeight, el = findTarget(s.sel);
  let r = null;
  if (el) {
    const b = el.getBoundingClientRect(), p = 8;
    const l = Math.max(6, b.left - p), t = Math.max(6, b.top - p), rr = Math.min(vw - 6, b.right + p), bb = Math.min(vh - 6, b.bottom + p);
    if (rr - l > 10 && bb - t > 10) r = { l, t, r: rr, b: bb, w: rr - l, h: bb - t };
  }
  if (r) { ring.style.left = r.l + 'px'; ring.style.top = r.t + 'px'; ring.style.width = r.w + 'px'; ring.style.height = r.h + 'px'; ring.classList.add('lit'); }
  else { ring.style.left = vw / 2 + 'px'; ring.style.top = vh / 2 + 'px'; ring.style.width = '0px'; ring.style.height = '0px'; ring.classList.remove('lit'); }

  const bw = Math.min(360, vw - 24); bubble.style.width = bw + 'px';
  const bh = bubble.offsetHeight, H = botSize().h, cx = v => clamp(v, 12, vw - bw - 12);
  let bx, by;
  if (!r) { bx = (vw - bw) / 2; by = Math.max(H + 16, (vh - bh) / 2); }
  else if (vw - r.r >= bw + 28) { bx = r.r + 16; by = clamp(r.t + H, H + 12, vh - bh - 12); }            // right of the target
  else if (r.l >= bw + 28) { bx = r.l - bw - 16; by = clamp(r.t + H, H + 12, vh - bh - 12); }            // left of it
  else if (r.b + 12 + H + bh <= vh - 8) { bx = cx(r.l + r.w / 2 - bw / 2); by = r.b + 12 + H; }          // below
  else if (r.t - 12 - bh - H >= 4) { bx = cx(r.l + r.w / 2 - bw / 2); by = r.t - 12 - bh; }              // above
  else { bx = cx(r.l + r.w / 2 - bw / 2); by = vh - bh - 12; }                                           // target fills the screen: sit at the bottom
  bubble.style.transform = 'translate3d(' + Math.round(bx) + 'px,' + Math.round(by) + 'px,0)';
  fly(bx + 12, by - H + 2, quick ? 0.25 : 0.9);
}

async function endTour(annoyed){
  if (!tour || tour.ending) return;
  const t = tour; t.ending = true;
  try { localStorage.setItem('bp_bot_tour_' + userId, '1'); } catch (e) {}
  bubble.classList.remove('on'); blocker.classList.remove('on'); ring.classList.remove('on', 'lit');
  if (window.bpSide) window.bpSide.peek(null);
  if (curGame() !== t.home) location.hash = t.home;
  await flyOff(!!annoyed);
  tour = null; lastEgg = Date.now();
}

function onKey(e){
  if (!tour) return;
  e.stopImmediatePropagation();                 // keep keys away from the games while he's talking
  if (e.key === 'Tab') return;
  if (e.key === 'Escape') { e.preventDefault(); endTour(); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
}
function onMove(){
  if (placeQueued) return; placeQueued = true;
  requestAnimationFrame(() => {
    placeQueued = false;
    if (tour && !tour.ending) place(true);
    else if (egg && egg.anchor && !egg.leaving && egg.mode !== 'flyby') { const a = egg.anchor(); jump(a[0], a[1]); hideMini(); }
  });
}

// ---------------------------------------------------------------- easter egg
function gateOpen(){ const g = $('authGate'); return g && g.style.display !== 'none'; }
function maybeEgg(){
  clearTimeout(eggTimer);
  if (Math.random() > EGG_CHANCE) return;
  eggTimer = setTimeout(() => eggAppear({}), rand(5000, 22000));
}
async function eggAppear(o){
  if (!ready || tour || egg || gateOpen()) return;
  if (!o.force && (document.hidden || Date.now() < sulkUntil() || Date.now() - lastEgg < EGG_MIN_GAP)) return;
  let mode = o.mode || pick(['perch', 'perch', 'peek', 'flyby']);
  const vw = innerWidth, vh = innerHeight;
  bot.classList.remove('annoyed', 'peek'); bot.classList.add('on', 'egg');
  const s = botSize();
  const e = egg = { mode, clicks: 0 };
  let card = null;
  if (mode === 'perch') {
    card = [...document.querySelectorAll('.game.on .card, .game.on .mlcard')].find(c => { const r = c.getBoundingClientRect(); return r.width > 200 && r.top > 70 && r.top < vh - 120; });
    if (!card) mode = e.mode = 'peek';
  }
  if (mode === 'perch') {
    const off = rand(24, 110);
    e.anchor = () => { const r = card.getBoundingClientRect(); return [r.right - off - s.w, r.top - s.h + 3]; };
    const a = e.anchor(); jump(a[0] + rand(-60, 60), -80); await fly(a[0], a[1], 1.8);
  } else if (mode === 'peek') {
    const fy = rand(0.3, 0.7);
    e.anchor = () => [innerWidth - 19, innerHeight * fy];
    const a = e.anchor(); jump(vw + 50, a[1]); bot.classList.add('peek'); await fly(a[0], a[1], 1.4);
  } else {
    const y = rand(70, Math.max(90, vh * 0.4));
    jump(-60, y);
    fly(vw + 60, y + rand(-40, 40), RM ? 0 : 16, 'linear').then(() => { if (egg === e && e.mode === 'flyby') { bot.classList.remove('on', 'egg'); egg = null; lastEgg = Date.now(); } });
  }
  if (egg !== e) return;
  if (o.say) say(o.say, 4200);
  if (e.mode !== 'flyby') e.timer = setTimeout(eggLeave, o.say ? 6000 : rand(22000, 34000));
}
async function eggLeave(){
  const e = egg; if (!e || e.leaving) return;
  e.leaving = true; clearTimeout(e.timer);
  await flyOff(false);
  if (egg === e) egg = null;
  lastEgg = Date.now();
}

// ---------------------------------------------------------------- start
function init(){
  build();
  window.bpBot = { tour: startTour, egg: mode => eggAppear({ force: true, mode }) };
  if (!window.claude || !window.claude.use) return;
  window.claude.use('user').then(u => u.id()).then(id => {
    userId = id || ''; ready = true;
    let seen = false; try { seen = !!localStorage.getItem('bp_bot_tour_' + userId); } catch (e) { seen = true; }
    if (!seen) setTimeout(() => { if (!busyGame()) startTour(); }, 1200);
    else maybeEgg();
  }).catch(() => {});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
