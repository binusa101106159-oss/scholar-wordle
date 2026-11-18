const test=require('node:test'),assert=require('node:assert/strict');
const {sections,mmseItems,choose,buildMSE,scoreMMSE,buildMMSE}=require('../forms/clinical.js');
test('MSE never invents unassessed findings or inserts HTML',()=>{
 assert.equal(buildMSE(), '');
 const text=buildMSE({values:{appearance:['Neat'],speech:['bad-key']},comments:{thoughts:'Patient said <hello>.\nNo further history obtained.'}});
 assert.match(text,/Appearance: Neat/);assert.match(text,/<hello>/);assert.doesNotMatch(text,/Normal|Suicidality|Speech:/);
});
test('MSE normal and none exclude contradictory findings; multiple positive findings and clearing work',()=>{
 const none=sections[2].rows[0],speech=sections[0].rows[1],insight=sections[6].rows[0];
 assert.deepEqual(choose(none,['None'],'Place',true),['Place']);
 assert.deepEqual(choose(none,['Place'],'Time',true),['Place','Time']);
 assert.deepEqual(choose(none,['Place','Time'],'None',true),['None']);
 assert.deepEqual(choose(none,['None'],'None',false),[]);
 assert.deepEqual(choose(speech,['Normal'],'Pressured',true),['Pressured']);
 assert.deepEqual(choose(insight,['Good'],'Poor',true),['Poor']);
});
test('MMSE requires all 11 valid items before totaling and retains true zero',()=>{
 assert.equal(mmseItems.reduce((sum,item)=>sum+item.max,0),30);
 assert.deepEqual(scoreMMSE(),{count:0,ready:false,total:null});
 const values=Object.fromEntries(mmseItems.map(item=>[item.id,item.max]));assert.equal(scoreMMSE(values).total,30);
 values.time=0;assert.equal(scoreMMSE(values).total,25);
 for(const bad of [null,'0',NaN,6,-1,1.5]){values.time=bad;assert.equal(scoreMMSE(values).total,null);assert.equal(scoreMMSE(values).count,10);}
 assert.equal(scoreMMSE(Object.fromEntries(mmseItems.map(item=>[item.id,0]))).total,0);
});
test('MMSE notes mark incomplete data, include only assessed items and no unsupported cutoff',()=>{
 assert.equal(buildMMSE(), '');
 const partial=buildMMSE({values:{time:0,place:null}});assert.match(partial,/時間定向：0 \/ 5/);assert.match(partial,/不計總分/);assert.doesNotMatch(partial,/地點定向|失智|正常/);
 const full=buildMMSE({values:Object.fromEntries(mmseItems.map(item=>[item.id,item.max]))});assert.match(full,/總分：30 \/ 30/);
});
