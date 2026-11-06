"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const index=read('health/index.json');
test('special-health chapters retain both source versions and page references',()=>{
 assert.deepEqual(index.guides.map(g=>g.id),['full','brief'].flatMap(kind=>Array.from({length:16},(_,i)=>kind+String(i+1).padStart(2,'0'))));
 const report=read('tools/health-build/report.json');
 for(const g of index.guides){const d=read('health/text/'+g.id+'.json'),r=report[g.id];assert.equal(r.ok,true,g.id);assert.deepEqual(r.missing,{});assert.deepEqual(r.extra,{});
 assert.equal(d.blocks.length,r.page_map.length);for(const b of d.blocks){assert.ok(b.pdf_page>=r.source_pages[0]&&b.pdf_last<=r.source_pages[1]&&b.pdf_page<=b.pdf_last,g.id);assert.equal(b.source,g.cat==='full'?'完整版.pdf':'簡明版.pdf');}
 for(const a of g.attach){const att=read('health/attach/'+a.id+'.json');assert.equal(att.guide,g.id);assert.ok(att.blocks.some(b=>b.t==='table'||b.t==='img'));}
 }
});
test('all special-health tables have valid merged-cell geometry and native text',()=>{
 let count=0;
 function table(t){count++;const occupied=new Set();for(let r=0;r<t.rows.length;r++)for(const c of t.rows[r]){assert.equal(typeof c.text,'string');assert.ok(c.c>=0&&c.cs>=1&&c.rs>=1&&c.c+c.cs<=t.widths.length);assert.ok(r+c.rs<=t.rows.length);for(let y=r;y<r+c.rs;y++)for(let x=c.c;x<c.c+c.cs;x++){const key=y+':'+x;assert.ok(!occupied.has(key),'overlapping cells '+key);occupied.add(key);}for(const b of c.blocks||[])if(b.t==='table')table(b);}}
 for(const g of index.guides)for(const b of read('health/text/'+g.id+'.json').blocks){assert.ok(!b.scan);if(b.t==='table')table(b);}
 assert.equal(count,121);
});
