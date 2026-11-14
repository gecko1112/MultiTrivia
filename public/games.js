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
let svPausedAt=null;
function route(){
  let g=(location.hash||'').replace('#','');
  if(!TITLES[g]) g='survival';
  try{
    const inQ=$('game').classList.contains('on') && !answered && timeLimit;
    if(g!=='survival' && inQ && svPausedAt===null){ svPausedAt=performance.now(); cancelAnimationFrame(raf); }
    if(g==='survival' && svPausedAt!==null){ tStart+=performance.now()-svPausedAt; svPausedAt=null; if(inQ) raf=requestAnimationFrame(tick); }
  }catch(e){}
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
  try{ const d=await col.doc('x_stats').get(); if(d.exists) stats=merge(stats,d.data()); }catch(e){}
  saveStats(); refreshIntros();
};
function refreshIntros(){ if($('mlIntro').style.display!=='none') mlStatLine(); if($('glIntro').style.display!=='none') glStatLine(); if($('clIntro').style.display!=='none') clStatLine(); }
async function copyText(btn,txt,label){try{await navigator.clipboard.writeText(txt);btn.textContent='Copied!';}catch(e){btn.textContent='Copy failed';}setTimeout(()=>btn.textContent=label,1500);}
function show(prefix,part){['Intro','Play','End'].forEach(p=>{const el=$(prefix+p); if(el) el.style.display=(p===part)?'':'none';});}

