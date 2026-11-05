const test=require('node:test');
const assert=require('node:assert/strict');
const {layout}=require('../guides/table-layout.js');
const fs=require('node:fs');
const path=require('node:path');

test('guide header rowspans stay inside one HTML row group',()=>{
  const t={widths:[40,40,40],head:1,rows:[
    [{c:0,cs:1,rs:2,text:'分類'},{c:1,cs:2,rs:1,text:'標準'}],
    [{c:1,cs:1,rs:2,text:'第一欄'},{c:2,cs:1,rs:1,text:'第二欄'}],
    [{c:0,cs:1,rs:1,text:'甲'},{c:2,cs:1,rs:1,text:'乙'}],
    [{c:0,cs:1,rs:1,text:'1'},{c:1,cs:1,rs:1,text:'2'},{c:2,cs:1,rs:1,text:'3'}]
  ]};
  assert.equal(layout(t).head,3);
  assert.deepEqual(layout(t).rows.flat().filter(c=>c.text),t.rows.flat());
});

test('sparse guide rows retain column positions without moving text or breaking rowspans',()=>{
  const t={widths:[30,30,30,30],head:0,rows:[
    [{c:0,cs:1,rs:2,text:'保留'},{c:1,cs:1,rs:1,text:'A'},{c:3,cs:1,rs:1,text:'C'}],
    [{c:2,cs:2,rs:1,text:'B'}]
  ]};
  const result=layout(t);
  assert.deepEqual(result.rows[0].map(c=>[c.c,c.cs,c.text]),[[0,1,'保留'],[1,1,'A'],[2,1,''],[3,1,'C']]);
  assert.deepEqual(result.rows[1].map(c=>[c.c,c.cs,c.text]),[[1,1,''],[2,2,'B']]);
  assert.deepEqual(t.rows[1],[{c:2,cs:2,rs:1,text:'B'}]);
});

test('every published native guide table retains its cells and forms a complete non-overlapping HTML grid',()=>{
  const root=path.join(__dirname,'../guides');
  const index=JSON.parse(fs.readFileSync(path.join(root,'index.json'),'utf8'));
  const files=new Set(index.guides.flatMap(g=>['text/'+g.id+'.json',...(g.attach||[]).map(a=>'attach/'+a.id+'.json')]));
  let checked=0;
  function visit(value,label){
    if(!value||typeof value!=='object')return;
    if(value.t==='table'){
      checked++;const {rows,head}=layout(value),columns=value.widths.length,grid=new Set();
      assert.ok(columns>0&&value.widths.every(w=>Number.isFinite(w)&&w>0),label);
      for(const original of value.rows.flat())assert.ok(rows.flat().includes(original),'Source cell lost: '+label);
      rows.forEach((row,r)=>row.forEach(c=>{
        assert.ok(c.c>=0&&c.c+(c.cs||1)<=columns&&r+(c.rs||1)<=rows.length,label);
        assert.ok(!(r<head&&r+(c.rs||1)>head),'Header split cuts a merged cell: '+label);
        for(let y=r;y<r+(c.rs||1);y++)for(let x=c.c;x<c.c+(c.cs||1);x++){
          const key=y+','+x;assert.ok(!grid.has(key),'Overlapping cells: '+label);grid.add(key);
        }
      }));
      assert.equal(grid.size,rows.length*columns,'Missing grid position: '+label);
    }
    for(const [key,item] of Object.entries(value))visit(item,label+'/'+key);
  }
  for(const file of files)visit(JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),file);
  assert.ok(checked>0);
});

test('hearing reference tables keep one age column and eight frequency columns for every age 15 through 65',()=>{
  for(const id of ['p01-t8','p01-t9']){
    const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../guides/attach/'+id+'.json'),'utf8'));
    const table=data.blocks.find(b=>b.t==='table');assert.equal(table.widths.length,9,id);
    const rows=layout(table).rows;assert.equal(rows.length,53,id);
    assert.deepEqual(rows.slice(2).map(row=>Number(row[0].text)),Array.from({length:51},(_,i)=>i+15));
    for(const row of rows.slice(2))assert.equal(row.length,9,id);
  }
  const female=JSON.parse(fs.readFileSync(path.join(__dirname,'../guides/attach/p01-t9.json'),'utf8')).blocks.find(b=>b.t==='table');
  assert.equal(female.rows.find(row=>row[0].text==='48')[2].text,'II','Keep the two capital I characters printed in the PDF');
});

test('underlined ICD codes remain in the source two-column table instead of creating extra columns',()=>{
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../guides/text/c029.json'),'utf8'));
  const table=data.blocks.find(b=>b.t==='table'&&b.rows.some(row=>row.some(c=>c.text==='ICD-10 code')));
  assert.ok(table);assert.equal(table.widths.length,2);
  assert.ok(table.rows.some(row=>row.some(c=>c.c===1&&c.text.includes('*T51.1X1A'))));
});
