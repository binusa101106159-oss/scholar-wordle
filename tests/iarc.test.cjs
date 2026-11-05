const test=require('node:test'),assert=require('node:assert/strict');
const data=require('../iarc/data.json'),reports=require('../tools/iarc-build/report.json');
const {createIndex}=require('../iarc/iarc.js'),search=createIndex(data);

test('IARC import retains every supplied page, entry and nested parent',()=>{
 assert.deepEqual(data.sources.map(s=>[s.group,s.pages.length]),[['1',6],['2A',4],['2B',11],['3',14]]);
 assert.deepEqual(reports.map(r=>r.entries),[132,96,322,499]);
 for(const r of reports)assert.ok(r.characterCheck&&r.markerCheck);
 const ids=new Set(data.entries.map(e=>e.id));assert.equal(ids.size,1049);
 for(const row of data.entries){assert.ok(row.text&&row.page>=1);assert.ok(row.endPage>=row.page);if(row.parent)assert.ok(ids.has(row.parent));}
 assert.equal(data.entries.filter(e=>e.parent).length,6);
 for(const source of data.sources){assert.match(source.sha256,/^[a-f0-9]{64}$/);assert.ok(source.pages.at(-1).includes('Retrieved from'));assert.ok(source.pages.join('').includes('References'));}
});
test('IARC search combines words, category filters and chemical punctuation without rewriting text',()=>{
 assert.ok(search('BENZENE','1').some(e=>e.text==='Benzene'));
 assert.ok(search('4 aminobiphenyl').some(e=>e.text==='4-Aminobiphenyl'));
 assert.ok(search('beta myrcene','2B').some(e=>e.text==='β-Myrcene'));
 assert.ok(search('pfoa','1').some(e=>e.text.includes('Perfluorooctanoic')));
 assert.ok(search('pfos','2B').some(e=>e.text.includes('Perfuorooctanesulfonic')));
 assert.equal(search('definitelyunknownagentxyz').length,0);
 assert.equal(search('','2A').length,96);
 assert.ok(search('cardiac pacemakers','3').every(e=>e.parent));
 assert.ok(search('surgical implants cardiac','3').some(e=>e.text==='Cardiac pacemakers'));
});
test('IARC preserves source spellings, duplicates and complete notes instead of silently updating groups',()=>{
 assert.ok(search('hydrochlorothiazide').some(e=>e.group==='1'));
 assert.ok(search('hydrochlorothiazide').some(e=>e.group==='2B'));
 assert.ok(search('welding fumes').some(e=>e.group==='1'));
 assert.ok(search('welding fumes').some(e=>e.group==='2B'));
 assert.ok(search('araldite').some(e=>e.text.includes('Aralditeâ')));
 assert.ok(search('other cobalt').some(e=>e.text.includes('sulfde')));
 assert.ok(data.sources.find(s=>s.group==='1').pages[4].includes('contralateral breast cancer'));
 assert.ok(data.entries.find(e=>e.group==='2B'&&e.text.startsWith('Foreign bodies')).text.includes('66-67% nickel, 13-\n16% chromium and 7% iron'));
});
