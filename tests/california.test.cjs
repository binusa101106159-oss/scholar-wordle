const test=require('node:test');
const assert=require('node:assert/strict');
const data=require('../calculator/california.json');
const chart=require('./fixtures/california-cvc.json');
const C=require('../calculator/california.js'),engine=C.createEngine(data);
const occupations=require('../calculator/california-occupations.json'),search=C.createSearch(data,occupations);

test('California reproduces the 17 previously verified adjustment examples',()=>{
 const examples=[
  [7,'15.03.02.01','211',51,8],[5,'15.02.02.01','230',31,4],[10,'15.03.02.01','212',43,13],
  [2,'16.03.01.00','211',38,2],[3,'16.06.04.02','322',32,4],[2,'13.02.00.00','111',25,2],
  [2,'12.03.00.00','251',38,3],[10,'17.04.10.00','470',39,17],[9,'15.03.02.01','470',39,14],
  [20,'14.01.00.00','470',39,34],[72,'12.03.00.00','221',29,81],[16,'12.03.00.00','420',47,23],
  [75,'07.01.00.00','340',42,87],[75,'07.01.00.00','360',53,89],[75,'07.01.00.00','230',51,88],
  [1,'16.05.04.00','111',49,2],[2,'17.05.10.06','214',27,2]
 ];
 for(const [wpi,number,group,age,expected] of examples)assert.equal(engine.rate({wpi,number,group,age}).final,expected);
 assert.deepEqual(engine.rate({wpi:20,number:'16.01.03.00',group:'240',age:50}),{
  wpi:20,number:'16.01.03.00',description:'16.01.03.00 Arm - Peripheral vascular',group:'240',age:50,
  rank:5,variant:'E',basis:'',fec:25,occupation:23,band:6,final:26
 });
});
test('California combination agrees with all 4950 printed official chart cells',()=>{
 let count=0;
 for(let a=1;a<=99;a++)for(let b=1;b<=a;b++){assert.equal(C.combine([b,a]).total,chart[a-1][b-1],`${a},${b}`);count++;}
 assert.equal(count,4950);
 for(const [values,result] of [[[17,14,34],53],[[3,13],16],[[3,10],13],[[5,5,5],15],[[10,5],15],[[10,30,20],50],[[0,0],0],[[100,45],100]])assert.equal(C.combine(values).total,result);
 assert.deepEqual(C.combine('17，14、34').values,[34,17,14]);
});
test('California combination follows the official multi-rating example in every input order',()=>{
 // PDRS 2005 physical p.85 example; p.14 and p.86 specify sorting and per-step rounding.
 const permutations=values=>values.length===1?[values]:values.flatMap((value,i)=>permutations(values.filter((_,at)=>at!==i)).map(rest=>[value,...rest]));
 for(const values of permutations([50,32,13,4]))assert.deepEqual(C.combine(values),{
  values:[50,32,13,4],steps:[{left:50,right:32,result:66},{left:66,right:13,result:70},{left:70,right:4,result:71}],total:71
 });
});

