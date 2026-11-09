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
  sk:{on:true},
  gz:{on:false},
  fib:{on:false,levels:"0.5,0.559,0.618,0.667,0.786,0.886,1.272,1.618",zone:true},
  ms:{on:true,n:3,labels:true},
  tl:{on:true,n:1},
  sr:{on:false},
  vp:{on:false,range:"vis",rows:60,va:70,hist:true},
  liq:{on:false,n:5},
  fvg:{on:false,n:4},
  ma1:{on:true,type:"EMA",len:21,col:"#ffeb3b"},
  ma2:{on:true,type:"EMA",len:50,col:"#ff9800"},
  ma3:{on:false,type:"SMA",len:200,col:"#e91e63"},
  vwap:{on:false,anchor:"D"},
  bb:{on:false,len:20,mult:2},
  vol:{on:true},
  rsi:{on:true,len:14,hi:80,lo:20,div:true},
  macd:{on:false,f:12,s:26,sig:9}
};
const clone=o=>JSON.parse(JSON.stringify(o));
function withDefaults(cfg){const out=clone(DEF);if(cfg)for(const k in cfg)if(out[k]&&typeof cfg[k]==="object")Object.assign(out[k],cfg[k]);return out}

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
function srzones(k,pv,at){const pts=[...pv.ph.slice(-40).map(p=>p.p),...pv.pl.slice(-40).map(p=>p.p)].sort((a,b)=>a-b);const tol=at*0.6,z=[];let cur=null;
  pts.forEach(p=>{if(cur&&p-cur.hi<=tol){cur.hi=p;cur.n++}else{if(cur)z.push(cur);cur={lo:p,hi:p,n:1}}});if(cur)z.push(cur);
  return z.filter(x=>x.n>=2).map(x=>({lo:x.lo-tol*0.25,hi:x.hi+tol*0.25,n:x.n}))}
function sweeps(k,pv,n){const out=[];
  pv.ph.forEach(p=>{for(let j=p.i+1;j<k.length;j++)if(k[j].h>p.p){if(k[j].c<p.p)out.push({t:-1,i:j,lvl:p.p,from:p.i});break}});
  pv.pl.forEach(p=>{for(let j=p.i+1;j<k.length;j++)if(k[j].l<p.p){if(k[j].c>p.p)out.push({t:1,i:j,lvl:p.p,from:p.i});break}});
  return out.sort((a,b)=>a.i-b.i).slice(-n)}
function fvgs(k,n,at){const out=[];
  for(let i=2;i<k.length;i++){if(k[i].l>k[i-2].h&&k[i].l-k[i-2].h>at*0.1)out.push({t:1,i:i-1,top:k[i].l,bot:k[i-2].h});
    else if(k[i].h<k[i-2].l&&k[i-2].l-k[i].h>at*0.1)out.push({t:-1,i:i-1,top:k[i-2].l,bot:k[i].h})}
  return out.filter(f=>{for(let j=f.i+2;j<k.length;j++)if(f.t===1?k[j].l<=f.bot:k[j].h>=f.top)return false;return true}).slice(-n)}

