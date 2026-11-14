'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../ama/ama.js'),'utf8');
const start=source.indexOf('  function migratedRanges('),end=source.indexOf('  function restoreMarks(',start),context={};
vm.runInNewContext(source.slice(start,end)+';this.map=migratedRanges;',context);

test('all 17 chapters use normal cell text without per-letter PDF spans',()=>{
 let tables=0;
 for(let i=1;i<=17;i++){
  const id='c'+String(i).padStart(2,'0'),data=JSON.parse(fs.readFileSync(require.resolve('../ama/'+id+'.json'),'utf8'));
  for(const item of [...data.pages,...data.attachments])for(const table of item.html.match(/<table\b[\s\S]*?<\/table>/g)||[]){
   tables++;assert.equal(table.includes('ax-source-run'),false,id+' '+(item.id||item.page));
  }
 }
 assert.ok(tables>500,'check the complete set, including popup and inline representations');
});

test('legacy highlights follow the same letters across changed PDF whitespace',()=>{
 const migration={fromLength:7,toLength:5,blocks:[[0,0,2],[3,2,2],[6,4,1]]};
 const old={length:7,ranges:[{id:'original',start:1,end:7}]};
 const mapped=context.map(old,5,migration);
 assert.deepEqual(JSON.parse(JSON.stringify(mapped)),[{id:'original:flow:1:2',start:1,end:2},{id:'original:flow:3:5',start:2,end:4},{id:'original:flow:6:7',start:4,end:5}]);
 assert.equal(new Set(mapped.map(r=>r.id)).size,mapped.length,'cloud merging must not collapse separate mapped fragments with the same ID');
 assert.equal(old.ranges[0].end,7,'the original cloud record is never mutated by rendering');
 assert.equal(context.map(old,8,migration).length,0,'mismatching content cannot receive stale offsets');
 assert.equal(context.map({length:5,textVersion:2,ranges:[{start:2,end:4}]},5,migration)[0].start,2,'new marks are not migrated twice');
});

test('thumb motion cells use ordinary HTML paragraphs instead of positioned PDF glyphs',()=>{
 const chapter=JSON.parse(fs.readFileSync(require.resolve('../ama/c15.json'),'utf8'));
 const object=chapter.attachments.find(a=>a.id==='t15-30');
 assert.ok(object.html.includes('Radial')&&object.html.includes('Opposition'));
 assert.ok(object.html.includes('<table class="ax-table"'));
 assert.equal(object.html.includes('ax-source-run'),false);
 assert.equal(object.html.includes('ax-source-grid'),false);
 assert.ok(object.html.includes('data-readable-title="Table 15-30"'),'table numbers sharing prefixes must not be truncated');
});

test('the midfoot calculation retains both columns and all result lines inside its table',()=>{
 const chapter=JSON.parse(fs.readFileSync(require.resolve('../ama/c16.json'),'utf8'));
 const html=chapter.pages.find(p=>p.page===543).html;
 const table=html.match(/<table\b[^>]*>[\s\S]*?<\/table>/)[0];
 assert.equal((table.match(/<col /g)||[]).length,2);
 for(const text of ['CDX','GMFH','Net adjustment = −1','Class 3, grade B=45%'])assert.ok(table.includes(text),text);
 assert.equal((html.match(/Class 3, grade B=45%/g)||[]).length,1,'results must not be duplicated outside the repaired grid');
});

test('a separately encoded zero stays before its superscript and grade values',()=>{
 const chapter=JSON.parse(fs.readFileSync(require.resolve('../ama/c15.json'),'utf8'));
 const object=chapter.attachments.find(a=>a.id==='t15-20');
 const cells=[...object.html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
 assert.ok(cells[28][1].replace(/<[^>]*>|\s/g,'').startsWith('0a2356'));
});