test('California uses complete capped lookup tables, including the rank-3 rounding boundary',()=>{
 assert.equal(engine.rate({mode:'manual',wpi:35,rank:3,variant:'F',age:39}).fec,42);
 for(let rank=1;rank<=8;rank++)for(const variant of 'CDEFGHIJ'){
  assert.equal(engine.rate({mode:'manual',wpi:0,rank,variant,age:18}).final,0);
  assert.equal(engine.rate({mode:'manual',wpi:100,rank,variant,age:100}).final,100);
 }
 for(let wpi=0;wpi<=100;wpi++)for(let rank=1;rank<=8;rank++)for(const variant of 'CDEFGHIJ'){
  const r=engine.rate({mode:'manual',wpi,rank,variant,age:39});
  assert.ok(Number.isInteger(r.final)&&r.final>=0&&r.final<=100);
  assert.equal(r.final,r.occupation); // The 37–41 band retains the occupational rating.
 }
});
test('California age bands include both endpoints without using the current age',()=>{
 for(const [age,band] of [[0,0],[21,0],[22,1],[26,1],[27,2],[31,2],[32,3],[36,3],[37,4],[41,4],[42,5],[46,5],[47,6],[51,6],[52,7],[56,7],[57,8],[61,8],[62,9],[120,9]]){
  assert.equal(engine.rate({mode:'manual',wpi:20,rank:5,variant:'H',age}).band,band);
 }
});
test('California preserves the pain and spinal-accessory cross-reference requirements',()=>{
 assert.throws(()=>engine.rate({wpi:10,number:'18.00.00.00',group:'470',age:39}),/疼痛/);
 assert.throws(()=>engine.rate({wpi:10,number:'13.07.08.00',group:'470',age:39}),/依據/);
 const allowed=engine.basisOptions('13.07.08.00').map(r=>r[0]);
 assert.ok(allowed.includes('11.03.04.00')&&allowed.includes('15.01.01.00')&&allowed.includes('16.02.01.00'));
 const r=engine.rate({wpi:10,number:'13.07.08.00',group:'470',age:39,basis:'15.01.01.00'});
 assert.equal(r.rank,2);assert.equal(r.fec,11);assert.equal(r.basis,'15.01.01.00');
 assert.throws(()=>engine.rate({wpi:10,number:'13.07.08.00',group:'470',age:39,basis:'17.04.10.00'}),/依據/);
});
test('California rejects incomplete or invalid entries instead of estimating missing values',()=>{
 const valid={wpi:10,number:'17.04.10.00',group:'470',age:39};
 for(const change of [{wpi:''},{wpi:101},{wpi:-1},{wpi:1.5},{age:''},{age:-1},{age:39.5},{number:'bad'},{group:'123'}])assert.throws(()=>engine.rate({...valid,...change}));
 for(const values of ['',[-1,2],[101],[2.5],[NaN],'20,unknown'])assert.throws(()=>C.combine(values));
 assert.throws(()=>engine.rate({mode:'manual',wpi:10,age:39,rank:9,variant:'H'}));
 assert.throws(()=>engine.rate({mode:'manual',wpi:10,age:39,rank:5,variant:'X'}));
 const r=engine.rate({mode:'manual',wpi:10,age:39,rank:5,variant:'h'});
 assert.equal(r.final,17);assert.match(C.summary(r),/FEC \(5\): 13%/);
});

test('California accepts complete Gregorian and ROC birthday formats with calendar validation',()=>{
 for(const raw of ['1986/5/6','1986-05-06','1986.05.06','1986年5月6日','19860506','民國75年5月6日','民國075/05/06','75/5/6','0750506','750506','１９８６／０５／０６'])assert.equal(C.parseDate(raw).iso,'1986-05-06',raw);
 for(const raw of ['1986/2/29','1900/2/29','2100/2/29','2026/4/31','2026/13/1','2026/0/1','0000/1/1','民國0/1/1','2026','5/6/1986','bad'])assert.equal(C.parseDate(raw),null,raw);
 assert.equal(C.parseDate('2000/2/29').iso,'2000-02-29');
});
test('California birthday age is completed years on the explicitly entered injury date',()=>{
 assert.deepEqual(C.resolveAge('39'),{age:39});
 assert.deepEqual(C.resolveAge('０'),{age:0});
 assert.equal(C.needsInjuryDate('39'),false);assert.equal(C.needsInjuryDate('1986/5/6'),true);
 assert.equal(C.resolveAge('1986/5/6','2026/5/5').age,39);
 assert.equal(C.resolveAge('1986/5/6','2026/5/6').age,40);
 assert.equal(C.resolveAge('1986/5/6','2026/5/7').age,40);
 assert.equal(C.resolveAge('2000/2/29','2023/2/28').age,22);
 assert.equal(C.resolveAge('2000/2/29','2023/3/1').age,23);
 assert.equal(C.resolveAge('2000/2/29','2024/2/29').age,24);
 assert.equal(C.resolveAge('2000/12/31','2000/12/31').age,0);
});
test('California never substitutes today for a missing injury date',()=>{
 for(const date of ['',undefined,'2026/2/30'])assert.throws(()=>C.resolveAge('1986/5/6',date),/受傷日期/);
 assert.throws(()=>C.resolveAge('1986/5/6','1986/5/5'),/早於生日/);
 assert.throws(()=>C.resolveAge('1986'),/生日/);
 assert.throws(()=>C.resolveAge(''),/年齡/);
});
test('California birthday and ROC injury dates produce the same rating and auditable clipboard dates',()=>{
 const r=engine.rate({wpi:20,number:'16.01.03.00',group:'240',age:'65/5/6',injuryDate:'115/5/6'});
 assert.equal(r.age,50);assert.equal(r.final,26);assert.equal(r.band,6);
 assert.equal(r.birthDate,'1976-05-06');assert.equal(r.injuryDate,'2026-05-06');
 assert.match(C.summary(r),/生日: 1976-05-06/);assert.match(C.summary(r),/受傷日期: 2026-05-06/);assert.match(C.summary(r),/Age \(50\): 26%/);
});
test('California accepts typed dotted or compact impairment codes and typed occupational groups',()=>{
 const expected=engine.rate({wpi:10,number:'17.04.10.00',group:'470',age:39});
 for(const number of ['17041000','１７０４１０００',' 17.04.10.00 '])assert.deepEqual(engine.rate({wpi:10,number,group:'４７０',age:39}),expected);
 assert.equal(C.normalizeNumber('17041000'),'17.04.10.00');
 assert.equal(engine.record('17041000')[0],'17.04.10.00');
 assert.throws(()=>engine.rate({wpi:10,number:'17999999',group:'470',age:39}),/Impairment No/);
});