// ===================== MORE / LESS =====================
let ml=null;
function mlItemsFor(cat,r){
  if(cat.trivia){
    return {label:'the number', src:'Each card is a different quantity in its own unit. Compare the raw numbers.',
      items:Q.map(q=>({name:q.q.replace(/\?$/,''),sub:'in '+q.u,v:q.a,show:fmt(q.a)+' '+q.u}))};
  }
  const set=pick(cat.sets,r);
  return {name:set.name, label:set.label, src:set.src, rating:!!set.rating, items:set.items.map(([n,s,v,ic])=>({name:n, sub:set.flag?'':s, v,
    icon:set.flag?s:(ic||set.icon||''), rating:!!set.rating,
    show:set.rating?v.toFixed(1)+' / 10':set.money?'$'+fmt(v):fmt(v)+' '+set.unit}))};
}
function mlChain(items,gap,r,diff,near){
  const okPair=(x,p)=>diff?Math.abs(x.v-p.v)>=diff:Math.max(x.v,p.v)/Math.min(x.v,p.v)>=gap;
  let pool=shuffleR(items,r); const chain=[pool.pop()];
  while(chain.length<6 && pool.length){
    const prev=chain[chain.length-1];
    // "near" keeps a pair comparable: at most that many times bigger (for ratings: that many points apart).
    const dist=(x,p)=>diff?Math.abs(x.v-p.v):Math.max(x.v,p.v)/Math.min(x.v,p.v);
    let i=near?pool.findIndex(x=>okPair(x,prev)&&dist(x,prev)<=near):pool.findIndex(x=>okPair(x,prev));
    if(i<0&&near){ let bd=Infinity; pool.forEach((x,j)=>{ if(okPair(x,prev)&&dist(x,prev)<bd){ bd=dist(x,prev); i=j; } }); }   // nothing that close: take the closest
    if(i<0) i=pool.findIndex(x=>x.v!==prev.v);
    if(i<0) break;
    chain.push(pool.splice(i,1)[0]);
  }
  return chain;
}
function mlBuild(seed,daily){
  const r=rngFrom(seed);
  const legacy=daily&&todayKey()<='2026-11-11';   // daily games up to this date keep the pairs their players already saw
  const cats=ML_CATS.map(cat=>{const s=mlItemsFor(cat,r);return {name:s.name||cat.name,label:s.label,src:s.src,chain:mlChain(s.items,cat.gap,r,cat.diff,legacy?0:(cat.diff?1.5:cat.trivia?4:3))};});
  return {daily,seed,cats,ci:0,si:0,res:[[],[],[],[],[]],log:[],busy:false};
}
function dayAvg(days,f,dp){const v=Object.values(days||{}).map(d=>d&&d[f]).filter(x=>typeof x==='number');return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(dp==null?1:dp):'–';}
function mlStatLine(){
  const t=stats.ml.days[todayKey()];
  $('mlStat').innerHTML=statCells([['Today',t?t.score+' / 25':'–'],['Best',stats.ml.best?stats.ml.best+' / 25':'–'],['Average',dayAvg(stats.ml.days,'score')],['Played',stats.ml.played||0]]);
  $('mlDaily').textContent=t?"See today's result":"Play today's game";
}
// ---- a game survives an accidental reload: the questions are rebuilt from the seed, the answers so far are saved ----
function mlSave(next){ try{ localStorage.setItem(window.bpRunKey('bp_ml_run'),JSON.stringify({seed:ml.seed,daily:ml.daily,day:todayKey(),t:Date.now(),ci:next?next[0]:ml.ci,si:next?next[1]:ml.si,res:ml.res,log:ml.log})); }catch(e){} }
function mlClear(){ try{localStorage.removeItem(window.bpRunKey('bp_ml_run'));}catch(e){} }
function mlResume(){
  let s=null; try{s=JSON.parse(localStorage.getItem(window.bpRunKey('bp_ml_run'))||'null');}catch(e){}
  if(!s||ml) return;
  if((s.daily&&(s.day!==todayKey()||stats.ml.days[todayKey()]))||Date.now()-(s.t||0)>12*36e5){ mlClear(); return; }
  ml=mlBuild(s.seed,s.daily); ml.ci=s.ci; ml.si=s.si; ml.res=s.res; ml.log=s.log;
  show('ml','Play'); if(ml.ci>=5) mlFinish(); else mlRender(true);
}
function mlShowIntro(){ if(ml&&$('mlPlay').style.display!=='none') return; show('ml','Intro'); mlStatLine(); }
function mlStart(daily){
  const k=todayKey();
  if(daily && stats.ml.days[k]){ mlEnd(stats.ml.days[k],true); return; }
  ml=mlBuild(daily?'ml-'+k:'mlp-'+Date.now()+Math.random(),daily);
  show('ml','Play'); mlRender(true); mlSave();
}
function mlCard(item,revealed,cls){
  return `<div class="mlcard ${cls||''}">${item.icon?`<div class="ic">${item.icon}</div>`:''}<div class="nm">${esc(item.name)}</div>${item.sub?`<div class="sb">${esc(item.sub)}</div>`:''}
    ${revealed?`<div class="val mono">${esc(item.show)}</div>`:`<div class="val mono" style="color:var(--muted)">?</div>
    <div class="mlbtns"><button data-c="more">▲ More</button><button class="ghost" data-c="less">▼ Less</button></div>`}</div>`;
}
function mlRender(fresh){
  const c=ml.cats[ml.ci], L=c.chain[ml.si], R=c.chain[ml.si+1];
  const done=ml.res.flat().filter(x=>x).length, total=ml.res.flat().length;
  $('mlCat').textContent=`Round ${ml.ci+1} of 5: ${c.name}${ml.daily?'':' (practice)'}`;
  $('mlScore').textContent=`${done}/${total}`;
  $('mlDots').innerHTML=Array.from({length:25},(_,i)=>{const a=Math.floor(i/5),b=i%5,v=ml.res[a][b];return `<i class="${v===true?'ok':v===false?'no':(a===ml.ci&&b===ml.si)?'cur':''}"></i>`;}).join('');
  $('mlQ').textContent=`More or less ${c.label} than the left card?`;
  $('mlSrc').textContent=c.src;
  $('mlBoard').innerHTML=mlCard(L,true)+mlCard(R,false,fresh?'':'enter')+'<div class="orb mono">OR</div>';
  $('mlBoard').querySelectorAll('[data-c]').forEach(b=>b.addEventListener('click',()=>mlAnswer(b.dataset.c)));
}
function mlAnswer(choice){
  if(ml.busy) return; ml.busy=true;
  const c=ml.cats[ml.ci], L=c.chain[ml.si], R=c.chain[ml.si+1];
  const ok=(choice==='more')===(R.v>L.v);
  ml.res[ml.ci][ml.si]=ok;
  ml.log.push({cat:c.name,a:L,b:R,choice,ok});
  mlSave((ml.si>=4||ml.si+2>=c.chain.length)?[ml.ci+1,0]:[ml.ci,ml.si+1]);
  const cards=$('mlBoard').children; const right=cards[1];
  right.querySelector('.mlbtns').remove();
  const val=right.querySelector('.val'); val.style.color=ok?'var(--good)':'var(--bad)';
  // count-up
  const t0=performance.now(), dur=700;
  (function step(now){const p=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-p,3), v=R.v*e;
    val.textContent = p<1 ? (R.rating?v.toFixed(1):R.show.startsWith('$')?'$'+fmt(v):fmt(v)) : R.show;
    if(p<1) requestAnimationFrame(step);})(t0);
  right.classList.add(ok?'ok':'no');
  const lbl=document.createElement('div'); lbl.className='lbl'; lbl.textContent=ok?'✓ correct':'✗ wrong'; lbl.style.color=ok?'var(--good)':'var(--bad)'; right.appendChild(lbl);
  $('mlDots').children[ml.ci*5+ml.si].className=ok?'ok':'no';
  $('mlScore').textContent=`${ml.res.flat().filter(x=>x).length}/${ml.res.flat().length}`;
  setTimeout(()=>{
    const lastInCat = ml.si>=4 || ml.si+2>=c.chain.length;
    if(lastInCat){
      ml.ci++; ml.si=0; ml.busy=false;
      if(ml.ci>=5) return mlFinish();
      mlRender(true); return;
    }
    cards[0].classList.add('fadeOut'); right.classList.add('slideL');
    setTimeout(()=>{ ml.si++; ml.busy=false; mlRender(false); },460);
  },1300);
}
function mlFinish(){
  const score=ml.res.flat().filter(x=>x).length;
  const rec={score,grid:ml.res.map(r=>r.map(x=>x?1:0)),cats:ml.cats.map(c=>c.name),log:ml.log.map(l=>({c:l.cat,a:l.a.name,av:l.a.show,b:l.b.name,bv:l.b.show,ch:l.choice,ok:l.ok}))};
  stats.ml.played++; stats.ml.best=Math.max(stats.ml.best,score);
  if(ml.daily) stats.ml.days[todayKey()]=rec;
  saveStats(); mlEnd(rec,ml.daily); ml=null; mlClear();
}
let mlLastRec=null,mlLastDaily=false;
function mlEnd(rec,daily){
  mlLastRec=rec; mlLastDaily=daily; show('ml','End');
  $('mlEndLbl').textContent=daily?"Today's score":'Practice score';
  $('mlFinal').textContent=rec.score;
  $('mlGrid').innerHTML=rec.grid.map((row,i)=>`<div>${row.map(x=>x?'🟩':'🟥').join('')}<span>${esc(rec.cats[i])}</span></div>`).join('');
  $('mlHist').innerHTML=(rec.log||[]).map(l=>`<div class="hrow"><div><div class="hq">${esc(l.b)} vs ${esc(l.a)}</div><div class="hsub mono">${esc(l.bv)} vs ${esc(l.av)}, you said ${l.ch}</div></div><div class="hd mono" style="color:${l.ok?'var(--good)':'var(--bad)'}">${l.ok?'✓':'✗'}</div></div>`).join('');
}
function armedConfirm(btn,label,fn){ if(!btn.dataset.armed){ btn.dataset.armed='1'; btn.textContent='Leave? Progress is lost'; setTimeout(()=>{delete btn.dataset.armed; btn.textContent=label;},3000); return; } delete btn.dataset.armed; btn.textContent=label; fn(); }
$('mlQuit').addEventListener('click',()=>armedConfirm($('mlQuit'),'← Menu',()=>{ ml=null; mlClear(); show('ml','Intro'); mlStatLine(); }));
$('glQuit').addEventListener('click',()=>armedConfirm($('glQuit'),'← Menu',()=>{ gl=null; glClear(); show('gl','Intro'); glStatLine(); }));
$('mlDaily').addEventListener('click',()=>mlStart(true));
$('mlPractice').addEventListener('click',()=>mlStart(false));
$('mlAgain').addEventListener('click',()=>mlStart(false));
$('mlBack').addEventListener('click',()=>{show('ml','Intro');mlStatLine();});
$('mlCopy').addEventListener('click',()=>{const r=mlLastRec;copyText($('mlCopy'),`Ballpark More/Less ${mlLastDaily?todayKey():'(practice)'}: ${r.score}/25\n`+r.grid.map(row=>row.map(x=>x?'🟩':'🟥').join('')).join('\n'),'Copy result');});

