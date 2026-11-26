const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {data,notesFor}=require('../laws/effective.js');
const load=id=>JSON.parse(fs.readFileSync(path.join(__dirname,'..','laws','text',id+'.json'),'utf8'));

test('each law still carries the exact 備註 the dates were taken from',()=>{
 for(const [id,law] of Object.entries(data)) assert.ok(load(id).notes.includes(law.source),id+' 備註已變更，請重新核對 laws/effective.js');
});
test('every noted article exists in the law',()=>{
 for(const [id,law] of Object.entries(data)){
  const nos=new Set(load(id).items.filter(it=>it.t==='art').map(it=>it.no));
  for(const no of Object.keys(law.arts)) assert.ok(nos.has(no),id+' 第 '+no+' 條');
 }
});
test('the written 民國 date matches the stored date',()=>{
 for(const [id,law] of Object.entries(data)) for(const [no,list] of Object.entries(law.arts)) for(const x of list){
  const m=x.text.match(/自 (\d+) 年 (\d+) 月 (\d+) 日施行/);
  if(!x.date){assert.equal(m,null,id+' '+no);continue;}
  const p=n=>String(n).padStart(2,'0');
  assert.equal(+m[1]+1911+'-'+p(m[2])+'-'+p(m[3]),x.date,id+' '+no);
 }
});
test('every date in a 備註 is used for at least one article',()=>{
 /* catches a clause that was skipped when the note was split per article */
 const cn={'一百十五年七月一日':'2026-07-01','一百十六年七月一日':'2027-07-01','一百十六年一月一日':'2027-01-01','一百十八年一月一日':'2029-01-01','116 年 7 月 1 日':'2027-07-01','117 年 1 月 1 日':'2028-01-01'};
 for(const [id,law] of Object.entries(data)){
  const used=new Set(Object.values(law.arts).flat().map(x=>x.date));
  for(const [k,v] of Object.entries(cn)) if(law.source.includes(k)) assert.ok(used.has(v),id+' '+k);
 }
});
test('pending vs in force follows today',()=>{
 assert.deepEqual(notesFor('s01','5','2026-11-26'),[{text:'本條自 116 年 7 月 1 日施行',pending:true}]);
 assert.equal(notesFor('s01','5','2027-07-01')[0].pending,false);
 assert.equal(notesFor('a09','3','2026-11-26')[0].pending,false);
 assert.equal(notesFor('base05','166-1','2026-11-26')[0].pending,false);
 assert.deepEqual(notesFor('s01','1'),[]);assert.deepEqual(notesFor('nope','1'),[]);
});
