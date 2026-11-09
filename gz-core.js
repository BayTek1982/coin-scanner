// Bayazit Golden Zone & SK-System – gemeinsame Berechnung für Webseite (golden-zone.html) und Aktien-Skript (gz_stocks.js)
"use strict";
// ===== ANALYSE-START =====
const SK_LV=[0.5,0.559,0.618,0.667,0.786,0.886];
function pivots(k,L){const ph=[],pl=[],n=k.length;
  for(let i=L;i<n-L;i++){let H=true,Lo=true;
    for(let j=i-L;j<=i+L&&(H||Lo);j++){if(j===i)continue;
      if(j<i){if(k[j].h>=k[i].h)H=false;if(k[j].l<=k[i].l)Lo=false}
      else{if(k[j].h>k[i].h)H=false;if(k[j].l<k[i].l)Lo=false}}
    if(H)ph.push({i,p:k[i].h});if(Lo)pl.push({i,p:k[i].l})}
  return{ph,pl}}
function structure(k,pv,L){const n=k.length,conf={};let lastH=null,lastL=null,trend=0,flip=-1;const ev=[];
  pv.ph.forEach(p=>(conf[p.i+L]=conf[p.i+L]||[]).push({i:p.i,p:p.p,t:1}));
  pv.pl.forEach(p=>(conf[p.i+L]=conf[p.i+L]||[]).push({i:p.i,p:p.p,t:-1}));
  for(let j=0;j<n;j++){(conf[j]||[]).forEach(p=>{if(p.t===1)lastH={i:p.i,p:p.p,br:false};else lastL={i:p.i,p:p.p,br:false}});
    const c=k[j].c;
    if(lastH&&!lastH.br&&c>lastH.p){lastH.br=true;ev.push({d:1,bar:j,piv:lastH});if(trend!==1){trend=1;flip=j}}
    if(lastL&&!lastL.br&&c<lastL.p){lastL.br=true;ev.push({d:-1,bar:j,piv:lastL});if(trend!==-1){trend=-1;flip=j}}}
  return{trend,flip,ev}}
const mir=k=>k.map(x=>({t:x.t,o:-x.o,h:-x.l,l:-x.h,c:-x.c}));
// Bewegung im Aufwärtstrend (gespiegelte Kerzen für Short)
function legUp(k,pv,st){const n=k.length;const fe=st.ev.filter(e=>e.d===1&&e.bar>=st.flip);if(!fe.length)return null;
  const first=fe[0];let H=null;
  for(const p of pv.ph)if(p.i>first.piv.i&&p.p>first.piv.p&&(!H||p.p>H.p))H=p;
  let ref=first,Hi,Hp,run=false;
  if(H){for(const e of fe)if(e.bar<=H.i)ref=e;Hi=H.i;Hp=H.p}
  else{run=true;Hp=-Infinity;Hi=first.bar;for(let j=first.piv.i;j<n-1;j++)if(k[j].h>Hp){Hp=k[j].h;Hi=j}}
  let Lp=Infinity,Li=ref.piv.i;for(let j=ref.piv.i;j<=Math.min(ref.bar,Hi);j++)if(k[j].l<Lp){Lp=k[j].l;Li=j}
  if(!(Hp>Lp))return null;return{Hi,Hp,Li,Lp,run}}
function analyzeStd(k,L){const n=k.length;if(!k||n<2*L+10)return null;
  const pv=pivots(k,L),st=structure(k,pv,L);if(!st.trend)return{dir:0};
  const dir=st.trend,kk=dir===1?k:mir(k);let pv2=pv,st2=st;if(dir===-1){pv2=pivots(kk,L);st2=structure(kk,pv2,L)}
  const lg=legUp(kk,pv2,st2);const flipAgo=n-1-st.flip;if(!lg)return{dir,flipAgo,fresh:flipAgo<=3};
  const R=lg.Hp-lg.Lp,P=x=>dir*(lg.Hp-x*R),price=k[n-1].c,r=(lg.Hp-kk[n-1].c)/R;
  const z1=lg.Hp-0.618*R,z2=lg.Hp-0.786*R;let touch=-1;
  for(let j=Math.max(lg.Hi,lg.Li)+1;j<n;j++)if(kk[j].l<=z1&&kk[j].h>=z2)touch=j;
  const cat=r>1?"inv":r>0.786?"deep":r>=0.618?"gz":r>=0.5?"near":r>-0.272?"trend":r>-0.618?"tp1":"tp2";
  return{dir,flipAgo,fresh:flipAgo<=3,r,cat,price,Hi:lg.Hi,Li:lg.Li,run:lg.run,
    lv:{h:P(0),l:P(1),f5:P(0.5),g1:P(0.618),g2:P(0.786),tp1:P(-0.272),tp2:P(-0.618)},
    touchAgo:touch<0?null:n-1-touch,from:Math.min(lg.Hi,lg.Li)}}