// ===================== GUESSLESS =====================
let gl=null;
function glStatLine(){
  const t=stats.gl.days[todayKey()];
  $('glStat').innerHTML=statCells([['Today',t?t.total+' / 500':'–'],['Best',stats.gl.best?stats.gl.best+' / 500':'–'],['Average',dayAvg(stats.gl.days,'total',0)],['Played',stats.gl.played||0]]);
  $('glDaily').textContent=t?"See today's result":"Play today's 5";
}
function glSave(){ try{ localStorage.setItem(window.bpRunKey('bp_gl_run'),JSON.stringify({day:todayKey(),t:Date.now(),gl})); }catch(e){} }
function glClear(){ try{localStorage.removeItem(window.bpRunKey('bp_gl_run'));}catch(e){} }
function glResume(){
  let s=null; try{s=JSON.parse(localStorage.getItem(window.bpRunKey('bp_gl_run'))||'null');}catch(e){}
  if(!s||!s.gl||!Array.isArray(s.gl.qs)||gl) return;
  if((s.gl.daily&&(s.day!==todayKey()||stats.gl.days[todayKey()]))||Date.now()-(s.t||0)>12*36e5){ glClear(); return; }
  gl=s.gl; show('gl','Play');
  if(gl.answered){ if(gl.i<4){ gl.i++; glQ(); } else glFinish(); } else glQ();   // reloaded while looking at an answer: go on
}
function glShowIntro(){ if(gl&&$('glPlay').style.display!=='none') return; show('gl','Intro'); glStatLine(); }
function glStart(daily){
  const k=todayKey();
  if(daily && stats.gl.days[k]){ glEnd(stats.gl.days[k],true); return; }
  const r=rngFrom(daily?'gl-'+k:'glp-'+Date.now()+Math.random());
  gl={daily,qs:GL_CATS.map(c=>({cat:c.name,...pick(c.qs,r)})),i:0,res:[],answered:false};
  show('gl','Play'); glQ();
}
function glQ(){
  const q=gl.qs[gl.i]; gl.answered=false;
  $('glCat').textContent=`Question ${gl.i+1} of 5: ${q.cat}${gl.daily?'':' (practice)'}`;
  $('glTotal').textContent=gl.res.reduce((s,x)=>s+x.pts,0)+' pts';
  $('glQ').textContent=q.q; $('glUnit').textContent=q.u; $('glInpUnit').textContent=q.u;
  $('glInp').value=''; $('glInp').disabled=false; $('glSub').disabled=false; $('glParsed').textContent='';
  $('glRev').classList.remove('show'); $('glInp').focus();
  glSave();
}
$('glInp').addEventListener('input',()=>{const v=parseNum($('glInp').value);$('glParsed').textContent=$('glInp').value.trim()===''?'':(isFinite(v)&&v>0?'= '+fmt(v)+' '+gl.qs[gl.i].u:'enter a positive number (e.g. 2.5k, 3e6, 40 million)');});
$('glForm').addEventListener('submit',e=>{
  e.preventDefault(); if(gl.answered){glNext();return;}
  const g=parseNum($('glInp').value); if(!(isFinite(g)&&g>0)) return;
  const q=gl.qs[gl.i]; gl.answered=true;
  const err=Math.abs(Math.log10(g/q.a)); const pts=Math.round(100*Math.max(0,1-err));
  gl.res.push({q:q.q,u:q.u,a:q.a,g,pts,cat:q.cat}); glSave();
  $('glInp').disabled=true; $('glSub').disabled=true;
  $('glPts').textContent=`+${pts} pts`; $('glPts').style.color=pts>=70?'var(--good)':pts>=30?'var(--warn)':'var(--bad)';
  drawScale(g,q.a,$('glScale'));
  $('glAns').textContent=fmt(q.a)+' '+q.u; $('glYg').textContent=fmt(g)+' '+q.u; $('glRatio').textContent=ratioText(g,q.a); $('glRatio').style.color=pts>=70?'var(--good)':pts>=30?'var(--warn)':'var(--bad)';
  $('glFact').textContent=q.n; $('glNext').textContent=gl.i<4?'Next →':'See score →';
  $('glTotal').textContent=gl.res.reduce((s,x)=>s+x.pts,0)+' pts';
  $('glRev').classList.add('show'); setTimeout(()=>$('glNext').focus(),30);
});
function glNext(){ if(gl.i<4){gl.i++;glQ();} else glFinish(); }
$('glNext').addEventListener('click',glNext);
function glFinish(){
  const total=gl.res.reduce((s,x)=>s+x.pts,0);
  const rec={total,res:gl.res};
  stats.gl.played++; stats.gl.best=Math.max(stats.gl.best,total);
  if(gl.daily) stats.gl.days[todayKey()]=rec;
  saveStats(); glEnd(rec,gl.daily); gl=null; glClear();
}
let glLast=null,glLastDaily=false;
function glEnd(rec,daily){
  glLast=rec; glLastDaily=daily; show('gl','End');
  $('glEndLbl').textContent=daily?"Today's score":'Practice score'; $('glFinal').textContent=rec.total;
  $('glHist').innerHTML=rec.res.map(r=>`<div class="hrow"><div><div class="hq">${esc(r.cat)}: ${esc(r.q)}</div><div class="hsub mono">You said ${esc(fmt(r.g))}, answer ${esc(fmt(r.a))} ${esc(r.u)}</div></div><div class="hd mono" style="color:${r.pts>=70?'var(--good)':r.pts>=30?'var(--warn)':'var(--bad)'}">${r.pts}</div></div>`).join('');
}
$('glDaily').addEventListener('click',()=>glStart(true));
$('glPractice').addEventListener('click',()=>glStart(false));
$('glAgain').addEventListener('click',()=>glStart(false));
$('glBack').addEventListener('click',()=>{show('gl','Intro');glStatLine();});
$('glCopy').addEventListener('click',()=>{const r=glLast;const sq=p=>p>=90?'🟩':p>=70?'🟨':p>=30?'🟧':'🟥';copyText($('glCopy'),`Ballpark Guessless ${glLastDaily?todayKey():'(practice)'}: ${r.total}/500\n`+r.res.map(x=>sq(x.pts)).join(''),'Copy result');});

