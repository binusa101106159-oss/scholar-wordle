const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const index=JSON.parse(fs.readFileSync(path.join(root,'ladou/index.json'),'utf8'));
const chapter=JSON.parse(fs.readFileSync(path.join(root,index.chapters.find(c=>c.id==='appendix-a').file),'utf8'));
const {findMatches,outlineTree}=require('../ladou/ladou.js');
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
test('the collapsible outline preserves source order and attaches each section to its nearest parent',()=>{
 const tree=outlineTree(chapter.outline),flat=nodes=>nodes.flatMap(n=>[n.id,...flat(n.children)]);
 assert.deepEqual(flat(tree),chapter.outline.map(h=>h.id));
 const bio=tree.find(h=>h.title==='I. BIOSTATISTICS');assert.ok(bio.children.some(h=>h.title==='DESCRIPTIVE STATISTICS'));
 const epi=tree.find(h=>h.title==='II. EPIDEMIOLOGY');assert.ok(epi.children.some(h=>h.title==='SOURCES OF BIAS'));
});
test('the first five chapters retain their source pages, complete figures, tables and references',()=>{
 assert.deepEqual(index.chapters.map(c=>c.id),['c01','c02','c03','c04','c05','appendix-a']);
 const pages=[6,8,10,6,11],objects=[0,2,2,0,1];
 for(let i=0;i<5;i++){
  const data=JSON.parse(fs.readFileSync(path.join(root,index.chapters[i].file),'utf8'));
  assert.equal(data.pages.length,pages[i]);assert.equal(data.objects.length,objects[i]);
  assert.deepEqual(data.pages.map(p=>p.number),Array.from({length:pages[i]},(_,n)=>n+1));
  const html=data.pages.map(p=>p.html).join('');assert.doesNotMatch(html,/140\.112\.|Downloaded|<!--figure/);
  assert.match(html,i===1?/Other References/:/REFERENCES/);
  for(const img of html.matchAll(/src="([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,img[1])));
 }
 const c2=JSON.parse(fs.readFileSync(path.join(root,index.chapters[1].file),'utf8'));
 assert.match(c2.pages[0].html,/c02-figure-2-1/);assert.match(c2.pages[0].html,/520/);
 assert.deepEqual(c2.objects.find(o=>o.kind==='figure').sourcePages,[1,2]);
 const c1=JSON.parse(fs.readFileSync(path.join(root,index.chapters[0].file),'utf8'));assert.equal(c1.pages[5].blank,true);
});
