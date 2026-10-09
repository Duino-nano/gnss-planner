import {mkdir,cp,readFile,writeFile} from 'node:fs/promises';
import {prepareRecords} from '../lib/geometry.mjs';
const root=new URL('../',import.meta.url),out=new URL('../../_site/',import.meta.url);
await mkdir(out,{recursive:true});
await cp(new URL('dist/',root),out,{recursive:true});
await cp(new URL('pages/',root),out,{recursive:true});
await mkdir(new URL('lib/',out),{recursive:true});
await cp(new URL('lib/geometry.mjs',root),new URL('lib/geometry.mjs',out));
await cp(new URL('vendor/satellite/',root),new URL('vendor/satellite/',out),{recursive:true});
await cp(new URL('public-data/municipalities.json',root),new URL('municipalities.json',out));
const source='https://celestrak.org/NORAD/elements/gp.php?GROUP=gnss&FORMAT=json';
let raw;
try{
 const r=await fetch(source,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);
 raw={source,fetchedAt:new Date().toISOString(),records:await r.json()};
 if(prepareRecords(raw.records).length<10)throw Error('invalid orbit data');
}catch(e){
 console.warn('Upstream unavailable:',e.message);
 try{const r=await fetch('https://duino-nano.github.io/gnss-planner/gnss.json',{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();raw=await r.json();if(!Array.isArray(raw.records))throw Error();}
 catch{raw=JSON.parse(await readFile(new URL('public-data/gnss.json',root),'utf8'));}
 raw.warning='軌道データの更新に失敗したため、前回取得分を使用しています。';
}
if(!Number.isFinite(Date.parse(raw.fetchedAt))||prepareRecords(raw.records).length<10)throw Error('No valid orbit data');
await writeFile(new URL('gnss.json',out),JSON.stringify(raw));
let html=await readFile(new URL('index.html',out),'utf8');
html=html.replaceAll('href="/','href="./').replaceAll('src="/','src="./').replace('Windowsとブラウザの位置情報を許可してください。アプリ内で取得できない場合は、EdgeまたはChromeでlocalhost:3000を開いてください。','端末とブラウザの位置情報を許可してください。取得できない場合は地図から場所を選べます。').replace('自動更新は6時間ごと。保存済みデータはオフラインでも利用します。','軌道データは約6時間ごとに更新を試みます。遅延・停止する場合は取得日時を確認してください。').replace('スマートフォンはPCと同じWi-Fiに接続し、信頼済みHTTPSを使用してください。','スマートフォンでもこのURLを開いて利用できます。');
await writeFile(new URL('index.html',out),html);
for(const name of ['app.js','location.js']){let js=await readFile(new URL(name,out),'utf8');js="import {plannerFetch as fetch} from './client.js';\n"+js;await writeFile(new URL(name,out),js);}
await writeFile(new URL('.nojekyll',out),'');
console.log('Pages build ready:',out.pathname,'orbit fetchedAt:',raw.fetchedAt);
