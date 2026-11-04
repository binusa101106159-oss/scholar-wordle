'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const data=require('../calculator/aaos.json');
const {scoreAAOS,severityFor,round}=require('../calculator/aaos.js');
test('AAOS best and worst valid answers retain exact normative constants',()=>{
 const best=scoreAAOS([1,1,1,1,1,1,1],data),worst=scoreAAOS([5,5,6,6,6,7,6],data);
 assert.equal(best.displayScore,100);assert.equal(best.raw,0);assert.equal(best.displayNormative,57);assert.equal(best.severity.original,'Normal');
 assert.equal(worst.raw,35);assert.equal(worst.displayScore,0);assert.equal(worst.displayNormative,-16);assert.equal(worst.severity.original,'Near-total to total deficit');
 assert.equal(data.populationMean,90.5138);assert.equal(data.populationSD,13.78281);
});
test('AAOS each question uses its own rescaling range',()=>{
 data.questions.forEach((q,i)=>{const a=Array(7).fill(1);a[i]=q.max===7&&i!==5?6:q.max;const r=scoreAAOS(a,data);assert.ok(Math.abs(r.raw-5)<1e-12,'Q'+(i+1));assert.equal(r.valid,7);});
 const r=scoreAAOS([3,1,null,null,null,1,1],data);assert.equal(r.standardized,87.5);assert.equal(r.displayScore,88);assert.equal(r.normative,50+10*(87.5-90.5138)/13.78281);
});
test('AAOS requires four valid items for every missing-answer pattern',()=>{
 for(let mask=0;mask<128;mask++){const a=Array.from({length:7},(_,i)=>mask&(1<<i)?1:null),n=a.filter(Boolean).length,r=scoreAAOS(a,data);assert.equal(r.valid,n);assert.equal(r.ready,n>=4);if(n>=4)assert.equal(r.displayScore,100);else assert.equal(r.displayScore,undefined);}
 const excluded=scoreAAOS([1,1,7,7,7,1,1],data);assert.equal(excluded.answered,7);assert.equal(excluded.valid,4);assert.deepEqual(excluded.missing,[3,4,5]);assert.equal(excluded.displayScore,100);
 assert.equal(scoreAAOS([1,null,7,7,7,1,1],data).ready,false);
 assert.equal(scoreAAOS([1,1,1,1,1,7,1],data).valid,7);
});
test('AAOS severity uses the rounded standardized score, never the normative score',()=>{
 const expected=[[0,'Near-total to total deficit'],[24,'Near-total to total deficit'],[25,'Severe deficit'],[49,'Severe deficit'],[50,'Moderate deficit'],[74,'Moderate deficit'],[75,'Mild deficit'],[99,'Mild deficit'],[100,'Normal']];
 for(const [n,label]of expected)assert.equal(severityFor(n,data).original,label);
 assert.equal(severityFor(round(74.5),data).original,'Mild deficit');assert.equal(round(-15.5),-16);
});
test('AAOS rejects malformed and out-of-range answers',()=>{
 for(const a of [[],null,[0,1,1,1,1,1,1],[6,1,1,1,1,1,1],[1,1,8,1,1,1,1],[1,1,1,1,1,8,1],[1,1,1,1,1,1,7],[1.5,1,1,1,1,1,1],[true,1,1,1,1,1,1],['x',1,1,1,1,1,1]])assert.throws(()=>scoreAAOS(a,data));
});
test('AAOS data preserves source options, references and merged pain-answer columns',()=>{
 assert.equal(data.questions.length,7);assert.equal(data.required,4);assert.equal(data.severity.length,5);
 for(const q of data.questions){assert.ok(q.original&&q.sourceCell);assert.equal(q.options.length,q.max);for(const o of q.options)assert.ok(o.original&&o.sourceCell);}
 for(const q of data.questions.slice(2,5)){assert.equal(q.missingCode,7);assert.equal(q.options[6].original,'Could not do because of other');assert.equal(q.options[6].sourceCell,'D9');}
});
