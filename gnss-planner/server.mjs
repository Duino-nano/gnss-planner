import {reverseAddress} from './lib/address.mjs';
import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { catalog,metadata } from './lib/catalog.mjs';
import { validateOptions,snapshot } from './lib/geometry.mjs';

const base=fileURLToPath(new URL('./dist/',import.meta.url));
const lan=process.argv.includes('--lan');
const tls=process.argv.includes('--https');
const publicHostname=process.env.RENDER_EXTERNAL_HOSTNAME || process.env.PUBLIC_HOSTNAME || '';
const hosted=Boolean(publicHostname);
if(publicHostname && !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(publicHostname))throw new Error('PUBLIC_HOSTNAMEにはホスト名のみを設定してください。');
const port=Number(process.env.PORT || (tls?3443:3000));
const hosts=['localhost','127.0.0.1','[::1]',...Object.values(networkInterfaces()).flat().filter(x=>x?.family==='IPv4').map(x=>x.address)];
if(hosted)hosts.push(publicHostname.toLowerCase());
const files={'/location.js':['location.js','text/javascript; charset=utf-8'],'/leaflet.js':['leaflet.js','text/javascript; charset=utf-8'],'/leaflet.css':['leaflet.css','text/css; charset=utf-8'],'/visibility.js':['visibility.js','text/javascript; charset=utf-8'],'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
let seriesCache=new Map();
async function handler(req,res) {
  const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cyberjapandata.gsi.go.jp; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'",'Permissions-Policy':'geolocation=(self)'};
  function send(status,body,type='application/json; charset=utf-8') {res.writeHead(status,{...headers,'Content-Type':type});res.end(type.startsWith('application/json')?JSON.stringify(body):body);}
  try {
    const url=new URL(req.url,`${tls?'https':'http'}://${req.headers.host}`);
    if(!hosts.includes(url.hostname)) return send(403,{error:'許可されていない接続先です。'});
    if(req.method!=='GET') return send(405,{error:'GETのみ対応しています。'});
    if(files[url.pathname]) { const [name,type]=files[url.pathname];return send(200,await readFile(base+name),type); }
    if(url.pathname==='/api/status') return send(200,{now:new Date().toISOString(),secure:tls,hosted,lan:lan&&!hosted,urls:lan&&!hosted?hosts.filter(h=>/^\d/.test(h)&&!h.startsWith('127.')).map(h=>`${tls?'https':'http'}://${h}:${port}`):[]});
    if(url.pathname==='/api/address'){try{return send(200,await reverseAddress(Object.fromEntries(url.searchParams)));}catch(e){return send(e instanceof RangeError?400:503,{error:e.message});}}
    if(!['/api/plan','/api/series'].includes(url.pathname)) return send(404,{error:'見つかりません。'});
    let options;
    try {options=validateOptions(Object.fromEntries(url.searchParams));} catch(e) {return send(400,{error:e.message});}
    const data=await catalog();
    if(url.pathname==='/api/plan') return send(200,{...snapshot(data.records,options),meta:metadata(data),observer:{lat:options.lat,lon:options.lon,height:options.height,mask:options.mask}});
    // Stable minute-aligned centre: 193 points, 15-minute interval over 48 hours.
    const centre=Math.floor(Date.now()/60000)*60000;
    const key=JSON.stringify([options.lat,options.lon,options.height,options.mask,options.systems,centre,data.fetchedAt]);
    if(seriesCache.has(key)) return send(200,seriesCache.get(key));
    const points=[];
    for(let i=-96;i<=96;i++) {
      const s=snapshot(data.records,{...options,time:centre+i*15*60000});
      points.push({time:s.time,pdop:s.dop.pdop,hdop:s.dop.hdop,vdop:s.dop.vdop,visible:s.visible,used:s.used,stale:s.stale});
    }
    const result={points,stepMinutes:15,centre:new Date(centre).toISOString()};
    if(seriesCache.size>=16) seriesCache.clear();
    seriesCache.set(key,result);return send(200,result);
  } catch(e) {send(503,{error:e.message||'データを取得できません。'});}
}
const tlsOptions=tls?{pfx:await readFile(new URL('./certs/local.pfx',import.meta.url)),passphrase:(await readFile(new URL('./certs/password.txt',import.meta.url),'utf8')).trim()}:null;
const server=tls?https.createServer(tlsOptions,handler):http.createServer(handler);
server.requestTimeout=30000;
server.listen(port,lan||hosted?'0.0.0.0':'127.0.0.1',()=>{
  console.log(`GNSS Planner: ${tls?'https':'http'}://localhost:${server.address().port}`);
  if(lan) for(const host of hosts.filter(h=>/^\d/.test(h)&&!h.startsWith('127.'))) console.log(`LAN: ${tls?'https':'http'}://${host}:${port}`);
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`ポート ${port} は使用中です。既存の画面を開くか PORT を変更してください。`:e.message);process.exitCode=1;});
