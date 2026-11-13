'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../ama/ama.js'),'utf8');
const excerpt=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const context={};
vm.runInNewContext(excerpt('  function spacedRunText(', '  function readableCopy(')+excerpt('  function tableHeadingText(', '  function showChapterMarks(')+excerpt('  function cleanCaption(', '  async function openTableIndex(')+'\nthis.api={spacedRunText,tableHeadingText,showTableHeadings,cleanCaption,tableCaption};',context);
const api=context.api;
function classes(){const values=new Set();return {add:value=>values.add(value),contains:value=>values.has(value),toggle(value,on){if(on)values.add(value);else values.delete(value);}};}
function runFromHTML(html){
 const match=html.match(/<span class="ax-source-run" style="[^"]*">((?:<span style="[^"]*">[^<]*<\/span>)+)<\/span>/);
 assert.ok(match,'source title has positioned glyphs');
 const children=[...match[1].matchAll(/<span style="left:([\d.-]+)px">([^<]*)<\/span>/g)].map(([,left,textContent])=>({textContent,style:{left:left+'px'},children:[],classList:classes()}));
 return {children,classList:classes(),closest:()=>null,get textContent(){return children.map(glyph=>glyph.textContent).join('');}};
}
const chapter=JSON.parse(fs.readFileSync(require.resolve('../ama/c16.json'),'utf8'));
const attachment=chapter.attachments.find(object=>object.id==='t16-11');
test('Table 16-11 displays normal heading spacing and case without shifting saved text offsets',()=>{
 const run=runFromHTML(attachment.html),before=run.textContent.length;
 assert.equal(api.tableHeadingText(run),'Table 16-11 Sensory and Motor Severity');
 const cell=runFromHTML(attachment.html);cell.closest=()=>({tagName:'TABLE'});const cellBefore=cell.textContent;
 api.showTableHeadings({querySelectorAll:()=>[run,cell]});
 assert.equal(run.children.filter(glyph=>!glyph.classList.contains('ax-letter-gap')).map(glyph=>glyph.textContent).join(''),'Table 16-11 Sensory and Motor Severity');
 assert.equal(run.textContent.length,before,'existing highlight ranges keep the same text length');
 assert.equal(api.spacedRunText(run),'Table 16-11 Sensory and Motor Severity','clipboard text stays readable');
 assert.ok(run.classList.contains('ax-readable-heading'));
 assert.equal(cell.textContent,cellBefore,'table-cell content remains untouched');
});
test('cached and legacy captions use the same title case and preserve clinical acronyms',()=>{
 assert.equal(api.tableCaption({caption:'SENSORY AND MOTOR SEVERITY',label:'Table 16-11'}),'Sensory and Motor Severity');
 assert.equal(api.cleanCaption('TABLE 16-11 SENSORY AND MOTOR SEVERITY','Table 16-11'),'Sensory and Motor Severity');
 assert.equal(api.cleanCaption('ICF Codes and Functional Levels','Table 1-3'),'ICF Codes and Functional Levels');
 assert.equal(api.cleanCaption('CRPS II and Motor Deficit','Table 16-12'),'CRPS II and Motor Deficit');
});
