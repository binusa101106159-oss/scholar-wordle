'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scoreQuickDASH,quickDASHSeverity}=require('../calculator/aaos.js');

// IWH Information for Users p.4: https://dash.iwh.on.ca/sites/dash/files/downloads/QuickDASH_scoring_2010.pdf
test('QuickDASH source formula preserves best, worst and mixed scores',()=>{
 assert.equal(scoreQuickDASH(Array(11).fill(1)).score,0);
 assert.equal(scoreQuickDASH(Array(11).fill(5)).score,100);
 assert.equal(scoreQuickDASH(Array(11).fill(3)).score,50);
 assert.equal(scoreQuickDASH([1,2,3,4,5,1,2,3,4,5,1]).score,(31/11-1)*25);
});
test('QuickDASH accepts exactly one missing item at every position',()=>{
 for(let omitted=0;omitted<11;omitted++){
  const values=Array(11).fill(3);values[omitted]='';const result=scoreQuickDASH(values);
  assert.equal(result.valid,10);assert.equal(result.ready,true);assert.equal(result.score,50);
  values[(omitted+1)%11]=null;assert.equal(scoreQuickDASH(values).ready,false);assert.equal(scoreQuickDASH(values).score,null);
 }
 assert.equal(scoreQuickDASH(Array(11).fill('')).score,null);
 assert.equal(scoreQuickDASH(Array(11).fill('３')).score,50);
});
test('QuickDASH rejects invalid codes even with ten other valid responses',()=>{
 for(const value of [0,6,-1,1.5,true,[],{},'x','1e0','2.0'])assert.throws(()=>scoreQuickDASH([value,...Array(10).fill(1)]));
 for(const value of [[],null,Array(10).fill(1),Array(12).fill(1)])assert.throws(()=>scoreQuickDASH(value));
});
test('AMA Table 15-7 integer bands cover every whole score and all five functional-history grades',()=>{
 const bands=[[0,20,0,'No problem'],[21,40,1,'Mild'],[41,60,2,'Moderate'],[61,80,3,'Severe'],[81,100,4,'Very severe']];
 for(const [min,max,grade,label] of bands)for(let score=min;score<=max;score++)assert.deepEqual(quickDASHSeverity(score),{min,max,grade,label,lookupScore:score});
 for(const value of [null,undefined,'50',NaN,Infinity,-1,101])assert.throws(()=>quickDASHSeverity(value));
});
test('decimal scores remain unchanged while the explicitly rounded lookup determines severity',()=>{
 for(const [raw,lookup,grade] of [[20.45,20,0],[20.5,21,1],[40.49,40,1],[40.5,41,2],[60.49,60,2],[60.5,61,3],[80.49,80,3],[80.5,81,4]]){
  const severity=quickDASHSeverity(raw);assert.equal(severity.lookupScore,lookup);assert.equal(severity.grade,grade);
 }
 const answers=[...Array(9).fill(2),1,1],result=scoreQuickDASH(answers);
 assert.equal(result.score,(20/11-1)*25);assert.equal(result.severity.lookupScore,20);assert.equal(result.severity.label,'No problem');
 for(const [answer,score,label] of [[1,0,'No problem'],[2,25,'Mild'],[3,50,'Moderate'],[4,75,'Severe'],[5,100,'Very severe']]){
  const result=scoreQuickDASH(Array(11).fill(answer));assert.equal(result.score,score);assert.equal(result.severity.label,label);
 }
});
test('one missing response retains the grade and two missing responses clear it',()=>{
 assert.equal(scoreQuickDASH([...Array(10).fill(3),'']).severity.grade,2);
 assert.equal(scoreQuickDASH([...Array(9).fill(3),'','']).severity,null);
 assert.equal(scoreQuickDASH(Array(11).fill('')).severity,null);
});

