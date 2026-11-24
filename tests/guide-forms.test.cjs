const test=require('node:test'),assert=require('node:assert/strict');
const {parseLine,scoreNMQ,scoreBurnout}=require('../forms/guide-forms.js');
const data=require('../forms/guide-forms.json');
const forms=Object.fromEntries(data.forms.map(f=>[f.id,f]));
const texts=form=>form.blocks.flatMap(b=>b.type==='grid'?b.cells:b.type==='line'||b.type==='p'||b.type==='h'?[b.text]:[]);
const keysOf=form=>form.blocks.flatMap(b=>{
 if(b.type==='area')return [b.key];
 if(b.type==='body')return [...b.left,...b.right].map(([k])=>'part_'+k);
 return (b.type==='grid'?b.cells:b.type==='line'?[b.text]:[]).flatMap(t=>parseLine(t).filter(p=>p.kind).map(p=>p.kind==='one'?p.key+'='+p.value:p.key));
});

test('five guide questionnaires, each traced to its guide appendix',()=>{
 assert.deepEqual(Object.keys(forms),['nmq','maternal','burnout','overload','skin']);
 assert.deepEqual(data.forms.map(f=>f.source.guide+' '+f.source.label),['plans01 附錄一 肌肉骨骼症狀調查表','plans03 附表二','plans04 附錄二','plans04 附錄三','c047 附件']);
 for(const form of data.forms){const keys=keysOf(form);assert.equal(new Set(keys).size,keys.length,form.id+' has duplicate answer keys');}
});

test('identifier fields from the paper forms are not imported',()=>{
 for(const form of data.forms){
  const body=texts(form).join('\n')+form.blocks.filter(b=>b.type==='area').map(b=>b.label).join('\n');
  for(const word of ['姓名','病歷號','住址','電話','出生日期','勞工編號','員工編號','編號:'])assert.ok(!body.includes(word),form.id+' contains '+word);
 }
});

test('line wording matches the guide text apart from removed blanks and boxes',()=>{
 const norm=s=>s.replace(/[\s□＿_]/g,'');
 // Table cells whose source wording is split over header/value rows, or "年 月 日" replaced by a date field.
 const known=new Set(['性別[r:sex:m]男[r:sex:f]女','慣用手[r:hand:l]左手[r:hand:r]右手','[c:post]分娩後（分娩日期 [d:delivery]）']);
 for(const form of data.forms){
  const source=[];const walk=x=>{if(typeof x==='string')source.push(x);else if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object')for(const [k,v] of Object.entries(x)){if(k==='text'&&typeof v==='string')source.push(v);else walk(v);}};
  walk(require('../guides/text/'+form.source.guide+'.json'));const hay=norm(source.join(''));
  for(const text of texts(form)){if(form.id==='nmq'&&known.has(text)||form.id==='maternal'&&known.has(text))continue;assert.ok(hay.includes(norm(text.replace(/\[[a-z]:[^\]]*\]/g,''))),form.id+': '+text);}
 }
});

test('parseLine labels boxes by the following words and blanks by the preceding words',()=>{
 const parts=parseLine('17.工作時有戴手套：[r:glove:yes]有[r:glove:no]無');
 assert.deepEqual(parts.filter(p=>p.kind).map(p=>[p.kind,p.key,p.value,p.label]),[['one','glove','yes','有'],['one','glove','no','無']]);
 const blank=parseLine('2.腰圍[n:waist](男性＜90公分；女性＜80公分)').find(p=>p.kind);
 assert.equal(blank.kind,'number');assert.equal(blank.label,'2.腰圍');
});

test('burnout scale follows the guide conversion, reverse item and shared band end points',()=>{
 const f=forms.burnout,answers=(p,w)=>Object.fromEntries([...p.map((v,i)=>['p'+(i+1),String(v)]),...w.map((v,i)=>['w'+(i+1),String(v)])]);
 let r=scoreBurnout(f,answers([1,1,1,1,1,1],[1,1,1,1,1,1,5]));
 assert.equal(r.personal.score,100);assert.equal(r.work.score,100);assert.deepEqual(r.personal.bands.map(b=>b.level),['嚴重']);
 r=scoreBurnout(f,answers([5,5,5,5,5,5],[5,5,5,5,5,5,1]));assert.equal(r.personal.score,0);assert.equal(r.work.score,0);assert.deepEqual(r.work.bands.map(b=>b.level),['輕微']);
 r=scoreBurnout(f,answers([3,3,3,3,3,3],[5,5,5,5,5,5,5]));assert.equal(r.personal.score,50);assert.deepEqual(r.personal.bands.map(b=>b.level),['輕微','中度']);
 assert.equal(r.work.score,100/7);
 r=scoreBurnout(f,answers([2,3,3,3,3,3],[3,3,3,3,3,3,3]));assert.ok(Math.abs(r.personal.score-1300/24)<1e-9);assert.deepEqual(r.personal.bands.map(b=>b.level),['中度']);assert.deepEqual(r.work.bands.map(b=>b.level),['中度']);
 r=scoreBurnout(f,{p1:'1'});assert.equal(r.personal.ready,false);assert.deepEqual(r.personal.missing,[2,3,4,5,6]);assert.equal(r.work.ready,false);
 assert.throws(()=>scoreBurnout(f,{p1:'6'}));
 assert.equal(f.bands.personal.length,3);assert.equal(f.bands.work.length,3);
});

test('NMQ symptom grid: 15 parts scored 0-5 and the two questionnaire rows of 表1',()=>{
 const f=forms.nmq,body=f.blocks.find(b=>b.type==='body');assert.equal(body.left.length,7);assert.equal(body.right.length,8);assert.deepEqual(body.scale,[0,1,2,3,4,5]);
 const all=v=>Object.fromEntries([...body.left,...body.right].map(([k])=>['part_'+k,v]));
 assert.equal(scoreNMQ(f,{q1:'yes',...all(2)}).status,'none');
 assert.equal(scoreNMQ(f,{q1:'yes',part_neck:3}).status,'suspect');
 assert.deepEqual(scoreNMQ(f,{q1:'yes',part_neck:3,part_lowback:5}).high,['part_neck','part_lowback']);
 assert.equal(scoreNMQ(f,{q1:'yes',part_neck:2}).status,'incomplete');
 assert.equal(scoreNMQ(f,{q1:'no'}).status,'ended');
 assert.equal(scoreNMQ(f,{...all(0)}).max,0);
 assert.throws(()=>scoreNMQ(f,{part_neck:6}));
});
