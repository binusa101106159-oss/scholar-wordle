'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../calculator/overload.js'),S=require('../sync/state.js');
const profile={sex:'m',age:'55',sbp:'130',tc:'200',hdl:'50',treated:'no',smoker:'no',diabetes:'no',history:'no'};
const complete={...profile,personalMode:'score',personalScore:'0',workMode:'score',workScore:'0',overtimeMode:'mean',overtimeMean:'0',riskMode:'manual',manualRisk:'3',...Object.fromEntries(C.patterns.map(([id])=>[id,'no']))};

test('overload questionnaire converts all answers and reverses only work item 7',()=>{
 assert.equal(C.burnout([1,1,1,1,1,1],'personal'),100);
 assert.equal(C.burnout([5,5,5,5,5,5],'personal'),0);
 assert.equal(C.burnout([1,1,1,1,1,1,5],'work'),100);
 assert.equal(C.burnout([5,5,5,5,5,5,1],'work'),0);
 assert.equal(C.burnout([1,1,1,1,1,1,1],'work'),600/7);
 assert.equal(C.burnout([1,2,3,4,5,3],'personal'),50);
 for(const bad of [[],[1,2,3,4,5,''],[1,2,3,4,5,0],[1,2,3,4,5,6],[1,2,3,4,5,2.5]])assert.equal(C.burnout(bad,'personal'),null);
});

test('overload boundaries follow table 2 without rounding the input',()=>{
 for(const [kind,lo,hi] of [['personal',50,70],['work',45,60],['overtime',45,80]]){
  assert.equal(C.loadLevel(lo-.001,kind),0);assert.equal(C.loadLevel(lo,kind),1);
  assert.equal(C.loadLevel(hi,kind),1);assert.equal(C.loadLevel(hi+.001,kind),2);
  for(const bad of ['',null,undefined,-1,'abc',Infinity])assert.equal(C.loadLevel(bad,kind),null);
 }
 for(const [risk,level] of [[0,0],[9.999,0],[10,1],[20,1],[20.001,2],[30,2],[30.001,3]])assert.equal(C.cardiovascularLevel(risk),level);
});

test('Framingham matches the NTUH published calculator in all sex/treatment branches',()=>{
 // Golden values independently obtained from the original NTUH calc(data) function.
 for(const [sex,treated,expected] of [['m','no',11.077224449300104],['m','yes',14.931003500654737],['f','no',6.155355096057291],['f','yes',8.196251017492562]]){
  assert.ok(Math.abs(C.framingham({...profile,sex,treated})-expected)<1e-10);
 }
 assert.ok(C.framingham({...profile,smoker:'yes'})>C.framingham(profile));
 assert.ok(C.framingham({...profile,diabetes:'yes'})>C.framingham(profile));
 for(const input of [{age:29},{age:75},{tc:0},{hdl:''},{sbp:-1},{smoker:''},{diabetes:undefined},{treated:'false'},{sex:''}])assert.equal(C.framingham({...profile,...input}),null);
 assert.equal(typeof C.framingham({...profile,age:30}),'number');assert.equal(typeof C.framingham({...profile,age:74}),'number');
});

test('all nine table 4 and table 5 combinations use their independent matrices',()=>{
 const interview=[['不需面談','不需面談','建議面談'],['不需面談','建議面談','需要面談'],['建議面談','需要面談','需要面談']];
 for(let workload=0;workload<3;workload++)for(let cvd=0;cvd<3;cvd++){
  const r=C.evaluate({...complete,personalScore:[0,50,71][workload],manualRisk:[3,15,25][cvd]});
  assert.equal(r.workload,workload);assert.equal(r.combined,workload+cvd);assert.equal(r.interview,interview[workload][cvd]);
  assert.equal(r.combinedLevel,workload+cvd===0?0:workload+cvd<3?1:2);
 }
 assert.equal(C.evaluate({...complete,manualRisk:20}).cardiovascular,1);
});

test('four workload components take the maximum and do not infer absent answers',()=>{
 assert.equal(C.evaluate(complete).workload,0);
 for(const change of [{personalScore:71},{workScore:61},{overtimeMean:81},Object.fromEntries(C.patterns.slice(0,4).map(([id])=>[id,'yes']))])assert.equal(C.evaluate({...complete,...change}).workload,2);
 for(let count=0;count<=6;count++){
  const r=C.evaluate({...complete,...Object.fromEntries(C.patterns.map(([id],i)=>[id,i<count?'yes':'no']))});assert.equal(r.patternCount,count);assert.equal(r.levels.pattern,count<2?0:count<4?1:2);
 }
 for(const change of [{personalScore:''},{workScore:''},{overtimeMean:''},{irregular:''}]){const r=C.evaluate({...complete,...change});assert.equal(r.workload,null);assert.equal(r.combined,null);assert.equal(r.interview,null);}
 assert.equal(C.evaluate({}).combined,null);
});

test('six-month overtime requires six explicit values and includes real zero months',()=>{
 const d={...complete,overtimeMode:'months',ot1:0,ot2:10,ot3:20,ot4:30,ot5:40,ot6:50};
 assert.equal(C.evaluate(d).overtime,25);
 assert.equal(C.evaluate({...d,ot1:''}).overtime,null);assert.equal(C.evaluate({...d,ot6:-1}).overtime,null);
 assert.equal(C.evaluate({...d,ot6:745}).overtime,null);
});

test('known disease requires an explicit clinician tier and never becomes low by formula',()=>{
 const d={...complete,history:'yes',riskMode:'calculate'};
 assert.equal(C.evaluate(d).risk,null);assert.equal(C.evaluate(d).combined,null);
 assert.equal(C.evaluate({...d,clinicalRisk:'1'}).combined,1);
 assert.equal(C.evaluate({...d,clinicalRisk:'2'}).combined,2);
 assert.equal(C.evaluate({...complete,history:''}).combined,null);
 assert.equal(C.evaluate({...complete,history:'yes',clinicalRisk:'1',manualRisk:25}).cardiovascular,2);
});

test('inactive score modes do not override active data and previous visits are not summed',()=>{
 const d={...complete,personalMode:'questionnaire',personalScore:100,...Object.fromEntries(Array.from({length:6},(_,i)=>['p'+(i+1),5])),previousPersonal:100,previousWork:100};
 const r=C.evaluate(d);assert.equal(r.scores.personal,0);assert.equal(r.workload,0);
 const text=C.summary(d,r);assert.match(text,/上次個人／工作過勞分數：100／100/);assert.match(text,/職業促發腦心血管疾病風險分級：0/);
});

test('cloud state separates calculator fields and preserves independent device edits',()=>{
 const key='scholar-overload-v1',base=JSON.stringify({p1:'',age:'',irregular:''});
 const local=JSON.stringify({p1:'1',age:'',irregular:''}),remote=JSON.stringify({p1:'',age:'55',irregular:''});
 assert.deepEqual(JSON.parse(S.reconcile(base,local,remote,key)),{p1:'1',age:'55',irregular:''});
 assert.deepEqual(JSON.parse(S.join(key,S.split(key,local))),JSON.parse(local));
});
