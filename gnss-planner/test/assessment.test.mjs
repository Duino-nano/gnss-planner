import test from 'node:test';
import assert from 'node:assert/strict';
import {assessGeometry,geometryLevel} from '../dist/visibility.js';
test('chart and summary share threshold and unavailable-data classifications',()=>{
 for(const [value,expected] of [[null,'unknown'],[undefined,'unknown'],[NaN,'unknown'],[Infinity,'unknown'],[1.99,'low'],[2,'medium'],[4.99,'medium'],[5,'high'],[100,'high']])assert.equal(geometryLevel(value),expected);
});
const plan=(pdop,satellites=[])=>({dop:{pdop,unknowns:4},satellites});
test('missing and singular geometry never receives a favourable rating',()=>{
 assert.equal(assessGeometry(null),null);
 const a=assessGeometry(plan(null));
 assert.equal(a.level,'unknown');assert.equal(a.gap,null);
 assert.equal(assessGeometry(plan(2)).level,'medium');
 assert.equal(assessGeometry(plan(5)).level,'high');
});
test('bands and wraparound gaps use only selected candidates',()=>{
 const satellites=[
  {used:true,azimuth:350,elevation:29},
  {used:true,azimuth:10,elevation:30},
  {used:true,azimuth:180,elevation:60},
  {used:false,azimuth:90,elevation:10}
 ];
 const a=assessGeometry(plan(1.5,satellites));
 assert.deepEqual(a.bands,[1,1,1]);assert.equal(a.gap,170);
 assert.deepEqual(a.sectors,[2,0,0,0,1,0,0,0]);assert.equal(a.count,3);
 assert.equal(assessGeometry(plan(1,[satellites[0]])).gap,360);
});
