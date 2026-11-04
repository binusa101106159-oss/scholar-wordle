'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const S=require('../sync/state.js');
const str=JSON.stringify;
test('cloud three-way merge preserves independent checkbox changes and intentional unchecks',()=>{
 assert.deepEqual(JSON.parse(S.reconcile(str([1]),str([1,2]),str([1,3]),'scholar-laws-checked-v1')),[1,3,2]);
 assert.deepEqual(JSON.parse(S.reconcile(str([1]),str([]),str([1,3]),'scholar-laws-checked-v1')),[3]);
});
test('concurrent highlights merge by ID and deletions survive stale edits',()=>{
 const a={id:'a',c:'yellow'},b={id:'b',c:'green'},c={id:'c',c:'blue'};
 assert.deepEqual(JSON.parse(S.reconcile(str([a]),str([a,b]),str([a,c]),'marks')),[a,b,c]);
 assert.deepEqual(JSON.parse(S.reconcile(str([a]),str([{...a,c:'pink'}]),str([]),'marks')),[]);
 assert.equal(S.reconcile(str({id:'patient',notes:'old'}),str({id:'patient',notes:'new'}),null,'cases'),null);
});
test('patient records shard independently, preserve all text, and round-trip an empty list',()=>{
 const raw=str({version:1,records:[{id:'b',name:'測試',mrn:'00001234',notes:'one\ntwo'},{id:'a',name:'other'}]});
 const chunks=S.split('scholar-cases-v1',raw);assert.equal(chunks.size,2);assert.equal(S.join('scholar-cases-v1',chunks),raw);
 assert.equal(S.join('scholar-cases-v1',S.split('scholar-cases-v1',str({version:1,records:[]}))),null);
 const first=str({id:'x',name:'A',notes:'old'}),next=str({id:'x',name:'B',notes:'old'}),remote=str({id:'x',name:'A',notes:'remote'});
 assert.deepEqual(JSON.parse(S.reconcile(first,next,remote,'cases')),{id:'x',name:'B',notes:'remote'});
});
test('new puzzles and Wordle rounds remain coherent; same-puzzle edits merge separate cells',()=>{
 const base={puzzle:{id:1},values:[0,0,0],notes:[[],[],[]]},local={...base,values:[1,0,0]},remote={...base,values:[0,2,0]};
 assert.deepEqual(JSON.parse(S.reconcile(str(base),str(local),str(remote),'scholar_puzzles_v1')).values,[1,2,0]);
 const newer={puzzle:{id:2},values:[3,4,5],notes:[[],[],[]]};assert.equal(S.reconcile(str(base),str(newer),str(remote),'scholar_puzzles_v1'),str(newer));
 const round={gameId:'one',guesses:[],targetWord:'fibre'},advanced={...round,guesses:['fibre']};
 assert.equal(S.reconcile(str(round),str({...round,currentGuess:'f'}),str(advanced),'scholar-wordle-round-v1'),str(advanced));
 assert.equal(S.split('scholar-wordle-round-v1',str(round)).size,1);
});
test('Wordle result ledger deduplicates the same round and counts independent completions',()=>{
 const win={id:'one',at:1,won:true,guesses:2},loss={id:'two',at:2,won:false,guesses:6};
 assert.equal(S.wordleStats({one:win}).played,1);
 const combined=JSON.parse(S.reconcile('{}',str({one:win}),str({two:loss}),'results'));
 assert.deepEqual(S.wordleStats(combined),{played:2,wins:1,streak:0,maxStreak:1,dist:[0,1,0,0,0,0,0,0,0,0]});
});
test('explicitly imported Wordle totals remain a baseline for later cloud results',()=>{
 const initial={played:10,wins:8,streak:2,maxStreak:4,dist:[1,2,2,1,1,1,0,0,0,0]};
 const next=S.wordleStats({one:{id:'one',at:1,won:true,guesses:3}},initial);
 assert.equal(next.played,11);assert.equal(next.wins,9);assert.equal(next.streak,3);assert.equal(next.dist[2],3);assert.equal(initial.dist[2],2);
});
function harness(){
 const events=[],handlers={};class E{constructor(type,init={}){this.type=type;Object.assign(this,init)}}
 const window={ScholarSyncState:S,addEventListener(t,fn){(handlers[t]||=[]).push(fn)},dispatchEvent(e){events.push(e);for(const fn of handlers[e.type]||[])fn(e)}};
 const context={window,Symbol,Map,Set,Promise,Error,JSON,String,Number,Object,TextEncoder,CustomEvent:E,StorageEvent:E,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(require.resolve('../sync/store.js'),'utf8'),context);
 return {window,store:window.ScholarStorage,sync:window.ScholarSync,events};
}
test('store never imports legacy local data and excludes credential keys',()=>{
 const h=harness();h.sync.connect(null,null);assert.equal(h.store.getItem('oxford_wordle_v1'),null);
 assert.throws(()=>h.store.setItem('epi-pbl-apikey','secret'));assert.throws(()=>h.store.setItem('unrelated-site','secret'));
 h.store.setItem('scholar-reading-v1','{"font":"georgia"}');assert.equal(h.sync.status().phase,'guest');
});
test('failed cloud writes remain pending and cannot be reported synced; retries preserve draft',async()=>{
 const h=harness();let fail=true;h.sync.connect({uid:'one'}, {commit:async op=>{if(fail)throw Error('offline');return op.next}});
 h.store.setItem('scholar-reading-v1','{"font":"georgia"}');await assert.rejects(h.sync.flush());
 assert.equal(h.sync.status().phase,'error');assert.equal(h.sync.status().pending,1);
 assert.equal(h.store.getItem('scholar-reading-v1'),'{"font":"georgia"}');fail=false;await h.sync.flush();assert.equal(h.sync.status().phase,'synced');
});
test('patient saves require sign-in and retain no unconfirmed record after a rejected write',async()=>{
 const h=harness();h.sync.connect(null,null);await assert.rejects(h.store.setConfirmed('scholar-cases-v1',str({version:1,records:[]})));
 h.sync.connect({uid:'one'},{commit:async()=>{throw Error('denied')}});
 await assert.rejects(h.store.setConfirmed('scholar-cases-v1',str({version:1,records:[{id:'x',name:'test'}]})));
 assert.equal(h.store.getItem('scholar-cases-v1'),null);assert.equal(h.sync.status().phase,'error');
});
test('account reset clears personal data and real remote changes notify existing UI listeners',()=>{
 const h=harness();h.sync.connect({uid:'one'},{},S.split('scholar-reading-v1','{"font":"georgia"}'));
 h.sync.receive(S.split('scholar-reading-v1','{"font":"arial"}'));
 assert.ok(h.events.some(e=>e.type==='storage'&&e.key==='scholar-reading-v1'));
 h.sync.connect(null,null);assert.equal(h.store.length,0);assert.equal(h.store.getItem('scholar-reading-v1'),null);
});
test('edits made while a save is in flight are not dropped when the first acknowledgement arrives',async()=>{
 const h=harness();let release,first=true;const sent=[];
 h.sync.connect({uid:'one'},{commit:async op=>{sent.push(op.next);if(first){first=false;await new Promise(r=>release=r)}return op.next}});
 h.store.setItem('scholar-reading-v1','{"size":18}');const flushing=h.sync.flush();
 h.store.setItem('scholar-reading-v1','{"size":22}');release();await flushing;
 assert.deepEqual(sent,['18','22']);assert.equal(h.store.getItem('scholar-reading-v1'),'{"size":22}');assert.equal(h.sync.status().pending,0);
});
