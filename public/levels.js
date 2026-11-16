// Levels and achievements, as the server works them out (levels-server.js).
// This file only draws: the level chip, the panel in the side bar, the profile window, and a toast for what is new.
// It cannot change a number. The one thing it reports is what happens with Fermi (bot.js), which only the browser sees.
(function(){
'use strict';
const $ = id => document.getElementById(id);
const E = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let me = null, view = null, busy = false, again = false, timer = null;

async function call(method, url, body){
  const r = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// The server's reply, with what it says is new announced once.
function take(v){
  view = v;
  // the very first time a player may already have a pile of them: say so once
  if (v.first) { if (v.fresh.length) window.bpToast('Achievements', v.fresh.length + ' unlocked', 'You start at level ' + v.level + '.', openProfile, true); }
  else {
    if (v.fresh.length > 3) window.bpToast('Achievements', v.fresh.length + ' unlocked', '', openProfile, true);
    else v.fresh.forEach(a => window.bpToast('Achievement, +' + a.xp + ' XP', a.name, a.desc, openProfile, true));
    if (v.levelUp) window.bpToast('Level up', 'Level ' + v.level, v.title, openProfile, true);
  }
  render();
  window.dispatchEvent(new CustomEvent('bp-level', { detail: { perDay: v.perDay, level: v.level } }));
}
async function refresh(){
  if (!me) return;
  if (busy) { again = true; return; }
  busy = true;
  try { take(await call('GET', '/api/levels')); } catch (e) { /* offline or logged out: leave the chip as it is */ }
  busy = false;
  if (again) { again = false; refresh(); }
}
function soon(){ clearTimeout(timer); timer = setTimeout(refresh, 900); }

// ---------------------------------------------------------------- what you see
function render(){
  if (!view) return;
  const pct = Math.round(100 * view.into / view.need), have = view.achievements.filter(a => a.got).length;
  const chip = $('lvlChip');
  if (chip) { chip.classList.add('on'); chip.innerHTML = 'LV ' + view.level + '<i><u style="width:' + pct + '%"></u></i>'; chip.setAttribute('aria-label', 'Level ' + view.level + ', ' + view.title + '. Show your level and friends'); chip.title = 'Your level and friends'; }
  const box = $('sdLevel');
  if (box) box.innerHTML = '<div class="panel"><div class="phd"><h2>Level ' + view.level + '</h2><span>' + E(view.title) + '</span></div>' +
    '<div class="pbody"><div class="xpbar"><i style="width:' + pct + '%"></i></div><div class="xpnote">' + (view.need - view.into) + ' XP to level ' + (view.level + 1) + '</div></div>' +
    '<div class="prow" style="border-top:1px solid var(--line)"><span>Achievements</span><a href="#" data-profile="1">' + have + ' of ' + view.achievements.length + '</a></div></div>';
}
function openProfile(){
  if (!view || !window.bpModal) return;
  const A = view.achievements, pct = Math.round(100 * view.into / view.need), S = view.stats;
  const cell = (l, v) => '<div><span>' + l + '</span><b>' + v + '</b></div>';
  const groups = [...new Set(A.map(a => a.g))].map(g => {
    const list = A.filter(a => a.g === g);
    return '<h3 class="fh">' + E(g) + ' <span class="muted" style="font:500 13px var(--body);letter-spacing:0;text-transform:none">' + list.filter(a => a.got).length + ' of ' + list.length + '</span></h3><div class="ach-grid">' +
      list.map(a => {
        const hidden = a.secret && !a.got;
        let bar = '';
        if (!a.got && a.prog) { const w = Math.max(0, Math.min(100, Math.round(100 * a.prog[0] / a.prog[1]))); bar = '<div class="pg" title="' + a.prog[0] + ' of ' + a.prog[1] + '"><i style="width:' + w + '%"></i></div>'; }
        return '<div class="ach' + (a.got ? ' got' : '') + '"><span class="mk" aria-hidden="true"></span><div><b>' + (hidden ? 'Secret' : E(a.name)) + '</b><p>' + (hidden ? 'Hidden until you find it.' : E(a.desc)) + '</p>' + bar + '</div><span class="xp">' + (a.got ? '+' : '') + a.xp + ' XP</span></div>';
      }).join('') + '</div>';
  }).join('');
  window.bpModal.open({ title: 'Profile', wide: true, html:
    '<div class="pf-top"><div class="pf-lv"><span>Level</span><b>' + view.level + '</b></div><div><div class="pf-title">' + E(me.name || '') + ', ' + E(view.title) + '</div>' +
    '<div class="xpbar"><i style="width:' + pct + '%"></i></div><div class="xpnote">' + (view.need - view.into) + ' XP to level ' + (view.level + 1) + '</div></div></div>' +
    '<div class="pf-cells">' + cell('Days played', S.days) + cell('Daily games', S.dailies) + cell('All games', S.games) + cell('Best streak', S.bestStreak) + cell('Achievements', A.filter(a => a.got).length + ' of ' + A.length) + '</div>' +
    '<div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ghost sm" id="sfxBtn"></button><button type="button" class="ghost sm" data-account="1">Account and picture</button></div>' + groups });
  // the achievement chime can be switched off here
  const sfx = $('sfxBtn'), label = () => { sfx.textContent = window.bpSound.on() ? 'Sound on' : 'Sound off'; };
  label(); sfx.addEventListener('click', () => { window.bpSound.set(!window.bpSound.on()); label(); window.bpSound.chime(); });
}

// Fermi: the tour, finding him, annoying him, the quick draw. The server takes only these four, once each.
async function setFlag(id){
  if (!me || (view && view.achievements.some(a => a.id === id && a.got))) return;
  try { take(await call('POST', '/api/levels/flag', { id })); } catch (e) {}
}

document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-profile]'); if (a) { e.preventDefault(); openProfile(); } });
// the chip opens the side panel (ui.js); the achievements window opens from the link inside it
const chipEl = $('lvlChip'); if (chipEl) chipEl.addEventListener('click', () => { if (window.bpSide) window.bpSide.toggle(); else openProfile(); });
window.addEventListener('bp-saved', soon);
window.addEventListener('bp-bot', e => setFlag(e.detail));           // 'tour', 'poke', 'annoy' or 'flick', sent by bot.js
window.bpLevel = { open: openProfile, refresh };

if (window.claude && window.claude.use) {
  window.claude.use('user').then(u => u.id())
    .then(id => call('GET', '/api/me').catch(() => ({})).then(m => { me = { id, name: m.username || id }; refresh(); }))
    .catch(() => {});
}
})();