test('California impairment search progressively narrows codes and descriptions',()=>{
 const queries=['','16','16.06','16.06.04','16.06.04.02'];
 const counts=queries.map(query=>search.numbers(query).length);
 assert.equal(counts[0],216);assert.equal(counts.at(-1),1);
 assert.ok(counts.every((n,i)=>i===0||n<=counts[i-1]));
 assert.equal(search.numbers('１６０６０４０２')[0].value,'16.06.04.02');
 assert.ok(search.numbers('FEMUR fracture').some(row=>row.value==='17.04.10.00'));
 assert.equal(search.numbers('not-an-impairment').length,0);
});
test('California occupation search retains all 1812 source rows and their exact group numbers',()=>{
 assert.equal(occupations.jobs.length,1812);
 assert.equal(occupations.pdfSha256,data.sources.pdfSha256);
 for(const [group,title,industry,page] of occupations.jobs){assert.ok(data.groups.includes(group));assert.ok(title);assert.equal(typeof industry,'string');assert.ok(page>=29&&page<=53);}
 const find=title=>occupations.jobs.find(row=>row[1]===title);
 assert.equal(find('PHYSICIAN, GENERAL PRACTITIONER')[0],'220');
 assert.equal(find('NURSE, GENERAL DUTY')[0],'311');
 assert.equal(find('INSTRUCTOR, DRIVING')[0],'251');
 assert.equal(find('INSTRUCTOR, PHYSICAL EDUCATION')[0],'390');
});
test('California job-name search supports English, Chinese search synonyms, and code prefixes',()=>{
 const english=search.jobs('mechanical engineer'),chinese=search.jobs('機械工程師');
 assert.ok(english.some(row=>row.title==='ENGINEER, MECHANICAL'&&row.group==='212'));
 assert.ok(chinese.some(row=>row.title==='ENGINEER, MECHANICAL'&&row.group==='212'));
 assert.ok(search.jobs('醫師').some(row=>row.title==='PHYSICIAN, GENERAL PRACTITIONER'&&row.group==='220'));
 assert.ok(search.jobs('護理師').some(row=>row.title==='NURSE, GENERAL DUTY'&&row.group==='311'));
 assert.ok(!search.jobs('護理師').some(row=>row.title==='MANAGER, NURSERY'));
 assert.ok(search.jobs('470').some(row=>row.kind==='group'&&row.value==='470'));
 assert.ok(search.jobs('470').every(row=>row.group==='470'));
 assert.equal(search.jobs('unrecognized occupation xyz').length,0);
 assert.ok(search.jobs('engineer').every(row=>data.groups.includes(row.group)));
});
test('California search never rates a job-name string as an inferred occupational group',()=>{
 assert.throws(()=>engine.rate({wpi:10,number:'17.04.10.00',group:'engineer',age:39}),/職業組別/);
 const choice=search.jobs('mechanical engineer').find(row=>row.title==='ENGINEER, MECHANICAL');
 assert.equal(search.job(choice.id).group,'212');
 const result={...engine.rate({wpi:10,number:'17.04.10.00',group:choice.group,age:39}),occupationTitle:choice.title,occupationIndustry:choice.industry};
 assert.match(C.summary(result),/職業: ENGINEER, MECHANICAL/);
 assert.throws(()=>C.createSearch(data,{...occupations,pdfSha256:'different'}),/版本/);
});
