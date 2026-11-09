// Wertet die Aktien-Kerzen aus gz_tmp/ mit derselben Berechnung wie die Webseite aus (gz-core.js)
// und schreibt die Ergebnisse nach gz_out/ (wird als Branch "gz-data" veröffentlicht).
"use strict";
const fs=require("fs"),path=require("path");
const {analyzeStd,analyzeSK}=require("./gz-core.js");
const IN=process.argv[2]||"gz_tmp",OUT=process.argv[3]||"gz_out";
const TFS={"1h":7,"4h":14,"1d":12,"1w":15},ORDER=["1h","4h","1d","1w"],MINI=90,DETAIL=300;
const candles=JSON.parse(fs.readFileSync(path.join(IN,"candles.json"),"utf8"));
const meta=JSON.parse(fs.readFileSync(path.join(IN,"meta.json"),"utf8"));
const r6=v=>typeof v!=="number"||!isFinite(v)||v===0?v:+v.toPrecision(6);
const round=o=>Array.isArray(o)?o.map(round):o&&typeof o==="object"?Object.fromEntries(Object.entries(o).map(([k,v])=>[k,round(v)])):r6(o);
const safe=y=>y.replace(/[^A-Za-z0-9.\-]/g,"_");
fs.mkdirSync(path.join(OUT,"c"),{recursive:true});
const res={};
for(const [y,tfs] of Object.entries(candles)){
  const m=meta.syms[y];if(!m)continue;const r={a:{},s:{},n:{},m:{}};
  for(const tf of ORDER){const raw=tfs[tf];if(!raw||raw.length<40)continue;
    const k=raw.map(x=>({t:x[0],o:x[1],h:x[2],l:x[3],c:x[4]}));
    try{r.a[tf]=analyzeStd(k,TFS[tf]);r.s[tf]=analyzeSK(k,TFS[tf])}catch(e){console.log(y,tf,e.message);continue}
    r.n[tf]=k.length;r.m[tf]=k.slice(-MINI).map(x=>x.c)}
  const d=tfs["1d"];r.ch=d&&d.length>1?(d[d.length-1][4]/d[d.length-2][4]-1)*100:null;
  res[y]=r;
  const det={};for(const tf of ORDER)if(tfs[tf])det[tf]=tfs[tf].slice(-DETAIL);
  fs.writeFileSync(path.join(OUT,"c",safe(y)+".json"),JSON.stringify(det));
}
const ys=Object.keys(res).sort((a,b)=>(meta.syms[b].mc||0)-(meta.syms[a].mc||0));
const updated=new Date().toISOString();
for(const tf of ORDER){
  const items=[];
  for(const y of ys){const r=res[y],m=meta.syms[y];if(!r.a[tf]&&!r.s[tf])continue;
    const bd={std:ORDER.map(t=>r.a[t]?r.a[t].dir||0:0),sk:ORDER.map(t=>r.s[t]?r.s[t].dir||0:0)};
    items.push(round({y,n:m.n,g:m.g,c:m.c,ch:r.ch,len:r.n[tf],m:r.m[tf],a:r.a[tf]||null,s:r.s[tf]||null,bd}))}
  fs.writeFileSync(path.join(OUT,`gz_${tf}.json`),JSON.stringify({updated,tf,groups:meta.groups,items}));
  console.log(tf,items.length,"Werte");
}
fs.writeFileSync(path.join(OUT,"README.md"),"Automatisch erzeugte Daten für golden-zone.html (Aktien). Nicht von Hand ändern.\n");
