'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../ama/ama.js'),'utf8'),context={};
vm.runInNewContext(source.slice(source.indexOf('  function normalizeFlowTables('),source.indexOf('  function sourceGlyphGroups('))+';this.normalize=normalizeFlowTables;',context);
const cell=(text,colSpan=1,rowSpan=1)=>({textContent:text,colSpan,rowSpan,localName:'td',dataset:{}});
const row=cells=>({cells,get textContent(){return cells.map(c=>c.textContent).join('');}});
const table=rows=>({rows,dataset:{},closest:()=>null});
const normalize=t=>context.normalize({querySelectorAll:()=>[t]});

test('short and long numeric row labels align alike while a text column remains left aligned',()=>{
 const t=table([row([cell('Grade'),cell('Severity')]),row([cell('4'),cell('Mild')]),row([cell('10'),cell('Moderate')]),row([cell('11'),cell('Very severe')])]);
 const before=t.rows.map(r=>r.textContent);normalize(t);
 for(const r of t.rows){assert.equal(r.cells[0].dataset.flowAlign,'center');assert.equal(r.cells[1].dataset.flowAlign,'left');}
 assert.deepEqual(t.rows.map(r=>r.textContent),before);
});
test('merged header cells preserve real column assignments and center over numeric columns',()=>{
 const t=table([row([cell('Impairment',1,2),cell('Hand',2)]),row([cell('Upper extremity'),cell('Whole person')]),row([cell('4'),cell('2'),cell('1')]),row([cell('10'),cell('4'),cell('2')]),row([cell('11'),cell('4'),cell('2')])]);
 normalize(t);assert.equal(t.rows[0].cells[1].dataset.flowAlign,'center');
 for(const r of t.rows.slice(2))for(const c of r.cells)assert.equal(c.dataset.flowAlign,'center');
 assert.equal(t.rows[0].cells[0].rowSpan,2);assert.equal(t.rows[0].cells[1].colSpan,2);
});
test('coordinate-based California source tables retain their own geometry',()=>{
 const t=table([row([cell('4')]),row([cell('10')])]);t.closest=()=>({});normalize(t);
 assert.deepEqual(t.dataset,{});assert.deepEqual(t.rows[0].cells[0].dataset,{});
});
