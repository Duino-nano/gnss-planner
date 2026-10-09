// Independent check against the GPS almanac equations, not a second SGP4 wrapper.
// No production dependency on this data: only a reproducible developer check.
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { prepareRecords,snapshot } from '../lib/geometry.mjs';
import { ecfToLookAngles } from '../vendor/satellite/dist/transforms.js';
const source='https://celestrak.org/GPS/almanac/Yuma/almanac.yuma.txt';
const response=await fetch(source,{signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error(`Almanac HTTP ${response.status}`);
const text=await response.text(),now=Date.now();
const data=JSON.parse(await readFile(new URL('../data/gnss.json',import.meta.url),'utf8'));
const gpsEpoch=Date.UTC(1980,0,6),gpsUtcOffset=18;
const currentWeek=Math.floor(((now-gpsEpoch)/1000+gpsUtcOffset)/604800);
const almanacs=text.split(/\*{2,}[^\n]*\n/).map(block=>{
 const fields=Object.fromEntries(block.split(/\r?\n/).filter(l=>l.includes(':')).map(l=>{const at=l.indexOf(':');return [l.slice(0,at).trim(),Number(l.slice(at+1))];}));
 return fields;
}).filter(f=>f.ID&&Number.isFinite(f.week));
function position(f,t){
 const week=f.week+Math.round((currentWeek-f.week)/1024)*1024;
 const toa=f['Time of Applicability(s)'],epoch=gpsEpoch+(week*604800+toa-gpsUtcOffset)*1000;
 const dt=(t-epoch)/1000;
 if(Math.abs(dt)>7*86400)return null;
 const a=f['SQRT(A)  (m 1/2)']**2,e=f.Eccentricity,n=Math.sqrt(3.986005e14/a**3);
 const m=f['Mean Anom(rad)']+n*dt;let E=m;
 for(let i=0;i<20;i++){const correction=(E-e*Math.sin(E)-m)/(1-e*Math.cos(E));E-=correction;if(Math.abs(correction)<1e-13)break;}
 const v=Math.atan2(Math.sqrt(1-e*e)*Math.sin(E),Math.cos(E)-e),u=v+f['Argument of Perigee(rad)'],r=a*(1-e*Math.cos(E));
 const i=f['Orbital Inclination(rad)'],earth=7.2921151467e-5,omega=f['Right Ascen at Week(rad)']+(f['Rate of Right Ascen(r/s)']-earth)*dt-earth*toa;
 return {x:r*(Math.cos(u)*Math.cos(omega)-Math.sin(u)*Math.cos(i)*Math.sin(omega))/1000,y:r*(Math.cos(u)*Math.sin(omega)+Math.sin(u)*Math.cos(i)*Math.cos(omega))/1000,z:r*Math.sin(u)*Math.sin(i)/1000};
}
const options={lat:35.681236,lon:139.767125,height:0,mask:15,systems:['G']},records=prepareRecords(data.records),errors=[];
for(const h of [-24,0,24]){
 const t=now+h*3600000,s=snapshot(records,{...options,time:t});
 for(const sat of s.satellites){const f=almanacs.find(f=>f.ID===Number(sat.prn)&&f.Health===0);if(!f)continue;const p=position(f,t);if(!p)continue;const look=ecfToLookAngles({latitude:options.lat*Math.PI/180,longitude:options.lon*Math.PI/180,height:0},p);
 const az=sat.azimuth*Math.PI/180,el=sat.elevation*Math.PI/180;
 const cosine=Math.sin(el)*Math.sin(look.elevation)+Math.cos(el)*Math.cos(look.elevation)*Math.cos(az-look.azimuth);
 const separation=Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI;
 if(!Number.isFinite(separation))throw new Error('Invalid independent propagation.');
 errors.push({satellite:sat.label,hours:h,separationDegrees:separation});
 }
}
if(errors.length<20)throw new Error('Not enough valid almanac comparisons.');
const result={checkedAt:new Date(now).toISOString(),source,gpFetchedAt:data.fetchedAt,comparisons:errors.length,maxAngularDifferenceDegrees:Math.max(...errors.map(x=>x.separationDegrees)),meanAngularDifferenceDegrees:errors.reduce((s,x)=>s+x.separationDegrees,0)/errors.length,toleranceDegrees:1,worst:errors.sort((a,b)=>b.separationDegrees-a.separationDegrees).slice(0,5)};
await mkdir(new URL('../test-output/',import.meta.url),{recursive:true});
await writeFile(new URL('../test-output/gps-comparison.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(result.maxAngularDifferenceDegrees>result.toleranceDegrees)throw new Error('GP/almanac difference exceeds planning check tolerance (1 degree).');
