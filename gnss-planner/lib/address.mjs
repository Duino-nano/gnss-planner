import {readFile} from 'node:fs/promises';
const municipalities=new Map();
let ready;
async function table(){
 if(!ready)ready=(async()=>{
  let source;
  try{source=await readFile(new URL('../data/muni.js',import.meta.url),'utf8');}
  catch{const r=await fetch('https://maps.gsi.go.jp/js/muni.js',{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('自治体名を取得できません');source=await r.text();}
  for(const match of source.matchAll(/GSI\.MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']+)'/g)){const fields=match[2].split(',');municipalities.set(String(Number(match[1])),fields[1]+fields[3].replaceAll('　',''));}
 })().catch(e=>{ready=null;throw e;});
 await ready;
}
async function gsiAddress(input){
 if(!input.lat?.trim()||!input.lon?.trim())throw new RangeError('緯度・経度が必要です');
 const lat=Number(input.lat),lon=Number(input.lon);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180)throw new RangeError('緯度・経度が範囲外です');
 const response=await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`,{signal:AbortSignal.timeout(2500)});
 if(!response.ok)throw Error('住所サービスに接続できません');
 const data=await response.json();
 if(!data.results?.muniCd)return {address:null,source:'国土地理院'};
 await table();const town=municipalities.get(String(Number(data.results.muniCd)));
 return {address:town?town+(data.results.lv01Nm||''):null,source:'国土地理院'};
}

const cache=new Map();
export async function reverseAddress(input){
 const lat=Number(input.lat),lon=Number(input.lon);
 if(!input.lat?.trim()||!input.lon?.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw new RangeError('緯度・経度が範囲外です');
 const key=lat.toFixed(4)+','+lon.toFixed(4);if(cache.has(key))return cache.get(key);
 const pending=(async()=>{
  try{return await gsiAddress(input);}catch{}
  const r=await fetch('https://geoapi.heartrails.com/api/json?method=searchByGeoLocation&x='+lon+'&y='+lat,{signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('住所サービスに接続できません');const d=await r.json();
  const locations=(d.response?.location||[]).filter(p=>Number.isFinite(Number(p.distance))).sort((a,b)=>Number(a.distance)-Number(b.distance));
  const p=locations[0];return {address:p&&Number(p.distance)<=5000?p.prefecture+p.city+p.town+' 付近（住所候補・代表点まで約'+Math.round(Number(p.distance))+' m）':null,source:'HeartRails Geo API（近隣の住所候補）'};
 })();if(cache.size>=256)cache.clear();cache.set(key,pending);try{return await pending;}catch(e){cache.delete(key);throw e;}
}
