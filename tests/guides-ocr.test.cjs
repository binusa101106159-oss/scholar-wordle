'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const index=require('../guides/index.json');
for(const [id,pages,refs,tables] of [['c119',7,31,0],['c127',8,46,1],['c128',10,12,0],['c130',10,21,2]]){
 test(id+' preserves scans and exposes complete searchable sections',()=>{
  const data=require('../guides/text/'+id+'.json'),meta=index.guides.find(g=>g.id===id);
  assert.equal(meta.ocr,true);assert.ok(!meta.scan);assert.equal(data.ocr,true);assert.ok(!data.scan);
  assert.equal(data.pages.length,pages);assert.equal(meta.pages,pages);
  assert.equal(new Set(data.pages.map(p=>p.img[0].src)).size,pages);
  for(const p of data.pages){assert.equal(p.t,'img');assert.equal(p.scan,true);assert.ok(p.img[0].src.startsWith(id+'-'));}
  assert.equal(data.cover.length,2);
  assert.equal(data.blocks.filter(b=>b.t==='h'&&b.lv===1).length,7);
  assert.ok(data.blocks.some(b=>b.t==='h'&&b.text==='六、結論'));
  assert.equal(data.blocks.filter(b=>b.t==='table').length,tables);
  const at=data.blocks.findIndex(b=>b.t==='h'&&b.text.startsWith('七、'));
  assert.deepEqual(data.blocks.slice(at+1).map(b=>Number(/^(\d+)\./.exec(b.text)?.[1])),Array.from({length:refs},(_,i)=>i+1));
  for(const b of data.blocks){assert.ok(['p','h','table'].includes(b.t));if(b.t==='table')for(const row of b.rows)assert.equal(row.reduce((n,c)=>n+(c.cs||1),0),b.widths.length);}
 });
}
test('organophosphate clinical tables retain category spans and separate symptom lines',()=>{
 const tables=require('../guides/text/c130.json').blocks.filter(b=>b.t==='table');
 assert.equal(tables[0].head,0);
 assert.equal(tables[0].rows.filter(r=>r.length===1&&r[0].cs===2).length,3);
 assert.equal(tables[1].rows.length,5);
 assert.equal(tables[1].rows[4][1].blocks.at(-1).text,'發紺');
 assert.equal(tables[1].rows[4][2].text,'不治療則致命');
});