// SK-Struktur Short (0 Hoch, A Tief, B tieferes Hoch); Long = gespiegelt
function skDown(k,pv){const n=k.length;let best=null;const highs=pv.ph.slice(-12);
  for(let hI=0;hI<highs.length;hI++){const h0=highs[hI];
    const prev=pv.ph.filter(p=>p.i<h0.i).pop();if(prev&&prev.p>=h0.p)continue; // 0 muss ein höheres Hoch sein
    for(const p of pv.ph){if(p.i<=h0.i)continue;if(p.p>=h0.p)break;
      let A={i:-1,p:Infinity};for(let j=h0.i+1;j<p.i;j++)if(k[j].l<A.p)A={i:j,p:k[j].l};
      if(A.i<0)continue;
      if(p.p>=A.p+0.5*(h0.p-A.p)){const s=simDown(k,h0,A,p);if(s&&(!best||s.key>best.key))best=s;break}}}
  return best}
function simDown(k,h0,A,B){const n=k.length;const z={i:h0.i,p:h0.p};let a={...A},b={i:B.i,p:B.p},phase=1,brk=-1,c=null,goal=false;
  for(let j=B.i+1;j<n;j++){const x=k[j];if(x.h>z.p)return null;
    if(phase===1){if(x.h>b.p)b={i:j,p:x.h};if(x.c<a.p){phase=2;brk=j;c={i:j,p:x.l}}}
    else{if(x.h>b.p){a={...c};b={i:j,p:x.h};phase=1;goal=false;c=null;brk=-1;if(x.c<a.p){phase=2;brk=j;c={i:j,p:x.l}}continue}
      if(x.l<c.p)c={i:j,p:x.l};if(!goal&&x.l<=z.p-1.618*(z.p-a.p))goal=true}}
  return{z,a,b,c,phase,goal,brk,key:Math.max(b.i,brk,c?c.i:-1)}}
function analyzeSK(k,L){const n=k.length;if(!k||n<2*L+10)return null;
  const dn=skDown(k,pivots(k,L)),mk=mir(k),up=skDown(mk,pivots(mk,L));
  let s=null,dir=0;if(dn&&(!up||dn.key>=up.key)){s=dn;dir=-1}else if(up){s=up;dir=1}
  if(!s)return{dir:0};
  const f=v=>-dir*v; // zurück in echte Preise (dn: dir=-1 -> v)
  const P={z:f(s.z.p),a:f(s.a.p),b:f(s.b.p),c:s.c?f(s.c.p):null};
  const price=k[n-1].c,zp=s.z.p,ap=s.a.p,R0=zp-ap;
  const out={dir,phase:s.phase,goal:s.goal,P,idx:{z:s.z.i,a:s.a.i,b:s.b.i,c:s.c?s.c.i:null,brk:s.brk},price,
    t161:f(zp-1.618*R0),t200:f(zp-2*R0),bPct:(s.b.p-ap)/R0};
  const pr=-dir*price; // gespiegelter Raum (Short-Logik)
  if(s.phase===1){out.cat="wait";out.lv={};[0.5,0.618,0.786].forEach(x=>out.lv[x]=f(ap+x*R0))}
  else if(!s.goal){const R=s.b.p-s.c.p;out.r=(pr-s.c.p)/R;out.lv={};SK_LV.forEach(x=>out.lv[x]=f(s.c.p+x*R));
    out.cat=out.r>0.786?"deep":out.r>=0.5?"entry":"pre"}
  else{const R=zp-s.c.p;out.r=(pr-s.c.p)/R;out.lv={};SK_LV.forEach(x=>out.lv[x]=f(s.c.p+x*R));
    out.cat=out.r>=0.5&&out.r<=0.786?"gzone":"goal"}
  return out}
// ===== ANALYSE-END =====
if(typeof module!=="undefined")module.exports={pivots,structure,analyzeStd,analyzeSK};
