import test from 'node:test';
import assert from 'node:assert/strict';
import { displayedSatellites } from '../dist/visibility.js';

test('candidate-only view excludes low elevations and below-horizon satellites',()=>{
 const plan={satellites:[
  {norad:'1',visible:true,used:true},
  {norad:'2',visible:true,used:false},
  {norad:'3',visible:false,used:false},
 ]};
 assert.deepEqual(displayedSatellites(plan).map(s=>s.norad),['1']);
 assert.deepEqual(displayedSatellites(plan,false).map(s=>s.norad),['1','2']);
 // Rendering must not mutate the set used by DOP or time-series calculations.
 assert.equal(plan.satellites.length,3);
});
test('empty and no-candidate states return no visible markers',()=>{
 assert.deepEqual(displayedSatellites(null),[]);
 assert.deepEqual(displayedSatellites({satellites:[{visible:true,used:false}]}),[]);
});
