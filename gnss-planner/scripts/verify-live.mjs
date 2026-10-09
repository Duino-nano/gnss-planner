import assert from 'node:assert/strict';
const base='http://localhost:3000';
const get=async path=>{const r=await fetch(base+path);return {status:r.status,data:await r.json()};};
const q=new URLSearchParams({lat:'35.681236',lon:'139.767125',height:'0',mask:'15'});
const current=await get(`/api/plan?${q}`);assert.equal(current.status,200);assert.ok(current.data.satellites.length>0);
for(const h of [-24,0,24]){q.set('time',new Date(Date.now()+h*3600000).toISOString());const {data,status}=await get(`/api/plan?${q}`);assert.equal(status,200);assert.ok(data.satellites.every(s=>s.azimuth>=0&&s.azimuth<360&&s.elevation>=-90&&s.elevation<=90));assert.ok(Math.abs(data.dop.pdop**2-data.dop.hdop**2-data.dop.vdop**2)<1e-9);console.log(`${h}h: ${data.visible} above horizon / ${data.used} used / PDOP ${data.dop.pdop.toFixed(4)}`);}
q.delete('time');
for(const system of ['G','J','E','R','C']){q.set('systems',system);const {data,status}=await get(`/api/plan?${q}`);assert.equal(status,200);assert.ok(data.satellites.every(s=>s.system===system));console.log(`${system}: ${data.satellites.length} propagated`);}
q.set('systems','');assert.equal((await get(`/api/plan?${q}`)).data.dop.pdop,null);q.delete('systems');
q.set('mask','60');const high=(await get(`/api/plan?${q}`)).data;assert.ok(high.used<=current.data.used);assert.ok(high.satellites.filter(s=>s.used).every(s=>s.elevation>=60));q.set('mask','15');
const start=performance.now(),series=(await get(`/api/series?${q}`)).data;assert.equal(series.points.length,193);assert.equal(Date.parse(series.points.at(-1).time)-Date.parse(series.points[0].time),48*3600000);console.log(`48h series: ${Math.round(performance.now()-start)} ms`);
for(const bad of ['lat=91&lon=1','lat=0&lon=no','lat=1&lon=1&time=bad','lat=1&lon=1&time=2000-01-01','lat=1&lon=1&systems=X','lon=1'])assert.equal((await get('/api/plan?'+bad)).status,400);
for(const path of ['/server.mjs','/data/gnss.json','/certs/password.txt'])assert.equal((await get(path)).status,404);
assert.equal((await fetch(base+'/api/plan',{method:'POST'})).status,405);
console.log('Live API checks passed.');
