// Bayazit Chart-Bot – Indikatoren + Zeichnen auf ein Canvas (2D-Kontext).
// Bewusst ohne Browser-Abhängigkeiten außer dem Canvas-Kontext, damit es später auch in einem Discord-Bot (node-canvas) läuft.
// Benötigt gz-core.js (pivots, structure, analyzeStd, analyzeSK).
"use strict";
const CC=(()=>{
const G=typeof module!=="undefined"&&typeof window==="undefined"?require("./gz-core.js"):{pivots,structure,analyzeStd,analyzeSK};
const PIV={"5m":5,"15m":10,"1h":7,"4h":14,"1d":12,"1w":15};

// ---------- Standard-Einstellungen ----------
const DEF={
  pivot:{auto:true,len:10},
  sk:{on:true,cLong:"#3ccf8a",cShort:"#ff6b5e",cZone:"#f0a33a",cEntry:"#f0a33a",cSL:"#ff6b5e",cTarget:"#5b9bff"},
  gz:{on:false,cZone:"#f0a33a",cTP:"#5b9bff",cLine:"#8d99ab"},
  fib:{on:false,levels:"0.5,0.559,0.618,0.667,0.786,0.886,1.272,1.618",zone:true,cLevel:"#e7ecf3",cGold:"#26c6da",cZone:"#ffeb3b",cExt1:"#ba68c8",cExt2:"#5b9bff"},
  dfib:{on:false,set:"sk",dir:"auto",lb:100,sm:5,lE:"0,0.5,0.618,0.786,0.882,1,1.618",lSK:"0,0.5,0.559,0.618,1,1.618",lKL:"0,0.236,0.382,0.5,0.618,0.786,1,1.272,1.618,2.618",lICT:"0,0.5,0.618,0.705,0.786,1,1.272,1.618",
    zE:"0.618-0.786",zSK:"0.5-0.618",zKL:"0.618-0.786",zICT:"0.62-0.79",zone:true,cZone:"#ff9800",zop:10,tp:"line",dirCol:true,cLong:"#00c48c",cShort:"#ff1744",cOther:"#b0bec5",lab:true},
  ms:{on:true,n:3,labels:true,cUp:"#3ccf8a",cDn:"#ff6b5e"},
  tl:{on:true,n:1,cSup:"#ffeb3b",cRes:"#9c27b0"},
  sr:{on:false,col:"#8d99ab",op:14},
  vp:{on:false,range:"vis",rows:60,va:70,hist:true,cVA:"#64b5f6",cPOC:"#ba68c8"},
  liq:{on:false,n:5,cBull:"#2979ff",cBear:"#e91e63"},
  ob:{on:false,n:3,cBull:"#3ccf8a",cBear:"#ff6b5e",op:13},
  lsob:{on:false,n:3,cBull:"#2979ff",cBear:"#e91e63",op:15},
  fvg:{on:false,n:4,shrink:true,dir:"both",cBull:"#3ccf8a",cBear:"#ff6b5e",op:16},
  boxes:{mode:"short",n:20},
  ma1:{on:true,type:"EMA",len:21,col:"#ffeb3b"},
  ma2:{on:true,type:"EMA",len:50,col:"#ff9800"},
  ma3:{on:false,type:"SMA",len:200,col:"#e91e63"},
  vwap:{on:false,anchor:"D",col:"#b388ff"},
  bb:{on:false,len:20,mult:2,col:"#5b9bff"},
  vol:{on:true},
  rsic:{on:false,len:14,hi:80,lo:20,cHi:"#ffeb3b",cLo:"#e040fb"},
  rsi:{on:true,len:14,hi:80,lo:20,div:true,col:"#b388ff",cDivUp:"#00e5ff",cDivDn:"#ff4081"},
  macd:{on:false,f:12,s:26,sig:9,cM:"#5b9bff",cS:"#ff9800"},
  risk:{on:false,table:true},
  heat:{on:false}
};
const clone=o=>JSON.parse(JSON.stringify(o));
function withDefaults(cfg){const out=clone(DEF);if(cfg)for(const k in cfg)if(out[k]&&typeof cfg[k]==="object")Object.assign(out[k],cfg[k]);return out}


// ---------- Dynamische Fibonacci (wie BSI v2.26) ----------
// Höchstes Hoch / tiefstes Tief der letzten "lb" Kerzen; Richtung: ist das Hoch neuer -> Long. Jedes Level per EMA geglättet.
const DFCOL={"0":"#787b86","0.236":"#787b86","0.382":"#b0bec5","0.5":"#ffeb3b","0.559":"#ffffff","0.618":"#4caf50","0.705":"#ffb300","0.786":"#ffc400","0.882":"#4caf50","1":"#388e3c",
  "1.272":"#4fa3ff","1.618":"#2962ff","1.809":"#4fa3ff","2":"#7c4dff","2.618":"#aa00ff"};
const parseLv=s=>String(s||"").split(/[;, ]+/).map(x=>parseFloat(x.replace(",","."))).filter(x=>isFinite(x));
function dfLevels(f){const sets={e:f.lE,sk:f.lSK,kl:f.lKL,ict:f.lICT};let lv=f.set==="all"?[].concat(...Object.values(sets).map(parseLv),[1.809,2]):parseLv(sets[f.set]||f.lSK);
  lv=[...new Set(lv.map(x=>+x.toFixed(4)))].sort((a,b)=>a-b);const zs={e:f.zE,sk:f.zSK,kl:f.zKL,ict:f.zICT,all:f.zE}[f.set]||f.zSK,z=String(zs||"").split(/\s*[-–\/]\s*|\s+/).map(x=>parseFloat(x.replace(",","."))).filter(x=>isFinite(x));
  return{lv,zone:z.length>=2?[z[0],z[1]]:null}}
function dynFib(k,f){const n=k.length,lb=Math.max(10,Math.min(5000,+f.lb||100)),sm=Math.max(1,+f.sm||5),al=2/(sm+1),{lv,zone}=dfLevels(f);
  const W=Math.min(lb,n),start=W-1;if(n<W||n<10)return null;
  const all=zone?lv.concat(zone):lv,v=all.map(()=>new Array(n).fill(null)),longA=new Array(n).fill(null),prev=all.map(()=>null);
  for(let i=start;i<n;i++){let hh=-Infinity,ll=Infinity,hi=0,li=0;for(let j=i-W+1;j<=i;j++){if(k[j].h>=hh){hh=k[j].h;hi=j}if(k[j].l<=ll){ll=k[j].l;li=j}}
    const isL=f.dir==="long"?true:f.dir==="short"?false:hi>=li,rng=hh-ll;longA[i]=isL;
    all.forEach((r,q)=>{const raw=r<=1?(isL?hh-rng*r:ll+rng*r):(isL?ll+rng*r:hh-rng*r);prev[q]=prev[q]==null?raw:al*raw+(1-al)*prev[q];v[q][i]=prev[q]})}
  return{lv,zone,v:v.slice(0,lv.length),zv:zone?v.slice(lv.length):null,isLong:longA,start}}

// ---------- Rechnen ----------
function sma(a,n){const o=new Array(a.length).fill(null);let s=0;for(let i=0;i<a.length;i++){s+=a[i];if(i>=n)s-=a[i-n];if(i>=n-1)o[i]=s/n}return o}
function ema(a,n){const o=new Array(a.length).fill(null),k=2/(n+1);let e=null,s=0,c=0;
  for(let i=0;i<a.length;i++){const v=a[i];if(v==null)continue;if(e===null){s+=v;c++;if(c===n){e=s/n;o[i]=e}continue}e=v*k+e*(1-k);o[i]=e}return o}
function atr(k,n=14){let s=0,c=0;for(let i=Math.max(1,k.length-n*3);i<k.length;i++){s+=Math.max(k[i].h-k[i].l,Math.abs(k[i].h-k[i-1].c),Math.abs(k[i].l-k[i-1].c));c++}return c?s/c:0}
function rsi(c,n){const o=new Array(c.length).fill(null);let ag=0,al=0;
  for(let i=1;i<c.length;i++){const d=c[i]-c[i-1],g=Math.max(d,0),l=Math.max(-d,0);
    if(i<=n){ag+=g;al+=l;if(i===n){ag/=n;al/=n;o[i]=al===0?100:100-100/(1+ag/al)}}
    else{ag=(ag*(n-1)+g)/n;al=(al*(n-1)+l)/n;o[i]=al===0?100:100-100/(1+ag/al)}}return o}
function macd(c,f,s,g){const ef=ema(c,f),es=ema(c,s);const m=c.map((_,i)=>ef[i]!=null&&es[i]!=null?ef[i]-es[i]:null);
  const sig=ema(m,g);return{m,sig,h:m.map((v,i)=>v!=null&&sig[i]!=null?v-sig[i]:null)}}
function vwap(k,anchor){const o=new Array(k.length).fill(null);let pv=0,vv=0,key=null;
  for(let i=0;i<k.length;i++){const d=k[i].t/864e5,kk=anchor==="W"?Math.floor((d+3)/7):Math.floor(d);if(kk!==key){key=kk;pv=0;vv=0}
    const tp=(k[i].h+k[i].l+k[i].c)/3,v=k[i].v||0;pv+=tp*v;vv+=v;o[i]=vv?pv/vv:tp}return o}
function bbands(c,n,m){const mid=sma(c,n),up=[],dn=[];for(let i=0;i<c.length;i++){if(mid[i]==null){up.push(null);dn.push(null);continue}
  let s=0;for(let j=i-n+1;j<=i;j++)s+=(c[j]-mid[i])**2;const sd=Math.sqrt(s/n);up.push(mid[i]+m*sd);dn.push(mid[i]-m*sd)}return{mid,up,dn}}
function rsiDiv(k,r,L=5,n=3){const lows=[],highs=[],out=[];
  for(let i=L;i<k.length-L;i++){let a=true,b=true;for(let j=i-L;j<=i+L;j++){if(j===i)continue;if(k[j].l<k[i].l)a=false;if(k[j].h>k[i].h)b=false}
    if(r[i]==null)continue;if(a)lows.push(i);if(b)highs.push(i)}
  for(let q=1;q<lows.length;q++){const a=lows[q-1],b=lows[q];if(b-a<=60&&k[b].l<k[a].l&&r[b]>r[a])out.push({t:1,a,b,pa:k[a].l,pb:k[b].l,ra:r[a],rb:r[b]})}
  for(let q=1;q<highs.length;q++){const a=highs[q-1],b=highs[q];if(b-a<=60&&k[b].h>k[a].h&&r[b]<r[a])out.push({t:-1,a,b,pa:k[a].h,pb:k[b].h,ra:r[a],rb:r[b]})}
  return out.sort((x,y)=>x.b-y.b).slice(-n)}
function mstruct(k,pv,L){const st=G.structure(k,pv,L),lab=[];let lh=null,ll=null;
  pv.ph.forEach(p=>{lab.push({i:p.i,p:p.p,t:lh==null?"H":p.p>lh?"HH":"LH",up:1});lh=p.p});
  pv.pl.forEach(p=>{lab.push({i:p.i,p:p.p,t:ll==null?"L":p.p>ll?"HL":"LL",up:0});ll=p.p});
  let tr=0;const ev=st.ev.map(e=>{const x={...e,ch:tr!==0&&tr!==e.d};tr=e.d;return x});
  return{trend:st.trend,flip:st.flip,lab,ev}}
function tlines(k,pv,n){const last=k.length-1,out=[];
  const find=(ps,sup)=>{const P=ps.slice(-12),res=[];
    for(let j=P.length-1;j>=1&&res.length<n;j--){for(let i=0;i<j;i++){const a=P[i],b=P[j];if(sup?b.p<=a.p:b.p>=a.p)continue;
        const sl=(b.p-a.p)/(b.i-a.i);let ok=true;
        for(let m=a.i+1;m<=last;m++){const y=a.p+sl*(m-a.i);if(sup?k[m].c<y*0.999:k[m].c>y*1.001){ok=false;break}}
        if(ok&&a.p+sl*(last-a.i)>0){if(!res.some(r=>r.a.i===a.i))res.push({a,b,sl,sup});break}}}
    return res};
  return[...find(pv.pl,true),...find(pv.ph,false)]}
function vprofile(k,from,to,rows,va){from=Math.max(0,from);to=Math.min(k.length-1,to);let lo=Infinity,hi=-Infinity;
  for(let i=from;i<=to;i++){if(k[i].l<lo)lo=k[i].l;if(k[i].h>hi)hi=k[i].h}
  if(!(hi>lo))return null;const step=(hi-lo)/rows,b=new Array(rows).fill(0);
  for(let i=from;i<=to;i++){const x=k[i],v=x.v||0;if(!v)continue;const r0=Math.max(0,Math.min(rows-1,Math.floor((x.l-lo)/step))),r1=Math.max(0,Math.min(rows-1,Math.floor((x.h-lo)/step)));
    const per=v/(r1-r0+1);for(let r=r0;r<=r1;r++)b[r]+=per}
  let poc=0;b.forEach((v,i)=>{if(v>b[poc])poc=i});const tot=b.reduce((a,c)=>a+c,0);if(!tot)return null;
  let a=poc,z=poc,acc=b[poc];while(acc<tot*va/100&&(a>0||z<rows-1)){const up=z<rows-1?b[z+1]:-1,dn=a>0?b[a-1]:-1;if(up>=dn){z++;acc+=b[z]}else{a--;acc+=b[a]}}
  return{lo,step,b,poc,max:b[poc],a,z,pocP:lo+(poc+0.5)*step,vah:lo+(z+1)*step,val:lo+a*step}}
function srzones(k,pv,at){const pts=[...pv.ph.slice(-40),...pv.pl.slice(-40)].sort((a,b)=>a.p-b.p);const tol=at*0.6,z=[];let cur=null;
  pts.forEach(q=>{if(cur&&q.p-cur.hi<=tol){cur.hi=q.p;cur.n++;cur.i=Math.min(cur.i,q.i)}else{if(cur)z.push(cur);cur={lo:q.p,hi:q.p,n:1,i:q.i}}});if(cur)z.push(cur);
  return z.filter(x=>x.n>=2).map(x=>({lo:x.lo-tol*0.25,hi:x.hi+tol*0.25,n:x.n,i:x.i}))}
function sweeps(k,pv,n){const out=[];
  pv.ph.forEach(p=>{for(let j=p.i+1;j<k.length;j++)if(k[j].h>p.p){if(k[j].c<p.p)out.push({t:-1,i:j,lvl:p.p,from:p.i});break}});
  pv.pl.forEach(p=>{for(let j=p.i+1;j<k.length;j++)if(k[j].l<p.p){if(k[j].c>p.p)out.push({t:1,i:j,lvl:p.p,from:p.i});break}});
  return out.sort((a,b)=>a.i-b.i).slice(-n)}
// FVG (ICT): Lücke zwischen Docht Kerze 1 und Docht Kerze 3. Teilweise gefüllt = Box wird kleiner, ganz gefüllt = weg.
function fvgs(k,n,at,shrink,dir){const out=[];
  for(let i=2;i<k.length;i++){if(dir!=="bear"&&k[i].l>k[i-2].h&&k[i].l-k[i-2].h>at*0.15)out.push({t:1,i:i-1,top:k[i].l,bot:k[i-2].h,top0:k[i].l,bot0:k[i-2].h});
    else if(dir!=="bull"&&k[i].h<k[i-2].l&&k[i-2].l-k[i].h>at*0.15)out.push({t:-1,i:i-1,top:k[i-2].l,bot:k[i].h,top0:k[i-2].l,bot0:k[i].h})}
  return out.filter(f=>{for(let j=f.i+2;j<k.length;j++){if(f.t===1){if(k[j].l<=f.bot)return false;if(shrink&&k[j].l<f.top)f.top=k[j].l}
      else{if(k[j].h>=f.top)return false;if(shrink&&k[j].h>f.bot)f.bot=k[j].h}}
    f.fill=Math.round((1-(f.top-f.bot)/(f.top0-f.bot0))*100);return true}).slice(-n)}

function orderBlocks(k,ev,n){const out=[];
  ev.forEach(e=>{const a=e.piv.i,b=e.bar;if(b-a<2)return;let m=a;
    for(let j=a;j<=b;j++)if(e.d===1?k[j].l<k[m].l:k[j].h>k[m].h)m=j;
    let ob=-1;for(let j=m;j>=Math.max(a,m-6);j--){if(e.d===1?k[j].c<k[j].o:k[j].c>k[j].o){ob=j;break}}if(ob<0)ob=m;
    out.push({t:e.d,i:ob,top:k[ob].h,bot:k[ob].l,conf:b})});
  return out.filter(o=>{for(let j=o.conf+1;j<k.length;j++)if(o.t===1?k[j].c<o.bot:k[j].c>o.top)return false;return true}).slice(-n)}
function lsobs(k,sw,n){const out=[];
  sw.forEach(s=>{let ob=-1;for(let j=s.i;j>=Math.max(0,s.i-2);j--){if(s.t===1?k[j].c<k[j].o:k[j].c>k[j].o){ob=j;break}}if(ob<0)ob=s.i;
    const top=s.t===1?Math.max(k[ob].h,k[s.i].h):Math.max(k[ob].h,k[s.i].h),bot=Math.min(k[ob].l,k[s.i].l);
    let conf=-1;for(let j=s.i+1;j<=Math.min(k.length-1,s.i+10);j++){if(s.t===1?k[j].c>top:k[j].c<bot){conf=j;break}}
    if(conf>0)out.push({t:s.t,i:ob,top,bot,conf})});
  return out.filter(o=>{for(let j=o.conf+1;j<k.length;j++)if(o.t===1?k[j].c<o.bot:k[j].c>o.top)return false;return true}).slice(-n)}
function compute(k,cfg,tf,ext){const L=cfg.pivot.auto?(PIV[tf]||10):Math.max(2,+cfg.pivot.len||10),c=k.map(x=>x.c),I={L,n:k.length};
  if(k.length<2*L+10)return I;
  const pv=G.pivots(k,L);I.pv=pv;I.atr=atr(k);
  if(cfg.dfib.on)I.dfib=dynFib(k,cfg.dfib);
  I.ma=[1,2,3].map(q=>{const m=cfg["ma"+q];if(!m.on)return null;const len=Math.max(1,+m.len||20);return{v:(m.type==="EMA"?ema:sma)(c,len),col:m.col,lab:m.type+" "+len}});
  if(cfg.vwap.on)I.vwap=vwap(k,cfg.vwap.anchor);
  if(cfg.bb.on)I.bb=bbands(c,Math.max(2,+cfg.bb.len||20),+cfg.bb.mult||2);
  if(cfg.rsi.on){I.rsi=rsi(c,Math.max(2,+cfg.rsi.len||14));if(cfg.rsi.div)I.div=rsiDiv(k,I.rsi,5,3)}
  if(cfg.macd.on)I.macd=macd(c,+cfg.macd.f||12,+cfg.macd.s||26,+cfg.macd.sig||9);
  I.ms=mstruct(k,pv,L);
  try{I.gz=G.analyzeStd(k,L)}catch(e){}
  if(cfg.sk.on)try{I.sk=G.analyzeSK(k,L)}catch(e){}
  if(cfg.tl.on)I.tl=tlines(k,pv,Math.max(1,+cfg.tl.n||1));
  if(cfg.sr.on)I.sr=srzones(k,pv,I.atr);
  if(cfg.liq.on)I.liq=sweeps(k,pv,Math.max(1,+cfg.liq.n||5));
  if(cfg.fvg.on)I.fvg=fvgs(k,Math.max(1,+cfg.fvg.n||4),I.atr,cfg.fvg.shrink!==false,cfg.fvg.dir);
  if(cfg.rsic.on)I.rsic=rsi(c,Math.max(2,+cfg.rsic.len||14));
  if(cfg.ob.on)I.ob=orderBlocks(k,I.ms.ev,Math.max(1,+cfg.ob.n||3));
  if(cfg.lsob.on)I.lsob=lsobs(k,sweeps(k,pv,999),Math.max(1,+cfg.lsob.n||3));
  if(ext){if(cfg.risk.on&&ext.risk)Object.assign(I,{risk:ext.risk,riskTab:ext.riskTab,riskNow:ext.riskNow});if(cfg.heat.on&&ext.heat)Object.assign(I,{heat:ext.heat,heatTh:ext.heatTh,heatAvg:ext.heatAvg,heatNow:ext.heatNow})}
  if(cfg.vp.on&&cfg.vp.range!=="vis"){const n=+cfg.vp.range||200;I.vpFix=vprofile(k,k.length-n,k.length-1,+cfg.vp.rows||60,+cfg.vp.va||70)}
  return I}

// ---------- Format ----------
const nf=(p,d)=>p.toLocaleString("de-DE",{minimumFractionDigits:d,maximumFractionDigits:d});
function fmt(p){if(p==null||!isFinite(p))return"–";const a=Math.abs(p);if(a>=1000)return nf(p,2);if(a>=100)return nf(p,2);if(a>=1)return nf(p,a>=10?3:4);return p.toLocaleString("de-DE",{maximumSignificantDigits:4})}
const pct=v=>(v>=0?"+":"")+nf(v,1)+" %";
function tlab(t,tf,full){const d=new Date(t),p=n=>String(n).padStart(2,"0");
  if(tf==="1w")return`${p(d.getDate())}.${p(d.getMonth()+1)}.${String(d.getFullYear()).slice(2)}`;
  if(tf==="1d")return full?`${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()}`:`${p(d.getDate())}.${p(d.getMonth()+1)}.`;
  return full?`${p(d.getDate())}.${p(d.getMonth()+1)}. ${p(d.getHours())}:${p(d.getMinutes())}`:`${p(d.getHours())}:${p(d.getMinutes())}`}

// ---------- Zeichnen ----------
const THEME={dark:{bg:"#0e131b",grid:"rgba(255,255,255,.06)",txt:"#8d99ab",fg:"#e7ecf3",up:"#3ccf8a",dn:"#e7ecf3",axis:"#151c27",gold:"#f0a33a",goldbg:"rgba(240,163,58,.16)",blue:"#5b9bff",red:"#ff6b5e",green:"#3ccf8a",grey:"#6f7b8d",cross:"rgba(231,236,243,.45)"},
  light:{bg:"#ffffff",grid:"rgba(0,0,0,.06)",txt:"#5d6878",fg:"#141a24",up:"#0f8a4f",dn:"#3b4250",axis:"#f3f5f8",gold:"#c77a12",goldbg:"rgba(217,149,28,.16)",blue:"#2f6fd6",red:"#c8372d",green:"#0f8a4f",grey:"#8d99ab",cross:"rgba(20,26,36,.4)"}};
const rkCol=r=>`hsl(${Math.round((1-Math.max(0,Math.min(1,r)))*120)},75%,${r>.4&&r<.65?42:48}%)`;
const BUB=[[.5,"#1d2bd6"],[.75,"#2f6bff"],[1,"#18c7e6"],[1.25,"#22c55e"],[1.5,"#e6d200"],[1.75,"#f59e0b"],[2,"#f2591a"],[Infinity,"#e11d2e"]];
const heatIdx=(v,th)=>{if(th){const k=th.findIndex(t=>v<t);return k<0?7:k}return BUB.findIndex(b=>v<b[0])};
const heatCol=(v,th)=>BUB[heatIdx(v,th)][1];
const heatTxt=(v,th)=>["Kalt (unter dem Schnitt)","Kalt (unter dem Schnitt)","Kalt (unter dem Schnitt)","Normal","Warm","Heiß","Sehr heiß","Überhitzt"][heatIdx(v,th)];
const hexRgb=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h||"");if(!m)return null;const n=parseInt(m[1],16);return[n>>16&255,n>>8&255,n&255]};
const ra=(h,a)=>{const c=hexRgb(h);return c?`rgba(${c[0]},${c[1]},${c[2]},${a})`:h};
const isLight=h=>{const c=hexRgb(h);return c?(0.299*c[0]+0.587*c[1]+0.114*c[2])/255>0.85:false};
// Zeit <-> Kerzen-Index (für Zeichnungen, auch über Zeitrahmen hinweg)
const TFMS={"5m":3e5,"15m":9e5,"1h":36e5,"4h":144e5,"1d":864e5,"1w":6048e5};
function tIdx(k,t,tf){const n=k.length,ms=TFMS[tf]||864e5;if(!n)return 0;if(t<=k[0].t)return(t-k[0].t)/ms;if(t>=k[n-1].t)return n-1+(t-k[n-1].t)/ms;
  let a=0,b=n-1;while(b-a>1){const m=(a+b)>>1;if(k[m].t<=t)a=m;else b=m}return a+(t-k[a].t)/(k[b].t-k[a].t)}
