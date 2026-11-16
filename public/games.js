// ===================== Shared: routing, stats, rng =====================
(function(){
const TITLES={survival:'Survival',moreless:'More/Less',guessless:'Guessless',clueless:'Clueless'};
if(document.getElementById('g-friends')) TITLES.friends='Friends';
if(document.getElementById('g-lina')) TITLES.lina="Lina's Corner";
if(document.getElementById('g-wordy')) TITLES.wordy='Wordy';
if(document.getElementById('g-howto')) TITLES.howto='How to play';
if(document.getElementById('g-party')) TITLES.party='Party';
if(document.getElementById('g-atlas')) TITLES.atlas='Atlas';
if(document.getElementById('g-drinks')) TITLES.drinks='Drinks';
if(document.getElementById('g-archive')) TITLES.archive='Archive';

function route(){
  let g=(location.hash||'').replace('#','');
  if(!TITLES[g]) g='survival';
  // Survival's clock does not pause on another tab: the server counts from the moment it showed the question.
  document.querySelectorAll('.game').forEach(el=>el.classList.toggle('on',el.id==='g-'+g));
  document.querySelectorAll('#tabs a').forEach(a=>a.classList.toggle('sel',a.dataset.g===g));
  $('gameTitle').textContent=TITLES[g];
  $('bestTop').style.visibility = g==='survival'?'visible':'hidden';
  if(g==='friends' && window.onFriendsTab) window.onFriendsTab();
  if(g==='moreless') mlShowIntro(); if(g==='guessless') glShowIntro(); if(g==='clueless') clShowIntro();
}
window.addEventListener('hashchange',route);
// leaving the page in the middle of a daily game is reported to the server (away.js)
if(window.bpAway){
  const inPlay=(sec,play)=>$(sec).classList.contains('on')&&$(play).style.display!=='none';
  bpAway.watch('ml',()=>ml&&ml.daily&&inPlay('g-moreless','mlPlay'));
  bpAway.watch('gl',()=>gl&&gl.daily&&inPlay('g-guessless','glPlay'));
  bpAway.watch('cl',()=>cl&&cl.daily&&!cl.done&&inPlay('g-clueless','clPlay'));
}

function todayKey(){const d=window.bpNow();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function hashStr(s){let h=1779033703^s.length;for(let i=0;i<s.length;i++){h=Math.imul(h^s.charCodeAt(i),3432918353);h=h<<13|h>>>19;}return ()=>{h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);return (h^=h>>>16)>>>0;};}
function rngFrom(seed){let a=hashStr(seed)();return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function pick(arr,r){return arr[Math.floor(r()*arr.length)];}
function shuffleR(a,r){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// ---- stats: local cache + account doc "x_stats" ----
let stats=loadLocal(); let statsCol=null; let writing=Promise.resolve();
function blank(){return {ml:{days:{},best:0,played:0},gl:{days:{},best:0,played:0},cl:{days:{},solved:0,played:0}};}
function loadLocal(){try{return merge(blank(),JSON.parse(localStorage.getItem('bp_stats')||'{}'));}catch(e){return blank();}}
function merge(a,b){
  const out=blank();
  for(const k of ['ml','gl','cl']){
    const A=(a&&a[k])||{}, B=(b&&b[k])||{};
    out[k].days=Object.assign({},A.days||{},B.days||{});
    for(const f of ['best','played','solved']) if(f in out[k]) out[k][f]=Math.max(A[f]||0,B[f]||0);
  }
  return out;
}
function saveStats(){
  try{localStorage.setItem('bp_stats',JSON.stringify(stats));}catch(e){}
  if(statsCol){ const snapshot=JSON.parse(JSON.stringify(stats)); writing=writing.then(()=>statsCol.doc('x_stats').set(snapshot)).catch(()=>{}); }
}
window.onCloudReady=async function(col){
  statsCol=col;
  try{
    const d=await col.doc('x_stats').get(), srv=d.exists?d.data():{};
    if(d.exists) stats=merge(stats,srv);
    stats.ml=merge(blank(),{ml:srv.ml}).ml;   // More/Less and Guessless results come from the server only
    stats.gl=merge(blank(),{gl:srv.gl}).gl;
    stats.cl=merge(blank(),{cl:srv.cl}).cl;
  }catch(e){}
  saveStats(); refreshIntros();
};
function refreshIntros(){ if($('mlIntro').style.display!=='none') mlStatLine(); if($('glIntro').style.display!=='none') glStatLine(); if($('clIntro').style.display!=='none') clStatLine(); }
async function copyText(btn,txt,label){try{await navigator.clipboard.writeText(txt);btn.textContent='Copied!';}catch(e){btn.textContent='Copy failed';}setTimeout(()=>btn.textContent=label,1500);}
function show(prefix,part){['Intro','Play','End'].forEach(p=>{const el=$(prefix+p); if(el) el.style.display=(p===part)?'':'none';});}

// ===================== MORE / LESS =====================
// Dealt and judged on the server (moreless-server.js). The browser shows the left card with its number and the right
// card without it, sends the call, and gets back whether it was right, the right card's number and the next pair.
// Today's game lives on the server too: it continues from any browser and is never dealt again.
let ml=null;          // the game on screen, as the server last described it
let mlHome=null;      // the menu's state from the server: { date, done, going, practice }
let mlBusy=false;
function dayAvg(days,f,dp){const v=Object.values(days||{}).map(d=>d&&d[f]).filter(x=>typeof x==='number');return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(dp==null?1:dp):'–';}
const mlDayArg=()=>window.bpDay||undefined;      // a past day in the archive, otherwise today (the server knows which day that is)
async function mlPost(act,body){
  const r=await fetch('/api/ml/'+act,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw Object.assign(new Error(j.error||'Something went wrong. Try again.'),{j}); return j;
}
// a free account's practice games left today, on both practice buttons (null: no limit, no tag)
function mlTags(){ if(!window.bpPlus) return; const n=mlHome?mlHome.practiceLeft:null; bpPlus.tag($('mlPractice'),n); bpPlus.tag($('mlAgain'),n); }
async function mlLoadHome(){ try{ const r=await fetch('/api/ml/home'+(window.bpDay?'?day='+window.bpDay:''),{credentials:'same-origin'}); if(r.ok) mlHome=await r.json(); }catch(e){} }
function mlStatLine(){
  const day=(mlHome&&mlHome.date)||todayKey(), t=stats.ml.days[day];
  $('mlStat').innerHTML=statCells([['Today',t?t.score+' / 25':'–'],['Best',stats.ml.best?stats.ml.best+' / 25':'–'],['Average',dayAvg(stats.ml.days,'score')],['Played',stats.ml.played||0]]);
  const done=!!t||!!(mlHome&&mlHome.done), going=!done&&!!(mlHome&&mlHome.going);
  $('mlDaily').textContent=done?"See today's result":going?"Continue today's game":"Play today's game";
  mlTags();
}
// the server's numbers after a finished game: best, games played, and the day's result
function mlTakeStats(s){
  stats.ml.best=s.best; stats.ml.played=s.played; if(s.day&&s.rec) stats.ml.days[s.day]=s.rec;
  try{localStorage.setItem('bp_stats',JSON.stringify(stats));}catch(e){}
}
function mlShow(v){
  if(v.practiceLeft!==undefined){ mlHome=Object.assign({},mlHome,{practiceLeft:v.practiceLeft}); mlTags(); }
  if(v.done){ ml=null; mlEnd(v.rec,v.daily); return; }
  ml=v; show('ml','Play'); mlRender(true);
}
async function mlResume(){                        // a game that was going when the page was left comes back
  await mlLoadHome();
  if(!ml&&mlHome&&(mlHome.going||mlHome.practice)){
    try{ mlShow(await mlPost('start',mlHome.going?{daily:true,day:mlDayArg()}:{daily:false,resume:true})); }catch(e){}
  }
  if($('mlIntro').style.display!=='none') mlStatLine();
}
function mlShowIntro(){ if(ml&&$('mlPlay').style.display!=='none') return; show('ml','Intro'); mlStatLine(); }
async function mlStart(daily){
  if(mlBusy) return; mlBusy=true;
  try{ mlShow(await mlPost('start',{daily,day:daily?mlDayArg():undefined})); }
  catch(e){
    if(window.bpPlus&&bpPlus.limited(e.j)){ mlHome=Object.assign({},mlHome,{practiceLeft:0}); mlTags(); }
    else { $('mlDaily').textContent=e.message; setTimeout(mlStatLine,2500); }
  }
  finally{ mlBusy=false; }
}
function mlCard(item,revealed,cls){
  return `<div class="mlcard ${cls||''}">${item.icon?`<div class="ic">${item.icon}</div>`:''}<div class="nm">${esc(item.name)}</div>${item.sub?`<div class="sb">${esc(item.sub)}</div>`:''}
    ${revealed?`<div class="val mono">${esc(item.show)}</div>`:`<div class="val mono" style="color:var(--muted)">?</div>
    <div class="mlbtns"><button data-c="more">▲ More</button><button class="ghost" data-c="less">▼ Less</button></div>`}</div>`;
}
function mlRender(fresh){
  const v=ml, done=v.res.flat().filter(x=>x).length, total=v.res.flat().length;
  $('mlCat').textContent=`Round ${v.ci+1} of 5: ${v.cat.name}${v.daily?'':' (practice)'}`;
  $('mlScore').textContent=`${done}/${total}`;
  $('mlDots').innerHTML=Array.from({length:25},(_,i)=>{const a=Math.floor(i/5),b=i%5,x=(v.res[a]||[])[b];return `<i class="${x===true?'ok':x===false?'no':(a===v.ci&&b===v.si)?'cur':''}"></i>`;}).join('');
  $('mlQ').textContent=`More or less ${v.cat.label} than the left card?`;
  $('mlSrc').textContent=v.cat.src;
  $('mlBoard').innerHTML=mlCard(v.left,true)+mlCard(v.right,false,fresh?'':'enter')+'<div class="orb mono">OR</div>';
  $('mlBoard').querySelectorAll('[data-c]').forEach(b=>b.addEventListener('click',()=>mlAnswer(b.dataset.c)));
}
async function mlAnswer(choice){
  if(!ml||ml.busy) return; const was=ml; was.busy=true;
  const cards=$('mlBoard').children, right=cards[1], btns=[...right.querySelectorAll('.mlbtns button')];
  btns.forEach(b=>b.disabled=true);
  let v;
  try{ v=await mlPost('answer',{daily:was.daily,day:was.daily?mlDayArg():undefined,i:was.i,choice}); }
  catch(e){ was.busy=false; btns.forEach(b=>b.disabled=false); $('mlQ').textContent=e.message; return; }
  if(ml!==was) return;                            // the player left meanwhile
  const ok=v.last.ok, R=v.last.b;                 // the called card, now with its number
  if(v.stats) mlTakeStats(v.stats);
  right.querySelector('.mlbtns').remove();
  const val=right.querySelector('.val'); val.style.color=ok?'var(--good)':'var(--bad)';
  // count-up
  const t0=performance.now(), dur=700;
  (function step(now){const p=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-p,3), v=R.v*e;
    val.textContent = p<1 ? (R.rating?v.toFixed(1):R.show.startsWith('$')?'$'+fmt(v):fmt(v)) : R.show;
    if(p<1) requestAnimationFrame(step);})(t0);
  right.classList.add(ok?'ok':'no');
  const lbl=document.createElement('div'); lbl.className='lbl'; lbl.textContent=ok?'✓ correct':'✗ wrong'; lbl.style.color=ok?'var(--good)':'var(--bad)'; right.appendChild(lbl);
  $('mlDots').children[was.ci*5+was.si].className=ok?'ok':'no';
  $('mlScore').textContent=`${v.res.flat().filter(x=>x).length}/${v.res.flat().length}`;
  setTimeout(()=>{
    if(ml!==was) return;
    if(v.done){                                   // the server has stored the result: show it, and tell the rest of the page
      ml=null; mlEnd(v.rec,v.daily);
      if(v.daily) mlHome=Object.assign({},mlHome,{done:true,going:false}); else if(mlHome) mlHome.practice=false;
      window.dispatchEvent(new Event('bp-saved')); return;
    }
    if(v.ci!==was.ci){ ml=v; mlRender(true); return; }
    cards[0].classList.add('fadeOut'); right.classList.add('slideL');
    setTimeout(()=>{ if(ml!==was) return; ml=v; mlRender(false); },460);
  },1300);
}
let mlLastRec=null,mlLastDaily=false;
function mlEnd(rec,daily){
  mlLastRec=rec; mlLastDaily=daily; show('ml','End');
  $('mlEndLbl').textContent=daily?"Today's score":'Practice score'; mlTags();
  $('mlFinal').textContent=rec.score;
  $('mlGrid').innerHTML=(rec.grid||[]).map((row,i)=>`<div>${row.map(x=>x?'🟩':'🟥').join('')}<span>${esc((rec.cats||[])[i]||'')}</span></div>`).join('');
  $('mlHist').innerHTML=(rec.log||[]).map(l=>`<div class="hrow"><div><div class="hq">${esc(l.b)} vs ${esc(l.a)}</div><div class="hsub mono">${esc(l.bv)} vs ${esc(l.av)}, you said ${l.ch}</div></div><div class="hd mono" style="color:${l.ok?'var(--good)':'var(--bad)'}">${l.ok?'✓':'✗'}</div></div>`).join('');
}
// Leaving a practice game throws it away, after asking. Leaving today's daily game only puts it aside: it stays where
// it is and "Continue today's game" goes on with it, so nobody gets the same questions a second time.
function armedConfirm(btn,label,fn){ if(!btn.dataset.armed){ btn.dataset.armed='1'; btn.textContent='Leave? Progress is lost'; setTimeout(()=>{delete btn.dataset.armed; btn.textContent=label;},3000); return; } delete btn.dataset.armed; btn.textContent=label; fn(); }
$('mlQuit').addEventListener('click',()=>{
  if(ml&&ml.daily){ ml=null; show('ml','Intro'); mlHome=Object.assign({},mlHome,{going:true}); mlStatLine(); return; }
  armedConfirm($('mlQuit'),'← Menu',()=>{ ml=null; if(mlHome) mlHome.practice=false; mlPost('quit',{daily:false}).catch(()=>{}); show('ml','Intro'); mlStatLine(); });
});
$('glQuit').addEventListener('click',()=>{
  if(gl&&gl.daily){ gl=null; glAfter=null; show('gl','Intro'); glHome=Object.assign({},glHome,{going:true}); glStatLine(); return; }
  armedConfirm($('glQuit'),'← Menu',()=>{ gl=null; glAfter=null; if(glHome) glHome.practice=false; glPost('quit',{daily:false}).catch(()=>{}); show('gl','Intro'); glStatLine(); });
});
$('mlDaily').addEventListener('click',()=>mlStart(true));
$('mlPractice').addEventListener('click',()=>mlStart(false));
$('mlAgain').addEventListener('click',()=>mlStart(false));
$('mlBack').addEventListener('click',()=>{show('ml','Intro');mlStatLine();});
$('mlCopy').addEventListener('click',()=>{const r=mlLastRec;copyText($('mlCopy'),`Ballpark More/Less ${mlLastDaily?todayKey():'(practice)'}: ${r.score}/25\n`+r.grid.map(row=>row.map(x=>x?'🟩':'🟥').join('')).join('\n'),'Copy result');});

// ===================== GUESSLESS =====================
// Dealt and scored on the server (guessless-server.js). The browser shows a question and its unit, reads the number the
// player typed, sends it, and gets back the points, the answer and its note, and the next question. Today's game
// lives on the server too: it continues from any browser and is never dealt again.
let gl=null;          // the game on screen, as the server last described it
let glHome=null;      // the menu's state from the server: { date, done, going, practice }
let glAfter=null;     // the server's reply to the last estimate, waiting behind "Next"
let glBusy=false;
async function glPost(act,body){
  const r=await fetch('/api/gl/'+act,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({})); if(!r.ok) throw Object.assign(new Error(j.error||'Something went wrong. Try again.'),{j}); return j;
}
// a free account's practice games left today, on both practice buttons (null: no limit, no tag)
function glTags(){ if(!window.bpPlus) return; const n=glHome?glHome.practiceLeft:null; bpPlus.tag($('glPractice'),n); bpPlus.tag($('glAgain'),n); }
async function glLoadHome(){ try{ const r=await fetch('/api/gl/home'+(window.bpDay?'?day='+window.bpDay:''),{credentials:'same-origin'}); if(r.ok) glHome=await r.json(); }catch(e){} }
function glStatLine(){
  const day=(glHome&&glHome.date)||todayKey(), t=stats.gl.days[day];
  $('glStat').innerHTML=statCells([['Today',t?t.total+' / 500':'–'],['Best',stats.gl.best?stats.gl.best+' / 500':'–'],['Average',dayAvg(stats.gl.days,'total',0)],['Played',stats.gl.played||0]]);
  const done=!!t||!!(glHome&&glHome.done), going=!done&&!!(glHome&&glHome.going);
  $('glDaily').textContent=done?"See today's result":going?"Continue today's 5":"Play today's 5";
  glTags();
}
function glTakeStats(s){
  stats.gl.best=s.best; stats.gl.played=s.played; if(s.day&&s.rec) stats.gl.days[s.day]=s.rec;
  try{localStorage.setItem('bp_stats',JSON.stringify(stats));}catch(e){}
}
function glShow(v){
  glAfter=null;
  if(v.practiceLeft!==undefined){ glHome=Object.assign({},glHome,{practiceLeft:v.practiceLeft}); glTags(); }
  if(v.done){ gl=null; glEnd(v.rec,v.daily); return; }
  gl=v; show('gl','Play'); glQ();
}
async function glResume(){                        // a game that was going when the page was left comes back
  await glLoadHome();
  if(!gl&&glHome&&(glHome.going||glHome.practice)){
    try{ glShow(await glPost('start',glHome.going?{daily:true,day:window.bpDay||undefined}:{daily:false,resume:true})); }catch(e){}
  }
  if($('glIntro').style.display!=='none') glStatLine();
}
function glShowIntro(){ if(gl&&$('glPlay').style.display!=='none') return; show('gl','Intro'); glStatLine(); }
async function glStart(daily){
  if(glBusy) return; glBusy=true;
  try{ glShow(await glPost('start',{daily,day:daily?window.bpDay||undefined:undefined})); }
  catch(e){
    if(window.bpPlus&&bpPlus.limited(e.j)){ glHome=Object.assign({},glHome,{practiceLeft:0}); glTags(); }
    else { $('glDaily').textContent=e.message; setTimeout(glStatLine,2500); }
  }
  finally{ glBusy=false; }
}
function glQ(){
  const q=gl.q;
  $('glCat').textContent=`Question ${gl.i+1} of 5: ${q.cat}${gl.daily?'':' (practice)'}`;
  $('glTotal').textContent=gl.total+' pts';
  $('glQ').textContent=q.q; $('glUnit').textContent=q.u; $('glInpUnit').textContent=q.u;
  $('glInp').value=''; $('glInp').disabled=false; $('glSub').disabled=false; $('glParsed').textContent='';
  $('glRev').classList.remove('show'); $('glInp').focus();
}
$('glInp').addEventListener('input',()=>{ if(!gl||!gl.q) return; const v=parseNum($('glInp').value);$('glParsed').textContent=$('glInp').value.trim()===''?'':(isFinite(v)&&v>0?'= '+fmt(v)+' '+gl.q.u:'enter a positive number (e.g. 2.5k, 3e6, 40 million)');});
$('glForm').addEventListener('submit',async e=>{
  e.preventDefault(); if(!gl) return; if(glAfter){glNext();return;}
  const g=parseNum($('glInp').value); if(!(isFinite(g)&&g>0)||gl.busy) return;
  const was=gl; was.busy=true; $('glInp').disabled=true; $('glSub').disabled=true;
  let v;
  try{ v=await glPost('answer',{daily:was.daily,day:was.daily?window.bpDay||undefined:undefined,i:was.i,g}); }
  catch(err){ was.busy=false; $('glInp').disabled=false; $('glSub').disabled=false; $('glParsed').textContent=err.message; return; }
  if(gl!==was) return;                            // the player left meanwhile
  if(v.stats) glTakeStats(v.stats);
  glAfter=v; const r=v.last, pts=r.pts, col=pts>=70?'var(--good)':pts>=30?'var(--warn)':'var(--bad)';
  $('glPts').textContent=`+${pts} pts`; $('glPts').style.color=col;
  drawScale(r.g,r.a,$('glScale'));
  $('glAns').textContent=fmt(r.a)+' '+r.u; $('glYg').textContent=fmt(r.g)+' '+r.u; $('glRatio').textContent=ratioText(r.g,r.a); $('glRatio').style.color=col;
  $('glFact').textContent=r.note||''; $('glNext').textContent=v.done?'See score →':'Next →';
  $('glTotal').textContent=v.total+' pts';
  $('glRev').classList.add('show'); setTimeout(()=>$('glNext').focus(),30);
});
function glNext(){
  const v=glAfter; if(!v) return; glAfter=null;
  if(v.done){                                     // the server has stored the result: show it, and tell the rest of the page
    gl=null; glEnd(v.rec,v.daily);
    if(v.daily) glHome=Object.assign({},glHome,{done:true,going:false}); else if(glHome) glHome.practice=false;
    window.dispatchEvent(new Event('bp-saved')); return;
  }
  gl=v; glQ();
}
$('glNext').addEventListener('click',glNext);
let glLast=null,glLastDaily=false;
function glEnd(rec,daily){
  glLast=rec; glLastDaily=daily; show('gl','End');
  $('glEndLbl').textContent=daily?"Today's score":'Practice score'; $('glFinal').textContent=rec.total; glTags();
  $('glHist').innerHTML=(rec.res||[]).map(r=>`<div class="hrow"><div><div class="hq">${esc(r.cat)}: ${esc(r.q)}</div><div class="hsub mono">You said ${esc(fmt(r.g))}, answer ${esc(fmt(r.a))} ${esc(r.u)}</div></div><div class="hd mono" style="color:${r.pts>=70?'var(--good)':r.pts>=30?'var(--warn)':'var(--bad)'}">${r.pts}</div></div>`).join('');
}
$('glDaily').addEventListener('click',()=>glStart(true));
$('glPractice').addEventListener('click',()=>glStart(false));
$('glAgain').addEventListener('click',()=>glStart(false));
$('glBack').addEventListener('click',()=>{show('gl','Intro');glStatLine();});
$('glCopy').addEventListener('click',()=>{const r=glLast;const sq=p=>p>=90?'🟩':p>=70?'🟨':p>=30?'🟧':'🟥';copyText($('glCopy'),`Ballpark Guessless ${glLastDaily?todayKey():'(practice)'}: ${r.total}/500\n`+r.res.map(x=>sq(x.pts)).join(''),'Copy result');});

// ===================== CLUELESS =====================
// Picked and judged on the server (clueless-server.js). The browser sends a word and gets back its rank; hints come
// from the server too, and the hidden word only when the game is over. Nothing big is downloaded any more.
let cl=null;          // the game on screen, as the server last described it
let clHome=null;      // the menu's state from the server: { date, done, going, practice }
let clBusy=false;
async function clPost(act,body){
  const r=await fetch('/api/cl/'+act,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({})); return { ok:r.ok, status:r.status, j };
}
const clDayArg=()=>window.bpDay||undefined;
// a free account's practice games left today, on the practice buttons (null: no limit, no tag)
function clTags(){ if(!window.bpPlus) return; const n=clHome?clHome.practiceLeft:null; bpPlus.tag($('clPractice'),n); bpPlus.tag($('clMore'),n); }
async function clLoadHome(){ try{ const r=await fetch('/api/cl/home'+(window.bpDay?'?day='+window.bpDay:''),{credentials:'same-origin'}); if(r.ok) clHome=await r.json(); }catch(e){} }
function clStatLine(){
  const t=stats.cl.days[(clHome&&clHome.date)||todayKey()];
  const clSolvedIn=Object.values(stats.cl.days||{}).filter(d=>d&&d.solved).map(d=>d.guesses);
  $('clStat').innerHTML=statCells([['Today',t?(t.solved?t.guesses+' guesses':'Gave up'):'–'],['Solved',`${stats.cl.solved||0} of ${stats.cl.played||0}`],['Fewest guesses',clSolvedIn.length?Math.min(...clSolvedIn):'–']]);
  const done=!!t||!!(clHome&&clHome.done), going=!done&&!!(clHome&&clHome.going);
  $('clDaily').textContent=done?"See today's word":going?"Continue today's word":"Play today's word";
  clTags();
}
function clShowIntro(){ if(cl&&$('clPlay').style.display!=='none') return; show('cl','Intro'); clStatLine(); }
function clTakeStats(s){
  stats.cl.played=s.played; stats.cl.solved=s.solved; if(s.day&&s.rec) stats.cl.days[s.day]=s.rec;
  try{localStorage.setItem('bp_stats',JSON.stringify(stats));}catch(e){}
}
function clShow(v){
  if(v.practiceLeft!==undefined) clHome=Object.assign({},clHome,{practiceLeft:v.practiceLeft});
  cl=v; show('cl','Play'); $('clWin').style.display='none'; $('clWin').innerHTML=''; $('clMsg').textContent='';
  $('clLbl').textContent=v.daily?"Today's word":'Random word (practice)';
  clRender();
  if(v.done) clFinish(false); else $('clInp').focus();
}
async function clStart(daily){
  if(clBusy) return; clBusy=true;
  try{
    const r=await clPost('start',{daily,day:daily?clDayArg():undefined});
    if(!r.ok){
      if(window.bpPlus&&bpPlus.limited(r.j)){ clHome=Object.assign({},clHome,{practiceLeft:0}); clTags(); return; }
      $('clStat').textContent=r.j.error||'Something went wrong. Try again.'; return;
    }
    clShow(r.j);
  }catch(e){ $('clStat').textContent='Could not reach the server. Try again.'; }
  finally{ clBusy=false; }
}
async function clResume(){                        // a game that was going when the page was left comes back
  await clLoadHome();
  if(!cl&&clHome&&(clHome.going||clHome.practice)){
    try{ const r=await clPost('start',clHome.going?{daily:true,day:clDayArg()}:{daily:false,resume:true}); if(r.ok&&!r.j.done) clShow(r.j); }catch(e){}
  }
  if($('clIntro').style.display!=='none') clStatLine();
}
function clColor(r){return r<=300?'var(--good)':r<=1500?'var(--warn)':'var(--bad)';}
function clRow(g,isLast){
  const N=cl.size||15000; const pct=Math.max(2,100*(1-Math.log(g.r)/Math.log(N)));
  const n=cl.guesses.indexOf(g)+1;
  return `<div class="clrow${isLast?' last':''}"><div class="fill" style="width:${pct}%;background:${clColor(g.r)}"></div><span class="clw"><b class="clrank" style="color:${clColor(g.r)}">#${g.r}</b> ${esc(g.w)}</span><span class="clnum muted" title="Guess number">guess ${n}</span></div>`;
}
function clRender(){
  $('clCount').textContent=`${cl.guesses.length} ${cl.guesses.length===1?'guess':'guesses'}${cl.hints?`, ${cl.hints} ${cl.hints===1?'hint':'hints'}`:''}`;
  const last=cl.guesses.find(x=>x.w===cl.last);
  $('clLast').innerHTML=last?clRow(last,true):'';
  const sorted=cl.guesses.slice().sort((a,b)=>a.r-b.r);
  $('clList').innerHTML=sorted.length?'<div class="clsep"></div>'+sorted.map(g=>clRow(g,false)).join(''):'';
  $('clHint').disabled=!!cl.done; $('clGive').disabled=!!cl.done; $('clInp').disabled=!!cl.done; $('clSub').disabled=!!cl.done;
}
// the server's reply to a guess, a hint or giving up
function clTake(v){
  const was=cl; cl=Object.assign(v,{last:v.dup||v.last}); if(v.stats) clTakeStats(v.stats);
  clRender();
  if(v.done&&!was.done){ clFinish(true); }
}
$('clForm').addEventListener('submit',async e=>{
  e.preventDefault(); if(!cl||cl.done||cl.busy) return;
  const w=$('clInp').value.trim().toLowerCase(); if(!w) return;
  if(!/^[a-z]+$/.test(w)){ $('clMsg').textContent='Letters only, one word.'; $('clMsg').style.color='var(--warn)'; return; }
  const was=cl; was.busy=true;
  let r; try{ r=await clPost('guess',{daily:was.daily,day:was.daily?clDayArg():undefined,i:was.i,word:w}); }catch(err){ was.busy=false; $('clMsg').textContent='Could not reach the server. Try again.'; return; }
  was.busy=false; if(cl!==was) return;
  if(!r.ok){ $('clMsg').textContent=r.j.error||'Try again.'; $('clMsg').style.color='var(--warn)'; return; }
  $('clMsg').textContent=r.j.dup?`You already guessed "${r.j.dup}".`:''; $('clMsg').style.color='';
  $('clInp').value=''; clTake(r.j);
});
$('clHint').addEventListener('click',async()=>{
  if(!cl||cl.done||cl.busy) return;
  const was=cl; was.busy=true;
  let r; try{ r=await clPost('hint',{daily:was.daily,day:was.daily?clDayArg():undefined,i:was.i}); }catch(err){ was.busy=false; return; }
  was.busy=false; if(cl!==was||!r.ok) return;
  if(r.j.noHint){ $('clMsg').textContent='No more hints. You are very close!'; $('clMsg').style.color=''; }
  else { $('clMsg').textContent=`Hint: "${r.j.hint}"`; $('clMsg').style.color='var(--blue)'; }
  clTake(r.j);
});
$('clGive').addEventListener('click',async()=>{
  if(!cl||cl.done||cl.busy) return;
  if(!$('clGive').dataset.armed){ $('clGive').dataset.armed='1'; $('clGive').textContent='Sure? Click again'; setTimeout(()=>{delete $('clGive').dataset.armed;$('clGive').textContent='Give up';},3000); return; }
  delete $('clGive').dataset.armed; $('clGive').textContent='Give up';
  const was=cl; was.busy=true;
  let r; try{ r=await clPost('giveup',{daily:was.daily,day:was.daily?clDayArg():undefined,i:was.i}); }catch(err){ was.busy=false; return; }
  was.busy=false; if(cl!==was||!r.ok) return;
  clTake(r.j);
});
$('clBackBtn').addEventListener('click',()=>{ show('cl','Intro'); if(cl&&cl.daily&&!cl.done) clHome=Object.assign({},clHome,{going:true}); clStatLine(); });
// the end: the hidden word and the 30 closest words, both from the server. `fresh`: it ended just now.
function clFinish(fresh){
  if(fresh&&cl.daily){ clHome=Object.assign({},clHome,{done:true,going:false}); window.dispatchEvent(new Event('bp-saved')); }
  if(fresh&&!cl.daily&&clHome) clHome.practice=false;
  const won=cl.won, n=cl.guesses.length;
  $('clWin').style.display='';
  $('clWin').innerHTML=`<div class="center"><div class="muted">${won?'You found it!':'The word was'}</div><div class="big" style="color:var(--accent-ink,var(--accent));font-size:44px">${esc(cl.word||'')}</div>
    <div class="muted mono" style="margin-top:6px">${won?`${n} guesses${cl.hints?`, ${cl.hints} hints`:''}`:''}</div>
    <div style="margin-top:12px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button id="clCopy">Copy result</button><button class="ghost" id="clMore">Random word</button></div></div>
    <div class="muted" style="font-size:13px;margin:16px 0 6px">The 30 closest words:</div>
    <div class="mono" style="font-size:13px;line-height:1.7;color:var(--text)">${(cl.closest||[]).map((w,i)=>`<span class="pill">#${i+2} ${esc(w)}</span>`).join(' ')}</div>`;
  $('clCopy').addEventListener('click',()=>copyText($('clCopy'),`Ballpark Clueless ${cl.daily?(cl.day||todayKey()):'(practice)'}: ${won?`solved in ${n} guesses`:'gave up'}`,'Copy result'));
  $('clMore').addEventListener('click',()=>clStart(false)); clTags();
  clRender();
}
$('clDaily').addEventListener('click',()=>clStart(true));
$('clPractice').addEventListener('click',()=>clStart(false));

route();
// only once it is clear whose game this is, and after the server's copy of today's games has been read (run.js)
if(window.claude&&claude.use) claude.use('user').then(()=>{ mlResume(); glResume(); clResume(); refreshIntros(); }).catch(()=>{});
})();