function compute(k,cfg,tf){const L=cfg.pivot.auto?(PIV[tf]||10):Math.max(2,+cfg.pivot.len||10),c=k.map(x=>x.c),I={L,n:k.length};
  if(k.length<2*L+10)return I;
  const pv=G.pivots(k,L);I.pv=pv;I.atr=atr(k);
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
  if(cfg.fvg.on)I.fvg=fvgs(k,Math.max(1,+cfg.fvg.n||4),I.atr);
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
function niceStep(range,n){const raw=range/n,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;return(f<1.5?1:f<3?2:f<7?5:10)*p}

function draw(ctx,W,H,S){const th=S.th||THEME.dark,k=S.k,I=S.I||{},cfg=S.cfg,tf=S.tf;
  const AX=74,TA=22,pw=W-AX;
  ctx.fillStyle=th.bg;ctx.fillRect(0,0,W,H);ctx.textBaseline="middle";
  if(!k||!k.length){ctx.fillStyle=th.txt;ctx.font="14px sans-serif";ctx.textAlign="center";ctx.fillText("Keine Daten",W/2,H/2);return null}
  const subs=[];if(cfg.rsi.on&&I.rsi)subs.push("rsi");if(cfg.macd.on&&I.macd)subs.push("macd");
  const subH=subs.length?Math.round((H-TA)*(subs.length>1?0.17:0.2)):0,mainH=H-TA-subH*subs.length;
  const from=S.view.from,to=S.view.to,cw=pw/(to-from),X=i=>(i-from+0.5)*cw;
  const i0=Math.max(0,Math.floor(from)),i1=Math.min(k.length-1,Math.ceil(to));
  let lo=Infinity,hi=-Infinity;for(let i=i0;i<=i1;i++){if(k[i].l<lo)lo=k[i].l;if(k[i].h>hi)hi=k[i].h}
  if(!isFinite(lo)){lo=k[k.length-1].l;hi=k[k.length-1].h}
  const pad=(hi-lo)*0.08||hi*0.01;lo-=pad;hi+=pad;
  const mT=6,mB=mainH-6,Y=p=>mT+(hi-p)/(hi-lo)*(mB-mT),P=y=>hi-(y-mT)/(mB-mT)*(hi-lo);
  const tags=[],names=[];
  const font=(s,b)=>ctx.font=`${b?"600 ":""}${s}px "JetBrains Mono",ui-monospace,monospace`;
  const line=(x1,y1,x2,y2,col,w=1,dash)=>{ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=w;ctx.setLineDash(dash||[]);ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([])};
  const series=(v,col,w=1.4,dash,Yf=Y)=>{ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=w;ctx.setLineDash(dash||[]);let on=false;
    for(let i=i0;i<=i1;i++){if(v[i]==null){on=false;continue}const x=X(i),y=Yf(v[i]);if(on)ctx.lineTo(x,y);else{ctx.moveTo(x,y);on=true}}ctx.stroke();ctx.setLineDash([])};
  const hl=(p,fromI,col,w,dash,name,tag=true)=>{if(p==null||!isFinite(p))return;const y=Y(p);const x1=fromI==null?0:Math.max(0,X(fromI));
    if(y>=mT-2&&y<=mB+2){line(x1,y,pw,y,col,w,dash);if(name)names.push({y,col,t:name})}
    if(tag)tags.push({y:Math.max(mT,Math.min(mB,y)),col,t:fmt(p),off:y<mT||y>mB})};
  const band=(a,b,fromI,col)=>{if(a==null||b==null)return;const y1=Y(Math.max(a,b)),y2=Y(Math.min(a,b)),x1=fromI==null?0:Math.max(0,X(fromI));ctx.fillStyle=col;ctx.fillRect(x1,y1,pw-x1,Math.max(1,y2-y1))};
  const dot=(i,p,col,txt,above)=>{const x=X(i),y=Y(p);if(x<-10||x>pw+10)return;ctx.fillStyle=col;ctx.beginPath();ctx.arc(x,y,3.5,0,7);ctx.fill();if(txt){font(11,1);ctx.textAlign="center";ctx.fillText(txt,x,y+(above?-12:12))}};

  // Raster
  ctx.save();ctx.beginPath();ctx.rect(0,0,pw,mainH);ctx.clip();
  const st=niceStep(hi-lo,6);font(10);ctx.textAlign="left";
  for(let v=Math.ceil(lo/st)*st;v<=hi;v+=st)line(0,Y(v),pw,Y(v),th.grid,1);
  const step=Math.max(1,Math.ceil(95/cw));for(let i=Math.ceil(from/step)*step;i<=to;i+=step)line(X(i),0,X(i),H-TA,th.grid,1);

  // Zonen (hinten)
  const last=k.length-1,price=k[last].c;
  if(cfg.sr.on&&I.sr){const above=I.sr.filter(z=>z.lo>price).sort((a,b)=>a.lo-b.lo).slice(0,2),below=I.sr.filter(z=>z.hi<price).sort((a,b)=>b.hi-a.hi).slice(0,2),inside=I.sr.filter(z=>z.lo<=price&&z.hi>=price);
    [...above,...below,...inside].forEach(z=>{band(z.lo,z.hi,null,"rgba(141,153,171,.14)");names.push({y:Y((z.lo+z.hi)/2),col:th.grey,t:`S/R ×${z.n}`})})}
  if(cfg.fvg.on&&I.fvg)I.fvg.forEach(f=>{const x1=Math.max(0,X(f.i));const y1=Y(f.top),y2=Y(f.bot);ctx.fillStyle=f.t===1?"rgba(60,207,138,.14)":"rgba(255,107,94,.14)";ctx.fillRect(x1,y1,pw-x1,Math.max(1,y2-y1));
    font(9);ctx.textAlign="left";ctx.fillStyle=f.t===1?th.green:th.red;ctx.fillText("FVG",x1+3,(y1+y2)/2)});

  // Volumenprofil
  let vp=null;if(cfg.vp.on){vp=cfg.vp.range==="vis"?vprofile(k,i0,Math.min(i1,last),+cfg.vp.rows||60,+cfg.vp.va||70):I.vpFix}
  if(vp){if(cfg.vp.hist!==false){const wMax=pw*0.22;vp.b.forEach((v,r)=>{const yA=Y(vp.lo+(r+1)*vp.step),yB=Y(vp.lo+r*vp.step),w=v/vp.max*wMax;
        ctx.fillStyle=r===vp.poc?"rgba(156,39,176,.55)":r>=vp.a&&r<=vp.z?"rgba(91,155,255,.28)":"rgba(141,153,171,.16)";ctx.fillRect(pw-w,yA+0.5,w,Math.max(1,yB-yA-1))})}
    hl(vp.vah,null,"#64b5f6",1,[4,3],"VAH");hl(vp.val,null,"#64b5f6",1,[4,3],"VAL");hl(vp.pocP,null,"#ba68c8",1.4,null,"POC")}

  // Volumen
  if(cfg.vol.on){let vm=0;for(let i=i0;i<=i1;i++)vm=Math.max(vm,k[i].v||0);if(vm>0){const vh=mainH*0.16;
      for(let i=i0;i<=i1;i++){const x=k[i],h=(x.v||0)/vm*vh;ctx.fillStyle=x.c>=x.o?"rgba(60,207,138,.28)":"rgba(141,153,171,.25)";ctx.fillRect(X(i)-cw*0.35,mB-h,Math.max(1,cw*0.7),h)}}}

  // Linien-Indikatoren
  if(cfg.bb.on&&I.bb){series(I.bb.up,"rgba(91,155,255,.7)",1);series(I.bb.dn,"rgba(91,155,255,.7)",1);series(I.bb.mid,"rgba(91,155,255,.45)",1,[4,3])}
  (I.ma||[]).forEach(m=>{if(m){series(m.v,m.col,1.5);const v=m.v[last];if(v!=null)tags.push({y:Y(v),col:m.col,t:fmt(v),off:Y(v)<mT||Y(v)>mB})}});
  if(cfg.vwap.on&&I.vwap){series(I.vwap,"#b388ff",1.5);tags.push({y:Y(I.vwap[last]),col:"#b388ff",t:fmt(I.vwap[last])})}

  // Golden Zone
  const gz=I.gz;
  if(cfg.gz.on&&gz&&gz.lv){const v=gz.lv,fr=gz.from,dc=gz.dir===1?th.green:th.red;band(v.g1,v.g2,fr,th.goldbg);
    hl(v.h,fr,th.grey,1,null,"0");hl(v.f5,fr,th.grey,1,[4,3],"0,5");hl(v.g1,fr,th.gold,1.3,null,"0,618");hl(v.g2,fr,th.gold,1.3,null,"0,786");
    hl(v.l,fr,dc,1.5,null,"1,0");hl(v.tp1,fr,th.blue,1.3,null,"TP1");hl(v.tp2,fr,th.blue,1.1,[5,4],"TP2")}
  // Fibonacci (Trend, wie BFT)
  if(cfg.fib.on&&gz&&gz.lv){const h=gz.lv.h,l=gz.lv.l,px=x=>h+x*(l-h),anchor=gz.dir===1?gz.Hi:gz.Hi;
    const lv=String(cfg.fib.levels).split(/[,; ]+/).map(Number).filter(x=>isFinite(x));
    if(cfg.fib.zone)band(px(0.618),px(0.667),anchor,"rgba(255,235,59,.14)");
    lv.forEach(x=>{const col=x>1?(Math.abs(x-1.272)<0.01?"#ba68c8":th.blue):(x>=0.6&&x<=0.67?"#26c6da":th.fg),dash=x>1.5?[5,4]:null;
      hl(px(x),anchor,col,1,dash,`${nf(x*100,1).replace(",0","")} %`)});hl(h,anchor,th.grey,1,null,"0 %",false)}
  // SK-System
  const sk=I.sk;
  if(cfg.sk.on&&sk&&sk.dir){const P2=sk.P,ix=sk.idx,dc=sk.dir===1?th.green:th.red;
    hl(P2.z,ix.z,dc,1.4,null,"0");hl(P2.a,ix.a,th.grey,1.2,null,"A");hl(P2.b,ix.b,th.red,1.2,[2,3],"B");
    if(sk.phase===1){[0.5,0.618,0.786].forEach(x=>hl(sk.lv[x],ix.b,th.grey,1,[3,3],`${nf(x*100,1)} %`))}
    else{const fr=sk.goal?ix.z:ix.b;hl(P2.c,ix.c,dc,1.2,null,"C");band(sk.lv[0.5],sk.lv[0.786],fr,th.goldbg);
      [[0.5,"E1"],[0.559,"E2"],[0.618,"E3"],[0.667,"E4"]].forEach(([x,n])=>hl(sk.lv[x],fr,th.gold,1,null,n));
      hl(sk.lv[0.786],fr,th.red,1.3,[5,3],"SL 78,6");hl(sk.lv[0.886],fr,th.grey,1,[2,3],"88,6");
      if(!sk.goal){hl(sk.t161,ix.brk,th.blue,1.3,null,"Ziel 161,8");hl(sk.t200,ix.brk,th.blue,1,[5,4],"200 %")}}
    dot(ix.z,P2.z,dc,"0",sk.dir===-1);dot(ix.a,P2.a,th.grey,"A",sk.dir===1);dot(ix.b,P2.b,th.red,"B",sk.dir===-1);if(ix.c!=null)dot(ix.c,P2.c,dc,"C",sk.dir===1)}
  // Trendlinien
  if(cfg.tl.on&&I.tl)I.tl.forEach(t=>{const col=t.sup?"#ffeb3b":"#9c27b0",ext=last+8,y2=t.a.p+t.sl*(ext-t.a.i);
    line(X(t.a.i),Y(t.a.p),X(ext),Y(y2),col,2);const vNow=t.a.p+t.sl*(last-t.a.i);tags.push({y:Y(vNow),col,t:fmt(vNow),off:Y(vNow)<mT||Y(vNow)>mB})});
  // Marktstruktur
  if(cfg.ms.on&&I.ms){if(cfg.ms.labels!==false){font(10,1);ctx.textAlign="center";const hs=I.ms.lab.filter(l=>l.up).slice(-10),ls=I.ms.lab.filter(l=>!l.up).slice(-10);
      [...hs,...ls].forEach(l=>{const x=X(l.i);if(x<0||x>pw)return;ctx.fillStyle=l.t==="HH"||l.t==="HL"?th.green:l.t==="LH"||l.t==="LL"?th.red:th.txt;ctx.fillText(l.t,x,Y(l.p)+(l.up?-11:11))})}
    I.ms.ev.slice(-(+cfg.ms.n||3)).forEach(e=>{const col=e.d===1?th.green:th.red,y=Y(e.piv.p);line(X(e.piv.i),y,X(e.bar),y,col,1,[4,3]);
      font(9,1);ctx.textAlign="center";ctx.fillStyle=col;ctx.fillText(e.ch?"CHoCH":"BOS",(X(e.piv.i)+X(e.bar))/2,y+(e.d===1?-8:8))})}

  // Kerzen
  for(let i=i0;i<=i1;i++){const x=k[i],cx=X(i),up=x.c>=x.o,col=up?th.up:th.dn,bw=Math.max(1,cw*0.66);
    line(cx,Y(x.h),cx,Y(x.l),col,1);const yo=Y(Math.max(x.o,x.c)),yc=Y(Math.min(x.o,x.c));ctx.fillStyle=col;ctx.fillRect(cx-bw/2,yo,bw,Math.max(1,yc-yo))}
  // Liquidität
  if(cfg.liq.on&&I.liq)I.liq.forEach(s=>{const x=k[s.i],cx=X(s.i),col=s.t===1?"#2979ff":"#e91e63";
    if(s.t===1)line(cx,Y(Math.min(x.o,x.c)),cx,Y(x.l),col,3);else line(cx,Y(Math.max(x.o,x.c)),cx,Y(x.h),col,3);
    line(X(s.from),Y(s.lvl),cx,Y(s.lvl),col,1,[3,3])});
  // Divergenz im Kurs
  if(cfg.rsi.on&&cfg.rsi.div&&I.div)I.div.forEach(d=>{const col=d.t===1?"#00e5ff":"#ff4081";line(X(d.a),Y(d.pa),X(d.b),Y(d.pb),col,1.5,[2,3]);
    font(9,1);ctx.textAlign="center";ctx.fillStyle=col;ctx.fillText(d.t===1?"Div▲":"Div▼",X(d.b),Y(d.pb)+(d.t===1?14:-14))});

  // Namen der Linien (rechts im Chart)
  names.sort((a,b)=>a.y-b.y);let prevN=-99;font(10,1);ctx.textAlign="right";
  names.forEach(n=>{if(n.y<mT||n.y>mB)return;const y=Math.max(n.y-7,prevN+11);prevN=y;ctx.fillStyle=n.col;ctx.fillText(n.t,pw-6,y)});
  ctx.restore();

  // Unterfenster
  const panes=[];let top=mainH;
  subs.forEach(s=>{const pT=top+4,pB=top+subH-4;panes.push({s,top,h:subH});line(0,top,W,top,th.grid,1);
    ctx.save();ctx.beginPath();ctx.rect(0,top,pw,subH);ctx.clip();
    if(s==="rsi"){const Yr=v=>pT+(100-v)/100*(pB-pT);const hiL=+cfg.rsi.hi||70,loL=+cfg.rsi.lo||30;
      ctx.fillStyle="rgba(179,136,255,.06)";ctx.fillRect(0,Yr(hiL),pw,Yr(loL)-Yr(hiL));
      line(0,Yr(hiL),pw,Yr(hiL),th.grey,1,[4,3]);line(0,Yr(loL),pw,Yr(loL),th.grey,1,[4,3]);line(0,Yr(50),pw,Yr(50),th.grid,1,[2,3]);
      series(I.rsi,"#b388ff",1.4,null,Yr);
      if(cfg.rsi.div&&I.div)I.div.forEach(d=>line(X(d.a),Yr(d.ra),X(d.b),Yr(d.rb),d.t===1?"#00e5ff":"#ff4081",1.5,[2,3]));
      font(10,1);ctx.textAlign="left";ctx.fillStyle="#b388ff";const rv=I.rsi[last];ctx.fillText(`RSI ${cfg.rsi.len}  ${rv!=null?nf(rv,1):"–"}`,6,pT+8);
      ctx.restore();font(10);ctx.textAlign="left";ctx.fillStyle=th.txt;ctx.fillText(String(hiL),pw+6,Yr(hiL));ctx.fillText(String(loL),pw+6,Yr(loL));
      if(rv!=null)tagDraw(ctx,pw,Yr(rv),"#b388ff",nf(rv,1),AX,th)}
    else{const m=I.macd;let mx=0;for(let i=i0;i<=i1;i++)[m.m[i],m.sig[i],m.h[i]].forEach(v=>{if(v!=null)mx=Math.max(mx,Math.abs(v))});mx=mx||1;
      const Ym=v=>pT+(mx-v)/(2*mx)*(pB-pT);line(0,Ym(0),pw,Ym(0),th.grid,1);
      for(let i=i0;i<=i1;i++){const v=m.h[i];if(v==null)continue;ctx.fillStyle=v>=0?"rgba(60,207,138,.5)":"rgba(255,107,94,.5)";const y=Ym(v),y0=Ym(0);ctx.fillRect(X(i)-cw*0.35,Math.min(y,y0),Math.max(1,cw*0.7),Math.abs(y-y0))}
      series(m.m,"#5b9bff",1.3,null,Ym);series(m.sig,"#ff9800",1.3,null,Ym);
      font(10,1);ctx.textAlign="left";ctx.fillStyle=th.txt;ctx.fillText(`MACD ${cfg.macd.f}/${cfg.macd.s}/${cfg.macd.sig}`,6,pT+8);ctx.restore()}
    top+=subH});

  // Achsen
  ctx.fillStyle=th.axis;ctx.fillRect(pw,0,AX,H);ctx.fillRect(0,H-TA,pw,TA);line(pw,0,pw,H,th.grid,1);line(0,H-TA,W,H-TA,th.grid,1);
  font(10);ctx.fillStyle=th.txt;ctx.textAlign="left";for(let v=Math.ceil(lo/st)*st;v<=hi;v+=st){const y=Y(v);if(y>8&&y<mainH-8)ctx.fillText(fmt(v),pw+6,y)}
  ctx.textAlign="center";let lastDay=null;
  for(let i=Math.ceil(from/step)*step;i<=to;i+=step){if(i<0||i>last)continue;const d=new Date(k[i].t),day=d.toDateString();
    const txt=(tf!=="1d"&&tf!=="1w"&&day!==lastDay)?tlab(k[i].t,"1d"):tlab(k[i].t,tf);lastDay=day;ctx.fillText(txt,X(i),H-TA/2)}
  // Preis-Schilder
  tags.push({y:Y(price),col:price>=k[last].o?th.up:th.red,t:fmt(price),main:1});
  tags.filter(t=>!t.off||t.main).sort((a,b)=>a.y-b.y).reduce((prev,t)=>{const y=Math.max(t.y,prev+15);tagDraw(ctx,pw,y,t.col,t.t,AX,th,t.main);return y},-99);
  if(Y(price)>=mT&&Y(price)<=mB)line(0,Y(price),pw,Y(price),price>=k[last].o?th.up:th.red,1,[1,3]);

  // Fadenkreuz
  const L={pw,mainH,panes,X,Y,P,cw,from,to,i0,i1,TA,H,W};
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
  if(I.liq&&I.liq.length){const s=I.liq[I.liq.length-1];out.push({t:"Liquidität",v:`${s.t===1?"Tief":"Hoch"} bei ${fmt(s.lvl)} abgeholt vor ${last-s.i} Kerzen`,c:s.t===1?"up":"down"})}
  return out}

return{DEF,PIV,THEME,withDefaults,compute,draw,summary,fmt,tlab,vprofile};
})();
if(typeof module!=="undefined")module.exports=CC;