function idxT(k,i,tf){const n=k.length,ms=TFMS[tf]||864e5;if(!n)return 0;if(i<=0)return k[0].t+i*ms;if(i>=n-1)return k[n-1].t+(i-n+1)*ms;const a=Math.floor(i);return k[a].t+(i-a)*(k[a+1].t-k[a].t)}
function niceStep(range,n){const raw=range/n,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return(f<1.5?1:f<3?2:f<7?5:10)*p}

function draw(ctx,W,H,S){const th=S.th||THEME.dark,k=S.k,I=S.I||{},cfg=S.cfg,tf=S.tf;
  const AX=74,TA=22,pw=W-AX;
  ctx.fillStyle=th.bg;ctx.fillRect(0,0,W,H);ctx.textBaseline="middle";
  if(!k||!k.length){ctx.fillStyle=th.txt;ctx.font="14px sans-serif";ctx.textAlign="center";ctx.fillText("Keine Daten",W/2,H/2);return null}
  const subs=[];if(cfg.rsi.on&&I.rsi)subs.push("rsi");if(cfg.macd.on&&I.macd)subs.push("macd");if(cfg.risk.on&&I.risk)subs.push("risk");if(cfg.heat.on&&I.heat)subs.push("heat");
  const subH=subs.length?Math.round((H-TA)*[0,0.2,0.17,0.15,0.13][subs.length]):0,mainH=H-TA-subH*subs.length;
  const from=S.view.from,to=S.view.to,cw=pw/(to-from),X=i=>(i-from+0.5)*cw;
  const i0=Math.max(0,Math.floor(from)),i1=Math.min(k.length-1,Math.ceil(to));
  let lo=Infinity,hi=-Infinity;for(let i=i0;i<=i1;i++){if(k[i].l<lo)lo=k[i].l;if(k[i].h>hi)hi=k[i].h}
  if(!isFinite(lo)){lo=k[k.length-1].l;hi=k[k.length-1].h}
  const pad=(hi-lo)*0.08||hi*0.01;lo-=pad;hi+=pad;
  if(S.view.man&&S.view.hi>S.view.lo){lo=S.view.lo;hi=S.view.hi}
  const mT=6,mB=mainH-6,Y=p=>mT+(hi-p)/(hi-lo)*(mB-mT),P=y=>hi-(y-mT)/(mB-mT)*(hi-lo);
  const tags=[],lbls=[],lightTh=th.bg===THEME.light.bg,C=h=>lightTh&&isLight(h)?th.fg:h;
  const last0=k.length-1,LE=Math.max(0,Math.min(pw-4,(last0-from+0.5+4)*cw));
  const font=(s,b)=>ctx.font=`${b?"600 ":""}${s}px "JetBrains Mono",ui-monospace,monospace`;
  const line=(x1,y1,x2,y2,col,w=1,dash)=>{ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=w;ctx.setLineDash(dash||[]);ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([])};
  const series=(v,col,w=1.4,dash,Yf=Y)=>{ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=w;ctx.setLineDash(dash||[]);let on=false;
    for(let i=i0;i<=i1;i++){if(v[i]==null){on=false;continue}const x=X(i),y=Yf(v[i]);if(on)ctx.lineTo(x,y);else{ctx.moveTo(x,y);on=true}}ctx.stroke();ctx.setLineDash([])};
  const hl=(p,fromI,col,w,dash,name)=>{if(p==null||!isFinite(p))return;const y=Y(p);const x1=fromI==null?0:Math.max(0,Math.min(X(fromI),LE-12));
    if(y>=mT-2&&y<=mB+2){line(x1,y,LE,y,col,w,dash);if(name)lbls.push({y,col,n:name,p})}};
  const band=(a,b,fromI,col)=>{if(a==null||b==null)return;const y1=Y(Math.max(a,b)),y2=Y(Math.min(a,b)),x1=fromI==null?0:Math.max(0,Math.min(X(fromI),LE-12));ctx.fillStyle=col;ctx.fillRect(x1,y1,LE-x1,Math.max(1,y2-y1))};
  const dot=(i,p,col,txt,above)=>{const x=X(i),y=Y(p);if(x<-10||x>pw+10)return;ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,3.5,0,7);ctx.fill();if(txt){font(11,1);ctx.textAlign="center";ctx.fillText(txt,x,y+(above?-12:12))}};

  // Raster
  ctx.save();ctx.beginPath();ctx.rect(0,0,pw,mainH);ctx.clip();
  const st=niceStep(hi-lo,6);font(10);ctx.textAlign="left";
  for(let v=Math.ceil(lo/st)*st;v<=hi;v+=st)line(0,Y(v),pw,Y(v),th.grid,1);
  const step=Math.max(1,Math.ceil(95/cw));for(let i=Math.ceil(from/step)*step;i<=to;i+=step)line(X(i),0,X(i),H-TA,th.grid,1);

  // Zonen (hinten)
  const last=k.length-1,price=k[last].c;
  const bm=(cfg.boxes&&cfg.boxes.mode)||"short",bn=Math.max(3,+(cfg.boxes&&cfg.boxes.n)||20);
  const endX=i=>bm==="edge"?pw:Math.min(pw,X(bm==="fix"?Math.min(i+bn,last+6):last+6));
  const box=(o,fill,stroke,lab)=>{const x1=Math.max(0,X(o.i)),x2=endX(o.i);if(x2<=x1)return;const y1=Y(o.top),y2=Y(o.bot);ctx.fillStyle=fill;ctx.fillRect(x1,y1,x2-x1,Math.max(1,y2-y1));
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.setLineDash([]);ctx.strokeRect(x1+0.5,y1+0.5,x2-x1-1,Math.max(1,y2-y1))}
    font(9,1);ctx.textAlign="left";ctx.fillStyle=stroke||th.txt;if(x2-x1>30)ctx.fillText(lab,x1+3,(y1+y2)/2)};
  if(cfg.sr.on&&I.sr){const above=I.sr.filter(z=>z.lo>price).sort((a,b)=>a.lo-b.lo).slice(0,2),below=I.sr.filter(z=>z.hi<price).sort((a,b)=>b.hi-a.hi).slice(0,2),inside=I.sr.filter(z=>z.lo<=price&&z.hi>=price);
    [...above,...below,...inside].forEach(z=>box({i:z.i,top:z.hi,bot:z.lo},ra(cfg.sr.col,(+cfg.sr.op||14)/100),null,`S/R ×${z.n}`))}
  const bc=(o,c,t)=>C(t===1?c.cBull:c.cBear),op=c=>(+c.op||15)/100;
  if(cfg.ob.on&&I.ob)I.ob.forEach(o=>box(o,ra(bc(o,cfg.ob,o.t),op(cfg.ob)),ra(bc(o,cfg.ob,o.t),.8),o.t===1?"OB ▲":"OB ▼"));
  if(cfg.lsob.on&&I.lsob)I.lsob.forEach(o=>box(o,ra(bc(o,cfg.lsob,o.t),op(cfg.lsob)),bc(o,cfg.lsob,o.t),o.t===1?"LSOB ▲":"LSOB ▼"));
  if(cfg.fvg.on&&I.fvg)I.fvg.forEach(f=>{const fc=bc(f,cfg.fvg,f.t);box(f,ra(fc,op(cfg.fvg)),null,`FVG ${f.t===1?"▲":"▼"}${f.fill>0?" "+f.fill+" %":""}`);
    const x1=Math.max(0,X(f.i)),x2=endX(f.i);if(x2>x1){const ym=Y((f.top+f.bot)/2);line(x1,ym,x2,ym,ra(fc,.6),1,[2,3])}});

  // Volumenprofil
  let vp=null;if(cfg.vp.on){vp=cfg.vp.range==="vis"?vprofile(k,i0,Math.min(i1,last),+cfg.vp.rows||60,+cfg.vp.va||70):I.vpFix}
  if(vp){if(cfg.vp.hist!==false){const wMax=pw*0.22;vp.b.forEach((v,r)=>{const yA=Y(vp.lo+(r+1)*vp.step),yB=Y(vp.lo+r*vp.step),w=v/vp.max*wMax;
        ctx.fillStyle=r===vp.poc?ra(cfg.vp.cPOC,.55):r>=vp.a&&r<=vp.z?ra(cfg.vp.cVA,.28):"rgba(141,153,171,.16)";ctx.fillRect(pw-w,yA+0.5,w,Math.max(1,yB-yA-1))})}
    hl(vp.vah,i0,C(cfg.vp.cVA),1,[4,3],"VAH");hl(vp.val,i0,C(cfg.vp.cVA),1,[4,3],"VAL");hl(vp.pocP,i0,C(cfg.vp.cPOC),1.4,null,"POC")}

  // Volumen
  if(cfg.vol.on){let vm=0;for(let i=i0;i<=i1;i++)vm=Math.max(vm,k[i].v||0);if(vm>0){const vh=mainH*0.16;
      for(let i=i0;i<=i1;i++){const x=k[i],h=(x.v||0)/vm*vh;ctx.fillStyle=x.c>=x.o?"rgba(60,207,138,.28)":"rgba(141,153,171,.25)";ctx.fillRect(X(i)-cw*0.35,mB-h,Math.max(1,cw*0.7),h)}}}

  // Linien-Indikatoren
  if(cfg.bb.on&&I.bb){const bcl=C(cfg.bb.col);series(I.bb.up,ra(bcl,.7),1);series(I.bb.dn,ra(bcl,.7),1);series(I.bb.mid,ra(bcl,.45),1,[4,3])}
  (I.ma||[]).forEach(m=>{if(m){m.col=C(m.col);series(m.v,m.col,1.5);const v=m.v[last];if(v!=null)tags.push({y:Y(v),col:m.col,t:fmt(v),off:Y(v)<mT||Y(v)>mB})}});
  if(cfg.vwap.on&&I.vwap){const vc=C(cfg.vwap.col);series(I.vwap,vc,1.5);tags.push({y:Y(I.vwap[last]),col:vc,t:fmt(I.vwap[last])})}

  // Golden Zone
  const gz=I.gz;
  if(cfg.gz.on&&gz&&gz.lv){const v=gz.lv,fr=gz.from,dc=gz.dir===1?C(cfg.sk.cLong):C(cfg.sk.cShort),gc=C(cfg.gz.cZone),tc=C(cfg.gz.cTP),lc=C(cfg.gz.cLine);band(v.g1,v.g2,fr,ra(gc,.16));
    hl(v.h,fr,lc,1,null,"GZ 0");hl(v.f5,fr,lc,1,[4,3],"GZ 0,5");hl(v.g1,fr,gc,1.3,null,"GZ 0,618");hl(v.g2,fr,gc,1.3,null,"GZ 0,786");
    hl(v.l,fr,dc,1.5,null,"GZ 1,0");hl(v.tp1,fr,tc,1.3,null,"TP1");hl(v.tp2,fr,tc,1.1,[5,4],"TP2")}
  // Fibonacci (Trend, wie BFT)
  if(cfg.fib.on&&gz&&gz.lv){const h=gz.lv.h,l=gz.lv.l,px=x=>h+x*(l-h),anchor=gz.dir===1?gz.Hi:gz.Hi;
    const lv=String(cfg.fib.levels).split(/[,; ]+/).map(Number).filter(x=>isFinite(x));
    const f=cfg.fib;if(f.zone)band(px(0.618),px(0.667),anchor,ra(C(f.cZone),.14));
    lv.forEach(x=>{const col=C(x>1?(Math.abs(x-1.272)<0.01?f.cExt1:f.cExt2):(x>=0.6&&x<=0.67?f.cGold:f.cLevel)),dash=x>1.5?[5,4]:null;
      hl(px(x),anchor,col,1,dash,`${nf(x*100,1).replace(",0","")} %`)});hl(h,anchor,th.grey,1,null,"0 %")}
  // Dynamische Fibonacci (BSI)
  const df=I.dfib;
  if(cfg.dfib.on&&df){const f=cfg.dfib,lastL=df.isLong[last],dirC=C(lastL?f.cLong:f.cShort),fm=x=>String(+x.toFixed(3)).replace(".",",");
    if(f.zone&&df.zv){const a=df.zv[0],b=df.zv[1],zs=Math.max(i0,df.start);ctx.beginPath();let st=false;for(let i=zs;i<=i1;i++){if(a[i]==null)continue;const x=X(i),y=Y(a[i]);st?ctx.lineTo(x,y):(ctx.moveTo(x,y),st=true)}
      for(let i=i1;i>=zs;i--){if(b[i]!=null)ctx.lineTo(X(i),Y(b[i]))}if(st){ctx.closePath();ctx.fillStyle=ra(C(f.cZone),(+f.zop||10)/100);ctx.fill()}
      series(a,C(f.cZone),1);series(b,C(f.cZone),1)}
    df.lv.forEach((r,q)=>{const key=String(+r.toFixed(4)),is1=Math.abs(r-1)<1e-6,col=is1&&f.dirCol?dirC:C(DFCOL[key]||f.cOther),tp=r>1,arr=df.v[q];
      if(tp&&f.tp==="dots"){ctx.fillStyle=col;for(let i=Math.max(i0,df.start);i<=i1;i+=Math.max(1,Math.round(4/cw))){if(arr[i]==null)continue;ctx.beginPath();ctx.arc(X(i),Y(arr[i]),1.6,0,7);ctx.fill()}}
      else series(arr,col,is1?2:1.1);
      if(f.lab&&arr[last]!=null){const y=Y(arr[last]);if(y>=mT-2&&y<=mB+2)lbls.push({y,col,n:(tp?"TP ":"")+fm(r),p:arr[last]})}})}
  // SK-System
  const sk=I.sk;
  if(cfg.sk.on&&sk&&sk.dir){const P2=sk.P,ix=sk.idx,c=cfg.sk,dc=C(sk.dir===1?c.cLong:c.cShort),ec=C(c.cEntry),slc=C(c.cSL),tgc=C(c.cTarget);
    hl(P2.z,ix.z,dc,1.4,null,"SK 0");hl(P2.a,ix.a,th.grey,1.2,null,"A");hl(P2.b,ix.b,slc,1.2,[2,3],"B");
    if(sk.phase===1){[0.5,0.618,0.786].forEach(x=>hl(sk.lv[x],ix.b,th.grey,1,[3,3],`0→A ${nf(x*100,1)} %`))}
    else{const fr=sk.goal?ix.z:ix.b;hl(P2.c,ix.c,dc,1.2,null,"C");band(sk.lv[0.5],sk.lv[0.786],fr,ra(C(c.cZone),.16));
      [[0.5,"E1"],[0.559,"E2"],[0.618,"E3"],[0.667,"E4"]].forEach(([x,n])=>hl(sk.lv[x],fr,ec,1,null,n));
      hl(sk.lv[0.786],fr,slc,1.3,[5,3],"SL 78,6");hl(sk.lv[0.886],fr,th.grey,1,[2,3],"88,6");
      if(!sk.goal){hl(sk.t161,ix.brk,tgc,1.3,null,"Ziel 161,8");hl(sk.t200,ix.brk,tgc,1,[5,4],"Ziel 200")}}
    dot(ix.z,P2.z,dc,"0",sk.dir===-1);dot(ix.a,P2.a,th.grey,"A",sk.dir===1);dot(ix.b,P2.b,slc,"B",sk.dir===-1);if(ix.c!=null)dot(ix.c,P2.c,dc,"C",sk.dir===1)}
  // Trendlinien
  if(cfg.tl.on&&I.tl)I.tl.forEach(t=>{const col=C(t.sup?cfg.tl.cSup:cfg.tl.cRes),ext=last+8,y2=t.a.p+t.sl*(ext-t.a.i);
    line(X(t.a.i),Y(t.a.p),X(ext),Y(y2),col,2);const vNow=t.a.p+t.sl*(last-t.a.i);tags.push({y:Y(vNow),col,t:fmt(vNow),off:Y(vNow)<mT||Y(vNow)>mB})});
  // Marktstruktur
  if(cfg.ms.on&&I.ms){if(cfg.ms.labels!==false){font(10,1);ctx.textAlign="center";const hs=I.ms.lab.filter(l=>l.up).slice(-10),ls=I.ms.lab.filter(l=>!l.up).slice(-10);
      [...hs,...ls].forEach(l=>{const x=X(l.i);if(x<0||x>pw)return;ctx.fillStyle=l.t==="HH"||l.t==="HL"?C(cfg.ms.cUp):l.t==="LH"||l.t==="LL"?C(cfg.ms.cDn):th.txt;ctx.fillText(l.t,x,Y(l.p)+(l.up?-11:11))})}
    I.ms.ev.slice(-(+cfg.ms.n||3)).forEach(e=>{const col=C(e.d===1?cfg.ms.cUp:cfg.ms.cDn),y=Y(e.piv.p);line(X(e.piv.i),y,X(e.bar),y,col,1,[4,3]);
      font(9,1);ctx.textAlign="center";ctx.fillStyle=col;ctx.fillText(e.ch?"CHoCH":"BOS",(X(e.piv.i)+X(e.bar))/2,y+(e.d===1?-8:8))})}

  // Kerzen
  const rc=cfg.rsic&&cfg.rsic.on?I.rsic:null,rHi=+(cfg.rsic&&cfg.rsic.hi)||80,rLo=+(cfg.rsic&&cfg.rsic.lo)||20;
  for(let i=i0;i<=i1;i++){const x=k[i],cx=X(i),up=x.c>=x.o,col=up?th.up:th.dn,bw=Math.max(1,cw*0.66);
    line(cx,Y(x.h),cx,Y(x.l),col,1);const yo=Y(Math.max(x.o,x.c)),yc=Y(Math.min(x.o,x.c)),hgt=Math.max(1,yc-yo);
    const rv=rc?rc[i]:null,fill=rv!=null&&rv>=rHi?cfg.rsic.cHi:rv!=null&&rv<=rLo?cfg.rsic.cLo:null;
    ctx.fillStyle=fill||col;ctx.fillRect(cx-bw/2,yo,bw,hgt);if(fill&&bw>3){ctx.strokeStyle=col;ctx.lineWidth=1;ctx.setLineDash([]);ctx.strokeRect(cx-bw/2+0.5,yo+0.5,bw-1,Math.max(1,hgt-1))}}
  // Liquidität
  if(cfg.liq.on&&I.liq)I.liq.forEach(s=>{const x=k[s.i],cx=X(s.i),col=C(s.t===1?cfg.liq.cBull:cfg.liq.cBear);
    if(s.t===1)line(cx,Y(Math.min(x.o,x.c)),cx,Y(x.l),col,3);else line(cx,Y(Math.max(x.o,x.c)),cx,Y(x.h),col,3);
    line(X(s.from),Y(s.lvl),cx,Y(s.lvl),col,1,[3,3])});
  // Divergenz im Kurs
  if(cfg.rsi.on&&cfg.rsi.div&&I.div)I.div.forEach(d=>{const col=C(d.t===1?cfg.rsi.cDivUp:cfg.rsi.cDivDn);line(X(d.a),Y(d.pa),X(d.b),Y(d.pb),col,1.5,[2,3]);
    font(9,1);ctx.textAlign="center";ctx.fillStyle=col;ctx.fillText(d.t===1?"Div▲":"Div▼",X(d.b),Y(d.pb)+(d.t===1?14:-14))});

  // Beschriftung am Linienende: Name (Preis); fast gleiche Preise zusammenfassen
  lbls.sort((a,b)=>a.y-b.y);const mg=[];lbls.forEach(l=>{const m=mg[mg.length-1];if(m&&Math.abs(m.p-l.p)<=Math.abs(l.p)*0.0008){if(!m.n.split(" · ").includes(l.n))m.n+=" · "+l.n}else mg.push({...l})});
  font(10,1);ctx.textAlign="left";let prevL=-99;
  mg.forEach(l=>{if(l.y<mT-4||l.y>mB+4)return;const t=`${l.n} (${fmt(l.p)})`,w=ctx.measureText(t).width;const y=Math.max(l.y,prevL+12);prevL=y;
    let x=LE+5;if(x+w>pw-3){x=pw-3-w;ctx.fillStyle=lightTh?"rgba(255,255,255,.82)":"rgba(14,19,27,.78)";ctx.fillRect(x-3,y-6,w+6,12)}
    ctx.fillStyle=l.col;ctx.fillText(t,x,y)});
  ctx.restore();

  // Unterfenster
  const panes=[],axQ=[],subTags=[];let top=mainH;
  subs.forEach(s=>{const pT=top+6,pB=top+subH-6;panes.push({s,top,h:subH});line(0,top,W,top,th.grid,1);
    ctx.save();ctx.beginPath();ctx.rect(0,top,pw,subH);ctx.clip();
    if(s==="rsi"){const Yr=v=>pT+(100-v)/100*(pB-pT);const hiL=+cfg.rsi.hi||70,loL=+cfg.rsi.lo||30;
      ctx.fillStyle="rgba(179,136,255,.06)";ctx.fillRect(0,Yr(hiL),pw,Yr(loL)-Yr(hiL));
      line(0,Yr(hiL),pw,Yr(hiL),th.grey,1,[4,3]);line(0,Yr(loL),pw,Yr(loL),th.grey,1,[4,3]);line(0,Yr(50),pw,Yr(50),th.grid,1,[2,3]);
      const rcl=C(cfg.rsi.col);series(I.rsi,rcl,1.4,null,Yr);
      if(cfg.rsi.div&&I.div)I.div.forEach(d=>line(X(d.a),Yr(d.ra),X(d.b),Yr(d.rb),C(d.t===1?cfg.rsi.cDivUp:cfg.rsi.cDivDn),1.5,[2,3]));
      const rv=I.rsi[last];font(10,1);ctx.textAlign="left";ctx.fillStyle=rcl;ctx.fillText(`RSI ${cfg.rsi.len}  ${rv!=null?nf(rv,1):"–"}`,6,pT+8);
      axQ.push({y:Yr(hiL),t:String(hiL)},{y:Yr(50),t:"50"},{y:Yr(loL),t:String(loL)});if(rv!=null)subTags.push({y:Yr(rv),col:rcl,t:nf(rv,1)})}
    else if(s==="macd"){const m=I.macd;let mx=0;for(let i=i0;i<=i1;i++)[m.m[i],m.sig[i],m.h[i]].forEach(v=>{if(v!=null)mx=Math.max(mx,Math.abs(v))});mx=mx||1;
      const Ym=v=>pT+(mx-v)/(2*mx)*(pB-pT);line(0,Ym(0),pw,Ym(0),th.grid,1);
      for(let i=i0;i<=i1;i++){const v=m.h[i];if(v==null)continue;ctx.fillStyle=v>=0?"rgba(60,207,138,.5)":"rgba(255,107,94,.5)";const y=Ym(v),y0=Ym(0);ctx.fillRect(X(i)-cw*0.35,Math.min(y,y0),Math.max(1,cw*0.7),Math.abs(y-y0))}
      const mc=C(cfg.macd.cM),sc=C(cfg.macd.cS);series(m.m,mc,1.3,null,Ym);series(m.sig,sc,1.3,null,Ym);
      font(10,1);ctx.textAlign="left";ctx.fillStyle=th.txt;ctx.fillText(`MACD ${cfg.macd.f}/${cfg.macd.s}/${cfg.macd.sig}`,6,pT+8);
      axQ.push({y:Ym(0),t:"0"});const mv=m.m[last],sv=m.sig[last];if(mv!=null)subTags.push({y:Ym(mv),col:mc,t:fmt(mv)});if(sv!=null)subTags.push({y:Ym(sv),col:sc,t:fmt(sv)})}
    else if(s==="risk"){const Yk=v=>pT+(1-v)*(pB-pT),r=I.risk;
      [[1,th.red,[4,3]],[0.8,"rgba(255,107,94,.45)",[2,3]],[0.5,th.grey,[4,3]],[0.2,"rgba(60,207,138,.45)",[2,3]],[0,th.green,[4,3]]].forEach(([v,c,d])=>line(0,Yk(v),pw,Yk(v),c,1,d));
      ctx.lineWidth=1.8;ctx.setLineDash([]);let pv=null;
      for(let i=i0;i<=i1;i++){const v=r[i];if(v==null){pv=null;continue}if(pv!=null){ctx.beginPath();ctx.strokeStyle=rkCol(v);ctx.moveTo(X(i-1),Yk(pv));ctx.lineTo(X(i),Yk(v));ctx.stroke()}pv=v}
      const rn=I.riskNow!=null?I.riskNow:r[last];
      let tx=6;if(cfg.risk.table!==false&&I.riskTab&&I.riskTab.length){const rows=I.riskTab,rh=Math.max(9,Math.min(13,(pB-pT-2)/(rows.length+1))),cw2=[56,78,48],tw=cw2.reduce((a,b)=>a+b,0);
        ctx.fillStyle=th.bg===THEME.light.bg?"rgba(255,255,255,.92)":"rgba(14,19,27,.88)";ctx.fillRect(4,pT,tw+4,rh*(rows.length+1)+2);font(Math.min(10,rh-2),1);
        const head=["Risiko","Preis","Zeit %"];let x=6;ctx.fillStyle=th.txt;ctx.textAlign="left";head.forEach((h,q)=>{ctx.fillText(h,x,pT+rh/2+1);x+=cw2[q]});
        rows.forEach((w,q)=>{const y=pT+rh*(q+1)+rh/2+1;if(w.cur){ctx.fillStyle="rgba(240,163,58,.35)";ctx.fillRect(4,y-rh/2,tw+4,rh)}
          let x=6;ctx.fillStyle=w.cur?th.fg:rkCol(w.r);ctx.fillText((w.cur?"▶ ":"")+nf(w.r,w.cur?3:1),x,y);x+=cw2[0];ctx.fillStyle=th.fg;ctx.fillText(fmt(w.p),x,y);x+=cw2[1];ctx.fillStyle=w.cur?th.gold:th.txt;ctx.fillText(w.cur?"aktuell":nf(w.z,1),x,y)});tx=tw+16}
      font(10,1);ctx.textAlign="left";ctx.fillStyle=th.fg;ctx.fillText(`Risiko ${rn!=null?nf(rn,3):"–"}`,tx,pT+8);
      axQ.push({y:Yk(1),t:"1,0"},{y:Yk(0.5),t:"0,5"},{y:Yk(0),t:"0,0"});if(rn!=null)subTags.push({y:Yk(rn),col:rkCol(rn),t:nf(rn,3)})}
    else if(s==="heat"){const h=I.heat;let lo2=0.8,hi2=1.25;for(let i=i0;i<=i1;i++){const v=h[i];if(v!=null){if(v<lo2)lo2=v;if(v>hi2)hi2=v}}lo2=Math.min(lo2,0.95);const sp=hi2-lo2;lo2-=sp*0.04;hi2+=sp*0.06;
      const Yh=v=>pT+(hi2-v)/(hi2-lo2)*(pB-pT),y1=Yh(1);
      const lv=I.heatTh?[I.heatTh[4],I.heatTh[6]]:[1.5,2];lv.forEach(v=>{if(v<hi2)line(0,Yh(v),pw,Yh(v),"rgba(255,107,94,.5)",1,[4,3])});
      for(let i=i0;i<=i1;i++){const v=h[i];if(v==null)continue;const y=Yh(v);ctx.fillStyle=heatCol(v,I.heatTh);ctx.fillRect(X(i)-cw*0.38,Math.min(y,y1),Math.max(1,cw*0.76),Math.max(1,Math.abs(y-y1)))}
      line(0,y1,pw,y1,th.fg,1);const hn=I.heatNow!=null?I.heatNow:h[last];
      font(10,1);ctx.textAlign="left";ctx.fillStyle=th.fg;
      ctx.fillText(`Hitze ${hn!=null?nf(hn,2):"–"}${I.heatAvg?` · 20-Wochen-Schnitt ${fmt(I.heatAvg)}`:""}${hn!=null?" · "+heatTxt(hn,I.heatTh):""}`,6,pT+8);
      axQ.push({y:y1,t:"1,00"});lv.forEach(v=>{if(v<hi2)axQ.push({y:Yh(v),t:nf(v,2)})});if(hn!=null)subTags.push({y:Yh(hn),col:heatCol(hn,I.heatTh),t:nf(hn,2)})}
    ctx.restore();top+=subH});

  // Achsen
  ctx.fillStyle=th.axis;ctx.fillRect(pw,0,AX,H);ctx.fillRect(0,H-TA,pw,TA);line(pw,0,pw,H,th.grid,1);line(0,H-TA,W,H-TA,th.grid,1);
  panes.forEach(p=>line(pw,p.top,W,p.top,th.grid,1));
  font(10);ctx.fillStyle=th.txt;ctx.textAlign="left";for(let v=Math.ceil(lo/st)*st;v<=hi;v+=st){const y=Y(v);if(y>8&&y<mainH-8)ctx.fillText(fmt(v),pw+6,y)}
  axQ.forEach(a=>{ctx.fillStyle=th.txt;ctx.fillText(a.t,pw+6,a.y)});
  ctx.textAlign="center";let lastDay=null;
  for(let i=Math.ceil(from/step)*step;i<=to;i+=step){if(i<0||i>last)continue;const d=new Date(k[i].t),day=d.toDateString();
    const txt=(tf!=="1d"&&tf!=="1w"&&day!==lastDay)?tlab(k[i].t,"1d"):tlab(k[i].t,tf);lastDay=day;ctx.fillText(txt,X(i),H-TA/2)}
  // Preis-Schilder
  tags.push({y:Y(price),col:price>=k[last].o?th.up:th.red,t:fmt(price),main:1});
  tags.filter(t=>!t.off||t.main).sort((a,b)=>a.y-b.y).reduce((prev,t)=>{const y=Math.max(t.y,prev+15);tagDraw(ctx,pw,y,t.col,t.t,AX,th,t.main);return y},-99);
  subTags.forEach(t=>tagDraw(ctx,pw,t.y,t.col,t.t,AX,th,true));
  if(Y(price)>=mT&&Y(price)<=mB)line(0,Y(price),pw,Y(price),price>=k[last].o?th.up:th.red,1,[1,3]);

  // Fadenkreuz
  const L={pw,mainH,panes,X,Y,P,cw,from,to,i0,i1,TA,H,W,lo,hi,mT,mB,AX};
  if(S.cross){const {x,y}=S.cross;const i=Math.round(from+x/cw-0.5);if(i>=0&&i<=last&&x<pw){const cx=X(i);line(cx,0,cx,H-TA,th.cross,1,[3,3]);
      if(y<mainH){line(0,y,pw,y,th.cross,1,[3,3]);tagDraw(ctx,pw,y,th.grey,fmt(P(y)),AX,th,true)}
      font(10,1);const tl=tlab(k[i].t,tf,true),tw=ctx.measureText(tl).width+12;ctx.fillStyle=th.grey;ctx.fillRect(cx-tw/2,H-TA+2,tw,TA-4);ctx.fillStyle="#fff";ctx.textAlign="center";ctx.fillText(tl,cx,H-TA/2);L.ci=i}}
  return L}
