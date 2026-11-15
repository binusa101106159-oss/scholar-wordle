'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {convert,integer}=require('../calculator/impairment.js'),data=require('../calculator/impairment.json');
test('conversion data matches the actual imported source rows',()=>{
 const fs=require('node:fs'),crypto=require('node:crypto');
 for(const [id,meta]of Object.entries(data.sourceTables)){
  const chapter=id.startsWith('t16')?'c16':'c15',source=JSON.parse(fs.readFileSync(require.resolve('../ama/'+chapter+'.json'),'utf8')).attachments.find(a=>a.id===id);
  assert.equal(crypto.createHash('sha256').update(source.html).digest('hex'),meta.htmlSHA256,id+' source changed; rebuild conversion data');
  for(const tr of source.html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)||[]){
   const row=[...tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m=>m[1].replace(/<[^>]*>/g,'').trim());
   if(!row.length||!row[0]||!row.every(s=>!s||/^\d+$/.test(s)))continue;
   if(id==='t15-12'&&row.length===10)assert.deepEqual(data.digit[+row[0]],row.slice(1).map(Number));
   if(id==='t15-11'&&row.length===6&&row[1])assert.equal(data.ueiToWpi[+row[1]],+row[0]);
   if(id==='t16-10'&&row.length===5&&row[1])assert.equal(data.leiToWpi[+row[1]],+row[0]);
  }
 }
});
test('every printed digit conversion preserves its three source values and missing row',()=>{
 for(const [digit,col]of [['thumb',0],['index',3],['middle',3],['ring',6],['little',6]])for(let value=0;value<=100;value++){
  if(value===32){assert.throws(()=>convert(data,{unit:'DI',value,digit}),/缺少 32/);continue;}
  const r=convert(data,{unit:'DI',value,digit});assert.deepEqual([r.values.HI,r.values.UEI,r.values.WPI],data.digit[value].slice(col,col+3));
 }
 assert.deepEqual(data.digitMissingRows,[32]);assert.deepEqual(data.digitRepeatedRows,[21]);
});
test('direct digit table and stepwise rounding remain explicitly different paths',()=>{
 const book=convert(data,{unit:'DI',value:45,digit:'little',mode:'table'}),steps=convert(data,{unit:'DI',value:45,digit:'little',mode:'stepwise'});
 assert.deepEqual(book.values,{DI:45,HI:5,UEI:4,WPI:2});assert.deepEqual(steps.values,{DI:45,HI:5,UEI:5,WPI:3});
 assert.equal(convert(data,{unit:'DI',value:28,digit:'ring'}).values.WPI,2,'do not use the approximate 5% column multiplier');
});
test('upper and lower conversion covers all source rows, including the 1 LEI exception',()=>{
 for(let value=0;value<=100;value++){
  assert.equal(convert(data,{unit:'UEI',value}).values.WPI,data.ueiToWpi[value]);
  assert.equal(convert(data,{unit:'LEI',value}).values.WPI,data.leiToWpi[value]);
  const hi=convert(data,{unit:'HI',value});assert.equal(hi.values.UEI,Math.floor((value*9+5)/10));assert.equal(hi.values.WPI,data.ueiToWpi[hi.values.UEI]);
 }
 assert.equal(convert(data,{unit:'LEI',value:1}).values.WPI,1);
 assert.deepEqual(convert(data,{unit:'DI',value:100,digit:'thumb'}).values,{DI:100,HI:40,UEI:36,WPI:22});
});
test('empty, fractional, out-of-range and unsupported unit inputs are never silently converted',()=>{
 for(const value of ['',null,true,-1,101,1.2,'12x'])assert.throws(()=>convert(data,{unit:'UEI',value}));
 assert.throws(()=>convert(data,{unit:'DI',value:10}),/手指/);assert.throws(()=>convert(data,{unit:'WPI',value:10}),/單位/);
 assert.equal(integer('１００'),100);assert.equal(integer('0'),0);
});
