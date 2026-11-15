// Wordy: guess the 5-letter word in 6 tries. Daily word + practice. Stats in doc "x_words".
(function(){
const root=document.getElementById('g-wordy'); if(!root||!window.WORDY) return;
const ANS=WORDY.answers, OK=new Set(WORDY.allowed.split(' ')); ANS.forEach(w=>OK.add(w));
const E=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function todayKey(){const d=window.bpNow();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dayNum(){const d=window.bpNow();return Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(2026,0,1))/864e5);}
function rng(seed){let h=2166136261;for(const c of seed){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return ()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const ORDER=(()=>{const a=ANS.slice(),r=rng('wordy-v1');for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;})();
const dailyWord=()=>ORDER[((dayNum()%ORDER.length)+ORDER.length)%ORDER.length];

let st={days:{},played:0,won:0,streak:0,maxStreak:0,dist:[0,0,0,0,0,0]}, col=null;
let g=null; // {target,daily,rows:[],cur:'',done:false,won:false}

root.innerHTML=`<div class="card wordy">
  <div class="navrow"><h2 style="margin:0;font-size:22px">Wordy</h2>
    <span style="display:flex;gap:6px"><button class="ghost sm" id="wdDaily">Today</button><button class="ghost sm" id="wdPractice">Practice</button></span></div>
  <p class="lead">Find the five-letter word in six tries. Green is the right spot, yellow the wrong spot. <a href="#howto" data-how="wordy">More info</a></p>
  <div class="muted" id="wdSub" style="font-size:13px;margin-top:2px"></div>
  <div class="wdhelp" id="wdHelp" style="display:none">
    Five letters, six tries.
    <div class="wdex"><span class="t c">B</span> right letter, right spot</div><div class="wdex"><span class="t p">R</span> in the word, wrong spot</div><div class="wdex"><span class="t a">X</span> not in the word</div>
    <div class="demo" aria-hidden="true"><div class="dtiles d1"><span class="t a">S</span><span class="t p">T</span><span class="t a">O</span><span class="t a">R</span><span class="t a">E</span></div><div class="dtiles d3"><span class="t c">P</span><span class="t c">L</span><span class="t c">A</span><span class="t c">N</span><span class="t c">T</span></div></div>
  </div>
  <div class="wdmsg" id="wdMsg" role="status" aria-live="polite"></div>
  <div class="wdgrid" id="wdGrid"></div>
  <div class="wdkb" id="wdKb"></div>
  <div class="wdend" id="wdEnd" style="display:none"></div>
  <div class="statstrip"><div class="cells" id="wdStat"></div><div class="act"><a href="#" class="pluslink" data-plus="stats">Detailed statistics <span class="ptag">Plus</span></a></div></div>
</div>`;
const KB=['qwertyuiop','asdfghjkl','⏎zxcvbnm⌫'];

function score(guess,target){
  const res=Array(5).fill('a'), t=target.split(''), used=Array(5).fill(false);
  for(let i=0;i<5;i++) if(guess[i]===t[i]){res[i]='c';used[i]=true;}
  for(let i=0;i<5;i++) if(res[i]!=='c'){ const j=t.findIndex((ch,k)=>!used[k]&&ch===guess[i]); if(j>=0){res[i]='p';used[j]=true;} }
  return res;
}
function keyStates(){ const s={}; for(const r of g.rows){ r.res.forEach((x,i)=>{const ch=r.w[i]; const rank={c:3,p:2,a:1}; if(!s[ch]||rank[x]>rank[s[ch]]) s[ch]=x;}); } return s; }
function render(revealRow){
  const rows=[];
  for(let i=0;i<6;i++){
    const r=g.rows[i]; let cells='';
    for(let j=0;j<5;j++){
      if(r){ cells+=`<div class="t ${r.res[j]}${i===revealRow?' flip':''}" style="${i===revealRow?`animation-delay:${j*0.12}s`:''}">${r.w[j].toUpperCase()}</div>`; }
      else if(i===g.rows.length && !g.done){ const ch=g.cur[j]; cells+=`<div class="t${ch?' filled':''}">${ch?ch.toUpperCase():''}</div>`; }
      else cells+=`<div class="t"></div>`;
    }
    rows.push(`<div class="wdrow${i===g.rows.length&&!g.done?' cur':''}">${cells}</div>`);
  }
  document.getElementById('wdGrid').innerHTML=rows.join('');
  const ks=keyStates();
  document.getElementById('wdKb').innerHTML=KB.map(row=>`<div class="kbrow">${[...row].map(k=>{
    const lab=k==='⏎'?'Enter':k==='⌫'?'⌫':k.toUpperCase(); const cls=ks[k]||''; const wide=(k==='⏎'||k==='⌫')?' wide':'';
    return `<button class="key ${cls}${wide}" data-k="${k}" aria-label="${k==='⏎'?'Enter':k==='⌫'?'Backspace':k}">${lab}</button>`;}).join('')}</div>`).join('');
  document.getElementById('wdSub').innerHTML=`<span>${g.daily?'Daily word':'Practice word'}</span><span>Guess ${Math.min(g.rows.length+(g.done?0:1),6)} of 6</span>`;
  wdStatStrip();
}
function wdStatStrip(){
  const rec=st.days[todayKey()], playing=g&&g.daily&&g.rows.length&&!g.done;
  document.getElementById('wdStat').innerHTML=statCells([['Today',rec?(rec.solved?rec.guesses+' / 6':'Missed'):playing?'In play':'–'],['Won',`${st.won||0} of ${st.played||0}`],['Streak',st.streak||0],['Best',st.maxStreak||0]]);
}
let msgT=null;
function msg(t,ms=1800){ const m=document.getElementById('wdMsg'); m.textContent=t; m.classList.add('show'); clearTimeout(msgT); if(ms) msgT=setTimeout(()=>m.classList.remove('show'),ms); }
function shake(){ const r=document.querySelector('.wdrow.cur'); if(r){ r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); } }
function press(k){
  if(!g||g.done) return;
  if(k==='⌫'||k==='Backspace'){ g.cur=g.cur.slice(0,-1); render(); return; }
  if(k==='⏎'||k==='Enter'){
    if(g.cur.length<5){ msg('Not enough letters'); shake(); return; }
    if(!OK.has(g.cur)){ msg(`"${g.cur.toUpperCase()}" isn't in the word list`); shake(); return; }
    const res=score(g.cur,g.target); g.rows.push({w:g.cur,res}); g.cur='';
    const won=res.every(x=>x==='c');
    if(won||g.rows.length===6){ g.done=true; g.won=won; }
    save(); render(g.rows.length-1);
    if(g.done) setTimeout(finish,5*120+450);
    return;
  }
  if(/^[a-z]$/i.test(k)&&g.cur.length<5){ g.cur+=k.toLowerCase(); render(); }
}
document.getElementById('wdKb').addEventListener('click',e=>{const b=e.target.closest('[data-k]'); if(b){ press(b.dataset.k); b.blur(); }});
document.addEventListener('keydown',e=>{
  if(!root.classList.contains('on')||e.ctrlKey||e.metaKey||e.altKey) return;
  if(document.activeElement&&/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if(e.key==='Enter'||e.key==='Backspace'||/^[a-zA-Z]$/.test(e.key)){ e.preventDefault(); press(e.key); }
});
const grid=rows=>rows.map(r=>r.res.map(x=>x==='c'?'🟩':x==='p'?'🟨':'⬛').join('')).join('\n');
function finish(){
  const k=todayKey();
  if(g.daily && !g.counted){
    g.counted=true; st.played++; if(g.won){ st.won++; st.dist[g.rows.length-1]++; st.streak=(st.lastWin===prevDay(k)?st.streak:0)+1; st.lastWin=k; st.maxStreak=Math.max(st.maxStreak,st.streak);} else st.streak=0;
    st.days[k]={solved:g.won,guesses:g.rows.length,word:g.target,rows:g.rows.map(r=>r.res.join('')),words:g.rows.map(r=>r.w)}; persist(); save();
  }
  msg(g.won?['Genius!','Brilliant!','Great!','Nice!','Good job!','Phew!'][g.rows.length-1]:`The word was ${g.target.toUpperCase()}`, g.won?2200:0);
  wdStatStrip();
  const max=Math.max(1,...st.dist);
  const end=document.getElementById('wdEnd'); end.style.display='';
  end.innerHTML=`<div class="wdstats">
      <div><b>${st.played}</b><span>played</span></div><div><b>${st.played?Math.round(100*st.won/st.played):0}%</b><span>won</span></div>
      <div><b>${st.streak}</b><span>streak</span></div><div><b>${st.maxStreak}</b><span>best streak</span></div></div>
    <div class="muted" style="font-size:12px;margin:10px 0 4px">Guess distribution (daily words)</div>
    ${st.dist.map((n,i)=>`<div class="dist"><span>${i+1}</span><i style="width:${Math.max(6,100*n/max)}%" class="${g.daily&&g.won&&g.rows.length===i+1?'hl':''}">${n}</i></div>`).join('')}
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:12px">
      <button id="wdCopy">Copy result</button><button class="ghost" id="wdNext">Practice word</button></div>`;
  document.getElementById('wdCopy').addEventListener('click',async e=>{ const t=`Wordy ${g.daily?todayKey():'(practice)'} ${g.won?g.rows.length:'X'}/6\n`+grid(g.rows);
    try{await navigator.clipboard.writeText(t); e.target.textContent='Copied!';}catch(_){e.target.textContent='Copy failed';} setTimeout(()=>e.target.textContent='Copy result',1500); });
  document.getElementById('wdNext').addEventListener('click',()=>start(false));
}
function prevDay(k){const d=new Date(k+'T12:00:00');d.setDate(d.getDate()-1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function save(){
  if(!g||!g.daily) return;
  const s={t:g.target,rows:g.rows.map(r=>r.w)};
  try{localStorage.setItem('bp_wd_'+todayKey(),JSON.stringify(s));}catch(e){}
  if(window.bpRun&&!window.bpDay&&s.rows.length){ if(g.done) bpRun.done('wd'); else bpRun.set('wd',s.rows.length+1,s); }   // today's tries are also kept on the server (run.js)
}
function persist(){ try{localStorage.setItem('bp_words',JSON.stringify(st));}catch(e){} if(col) col.doc('x_words').set(st).catch(()=>{}); }
function start(daily){
  document.getElementById('wdEnd').style.display='none';
  const target=daily?dailyWord():(()=>{let w;do{w=ANS[Math.floor(Math.random()*ANS.length)];}while(w===dailyWord());return w;})();
  g={target,daily,rows:[],cur:'',done:false,won:false};
  if(daily){
    let saved=null; try{saved=JSON.parse(localStorage.getItem('bp_wd_'+todayKey())||'null');}catch(e){}
    const rec=st.days[todayKey()];
    // tries made in another browser today count too: go on from whichever copy has more
    const far=window.bpRun&&bpRun.get('wd');
    if(far&&far.t===target&&Array.isArray(far.rows)&&(!saved||saved.t!==target||far.rows.length>saved.rows.length)) saved=far;
    const words = saved&&saved.t===target ? saved.rows : [];
    for(const w of words){ const res=score(w,target); g.rows.push({w,res}); if(res.every(x=>x==='c')){g.done=true;g.won=true;break;} }
    if(!g.done && g.rows.length>=6){ g.done=true; }
    if(!g.done && rec){ g.done=true; g.won=rec.solved; }   // finished on another device
    if(g.done){ g.counted=true; render(); finish(); return; }
  }
  render();
}
if(window.bpAway) bpAway.watch('wd',()=>root.classList.contains('on')&&g&&g.daily&&!g.done&&g.rows.length>0);   // see away.js
document.getElementById('wdDaily').addEventListener('click',()=>start(true));
document.getElementById('wdPractice').addEventListener('click',()=>start(false));
// the ? button opens the How to play page (handled in ui.js through data-how)
(async()=>{
  try{ const l=JSON.parse(localStorage.getItem('bp_words')||'null'); if(l) st=Object.assign(st,l); }catch(e){}
  start(true);
  try{ if(!window.claude||!claude.use) return; const db=await claude.use('db'), u=await claude.use('user'); const id=u&&await u.id(); if(!db||!id) return;
    if(window.bpRun){ await bpRun.ready(); const far=bpRun.get('wd'); if(far&&g&&g.daily&&!g.done&&Array.isArray(far.rows)&&far.rows.length>g.rows.length) start(true); }
    col=db.collection('data/users/'+id); const d=await col.doc('x_words').get();
    if(d.exists){ st=Object.assign({days:{},played:0,won:0,streak:0,maxStreak:0,dist:[0,0,0,0,0,0]},d.data()); try{localStorage.setItem('bp_words',JSON.stringify(st));}catch(e){} if(!g||g.daily) start(true); }
  }catch(e){}
})();
})();