// ===================== CLUELESS =====================
let CL=null, cl=null, clLoading=null;
function clLoad(){
  if(CL) return Promise.resolve(CL);
  if(window.CLUELESS&&window.CLUELESS.words){ const D=window.CLUELESS; D.index=new Map(D.words.map((w,i)=>[w,i])); CL=D; return Promise.resolve(D); }
  if(clLoading) return clLoading;
  clLoading=new Promise((res,rej)=>{
    const s=document.createElement('script'); s.src='clueless-data.js';
    s.onload=()=>{ const D=window.CLUELESS; D.index=new Map(D.words.map((w,i)=>[w,i])); CL=D; res(D); };
    s.onerror=()=>{clLoading=null;rej();}; document.head.appendChild(s);
  });
  return clLoading;
}
function clRanks(t){ const b=atob(CL.ranks[t]); const u=new Uint8Array(b.length); for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i); return new Uint16Array(u.buffer); }
function dayNum(){ const d=window.bpNow(); return Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(2026,0,1))/864e5); }
function clDailyTarget(){ const order=shuffleR(CL.targets,rngFrom('clueless-order-v1')); return order[((dayNum()%order.length)+order.length)%order.length]; }
function clStatLine(){
  const t=stats.cl.days[todayKey()];
  const clSolvedIn=Object.values(stats.cl.days||{}).filter(d=>d&&d.solved).map(d=>d.guesses);
  $('clStat').innerHTML=statCells([['Today',t?(t.solved?t.guesses+' guesses':'Gave up'):'–'],['Solved',`${stats.cl.solved||0} of ${stats.cl.played||0}`],['Fewest guesses',clSolvedIn.length?Math.min(...clSolvedIn):'–']]);
  $('clDaily').textContent=t?"See today's word":"Play today's word";
}
function clShowIntro(){ if(cl&&$('clPlay').style.display!=='none') return; show('cl','Intro'); clStatLine(); }
function clSaveProgress(){ if(cl&&cl.daily) try{localStorage.setItem('bp_cl_'+todayKey(),JSON.stringify({t:cl.target,g:cl.guesses.map(x=>x.w),h:cl.hints,done:cl.done}));}catch(e){} }
async function clStart(daily){
  $('clMsg').textContent=''; const btn=daily?$('clDaily'):$('clPractice'); const old=btn.textContent; btn.textContent='Loading words…';
  try{ await clLoad(); }catch(e){ btn.textContent=old; $('clStat').textContent='Could not load the word list.'; return; }
  btn.textContent=old;
  let target, saved=null;
  if(daily){ target=clDailyTarget(); try{saved=JSON.parse(localStorage.getItem('bp_cl_'+todayKey())||'null');}catch(e){} if(saved&&saved.t!==target) saved=null; }
  else { const others=CL.targets.filter(t=>t!==clDailyTarget()); target=others[Math.floor(Math.random()*others.length)]; }
  const ranks=clRanks(target);
  cl={daily,target,ranks,guesses:[],hints:0,done:false,last:null};
  show('cl','Play'); $('clWin').style.display='none'; $('clWin').innerHTML='';
  $('clLbl').textContent=daily?"Today's word":'Random word (practice)';
  const prior=stats.cl.days[todayKey()];
  if(saved){ saved.g.forEach(w=>clAdd(w,true)); cl.hints=saved.h||0; if(saved.done) clFinish(saved.done==='won',true); }
  else if(daily && prior){ clFinish(prior.solved,true); }
  clRender(); if(!cl.done) $('clInp').focus();
}
function clAdd(w,silent){
  const i=CL.index.get(w); if(i===undefined) return 'unknown';
  if(cl.guesses.some(x=>x.w===w)){ cl.last=w; return 'dup'; }
  const r=cl.ranks[i]; cl.guesses.push({w,r}); cl.last=w; return r;
}
function clColor(r){return r<=300?'var(--good)':r<=1500?'var(--warn)':'var(--bad)';}
function clRow(g,isLast){
  const N=CL.words.length; const pct=Math.max(2,100*(1-Math.log(g.r)/Math.log(N)));
  const n=cl.guesses.indexOf(g)+1;
  return `<div class="clrow${isLast?' last':''}"><div class="fill" style="width:${pct}%;background:${clColor(g.r)}"></div><span class="clw"><b class="clrank" style="color:${clColor(g.r)}">#${g.r}</b> ${esc(g.w)}</span><span class="clnum muted" title="Guess number">guess ${n}</span></div>`;
}
function clRender(){
  $('clCount').textContent=`${cl.guesses.length} ${cl.guesses.length===1?'guess':'guesses'}${cl.hints?`, ${cl.hints} ${cl.hints===1?'hint':'hints'}`:''}`;
  const last=cl.guesses.find(x=>x.w===cl.last);
  $('clLast').innerHTML=last?clRow(last,true):'';
  const sorted=cl.guesses.slice().sort((a,b)=>a.r-b.r);
  $('clList').innerHTML=sorted.length?'<div class="clsep"></div>'+sorted.map(g=>clRow(g,false)).join(''):'';
  $('clHint').disabled=cl.done; $('clGive').disabled=cl.done; $('clInp').disabled=cl.done; $('clSub').disabled=cl.done;
}
$('clForm').addEventListener('submit',e=>{
  e.preventDefault(); if(!cl||cl.done) return;
  const w=$('clInp').value.trim().toLowerCase(); if(!w) return;
  if(!/^[a-z]+$/.test(w)){ $('clMsg').textContent='Letters only, one word.'; $('clMsg').style.color='var(--warn)'; return; }
  const r=clAdd(w);
  if(r==='unknown'){ $('clMsg').textContent=`"${w}" isn't in my word list. Try another word.`; $('clMsg').style.color='var(--warn)'; return; }
  $('clMsg').textContent= r==='dup' ? `You already guessed "${w}".` : '';
  $('clInp').value=''; clRender(); clSaveProgress();
  if(r===1) clFinish(true,false);
});
$('clHint').addEventListener('click',()=>{
  if(!cl||cl.done) return;
  const best=cl.guesses.length?Math.min(...cl.guesses.map(g=>g.r)):1000;
  let t=Math.max(2,Math.floor(best/2)); if(best<=2) t=2;
  const byRank=new Map(); for(let i=0;i<cl.ranks.length;i++) byRank.set(cl.ranks[i],i);
  for(let k=t;k>=2;k--){ const w=CL.words[byRank.get(k)]; if(!cl.guesses.some(g=>g.w===w)){ cl.hints++; clAdd(w); $('clMsg').textContent=`Hint: "${w}"`; $('clMsg').style.color='var(--blue)'; clRender(); clSaveProgress(); return; } }
  $('clMsg').textContent='No more hints. You are very close!';
});
$('clGive').addEventListener('click',()=>{ if(!cl||cl.done) return; if(!$('clGive').dataset.armed){ $('clGive').dataset.armed='1'; $('clGive').textContent='Sure? Click again'; setTimeout(()=>{delete $('clGive').dataset.armed;$('clGive').textContent='Give up';},3000); return; } delete $('clGive').dataset.armed; $('clGive').textContent='Give up'; clFinish(false,false); });
$('clBackBtn').addEventListener('click',()=>{ show('cl','Intro'); clStatLine(); });
function clFinish(won,restoring){
  cl.done=won?'won':'lost'; clSaveProgress();
  if(!restoring){
    stats.cl.played++; if(won) stats.cl.solved++;
    if(cl.daily && !stats.cl.days[todayKey()]) stats.cl.days[todayKey()]={solved:won,guesses:cl.guesses.length,hints:cl.hints,word:cl.target,list:cl.guesses.map(x=>[x.w,x.r])};
    saveStats();
  }
  const byRank=[]; for(let i=0;i<cl.ranks.length;i++) if(cl.ranks[i]<=31) byRank[cl.ranks[i]]=CL.words[i];
  const prior=cl.daily?stats.cl.days[todayKey()]:null;
  const n=prior?prior.guesses:cl.guesses.length;
  $('clWin').style.display='';
  $('clWin').innerHTML=`<div class="center"><div class="muted">${won?'You found it!':'The word was'}</div><div class="big" style="color:var(--accent-ink,var(--accent));font-size:44px">${esc(cl.target)}</div>
    <div class="muted mono" style="margin-top:6px">${won?`${n} guesses${(prior?prior.hints:cl.hints)?`, ${prior?prior.hints:cl.hints} hints`:''}`:''}</div>
    <div style="margin-top:12px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button id="clCopy">Copy result</button><button class="ghost" id="clMore">Random word</button></div></div>
    <div class="muted" style="font-size:13px;margin:16px 0 6px">The 30 closest words:</div>
    <div class="mono" style="font-size:13px;line-height:1.7;color:var(--text)">${byRank.slice(2,32).map((w,i)=>`<span class="pill">#${i+2} ${esc(w)}</span>`).join(' ')}</div>`;
  $('clCopy').addEventListener('click',()=>copyText($('clCopy'),`Ballpark Clueless ${cl.daily?todayKey():'(practice)'}: ${won?`solved in ${n} guesses`:'gave up'}`,'Copy result'));
  $('clMore').addEventListener('click',()=>clStart(false));
  clRender();
}
$('clDaily').addEventListener('click',()=>clStart(true));
$('clPractice').addEventListener('click',()=>clStart(false));

route();
if(window.claude&&claude.use) claude.use('user').then(()=>{ mlResume(); glResume(); }).catch(()=>{});   // only once it is clear whose game this is
})();