function tagDraw(ctx,pw,y,col,t,AX,th,strong){ctx.font=`600 10px "JetBrains Mono",ui-monospace,monospace`;const h=14;ctx.fillStyle=col;
  ctx.globalAlpha=strong?1:0.9;ctx.fillRect(pw+1,y-h/2,AX-2,h);ctx.globalAlpha=1;ctx.fillStyle="#0e131b";ctx.textAlign="left";ctx.fillText(t,pw+5,y+0.5)}

// ---------- Bot-Analyse (Text) ----------
function summary(k,I,cfg,tf){const out=[],last=k.length-1,p=k[last].c;if(!I.pv)return[{t:"Daten",v:"Zu wenige Kerzen für eine Analyse."}];
  if(I.ms){const tr=I.ms.trend,ev=I.ms.ev[I.ms.ev.length-1];out.push({t:"Marktstruktur",v:tr===1?"Aufwärtstrend (höhere Hochs/Tiefs)":tr===-1?"Abwärtstrend (tiefere Hochs/Tiefs)":"keine klare Richtung",c:tr===1?"up":tr===-1?"down":"",
    s:ev?`letzter ${ev.ch?"CHoCH":"BOS"} vor ${last-ev.bar} Kerzen bei ${fmt(ev.piv.p)}`:""})}
  const gz=I.gz;if(gz&&gz.lv){const lab={gz:"in der Golden Zone",near:"nah an der Golden Zone (0,5–0,618)",deep:"hinter der Golden Zone (0,786–1,0)",inv:"unter 1,0 – Bewegung gefährdet",trend:"noch keine Korrektur (über 0,5)",tp1:"über TP1",tp2:"über TP2"}[gz.cat]||"–";
    out.push({t:"Golden Zone",v:`${gz.dir===1?"Long":"Short"} · ${lab}`,c:gz.cat==="gz"?"gold":"",s:`Zone ${fmt(Math.min(gz.lv.g1,gz.lv.g2))} – ${fmt(Math.max(gz.lv.g1,gz.lv.g2))} · TP1 ${fmt(gz.lv.tp1)} · Ungültig ${fmt(gz.lv.l)}`})}
  const df=I.dfib;if(cfg.dfib&&cfg.dfib.on&&df){const isL=df.isLong[last],ret=df.lv.map((r,q)=>({r,p:df.v[q][last]})).filter(x=>x.p!=null);
    const ab=ret.filter(x=>x.p>=p).sort((a,b)=>a.p-b.p)[0],be=ret.filter(x=>x.p<p).sort((a,b)=>b.p-a.p)[0],fm=x=>String(+x.toFixed(3)).replace(".",",");
    let inZ=false;if(df.zv){const a=df.zv[0][last],b=df.zv[1][last];inZ=a!=null&&p>=Math.min(a,b)&&p<=Math.max(a,b)}
    out.push({t:"Dyn. Fibonacci (BSI)",v:`${isL?"Long":"Short"}-Fib${inZ?" · Kurs in der Golden Zone":""}`,c:inZ?"gold":isL?"up":"down",
      s:`${be?`darunter ${fm(be.r)} bei ${fmt(be.p)}`:"unter allen Leveln"} · ${ab?`darüber ${fm(ab.r)} bei ${fmt(ab.p)}`:"über allen Leveln"}`})}
  const sk=I.sk;if(cfg.sk.on){if(sk&&sk.dir){const ph=sk.phase===1?"Phase 1 – warten, A noch nicht gebrochen":!sk.goal?`A gebrochen – Korrektur B→C bei ${nf(sk.r*100,1)} %`:`Ziel erreicht – Gesamtkorrektur 0→C bei ${nf(sk.r*100,1)} %`;
      out.push({t:"SK-System",v:`${sk.dir===1?"Long":"Short"}-Struktur · ${ph}`,c:sk.cat==="entry"?"gold":"",s:sk.phase===1?`Bruch von A bei ${fmt(sk.P.a)} · ungültig ${sk.dir===1?"unter":"über"} B ${fmt(sk.P.b)}`:!sk.goal?`E1 ${fmt(sk.lv[0.5])} · E4 ${fmt(sk.lv[0.667])} · SL ${fmt(sk.lv[0.786])} · Ziel ${fmt(sk.t161)}`:`50 % ${fmt(sk.lv[0.5])} · 61,8 % ${fmt(sk.lv[0.618])} · 78,6 % ${fmt(sk.lv[0.786])}`})}
    else out.push({t:"SK-System",v:"keine gültige Struktur"})}
  if(I.rsi){const r=I.rsi[last];const d=I.div&&I.div.length?I.div[I.div.length-1]:null;
    out.push({t:"RSI",v:r==null?"–":`${nf(r,1)} ${r>=(+cfg.rsi.hi||70)?"· überkauft":r<=(+cfg.rsi.lo||30)?"· überverkauft":""}`,c:r>=(+cfg.rsi.hi||70)?"down":r<=(+cfg.rsi.lo||30)?"up":"",
      s:d&&last-d.b<=20?`${d.t===1?"bullische":"bärische"} Divergenz vor ${last-d.b} Kerzen`:"keine frische Divergenz"})}
  const mas=(I.ma||[]).filter(Boolean);if(mas.length)out.push({t:"Gleitende Durchschnitte",v:mas.map(m=>`${p>=m.v[last]?"über":"unter"} ${m.lab}`).join(" · "),s:""});
  if(I.tl&&I.tl.length){out.push({t:"Trendlinien",v:I.tl.map(t=>{const v=t.a.p+t.sl*(last-t.a.i);return`${t.sup?"Unterstützung":"Widerstand"} ${fmt(v)} (${pct((v/p-1)*100)})`}).join(" · ")})}
  if(I.sr){const a=I.sr.filter(z=>z.lo>p).sort((x,y)=>x.lo-y.lo)[0],b=I.sr.filter(z=>z.hi<p).sort((x,y)=>y.hi-x.hi)[0];
    out.push({t:"S/R-Zonen",v:`${b?`Unterstützung ${fmt(b.lo)}–${fmt(b.hi)}`:"keine Unterstützung"} · ${a?`Widerstand ${fmt(a.lo)}–${fmt(a.hi)}`:"kein Widerstand"}`})}
  const near=(arr,name)=>{if(!arr||!arr.length)return;const b=arr.filter(o=>o.t===1).sort((x,y)=>y.top-x.top)[0],s2=arr.filter(o=>o.t===-1).sort((x,y)=>x.bot-y.bot)[0];
    out.push({t:name,v:`${b?`bullisch ${fmt(b.bot)}–${fmt(b.top)}`:"kein bullischer"} · ${s2?`bärisch ${fmt(s2.bot)}–${fmt(s2.top)}`:"kein bärischer"}`})};
  near(I.ob,"Orderblöcke");near(I.lsob,"LSOB");
  if(I.risk){const r=I.riskNow!=null?I.riskNow:I.risk[last];if(r!=null)out.push({t:"Risiko",v:`${nf(r,3)} · ${r<.2?"sehr niedrig – historisch günstig":r<.4?"niedrig":r<.6?"mittel":r<.8?"hoch":"sehr hoch – historisch teuer"}`,c:r<.4?"up":r>=.6?"down":""})}
  if(I.heat){const h=I.heatNow!=null?I.heatNow:I.heat[last];if(h!=null)out.push({t:"Hitze",v:`${nf(h,2)} · ${heatTxt(h,I.heatTh)}`,s:I.heatAvg?`20-Wochen-Schnitt ${fmt(I.heatAvg)}`:""})}
  if(I.liq&&I.liq.length){const s=I.liq[I.liq.length-1];out.push({t:"Liquidität",v:`${s.t===1?"Tief":"Hoch"} bei ${fmt(s.lvl)} abgeholt vor ${last-s.i} Kerzen`,c:s.t===1?"up":"down"})}
  return out}


