import test from 'node:test';
import assert from 'node:assert/strict';
import {reverseAddress} from '../lib/address.mjs';

test('address validation, primary lookup, and explicitly approximate fallback',async t=>{
 const original=globalThis.fetch;
 t.after(()=>{globalThis.fetch=original;});
 let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,text:async()=>`GSI.MUNI_ARRAY["13101"] = '13,東京都,13101,千代田区';`,json:async()=>({results:{muniCd:'13101',lv01Nm:'丸の内一丁目'}})};};
 await assert.rejects(reverseAddress({lat:'91',lon:'139'}),RangeError);
 await assert.rejects(reverseAddress({lat:'',lon:'139'}),RangeError);
 assert.equal(calls,0);
 const primary=await reverseAddress({lat:'35.6812',lon:'139.7671'});
 assert.equal(primary.address,'東京都千代田区丸の内一丁目');
 assert.equal(primary.source,'国土地理院');
 globalThis.fetch=async url=>{
  if(url.includes('gsi.go.jp'))throw Error('offline');
  return {ok:true,json:async()=>({response:{location:[{prefecture:'東京都',city:'千代田区',town:'丸の内',distance:'180'}]}})};
 };
 const fallback=await reverseAddress({lat:'35.68',lon:'139.76'});
 assert.match(fallback.address,/付近（住所候補・代表点まで約180 m）/);
 globalThis.fetch=async url=>{
  if(url.includes('gsi.go.jp'))throw Error('offline');
  return {ok:true,json:async()=>({response:{location:[{distance:'5001'}]}})};
 };
 assert.equal((await reverseAddress({lat:'35',lon:'140'})).address,null);
});
