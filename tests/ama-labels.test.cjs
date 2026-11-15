'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../ama/ama.js'),'utf8'),start=source.indexOf('  function sourceGlyphGroups('),end=source.indexOf('  function naturalSourceLabels(',start),context={};
vm.runInNewContext(source.slice(start,end)+';this.group=sourceGlyphGroups;',context);
const groups=(text,x,size=12)=>JSON.parse(JSON.stringify(context.group([...text].map((c,i)=>({text:c,x:x?x[i]:i*5})),size)));

test('figure captions become intact words without changing source characters',()=>{
 const text=' Neutral Position of Thumb ',result=groups(text);
 assert.equal(result.length,1);assert.equal(result[0].map(g=>g.text).join(''),text);
});
test('independent anatomical labels retain their separate original anchors',()=>{
 const result=groups('IPMCP',[0,6,90,98,106]);
 assert.deepEqual(result.map(a=>a.map(g=>g.text).join('')),['IP','MCP']);
 assert.deepEqual(result.map(a=>a[0].x),[0,90]);
});
test('dense visual-acuity values retain individual positions instead of growing into the next font run',()=>{
 const text='/12 /16 /20 /25';const result=groups(text);
 assert.deepEqual(result.map(a=>a.map(g=>g.text).join('')),['/12 ','/16 ','/20 ','/25']);
 assert.equal(result.flat().map(g=>g.text).join(''),text,'the renderer must not delete or retype any value');
});
test('numbered text labels are not mistaken for a row of independent values',()=>{
 assert.equal(groups('Grade 1 motor deficit').length,1);
});

test('two-letter form choices retain separate anchors for source selection circles',()=>{
 assert.deepEqual(groups('F M',[0,7,25]).map(g=>g.map(n=>n.text).join('')),['F ','M']);
 assert.deepEqual(groups('R L',[0,7,24]).map(g=>g[0].x),[0,24]);
});