// ---------- Zeichnungen (Werkzeuge) ----------
const DFIB=[0,0.5,0.559,0.618,0.667,0.786,0.886,1];
function dwXY(L,k,tf){const X=t=>(tIdx(k,t,tf)-L.from+0.5)*L.cw;return{X,Y:L.Y,T:x=>idxT(k,L.from+x/L.cw-0.5,tf),P:L.P}}
function dwHandles(d,L,k,tf){const {X,Y}=dwXY(L,k,tf),p=d.pts;
  if(d.type==="pos")return[{h:"e",x:X(p[0].t),y:Y(p[0].p)},{h:"tp",x:X(p[0].t),y:Y(d.tp)},{h:"sl",x:X(p[0].t),y:Y(d.sl)},{h:"t2",x:X(d.t2),y:Y(p[0].p)}];
  if(d.type==="hl")return[{h:0,x:Math.min(L.pw-30,Math.max(30,X(p[0].t))),y:Y(p[0].p)}];
  const hs=p.map((q,i)=>({h:i,x:X(q.t),y:Y(q.p)}));
  if(d.type==="chan"&&p.length>1)hs.push({h:"off",x:(X(p[0].t)+X(p[1].t))/2,y:Y((p[0].p+p[1].p)/2+d.off)});
  return hs}
