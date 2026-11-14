'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../ama/ama.js'),'utf8');
const excerpt=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const context={};
vm.runInNewContext(excerpt('  function spacedRunText(', '  function readableCopy(')+excerpt('  function sourceHeadingText(', '  function showChapterMarks(')+excerpt('  function cleanCaption(', '  async function openTableIndex(')+'\nthis.api={spacedRunText,sourceHeadingText,showSourceHeadings,cleanCaption,tableCaption};',context);
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
 const glyphs=fixtures.cases.find(item=>item.chapter==='c16'&&item.object==='t16-11').glyphs;
 const run=fixtureRun(glyphs),before=run.textContent.length;
 assert.equal(api.sourceHeadingText(run),'Table 16-11 Sensory and Motor Severity');
 const cell=fixtureRun(glyphs);cell.closest=()=>({tagName:'TABLE'});const cellBefore=cell.textContent;
 api.showSourceHeadings({querySelectorAll:()=>[run,cell]});
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
const fixtures=require('./fixtures/ama-heading-glyphs.json');
function fixtureRun(glyphs){
 const children=glyphs.map(([textContent,left])=>({textContent,style:{left:left+'px'},children:[],classList:classes()}));
 return {children,classList:classes(),closest:()=>null,get textContent(){return children.map(glyph=>glyph.textContent).join('');}};
}
test('all 318 letter-spaced table and figure headings from the complete AMA scan render as readable text',()=>{
 assert.equal(fixtures.chaptersScanned,18);assert.equal(fixtures.cases.length,318);
 assert.equal(new Set(fixtures.cases.map(item=>item.chapter)).size,17);
 for(const item of fixtures.cases){
  const run=fixtureRun(item.glyphs),before=run.textContent.length,label=item.chapter+' '+item.object+' p'+item.page;
  assert.equal(api.sourceHeadingText(run),item.expected,label);
  api.showSourceHeadings({querySelectorAll:()=>[run]});
  assert.equal(run.children.filter(glyph=>!glyph.classList.contains('ax-letter-gap')).map(glyph=>glyph.textContent).join(''),item.expected,label);
  assert.equal(run.textContent.length,before,label+' highlight offsets');
  assert.equal(api.spacedRunText(run),item.expected,label+' clipboard');
 }
});
test('diagram labels, percentages, clinical abbreviations and appendix body text are excluded',()=>{
 for(const item of fixtures.untouched){
  const run=fixtureRun(item.glyphs),before=run.textContent;
  assert.equal(api.sourceHeadingText(run),null,item.text);
  api.showSourceHeadings({querySelectorAll:()=>[run]});
  assert.equal(run.textContent,before,item.text);
  assert.equal(run.classList.contains('ax-readable-heading'),false,item.text);
 }
});
