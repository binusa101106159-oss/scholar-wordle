const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {parseDirectScore,aaosDirect,quickDASHSeverity,scoreQuickDASH}=require('../calculator/aaos.js');
const aaos=JSON.parse(fs.readFileSync(path.join(__dirname,'..','calculator','aaos.json'),'utf8'));
const {buildNote,levelText}=require('../forms/forms.js');

test('a score typed into the result box: 0–100, decimals and full-width digits',()=>{
 assert.equal(parseDirectScore(''),null);assert.equal(parseDirectScore('  '),null);
 assert.equal(parseDirectScore('73'),73);assert.equal(parseDirectScore('０'),0);assert.equal(parseDirectScore('７３.５'),73.5);assert.equal(parseDirectScore('100'),100);
 for(const bad of ['101','-1','1e2','abc','7 3','.5','100.01'])assert.ok(Number.isNaN(parseDirectScore(bad)),bad);
});
test('QuickDASH typed score → AMA 6th Table 15-7 grade modifier',()=>{
 const g=n=>[quickDASHSeverity(n).label,quickDASHSeverity(n).grade];
 assert.deepEqual(g(0),['No problem',0]);assert.deepEqual(g(20),['No problem',0]);assert.deepEqual(g(20.4),['No problem',0]);
 assert.deepEqual(g(20.5),['Mild',1]);assert.deepEqual(g(40),['Mild',1]);assert.deepEqual(g(41),['Moderate',2]);
 assert.deepEqual(g(60),['Moderate',2]);assert.deepEqual(g(61),['Severe',3]);assert.deepEqual(g(80),['Severe',3]);assert.deepEqual(g(81),['Very severe',4]);assert.deepEqual(g(100),['Very severe',4]);
});
test('AAOS typed score → the same bands as the calculated score',()=>{
 const g=n=>[aaosDirect(n,aaos).original,aaosDirect(n,aaos).grade];
 assert.deepEqual(g(100),['Normal',0]);assert.deepEqual(g(99.5),['Normal',0]);assert.deepEqual(g(99),['Mild deficit',1]);assert.deepEqual(g(75),['Mild deficit',1]);
 assert.deepEqual(g(74),['Moderate deficit',2]);assert.deepEqual(g(50),['Moderate deficit',2]);assert.deepEqual(g(49),['Severe deficit',3]);assert.deepEqual(g(25),['Severe deficit',3]);assert.deepEqual(g(24),['Near-total to total deficit',4]);assert.deepEqual(g(0),['Near-total to total deficit',4]);
});
test('表單 AAOS shows its band with the grade modifier',()=>{
 const {scoreAAOS}=require('../calculator/aaos.js'),forms=require('../forms/data.json');
 const r=scoreAAOS(Array(7).fill('3'),aaos);assert.equal(levelText(r),r.severity.original+' · GM '+r.severity.grade);
});
test('表單 QuickDASH shows the AMA level (mild / moderate / severe) on screen and in the copied note',()=>{
 const form={id:'quickdash',name:'QuickDASH',subtitle:'上肢功能受損程度問卷（簡短版）',questions:Array.from({length:11},(_,i)=>({text:'Q'+(i+1),options:[1,2,3,4,5].map(v=>({value:v,label:String(v)}))}))};
 const levels=[[1,'No problem · GM 0'],[2,'Mild · GM 1'],[3,'Moderate · GM 2'],[4,'Severe · GM 3'],[5,'Very severe · GM 4']];
 for(const [v,text] of levels){
  const values=Array(11).fill(v),calc=scoreQuickDASH(values);
  assert.equal(levelText(calc),text);
  assert.match(buildNote(form,values,calc),new RegExp('結果：'+calc.score+' / 100，'+text));
 }
 assert.equal(levelText({level:'Mild'}),'Mild');assert.equal(levelText({severity:{original:'Normal'}}),'Normal');assert.equal(levelText({severity:{original:'Moderate deficit',label:'中度缺損',grade:2}}),'Moderate deficit · GM 2');assert.equal(levelText({}),'');
});