function segDist(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l=dx*dx+dy*dy;let t=l?((px-x1)*dx+(py-y1)*dy)/l:0;t=Math.max(0,Math.min(1,t));return Math.hypot(px-(x1+t*dx),py-(y1+t*dy))}
function dwHit(d,L,k,tf,x,y){const {X,Y}=dwXY(L,k,tf),p=d.pts,tol=7;
  switch(d.type){
    case"hl":return Math.abs(y-Y(p[0].p))<tol;
    case"ray":return Math.abs(y-Y(p[0].p))<tol&&x>=X(p[0].t)-tol;
    case"vl":return Math.abs(x-X(p[0].t))<tol;
    case"text":{return Math.abs(x-X(p[0].t)-30)<40&&Math.abs(y-Y(p[0].p))<10}
    case"tl":{const x1=X(p[0].t),y1=Y(p[0].p);let x2=X(p[1].t),y2=Y(p[1].p);if(d.ext&&x2!==x1){const s=(y2-y1)/(x2-x1);x2=L.pw;y2=y1+s*(x2-x1)}return segDist(x,y,x1,y1,x2,y2)<tol}
    case"chan":{const o=Y(p[0].p+d.off)-Y(p[0].p);return segDist(x,y,X(p[0].t),Y(p[0].p),X(p[1].t),Y(p[1].p))<tol||segDist(x,y,X(p[0].t),Y(p[0].p)+o,X(p[1].t),Y(p[1].p)+o)<tol}
    case"pos":{const x1=X(p[0].t),x2=X(d.t2),ys=[Y(d.tp),Y(d.sl)];return x>=Math.min(x1,x2)&&x<=Math.max(x1,x2)&&y>=Math.min(...ys)&&y<=Math.max(...ys)}
    default:{const xs=[X(p[0].t),X(p[1].t)],ys=[Y(p[0].p),Y(p[1].p)];return x>=Math.min(...xs)-tol&&x<=Math.max(...xs)+tol&&y>=Math.min(...ys)-tol&&y<=Math.max(...ys)+tol}}}
