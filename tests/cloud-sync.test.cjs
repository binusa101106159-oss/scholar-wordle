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
function harness(state=S,timers={}){
 const events=[],handlers={};class E{constructor(type,init={}){this.type=type;Object.assign(this,init)}}
 const window={ScholarSyncState:state,addEventListener(t,fn){(handlers[t]||=[]).push(fn)},dispatchEvent(e){events.push(e);for(const fn of handlers[e.type]||[])fn(e)}};
 const context={window,Symbol,Map,Set,Promise,Error,JSON,String,Number,Object,TextEncoder,CustomEvent:E,StorageEvent:E,setTimeout:timers.setTimeout||setTimeout,clearTimeout:timers.clearTimeout||clearTimeout};
 if(timers.document)context.document=timers.document;
 if(timers.navigator)context.navigator=timers.navigator;
 if(timers.Date)context.Date=timers.Date;
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
test('unchanged preferences and reordered server snapshots trigger neither sync nor UI redraw',async()=>{
 const h=harness(),initial=S.split('scholar-laws-v1','{"law":"s01","pos":12}');
 h.sync.connect({uid:'one'},{commit:async op=>op.next},initial);
 const before=h.events.length;
 h.store.setItem('scholar-laws-v1','{"pos":12,"law":"s01"}');
 h.sync.receive(new Map([...initial].reverse()));
 assert.equal(h.events.length,before);assert.equal(h.sync.status().pending,0);assert.equal(h.sync.status().phase,'synced');
});
test('rapid navigation coalesces and independent preference writes commit in one batch',async()=>{
 const h=harness(),batches=[];h.sync.connect({uid:'one'},{commitMany:async ops=>{batches.push(ops);return ops.map(op=>op.next)}});
 for(let i=0;i<100;i++)h.store.setItem('scholar-navigation-v1',str({hash:'#law-'+i}));
 h.store.setItem('scholar-laws-v1',str({law:'s01',pos:20,open:{S:true}}));
 await h.sync.flush();assert.equal(batches.length,1);assert.equal(batches[0].length,4);
 assert.equal(h.store.getItem('scholar-navigation-v1'),'{"hash":"#law-99"}');
});
test('reading one setting uses its cached group instead of scanning the full account',()=>{
 let joins=0,maxGroup=0;
 const h=harness({...S,join(key,chunks){joins++;maxGroup=Math.max(maxGroup,chunks.size);return S.join(key,chunks)}}),entries=new Map();
 for(let i=0;i<2000;i++)for(const pair of S.split('scholar-setting-'+i,'{"size":18}'))entries.set(...pair);
 h.sync.connect({uid:'one'},{},entries);
 for(let i=0;i<1000;i++)assert.equal(h.store.getItem('scholar-setting-1'),'{"size":18}');
 assert.equal(joins,1);assert.equal(maxGroup,1);
});
test('patient acknowledgement does not wait behind an unrelated slow navigation save',async()=>{
 const h=harness();let release;
 h.sync.connect({uid:'one'},{commit:async op=>{if(op.key==='scholar-navigation-v1')await new Promise(r=>release=r);return op.next}});
 h.store.setItem('scholar-navigation-v1','{"hash":"#cases"}');const slow=h.sync.flush();
 await h.store.setConfirmed('scholar-cases-v1',str({version:1,records:[{id:'x',name:'fictional'}]}));
 assert.equal(JSON.parse(h.store.getItem('scholar-cases-v1')).records.length,1);release();await slow;
});
test('incremental cloud updates notify only changed readers and preserve queued local edits',async()=>{
 const h=harness();h.sync.connect({uid:'one'},{commit:async op=>op.next},new Map([...S.split('scholar-laws-v1','{"law":"s01"}'),...S.split('scholar-ama-v1','{"chapter":"c01"}') ]));
 h.store.setItem('scholar-laws-v1','{"law":"s02"}');const at=h.events.length;
 h.sync.receiveChanges(new Map([...S.split('scholar-laws-v1','{"law":"s01"}'),...S.split('scholar-ama-v1','{"chapter":"c02"}') ]));
 assert.equal(h.store.getItem('scholar-laws-v1'),'{"law":"s02"}');
 assert.equal(h.store.getItem('scholar-ama-v1'),'{"chapter":"c02"}');
 assert.deepEqual(h.events.slice(at).filter(e=>e.type==='storage').map(e=>e.key),['scholar-ama-v1']);await h.sync.flush();
});
test('navigation changed back before debounce requires no network write',async()=>{
 const h=harness();let writes=0;h.sync.connect({uid:'one'},{commit:async op=>{writes++;return op.next}},S.split('scholar-navigation-v1','{"hash":"#laws"}'));
 h.store.setItem('scholar-navigation-v1','{"hash":"#ama"}');h.store.setItem('scholar-navigation-v1','{"hash":"#laws"}');
 assert.equal(h.sync.status().pending,0);await h.sync.flush();assert.equal(writes,0);
});


test('stalled saves retain edits, report delay, and never start duplicate transactions',async()=>{
 let watchdog,release,calls=0;
 const h=harness(S,{setTimeout(fn,ms){if(ms===15000){watchdog=fn;return -1;}return setTimeout(fn,ms)},clearTimeout(id){if(id!==-1)clearTimeout(id)}});
 h.sync.connect({uid:'one'},{commit:async op=>{calls++;await new Promise(r=>release=r);return op.next}});
 h.store.setItem('scholar-reading-v1','{"size":20}');const pending=h.sync.flush();watchdog();
 assert.equal(h.sync.status().phase,'error');assert.equal(h.sync.status().pending,1);assert.equal(h.store.getItem('scholar-reading-v1'),'{"size":20}');
 const retry=h.sync.flush();assert.equal(calls,1);release();await Promise.all([pending,retry]);assert.equal(h.sync.status().phase,'synced');assert.equal(h.sync.status().error,null);
});
test('large sync queues yield to user-input tasks between batches',async()=>{
 const h=harness();let batches=0,inputHandled=false;
 h.sync.connect({uid:'one'},{commitMany:async ops=>{batches++;if(batches===1)setTimeout(()=>inputHandled=true,0);else assert.equal(inputHandled,true);return ops.map(op=>op.next)}});
 for(let i=0;i<40;i++)h.store.setItem('scholar-setting-'+i,'{"value":1}');
 await h.sync.flush();assert.equal(batches,3);assert.equal(h.sync.status().pending,0);
});

test('an empty flush cannot trap subsequent edits in a resolved in-flight promise',async()=>{
 const h=harness();let calls=0;h.sync.connect({uid:'one'},{commit:async op=>{calls++;return op.next}});
 await h.sync.flush();h.store.setItem('scholar-reading-v1','{"size":21}');await h.sync.flush();assert.equal(calls,1);assert.equal(h.sync.status().pending,0);
});
test('synchronous transport failure releases the flush lock for a safe retry',async()=>{
 const h=harness();let fail=true;h.sync.connect({uid:'one'},{commit(op){if(fail)throw Error('connection failed');return Promise.resolve(op.next)}});
 h.store.setItem('scholar-reading-v1','{"size":21}');await assert.rejects(h.sync.flush());fail=false;await h.sync.flush();assert.equal(h.sync.status().pending,0);
});

test('case manual order survives cloud hydration and merges with concurrent notes',()=>{
 const records=[{id:'a',createdAt:20,sortOrder:1,notes:'old'},{id:'b',createdAt:10,sortOrder:0,notes:''}];
 const chunks=S.split('scholar-cases-v1',str({version:1,records}));
 assert.deepEqual(JSON.parse(S.join('scholar-cases-v1',chunks)).records.map(r=>r.id),['b','a']);
 const base=records[0],local={...base,sortOrder:2},remote={...base,notes:'other device'};
 assert.deepEqual(JSON.parse(S.reconcile(str(base),str(local),str(remote),'scholar-cases-v1')),{...local,notes:'other device'});
});
test('case archive state survives cloud hydration, concurrent edits and rejected writes',async()=>{
 const base={id:'case',createdAt:1,name:'虛構個案',notes:'原始',followup:'1151113'},local={...base,archived:true},remote={...base,notes:'另一裝置更新'};
 const merged=JSON.parse(S.reconcile(str(base),str(local),str(remote),'scholar-cases-v1'));
 assert.deepEqual(merged,{...remote,archived:true});
 const payload={version:1,records:[merged]};
 assert.deepEqual(JSON.parse(S.join('scholar-cases-v1',S.split('scholar-cases-v1',str(payload)))),payload);
 const restored={...merged,archived:false};
 assert.deepEqual(JSON.parse(S.reconcile(str(merged),str({...merged,notes:'同步備註'}),str(restored),'scholar-cases-v1')),{...restored,notes:'同步備註'});
 const h=harness();h.sync.connect({uid:'one'},{commit:async()=>{throw Error('offline')}},S.split('scholar-cases-v1',str({version:1,records:[base]})));
 await assert.rejects(h.store.setConfirmed('scholar-cases-v1',str({version:1,records:[local]})));
 assert.deepEqual(JSON.parse(h.store.getItem('scholar-cases-v1')).records,[base]);
});


test('same-account reconnect retains unsent edits, merges other fields and retries the outbox',async()=>{
 const h=harness(),key='scholar-reading-v1';let fail=true;
 const adapter={commit:async op=>{if(fail)throw Error('offline');return op.next}};
 h.sync.connect({uid:'one'},adapter,S.split(key,str({draft:'old',size:16})));
 h.store.setItem(key,str({draft:'typing now',size:16}));await assert.rejects(h.sync.flush());
 h.sync.connect({uid:'one'},adapter,S.split(key,str({draft:'old',size:20})));
 assert.deepEqual(JSON.parse(h.store.getItem(key)),{draft:'typing now',size:20});assert.equal(h.sync.status().pending,1);
 fail=false;await h.sync.flush();assert.equal(JSON.parse(h.store.getItem(key)).draft,'typing now');
});

test('reconnecting during an in-flight save keeps newer typing and does not reset the queue',async()=>{
 const h=harness(),key='scholar-reading-v1';let release,first=true;
 const adapter={commit:async op=>{if(first){first=false;await new Promise(r=>release=r)}return op.next}};
 h.sync.connect({uid:'one'},adapter,S.split(key,str({draft:'old'})));
 h.store.setItem(key,str({draft:'first'}));const saving=h.sync.flush();h.store.setItem(key,str({draft:'latest typing'}));
 h.sync.connect({uid:'one'},adapter,S.split(key,str({draft:'old'})));
 assert.equal(JSON.parse(h.store.getItem(key)).draft,'latest typing');release();await saving;
 assert.equal(JSON.parse(h.store.getItem(key)).draft,'latest typing');assert.equal(h.sync.status().pending,0);
});

test('Firebase duplicate auth callbacks keep the listener; stale server echoes cannot revert acknowledged typing',async()=>{
 const h=harness(),key='scholar-reading-v1',id=JSON.stringify([key,'draft']),encoded=Buffer.from(id).toString('base64url');let callback,reads=0,stops=0;
 const doc=(revision,value)=>({id:encoded,exists:()=>true,data:()=>({revision,value:JSON.stringify({data:JSON.stringify(value)})})});
 const F={collection:()=>({}),doc:()=>({id:encoded}),getDocsFromServer:async()=>{reads++;return {docs:[doc(1,'old')]}},onSnapshot:(state,opts,fn)=>{callback=fn;return ()=>stops++},serverTimestamp:()=>0,runTransaction:async(db,fn)=>fn({get:async()=>doc(1,'old'),set(){}})};
 const source=fs.readFileSync(require.resolve('../sync/client.js'),'utf8').replace(/^import[^\n]+\n/,'').split("if (document.readyState === 'loading')")[0];
 const context={window:{ScholarSync:h.sync,ScholarSyncState:S},document:{body:{},getElementById:()=>null},location:{reload(){throw Error('unexpected reload')}},setTimeout,clearTimeout,Promise,Map,JSON,Math,Error,decodeURIComponent,encodeURIComponent,escape,unescape,atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64')};
 vm.createContext(context);vm.runInContext(source+'\n globalThis.setup=(f)=>{F=f;A={};db={};started=true;};globalThis.changed=accountChanged;',context);context.setup(F);
 const user={uid:'one',email:'binusa101106159@gmail.com',emailVerified:true};await context.changed(user);
 h.store.setItem(key,str({draft:'new typing'}));await h.sync.flush();
 callback({metadata:{fromCache:false,hasPendingWrites:false},docChanges:()=>[{type:'modified',doc:doc(1,'old')}]});
 assert.equal(JSON.parse(h.store.getItem(key)).draft,'new typing');
 await context.changed(user);assert.equal(reads,1);assert.equal(stops,0);assert.equal(JSON.parse(h.store.getItem(key)).draft,'new typing');
 callback({metadata:{fromCache:false,hasPendingWrites:false},docChanges:()=>[{type:'modified',doc:doc(3,'other device')}]});assert.equal(JSON.parse(h.store.getItem(key)).draft,'other device');
 h.store.setItem(key,str({draft:'unsent after disconnect'}));F.getDocsFromServer=async()=>{throw Error('still offline')};await context.changed(user,true);assert.equal(JSON.parse(h.store.getItem(key)).draft,'unsent after disconnect');assert.equal(h.sync.status().pending,1);assert.equal(h.sync.status().user.uid,'one');
 await h.sync.flush();
});


test('cloud notifications defer while typing or editing a dialog, then deliver the latest state once',async()=>{
 const handlers={};let focused=true,dialog=false;
 const document={activeElement:{matches:()=>focused},querySelector:()=>dialog?{}:null,addEventListener(type,fn){handlers[type]=fn}};
 const h=harness(S,{document}),key='scholar-calculator-v1',seen=[];
 h.sync.connect({uid:'one'},{commit:async op=>op.next},S.split(key,str({input:'old'})));h.sync.subscribe((k,v)=>seen.push([k,v]));
 h.sync.receiveChanges(S.split(key,str({input:'remote one'})));h.sync.receiveChanges(S.split(key,str({input:'remote two'})));
 assert.equal(seen.length,0);assert.equal(JSON.parse(h.store.getItem(key)).input,'remote two');
 handlers.compositionend();await new Promise(r=>setTimeout(r,5));assert.equal(seen.length,0);
 focused=false;dialog=true;handlers.focusout();await new Promise(r=>setTimeout(r,5));assert.equal(seen.length,0);
 dialog=false;handlers.close();await new Promise(r=>setTimeout(r,5));assert.equal(seen.length,1);assert.equal(JSON.parse(seen[0][1]).input,'remote two');
});

test('typing after a deferred remote update delivers current local text rather than the stale notification payload',async()=>{
 let focused=true;const handlers={},document={activeElement:{matches:()=>focused},querySelector:()=>null,addEventListener(t,fn){handlers[t]=fn}};
 const h=harness(S,{document}),key='scholar-calculator-v1',seen=[];h.sync.connect({uid:'one'},{commit:async op=>op.next},S.split(key,str({input:'old'})));h.sync.subscribe((k,v)=>seen.push(v));
 h.sync.receiveChanges(S.split(key,str({input:'remote'})));h.store.setItem(key,str({input:'latest typing'}));await h.sync.flush();
 assert.equal(seen.length,0);focused=false;handlers.focusout();await new Promise(r=>setTimeout(r,5));assert.equal(JSON.parse(seen.at(-1)).input,'latest typing');
});


function fakeClock(){
 let now=100000,id=0;const pending=new Map();
 return {timers:{Date:class extends Date{static now(){return now}},setTimeout(fn,ms){pending.set(++id,{fn,at:now+ms,ms});return id},clearTimeout(id){pending.delete(id)}},pending,advance(ms){now+=ms},async run(){const entry=[...pending].sort((a,b)=>a[1].at-b[1].at)[0];assert.ok(entry);pending.delete(entry[0]);now=Math.max(now,entry[1].at);entry[1].fn();for(let i=0;i<12;i++)await Promise.resolve();},nextDelay(){return Math.min(...[...pending.values()].map(x=>x.at-now))}};
}
test('typing is coalesced but continuous editing has a five-second maximum wait',async()=>{
 const clock=fakeClock(),h=harness(S,clock.timers),sent=[];h.sync.connect({uid:'one'},{commit:async op=>{sent.push(op.next);return op.next}});
 for(let i=0;i<10;i++){h.store.setItem('scholar-calculator-v1',str({input:String(i)}));if(i<9)clock.advance(500);}
 assert.equal(clock.nextDelay(),500);assert.equal(sent.length,0);await clock.run();assert.deepEqual(sent,['"9"']);assert.equal(h.sync.status().pending,0);
});
test('transient failures back off without dropping newer text and recover automatically',async()=>{
 const clock=fakeClock(),h=harness(S,clock.timers);let fail=true,calls=0;
 h.sync.connect({uid:'one'},{commit:async op=>{calls++;if(fail)throw Error('network offline');return op.next}});
 h.store.setItem('scholar-calculator-v1',str({input:'one'}));await assert.rejects(h.sync.flush());assert.equal(clock.nextDelay(),2000);
 h.store.setItem('scholar-calculator-v1',str({input:'two'}));assert.equal(clock.nextDelay(),2000);await clock.run();assert.equal(calls,2);assert.equal(clock.nextDelay(),4000);
 fail=false;await clock.run();assert.equal(calls,3);assert.equal(h.sync.status().pending,0);assert.equal(h.store.getItem('scholar-calculator-v1'),str({input:'two'}));
});
test('offline edits do not start requests and an online event flushes the latest text',async()=>{
 const clock=fakeClock(),navigator={onLine:false},h=harness(S,{...clock.timers,navigator});let calls=0;
 h.sync.connect({uid:'one'},{commit:async op=>{calls++;return op.next}});h.store.setItem('scholar-calculator-v1',str({input:'latest'}));assert.equal(clock.pending.size,0);await assert.rejects(h.sync.flush());assert.equal(calls,0);
 navigator.onLine=true;h.window.dispatchEvent({type:'online'});for(let i=0;i<12;i++)await Promise.resolve();assert.equal(calls,1);assert.equal(h.sync.status().pending,0);
});
test('permission errors are not automatically retried and explicit patient saves bypass typing delay',async()=>{
 const clock=fakeClock(),h=harness(S,clock.timers);let deny=true,calls=0;
 h.sync.connect({uid:'one'},{commit:async op=>{calls++;if(deny)throw Object.assign(Error('denied'),{code:'permission-denied'});return op.next}});
 h.store.setItem('scholar-calculator-v1',str({input:'retain'}));await assert.rejects(h.sync.flush());assert.equal(clock.pending.size,0);deny=false;
 await h.store.setConfirmed('scholar-cases-v1',str({version:1,records:[{id:'fixture',name:'test'}]}));assert.equal(calls,2);assert.equal(h.sync.status().pending,1);await h.sync.flush();
});

test('background writes stay paused for the entire editing action and resume on leaving the input',async()=>{
 const clock=fakeClock(),handlers={};let focused=true,calls=0;
 const document={activeElement:{matches:()=>focused},querySelector:()=>null,addEventListener(t,fn){handlers[t]=fn}};
 const h=harness(S,{...clock.timers,document});h.sync.connect({uid:'one'},{commit:async op=>{calls++;return op.next}});
 for(let i=0;i<30;i++){h.store.setItem('scholar-calculator-v1',str({input:String(i)}));clock.advance(1000);}
 assert.equal(clock.pending.size,0);assert.equal(calls,0);h.window.dispatchEvent({type:'online'});for(let i=0;i<12;i++)await Promise.resolve();assert.equal(calls,0);
 focused=false;handlers.focusout();await clock.run();await clock.run();assert.equal(calls,1);assert.equal(h.sync.status().pending,0);assert.equal(h.store.getItem('scholar-calculator-v1'),str({input:'29'}));
});

test('an already-running background batch stops sending later edits once typing begins',async()=>{
 const clock=fakeClock(),handlers={};let focused=false,release,calls=0;
 const document={activeElement:{matches:()=>focused},querySelector:()=>null,addEventListener(t,fn){handlers[t]=fn}};
 const h=harness(S,{...clock.timers,document});h.sync.connect({uid:'one'},{commit:async op=>{calls++;if(calls===1)await new Promise(r=>release=r);return op.next}});
 h.store.setItem('scholar-calculator-v1',str({input:'first'}));await clock.run();focused=true;h.store.setItem('scholar-calculator-v1',str({input:'typing'}));release();for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(calls,1);assert.equal(h.sync.status().pending,1);assert.equal(clock.pending.size,0);
 focused=false;handlers.focusout();await clock.run();await clock.run();assert.equal(calls,2);assert.equal(h.sync.status().pending,0);
});

test('progressive public startup hydrates cloud data without replacing a live input draft',async()=>{
 const document={activeElement:{matches:()=>true},querySelector:()=>null,addEventListener(){}};
 const h=harness(S,{document});h.sync.connect(null,null);h.store.setItem('scholar-calculator-v1',str({input:'new draft'}));
 h.sync.connect({uid:'owner'},{commit:async op=>op.next},new Map([...S.split('scholar-calculator-v1',str({input:'old'})),...S.split('scholar-reading-v1',str({size:22}))]),true);
 assert.equal(JSON.parse(h.store.getItem('scholar-calculator-v1')).input,'new draft');assert.equal(JSON.parse(h.store.getItem('scholar-reading-v1')).size,22);assert.ok(h.sync.status().pending);await h.sync.flush();
});

function twoDeviceServer(initial){
 const entries=new Map(initial);let chain=Promise.resolve();
 const adapter=()=>({commit(op){const result=chain.then(()=>{const value=S.reconcile(op.base,op.next,entries.get(op.id)??null,op.id);if(op.key==='scholar-cases-v1'&&op.next!==null&&value===null)throw Error('deleted remotely');if(value===null)entries.delete(op.id);else entries.set(op.id,value);return value});chain=result.catch(()=>{});return result}});
 return {entries,adapter};
}
test('two device patient saves preserve changes to separate fields',async()=>{
 const key='scholar-cases-v1',row={id:'fixture',name:'Original',notes:'old'},raw=record=>str({version:1,records:[record]}),server=twoDeviceServer(S.split(key,raw(row))),a=harness(),b=harness();
 for(const h of [a,b])h.sync.connect({uid:'owner'},server.adapter(),server.entries);
 await Promise.all([a.store.setConfirmed(key,raw({...row,name:'Device A'})),b.store.setConfirmed(key,raw({...row,notes:'Device B'}))]);
 const record=JSON.parse(S.join(key,server.entries)).records[0];assert.equal(record.name,'Device A');assert.equal(record.notes,'Device B');
});
test('a stale second device cannot resurrect a patient deleted by the first device',async()=>{
 const key='scholar-cases-v1',row={id:'fixture',name:'Fictional',notes:'old'},raw=record=>str({version:1,records:[record]}),server=twoDeviceServer(S.split(key,raw(row))),a=harness(),b=harness();
 for(const h of [a,b])h.sync.connect({uid:'owner'},server.adapter(),server.entries);
 await a.store.setConfirmed(key,str({version:1,records:[]}));await assert.rejects(b.store.setConfirmed(key,raw({...row,notes:'stale edit'})),/deleted remotely/);assert.equal(server.entries.size,0);
});
test('offline typing and another device preference update both survive reconnection',async()=>{
 const key='scholar-calculator-v1',initial=str({input:'old',previous:'before'}),server=twoDeviceServer(S.split(key,initial)),a=harness(),b=harness();let offline=true;
 const network=server.adapter();a.sync.connect({uid:'owner'},{commit:async op=>{if(offline)throw Error('network offline');return network.commit(op)}},server.entries);b.sync.connect({uid:'owner'},server.adapter(),server.entries);
 for(let i=0;i<100;i++)a.store.setItem(key,str({input:'typing '+i,previous:'before'}));await assert.rejects(a.sync.flush());
 b.store.setItem(key,str({input:'old',previous:'other device'}));await b.sync.flush();a.sync.receive(server.entries);offline=false;await a.sync.flush();
 assert.deepEqual(JSON.parse(S.join(key,server.entries)),{input:'typing 99',previous:'other device'});
});
