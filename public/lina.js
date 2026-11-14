// Lina's Corner: Kitty Dress-Up (original artwork, all drawn in SVG)
(function(){
const root=document.getElementById('g-lina'); if(!root) return;
const E=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------- palettes ----------
const FURS={cream:{main:'#f6e7d2',shade:'#e8d3b6',label:'Cream'},ginger:{main:'#f2a65a',shade:'#d9853a',label:'Ginger'},grey:{main:'#b9bcc6',shade:'#9a9eab',label:'Grey'},
  black:{main:'#3b3640',shade:'#2a2630',label:'Midnight'},white:{main:'#fdfcfb',shade:'#e9e6e4',label:'Snow'},lilac:{main:'#d9c7ee',shade:'#c2abe0',label:'Lilac'},peach:{main:'#ffd4c2',shade:'#f5b9a3',label:'Peach'}};
const PATTERNS={none:'Plain',tabby:'Tabby',tuxedo:'Tuxedo',calico:'Calico',socks:'Socks'};
const EYES={green:'#6cc58a',blue:'#6aaee8',amber:'#f0b13c',violet:'#a77de0',brown:'#a0703f'};
const COLORS=['#ffb3c7','#ff8fab','#cdb4ff','#a0d8ff','#b8f2c8','#fff1a8','#ffd6a5','#ffffff','#f4a6a6','#9bb7ff','#3b3640'];
const HATS={none:'None',bow:'Big bow',flowers:'Flower crown',beret:'Beret',witch:'Witch hat',crown:'Tiny crown',strawberry:'Strawberry hat',party:'Party hat',bunny:'Bunny ears'};
const OUTFITS={none:'None',dress:'Dress',sweater:'Cozy sweater',raincoat:'Raincoat',tutu:'Tutu',overalls:'Overalls',cape:'Cape'};
const ACCS={none:'None',bell:'Bell collar',pearls:'Pearls',scarf:'Scarf',heartGlasses:'Heart glasses',roundGlasses:'Round glasses',bag:'Little bag',butterfly:'Butterfly'};
const BGS={room:'Pink room',garden:'Garden',night:'Starry night',beach:'Beach',cafe:'Café',clouds:'Clouds'};
const EXTRAS={blush:'Blush',sparkles:'Sparkles',hearts:'Floating hearts'};

let look=def();
function def(){return {name:'Mochi',fur:'cream',pattern:'none',eyes:'green',hat:'bow',hatColor:'#ff8fab',outfit:'dress',outfitColor:'#cdb4ff',acc:'bell',accColor:'#ffd6a5',bg:'room',extras:{blush:true,sparkles:false,hearts:false}};}

// ---------- drawing ----------
function bg(k){
  switch(k){
    case 'garden': return `<rect width="300" height="360" fill="#d8f3ff"/><rect y="250" width="300" height="110" fill="#bfe8b0"/>
      ${[30,80,240,270,55,215].map((x,i)=>`<g transform="translate(${x},${265+(i%3)*22})"><line y1="0" y2="18" stroke="#6bb36b" stroke-width="2"/>${[0,72,144,216,288].map(a=>`<circle cx="${6*Math.cos(a*Math.PI/180)}" cy="${6*Math.sin(a*Math.PI/180)}" r="4.5" fill="${['#ffb3c7','#fff1a8','#cdb4ff'][i%3]}"/>`).join('')}<circle r="3" fill="#ffd166"/></g>`).join('')}
      <circle cx="255" cy="50" r="22" fill="#fff4b0"/>`;
    case 'night': return `<rect width="300" height="360" fill="#2d2a5a"/>${Array.from({length:26},(_,i)=>`<circle cx="${(i*73)%300}" cy="${(i*41)%200+8}" r="${i%4===0?2:1.2}" fill="#fff" opacity="${0.5+(i%3)*0.2}"/>`).join('')}
      <circle cx="245" cy="60" r="24" fill="#fff6cf"/><circle cx="256" cy="52" r="22" fill="#2d2a5a"/><rect y="300" width="300" height="60" fill="#3d3a6e"/>`;
    case 'beach': return `<rect width="300" height="360" fill="#bfeaff"/><rect y="215" width="300" height="50" fill="#7fd1e8"/><path d="M0 230 Q 37 222 75 230 T 150 230 T 225 230 T 300 230 V265 H0Z" fill="#9adff0"/>
      <rect y="262" width="300" height="98" fill="#ffe7b3"/><circle cx="50" cy="55" r="24" fill="#fff1a8"/><circle cx="250" cy="320" r="7" fill="#ffb3c7"/><path d="M243 320 l7 -9 l7 9" fill="#ff8fab"/>`;
    case 'cafe': return `<rect width="300" height="360" fill="#f7e6d6"/><rect y="250" width="300" height="110" fill="#d9b48f"/>
      ${[0,1,2,3,4,5,6,7,8,9].map(i=>`<rect x="${i*30}" y="0" width="15" height="250" fill="#f2d9c4"/>`).join('')}<rect x="200" y="40" width="70" height="56" rx="6" fill="#fff" stroke="#c99a76" stroke-width="4"/><text x="235" y="74" font-size="14" text-anchor="middle" fill="#a0703f" font-family="sans-serif">menu</text>
      <g transform="translate(40,215)"><rect width="34" height="30" rx="5" fill="#fff"/><path d="M34 8 q12 0 0 16" fill="none" stroke="#fff" stroke-width="4"/><path d="M8 -6 q4 -8 0 -14 M18 -6 q4 -8 0 -14" stroke="#c9a68a" stroke-width="2" fill="none"/></g>`;
    case 'clouds': return `<rect width="300" height="360" fill="#ffe3ef"/>${[[50,70],[220,50],[130,30],[260,140],[30,170]].map(([x,y])=>`<g fill="#fff"><circle cx="${x}" cy="${y}" r="16"/><circle cx="${x+16}" cy="${y-6}" r="18"/><circle cx="${x+32}" cy="${y}" r="14"/></g>`).join('')}`;
    default: return `<rect width="300" height="360" fill="#ffe1ea"/><rect y="255" width="300" height="105" fill="#f7c6d4"/>
      <g transform="translate(205,40)"><rect width="70" height="80" rx="6" fill="#cfefff" stroke="#fff" stroke-width="6"/><line x1="35" y1="0" x2="35" y2="80" stroke="#fff" stroke-width="4"/><line x1="0" y1="40" x2="70" y2="40" stroke="#fff" stroke-width="4"/></g>
      <g transform="translate(30,60)" fill="#ffc2d4"><circle r="5"/><circle cx="40" cy="30" r="4"/><circle cx="10" cy="80" r="3"/></g>`;
  }
}
function cat(L){
  const f=FURS[L.fur], m=f.main, s=f.shade, eye=EYES[L.eyes], dark=L.fur==='black';
  const line=dark?'#1c1820':'#5a4a4f';
  const tail=`<path d="M205 300 C 265 300 270 240 245 215 C 235 205 228 215 238 225 C 255 245 245 285 205 285Z" fill="${m}" stroke="${s}" stroke-width="2"/>`;
  const body=`<ellipse cx="150" cy="275" rx="68" ry="62" fill="${m}"/>`;
  const paws=`<ellipse cx="122" cy="333" rx="18" ry="11" fill="${L.pattern==='socks'?'#fff':m}" stroke="${s}" stroke-width="2"/><ellipse cx="178" cy="333" rx="18" ry="11" fill="${L.pattern==='socks'?'#fff':m}" stroke="${s}" stroke-width="2"/>`;
  const chest=L.pattern==='tuxedo'?`<path d="M150 228 C 125 245 122 300 150 320 C 178 300 175 245 150 228Z" fill="#fff"/>`:'';
  const ears=`<path d="M86 118 L 80 52 L 130 92Z" fill="${m}"/><path d="M214 118 L 220 52 L 170 92Z" fill="${m}"/>
    <path d="M92 106 L 89 66 L 120 92Z" fill="#ffb8c8"/><path d="M208 106 L 211 66 L 180 92Z" fill="#ffb8c8"/>`;
  const head=`<ellipse cx="150" cy="150" rx="80" ry="68" fill="${m}"/>`;
  let pat='';
  if(L.pattern==='tabby') pat=`<g stroke="${s}" stroke-width="5" stroke-linecap="round" fill="none"><path d="M150 88 v18"/><path d="M134 92 l4 14"/><path d="M166 92 l-4 14"/><path d="M76 150 h16"/><path d="M78 166 h14"/><path d="M224 150 h-16"/><path d="M222 166 h-14"/></g>
    <g stroke="${s}" stroke-width="6" stroke-linecap="round"><path d="M100 262 h18"/><path d="M98 282 h16"/><path d="M200 262 h-18"/><path d="M202 282 h-16"/></g>`;
  if(L.pattern==='calico') pat=`<path d="M90 120 C 100 95 135 92 140 110 C 130 125 105 135 90 120Z" fill="#f2a65a"/><path d="M175 100 C 200 95 222 120 214 140 C 195 135 178 120 175 100Z" fill="#3b3640"/><ellipse cx="185" cy="285" rx="22" ry="16" fill="#f2a65a"/><ellipse cx="112" cy="300" rx="16" ry="12" fill="#3b3640"/>`;
  if(L.pattern==='tuxedo') pat=`<path d="M150 170 C 128 175 120 205 150 214 C 180 205 172 175 150 170Z" fill="#fff"/>`;
  const eyes=[118,182].map(x=>`<ellipse cx="${x}" cy="150" rx="13" ry="16" fill="${eye}"/><ellipse cx="${x}" cy="152" rx="6" ry="11" fill="#1d1a22"/><circle cx="${x+4}" cy="144" r="4" fill="#fff"/><circle cx="${x-4}" cy="158" r="2" fill="#fff"/>`).join('');
  const face=`<path d="M144 176 h12 l-6 7z" fill="#ff9bb0"/><path d="M150 183 q-6 9 -14 4 M150 183 q6 9 14 4" fill="none" stroke="${line}" stroke-width="2.5" stroke-linecap="round"/>
    <g stroke="${dark?'#8a8592':'#c9b8a8'}" stroke-width="2" stroke-linecap="round"><path d="M98 178 l-30 -4"/><path d="M98 186 l-30 4"/><path d="M202 178 l30 -4"/><path d="M202 186 l30 4"/></g>`;
  const blush=L.extras.blush?`<ellipse cx="104" cy="178" rx="13" ry="7" fill="#ff9bb0" opacity=".55"/><ellipse cx="196" cy="178" rx="13" ry="7" fill="#ff9bb0" opacity=".55"/>`:'';
  return {tail,body,paws,chest,ears,head,pat,eyes,face,blush};
}
function outfit(k,c){
  const dk=shade(c,-25);
  switch(k){
    case 'dress': return `<path d="M115 222 Q150 238 185 222 L 222 318 Q 150 340 78 318Z" fill="${c}"/><path d="M78 318 Q 150 340 222 318" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="2 9" stroke-linecap="round"/><circle cx="150" cy="240" r="6" fill="#fff"/><path d="M118 224 Q150 244 182 224" fill="none" stroke="${dk}" stroke-width="3"/>`;
    case 'sweater': return `<path d="M96 240 Q150 214 204 240 L 214 312 Q150 330 86 312Z" fill="${c}"/><path d="M118 226 Q150 246 182 226" fill="none" stroke="${dk}" stroke-width="10" stroke-linecap="round"/>${[110,130,150,170,190].map(x=>`<path d="M${x} 300 v14" stroke="${dk}" stroke-width="3"/>`).join('')}<circle cx="150" cy="275" r="8" fill="#fff" opacity=".7"/>`;
    case 'raincoat': return `<path d="M100 236 Q150 216 200 236 L 216 322 H84Z" fill="${c}"/><line x1="150" y1="230" x2="150" y2="322" stroke="${dk}" stroke-width="3"/>${[255,280,305].map(y=>`<circle cx="160" cy="${y}" r="4" fill="#fff"/>`).join('')}<path d="M110 236 L 150 254 L 190 236" fill="none" stroke="${dk}" stroke-width="4"/>`;
    case 'tutu': return `<rect x="96" y="270" width="108" height="12" rx="6" fill="${dk}"/>${Array.from({length:9},(_,i)=>`<ellipse cx="${88+i*15.5}" cy="${296}" rx="14" ry="20" fill="${c}" opacity=".9"/>`).join('')}`;
    case 'overalls': return `<path d="M108 262 H192 L 200 322 H100Z" fill="${c}"/><rect x="125" y="244" width="50" height="26" rx="4" fill="${c}"/><path d="M125 246 L 112 226 M175 246 L 188 226" stroke="${c}" stroke-width="8" stroke-linecap="round"/><circle cx="130" cy="252" r="3.5" fill="#fff"/><circle cx="170" cy="252" r="3.5" fill="#fff"/><rect x="140" y="285" width="20" height="14" rx="3" fill="${dk}"/>`;
    case 'cape': return `<path d="M104 226 Q150 240 196 226 L 236 330 Q 150 345 64 330Z" fill="${c}" opacity=".95"/><circle cx="150" cy="232" r="9" fill="#ffd166"/>`;
    default: return '';
  }
}
function hat(k,c){
  const dk=shade(c,-25);
  switch(k){
    case 'bow': return `<g transform="translate(150,86)"><path d="M0 0 C -30 -28 -54 -6 -46 10 C -40 22 -14 14 0 0Z" fill="${c}"/><path d="M0 0 C 30 -28 54 -6 46 10 C 40 22 14 14 0 0Z" fill="${c}"/><circle r="9" fill="${dk}"/></g>`;
    case 'flowers': return `<path d="M82 112 Q150 70 218 112" fill="none" stroke="#7cc47c" stroke-width="5"/>${[90,112,136,164,188,210].map((x,i)=>{const y=106-Math.sin((x-82)/136*Math.PI)*28;const col=[c,'#fff1a8','#ffffff'][i%3];return `<g transform="translate(${x},${y})">${[0,72,144,216,288].map(a=>`<circle cx="${7*Math.cos(a*Math.PI/180)}" cy="${7*Math.sin(a*Math.PI/180)}" r="6" fill="${col}"/>`).join('')}<circle r="4" fill="#ffd166"/></g>`;}).join('')}`;
    case 'beret': return `<ellipse cx="160" cy="88" rx="62" ry="22" fill="${c}" transform="rotate(-10 160 88)"/><circle cx="166" cy="64" r="5" fill="${dk}"/>`;
    case 'witch': return `<ellipse cx="150" cy="96" rx="84" ry="14" fill="${dk}"/><path d="M110 94 L 165 10 L 192 94Z" fill="${c}"/><rect x="112" y="80" width="78" height="12" fill="#ffd166"/>`;
    case 'crown': return `<path d="M120 92 L 120 58 L 135 74 L 150 50 L 165 74 L 180 58 L 180 92Z" fill="#ffd166" stroke="#e6b84a" stroke-width="2"/><circle cx="150" cy="78" r="5" fill="${c}"/><circle cx="130" cy="84" r="3.5" fill="${c}"/><circle cx="170" cy="84" r="3.5" fill="${c}"/>`;
    case 'strawberry': return `<path d="M88 100 Q 150 0 212 100 Q 150 116 88 100Z" fill="#ff6b81"/>${[[120,70],[150,52],[178,72],[132,92],[166,90],[150,76]].map(([x,y])=>`<ellipse cx="${x}" cy="${y}" rx="2.5" ry="4" fill="#fff1a8"/>`).join('')}<path d="M130 40 Q150 22 170 40 Q150 48 130 40Z" fill="#6bc46b"/><rect x="147" y="20" width="6" height="16" rx="3" fill="#6bc46b"/>`;
    case 'party': return `<path d="M128 92 L 160 20 L 182 92Z" fill="${c}"/><path d="M137 72 L 172 72 M146 52 L 167 52" stroke="#fff" stroke-width="5"/><circle cx="160" cy="20" r="8" fill="#ffd166"/>`;
    case 'bunny': return `<path d="M96 108 Q 150 70 204 108" fill="none" stroke="${dk}" stroke-width="6"/><ellipse cx="118" cy="44" rx="14" ry="42" fill="#fff" stroke="${c}" stroke-width="3" transform="rotate(-12 118 44)"/><ellipse cx="182" cy="44" rx="14" ry="42" fill="#fff" stroke="${c}" stroke-width="3" transform="rotate(12 182 44)"/><ellipse cx="118" cy="46" rx="6" ry="28" fill="${c}" transform="rotate(-12 118 46)"/><ellipse cx="182" cy="46" rx="6" ry="28" fill="${c}" transform="rotate(12 182 46)"/>`;
    default: return '';
  }
}
function acc(k,c){
  switch(k){
    case 'bell': return `<path d="M100 214 Q150 236 200 214" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round"/><circle cx="150" cy="232" r="10" fill="#ffd166" stroke="#e6b84a" stroke-width="2"/><line x1="150" y1="234" x2="150" y2="240" stroke="#a5822e" stroke-width="2"/>`;
    case 'pearls': return Array.from({length:11},(_,i)=>{const t=i/10;const x=104+92*t, y=216+Math.sin(t*Math.PI)*20;return `<circle cx="${x}" cy="${y}" r="5.5" fill="#fffaf2" stroke="#e8dccb"/>`;}).join('');
    case 'scarf': return `<path d="M98 210 Q150 238 202 210 L 204 226 Q150 254 96 226Z" fill="${c}"/><path d="M172 228 L 180 290 L 196 286 L 186 224Z" fill="${c}"/><path d="M180 290 l 4 8 M188 288 l 4 8" stroke="${shade(c,-25)}" stroke-width="2"/>`;
    case 'heartGlasses': return [118,182].map(x=>`<path transform="translate(${x},150)" d="M0 10 C -26 -6 -16 -26 0 -12 C 16 -26 26 -6 0 10Z" fill="${c}" opacity=".75" stroke="${shade(c,-30)}" stroke-width="2.5"/>`).join('')+`<path d="M134 146 q16 -6 32 0" stroke="${shade(c,-30)}" stroke-width="3" fill="none"/>`;
    case 'roundGlasses': return `<circle cx="118" cy="150" r="21" fill="#fff" fill-opacity=".15" stroke="${c==='#ffffff'?'#5a4a4f':c}" stroke-width="4"/><circle cx="182" cy="150" r="21" fill="#fff" fill-opacity=".15" stroke="${c==='#ffffff'?'#5a4a4f':c}" stroke-width="4"/><path d="M139 148 q11 -6 22 0" stroke="${c==='#ffffff'?'#5a4a4f':c}" stroke-width="4" fill="none"/>`;
    case 'bag': return `<path d="M200 222 Q 232 250 226 292" fill="none" stroke="${shade(c,-25)}" stroke-width="3"/><rect x="208" y="286" width="40" height="32" rx="8" fill="${c}"/><path d="M216 296 h24" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="228" cy="306" r="3" fill="#ffd166"/>`;
    case 'butterfly': return `<g transform="translate(222,112) rotate(-15)"><ellipse cx="-9" cy="-6" rx="10" ry="12" fill="${c}"/><ellipse cx="9" cy="-6" rx="10" ry="12" fill="${c}"/><ellipse cx="-7" cy="9" rx="7" ry="8" fill="${shade(c,-15)}"/><ellipse cx="7" cy="9" rx="7" ry="8" fill="${shade(c,-15)}"/><rect x="-1.5" y="-12" width="3" height="26" rx="1.5" fill="#5a4a4f"/></g>`;
    default: return '';
  }
}
function extrasFront(L){
  let s='';
  if(L.extras.sparkles) s+=[[60,110],[245,190],[70,240],[235,95],[40,190]].map(([x,y],i)=>`<path class="twinkle" style="animation-delay:${i*0.3}s" transform="translate(${x},${y}) scale(${0.8+(i%2)*0.5})" d="M0 -10 L3 -3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3 -3Z" fill="#fff6b0"/>`).join('');
  if(L.extras.hearts) s+=[[55,150],[240,140],[250,240]].map(([x,y],i)=>`<path class="floaty" style="animation-delay:${i*0.6}s" transform="translate(${x},${y})" d="M0 6 C -14 -4 -8 -14 0 -6 C 8 -14 14 -4 0 6Z" fill="#ff8fab"/>`).join('');
  return s;
}
function shade(hex,amt){ let n=parseInt(hex.slice(1),16); let r=Math.max(0,Math.min(255,(n>>16)+amt)),g=Math.max(0,Math.min(255,((n>>8)&255)+amt)),b=Math.max(0,Math.min(255,(n&255)+amt)); return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0'); }
// one dressed cat, drawn in a 300 x 360 box
function kitty(L){
  const c=cat(L); const capeBehind=L.outfit==='cape'?outfit('cape',L.outfitColor):'';
  return `<g class="kitty">${capeBehind}${c.tail}${c.body}${c.chest}${L.outfit!=='cape'?outfit(L.outfit,L.outfitColor):''}${c.paws}
    ${c.ears}${c.head}${c.pat}${c.eyes}${c.face}${c.blush}${acc(L.acc,L.accColor)}${hat(L.hat,L.hatColor)}</g>`;
}
// ---------- scenes: several saved kitties side by side on one wide background ----------
const SCENE_W=640, SCENE_MAX=5;
function wideBg(k){
  const W=SCENE_W, flower=(x,y,i)=>`<g transform="translate(${x},${y})"><line y1="0" y2="18" stroke="#6bb36b" stroke-width="2"/>${[0,72,144,216,288].map(a=>`<circle cx="${6*Math.cos(a*Math.PI/180)}" cy="${6*Math.sin(a*Math.PI/180)}" r="4.5" fill="${['#ffb3c7','#fff1a8','#cdb4ff'][i%3]}"/>`).join('')}<circle r="3" fill="#ffd166"/></g>`;
  const cloud=(x,y)=>`<g fill="#fff"><circle cx="${x}" cy="${y}" r="16"/><circle cx="${x+16}" cy="${y-6}" r="18"/><circle cx="${x+32}" cy="${y}" r="14"/></g>`;
  switch(k){
    case 'garden': return `<rect width="${W}" height="360" fill="#d8f3ff"/><rect y="250" width="${W}" height="110" fill="#bfe8b0"/>${Array.from({length:13},(_,i)=>flower(22+i*50+(i%2)*14,262+(i%3)*24,i)).join('')}<circle cx="${W-60}" cy="52" r="24" fill="#fff4b0"/>${cloud(70,60)}${cloud(300,40)}`;
    case 'night': return `<rect width="${W}" height="360" fill="#2d2a5a"/>${Array.from({length:54},(_,i)=>`<circle cx="${(i*73)%W}" cy="${(i*41)%200+8}" r="${i%4===0?2:1.2}" fill="#fff" opacity="${0.5+(i%3)*0.2}"/>`).join('')}
      <circle cx="${W-70}" cy="60" r="26" fill="#fff6cf"/><circle cx="${W-58}" cy="52" r="24" fill="#2d2a5a"/><rect y="300" width="${W}" height="60" fill="#3d3a6e"/>`;
    case 'beach': return `<rect width="${W}" height="360" fill="#bfeaff"/><rect y="215" width="${W}" height="50" fill="#7fd1e8"/><path d="M0 230 ${Array.from({length:Math.ceil(W/75)},(_,i)=>(i?'T':'Q '+37+' 222')+' '+(75*(i+1))+' 230').join(' ')} V265 H0Z" fill="#9adff0"/>
      <rect y="262" width="${W}" height="98" fill="#ffe7b3"/><circle cx="70" cy="55" r="26" fill="#fff1a8"/><circle cx="${W-50}" cy="322" r="7" fill="#ffb3c7"/><path d="M${W-57} 322 l7 -9 l7 9" fill="#ff8fab"/><circle cx="40" cy="330" r="6" fill="#a0d8ff"/>`;
    case 'cafe': return `<rect width="${W}" height="360" fill="#f7e6d6"/><rect y="250" width="${W}" height="110" fill="#d9b48f"/>${Array.from({length:Math.ceil(W/30)},(_,i)=>`<rect x="${i*30}" y="0" width="15" height="250" fill="#f2d9c4"/>`).join('')}
      <rect x="${W-110}" y="40" width="70" height="56" rx="6" fill="#fff" stroke="#c99a76" stroke-width="4"/><text x="${W-75}" y="74" font-size="14" text-anchor="middle" fill="#a0703f" font-family="sans-serif">menu</text>
      <g transform="translate(34,215)"><rect width="34" height="30" rx="5" fill="#fff"/><path d="M34 8 q12 0 0 16" fill="none" stroke="#fff" stroke-width="4"/><path d="M8 -6 q4 -8 0 -14 M18 -6 q4 -8 0 -14" stroke="#c9a68a" stroke-width="2" fill="none"/></g>`;
    case 'clouds': return `<rect width="${W}" height="360" fill="#ffe3ef"/>${[[50,70],[220,50],[130,30],[260,140],[30,170],[390,80],[520,44],[470,150],[580,120],[340,170]].map(([x,y])=>cloud(x,y)).join('')}`;
    default: return `<rect width="${W}" height="360" fill="#ffe1ea"/><rect y="255" width="${W}" height="105" fill="#f7c6d4"/>
      ${[60,W-130].map(x=>`<g transform="translate(${x},40)"><rect width="70" height="80" rx="6" fill="#cfefff" stroke="#fff" stroke-width="6"/><line x1="35" y1="0" x2="35" y2="80" stroke="#fff" stroke-width="4"/><line x1="0" y1="40" x2="70" y2="40" stroke="#fff" stroke-width="4"/></g>`).join('')}
      <g fill="#ffc2d4">${[[200,60],[250,95],[330,50],[400,100],[300,130]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${3+i%3}"/>`).join('')}</g>`;
  }
}
function sceneSvg(S,withNames){
  const n=S.cats.length, W=SCENE_W;
  // the cats share the width evenly, shrink when it gets crowded, and all stand on the same line
  const s=Math.min(0.92,(W-10)/(Math.max(n,1)*218));
  const cats=S.cats.map((L,i)=>{
    const cx=W*(i+0.5)/n, tx=cx-150*s, ty=340-344*s, w=Math.min(140,(L.name||'').length*7+24);
    return `<g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${s.toFixed(3)})">${kitty(L)}${extrasFront(L)}${withNames&&L.name?`<g><rect x="${150-w/2}" y="4" width="${w}" height="26" rx="13" fill="#fff" opacity=".85"/><text x="150" y="22" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="700" font-size="14" fill="#c4577a">${E(L.name)}</text></g>`:''}</g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} 360" xmlns="http://www.w3.org/2000/svg">${wideBg(S.bg)}${cats}</svg>`;
}
function svg(L,withName){
  return `<svg viewBox="0 0 300 360" xmlns="http://www.w3.org/2000/svg">${bg(L.bg)}
    ${kitty(L)}${extrasFront(L)}
    ${withName&&L.name?`<g><rect x="${150-Math.min(140,L.name.length*7+24)/2}" y="8" width="${Math.min(140,L.name.length*7+24)}" height="26" rx="13" fill="#fff" opacity=".85"/><text x="150" y="26" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="700" font-size="14" fill="#c4577a">${E(L.name)}</text></g>`:''}</svg>`;
}

// ---------- UI ----------
root.innerHTML=`<div class="card lina">
  <div class="navrow"><h2 style="margin:0;font-size:22px">Kitty Dress-Up <span style="color:#ff8fab">♡</span></h2><span class="muted" id="linaSaveNote" style="font-size:12px"></span></div>
  <div class="lgrid">
    <div><div class="stage" id="linaStage" title="Pet me!"></div>
      <div class="lrow"><input type="text" id="linaName" maxlength="16" placeholder="Kitty's name">
      <button class="pink" id="linaRandom">Surprise me</button></div>
      <div class="lrow"><button class="pink" id="linaSave">Save to closet</button><button class="ghost" id="linaDl">Download picture</button></div>
    </div>
    <div><div class="ltabs" id="linaTabs"></div><div class="lopts" id="linaOpts"></div></div>
  </div>
  <h3 class="fh" style="color:#ff8fab">Closet</h3><div class="closet" id="linaCloset"></div>
  <h3 class="fh" style="color:#ff8fab">Scene</h3>
  <div class="scene" id="linaScene"></div>
  <div class="lopts" id="linaSceneCats"></div>
  <div class="lopts" id="linaSceneBg"></div>
  <div class="lrow"><button class="ghost" id="linaSceneDl">Download scene</button><button class="ghost" id="linaSceneClear">Clear scene</button><span class="muted" id="linaSceneNote" style="font-size:13px" role="status"></span></div>
</div>`;
const TABS=[['fur','Fur'],['eyes','Eyes'],['hat','Hats'],['outfit','Outfits'],['acc','Accessories'],['bg','Backgrounds'],['extras','Extras']];
let tab='fur', closet=[], col=null, sure=-1, scene={bg:'garden',cats:[]};
function draw(){ document.getElementById('linaStage').innerHTML=svg(look,true); }
function chip(label,sel,attrs){return `<button class="lchip${sel?' sel':''}" ${attrs}>${E(label)}</button>`;}
function swatches(field){return `<div class="swl muted">Colour</div><div class="sw">${COLORS.map(c=>`<button class="swb${look[field]===c?' sel':''}" style="background:${c}" data-col="${field}" data-v="${c}" aria-label="colour ${c}"></button>`).join('')}</div>`;}
function opts(){
  document.getElementById('linaTabs').innerHTML=TABS.map(([k,l])=>`<button class="ltab${tab===k?' sel':''}" data-tab="${k}">${l}</button>`).join('');
  let h='';
  if(tab==='fur') h=`<div class="swl muted">Fur colour</div>`+Object.entries(FURS).map(([k,v])=>chip(v.label,look.fur===k,`data-set="fur" data-v="${k}"`)).join('')+`<div class="swl muted">Pattern</div>`+Object.entries(PATTERNS).map(([k,v])=>chip(v,look.pattern===k,`data-set="pattern" data-v="${k}"`)).join('');
  if(tab==='eyes') h=Object.entries(EYES).map(([k,v])=>`<button class="lchip${look.eyes===k?' sel':''}" data-set="eyes" data-v="${k}"><span class="dot" style="background:${v}"></span>${k[0].toUpperCase()+k.slice(1)}</button>`).join('');
  if(tab==='hat') h=Object.entries(HATS).map(([k,v])=>chip(v,look.hat===k,`data-set="hat" data-v="${k}"`)).join('')+swatches('hatColor');
  if(tab==='outfit') h=Object.entries(OUTFITS).map(([k,v])=>chip(v,look.outfit===k,`data-set="outfit" data-v="${k}"`)).join('')+swatches('outfitColor');
  if(tab==='acc') h=Object.entries(ACCS).map(([k,v])=>chip(v,look.acc===k,`data-set="acc" data-v="${k}"`)).join('')+swatches('accColor');
  if(tab==='bg') h=Object.entries(BGS).map(([k,v])=>chip(v,look.bg===k,`data-set="bg" data-v="${k}"`)).join('');
  if(tab==='extras') h=Object.entries(EXTRAS).map(([k,v])=>chip((look.extras[k]?'✓ ':'')+v,look.extras[k],`data-ex="${k}"`)).join('');
  document.getElementById('linaOpts').innerHTML=h;
}
root.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b||!root.contains(b)) return;
  if(b.dataset.tab){ tab=b.dataset.tab; opts(); return; }
  if(b.dataset.set){ look[b.dataset.set]=b.dataset.v; }
  else if(b.dataset.col){ look[b.dataset.col]=b.dataset.v; }
  else if(b.dataset.ex){ look.extras[b.dataset.ex]=!look.extras[b.dataset.ex]; }
  else return;
  opts(); draw();
});
const pick=o=>{const k=Object.keys(o);return k[Math.floor(Math.random()*k.length)];};
const pickC=()=>COLORS[Math.floor(Math.random()*COLORS.length)];
document.getElementById('linaRandom').addEventListener('click',()=>{
  look={...look,fur:pick(FURS),pattern:pick(PATTERNS),eyes:pick(EYES),hat:pick(HATS),hatColor:pickC(),outfit:pick(OUTFITS),outfitColor:pickC(),acc:pick(ACCS),accColor:pickC(),bg:pick(BGS),
    extras:{blush:Math.random()<.8,sparkles:Math.random()<.4,hearts:Math.random()<.3}};
  opts(); draw();
});
document.getElementById('linaName').addEventListener('input',e=>{look.name=e.target.value; draw();});
// petting
document.getElementById('linaStage').addEventListener('click',e=>{
  const st=e.currentTarget, r=st.getBoundingClientRect();
  for(let i=0;i<5;i++){ const h=document.createElement('span'); h.className='pet'; h.textContent=i===0?'purr~':'♡';
    h.style.left=(e.clientX-r.left+(Math.random()*60-30))+'px'; h.style.top=(e.clientY-r.top)+'px'; h.style.animationDelay=(i*0.08)+'s';
    st.appendChild(h); setTimeout(()=>h.remove(),1300); }
  const k=st.querySelector('.kitty'); if(k){ k.classList.remove('wiggle'); void k.getBBox; k.classList.add('wiggle'); setTimeout(()=>k.classList.remove('wiggle'),500); }
});
// download picture
document.getElementById('linaDl').addEventListener('click',()=>{
  const s=svg(look,true).replace(/class="(twinkle|floaty)"/g,''); const img=new Image();
  img.onload=()=>{ const c=document.createElement('canvas'); c.width=900; c.height=1080; c.getContext('2d').drawImage(img,0,0,900,1080);
    const a=document.createElement('a'); a.download=(look.name||'kitty').replace(/[^\w\- ]/g,'')+'.png'; a.href=c.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove(); };
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
});
// closet (saved to the account when available, this browser otherwise)
function loadLocal(){try{return JSON.parse(localStorage.getItem('bp_lina')||'[]');}catch(e){return [];}}
function persist(){
  try{localStorage.setItem('bp_lina',JSON.stringify(closet)); localStorage.setItem('bp_lina_scene',JSON.stringify(scene));}catch(e){}
  if(col) col.doc('x_lina').set({looks:closet,scene}).catch(()=>{});
}
const okScene=s=>s&&typeof s==='object'&&Array.isArray(s.cats)?{bg:BGS[s.bg]?s.bg:'garden',cats:s.cats.filter(c=>c&&FURS[c.fur]&&c.extras).slice(0,SCENE_MAX)}:null;
function renderCloset(){
  const el=document.getElementById('linaCloset');
  el.innerHTML=closet.length?closet.map((L,i)=>`<div class="cl"><button class="clpick" data-i="${i}" title="Wear this look">${svg(L,false)}</button><div class="cln">${E(L.name||'Kitty')}</div>`+
      (sure===i?`<div class="clsure" role="alertdialog" aria-label="Delete ${E(L.name||'this kitty')}?"><b>Delete ${E(L.name||'this kitty')}?</b><button class="pink" data-yes="${i}">Delete</button><button class="ghost" data-no="1">Keep</button></div>`
        :`<button class="cldel" data-del="${i}" title="Delete" aria-label="Delete ${E(L.name||'kitty')}">×</button><button class="cladd" data-add="${i}" title="Add to the scene" aria-label="Add ${E(L.name||'kitty')} to the scene">+</button>`)+`</div>`).join('')
    :'<div class="muted" style="font-size:13px">Nothing saved yet. Dress up your kitty and press "Save to closet".</div>';
}
document.getElementById('linaCloset').addEventListener('click',e=>{
  const p=e.target.closest('[data-i]'), d=e.target.closest('[data-del]'), y=e.target.closest('[data-yes]'), a=e.target.closest('[data-add]');
  if(d){ sure=+d.dataset.del; renderCloset(); const k=document.querySelector('#linaCloset [data-no]'); if(k) k.focus(); return; }   // only asks
  if(e.target.closest('[data-no]')){ sure=-1; renderCloset(); return; }
  if(y){ closet.splice(+y.dataset.yes,1); sure=-1; persist(); renderCloset(); return; }
  if(a){ addToScene(closet[+a.dataset.add]); return; }
  if(sure>=0){ sure=-1; renderCloset(); return; }
  if(p){ look=JSON.parse(JSON.stringify(closet[+p.dataset.i])); document.getElementById('linaName').value=look.name||''; opts(); draw(); }
});
// ---------- scene ----------
const note=t=>{ document.getElementById('linaSceneNote').textContent=t||''; };
function renderScene(){
  const st=document.getElementById('linaScene'), n=scene.cats.length;
  st.innerHTML=n?sceneSvg(scene,true):'<div class="muted scene-empty">Put your saved kitties together in one picture: press + on a kitty in the closet.</div>';
  document.getElementById('linaSceneCats').innerHTML=scene.cats.map((L,i)=>`<button class="lchip" data-out="${i}" title="Take out of the scene">${E(L.name||'Kitty')} ×</button>`).join('');
  document.getElementById('linaSceneBg').innerHTML=n?Object.entries(BGS).map(([k,v])=>chip(v,scene.bg===k,`data-sbg="${k}"`)).join(''):'';
  document.getElementById('linaSceneDl').hidden=document.getElementById('linaSceneClear').hidden=!n;
  const c=document.getElementById('linaSceneClear'); c.textContent='Clear scene'; delete c.dataset.sure;
}
function addToScene(L){
  if(scene.cats.length>=SCENE_MAX){ note('A scene holds up to '+SCENE_MAX+' kitties.'); document.getElementById('linaScene').scrollIntoView({block:'nearest'}); return; }
  if(!scene.cats.length) scene.bg=L.bg;                       // the first kitty brings its background along
  scene.cats.push(JSON.parse(JSON.stringify(L))); persist(); renderScene(); note((L.name||'Kitty')+' joined the scene.');
}
document.getElementById('linaSceneCats').addEventListener('click',e=>{ const b=e.target.closest('[data-out]'); if(!b) return; scene.cats.splice(+b.dataset.out,1); persist(); renderScene(); note(''); });
document.getElementById('linaSceneBg').addEventListener('click',e=>{ const b=e.target.closest('[data-sbg]'); if(!b) return; scene.bg=b.dataset.sbg; persist(); renderScene(); });
document.getElementById('linaSceneClear').addEventListener('click',e=>{
  const b=e.currentTarget;
  if(!b.dataset.sure){ b.dataset.sure='1'; b.textContent='Really clear it?'; return; }      // asks first
  scene.cats=[]; persist(); renderScene(); note('');
});
document.getElementById('linaSceneDl').addEventListener('click',()=>{
  const s=sceneSvg(scene,true).replace(/class="(twinkle|floaty)"/g,''); const img=new Image();
  img.onload=()=>{ const c=document.createElement('canvas'); c.width=SCENE_W*3; c.height=1080; c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    const a=document.createElement('a'); a.download='kitty-scene.png'; a.href=c.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove(); };
  img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
});
document.getElementById('linaSave').addEventListener('click',()=>{
  if(closet.length>=24) closet.pop();
  sure=-1; closet.unshift(JSON.parse(JSON.stringify(look))); persist(); renderCloset();
  const b=document.getElementById('linaSave'); b.textContent='Saved ♡'; setTimeout(()=>b.textContent='Save to closet',1200);
});
(async()=>{
  closet=loadLocal(); try{ scene=okScene(JSON.parse(localStorage.getItem('bp_lina_scene')||'null'))||scene; }catch(e){} renderCloset(); renderScene();
  try{ if(!window.claude||!claude.use) return; const db=await claude.use('db'), u=await claude.use('user'); const id=u&&await u.id(); if(!db||!id) return;
    col=db.collection('data/users/'+id); const d=await col.doc('x_lina').get();
    if(d.exists && Array.isArray(d.data().looks)){ closet=d.data().looks; scene=okScene(d.data().scene)||{bg:'garden',cats:[]}; try{localStorage.setItem('bp_lina',JSON.stringify(closet)); localStorage.setItem('bp_lina_scene',JSON.stringify(scene));}catch(e){} renderCloset(); renderScene(); }
    document.getElementById('linaSaveNote').textContent='Closet saved to your account';
  }catch(e){}
})();
document.getElementById('linaName').value=look.name; opts(); draw();
})();
