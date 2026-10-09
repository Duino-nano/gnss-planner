// Local ENU geometry. Angles in degrees at the API boundary; WGS84 height in metres.
import { json2satrec } from '../vendor/satellite/dist/io.js';
import { propagate, gstime } from '../vendor/satellite/dist/propagation.js';
import { eciToEcf, ecfToLookAngles } from '../vendor/satellite/dist/transforms.js';

export const SYSTEMS = { G: 'GPS', J: 'QZSS', E: 'Galileo', R: 'GLONASS', C: 'BeiDou' };
export const MAX_ORBIT_AGE_MS = 3 * 86400000; // Product policy, not an accuracy guarantee.
const DEG = Math.PI / 180;
export function identify(record) {
  const name = record.OBJECT_NAME || '';
  const system = name.startsWith('GPS ') ? 'G' : name.startsWith('QZS-') ? 'J' : name.includes('GALILEO') ? 'E' : name.startsWith('COSMOS ') ? 'R' : name.startsWith('BEIDOU-') ? 'C' : null;
  if (!system) return null;
  const prn = name.match(/PRN\s+(\d+)/)?.[1];
  const bds = name.match(/\((C\d+)\)/)?.[1];
  // Never invent a PRN from a spacecraft number or NORAD catalog number.
  const label = system === 'G' && prn ? `G${prn.padStart(2,'0')}` : system === 'J' && prn ? `J·${prn}` : bds || (system === 'E' ? name.split(' ')[0] : `R·${record.NORAD_CAT_ID}`);
  return { system, label, name, norad: String(record.NORAD_CAT_ID), prn: prn || bds?.slice(1) || null };
}
export function prepareRecords(records) {
  const unique = new Map();
  for (const raw of records) {
    const id = identify(raw);
    const epoch = Date.parse(raw.EPOCH?.endsWith('Z') ? raw.EPOCH : `${raw.EPOCH}Z`);
    if (!id || !Number.isFinite(epoch)) continue;
    const values = ['MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR','MEAN_MOTION_DOT','MEAN_MOTION_DDOT'];
    if (!values.every(k => Number.isFinite(Number(raw[k]))) || raw.MEAN_MOTION <= 0 || raw.ECCENTRICITY < 0 || raw.ECCENTRICITY >= 1) continue;
    try {
      const satrec = json2satrec(raw);
      if (!satrec.error) unique.set(id.norad, { ...id, epoch, satrec });
    } catch { /* malformed upstream record is excluded, never filled with sample data */ }
  }
  return [...unique.values()];
}
export function validateOptions(input, now = Date.now()) {
  const number = (key, min, max, fallback) => {
    const v = input[key] == null || input[key] === '' ? fallback : Number(input[key]);
    if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${key}: ${min}〜${max}の数値を指定してください。`);
    return v;
  };
  const time = input.time ? Date.parse(input.time) : now;
  if (!Number.isFinite(time) || Math.abs(time - now) > 86400000 + 60000) throw new Error('日時は現在の前後24時間以内で指定してください。');
  const systems = input.systems == null ? Object.keys(SYSTEMS) : String(input.systems).split(',').filter(Boolean);
  if (systems.some(s => !SYSTEMS[s])) throw new Error('衛星システムの指定が不正です。');
  return { lat: number('lat', -90, 90), lon: number('lon', -180, 180), height: number('height', -500, 10000, 0), mask: number('mask', 0, 89, 15), time, systems: [...new Set(systems)] };
}

// QR factorisation avoids forming/inverting HᵀH. One independent clock column
// per constellation (including QZSS): conservative, unweighted geometry model.
export function dop(satellites) {
  const groups = [...new Set(satellites.map(s => s.system))].sort();
  const n = 3 + groups.length;
  const failure = reason => ({ pdop: null, hdop: null, vdop: null, reason, unknowns: n, count: satellites.length });
  if (!groups.length) return failure('計算対象の衛星がありません。選択条件を確認してください。');
  if (satellites.length < n) return failure(`衛星数不足（${satellites.length}機 / この構成では最低${n}機）`);
  const rows = satellites.map(s => {
    const az = s.azimuth * DEG, el = s.elevation * DEG;
    return [Math.cos(el)*Math.sin(az), Math.cos(el)*Math.cos(az), Math.sin(el), ...groups.map(g=>g===s.system?1:0)];
  });
  const Q = [], R = Array.from({length:n},()=>Array(n).fill(0));
  for (let j=0;j<n;j++) {
    const v = rows.map(row=>row[j]);
    // Reorthogonalised modified Gram-Schmidt for poorly conditioned geometry.
    for (let pass=0;pass<2;pass++) for (let k=0;k<j;k++) {
      const d=v.reduce((sum,x,i)=>sum+x*Q[k][i],0); R[k][j]+=d;
      for(let i=0;i<v.length;i++) v[i]-=d*Q[k][i];
    }
    R[j][j]=Math.hypot(...v);
    if(R[j][j]<1e-8) return failure('衛星配置が偏っているため計算できません。');
    Q.push(v.map(x=>x/R[j][j]));
  }
  const inv=Array.from({length:n},()=>Array(n).fill(0));
  for(let col=0;col<n;col++) for(let i=n-1;i>=0;i--) {
    let v=i===col?1:0;
    for(let k=i+1;k<n;k++) v-=R[i][k]*inv[k][col];
    inv[i][col]=v/R[i][i];
  }
  const variance = inv.slice(0,3).map(row=>row.reduce((s,x)=>s+x*x,0));
  const pdop=Math.sqrt(variance.reduce((s,x)=>s+x,0));
  if(!Number.isFinite(pdop) || pdop>10000) return failure('配置が不安定なためDOPを表示できません。');
  return {pdop, hdop:Math.sqrt(variance[0]+variance[1]), vdop:Math.sqrt(variance[2]), reason:null, unknowns:n, count:satellites.length};
}

export function snapshot(records, options) {
  const date=new Date(options.time), gmst=gstime(date);
  const observer={latitude:options.lat*DEG,longitude:options.lon*DEG,height:options.height/1000};
  const satellites=[]; let stale=0, failed=0;
  for(const rec of records) {
    if(!options.systems.includes(rec.system)) continue;
    if(Math.abs(options.time-rec.epoch)>MAX_ORBIT_AGE_MS) { stale++; continue; }
    try {
      const pv=propagate(rec.satrec,date);
      if(!pv?.position) { failed++; continue; }
      const look=ecfToLookAngles(observer,eciToEcf(pv.position,gmst));
      const azimuth=look.azimuth/DEG, elevation=look.elevation/DEG;
      if(!Number.isFinite(azimuth)||!Number.isFinite(elevation)) { failed++; continue; }
      satellites.push({norad:rec.norad,system:rec.system,label:rec.label,name:rec.name,prn:rec.prn,epoch:new Date(rec.epoch).toISOString(),ageHours:Math.abs(options.time-rec.epoch)/3600000,azimuth,elevation,rangeKm:look.rangeSat,visible:elevation>=0,used:elevation>=options.mask,health:'unknown'});
    } catch { failed++; }
  }
  satellites.sort((a,b)=>b.elevation-a.elevation);
  const used=satellites.filter(s=>s.used);
  return {time:date.toISOString(),satellites,dop:dop(used),visible:satellites.filter(s=>s.visible).length,used:used.length,stale,failed};
}
