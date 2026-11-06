'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fields,parseRecords,upsert,filterRecords}=require('../cases/cases.js');
const row=(id,extra={})=>Object.assign(Object.fromEntries(fields.map(([key])=>[key,''])),{id,name:'測試個案',mrn:'00001234'},extra);
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
