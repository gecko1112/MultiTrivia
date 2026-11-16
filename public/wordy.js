// Wordy: guess the 5-letter word in 6 tries. Daily word + practice.
// Picked and judged on the server (wordy-server.js): the browser sends a guess and gets back its colours, and learns
// the word only when the game is over. Results live in the account's "x_words", which only the server writes.
(function(){
const root=document.getElementById('g-wordy'); if(!root) return;
const E=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function todayKey(){const d=window.bpNow();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

let st={days:{},played:0,won:0,streak:0,maxStreak:0,dist:[0,0,0,0,0,0]};
let g=null; // the game on screen: {daily, rows:[{w,res}], cur, done, won, word, busy}
let day=null; // the day the server plays (today, or the archive day)

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
const dayArg=()=>window.bpDay||undefined;      // a past day in the archive, otherwise today (the server knows which day that is)
// a free account's practice words left today, on the practice buttons (null: no limit, no tag)
let left=null;
const tags=()=>{ if(!window.bpPlus) return; bpPlus.tag(document.getElementById('wdPractice'),left); bpPlus.tag(document.getElementById('wdNext'),left); };
async function post(act,body){
  const r=await fetch('/api/wd/'+act,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return { ok:r.ok, status:r.status, j:await r.json().catch(()=>({})) };
}

function keyStates(){ const s={}; for(const r of g.rows){ r.res.forEach((x,i)=>{const ch=r.w[i]; const rank={c:3,p:2,a:1}; if(!s[ch]||rank[x]>rank[s[ch]]) s[ch]=x;}); } return s; }
function render(revealRow){
  const rows=[];
  for(let i=0;i<6;i++){
    const r=g.rows[i]; let cells='';
    for(let j=0;j<5;j++){
      if(r){ cells+=`<div class="t ${r.res[j]}${i===revealRow?' flip':''}" style="${i===revealRow?`animation-delay:${j*0.12}s`:''}">${E(r.w[j].toUpperCase())}</div>`; }
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
  const rec=st.days[day||todayKey()], playing=g&&g.daily&&g.rows.length&&!g.done;
  document.getElementById('wdStat').innerHTML=statCells([['Today',rec?(rec.solved?rec.guesses+' / 6':'Missed'):playing?'In play':'–'],['Won',`${st.won||0} of ${st.played||0}`],['Streak',st.streak||0],['Best',st.maxStreak||0]]);
}
let msgT=null;
function msg(t,ms=1800){ const m=document.getElementById('wdMsg'); m.textContent=t; m.classList.add('show'); clearTimeout(msgT); if(ms) msgT=setTimeout(()=>m.classList.remove('show'),ms); }
function shake(){ const r=document.querySelector('.wdrow.cur'); if(r){ r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake'); } }
// the server's numbers after a finished daily game (games played and won, streak, distribution)
function takeStats(s, rec){
  st=Object.assign(st,s); if(rec&&day) st.days[day]=rec;
  try{localStorage.setItem('bp_words',JSON.stringify(st));}catch(e){}
}
// the server's view of the game: the rows with their colours, whether it is over, and then the word
function take(v, reveal){
  g.rows=v.rows; g.cur=''; g.done=v.done; g.won=v.won; g.word=v.word||null;
  if(v.daily&&v.day) day=v.day;
  if(v.stats) takeStats(v.stats, v.done&&v.daily?{solved:v.won,guesses:v.rows.length,word:v.word,rows:v.rows.map(r=>r.res.join('')),words:v.rows.map(r=>r.w)}:null);
  render(reveal?g.rows.length-1:undefined);
  if(g.done) setTimeout(()=>finish(v.fresh), reveal?5*120+450:0);
}
async function press(k){
  if(!g||g.done||g.busy) return;
  if(k==='⌫'||k==='Backspace'){ g.cur=g.cur.slice(0,-1); render(); return; }
  if(k==='⏎'||k==='Enter'){
    if(g.cur.length<5){ msg('Not enough letters'); shake(); return; }
    const was=g; was.busy=true;
    let r; try{ r=await post('guess',{daily:was.daily,day:was.daily?dayArg():undefined,i:was.rows.length,word:was.cur}); }
    catch(e){ was.busy=false; msg('Could not reach the server. Try again.'); return; }
    if(g!==was) return; was.busy=false;
    if(!r.ok){ msg(r.j.error||'Try again'); if(r.j.notWord||r.status===400) shake(); return; }
    take(r.j,true);
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
// `fresh`: this game ended just now (not opened again later), so the rest of the page hears about it
function finish(fresh){
  if(fresh&&g.daily) window.dispatchEvent(new Event('bp-saved'));
  msg(g.won?['Genius!','Brilliant!','Great!','Nice!','Good job!','Phew!'][g.rows.length-1]:`The word was ${String(g.word||'').toUpperCase()}`, g.won?2200:0);
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
  document.getElementById('wdCopy').addEventListener('click',async e=>{ const t=`Wordy ${g.daily?(day||todayKey()):'(practice)'} ${g.won?g.rows.length:'X'}/6\n`+grid(g.rows);
    try{await navigator.clipboard.writeText(t); e.target.textContent='Copied!';}catch(_){e.target.textContent='Copy failed';} setTimeout(()=>e.target.textContent='Copy result',1500); });
  document.getElementById('wdNext').addEventListener('click',()=>start(false)); tags();
}
// Today's word continues where it was (from any browser); a practice word is a new one each time.
async function start(daily){
  let r; try{ r=await post('start',{daily,day:daily?dayArg():undefined}); }catch(e){ msg('Could not reach the server. Try again.',0); return; }
  if(r.status===401) return;                       // not logged in yet: the login box is showing
  if(!r.ok){ if(window.bpPlus&&bpPlus.limited(r.j)){ left=0; tags(); return; } msg(r.j.error||'Try again',0); return; }
  document.getElementById('wdEnd').style.display='none';
  if(r.j.practiceLeft!==undefined){ left=r.j.practiceLeft; tags(); }
  g={daily,rows:[],cur:'',done:false,won:false};
  take(r.j,false);
}
if(window.bpAway) bpAway.watch('wd',()=>root.classList.contains('on')&&g&&g.daily&&!g.done&&g.rows.length>0);   // see away.js
document.getElementById('wdDaily').addEventListener('click',()=>start(true));
document.getElementById('wdPractice').addEventListener('click',()=>start(false));
// the ? button opens the How to play page (handled in ui.js through data-how)
(async()=>{
  try{ const l=JSON.parse(localStorage.getItem('bp_words')||'null'); if(l) st=Object.assign(st,l); }catch(e){}
  g={daily:true,rows:[],cur:'',done:false,won:false}; render();          // an empty board straight away
  try{ if(window.claude&&claude.use) await claude.use('user'); }catch(e){ return; }
  try{                                              // the server's results replace this browser's copy
    const d=await fetch('/api/docs/x_words',{credentials:'same-origin'}).then(r=>r.json());
    st={days:{},played:0,won:0,streak:0,maxStreak:0,dist:[0,0,0,0,0,0],...(d.exists?d.data:{})};
    try{localStorage.setItem('bp_words',JSON.stringify(st));}catch(e){}
  }catch(e){}
  if(!g.rows.length&&!g.cur) start(true);
  try{ const h=await fetch('/api/wd/home'+(window.bpDay?'?day='+window.bpDay:''),{credentials:'same-origin'}).then(r=>r.json()); left=h.practiceLeft??null; tags(); }catch(e){}
})();
})();
