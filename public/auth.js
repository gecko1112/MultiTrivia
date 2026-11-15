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
  // ---- the Friends tab: one table at a time (a day, all time, head-to-head), chosen with the switch above it.
  // Adding and removing friends sits behind "Manage" (friends.js).
  let frView='day', dayDates=[];
  const CHEV=d=>'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>';
  // [full heading, heading on a phone]
  const HEAD={sv:['Survival','Surv.'],ml:['More/Less','M/L'],gl:['Guessless','Guess.'],cl:['Clueless','Clue.'],wd:['Wordy','Wordy'],at:['All time','']};
  const th=(a,b)=>'<th><span class="thl">'+a+'</span><span class="ths">'+(b||a)+'</span></th>';
  // the same result as cellText, with the part a phone leaves out wrapped in .cx
  function cellHTML(k,d){
    const cx=t=>'<span class="cx">'+t+'</span>';
    if(k==='sv') return d.score==null?'unfinished':d.score+cx(' survived');
    if(k==='ml') return d.score+cx('/25');
    if(k==='gl') return d.total+cx('/500');
    if(k==='cl') return d.solved?d.guesses+cx(' guesses'+(d.hints?' (+'+d.hints+' hints)':'')):'gave up';
    return d.solved?d.guesses+'/6':'X/6';
  }
  // "Today, 15 November" or "Saturday, 14 November"; the year only when it is not this one
  function dayTitle(d){
    const x=new Date(d+'T12:00:00'), t=todayKey(), o={day:'numeric',month:'long'};
    if(x.getFullYear()!==new Date(t+'T12:00:00').getFullYear()) o.year='numeric';
    return d===t?'Today, '+x.toLocaleDateString(undefined,o):x.toLocaleDateString(undefined,Object.assign({weekday:'long'},o));
  }
  // the arrows step through the days that have results; the day itself opens the calendar for any other day
  const prevDay=()=>dayDates.filter(d=>d<dayDate).pop()||null;
  const nextDay=()=>{ const t=todayKey(), n=dayDates.find(d=>d>dayDate); return n&&n<=t?n:(dayDate<t?t:null); };
  function dayNav(){
    const $=id=>document.getElementById(id); if(!$('dayLabel')) return;
    $('dayLabel').textContent=dayTitle(dayDate); $('dayLabel').setAttribute('aria-label','Choose a day. Showing '+prettyDate(dayDate));
    $('dayPick').value=dayDate; $('dayPrev').disabled=!prevDay(); $('dayNext').disabled=!nextDay(); $('dayToday').hidden=dayDate===todayKey();
  }
  async function loadDay(date){
    dayDate=date; const body=document.getElementById('dayBody'); body.innerHTML='<div class="muted">Loading…</div>';
    dayNav();
    let j; try{ j=await api('GET','/api/day?date='+date); }catch(e){ body.innerHTML='<div class="muted">Could not load that day.</div>'; return; }
    if(date!==dayDate) return;                                   // a later click has already moved on
    dayDates=[...j.dates].sort(); dayNav();
    const played=j.players.filter(p=>GAMES.some(([k])=>p[k]));
    const left=d=>d.away&&localStorage.getItem('bp_dev')==='1'?' <span class="pill" title="Left the page during the game">left '+d.away+'×</span>':'';
    // Atlas results come from the server's own record (geo-server.js), one row per player who finished at least one of the three.
    const atCell=(m,d)=>!d?'<span class="muted">–</span>':(m==='route'?(d.won?d.used+(d.used===1?' guess':' guesses'):'not solved'):d.score+'/'+d.n)+left(d);
    const atl=j.players.filter(p=>p.at);
    const who=p=>(window.bpAvatar?window.bpAvatar(p.id,p.name,p.av,22):'')+E(p.name);
    const atHTML=atl.length?'<h3 class="fh">Atlas</h3><div class="ftwrap"><table class="ft"><tr><th>Player</th><th>Flags</th><th>Outlines</th><th>Overland</th></tr>'+atl.map(p=>'<tr class="'+(p.me?'meRow':'')+'"><td>'+who(p)+'</td>'+['flags','shapes','route'].map(m=>'<td class="mono">'+atCell(m,p.at[m])+'</td>').join('')+'</tr>').join('')+'</table></div>':'';
    if(!played.length){ body.innerHTML=atHTML||'<div class="muted" style="padding:10px 0">Nobody played on this day.</div>'; return; }
    body.innerHTML='<div class="ftwrap"><table class="ft daytable"><tr><th>Player</th>'+GAMES.map(([k])=>th(HEAD[k][0],HEAD[k][1])).join('')+'</tr>'+played.map((p,pi)=>
      '<tr class="'+(p.me?'meRow':'')+'"><td>'+who(p)+'</td>'+GAMES.map(([k])=>'<td>'+(p[k]?'<button class="cellbtn" data-p="'+pi+'" data-k="'+k+'" aria-label="'+E(p.name)+', '+HEAD[k][0]+': '+E(cellText(k,p[k]))+'. Show details">'+cellHTML(k,p[k])+' <span class="muted">▾</span></button>'+left(p[k]):'<span class="muted">–</span>')+'</td>').join('')+'</tr>'+
      '<tr class="detrow" id="det-'+pi+'" style="display:none"><td colspan="'+(GAMES.length+1)+'"></td></tr>').join('')+'</table></div>'+atHTML;
    body.querySelectorAll('.cellbtn').forEach(b=>b.addEventListener('click',()=>{
      const p=played[+b.dataset.p], k=b.dataset.k, tr=document.getElementById('det-'+b.dataset.p), td=tr.firstElementChild;
      if(tr.style.display!=='none' && tr.dataset.k===k){ tr.style.display='none'; return; }
      tr.dataset.k=k; tr.style.display='';
      const spoiler = !!p[k].locked;   // the server did not send the details
      td.innerHTML='<div class="detbox"><div class="dethead">'+E(p.name)+': '+GAMES.find(g=>g[0]===k)[1]+', '+E(date)+'</div>'+(spoiler?'<div class="muted">Finish '+(date===todayKey()?'today\'s ':'this day\'s ')+GAMES.find(g=>g[0]===k)[1]+' yourself to see these details.</div>':detailHTML(k,p[k]))+'</div>';
    }));
  }
  // Head-to-head (Plus): counted on the server from daily games both players finished on the day itself.
  const H2H_GAMES=[['sv','Survival'],['ml','More/Less'],['gl','Guessless'],['cl','Clueless'],['wd','Wordy'],['flags','Flags'],['shapes','Outlines'],['route','Overland']];
  async function loadH2H(){
    const el=document.getElementById('h2h'); if(!el) return;
    const member=!!(window.bpPlus&&window.bpPlus.has());
    const tag=document.getElementById('h2hTag'); if(tag) tag.hidden=member;
    if(!member){ el.innerHTML='<p class="muted" style="margin:0">Your record against each friend. <a href="#" class="pluslink" data-plus="h2h">See yours</a></p>'; return; }
    let j; try{ j=await api('GET','/api/h2h'); }catch(e){ el.innerHTML='<div class="muted">Could not load your record.</div>'; return; }
    if(!j.players.length){ el.innerHTML='<div class="muted">No daily game yet that you and a friend both played.</div>'; return; }
    el.innerHTML='<div class="ftwrap"><table class="ft"><tr><th>Against</th><th>Won</th><th>Lost</th><th>Tied</th></tr>'+j.players.map((p,i)=>
      '<tr><td><button class="cellbtn" data-h2h="'+i+'">'+E(p.name)+' <span class="muted">▾</span></button></td><td class="mono" style="color:var(--good)">'+p.won+'</td><td class="mono" style="color:var(--bad)">'+p.lost+'</td><td class="mono">'+p.tied+'</td></tr>'+
      '<tr class="detrow" id="h2h-'+i+'" style="display:none"><td colspan="4"><div class="detbox"><table class="ft"><tr><th>Game</th><th>Won</th><th>Lost</th><th>Tied</th></tr>'+H2H_GAMES.filter(([g])=>p.games[g]).map(([g,n])=>'<tr><td>'+n+'</td>'+p.games[g].map(v=>'<td class="mono">'+v+'</td>').join('')+'</tr>').join('')+'</table></div></td></tr>').join('')+'</table></div>';
  }
  // All time: every player's best in one table. The small line under a number says what it rests on.
  async function loadAllTime(){
    const at=document.getElementById('allTime'); if(!at) return;
    try{
      const j=await api('GET','/api/leaderboard?date='+todayKey()); const P=j.players; const meName=me?me.username:'';
      const sub=t=>'<small class="sub">'+t+'</small>', n=(c,one,many)=>c+' '+(c===1?one:many);
      const tr=(p,cells)=>'<tr class="'+(p.name===meName?'meRow':'')+'"><td>'+(window.bpAvatar?window.bpAvatar(p.id,p.name,p.av,22):'')+E(p.name)+'</td>'+cells.map(c=>'<td class="mono">'+c+'</td>').join('')+'</tr>';
      const rows=[...P].sort((a,b)=>b.ml.best+b.gl.best/20-(a.ml.best+a.gl.best/20)).map(p=>tr(p,[
        p.survival?p.survival.score+sub((p.survival.avg==null?'':'avg error '+p.survival.avg.toFixed(2)+', ')+n(p.survivalRuns,'run','runs')):'<span class="muted">–</span>',
        p.ml.best+sub(n(p.ml.played,'game','games')),
        p.gl.best+sub(n(p.gl.played,'round','rounds')),
        p.cl.solved+'/'+p.cl.played,
        p.wd?p.wd.won+'/'+p.wd.played+sub('streak '+p.wd.streak):'<span class="muted">–</span>']));
      at.innerHTML='<div class="ftwrap"><table class="ft"><tr><th>Player</th>'+th('Survival best','Surv.')+th('More/Less best','M/L')+th('Guessless best','Guess.')+th('Clueless solved','Clue.')+th('Wordy won','Wordy')+'</tr>'+rows.join('')+'</table></div>';
    }catch(e){ at.innerHTML='<div class="muted">Could not load the all-time table.</div>'; }
  }
  function setView(v){
    frView=v;
    const $=id=>document.getElementById(id);
    document.querySelectorAll('#frSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===v?'true':'false'));
    $('dayBar').hidden=$('dayBody').hidden=v!=='day'; $('allTime').hidden=v!=='all'; $('h2h').hidden=v!=='h2h';
  }
  window.onFriendsTab=async function(){
    const el=document.getElementById('friendsBody'), $=id=>document.getElementById(id);
    if(!$('dayBody')){
      el.innerHTML='<div id="frBox"></div>'+
        '<div class="frbar"><div class="seg" id="frSeg" role="group" aria-label="Which table"><button type="button" data-view="day">By day</button><button type="button" data-view="all">All time</button><button type="button" data-view="h2h">Head-to-head<span class="ptag" id="h2hTag" hidden>Plus</span></button></div>'+
        '<div class="daybar" id="dayBar"><button type="button" class="ghost sm ic" id="dayPrev" aria-label="Earlier day with results">'+CHEV('M15 5l-7 7 7 7')+'</button>'+
          '<span class="daypick"><button type="button" class="ghost sm" id="dayLabel"></button><input type="date" id="dayPick" tabindex="-1" aria-hidden="true"></span>'+
          '<button type="button" class="ghost sm ic" id="dayNext" aria-label="Later day with results">'+CHEV('M9 5l7 7-7 7')+'</button><button type="button" class="ghost sm" id="dayToday" hidden>Today</button></div></div>'+
        '<div id="dayBody"></div><div id="allTime"></div><div id="h2h"></div>';
      $('frSeg').addEventListener('click',e=>{ const b=e.target.closest('[data-view]'); if(b) setView(b.dataset.view); });
      $('h2h').addEventListener('click',e=>{ const b=e.target.closest('[data-h2h]'); if(!b) return; const tr=$('h2h-'+b.dataset.h2h); tr.style.display=tr.style.display==='none'?'':'none'; });
      $('dayLabel').addEventListener('click',()=>{ const p=$('dayPick'); try{ p.showPicker(); }catch(e){ try{ p.focus(); p.click(); }catch(_){} } });
      $('dayPick').addEventListener('change',e=>{ if(e.target.value) loadDay(e.target.value); });
      $('dayPrev').addEventListener('click',()=>{ const d=prevDay(); if(d) loadDay(d); });
      $('dayNext').addEventListener('click',()=>{ const d=nextDay(); if(d) loadDay(d); });
      $('dayToday').addEventListener('click',()=>loadDay(todayKey()));
    }
    setView(frView);
    $('dayPick').max=todayKey();
    if(window.bpFriends){ window.bpFriends.draw(); window.bpFriends.load(); }
    await authReady; loadDay(dayDate||todayKey());
    loadH2H(); loadAllTime();
  };
})();
