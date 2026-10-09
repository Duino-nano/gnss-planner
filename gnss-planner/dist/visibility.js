// Prediction candidates are NOT receiver-confirmed RTK observations.
// Keep the sky plot and list on the same filter and never include below-horizon points.
export function displayedSatellites(plan, candidatesOnly = true) {
  return (plan?.satellites ?? []).filter(s => s.visible && (!candidatesOnly || s.used));
}
// Display bands are planning conventions, not RTK or vehicle acceptance limits.
export function geometryLevel(pdop) {
  return !Number.isFinite(pdop)?'unknown':pdop<2?'low':pdop<5?'medium':'high';
}
export function assessGeometry(plan) {
  if (!plan) return null;
  const sats=plan.satellites.filter(s=>s.used);
  const bands=[sats.filter(s=>s.elevation<30).length,sats.filter(s=>s.elevation>=30&&s.elevation<60).length,sats.filter(s=>s.elevation>=60).length];
  const sectors=Array(8).fill(0);
  for(const s of sats) sectors[Math.floor(((s.azimuth+22.5)%360)/45)]++;
  const az=sats.map(s=>s.azimuth).sort((a,b)=>a-b);
  const gap=az.length?Math.max(...az.map((a,i)=>(i+1<az.length?az[i+1]:az[0]+360)-a)):null;
  const pdop=plan.dop.pdop;
  const level=geometryLevel(pdop);
  return {count:sats.length,bands,sectors,gap,level,margin:sats.length-plan.dop.unknowns};
}
