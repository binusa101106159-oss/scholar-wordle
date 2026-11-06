const test=require('node:test'),assert=require('node:assert/strict');
const d=require('../iarc/data.json'),{createIndex}=require('../iarc/iarc.js'),search=createIndex(d);
test('Every displayed classification comes directly from the retained official record',()=>{
 assert.equal(d.entries.length,1060);
 for(const row of d.entries){const raw=d.official.agents[Number(row.id.split('-')[1])];assert.equal(row.group,raw.group);assert.deepEqual(row.cas,raw.cas||[]);}
 assert.equal(d.lastUpdate,d.official.last_update);
});
test('Official search supports names, CAS numbers and group filtering',()=>{
 assert.equal(search('hydrochlorothiazide').length,1);assert.equal(search('hydrochlorothiazide')[0].group,'1');
 assert.equal(search('welding fumes').length,1);assert.equal(search('welding fumes')[0].group,'1');
 assert.ok(search('71-43-2').some(r=>r.text==='Benzene'));
 assert.ok(search('pfos','2B').some(r=>r.cas.includes('1763-23-1')));
 assert.equal(search('','2A').length,98);assert.equal(search('unknownxyz').length,0);
});
