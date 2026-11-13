'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {adaptGuide,guideCorpus}=require('../laws/laws.js');
const {makeIndex,findResults}=require('../laws/search.js');
const catalog=require('../laws/index.json');
test('reference guides share source text and preserve all blocks, tables, and scans',()=>{
 const metas=catalog.laws.filter(l=>l.guide);
 assert.deepEqual(metas.map(m=>m.guide),['c119','c127','c128','c130']);
 for(const meta of metas){
  const source=require('../guides/text/'+meta.guide+'.json'),doc=adaptGuide(source,meta);
  assert.equal(doc.items.length,source.blocks.length);assert.deepEqual(doc.guidePages,source.pages);
  assert.equal(doc.items.filter(i=>i.t==='art').length,0);
  assert.deepEqual(doc.items.map(i=>i.t==='ch'?{t:'h',text:i.text,lv:i.lv}:i.block),source.blocks);
  assert.equal(new Set(doc.items.map(i=>i.no)).size,source.blocks.length);
 }
});
test('both title and body search find guides and retain their exact block anchors',()=>{
 const metas=catalog.laws.filter(l=>l.guide),docs=metas.map(m=>adaptGuide(require('../guides/text/'+m.guide+'.json'),m));
 const corpus=docs.flatMap(guideCorpus),idx=makeIndex(metas,corpus);
 assert.ok(findResults(idx,'萘酚').some(r=>r.kind==='law'&&r.meta.guide==='c119'));
 const results=findResults(idx,'isomalathon');assert.equal(results.length,1);
 const hit=results[0],doc=docs.find(d=>d.id===hit.law);
 assert.equal(hit.where,'四、流行病學的證據');
 assert.ok(doc.items.find(i=>i.no===hit.art).block.text.includes('isomalathon'));
 const tableHit=findResults(idx,'針狀瞳孔');assert.equal(tableHit.length,1);assert.equal(tableHit[0].meta.guide,'c130');
});
test('guide group is separate from the existing law tiers',()=>{
 assert.equal(catalog.tiers.find(t=>t.id==='職業病認定指引').total,4);
 for(const tier of ['S','A','B','C'])assert.ok(catalog.laws.filter(l=>l.tier===tier).every(l=>!l.guide));
});
