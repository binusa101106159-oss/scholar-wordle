const test=require('node:test'),assert=require('node:assert/strict');
const {scoreBSRS,scorePDQ}=require('../forms/forms.js');
const data=require('../forms/data.json');
test('BSRS boundaries and separate additional item',()=>{
 for(const [total,level] of [[0,'身心適應狀況良好'],[5,'身心適應狀況良好'],[6,'輕度情緒困擾'],[9,'輕度情緒困擾'],[10,'中度情緒困擾'],[14,'中度情緒困擾'],[15,'重度情緒困擾'],[20,'重度情緒困擾']]){
  let n=total;const values=Array.from({length:5},()=>{const v=Math.min(4,n);n-=v;return v;});const result=scoreBSRS([...values,4]);assert.equal(result.total,total);assert.equal(result.level,level);assert.equal(result.extra,4);
 }
 assert.equal(scoreBSRS([null,0,0,0,0,0]).ready,false);assert.throws(()=>scoreBSRS([0,0,0,0,0,5]));
});
test('PDQ preserves zero, requires actual answers, and respects all category boundaries',()=>{
 for(const [total,level] of [[0,'None'],[1,'Mild'],[70,'Mild'],[71,'Moderate'],[100,'Moderate'],[101,'Severe'],[130,'Severe'],[131,'Extreme'],[150,'Extreme']]){
  let n=total;const values=Array.from({length:15},()=>{const v=Math.min(10,n);n-=v;return v;});assert.equal(scorePDQ(values).total,total);assert.equal(scorePDQ(values).level,level);
 }
 assert.equal(scorePDQ(Array(15).fill(null)).ready,false);assert.throws(()=>scorePDQ(Array(15).fill(11)));assert.throws(()=>scorePDQ(Array(15).fill(1.5)));
});
test('patient form item counts and values remain aligned to source scoring',()=>{
 const forms=Object.fromEntries(data.forms.map(f=>[f.id,f]));assert.equal(forms.bsrs.questions.length,6);assert.equal(forms.aaos.questions.length,7);assert.equal(forms.pdq.questions.length,15);assert.equal(forms.quickdash.questions.length,11);assert.equal(forms.quickdash.pending,undefined);
 const aa=require('../calculator/aaos.json');forms.aaos.questions.forEach((q,i)=>assert.deepEqual(q.options.map(o=>o.value),aa.questions[i].options.map(o=>o.value)));
 forms.pdq.questions.forEach(q=>{assert.equal(q.options.length,11);assert.equal(q.anchors.length,2);assert.ok(q.text);assert.equal(q.original,undefined);});
});
test('copied questionnaire result lists answered items and the displayed score',()=>{
 const {buildNote}=require('../forms/forms.js');const bsrs=data.forms.find(f=>f.id==='bsrs');
 assert.equal(buildNote(bsrs,Array(6).fill(null),null),'');
 const v=[1,2,0,0,1,3],text=buildNote(bsrs,v,scoreBSRS(v));
 assert.ok(text.startsWith('BSRS-5（簡式健康量表）\n1. 睡眠困難，譬如難以入睡、易醒或早醒：輕微（1）'));assert.ok(text.includes('結果：4 / 20，身心適應狀況良好'));assert.ok(text.endsWith('附加題：3 分（不計入總分）'));
 const p=data.forms.find(f=>f.id==='pdq'),pv=Array(15).fill(null);pv[0]=0;assert.ok(buildNote(p,pv,scorePDQ(pv)).includes('尚未完成（已填 1 / 15 題），不計分。'));
});
