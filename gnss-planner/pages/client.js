let worker,next=0;const pending=new Map();
function getWorker(){
 if(worker)return worker;
 worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{const task=pending.get(data.id);if(!task)return;task.finish(data.error?{error:data.error}:data.result,data.error?503:200);};
 worker.onerror=()=>{for(const task of pending.values())task.finish({error:'衛星計算を起動できません。ページを再読み込みしてください。'},503);worker.terminate();worker=null;};
 return worker;
}
async function address(path,signal){
 const u=new URL(path,'https://planner.invalid'),lat=u.searchParams.get('lat'),lon=u.searchParams.get('lon');
 try{
  const r=await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`,{signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(5000)])});
  if(!r.ok)throw Error();const d=await r.json();const table=await (await fetch('./municipalities.json',{signal})).json();
  return {address:table[Number(d.results?.muniCd)]?table[Number(d.results.muniCd)]+(d.results.lv01Nm||''):null,source:'国土地理院'};
 }catch(e){if(signal?.aborted)throw e;}
 const r=await fetch(`https://geoapi.heartrails.com/api/json?method=searchByGeoLocation&x=${lon}&y=${lat}`,{signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(8000)])});
 if(!r.ok)throw Error('住所を取得できません');const d=await r.json();const p=(d.response?.location||[]).filter(p=>Number.isFinite(Number(p.distance))).sort((a,b)=>Number(a.distance)-Number(b.distance))[0];
 return {address:p&&Number(p.distance)<=5000?p.prefecture+p.city+p.town+' 付近（住所候補・代表点まで約'+Math.round(Number(p.distance))+' m）':null,source:'HeartRails Geo API（近隣の住所候補）'};
}
export async function plannerFetch(path,{signal}={}){
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 if(path==='/api/status')return Response.json({hosted:true,lan:false,urls:[]});
 if(path.startsWith('/api/address'))return Response.json(await address(path,signal));
 return new Promise((resolve,reject)=>{
  const id=++next;
  const cleanup=()=>{pending.delete(id);signal?.removeEventListener('abort',abort);clearTimeout(timer);};
  const abort=()=>{cleanup();reject(new DOMException('Aborted','AbortError'));};
  const timer=setTimeout(()=>{cleanup();reject(Error('計算がタイムアウトしました。'));},45000);
  pending.set(id,{finish:(body,status)=>{cleanup();resolve(Response.json(body,{status}));}});signal?.addEventListener('abort',abort,{once:true});
  try{getWorker().postMessage({id,path});}catch(e){cleanup();reject(e);}
 });
}
