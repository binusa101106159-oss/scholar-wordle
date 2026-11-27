const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const index=JSON.parse(fs.readFileSync(path.join(root,'ladou/index.json'),'utf8'));
const chapter=JSON.parse(fs.readFileSync(path.join(root,index.chapters[0].file),'utf8'));
const {findMatches}=require('../ladou/ladou.js');
test('LaDou keeps all 30 source pages, numbered tables, figures and its final references',()=>{
 assert.deepEqual(chapter.pages.map(p=>p.number),Array.from({length:30},(_,i)=>i+1));
 for(const id of [1,2,3,4,5,6])assert.ok(chapter.objects.some(o=>o.label===`Table A–${id}`));
 assert.equal(chapter.objects.filter(o=>o.kind==='figure').length,4);
 assert.equal(chapter.objects.filter(o=>o.kind==='table').length,17);
 assert.equal(chapter.outline.length,49);
 assert.match(chapter.pages.at(-1).html,/Lash/);assert.match(chapter.pages.at(-1).html,/R Project/);
 const html=chapter.pages.map(p=>p.html).join('');assert.doesNotMatch(html,/Downloaded|140\.112\.|Access Provided/);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 for(const match of html.matchAll(/src="([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,match[1])),match[1]);
});
test('the eight missing source assets are explicitly reconstructed and the unit conflict is disclosed',()=>{
 assert.equal(chapter.repairs.count,8);assert.equal(chapter.repairs.edition,4);
 const table=chapter.objects.find(o=>o.label==='Table A–2');assert.match(table.html,/Crude death rate/);assert.match(table.html,/Infant mortality rate/);assert.match(table.html,/100,000 live births/);assert.match(table.html,/單位矛盾/);
 const exposure=chapter.objects.find(o=>o.label==='Table A–5');assert.match(exposure.html,/>Yes</);assert.match(exposure.html,/>No</);
 assert.match(chapter.pages[3].html,/62\.0/);assert.match(chapter.pages[3].html,/6\.25/);
 const mean=chapter.objects.find(o=>o.label==='Table A–1');assert.match(mean.html,/6\.25/);assert.equal((mean.html.match(/\[n\/2\] observation/g)||[]).length,1);assert.match(mean.html,/ld-repaired">\+</);
});
test('chapter word search handles literal special characters, repeated terms and empty queries',()=>{
 assert.deepEqual(findMatches('Risk risk RISK','risk'),[[0,4],[5,9],[10,14]]);
 assert.deepEqual(findMatches('p < 0.05; [n/2]','[n/2]'),[[10,15]]);
 assert.deepEqual(findMatches('anything','  '),[]);
});
