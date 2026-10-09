import {prepareRecords,validateOptions,snapshot} from './lib/geometry.mjs';
let catalogPromise,loaded=0;
async function catalog(){
 if(!catalogPromise||Date.now()-loaded>300000){loaded=Date.now();catalogPromise=fetch('./gnss.json',{cache:'no-cache'}).then(async r=>{if(!r.ok)throw Error('軌道データを取得できません');const raw=await r.json();const records=prepareRecords(raw.records);return {raw,records};}).catch(e=>{catalogPromise=null;throw e;});}
 return catalogPromise;
}
self.onmessage=async({data:{id,path}})=>{
 try{
  const url=new URL(path,'https://planner.invalid'),options=validateOptions(Object.fromEntries(url.searchParams));
  const {raw,records}=await catalog();
  let result;
  if(url.pathname==='/api/plan'){
   const epochs=records.map(r=>r.epoch);
   const warning=Date.now()-Date.parse(raw.fetchedAt)>12*3600000?'軌道データの更新が遅れています。取得日時を確認してください。':raw.warning||null;
   const meta={source:raw.source,fetchedAt:raw.fetchedAt,oldestEpoch:new Date(Math.min(...epochs)).toISOString(),newestEpoch:new Date(Math.max(...epochs)).toISOString(),counts:Object.fromEntries(['G','J','E','R','C'].map(k=>[k,records.filter(r=>r.system===k).length])),warning};
   result={...snapshot(records,options),meta,observer:{lat:options.lat,lon:options.lon,height:options.height,mask:options.mask}};
  }else{
   const centre=Math.floor(Date.now()/60000)*60000,points=[];
   for(let i=-96;i<=96;i++){const s=snapshot(records,{...options,time:centre+i*900000});points.push({time:s.time,pdop:s.dop.pdop,hdop:s.dop.hdop,vdop:s.dop.vdop,visible:s.visible,used:s.used,stale:s.stale});}
   result={points,stepMinutes:15,centre:new Date(centre).toISOString()};
  }
  self.postMessage({id,result});
 }catch(e){self.postMessage({id,error:e.message});}
};
