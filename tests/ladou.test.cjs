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
 assert.deepEqual(index.chapters.map(c=>c.id),['c01','c02','c03','c04','c05','c06','c07','c08','c09','c10','c11','c12','c13','c14','c15','c16','c17','c18','c19','c20','c21','c22','c23','c24','c25','appendix-a']);
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

test('chapters 6–10 preserve all 133 pages, all 52 complete objects and original image assets',()=>{
 const sizes=[41,3,35,37,17],tables=[7,0,1,10,2],figures=[21,0,8,0,3];
 for(let i=0;i<5;i++){
  const entry=index.chapters.find(c=>c.id===`c${String(i+6).padStart(2,'0')}`);
  const data=JSON.parse(fs.readFileSync(path.join(root,entry.file),'utf8'));
  assert.equal(data.pages.length,sizes[i]);
  assert.equal(data.objects.filter(o=>o.kind==='table').length,tables[i]);
  assert.equal(data.objects.filter(o=>o.kind==='figure').length,figures[i]);
  const html=data.pages.map(p=>p.html).join('');assert.doesNotMatch(html,/140\.112\.|Downloaded|Access Provided|<!--figure/);
  assert.deepEqual(data.pages.map(p=>p.number),Array.from({length:sizes[i]},(_,j)=>j+1));
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const img of html.matchAll(/src="([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,img[1])),img[1]);
  for(const object of data.objects){assert.ok(object.title);assert.ok(html.includes(`id="${object.id}"`));assert.ok(object.sourcePages.every(p=>p>=1&&p<=sizes[i]));}
 }
});

test('the long knee table and split pain tables join continuations in their corresponding cells',()=>{
 const data=n=>JSON.parse(fs.readFileSync(path.join(root,index.chapters.find(c=>c.id===n).file),'utf8'));
 const knee=data('c09').objects.find(o=>o.label==='Table 9–8');
 assert.equal((knee.html.match(/<tr>/g)||[]).length,19);assert.equal((knee.html.match(/<img /g)||[]).length,8);
 assert.deepEqual(knee.sourcePages,[16,17,18,19,20]);assert.match(knee.html,/Thessaly test/);assert.match(knee.html,/Apprehension sign/);
 const herbs=data('c10').objects.find(o=>o.label==='Table 10–2');
 assert.match(herbs.html,/<td>Fish oil<\/td>[\s\S]*?Ulcerative colitis<\/td><td>3 g or less per day is considered safe\./);
 assert.equal((herbs.html.match(/<tr>/g)||[]).length,8);
 const c6=data('c06');assert.equal((c6.objects.find(o=>o.label==='Figure 6–10').html.match(/<img /g)||[]).length,2);
 assert.equal((data('c08').objects.find(o=>o.label==='Figure 8–2').html.match(/<img /g)||[]).length,4);
 assert.doesNotMatch(data('c09').pages[29].html,/i i i|i k f l/);
});


test('chapters 11–15 retain all 138 pages, original figures, full captions and complete table continuations',()=>{
 const sizes=[18,20,39,15,46],tables=[2,1,8,5,7],figures=[2,6,7,4,8];
 const get=n=>JSON.parse(fs.readFileSync(path.join(root,index.chapters.find(c=>c.id===`c${n}`).file),'utf8'));
 for(let i=0;i<5;i++){
  const d=get(i+11),html=d.pages.map(p=>p.html).join('');
  assert.deepEqual(d.pages.map(p=>p.number),Array.from({length:sizes[i]},(_,j)=>j+1));
  assert.equal(d.objects.filter(o=>o.kind==='table').length,tables[i]);
  assert.equal(d.objects.filter(o=>o.kind==='figure').length,figures[i]);
  assert.doesNotMatch(html,/Downloaded|140\.112\.|Access Provided/);
  for(const o of d.objects){assert.ok(o.title,o.label);assert.ok(html.includes(`id="${o.id}"`));}
  for(const im of html.matchAll(/src="([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,im[1])));
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 }
 const object=(n,label)=>get(n).objects.find(o=>o.label===label);
 assert.deepEqual(object(14,'Table 14–1').sourcePages,[1,2,3]);
 assert.equal((object(14,'Table 14–1').html.match(/<tr>/g)||[]).length,48);
 for(const num of [3,5,6])assert.equal(object(15,`Table 15–${num}`).sourcePages.length,3);
 assert.match(object(15,'Table 15–5').html,/Trichosporon cutaneum<\/td>/);
 assert.doesNotMatch(object(15,'Table 15–5').html,/<br>p<|<br>yp</);
 assert.equal((object(15,'Figure 15–8').html.match(/<img /g)||[]).length,2);
 assert.deepEqual(object(15,'Figure 15–8').sourcePages,[25,26,27]);
 assert.match(object(15,'Figure 15–8').title,/antibody-dependent cell-mediated cytotoxicity/);
 assert.match(object(14,'Table 14–4').html,/rowspan="2">Nicotinic/);
 assert.match(object(12,'Table 12–1').html,/Normal conversation<\/td><td>50–60/);
 assert.match(object(13,'Table 13–8').html,/Adults&gt; 18 y<\/td><td>50 mSv/);
 assert.equal(get(14).pages[14].blank,true);assert.match(get(14).pages[13].html,/RESOURCES/);
 assert.match(get(11).pages.at(-1).html,/Zakrzewski/);assert.match(get(15).pages.at(-1).html,/Raulf/);
});


test('chapters 16–20 preserve all 114 pages, 28 native tables and 19 complete figures',()=>{
 const sizes=[19,28,22,31,14],tables=[3,10,6,6,3],figures=[0,3,6,7,3];
 const get=n=>JSON.parse(fs.readFileSync(path.join(root,index.chapters.find(c=>c.id===`c${n}`).file),'utf8'));
 for(let i=0;i<5;i++){
  const d=get(i+16),html=d.pages.map(p=>p.html).join('');
  assert.deepEqual(d.pages.map(p=>p.number),Array.from({length:sizes[i]},(_,j)=>j+1));
  assert.equal(d.objects.filter(o=>o.kind==='table').length,tables[i]);
  assert.equal(d.objects.filter(o=>o.kind==='figure').length,figures[i]);
  assert.doesNotMatch(html,/Downloaded|140\.112\.|Access Provided/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const o of d.objects){assert.ok(o.title,o.label);assert.ok(html.includes(`id="${o.id}"`));}
  for(const im of html.matchAll(/src="([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,im[1])));
 }
 const object=(n,label)=>get(n).objects.find(o=>o.label===label);
 assert.deepEqual(object(16,'Table 16–1').sourcePages,[1,2]);
 assert.equal((object(16,'Table 16–1').html.match(/<tr>/g)||[]).length,20);
 assert.match(object(16,'Table 16–1').html,/Waste/);
 assert.deepEqual(object(17,'Table 17–2').sourcePages,[4,5]);
 assert.equal((object(17,'Table 17–2').html.match(/<tr>/g)||[]).length,25);
 assert.deepEqual(object(18,'Figure 18–1').sourcePages,[1,2]);
 assert.deepEqual(object(19,'Figure 19–4').sourcePages,[11,12]);
 assert.match(object(19,'Table 19–4').html,/Moldy hay<\/td><td>Farmer’s lung/);
 assert.match(object(19,'Table 19–4').html,/rowspan="2">Moldy redwood dust/);
 assert.match(object(16,'Table 16–3').html,/rowspan="3">Susceptible/);
 assert.match(object(20,'Table 20–2').html,/224<\/td><td>50 ppm for 2 h<\/td><td>1% → 2.7%<\/td><td>188/);
 assert.match(object(20,'Table 20–3').html,/rowspan="2">Source of Carbon Monoxide/);
 assert.match(object(20,'Table 20–3').html,/colspan="2">Carboxyhemoglobin Concentration/);
 assert.match(object(20,'Table 20–3').html,/Endogenous levels may be higher/);
 assert.doesNotMatch(object(20,'Table 20–3').html,/Measurement of carboxyhemoglobin/);
 assert.doesNotMatch(get(19).pages[29].html,/>p g p</);
 for(const [n,last]of [[16,'30789129'],[17,'29894409'],[18,'28389389'],[19,'31150272'],[20,'25458643']])assert.ok(get(n).pages.at(-1).html.includes(last));
});


test('chapters 21–25 preserve all 119 pages, 17 native tables, five complete figures and references',()=>{
 const sizes=[29,12,17,20,41],tables=[6,1,3,5,2],figures=[0,0,0,4,1];
 const get=n=>JSON.parse(fs.readFileSync(path.join(root,index.chapters.find(c=>c.id===`c${n}`).file),'utf8'));
 for(let i=0;i<5;i++){
  const d=get(i+21),html=d.pages.map(p=>p.html).join('');
  assert.deepEqual(d.pages.map(p=>p.number),Array.from({length:sizes[i]},(_,j)=>j+1));
  assert.equal(d.objects.filter(o=>o.kind==='table').length,tables[i]);
  assert.equal(d.objects.filter(o=>o.kind==='figure').length,figures[i]);
  assert.doesNotMatch(html,/Downloaded|140\.112\.|Access Provided/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const o of d.objects){assert.ok(o.title,o.label);assert.ok(html.includes(`id="${o.id}"`));}
  for(const im of html.matchAll(/src="([^"]+)"/g))assert.ok(fs.existsSync(path.join(root,im[1])));
 }
 const object=(n,label)=>get(n).objects.find(o=>o.label===label);
 assert.match(object(21,'Table 21–2').html,/<td>Direct<\/td><td>High<\/td><td>Yes<\/td><td>Yes<\/td><td>Carbon tetrachloride/);
 assert.match(object(21,'Table 21–3').html,/<td>Porphyria<\/td><td>Dioxin/);
 assert.match(object(22,'Table 22–1').html,/colspan="4">Hypothesized Causes/);
 assert.match(object(22,'Table 22–1').html,/colspan="4">Clinical Findings/);
 assert.match(object(22,'Table 22–1').html,/NSAIDs denotes/);
 assert.match(object(22,'Table 22–1').html,/1843-1852/);
 assert.doesNotMatch(object(22,'Table 22–1').html,/CKD CAUSED BY LEAD/);
 assert.equal(get(22).pages[11].blank,true);
 assert.match(object(24,'Table 24–2').html,/<th>% Methemoglobinemia<\/th><th>Symptoms/);
 assert.deepEqual(object(24,'Figure 24–3').sourcePages,[2,3]);
 assert.deepEqual(object(25,'Figure 25–1').sourcePages,[2,3]);
 assert.equal(get(24).outline.find(h=>h.title==='1. Aniline').level,4);
 assert.ok(get(25).outline.some(h=>h.title==='A. UV Radiation'));
 for(const [n,page,last]of [[21,29,'23262638'],[22,11,'31384436'],[23,17,'31603861'],[24,20,'31085196'],[25,41,'30288109']])assert.ok(get(n).pages[page-1].html.includes(last));
});
