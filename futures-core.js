// Bayazit Futures-Positionierung – gemeinsame Logik für futures.html und golden-zone.html
// Daten: Binance Futures (öffentliche Schnittstelle, direkt aus dem Browser)
"use strict";
const FUT=(()=>{
  const B="https://fapi.binance.com";
  // Anzahl Perioden für "24 Stunden"
  const PER={"15m":{n:96,lab:"15M"},"1h":{n:24,lab:"1H"},"4h":{n:6,lab:"4H"}};
  const CACHE_MS=5*60e3;
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  async function j(u,ms=15000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
    try{const r=await fetch(B+u,{signal:c.signal});if(!r.ok)throw new Error("HTTP "+r.status);return await r.json()}finally{clearTimeout(t)}}
  async function pool(items,fn,conc,onStep){let i=0,done=0;
    await Promise.all(Array.from({length:conc},async()=>{while(i<items.length){const it=items[i++];try{await fn(it)}catch(e){}done++;onStep&&onStep(done,items.length)}}))}
  const LS=(k,v)=>{try{if(v===undefined)return JSON.parse(localStorage.getItem(k)||"null");localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}};

  let MK=null;
  // Markt: alle USDT-Perpetuals mit 24h-Änderung, Volumen, Funding, Premium
  async function market(force){if(MK&&!force&&Date.now()-MK.t<120e3)return MK.m;
    const [tk,pi]=await Promise.all([j("/fapi/v1/ticker/24hr",20000),j("/fapi/v1/premiumIndex",20000)]);
    const m={},now=Date.now();
    tk.forEach(x=>{if(!/USDT$/.test(x.symbol)||now-x.closeTime>3*36e5)return;const base=x.symbol.slice(0,-4);
      const pre=(base.match(/^(1000000|100000|10000|1000|1M)(?=[A-Z])/)||[""])[0];const b=base.slice(pre.length);if(!b)return;
      if(m[b]&&m[b].vol>+x.quoteVolume)return;
      m[b]={fs:x.symbol,price:+x.lastPrice,ch:+x.priceChangePercent,vol:+x.quoteVolume}});
    const pm={};pi.forEach(x=>pm[x.symbol]=x);
    Object.values(m).forEach(v=>{const p=pm[v.fs];if(p){v.fund=+p.lastFundingRate;const mk=+p.markPrice,ix=+p.indexPrice;v.prem=ix?(mk/ix-1)*100:null}});
    MK={t:now,m};return m}

  function lage(pc,oiD){if(oiD>1&&pc>0.5)return{k:"nl",t:"Neue Longs"};if(oiD>1&&pc<-0.5)return{k:"ns",t:"Neue Shorts"};
    if(oiD<-1&&pc>0.5)return{k:"sa",t:"Short-Abbau"};if(oiD<-1&&pc<-0.5)return{k:"la",t:"Long-Abbau"};return{k:"sw",t:"Ruhig"}}
  function einordnung(x){const {crowd,div,fundAPR:f,oiD}=x;
    if(crowd>=75&&(f>=12||(oiD>=5&&f>=0)))return{k:"longcrowd",t:"Long überfüllt"};
    if(crowd<=45&&(f<=-3||(oiD>=5&&f<=5)))return{k:"shortcrowd",t:"Short überfüllt"};
    if(div<=-8)return{k:"topdef",t:"Top-Trader defensiv"};
    if(div>=8)return{k:"topoff",t:"Top-Trader offensiv"};
    if(oiD<=-8)return{k:"delev",t:"Deleveraging"};
    return{k:"neutral",t:"Neutral"}}
  async function one(base,mk,per){const fs=mk.fs,n=PER[per].n,lim=Math.min(500,n+1);
    const r=await Promise.allSettled([
      j(`/futures/data/globalLongShortAccountRatio?symbol=${fs}&period=${per}&limit=30`),
      j(`/futures/data/topLongShortAccountRatio?symbol=${fs}&period=${per}&limit=30`),
      j(`/futures/data/topLongShortPositionRatio?symbol=${fs}&period=${per}&limit=30`),
      j(`/futures/data/openInterestHist?symbol=${fs}&period=${per}&limit=${Math.max(30,lim)}`),
      j(`/futures/data/takerlongshortRatio?symbol=${fs}&period=${per}&limit=${Math.min(30,n)}`)]);
    const v=i=>r[i].status==="fulfilled"&&Array.isArray(r[i].value)?r[i].value:[];
    const g=v(0),ta=v(1),tp=v(2),oi=v(3),tk=v(4);if(!g.length)return null;
    const last=a=>a[a.length-1];
    const crowd=+last(g).longAccount*100,topAcc=ta.length?+last(ta).longAccount*100:null,topPos=tp.length?+last(tp).longAccount*100:null;
    let oiV=null,oiD=0;if(oi.length){oiV=+last(oi).sumOpenInterestValue;const b=oi[Math.max(0,oi.length-1-n)];oiD=(oiV/(+b.sumOpenInterestValue)-1)*100}
    let bs=0,ss=0;tk.forEach(t=>{bs+=+t.buyVol;ss+=+t.sellVol});const taker=bs+ss?bs/(bs+ss)*100:50;
    const fundAPR=mk.fund!=null?mk.fund*3*365*100:0,div=topPos!=null?topPos-crowd:0,pc=mk.ch;
    const stress=Math.round(100*(0.4*clamp(Math.abs(fundAPR)/30)+0.3*clamp(Math.max(0,oiD)/15)+0.3*clamp(Math.abs(crowd-50)/35)));
    const druck=Math.round(clamp(50+(taker-50)*2+(oiD>1?Math.sign(pc)*Math.min(20,oiD*2):0),0,100));
    const x={base,fs,crowd,topAcc,topPos,div,oi:oiV,oiD,fund:mk.fund,fundAPR,prem:mk.prem,taker,pc,price:mk.price,vol:mk.vol,stress,druck,
      hc:g.slice(-24).map(e=>+(e.longAccount*100).toFixed(1)),hp:tp.slice(-24).map(e=>+(e.longAccount*100).toFixed(1)),ho:oi.slice(-30).map(e=>+(+e.sumOpenInterestValue).toPrecision(5))};
    x.lage=lage(pc,oiD);x.einord=einordnung(x);return x}
  // Lädt Futures-Werte für eine Liste von Coin-Kürzeln (z. B. ["BTC","ETH"]); Ergebnis: {BTC:{…}, …}
  async function load(bases,per="1h",onStep,force){const key="bfut_"+per,c=LS(key)||{t:0,d:{}};
    const fresh=!force&&Date.now()-c.t<CACHE_MS;const m=await market(force);
    const out={},todo=[];
    bases.forEach(b=>{if(!m[b])return;if(fresh&&c.d[b])out[b]=c.d[b];else todo.push(b)});
    await pool(todo,async b=>{const x=await one(b,m[b],per);if(x)out[b]=x},6,onStep);
    if(todo.length)LS(key,{t:fresh?c.t:Date.now(),d:Object.assign(fresh?c.d:{},out)});
    return out}
  // Bewertung relativ zur Trade-Richtung (1 = Long, -1 = Short)
  function forDir(x,dir){if(!x)return null;const k=x.einord.k;
    if((dir===1&&k==="longcrowd")||(dir===-1&&k==="shortcrowd"))return{cls:"warn",t:"⚠ "+x.einord.t+" – Seite ist voll"};
    if((dir===1&&k==="shortcrowd")||(dir===-1&&k==="longcrowd"))return{cls:"good",t:"Rückenwind: "+x.einord.t};
    if(dir===1&&k==="topdef")return{cls:"mild",t:"Top-Trader defensiv"};
    if(dir===-1&&k==="topoff")return{cls:"mild",t:"Top-Trader offensiv long"};
    return{cls:"",t:x.einord.t}}
  return{PER,load,market,forDir}
})();
if(typeof module!=="undefined")module.exports=FUT;
