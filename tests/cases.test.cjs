'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fields,parseRecords,upsert,filterRecords,moveRecord,followupText}=require('../cases/cases.js');
const row=(id,extra={})=>Object.assign(Object.fromEntries(fields.map(([key])=>[key,''])),{id,name:'測試個案',mrn:'00001234',followupPeriod:'AM'},extra);
test('case records preserve the seven fields, leading zeroes and multiline notes',()=>{
  assert.deepEqual(fields.map(([,label])=>label),['姓名','病歷號','VS','回診目的','診斷','回診時間','備註']);
  const record=row('one',{date:'2026-11-04',purpose:'評估',diagnosis:'診斷一\n診斷二',followup:'11/18 上午',notes:'第一行\n第二行'});
  assert.deepEqual(parseRecords(JSON.stringify({version:1,records:[record]})),[record]);
  assert.deepEqual(parseRecords(null),[]);
});
test('case storage rejects malformed data rather than treating it as an empty list',()=>{
  for(const value of ['', '{}', '[]', JSON.stringify({version:2,records:[]}),JSON.stringify({version:1,records:[{id:'x',name:'A'}]}),JSON.stringify({version:1,records:[row('x'),row('x')]}),JSON.stringify({version:1,records:[row('x',{mrn:123})]})])assert.throws(()=>parseRecords(value));
});
test('editing a case preserves other records and never creates a second copy',()=>{
  const first=row('one'),other=row('two',{name:'其他個案'}),changed=row('one',{notes:'已更新'});
  assert.deepEqual(upsert([first,other],changed),[changed,other]);
  assert.deepEqual(first.notes,'');
  assert.deepEqual(upsert([first],other),[other,first]);
  assert.throws(()=>upsert([] ,row('x',{name:'  '})));
});
test('case search matches all seven fields and supports multiple terms and full-width input',()=>{
  const first=row('one',{purpose:'職業病評估',followup:'2026/11/18 上午',notes:'追蹤肺功能'}),other=row('two',{name:'其他個案',mrn:'00009999'});
  assert.deepEqual(filterRecords([first,other],'００００１２３４ 肺功能'),[first]);
  assert.deepEqual(filterRecords([first,other],'11/18'),[first]);
  assert.deepEqual(filterRecords([first,other],'沒有這個人'),[]);
  assert.equal(filterRecords([first,other],' ').length,2);
});

test('legacy initial dates remain readable but are excluded from fields and search',()=>{
 const original=row('one',{date:'1999-12-31'});
 const records=parseRecords(JSON.stringify({version:1,records:[original]}));
 assert.deepEqual(filterRecords(records,'1999-12-31'),[]);
 const edited=row('one',{purpose:'回診評估'});
 assert.equal(upsert(records,edited)[0].date,'1999-12-31');
 assert.ok(!fields.some(([key])=>key==='date'));
 assert.doesNotThrow(()=>parseRecords(JSON.stringify({version:1,records:[edited]})));
});

test('older cases without VS stay readable and new VS is searchable',()=>{
 const old=row('one');delete old.vs;
 const parsed=parseRecords(JSON.stringify({version:1,records:[old]}));assert.equal(parsed[0].vs,'');
 const updated=upsert(parsed,row('one',{vs:'測試醫師'}));assert.deepEqual(filterRecords(updated,'測試醫師'),updated);
 assert.throws(()=>parseRecords(JSON.stringify({version:1,records:[row('x',{vs:123})]})));
});

test('case reorder preserves fields, supports both drop edges, and new cases stay first',()=>{
 const rows=[row('a',{createdAt:3}),row('b',{createdAt:2}),row('c',{createdAt:1})];
 const moved=moveRecord(rows,'c','a');assert.deepEqual(moved.map(r=>r.id),['c','a','b']);
 assert.deepEqual(moved.map(r=>r.sortOrder),[0,1,2]);assert.equal(moved[0].mrn,'00001234');
 assert.deepEqual(parseRecords(JSON.stringify({version:1,records:moved.slice().reverse()})).map(r=>r.id),['c','a','b']);
 assert.deepEqual(moveRecord(moved,'c','b',true).map(r=>r.id),['a','b','c']);
 assert.equal(moveRecord(rows,'missing','a'),rows);
 const added=upsert(moved,row('new'));assert.equal(added[0].sortOrder,-1);
 assert.equal(upsert(moved,row('c',{notes:'updated'}))[0].sortOrder,0);
});

test('new patients must explicitly select AM or PM while legacy patients remain editable',()=>{
 const legacy=row('legacy');delete legacy.followupPeriod;
 assert.deepEqual(parseRecords(JSON.stringify({version:1,records:[legacy]})),[legacy]);
 assert.equal(Object.hasOwn(legacy,'followupPeriod'),false);
 assert.throws(()=>upsert([],legacy),/請選擇回診時段/);
 assert.throws(()=>upsert([],row('new',{followupPeriod:''})),/請選擇回診時段/);
 assert.equal(upsert([legacy],{...legacy,notes:'edited'})[0].followupPeriod,undefined);
 assert.equal(upsert([legacy],{...legacy,followupPeriod:'PM'})[0].followupPeriod,'PM');
 for(const followupPeriod of ['morning',null,0,false]){
  assert.throws(()=>parseRecords(JSON.stringify({version:1,records:[row('bad',{followupPeriod})]})));
  assert.throws(()=>upsert([row('bad')],row('bad',{followupPeriod})));
 }
});
test('case period display and search use the selected period without rewriting legacy date text',()=>{
 const record=row('one',{followup:'2026/11/24 上午',followupPeriod:'PM'});
 assert.equal(followupText(record),'2026/11/24（二） · 下午');
 assert.equal(record.followup,'2026/11/24 上午');
 assert.deepEqual(filterRecords([record],'PM'),[record]);
 assert.deepEqual(filterRecords([record],'下午'),[record]);
 const legacy={...record};delete legacy.followupPeriod;
 assert.equal(followupText(legacy),'2026/11/24（二） 上午');
 assert.equal(legacy.followup,'2026/11/24 上午');
});

test('follow-up weekdays support Gregorian, ROC and full-width dates without guessing ambiguous dates',()=>{
 for(const [followup,expected] of [
  ['2026/11/18','2026/11/18（三）'],
  ['115/11/24','115/11/24（二）'],
  ['民國115年11月22日','民國115年11月22日（日）'],
  ['２０２６／１１／２４','２０２６／１１／２４（二）'],
  ['2026/11/24（三）','2026/11/24（二）'],
  ['11/24','11/24'],['2026/2/30','2026/2/30'],
  ['2026/11/24取消','2026/11/24取消'],['','']
 ]){
  const record={followup};assert.equal(followupText(record),expected);assert.equal(record.followup,followup);
 }
});
