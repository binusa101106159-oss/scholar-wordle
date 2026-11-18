const test=require('node:test'),assert=require('node:assert/strict');
const {scoreMIDAS,buildNote}=require('../forms/midas.js');
test('MIDAS sums only the first five items at every grading boundary',()=>{
 for(const [total,grade]of [[0,'I'],[5,'I'],[6,'II'],[10,'II'],[11,'III'],[20,'III'],[21,'IV'],[270,'IV']]){const result=scoreMIDAS([total,0,0,0,0,90,10]);assert.equal(result.total,total);assert.equal(result.grade,grade);}
 assert.equal(scoreMIDAS([10,20,30,40,50,null,null]).total,150);
});
test('MIDAS preserves missing versus true zero, permits unfilled A/B, rejects invalid input',()=>{
 assert.equal(scoreMIDAS([null,0,0,0,0,0,0]).ready,false);
 assert.equal(scoreMIDAS([0,0,0,0,0,null,null]).total,0);
 assert.equal(buildNote(Array(7).fill(null)),'');
 for(const value of [-1,1.5,'0',NaN,Infinity,undefined])assert.throws(()=>scoreMIDAS([value,0,0,0,0,null,null]));
 assert.throws(()=>scoreMIDAS([0,0,0,0,0,0,11]));assert.throws(()=>scoreMIDAS([0,0,0]));
 assert.throws(()=>scoreMIDAS([Number.MAX_SAFE_INTEGER,1,0,0,0,null,null]));
});
test('MIDAS copied notes mark incomplete scores and keep A/B separate',()=>{
 const partial=buildNote([null,0,0,0,0,3,5]);assert.match(partial,/主項尚未完成/);assert.doesNotMatch(partial,/第I級|總分：/);
 const complete=buildNote([1,2,3,4,5,90,10]);assert.match(complete,/總分：15；第III級/);assert.match(complete,/A\. 頭痛總天數：90 天（不計入總分）/);assert.match(complete,/B\. 平均疼痛強度：10 \/ 10（不計入總分）/);
});
