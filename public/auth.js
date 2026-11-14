// Hosted version: accounts + storage shim + Friends leaderboard + data import.
// The games call claude.use('db') / claude.use('user'); here those talk to our own server.
(function(){
  // The server is the source of truth, so never reuse another player's cached data in this browser.
  ['bp_runs','bp_best','bp_stats','bp_runs_backup','bp_words','bp_lina','bp_svdaily'].forEach(k=>{try{localStorage.removeItem(k);}catch(e){}});

  let me=null, authResolve; const authReady=new Promise(r=>authResolve=r);
  async function api(method,url,body){
    const r=await fetch(url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});
    let j={}; try{j=await r.json();}catch(e){}
    if(!r.ok){ const err=new Error(j.error||('HTTP '+r.status)); err.status=r.status; err.code=r.status>=500||r.status===0?'unavailable':'invalid_argument'; throw err; }
    if(method!=='GET' && url.startsWith('/api/docs')) window.dispatchEvent(new Event('bp-saved')); // lets the side panels refresh
    return j;
  }
  function docRef(id){
    const u='/api/docs/'+encodeURIComponent(id);
    return { id,
      get: async()=>{ const j=await api('GET',u); return {id,exists:!!j.exists,data:()=>j.data,metadata:{fromCache:false,hasPendingWrites:false}}; },
      set: async d=>{ await api('PUT',u,d); },
      update: async d=>{ const j=await api('GET',u); await api('PUT',u,Object.assign({},j.data||{},d)); },
      delete: async()=>{ await api('DELETE',u); } };
  }
  const DB={ collection:()=>({
      get: async()=>{ const j=await api('GET','/api/docs'); const docs=j.docs.map(x=>({id:x.id,exists:true,data:()=>x.data})); return {docs,size:docs.length,empty:!docs.length}; },
      doc: id=>docRef(id) }),
    doc: p=>docRef(p.split('/').pop()) };
  window.claude={ use: async name=>{ const u=await authReady; if(name==='user') return {id:async()=>u.id}; if(name==='db') return DB; return null; } };

  function todayKey(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  const E=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  async function onLoggedIn(u){
    me=u;
    try{ if(localStorage.getItem('bp_owner')!==u.id){ Object.keys(localStorage).filter(k=>k.startsWith('bp_cl_')||k.startsWith('bp_wd_')||/^bp_(sv|ml|gl)_run$/.test(k)).forEach(k=>localStorage.removeItem(k)); localStorage.setItem('bp_owner',u.id);} }catch(e){}
    document.getElementById('authGate').style.display='none';
    document.getElementById('userChip').innerHTML=`<button type="button" class="acctbtn" data-account="1" title="Your account" aria-label="Your account, ${E(u.username)}"><span id="chipAv">${window.bpAvatar?window.bpAvatar(u.id,u.username,u.avatar,26):''}</span><span class="mono">${E(u.username)}</span></button> <a href="#" id="logoutBtn">log out</a>`;
    document.getElementById('logoutBtn').addEventListener('click',async e=>{e.preventDefault(); try{await api('POST','/api/logout');}catch(_){}
      try{localStorage.removeItem('bp_owner');}catch(_){} location.reload();});
    authResolve(u);
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    // login / signup overlay
    const gate=document.createElement('div'); gate.id='authGate';
    gate.innerHTML=`<div class="card authcard">
      <h2 class="gh">Ballpark</h2><div class="muted" style="margin-bottom:14px">Log in or create an account to play with your friends.</div>
      <form id="authForm" autocomplete="on">
        <input type="text" id="authUser" placeholder="Username" autocomplete="username" autocapitalize="off" spellcheck="false">
        <input type="password" id="authPass" placeholder="Password" autocomplete="current-password">
        <div style="display:flex;gap:10px;margin-top:4px"><button id="authLogin" type="submit">Log in</button><button class="ghost" id="authSignup" type="button">Create account</button></div>
      </form>
      <div class="parsed mono" id="authMsg" style="color:var(--warn)"></div>
      <div class="muted" style="font-size:12px;margin-top:10px">New passwords need at least 10 characters. Use one you don't use anywhere else.</div>
      <div class="authlinks"><a href="/welcome">What is Ballpark?</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/imprint">Impressum</a></div></div>`;
    document.body.appendChild(gate);
    const chip=document.createElement('span'); chip.id='userChip'; chip.className='muted'; document.querySelector('header').appendChild(chip);
    async function go(kind){
      const username=document.getElementById('authUser').value.trim(), password=document.getElementById('authPass').value;
      document.getElementById('authMsg').textContent='';
      try{ const j=await api('POST','/api/'+kind,{username,password}); const m=await api('GET','/api/me'); onLoggedIn(m); }
      catch(e){ document.getElementById('authMsg').textContent=e.message; }
    }
    document.getElementById('authForm').addEventListener('submit',e=>{e.preventDefault();go('login');});
    document.getElementById('authSignup').addEventListener('click',()=>go('signup'));
    try{ const m=await api('GET','/api/me'); onLoggedIn(m); }
    catch(e){ gate.style.display='flex'; document.getElementById('authUser').focus(); }

    // import box in the Best runs screen
    const runsScreen=document.getElementById('runsScreen');
    if(runsScreen){
      const box=document.createElement('details'); box.style.marginTop='16px';
      box.innerHTML=`<summary class="muted" style="cursor:pointer;font-size:13px">Import data from the Claude version</summary>
        <div class="muted" style="font-size:12px;margin:8px 0">In the Claude version, open Best runs → "Copy my data", then paste it here.</div>
        <textarea id="importTxt" rows="4" style="width:100%;background:var(--inset);color:var(--text);border:2px solid var(--bd);padding:8px;font:12px var(--body)"></textarea>
        <div style="text-align:right;margin-top:6px"><button class="ghost" id="importBtn" style="padding:6px 12px;font-size:13px">Import</button></div>
        <div class="parsed mono" id="importMsg"></div>`;
      runsScreen.appendChild(box);
      document.getElementById('importBtn').addEventListener('click',async()=>{
        const msg=document.getElementById('importMsg');
        let d; try{ d=JSON.parse(document.getElementById('importTxt').value); }catch(e){ msg.textContent='That is not valid data.'; return; }
        try{
          await authReady; let n=0;
          for(const r of (d.runs||[])){ if(r&&r.id&&typeof r.score==='number'){ const {id,...rest}=r; await api('PUT','/api/docs/'+encodeURIComponent(id),rest); n++; } }
          if(d.stats){ const cur=(await api('GET','/api/docs/x_stats')).data||{}; const out={};
            for(const k of ['ml','gl','cl']){ const A=cur[k]||{},B=d.stats[k]||{}; out[k]={days:Object.assign({},B.days||{},A.days||{})};
              for(const f of ['best','played','solved']) if(f in A||f in B) out[k][f]=Math.max(A[f]||0,B[f]||0); }
            await api('PUT','/api/docs/x_stats',out); }
          msg.textContent=`Imported ${n} runs${d.stats?' and game stats':''}. Reloading…`; setTimeout(()=>location.reload(),900);
        }catch(e){ msg.textContent='Import failed: '+e.message; }
      });
    }
  });

  // Friends tab: results for any day (with details) + all-time tables
  let dayDate=null;
  const shiftDate=(d,n)=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()+n);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
  const prettyDate=d=>new Date(d+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const GAMES=[['sv','Survival daily'],['ml','More/Less'],['gl','Guessless'],['cl','Clueless'],['wd','Wordy']];
  function cellText(k,d){
    if(!d) return '–';
    if(k==='sv') return d.score==null?'unfinished':`${d.score} survived`;
    if(k==='ml') return `${d.score}/25`;
    if(k==='gl') return `${d.total}/500`;
    if(k==='cl') return d.solved?`${d.guesses} guesses${d.hints?` (+${d.hints} hints)`:''}`:'gave up';
    if(k==='wd') return d.solved?`${d.guesses}/6`:'X/6';
  }
  function detailHTML(k,d){
    const row=(a,b,c,col)=>`<div class="hrow"><div><div class="hq">${a}</div><div class="hsub">${b}</div></div><div class="hd" style="color:${col||'var(--muted)'}">${c}</div></div>`;
    if(k==='sv'){ if(!d.h) return '<div class="muted">No question details were saved for this run (it was played before details were recorded).</div>';
      return `<div class="muted" style="font-size:13px;margin-bottom:6px">${d.score} survived, average error ${d.avg==null?'–':d.avg.toFixed(2)+' orders of magnitude'}</div>`+histHTML(d.h); }
    if(k==='ml'){ const grid=(d.grid||[]).map((r,i)=>`<div>${r.map(x=>x?'🟩':'🟥').join('')} <span class="muted" style="font-size:12px">${E((d.cats||[])[i]||'')}</span></div>`).join('');
      return `<div style="margin-bottom:8px">${grid}</div>`+(d.log||[]).map(l=>row(`${E(l.b)} <span class="muted">vs</span> ${E(l.a)}`,`${E(l.bv)} vs ${E(l.av)}, said ${l.ch}`,l.ok?'✓':'✗',l.ok?'var(--good)':'var(--bad)')).join(''); }
    if(k==='gl') return (d.res||[]).map(r=>row(`${E(r.cat)}: ${E(r.q)}`,`guessed ${E(fmt(r.g))}, answer ${E(fmt(r.a))} ${E(r.u)}`,r.pts,r.pts>=70?'var(--good)':r.pts>=30?'var(--warn)':'var(--bad)')).join('');
    if(k==='cl'){ const head=`<div style="margin-bottom:6px">Word: <b style="color:var(--accent-ink,var(--accent))">${E(d.word||'?')}</b>, ${d.solved?`found in ${d.guesses} guesses`:'gave up'}${d.hints?`, ${d.hints} hints`:''}</div>`;
      if(!d.list) return head+'<div class="muted">Individual guesses were not saved for this day.</div>';
      const best=[...d.list].sort((a,b)=>a[1]-b[1]).slice(0,25);
      return head+`<div class="muted" style="font-size:12px;margin-bottom:4px">Closest guesses (all ${d.list.length} in guess order below)</div><div style="line-height:1.9">${best.map(([w,r])=>`<span class="pill">#${r} ${E(w)}</span>`).join(' ')}</div>
        <details style="margin-top:6px"><summary class="muted" style="cursor:pointer;font-size:12px">All guesses in order</summary><div style="line-height:1.9;margin-top:6px">${d.list.map(([w,r],i)=>`<span class="pill">${i+1}. ${E(w)} #${r}</span>`).join(' ')}</div></details>`; }
    if(k==='wd'){ const head=`<div style="margin-bottom:8px">Word: <b style="color:var(--accent-ink,var(--accent))">${E((d.word||'?').toUpperCase())}</b>, ${d.solved?`solved in ${d.guesses}/6`:'not solved'}</div>`;
      return head+(d.rows||[]).map((r,i)=>`<div class="minirow">${[...r].map((c,j)=>`<span class="t ${c}">${E(((d.words||[])[i]||'')[j]||'').toUpperCase()}</span>`).join('')}</div>`).join(''); }
    return '';
  }
  async function loadDay(date){
    dayDate=date; const body=document.getElementById('dayBody'); body.innerHTML='<div class="muted">Loading…</div>';
    document.getElementById('dayPick').value=date; document.getElementById('dayLabel').textContent=prettyDate(date)+(date===todayKey()?' (today)':'');
    document.getElementById('dayNext').disabled = date>=todayKey();
    let j; try{ j=await api('GET','/api/day?date='+date); }catch(e){ body.innerHTML='<div class="muted">Could not load that day.</div>'; return; }
    const mine=j.players.find(p=>p.me)||{};
    const recent=j.dates.slice(-10).reverse();
    document.getElementById('dayChips').innerHTML=recent.length?'<span class="muted" style="font-size:12px">Days with results:</span> '+recent.map(d=>`<button class="ghost sm daychip${d===date?' sel':''}" data-day="${d}">${new Date(d+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})}</button>`).join(''):'';
    const played=j.players.filter(p=>GAMES.some(([k])=>p[k]));
    // Atlas results come from the server's own record (geo-server.js), one row per player who finished at least one of the three.
    const atCell=(m,d)=>!d?'<span class="muted">–</span>':(m==='route'?(d.won?d.used+(d.used===1?' guess':' guesses'):'not solved'):d.score+'/'+d.n)+(d.away&&localStorage.getItem('bp_dev')==='1'?' <span class="pill" title="Left the page during the game">left '+d.away+'×</span>':'');
    const atl=j.players.filter(p=>p.at);
    const atHTML=atl.length?`<h3 class="fh">Atlas</h3><table class="ft"><tr><th>Player</th><th>Flags</th><th>Outlines</th><th>Overland</th></tr>${atl.map(p=>`<tr class="${p.me?'meRow':''}"><td>${window.bpAvatar?window.bpAvatar(p.id,p.name,p.av,22):''}${E(p.name)}</td>${['flags','shapes','route'].map(m=>`<td class="mono">${atCell(m,p.at[m])}</td>`).join('')}</tr>`).join('')}</table>`:'';
    if(!played.length){ body.innerHTML=atHTML||'<div class="muted" style="padding:10px 0">Nobody played on this day.</div>'; return; }
    body.innerHTML=`<table class="ft daytable"><tr><th>Player</th>${GAMES.map(([,l])=>`<th>${l}</th>`).join('')}</tr>${played.map((p,pi)=>`<tr class="${p.me?'meRow':''}"><td>${window.bpAvatar?window.bpAvatar(p.id,p.name,p.av,22):''}${E(p.name)}</td>${GAMES.map(([k])=>`<td>${p[k]?`<button class="cellbtn" data-p="${pi}" data-k="${k}">${cellText(k,p[k])} <span class="muted">▾</span></button>${p[k].away&&localStorage.getItem('bp_dev')==='1'?' <span class="pill" title="Left the page during the game">left '+p[k].away+'×</span>':''}`:'<span class="muted">–</span>'}</td>`).join('')}</tr><tr class="detrow" id="det-${pi}" style="display:none"><td colspan="${GAMES.length+1}"></td></tr>`).join('')}</table>
      <div class="muted" style="font-size:12px;margin-top:6px">Click a result for details. They open once you have played that game of that day yourself.</div>`+atHTML;
    body.querySelectorAll('.cellbtn').forEach(b=>b.addEventListener('click',()=>{
      const p=played[+b.dataset.p], k=b.dataset.k, tr=document.getElementById('det-'+b.dataset.p), td=tr.firstElementChild;
      if(tr.style.display!=='none' && tr.dataset.k===k){ tr.style.display='none'; return; }
      tr.dataset.k=k; tr.style.display='';
      const spoiler = !!p[k].locked;   // the server did not send the details
      td.innerHTML=`<div class="detbox"><div class="dethead">${E(p.name)}: ${GAMES.find(g=>g[0]===k)[1]}, ${E(date)}</div>${spoiler?'<div class="muted">Finish '+(date===todayKey()?'today\'s ':'this day\'s ')+GAMES.find(g=>g[0]===k)[1]+' yourself to see these details.</div>':detailHTML(k,p[k])}</div>`;
    }));
  }
  const H2H_GAMES=[['sv','Survival'],['ml','More/Less'],['gl','Guessless'],['cl','Clueless'],['wd','Wordy'],['flags','Flags'],['shapes','Outlines'],['route','Overland']];
  async function loadH2H(){
    const el=document.getElementById('h2h'); if(!el) return;
    const head=tag=>`<h3 class="fh">Head-to-head${tag?' <span class="ptag">Plus</span>':''}</h3>`;
    if(!(window.bpPlus&&window.bpPlus.has())){ el.innerHTML=head(true)+'<p class="muted" style="margin:0">Your record against each friend. <a href="#" class="pluslink" data-plus="h2h">See yours</a></p>'; return; }
    let j; try{ j=await api('GET','/api/h2h'); }catch(e){ el.innerHTML=head()+'<div class="muted">Could not load your record.</div>'; return; }
    if(!j.players.length){ el.innerHTML=head()+'<div class="muted">No daily game yet that you and a friend both played.</div>'; return; }
    el.innerHTML=head()+`<table class="ft"><tr><th>Against</th><th>Won</th><th>Lost</th><th>Tied</th></tr>${j.players.map((p,i)=>
      `<tr><td><button class="cellbtn" data-h2h="${i}">${E(p.name)} <span class="muted">▾</span></button></td><td class="mono" style="color:var(--good)">${p.won}</td><td class="mono" style="color:var(--bad)">${p.lost}</td><td class="mono">${p.tied}</td></tr>
       <tr class="detrow" id="h2h-${i}" style="display:none"><td colspan="4"><div class="detbox"><table class="ft"><tr><th>Game</th><th>Won</th><th>Lost</th><th>Tied</th></tr>${H2H_GAMES.filter(([g])=>p.games[g]).map(([g,n])=>`<tr><td>${n}</td>${p.games[g].map(v=>`<td class="mono">${v}</td>`).join('')}</tr>`).join('')}</table></div></td></tr>`).join('')}</table>`;
  }
  window.onFriendsTab=async function(){
    const el=document.getElementById('friendsBody');
    if(!document.getElementById('dayBody')){
      el.innerHTML=`<div id="frBox"></div><div class="daybar"><button class="ghost sm" id="dayPrev" aria-label="Previous day">◀</button><input type="date" id="dayPick"><button class="ghost sm" id="dayNext" aria-label="Next day">▶</button><button class="ghost sm" id="dayToday">Today</button><span class="muted" id="dayLabel"></span></div>
        <div class="daychips" id="dayChips"></div><div id="dayBody"></div><div id="h2h"></div><div id="allTime"></div>`;
      // Head-to-head (Plus): counted on the server from daily games both players finished on the day itself.
      document.getElementById('h2h').addEventListener('click',e=>{ const b=e.target.closest('[data-h2h]'); if(!b) return; const tr=document.getElementById('h2h-'+b.dataset.h2h); tr.style.display=tr.style.display==='none'?'':'none'; });
      document.getElementById('dayPick').addEventListener('change',e=>{ if(e.target.value) loadDay(e.target.value); });
      document.getElementById('dayPrev').addEventListener('click',()=>loadDay(shiftDate(dayDate,-1)));
      document.getElementById('dayNext').addEventListener('click',()=>loadDay(shiftDate(dayDate,1)));
      document.getElementById('dayToday').addEventListener('click',()=>loadDay(todayKey()));
      document.getElementById('dayChips').addEventListener('click',e=>{const b=e.target.closest('[data-day]'); if(b) loadDay(b.dataset.day);});
    }
    document.getElementById('dayPick').max=todayKey();
    if(window.bpFriends){ window.bpFriends.draw(); window.bpFriends.load(); }
    await authReady; loadDay(dayDate||todayKey());
    loadH2H();
    const at=document.getElementById('allTime');
    try{
      const j=await api('GET','/api/leaderboard?date='+todayKey()); const P=j.players; const meName=me?me.username:'';
      const tbl=(title,rows,cols)=>`<h3 class="fh">${title}</h3><table class="ft"><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr>${rows.length?rows.join(''):`<tr><td colspan="${cols.length}" class="muted">Nobody yet</td></tr>`}</table>`;
      const tr=(p,cells)=>`<tr class="${p.name===meName?'meRow':''}"><td>${window.bpAvatar?window.bpAvatar(p.id,p.name,p.av,22):''}${E(p.name)}</td>${cells.map(c=>`<td class="mono">${c}</td>`).join('')}</tr>`;
      at.innerHTML=
        tbl('Survival: best run (any mode)', P.filter(p=>p.survival).sort((a,b)=>b.survival.score-a.survival.score||(a.survival.avg??99)-(b.survival.avg??99)).map(p=>tr(p,[p.survival.score, p.survival.avg==null?'–':p.survival.avg.toFixed(2)+' OoM', p.survivalRuns])), ['Player','Survived','Avg error','Saved runs'])+
        tbl('All time', [...P].sort((a,b)=>b.ml.best+b.gl.best/20-(a.ml.best+a.gl.best/20)).map(p=>tr(p,[`${p.ml.best} (${p.ml.played})`,`${p.gl.best} (${p.gl.played})`,`${p.cl.solved}/${p.cl.played}`, p.wd?`${p.wd.won}/${p.wd.played}, streak ${p.wd.streak}`:'–'])), ['Player','More/Less best (games)','Guessless best (rounds)','Clueless solved','Wordy won']);
    }catch(e){ at.innerHTML='<div class="muted">Could not load the all-time tables.</div>'; }
  };
})();
