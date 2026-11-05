'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scoreQuickDASH}=require('../calculator/aaos.js');

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