function drawDrawings(ctx,L,k,tf,list,sel,th){if(!L||!list||!list.length)return;const {X,Y}=dwXY(L,k,tf),pw=L.pw;
  ctx.save();ctx.beginPath();ctx.rect(0,0,pw,L.mainH);ctx.clip();
  const ln=(x1,y1,x2,y2,c,w,dash)=>{ctx.beginPath();ctx.strokeStyle=c;ctx.lineWidth=w;ctx.setLineDash(dash||[]);ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([])};
  const tx=(t,x,y,c,al,bold)=>{ctx.font=`${bold?"700 ":"600 "}11px "JetBrains Mono",ui-monospace,monospace`;ctx.textAlign=al||"left";ctx.textBaseline="middle";ctx.fillStyle=c;ctx.fillText(t,x,y)};
  list.forEach(d=>{const p=d.pts,c=d.col||"#f0a33a",w=+d.w||2;if(!p||!p.length)return;
    switch(d.type){
      case"tl":{const x1=X(p[0].t),y1=Y(p[0].p);let x2=X(p[1].t),y2=Y(p[1].p);if(d.ext&&x2!==x1){const s=(y2-y1)/(x2-x1);const xe=x2>x1?pw:0;y2=y1+s*(xe-x1);x2=xe}ln(x1,y1,x2,y2,c,w);break}
      case"hl":{const y=Y(p[0].p);ln(0,y,pw,y,c,w);const t=fmt(p[0].p);ctx.font='600 10px "JetBrains Mono",monospace';const tw=ctx.measureText(t).width;ctx.fillStyle=c;ctx.fillRect(pw-tw-10,y-7,tw+8,14);tx(t,pw-6,y,"#0e131b","right");break}
      case"ray":{const x1=X(p[0].t),y=Y(p[0].p);ln(x1,y,pw,y,c,w);tx(fmt(p[0].p),x1+4,y-8,c);break}
      case"vl":{const x=X(p[0].t);ln(x,0,x,L.mainH,c,w,[6,4]);break}
      case"rect":{const x1=X(p[0].t),x2=X(p[1].t),y1=Y(p[0].p),y2=Y(p[1].p);ctx.fillStyle=ra(c,.15);ctx.fillRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));ctx.strokeStyle=c;ctx.lineWidth=w;ctx.setLineDash([]);ctx.strokeRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));break}
      case"text":{ctx.font='700 13px Archivo,system-ui,sans-serif';ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillStyle=c;ctx.fillText(d.text||"Text",X(p[0].t),Y(p[0].p));break}
      case"fib":{if(p.length<2)break;const xa=Math.min(X(p[0].t),X(p[1].t)),xb=Math.max(X(p[0].t),X(p[1].t))+40,lv=x=>p[1].p+(p[0].p-p[1].p)*x;
        ctx.fillStyle=ra(c,.13);const za=Y(lv(0.618)),zb=Y(lv(0.667));ctx.fillRect(xa,Math.min(za,zb),xb-xa,Math.abs(zb-za));
        ln(X(p[0].t),Y(p[0].p),X(p[1].t),Y(p[1].p),ra(c,.5),1,[3,3]);
        DFIB.forEach(x=>{const y=Y(lv(x));ln(xa,y,xb,y,x===0||x===1?th.txt:c,1);tx(`${nf(x*100,1).replace(",0","")} % (${fmt(lv(x))})`,xb+4,y,x===0||x===1?th.txt:c)});break}
      case"pos":{const x1=X(p[0].t),x2=X(d.t2),xa=Math.min(x1,x2),xw=Math.abs(x2-x1),e=p[0].p,ye=Y(e),yt=Y(d.tp),ys=Y(d.sl),lg=d.tp>e;
        ctx.fillStyle="rgba(60,207,138,.18)";ctx.fillRect(xa,Math.min(ye,yt),xw,Math.abs(yt-ye));ctx.fillStyle="rgba(255,107,94,.18)";ctx.fillRect(xa,Math.min(ye,ys),xw,Math.abs(ys-ye));
        ln(xa,ye,xa+xw,ye,th.fg,1.5);const tp=(d.tp/e-1)*100,sl=(d.sl/e-1)*100,crv=Math.abs(d.tp-e)/Math.abs(e-d.sl||1);
        tx(`${lg?"Long":"Short"} · Ziel ${fmt(d.tp)} (${tp>=0?"+":""}${nf(tp,2)} %) · CRV ${nf(crv,2)}`,xa+4,yt+(lg?9:-9),"#3ccf8a",null,1);
        tx(`Stop ${fmt(d.sl)} (${sl>=0?"+":""}${nf(sl,2)} %)`,xa+4,ys+(lg?-9:9),"#ff6b5e",null,1);tx(`Einstieg ${fmt(e)}`,xa+4,ye+(lg?9:-9),th.fg);break}
      case"measure":{if(p.length<2)break;const x1=X(p[0].t),x2=X(p[1].t),y1=Y(p[0].p),y2=Y(p[1].p),up=p[1].p>=p[0].p,col=up?"#5b9bff":"#ff6b5e";
        ctx.fillStyle=ra(col,.14);ctx.fillRect(Math.min(x1,x2),Math.min(y1,y2),Math.abs(x2-x1),Math.abs(y2-y1));ln(x1,y1,x2,y2,col,1.5);
        const pc=(p[1].p/p[0].p-1)*100,bars=Math.round(tIdx(k,p[1].t,tf)-tIdx(k,p[0].t,tf));
        const t=`${pc>=0?"+":""}${nf(pc,2)} % · ${fmt(p[1].p-p[0].p)} · ${Math.abs(bars)} Kerzen`;ctx.font='700 11px "JetBrains Mono",monospace';const tw=ctx.measureText(t).width;
        const lx=(x1+x2)/2-tw/2-6,ly=up?Math.min(y1,y2)-18:Math.max(y1,y2)+4;ctx.fillStyle=col;ctx.fillRect(lx,ly,tw+12,15);tx(t,lx+6,ly+7.5,"#fff");break}
      case"chan":{if(p.length<2)break;const x1=X(p[0].t),x2=X(p[1].t),y1=Y(p[0].p),y2=Y(p[1].p),o=Y(p[0].p+(d.off||0))-y1;
        ctx.fillStyle=ra(c,.08);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineTo(x2,y2+o);ctx.lineTo(x1,y1+o);ctx.closePath();ctx.fill();
        ln(x1,y1,x2,y2,c,w);ln(x1,y1+o,x2,y2+o,c,w);ln(x1,y1+o/2,x2,y2+o/2,ra(c,.5),1,[4,4]);break}}
    if(sel===d.id){dwHandles(d,L,k,tf).forEach(h=>{ctx.fillStyle=th.bg;ctx.strokeStyle=c;ctx.lineWidth=2;ctx.beginPath();ctx.arc(h.x,h.y,5,0,7);ctx.fill();ctx.stroke()})}});
  ctx.restore()}

return{dfLevels,DEF,PIV,THEME,withDefaults,compute,draw,summary,fmt,tlab,vprofile,rkCol,heatCol,heatTxt,tIdx,idxT,drawDrawings,dwHandles,dwHit,DFIB};
})();
if(typeof module!=="undefined")module.exports=CC;
