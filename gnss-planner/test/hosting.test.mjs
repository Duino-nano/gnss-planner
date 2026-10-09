import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

test('hosted mode accepts its domain, rejects other hosts, and keeps private files inaccessible',async t=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,PORT:'0',PUBLIC_HOSTNAME:'planner.example.com',RENDER_EXTERNAL_HOSTNAME:''},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());
 const port=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('server startup timeout')),8000);
  child.once('error',e=>{clearTimeout(timer);reject(e);});
  child.once('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code));});
  child.stdout.on('data',chunk=>{const m=chunk.toString().match(/localhost:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});
 });
 const get=(path,host)=>new Promise((resolve,reject)=>{
  http.get({hostname:'127.0.0.1',port,path,headers:{Host:host}},r=>{let body='';r.on('data',c=>body+=c);r.on('end',()=>resolve({status:r.statusCode,body}));}).on('error',reject);
 });
 const status=await get('/api/status','planner.example.com');
 assert.equal(status.status,200);assert.equal(JSON.parse(status.body).hosted,true);assert.deepEqual(JSON.parse(status.body).urls,[]);
 assert.equal((await get('/','planner.example.com')).status,200);
 assert.equal((await get('/','untrusted.example.com')).status,403);
 assert.equal((await get('/certs/password.txt','planner.example.com')).status,404);
});
