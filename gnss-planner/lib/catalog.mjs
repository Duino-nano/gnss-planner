import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { prepareRecords } from './geometry.mjs';

export const SOURCE='https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=json';
const directory=fileURLToPath(new URL('../data/',import.meta.url));
const file=`${directory}/gnss.json`;
const REFRESH=6*3600000, RETRY=15*60000;
let current, pending, lastAttempt=0, warning=null;
function accept(data) {
  if(!data || !Array.isArray(data.records) || !Number.isFinite(Date.parse(data.fetchedAt))) throw new Error('軌道データの形式を確認できません。');
  const records=prepareRecords(data.records);
  if(records.length<10) throw new Error('有効な軌道データが不足しています。');
  return {...data,records};
}
export async function catalog() {
  if(!current) { try { current=accept(JSON.parse(await readFile(file,'utf8'))); } catch {} }
  if(current && Date.now()-Date.parse(current.fetchedAt)<REFRESH) return current;
  if(pending) return pending;
  if(Date.now()-lastAttempt<RETRY) {
    if(current) return current;
    throw new Error('軌道データを取得できません。インターネット接続を確認し、15分後に再試行してください。');
  }
  lastAttempt=Date.now();
  pending=(async()=>{
    try {
      const response=await fetch(SOURCE,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'LocalGNSSPlanner/1.0'}});
      if(!response.ok) throw new Error(`配布元 HTTP ${response.status}`);
      const raw={source:SOURCE,fetchedAt:new Date().toISOString(),records:await response.json()};
      const prepared=accept(raw);
      await mkdir(directory,{recursive:true});
      await writeFile(`${file}.tmp`,JSON.stringify(raw));
      await rename(`${file}.tmp`,file);
      current=prepared; warning=null;
    } catch(error) {
      warning=`更新できなかったため保存済みデータを使用しています。${error.message}`;
      if(!current) throw new Error('軌道データを取得できません。インターネット接続を確認してください。');
    } finally { pending=null; }
    return current;
  })();
  return pending;
}
export function metadata(data) {
  const epochs=data.records.map(r=>r.epoch);
  return {source:SOURCE,fetchedAt:data.fetchedAt,oldestEpoch:new Date(Math.min(...epochs)).toISOString(),newestEpoch:new Date(Math.max(...epochs)).toISOString(),counts:Object.fromEntries(['G','J','E','R','C'].map(s=>[s,data.records.filter(r=>r.system===s).length])),warning,model:'SGP4/SDP4 · GP/OMM',health:'運用状態未確認',maxAgeDays:3};
}
