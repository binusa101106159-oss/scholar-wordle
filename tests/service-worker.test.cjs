'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function worker(options={}){
 const handlers={},entries=new Map();let requests=0,claimed=0,skipped=0,assets=[];
 const cache={addAll:async list=>{assets=list;if(options.install)await options.install();},match:async key=>entries.get(String(key)),put:async(key,value)=>entries.set(String(key),value)};
 vm.runInNewContext(fs.readFileSync(require.resolve('../sw.js'),'utf8'),{URL,Request,Promise,self:{location:{origin:'https://example.test'},registration:{scope:'https://example.test/site/'},clients:{claim(){claimed++;return Promise.resolve();}},skipWaiting(){skipped++;return Promise.resolve();},addEventListener(t,fn){handlers[t]=fn}},caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},fetch:async()=>{requests++;throw Error('offline');}});
 return {handlers,entries,get requests(){return requests;},get claimed(){return claimed;},get skipped(){return skipped;},get assets(){return assets;},
 install(){let pending;handlers.install({waitUntil:p=>{pending=p;}});return pending;},
 async get(path,mode='cors'){let response;handlers.fetch({request:{method:'GET',url:path,mode},respondWith(p){response=p;},waitUntil(){}});return response;}};
}
test('installed public shell opens offline without waiting for a network request',async()=>{
 const w=worker(),response={ok:true};w.entries.set('https://example.test/site/index.html',response);
 assert.equal(await w.get('https://example.test/site/','navigate'),response);assert.equal(w.requests,0);
});
test('new shell activates only after the complete download and does not claim existing pages',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve;}),w=worker({install:()=>gate});
 const installing=w.install();await Promise.resolve();await Promise.resolve();assert.equal(w.skipped,0);
 release();await installing;assert.equal(w.skipped,1);assert.equal(w.claimed,0);
 assert.ok(w.assets.length>50);assert.ok(w.assets.every(r=>r.cache==='reload'&&r.url.startsWith('https://example.test/site/')));
 assert.ok(w.assets.some(r=>r.url.endsWith('/site-updates.js')));
});
test('failed shell download never activates the replacement worker',async()=>{
 const w=worker({install:async()=>{throw Error('download failed');}});
 await assert.rejects(w.install(),/download failed/);assert.equal(w.skipped,0);assert.equal(w.claimed,0);
});
test('existing documents retain their old version cache during activation',async()=>{
 const w=worker();await w.install();assert.equal(w.handlers.activate,undefined);assert.equal(w.claimed,0);
});
test('authentication and Firestore requests bypass the service worker entirely',async()=>{
 const w=worker();assert.equal(await w.get('https://firestore.googleapis.com/test'),undefined);assert.equal(w.requests,0);
});
