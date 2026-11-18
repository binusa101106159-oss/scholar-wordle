const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../checkup/engine.js');require('../checkup/parser.js');
const opts={mothers:require('../checkup/snippets.json').snippets,cxrNormals:require('../checkup/normal-cxr.json')};
// Entirely fictional layout fixtures: no patient records are committed.
const full=`導覽\nQA(F,2000/01/01,26y)\n報告結果
項目名稱 檢查值 單位 項目名稱 檢查值 單位
BMI  21.5  kg/m^2  Ideal Weight  45 ≦理想體重﹤60  kg
受傷  無    個人病史  高血脂
個人病史  過敏性疾病    家族病史  糖尿病
家族病史  高血壓    現在危害暴露  無
身高  160  公分  體重  55  公斤
血壓收縮壓  120  毫米汞柱  血壓舒張壓  76  毫米汞柱
左眼裸視視力      右眼裸視視力
左眼矯正視力  1.0    右眼矯正視力  0.9
甲狀腺腫大  無明顯異常    泌尿生殖系統  未檢
胰島素阻抗  1.1    是否長期服藥  無
項目名稱 檢驗值 單位 參考標準 項目名稱 檢驗值 單位 參考標準
Microalbumin/CRE(UACR)  <8.0  mg/g    CRE(U)  110  mg/dL
Microalbumin  <7.0  mg/L
Epith. (Sediment)  0-2  /HPF  0-5  RBC (Sediment)  0-2  /HPF  0-2
pH(Dipstick)  6.0 Turbidity:-  *  5.0-8.0  Protein(Dipstick)  -  mg/dL  -
Sp. Gr.(Dipstick)  1.015 Color:Yellow  *  1.003-1.035
HB  13.5  g/dL  11.0-15.2  HCT  41.0  %  34.8-46.3
PS  -      RBC  4.6  M/μL  3.78-5.25
WBC  5.8  k/μL  3.25-9.16  PLT  240  k/μL  150-378
PS  Auto DC      Promyl.  0.0  %  0-0
CRE  0.9  mg/dL  0.6-1.3  eGFR (MDRD)  89  mL/min/1.73 m^2  60-9999
eGFR (CKD-EPI)  94  mL/min/1.73 m^2  60-9999
GLU AC  88  mg/dL  70-100
HbA1c  5.1  %  4.0-6.0
HBsAg  Negative
Anti-HBs  Positive(100)  mIU/mL
X光暨其他檢查之純文字報告
Chest : PA View (Standing)
Chest PA/AP plain film shows: no definite focal lung lesions are noted.
Lung Function Report
ECG Report
腹部超音波報告
Diagnosis : normal study.
Note : routine follow up. 檢查者: / / QA醫師
檢查判讀
醫師總評
GLU AC  999  mg/dL
心電圖：下方舊成稿不能讀入。
一般肺量測定：FEV1=9.99公升。
常用罐頭語彙
選  糖尿病罐頭  刪`;
const sparse=`QA(F,2000/01/01,26y)\n報告結果
項目名稱 檢查值 單位 項目名稱 檢查值 單位
個人病史  無    家族病史  乳癌
血壓收縮壓  123  毫米汞柱  血壓舒張壓  79  毫米汞柱
左眼矯正視力  1.0    右眼矯正視力  0.9
項目名稱 檢驗值 單位 參考標準 項目名稱 檢驗值 單位 參考標準
RBC (Sediment)  3-5  /HPF  0-2  WBC (Sediment)  3-5  /HPF  0-5
Bacteria (Sediment)  +  *  -
O.B.(Dipstick)  +/-  *  -  WBC esterase (Dipstick)  3+  *  -
T-CHO  225  mg/dL  0-199
TG  65  mg/dL  0-149
CRE  0.85  mg/dL  0.6-1.3  eGFR (CKD-EPI)  102  mL/min/1.73 m^2  60-9999
LDL-C  135  mg/dL  0-129
X光暨其他檢查之純文字報告
Chest : PA View (Standing)
檢查判讀
醫師總評
胸部X光檢查：正常，只有下方舊成稿有這句。`;
const fields=p=>Object.fromEntries(p.fields.map(f=>[f.name,f]));
test('Ctrl+A cuts before report editor, grading choices and phrase catalog',()=>{const p=A.parseBetaInput(full),f=fields(p);assert(p.metadata.cutoffApplied);assert.equal(p.unparsed.length,0);assert.equal(f['GLU AC'].value,'88');assert(!JSON.stringify(p).includes('下方舊成稿'));assert(!JSON.stringify(p).includes('9.99'));assert.equal(f['性別'].value,'女');assert(!JSON.stringify(p).includes('2000/01/01'));});
test('two-column value/unit/reference cells stay attached to their own label',()=>{const f=fields(A.parseBetaInput(full));assert.equal(f.HB.value,'13.5');assert.equal(f.HCT.value,'41.0');assert.equal(f.HCT.referenceRaw,'34.8-46.3');assert.equal(f['pH(Dipstick)'].value,'6.0 Turbidity:-');assert.equal(f['Sp. Gr.(Dipstick)'].value,'1.015 Color:Yellow');assert.equal(f['右眼裸視視力'].value,'');assert.equal(f['右眼矯正視力'].value,'0.9');});
test('repeated history is additive; differential metadata does not create PS conflicts',()=>{const p=A.parseBetaInput(full),f=fields(p);assert.equal(f['個人病史'].value,'高血脂、過敏性疾病');assert.equal(f['家族病史'].value,'糖尿病、高血壓');assert(!f.PS);const o=A.generate(p,opts);assert(!o.review.some(r=>r.code==='SOURCE_CONFLICT'));assert.doesNotMatch(o.draft,/與糖尿病病史相符/);});
test('equivalent source unit spellings do not rescale values or block valid fields',()=>{const p=A.parseBetaInput(full),o=A.generate(p,opts);assert(!o.review.some(r=>['BMI值','WBC','PLT','RBC','Anti-HBs','身高','體重','血壓收縮壓'].includes(r.field)));assert.equal(fields(p).RBC.value,'4.6');assert.equal(fields(p)['eGFR (MDRD)'].value,'89');assert.equal(fields(p).eGFR.value,'94');});
test('imaging headings delimit separate source blocks without leaking doctor identifiers',()=>{const p=A.parseBetaInput(full),f=fields(p);assert.equal(f['ECG Report'].value,'');assert.equal(f['Lung Function Report'].value,'');assert.match(f['腹部超音波報告'].value,/Diagnosis : normal study/);assert(!f['腹部超音波報告'].value.includes('QA醫師'));const o=A.generate(p,opts);assert(o.review.some(r=>r.code==='ECG_PENDING'));assert(!o.draft.includes('9.99'));});
test('per-patient inventory never creates absent HOMA, HbA1c, HBV or urine quantitative tests',()=>{const p=A.parseBetaInput(sparse),f=fields(p);assert(p.metadata.inventory.blood.length<A.parseBetaInput(full).metadata.inventory.blood.length);for(const n of ['HbA1c','HBsAg','Anti-HBs','胰島素阻抗','Microalbumin'])assert(!f[n]);const o=A.generate(p,opts);assert.doesNotMatch(o.draft,/胰島素阻抗|糖化血色素|表面抗原|白蛋白濃度/);assert.match(o.draft,/尿白血球酯酶異常/);assert.doesNotMatch(o.draft,/尿液白血球偏高/);});
test('empty CXR is pending, and cannot inherit the normal sentence below cutoff',()=>{const p=A.parseBetaInput(sparse),o=A.generate(p,opts);assert(o.review.some(r=>r.code==='CXR_PENDING'));assert.match(o.draft,/^胸部X光檢查：$/m);assert.doesNotMatch(o.draft,/未受檢/);assert.equal(p.metadata.inventory.imaging[0].state,'pending_report');});
test('only explicit physician normal override emits provisional normal CXR with warning',()=>{const p=A.parseBetaInput(sparse),o=A.generate({...p,context:{...p.context,cxrStatus:'doctor_normal'}},opts);assert.match(o.draft,/胸部X光檢查：心臟大小正常/);assert(o.review.some(r=>r.code==='CXR_PROVISIONAL_NORMAL'));assert.match(A.generate({...p,context:{...p.context,cxrStatus:'not_examined'}},opts).draft,/未受檢/);});
test('normal CXR translation cannot add heart-size findings absent from source',()=>{const p=A.parseBetaInput(full),o=A.generate({...p,context:{...p.context,includeNormalCXR:true,includeHBVImmunity:true}},opts);const cxr=o.sections.find(s=>s.ruleId==='CXR_NORMAL');assert.match(cxr.text,/未見明顯肺部病灶/);assert.doesNotMatch(cxr.text,/心臟大小/);assert.match(o.draft,/已具備免疫力/);});
test('normal summaries are scoped to the actual provided panel, not a fixed test list',()=>{const p=A.parseBetaInput('報告結果\nGLU AC  90  mg/dL  70-100\nALT  20  U/L  0-41\n檢查判讀\nHbA1c  10  %');const o=A.generate(p,opts);assert.match(o.draft,/抽血檢查大致正常/);assert(!p.metadata.inventory.blood.includes('HbA1c'));});
test('an unknown right-side test is flagged rather than silently absorbed into a reference cell',()=>{const p=A.parseBetaInput('報告結果\nALT  20  U/L  0-41  MysteryCheck  999  mg/dL  0-100\n檢查判讀');assert(p.unparsed.length>0);assert.doesNotMatch(A.generate(p,opts).draft,/大致正常/);});
module.exports={full,sparse};

test('copied empty exam headings appear as blank lines without borrowing report text',()=>{
 const p=A.parseBetaInput('報告結果\nChest : PA View (Standing)\nECG Report\n腹部超音波報告\n乳房超音波檢查：\n甲狀腺超音波報告\nLung Function Report\n檢查判讀\n心臟超音波報告');
 assert.deepEqual(A.generate(p,opts).draft.split('\n'),['胸部X光檢查：','心電圖檢查：','腹部超音波檢查：','乳房超音波檢查：','甲狀腺超音波檢查：','肺功能檢查：']);
});
