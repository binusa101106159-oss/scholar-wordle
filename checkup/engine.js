/* Approved report rules only; no patient records or historical reports. */
(function(root){
'use strict';
const ALIASES={
'T-CHO':['t-cho','tcho','tchol','total cholesterol','總膽固醇'],
'LDL-C':['ldl-c','ldl','低密度膽固醇'],'HDL-C':['hdl-c','hdl','高密度膽固醇'],
'TG':['tg','triglyceride','triglycerides','三酸甘油酯','三酸甘油脂'],
'GLU AC':['glu ac','glucose ac','空腹血糖'],'HbA1c':['hba1c','糖化血色素','糖化血紅素'],
'Insulin':['insulin','空腹胰島素','胰島素'],'胰島素阻抗':['homa-ir','homa ir','胰島素阻抗','胰島素阻抗數值'],
'BMI值':['bmi','bmi值'],'身高':['身高','height'],'體重':['體重','weight'],'腹圍':['腹圍','腰圍','waist'],
'性別':['性別','sex','gender'],'血壓收縮壓':['血壓收縮壓','sbp','收縮壓'],'血壓舒張壓':['血壓舒張壓','dbp','舒張壓'],
'HB':['hb','hemoglobin','血紅素','血色素'],'MCV':['mcv'],'WBC':['wbc'],'RBC':['rbc'],'PLT':['plt','platelet'],
'AST':['ast','sgot'],'ALT':['alt','sgpt'],'GGT':['ggt'],'ALP':['alp'],'T-BIL':['t-bil','tbil','bilirubin','總膽色素','總膽紅素'],
'UA':['ua','uric acid','尿酸'],'CRE':['cre','creatinine','血清肌酸酐'],'eGFR':['egfr','egfr (ckd-epi)'],
'IgE':['ige','免疫球蛋白e'],'HBsAg':['hbsag'],'Anti-HBs':['anti-hbs','hbsab'],
'hsTSH(CIA)':['hstsh(cia)','hstsh','tsh'],'RIA:Free T4':['ria:free t4','free t4','ft4'],
'Bacteria (Sediment)':['bacteria (sediment)','urine bacteria','尿細菌'],
'RBC (Sediment)':['rbc (sediment)','urine rbc','尿紅血球'],
'WBC (Sediment)':['wbc (sediment)','urine wbc','尿白血球'],
'WBC esterase (Dipstick)':['wbc esterase (dipstick)','leukocyte esterase','尿白血球酯酶','尿白血球酯脢'],
'O.B.(Dipstick)':['o.b.(dipstick)','urine occult blood','尿潛血'],
'Ketone(Dipstick)':['ketone(dipstick)','urine ketone','尿酮體'],
'Protein(Dipstick)':['protein(dipstick)','urine protein','尿蛋白'],
'Microalbumin':['microalbumin'],'Microalbumin/CRE(UACR)':['microalbumin/cre(uacr)','uacr'],'CRE(U)':['cre(u)'],
'Stool O.B.(EIA)':['stool o.b.(eia)','fit','糞便潛血(eia)'],
'O.B.':['o.b.'],
'右眼裸視視力':['右眼裸視視力'],'左眼裸視視力':['左眼裸視視力'],
'右眼矯正視力':['右眼矯正視力'],'左眼矯正視力':['左眼矯正視力']
};
Object.assign(ALIASES,{
'Seg':['seg','嗜中性白血球'],'Band':['band'],'Baso.':['baso.','baso'],'Eos.':['eos.','eos'],'Lym.':['lym.','lym'],'Mono.':['mono.','mono'],
'Epith. (Sediment)':['epith. (sediment)','尿上皮細胞'],
'Albumin/Creatinine(Dipstick)':['albumin/creatinine(dipstick)'],'Albumin(Dipstick)':['albumin(dipstick)'],'Creatinine(Dipstick)':['creatinine(dipstick)']});
for(const n of ["血壓收縮壓","血壓舒張壓","BMI值","腹圍","右眼裸視視力","左眼裸視視力","右眼矯正視力","左眼矯正視力","WBC","RBC","HB","HCT","MCV","MCH","MCHC","RDW-CV","PLT","Seg","Band","Lym.","Mono.","Eos.","Baso.","Aty.Lym.","Blast","Promyl.","Myelo.","Meta","Normobl.","PlasmaCell","PS","AST","ALT","ALP","GGT","T-BIL","TP","Alb","UN","CRE","eGFR","UA","GLU AC","GLU 2hr PC","HbA1c","Insulin","胰島素阻抗","T-CHO","TG","LDL-C","HDL-C","hsTSH(CIA)","RIA:Free T4","HBsAg","Anti-HBs","IgE","Alpha-Fetoprotein","Blood Lead"]){if(!ALIASES[n])ALIASES[n]=[n.toLowerCase()];if(n.endsWith('.'))ALIASES[n].push(n.slice(0,-1).toLowerCase());}
const canonical=k=>{const q=String(k).normalize('NFKC').trim().toLowerCase();for(const [name,as] of Object.entries(ALIASES))if(as.includes(q))return name;return String(k).trim();};

root.HealthcheckLogic={canonical,referenceProfile:{"id": "yang-ntuh-user-20261117", "version": "1.0", "rules": [{"field": "血壓收縮壓", "unit": "mmHg", "low": null, "high": 130, "lowInclusive": true, "highInclusive": false, "category": "Vital"}, {"field": "血壓舒張壓", "unit": "mmHg", "low": null, "high": 80, "lowInclusive": true, "highInclusive": false, "purposes": {"document_review": 80, "health_management": 85}, "category": "Vital"}, {"field": "BMI值", "unit": "kg/m²", "low": 18.5, "high": 24, "lowInclusive": true, "highInclusive": true, "category": "體位"}, {"field": "腹圍", "unit": "cm", "low": null, "high": null, "lowInclusive": true, "highInclusive": true, "sex": {"男": {"high": 90, "highInclusive": false}, "女": {"high": 80, "highInclusive": false}}, "category": "體位"}, {"field": "右眼裸視視力", "unit": "", "low": 0.7, "high": null, "lowInclusive": false, "highInclusive": true, "category": "視力"}, {"field": "左眼裸視視力", "unit": "", "low": 0.7, "high": null, "lowInclusive": false, "highInclusive": true, "category": "視力"}, {"field": "右眼矯正視力", "unit": "", "low": 0.7, "high": null, "lowInclusive": false, "highInclusive": true, "category": "視力"}, {"field": "左眼矯正視力", "unit": "", "low": 0.7, "high": null, "lowInclusive": false, "highInclusive": true, "category": "視力"}, {"field": "WBC", "unit": "10³/μL", "low": 3.25, "high": 9.16, "lowInclusive": true, "highInclusive": true}, {"field": "RBC", "unit": "10⁶/μL", "low": null, "high": null, "lowInclusive": true, "highInclusive": true, "sex": {"男": {"low": 4.21, "high": 5.9}, "女": {"low": 3.78, "high": 5.25}}}, {"field": "HB", "unit": "g/dL", "low": null, "high": null, "lowInclusive": true, "highInclusive": true, "sex": {"男": {"low": 13.1, "high": 17.2}, "女": {"low": 11, "high": 15.2}}}, {"field": "HCT", "unit": "%", "low": null, "high": null, "lowInclusive": true, "highInclusive": true, "sex": {"男": {"low": 39.6, "high": 51.5}, "女": {"low": 34.8, "high": 46.3}}}, {"field": "MCV", "unit": "fL", "low": 80.9, "high": 99.3, "lowInclusive": true, "highInclusive": true}, {"field": "MCH", "unit": "pg", "low": 25.5, "high": 33.2, "lowInclusive": true, "highInclusive": true}, {"field": "MCHC", "unit": "g/dL", "low": 31, "high": 34.9, "lowInclusive": true, "highInclusive": true}, {"field": "RDW-CV", "unit": "%", "low": 11.6, "high": 15, "lowInclusive": true, "highInclusive": true}, {"field": "PLT", "unit": "10³/μL", "low": 150, "high": 378, "lowInclusive": true, "highInclusive": true}, {"field": "Seg", "unit": "%", "low": 41.6, "high": 74.4, "lowInclusive": true, "highInclusive": true}, {"field": "Band", "unit": "%", "low": 0, "high": 5, "lowInclusive": true, "highInclusive": true}, {"field": "Lym.", "unit": "%", "low": 18, "high": 48.8, "lowInclusive": true, "highInclusive": true}, {"field": "Mono.", "unit": "%", "low": 3.3, "high": 8.9, "lowInclusive": true, "highInclusive": true}, {"field": "Eos.", "unit": "%", "low": 0.3, "high": 7.9, "lowInclusive": true, "highInclusive": true}, {"field": "Baso.", "unit": "%", "low": 0.2, "high": 1.6, "lowInclusive": true, "highInclusive": true}, {"field": "Aty.Lym.", "unit": "", "low": 0, "high": 0, "lowInclusive": true, "highInclusive": true}, {"field": "Blast", "unit": "", "low": 0, "high": 0, "lowInclusive": true, "highInclusive": true}, {"field": "Promyl.", "unit": "", "low": 0, "high": 0, "lowInclusive": true, "highInclusive": true}, {"field": "Myelo.", "unit": "", "low": 0, "high": 0, "lowInclusive": true, "highInclusive": true}, {"field": "Meta", "unit": "", "low": 0, "high": 0, "lowInclusive": true, "highInclusive": true}, {"field": "Normobl.", "unit": "", "low": 0, "high": 0, "lowInclusive": true, "highInclusive": true}, {"field": "PlasmaCell", "unit": "", "low": 0, "high": 0, "lowInclusive": true, "highInclusive": true}, {"field": "PS", "unit": "", "low": null, "high": null, "lowInclusive": true, "highInclusive": true, "notApplicable": true}, {"field": "AST", "unit": "U/L", "low": 8, "high": 31, "lowInclusive": true, "highInclusive": true}, {"field": "ALT", "unit": "U/L", "low": 0, "high": 41, "lowInclusive": true, "highInclusive": true}, {"field": "ALP", "unit": "U/L", "low": 34, "high": 104, "lowInclusive": true, "highInclusive": true}, {"field": "GGT", "unit": "U/L", "low": 9, "high": 64, "lowInclusive": true, "highInclusive": true}, {"field": "T-BIL", "unit": "mg/dL", "low": 0.3, "high": 1, "lowInclusive": true, "highInclusive": true}, {"field": "TP", "unit": "g/dL", "low": 6.4, "high": 8.9, "lowInclusive": true, "highInclusive": true}, {"field": "Alb", "unit": "g/dL", "low": 3.5, "high": 5.7, "lowInclusive": true, "highInclusive": true}, {"field": "UN", "unit": "mg/dL", "low": 7, "high": 25, "lowInclusive": true, "highInclusive": true}, {"field": "CRE", "unit": "mg/dL", "low": 0.6, "high": 1.3, "lowInclusive": true, "highInclusive": true}, {"field": "eGFR", "unit": "", "low": 90, "high": null, "lowInclusive": true, "highInclusive": true, "aliases": ["eGFR (CKD-EPI)"]}, {"field": "UA", "unit": "mg/dL", "low": null, "high": null, "lowInclusive": true, "highInclusive": true, "sex": {"男": {"low": 4.4, "high": 7.6}, "女": {"low": 2.3, "high": 6.6}}}, {"field": "GLU AC", "unit": "mg/dL", "low": 70, "high": 100, "lowInclusive": true, "highInclusive": true}, {"field": "GLU 2hr PC", "unit": "mg/dL", "low": null, "high": 140, "lowInclusive": true, "highInclusive": false}, {"field": "HbA1c", "unit": "%", "low": 4, "high": 6, "lowInclusive": true, "highInclusive": true}, {"field": "Insulin", "unit": "μU/mL", "low": 2.6, "high": 24.9, "lowInclusive": true, "highInclusive": true}, {"field": "胰島素阻抗", "unit": "", "low": null, "high": 1.4, "lowInclusive": true, "highInclusive": true}, {"field": "T-CHO", "unit": "mg/dL", "low": null, "high": 200, "lowInclusive": true, "highInclusive": false}, {"field": "TG", "unit": "mg/dL", "low": null, "high": 150, "lowInclusive": true, "highInclusive": false}, {"field": "LDL-C", "unit": "mg/dL", "low": null, "high": 130, "lowInclusive": true, "highInclusive": false}, {"field": "HDL-C", "unit": "mg/dL", "low": 40, "high": null, "lowInclusive": false, "highInclusive": true}, {"field": "hsTSH(CIA)", "unit": "μIU/mL", "low": 0.27, "high": 4.2, "lowInclusive": true, "highInclusive": true}, {"field": "RIA:Free T4", "unit": "ng/dL", "low": 0.92, "high": 1.68, "lowInclusive": true, "highInclusive": true}, {"field": "HBsAg", "unit": "COI", "low": null, "high": null, "lowInclusive": true, "highInclusive": true, "kind": "categorical", "bands": [{"label": "negative", "high": 0.9, "highInclusive": false}, {"label": "borderline", "low": 0.9, "lowInclusive": true, "high": 1, "highInclusive": false}]}, {"field": "Anti-HBs", "unit": "IU/L", "low": null, "high": null, "lowInclusive": true, "highInclusive": true, "kind": "categorical", "bands": [{"label": "negative", "high": 10, "highInclusive": false}, {"label": "positive", "low": 10, "lowInclusive": true}]}, {"field": "IgE", "unit": "IU/mL", "low": 0, "high": 160, "lowInclusive": true, "highInclusive": true, "verifiedUrl": "https://www.ntuh.gov.tw/labmed/FormDataFrame!detail.action?af=136899", "adultOnly": true}, {"field": "Alpha-Fetoprotein", "unit": "ng/mL", "low": null, "high": 20, "lowInclusive": true, "highInclusive": false}, {"field": "Blood Lead", "unit": "μg/dL", "low": null, "high": 10, "lowInclusive": true, "highInclusive": false, "intervention": {"男": {"op": ">=", "value": 40}, "女": {"op": ">=", "value": 30}}}]}};
})(typeof globalThis!=='undefined'?globalThis:this);
(function(root){
'use strict';
const A=root.HealthcheckLogic, P=JSON.parse(JSON.stringify(A.referenceProfile));
P.version='3.0';P.date='2026-11-18';P.missingUrinalysis=false;P.pending=['完整Ctrl+A格式待實例驗證','特作逐項標準尚未接入','LLM翻譯尚未串接'];
const canonicalCache=new Map();
const canonicalRaw=n=>({AFP:'Alpha-Fetoprotein','Free T4':'RIA:Free T4',FT4:'RIA:Free T4',TSH:'hsTSH(CIA)',HOMA:'胰島素阻抗','HOMA-IR':'胰島素阻抗',Lym:'Lym.',Mono:'Mono.',Eos:'Eos.',Baso:'Baso.',Myelo:'Myelo.',Promyl:'Promyl.',Normobl:'Normobl.'}[n]||A.canonical(n));
const canonical=n=>{if(!canonicalCache.has(n))canonicalCache.set(n,canonicalRaw(n));return canonicalCache.get(n);};
for(const r of P.rules){
 if(['血壓收縮壓','血壓舒張壓'].includes(r.field)){r.highInclusive=true;delete r.purposes;}
 if(r.field==='BMI值'){r.highInclusive=false;r.round=1;delete r.endpointNote;}
 if(r.field==='GLU AC'){r.high=100;r.highInclusive=false;}
 if(r.field==='HbA1c'){r.high=5.7;r.highInclusive=false;}
 if(r.field==='HBsAg'){r.bands=[{label:'negative',high:.9,highInclusive:false},{label:'positive',low:.9,lowInclusive:true}];delete r.uncovered;}
 delete r.unitNeedsConfirmation;
}
const units={'CRE(U)':'mg/dL',Microalbumin:'mg/L','Microalbumin/CRE(UACR)':'mg/g','Bacteria (Sediment)':'/HPF','Cast (Sediment)':'/LPF','Crystal (Sediment)':'/HPF','Epith. (Sediment)':'/HPF','Others (Sediment)':'','RBC (Sediment)':'/HPF','WBC (Sediment)':'/HPF','Albumin(Dipstick)':'mg/L','Albumin/Creatinine(Dipstick)':'mg/g','Creatinine(Dipstick)':'mg/dL','Protein(Dipstick)':'mg/dL','Urobil.(Dipstick)':'mg/dL'};
const urineNames=['CRE(U)','Microalbumin','Microalbumin/CRE(UACR)','Bacteria (Sediment)','Cast (Sediment)','Crystal (Sediment)','Epith. (Sediment)','Others (Sediment)','RBC (Sediment)','WBC (Sediment)','Albumin(Dipstick)','Albumin/Creatinine(Dipstick)','Bil.(Dipstick)','Creatinine(Dipstick)','Glu.(Dipstick)','Ketone(Dipstick)','Nitrite(Dipstick)','O.B.(Dipstick)','pH(Dipstick)','Protein(Dipstick)','Sp. Gr.(Dipstick)','Urobil.(Dipstick)','WBC esterase (Dipstick)'];
const labels={'Albumin/Creatinine(Dipstick)':'尿液試紙白蛋白／肌酸酐比值','HB':'血紅素','HCT':'血比容','MCV':'平均紅血球體積','MCH':'平均紅血球血紅素量','MCHC':'平均紅血球血紅素濃度','RDW-CV':'紅血球分布寬度','WBC':'白血球數目','RBC':'紅血球數目','PLT':'血小板','Seg':'嗜中性白血球','Band':'桿狀核白血球','Lym.':'淋巴球','Mono.':'單核球','Eos.':'嗜酸性白血球','Baso.':'嗜鹼性白血球','Aty.Lym.':'非典型淋巴球','Blast':'芽細胞','Promyl.':'前骨髓球','Myelo.':'骨髓球','Meta':'後骨髓球','Normobl.':'有核紅血球','PlasmaCell':'漿細胞','T-BIL':'總膽紅素','TP':'總蛋白','Alb':'白蛋白','UN':'尿素氮','CRE':'血清肌酸酐','eGFR':'腎絲球過濾率','UA':'尿酸','GLU AC':'空腹血糖','HbA1c':'糖化血色素','Insulin':'胰島素','GLU 2hr PC':'飯後兩小時血糖','hsTSH(CIA)':'促甲狀腺激素','RIA:Free T4':'游離甲狀腺素','T-CHO':'總膽固醇','TG':'三酸甘油酯','LDL-C':'低密度膽固醇','HDL-C':'高密度膽固醇','IgE':'免疫球蛋白E','Alpha-Fetoprotein':'甲型胎兒蛋白（AFP）','Blood Lead':'血鉛',Microalbumin:'尿液白蛋白濃度','Microalbumin/CRE(UACR)':'尿液白蛋白／肌酸酐比值','Albumin(Dipstick)':'尿液試紙白蛋白','Protein(Dipstick)':'尿蛋白','Glu.(Dipstick)':'尿糖','Bil.(Dipstick)':'尿膽紅素','Urobil.(Dipstick)':'尿膽素原','Others (Sediment)':'尿沉渣其他項目','Cast (Sediment)':'尿圓柱體','Crystal (Sediment)':'尿結晶','pH(Dipstick)':'尿液酸鹼值','Sp. Gr.(Dipstick)':'尿比重'};
const round1=n=>Math.round((n+Number.EPSILON)*10)/10;
const blank=s=>!s||/^(?:未做|未檢|檢驗中|拒檢|N\/A|NA|NULL|#REF!|#VALUE!|未受檢)$/i.test(s);
const negative=s=>/^(?:-|\(-\)|negative|neg|陰性|無|none|normal(?:\(<30\))?)$/i.test(s);
const trace=s=>/^(?:trace|±|\+\/-|\(\+\/-\)|\+\-)$|\(\+\/-\)/i.test(s);
const grade=s=>{let m=s.match(/([1-4])\s*\+/);return m?Number(m[1]):/^(?:\+|\(\+\)|positive|pos|陽性)$/i.test(s)?1:0;};
function normUnit(s){return String(s||'').normalize('NFKC').toLowerCase().replace(/μ|µ/g,'u').replace(/\s/g,'').replace(/×|x/g,'').replace(/\^/g,'');}
function comparableUnit(name,s){let u=normUnit(s);if(['WBC','PLT'].includes(name)&&u==='k/ul')u='103/ul';if(name==='RBC'&&u==='m/ul')u='106/ul';if(name==='Anti-HBs'&&u==='miu/ml')u='iu/l';return ({'kg/m2':'kg/m2','公分':'cm','公斤':'kg','毫米汞柱':'mmhg'})[u]||u;}
function normalCxrText(text){const parts=[];if(/heart size/i.test(text))parts.push('心臟大小正常');if(/no definite (?:active|acute) (?:lung|pulmonary) lesion/i.test(text))parts.push('無明顯活動性肺病灶');else if(/no definite (?:focal )?lung lesion|no definite detectable lung abnormality|no definite mass or patchy lesion/i.test(text))parts.push('未見明顯肺部病灶');if(/No masses, pleural thickening, or effusions/i.test(text))parts.push('未見腫塊、肋膜增厚或積液');if(/clear costophrenic angles/i.test(text))parts.push('雙側肋膈角清晰');if(/clear retrocardiac and retrosternal|clear retrosternal and retrocardiac/i.test(text))parts.push('心後與胸骨後區未見明顯異常');return '胸部X光檢查：'+(parts.length?parts.join('，'):'無明顯異常')+'。';}

function collect(input){let src=input.fields||input,fs=Object.create(null),warnings=[],context=input.context||{};
 const rows=Array.isArray(src)?src:Object.entries(src).filter(([k])=>!['context','clinical','unparsed'].includes(k)).map(([name,value])=>({name,...(value&&typeof value==='object'?value:{value})}));
 for(const x of rows){const name=canonical(x.name||''),raw=String(x.value??'').trim();if(/_g$|健康管理級|作業健康管理分級/.test(name))continue;
 if(fs[name]&&fs[name].raw!==raw&&!blank(fs[name].raw)&&!blank(raw)){warnings.push({code:'SOURCE_CONFLICT',field:name,detail:'同項目多個結果不同，保留來源，待人工確認。'});fs[name].conflict=true;continue;}
 if(!fs[name]||!blank(raw))fs[name]={...x,name,raw};}
 return {fs,warnings,context};}
function numeric(s){if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))return Number(s);return null;}
function classify(name,f,sex){const raw=f.raw,r=P.rules.find(x=>canonical(x.field)===name),unit=r?.unit||units[name]||'';
 const out={field:name,sourceName:f.sourceName||name,raw,unit:f.unit||unit,state:'unknown',reason:'尚無對應規則'};
 if(blank(raw))return {...out,state:'missing',reason:'缺值，留空'};
 if(f.conflict)return {...out,reason:'同欄來源衝突'};
 if(f.unit&&unit&&comparableUnit(name,f.unit)!==comparableUnit(name,unit))return {...out,reason:'單位不同，保留原值，不自動換算',warning:true};
 const text=raw.replace(/\s+(?:Color|Turbidity):.*$/i,'').trim(),n=numeric(text);out.number=n;
 if(name==='胰島素阻抗')return n!==null&&n>=0?{...out,state:round1(n)<=1.4?'normal':round1(n)<=1.9?'high':'high',rounded:round1(n)}:{...out,warning:true,reason:'IR格式無效，未自行計算'};
 if(name==='O.B.'||name==='Stool O.B.(EIA)'){
  if(negative(text)||/^negative\s*\(\s*<\s*\d+(?:\.\d+)?\s*\)$/i.test(text))return {...out,state:'normal'};
  if(grade(text)>0||/^positive\s*\(\s*\d+(?:\.\d+)?\s*\)$/i.test(text))return {...out,state:'positive'};
  return {...out,warning:true,reason:'糞便潛血結果格式待確認'};
 }
 if(urineNames.includes(name)){
  if(['CRE(U)','Creatinine(Dipstick)'].includes(name))return {...out,state:n!==null?'not_applicable':'unknown',reason:'不單獨判讀'};
  if(['Microalbumin','Microalbumin/CRE(UACR)'].includes(name)){
   if(/^[<＜]\s*\d/.test(text))return {...out,state:'normal',reason:'依使用者指定，小於符號結果正常'};
   return n!==null?{...out,state:n<30?'normal':'high'}:{...out,warning:true,reason:'無法辨識定量結果'};
  }
  if(name==='Albumin/Creatinine(Dipstick)'){
   if(/Dilute|過稀.*無法.*計算/i.test(text))return {...out,state:'dilute',reason:'試紙A/C無法判讀；不影響獨立定量UACR'};
   if(/^Normal\s*\(\s*[<＜]30\s*\)$/i.test(text))return {...out,state:'normal'};
   if(n!==null)return {...out,state:n<30?'normal':'high'};
   const range=text.match(/(\d+)\s*[-–]\s*(\d+)/);if(range&&Number(range[1])>=30)return {...out,state:'high'};
   return {...out,warning:true};
  }
  if(['RBC (Sediment)','WBC (Sediment)','Epith. (Sediment)'].includes(name)){
   const rg=text.match(/^(\d+)\s*[-–]\s*(\d+)$/),limit=name.startsWith('RBC')?2:5;
   if(rg)return {...out,state:Number(rg[2])<=limit?'normal':Number(rg[1])>limit?'high':'unknown',reason:Number(rg[1])<=limit&&Number(rg[2])>limit?'區間跨正常上限，待確認':'區間與指定上限比較'};
   return n!==null?{...out,state:n<=limit?'normal':'high'}:{...out,warning:true};
  }
  if(name==='Cast (Sediment)'){
   if(negative(text)||/^Hy(?:aline)?\s*\(\s*0\s*[-–]\s*2\s*\)$/i.test(text))return {...out,state:'normal'};
   if(/Hy(?:aline)?/i.test(text)){const nums=text.match(/\d+/g);if(nums)return {...out,state:Math.max(...nums.map(Number))>2?'high':'normal'};}
   return {...out,reason:'非Hyaline圓柱體未核定參考值，請人工確認',warning:true};
  }
  if(name==='Crystal (Sediment)')return {...out,state:negative(text)?'normal':'unknown',reason:negative(text)?'無結晶':'結晶種類需人工確認（含CaOX）',warning:!negative(text)};
  if(name==='Others (Sediment)')return {...out,state:negative(text)?'normal':/\+/.test(text)?'positive':'unknown'};
  if(name==='Albumin(Dipstick)')return n!==null?{...out,state:n>=30?'high':n===10?'normal':'unknown'}:{...out,warning:true};
  if(name==='pH(Dipstick)'||name==='Sp. Gr.(Dipstick)')return n!==null?{...out,state:n<(name.startsWith('pH')?5:1.003)?'low':n>(name.startsWith('pH')?8:1.035)?'high':'normal'}:{...out,warning:true};
  if(name==='Urobil.(Dipstick)')return /^[≦≤]\s*1\.5$/.test(text)?{...out,state:'normal'}:n!==null?{...out,state:n<=1.5?'normal':'high'}:{...out,warning:true};
  if(negative(text))return {...out,state:'normal'};
  if(name==='Protein(Dipstick)'&&trace(text))return {...out,state:'normal'};
  if(grade(text)>0)return {...out,state:'positive'};
  if(['Glu.(Dipstick)','O.B.(Dipstick)'].includes(name)&&trace(text))return {...out,state:'positive'};
  return {...out,reason:'此定性寫法未核定（例如本項Trace／±）',warning:true};
 }
 if(['HBsAg','Anti-HBs'].includes(name)){
  const match=text.match(/(?:[（(]\s*)?([<>≤≥]?\s*\d+(?:\.\d+)?)/),v=match?numeric(match[1].replace(/\s/g,'')):null;
  const pos=/positive|陽性|borderline/i.test(text),neg=/negative|陰性/i.test(text),numericPositive=v!==null&&v>=(name==='HBsAg'?.9:10);
  const positive=pos||numericPositive;return {...out,state:positive?'positive':neg||v!==null?'negative':'unknown',warning:neg&&numericPositive||pos&&v!==null&&!numericPositive,reason:'數值或定性任一達標即採達標；衝突另警告'};
 }
 if(!r){if(f.status&&/high|low|positive/.test(f.status))return {...out,state:f.status,reason:'來源明示異常旗標'};return out;}
 if(r.notApplicable)return {...out,state:'not_applicable'};
 if(n===null){const cm=text.match(/^([<＜≤≦>＞≥≧])\s*(\d+(?:\.\d+)?)$/);if(cm){const v=Number(cm[2]),op=cm[1],lo=r.sex?.[sex]?.low??r.low,hi=r.sex?.[sex]?.high??r.high;let state='unknown';if(/[<＜≤≦]/.test(op)){if(lo!=null&&(v<lo||v===lo&&/[<＜]/.test(op)))state='low';else if(lo==null&&hi!=null&&v<=hi)state='normal';}else {if(hi!=null&&(v>hi||v===hi&&/[>＞]/.test(op)))state='high';else if(hi==null&&lo!=null&&v>=lo)state='normal';}if(state!=='unknown')return {...out,state,reason:'依比較符號可確定的範圍判讀，未把界值冒充實測值'};}return {...out,warning:true,reason:'數字格式或比較符號待人工確認，未修正原值'};}
 const rr={...r,...(r.sex?.[sex]||{})};if(r.sex&&!r.sex[sex])return {...out,warning:true,reason:'缺性別'};
 const v=r.round===1?round1(n):n;
 let state=rr.low!=null&&(v<rr.low||v===rr.low&&rr.lowInclusive===false)?'low':rr.high!=null&&(v>rr.high||v===rr.high&&rr.highInclusive===false)?'high':'normal';
 if(f.status&&['high','low','positive'].includes(f.status)&&state==='normal')return {...out,state:f.status,warning:true,reason:'來源見紅與指定區間不同，仍列出並提示人工核對'};
 return {...out,state,reason:'依使用者核定參考值'};
}
const bloodNames=['WBC','RBC','HB','HCT','MCV','MCH','MCHC','RDW-CV','PLT','Seg','Band','Lym.','Mono.','Eos.','Baso.','Aty.Lym.','Blast','Promyl.','Myelo.','Meta','Normobl.','PlasmaCell'];
const groupLists={'血球':bloodNames,'血脂':['T-CHO','TG','HDL-C','LDL-C'],'肝膽':['AST','ALT','ALP','GGT','T-BIL','TP','Alb'],'腎臟':['UN','CRE','eGFR'],'尿酸':['UA'],'甲狀腺':['hsTSH(CIA)','RIA:Free T4'],'血糖':['GLU AC','HbA1c','Insulin','GLU 2hr PC'],'過敏':['IgE'],'AFP':['Alpha-Fetoprotein'],'重金屬':['Blood Lead']};
function generate(input,opts={}){
 const {fs,warnings,context}=collect(input),review=[...warnings],sections=[],candidateAdvice=[],traceOut=[];
 const sex=fs['性別']?.raw||'',results={};
 for(const [n,f] of Object.entries(fs))results[n]=classify(n,f,sex);
 const st=n=>results[n]?.state||'missing',num=n=>results[n]?.number??null,ab=n=>['high','low','positive'].includes(st(n)),has=n=>fs[n]&&!blank(fs[n].raw);
 const evidence=ns=>ns.filter(has).map(n=>results[n]||{field:n,raw:fs[n].raw});
 function add(id,category,text,ns,mothers=[]){if(!text)return;sections.push({ruleId:id,category,text,evidence:evidence(ns),mothers});traceOut.push({ruleId:id,selected:true,fields:ns});}
 function finding(n){const s=st(n);return (labels[n]||n)+(s==='low'?'偏低':s==='positive'?'陽性':'偏高');}
 const history=(fs['個人病史']?.raw||'').normalize('NFKC');
 const followed='建議持續於原診治醫師追蹤。';
 function historyText(pattern,label){return pattern.test(history)?'與'+label+'病史相符，'+followed:null;}
 for(const r of Object.values(results))if(r.warning||(r.state==='unknown'&&urineNames.includes(r.field)&&has(r.field)))review.push({code:'VALUE_REVIEW',field:r.field,raw:r.raw,detail:r.reason});
 if(input.unparsed?.length)review.push({code:'UNPARSED_LINES',detail:'部分貼入內容未解析，尚不能判定整份資料完整。',lines:input.unparsed});
 let body=[];const b=num('BMI值'),h=num('身高'),w=num('體重');
 let bmiBad=has('體重')&&numeric(fs['體重'].raw)===null||b!==null&&(b<=0||b>100)||h&&w&&b!==null&&Math.abs(b-w/(h/100)**2)>.25;
 if(bmiBad&&results['BMI值'])results['BMI值'].state='unknown';
 if(bmiBad)review.push({code:'BMI_FORMAT',detail:'BMI或身高體重格式／一致性有疑義，原值保留，體位句暫停。'});
 if(!bmiBad){if(st('BMI值')==='high')body.push('體重過重');if(st('BMI值')==='low')body.push('體重過輕');}
 if(ab('腹圍'))body.push('腰圍偏大');
 if(body.length)add('BODY','體重腰圍',body.join('，')+(body.includes('體重過輕')?'，請注意飲食及營養攝取。':'，請注意飲食及保持適度運動。'),['BMI值','腹圍']);
 if(ab('血壓收縮壓')||ab('血壓舒張壓'))add('BP','血壓','血壓偏高，請控制飲食，保持適度運動，若複檢血壓仍超過130/80mmHg，建議至家醫科門診追蹤檢查。',['血壓收縮壓','血壓舒張壓'],['pe.bp.13080']);
 const corrected=['右眼矯正視力','左眼矯正視力'].some(has),eyes=corrected?['右眼矯正視力','左眼矯正視力']:['右眼裸視視力','左眼裸視視力'];
 const badEyes=eyes.filter(ab);if(badEyes.length)add('VISION','視力',(badEyes.length===2?'雙眼':badEyes[0].startsWith('右')?'右眼':'左眼')+(corrected?'矯正':'裸視')+'視力異常，建議至眼科門診追蹤檢查。',eyes,['derived.vision']);
 if(has('胰島素阻抗')&&num('胰島素阻抗')!==null&&num('胰島素阻抗')>=0){const n=results['胰島素阻抗'].rounded,state=n<=1.4?'normal':n<=1.9?'mild':'marked';let t=opts.mothers?.find(m=>m.id==='homa.'+state+'.long')?.text;
  if(!t)t='胰島素阻抗數值=('+n+') (胰島素阻抗數值(IR) = [空腹血糖值GLU AC (mg/dl) x空腹胰島素值Insulin (μU/mL)]/405，<=1.4為正常；1.5~1.9為輕度；>=2為明顯)。胰島素阻抗指數'+(state==='normal'?'正常。':state==='mild'?'輕度上升。建議飲食控制與適度運動。':'明顯偏高。建議飲食控制與適度運動。');
  else t=t.replace(/^胰島素阻抗數值=\([^)]*\)/,'胰島素阻抗數值='+fs['胰島素阻抗'].raw);
  add('HOMA_'+state,'HOMA',t,['胰島素阻抗'],['homa.'+state+'.long']);}
 for(const [category,names] of Object.entries(groupLists)){
  const bad=names.filter(ab);if(!bad.length)continue;
  let txt=bad.map(finding).join('，')+'。';let advice='';let mother=[];
  if(category==='血脂'){
   txt=bad.map(finding).join('，')+'。建議控制飲食及規律運動。';
   const buckets={};for(const n of bad){const diff=n==='HDL-C'?40-num(n):num(n)-({'T-CHO':200,'TG':150,'LDL-C':130}[n]);const time=n==='TG'&&num(n)>500?'儘速':diff<10?'每年':'三個月內';(buckets[time]??=[]).push(labels[n]);}
   for(const [time,ns] of Object.entries(buckets))txt+=ns.join('、')+'建議'+time+'至家醫科或新陳代謝內科門診追蹤檢查。';
   const hx=historyText(/高血脂|脂質異常|血脂異常/,'高血脂');if(hx)txt+=hx;
  }else if(category==='血糖'){
   const highs=['GLU AC','HbA1c'].filter(n=>st(n)==='high');
   if(highs.length){const diabetic=(num('GLU AC')??0)>=126||(num('HbA1c')??0)>=6.5,which=diabetic?'糖尿病':'糖尿病前期';
    txt=bad.map(finding).join('，')+'，'+(highs.length===1&&highs[0]==='GLU AC'?'若為空腹，已達'+which+'標準。':diabetic?'已達糖尿病標準。':'為糖尿病前期。');
    const hx=historyText(/糖尿病/,'糖尿病');advice=hx||'建議控制飲食及規律運動，並於三個月內至家醫科或新陳代謝內科門診追蹤檢查。';
    if(diabetic&&!hx&&!((num('GLU AC')??0)>=126&&(num('HbA1c')??0)>=6.5))advice+='建議複檢確認。';
   }else advice='建議至家醫科或新陳代謝內科門診追蹤檢查。';mother=['glucose.high'];
  }else if(category==='血球'){
   if(st('HB')==='low'&&st('MCV')==='low'&&num('RBC')>0){const mi=num('MCV')/num('RBC');if(mi!==13){const id=mi<13?'blood.thal':'blood.iron';let mt=opts.mothers?.find(m=>m.id===id)?.text;if(mt){if(sex==='男')mt=mt.replace('月經、','');advice=mt;mother=[id];}}else review.push({code:'MENTZER_BOUNDARY',detail:'Mentzer index恰為13，保留血球異常，病因待人工判斷。'});}
   if(st('WBC')==='high'&&st('Seg')==='high'){advice+='可能為急性感染，建議儘速至感染科門診追蹤。';mother=['blood.wbc.neutrophil'];}
   else if(!advice)advice='建議至家醫科或血液科門診追蹤檢查。';
  }else if(category==='肝膽'){
   if(bad.some(n=>['AST','ALT','ALP','GGT'].includes(n)&&st(n)==='high')){advice='請六個月後複檢，如仍有異常，建議至肝膽腸胃內科門診追蹤檢查。';mother=['liver.enzyme'];}
   if(st('T-BIL')==='high'){advice+='若有皮膚、眼瞼變黃或其他不適，建議一個月內至肝膽腸胃內科門診追蹤檢查；如無不適，請定期追蹤。';mother.push('liver.bilirubin');}
   if(!advice)advice='建議至家醫科或肝膽腸胃科門診追蹤檢查。';
  }else if(category==='腎臟')advice='建議至家醫科或腎臟內科門診追蹤檢查。';
  else if(category==='尿酸'){advice=st('UA')==='high'?'請多喝水，避免暴飲暴食與高尿酸飲食，並定期追蹤檢查。若有關節紅、腫、熱、痛等發炎反應，請儘速至家醫科或風濕免疫內科門診追蹤檢查。':'建議至家醫科門診追蹤檢查。';mother=['uric.high'];}
  else if(category==='甲狀腺'){advice=historyText(/甲狀腺/,'甲狀腺疾病')||'建議三個月內至新陳代謝內科門診追蹤檢查。';review.push({code:'THYROID_URGENCY',detail:'甲狀腺異常已列出，明顯異常的儘速追蹤條件仍待醫師審閱，未預設硬切點。'});}
  else if(category==='過敏'){advice='可能有過敏體質，建議至風濕免疫科追蹤。';mother=['allergy.ige'];}
  else if(category==='AFP')advice=sex==='女'?(context.pregnant===true?'目前懷孕，請於產檢時由婦產科醫師依孕週評估。':context.pregnant===false?'建議至家醫科或肝膽腸胃科門診追蹤檢查。':'若目前懷孕，請於產檢時由婦產科醫師依孕週評估；若未懷孕，建議至家醫科或肝膽腸胃科門診追蹤檢查。'):'建議至家醫科或肝膽腸胃科門診追蹤檢查。';
  else if(category==='重金屬')advice='建議至環境及職業醫學科門診追蹤評估。';
  add('GROUP_'+category,category,txt+advice,bad,mother);
 }
 const ag=st('HBsAg'),antibody=st('Anti-HBs');
 if(ag==='positive'){const text='B型肝炎表面抗原陽性'+(antibody==='negative'?'、B型肝炎表面抗體陰性':antibody==='positive'?'、B型肝炎表面抗體陽性':'')+'，'+(historyText(/B.*肝炎|B肝/i,'B肝帶原')||'建議至家醫科或腸胃科門診追蹤諮詢。');add('HBV_POS','B肝',text,['HBsAg','Anti-HBs']);}
 else if(ag==='negative'&&antibody==='negative')add('HBV_NEGNEG','B肝','B型肝炎表面抗原陰性，B型肝炎表面抗體陰性，不具備免疫力。若工作有接觸B型肝炎病毒，建議至家醫科門診接受疫苗接種。',['HBsAg','Anti-HBs'],['hbv.negneg']);
 else if(ag==='negative'&&antibody==='positive'&&context.includeHBVImmunity===true)add('HBV_IMMUNE','B肝','B型肝炎表面抗原陰性，B型肝炎表面抗體陽性，已具備免疫力。',['HBsAg','Anti-HBs'],['derived.hbv.immune']);
 const urine=[],used=new Set();const use=ns=>ns.forEach(n=>used.add(n));
 let bleeding=[];if(ab('O.B.(Dipstick)')){bleeding.push('尿液檢驗潛血陽性反應');use(['O.B.(Dipstick)']);}if(ab('RBC (Sediment)')){bleeding.push('尿液紅血球偏高');use(['RBC (Sediment)']);}
 if(bleeding.length)urine.push(bleeding.join('，')+'。可能原因包括腎臟疾病、泌尿道結石、腎臟或泌尿道感染、惡性腫瘤等。若為非尿液之血液來源汙染且無症狀，則定期追蹤即可。若有排尿不適、腰痛、血尿等症狀，建議三個月內至腎臟內科或泌尿外科門診追蹤檢查'+(sex==='女'?'，並避開經期複檢尿液。':'。'));
 const infectionNames=['Bacteria (Sediment)','WBC (Sediment)','WBC esterase (Dipstick)','Nitrite(Dipstick)'],infl=infectionNames.filter(ab),suspect=['Bacteria (Sediment)','WBC esterase (Dipstick)','Nitrite(Dipstick)'].some(ab);
 const inflLabels={'Bacteria (Sediment)':'菌尿症','WBC (Sediment)':'尿液白血球偏高','WBC esterase (Dipstick)':'尿白血球酯酶異常','Nitrite(Dipstick)':'尿液亞硝酸鹽陽性'};
 if(infl.length){urine.push(infl.map(n=>inflLabels[n]).join('，')+'。'+(suspect?'疑為泌尿道感染。建議多喝水、少憋尿，並一個月內至腎臟內科、感染內科或泌尿外科門診追蹤檢查。':'建議多喝水、少憋尿。如有排尿不適、腰痛、發燒等症狀，建議至腎臟內科或泌尿外科門診追蹤檢查。'));use(infl);}
 if(ab('Epith. (Sediment)')){urine.push('尿上皮細胞過多，可能影響檢查結果正確性，請確實取得中段尿。');use(['Epith. (Sediment)']);}
 if(st('Albumin/Creatinine(Dipstick)')==='dilute'){urine.push('尿液過稀，無法正確計算尿液試紙白蛋白／肌酸酐比值。如有排尿不適、腰痛等症狀，請儘速至腎臟內科或泌尿外科門診追蹤檢查。');use(['Albumin/Creatinine(Dipstick)']);}
 if(ab('Ketone(Dipstick)')){urine.push('尿酮體陽性'+(st('GLU AC')==='normal'?'，但空腹血糖正常，疑似為長期空腹所致，若無不適建議定期追蹤。':'，建議至家醫科或新陳代謝內科門診追蹤檢查。'));use(['Ketone(Dipstick)']);}
 const albumin=['Microalbumin','Microalbumin/CRE(UACR)','Albumin(Dipstick)','Albumin/Creatinine(Dipstick)'].filter(ab);
 if(albumin.length){let t=albumin.map(n=>finding(n)).join('，');if(albumin.some(n=>['Microalbumin','Albumin(Dipstick)'].includes(n))&&st('Microalbumin/CRE(UACR)')==='normal')t+='，但定量尿液白蛋白／肌酸酐比值正常';urine.push(t+'，建議至家醫科或腎臟內科門診追蹤檢查。');use(albumin);}
 for(const n of urineNames)if(ab(n)&&!used.has(n)){urine.push(finding(n)+(n==='Others (Sediment)'?'（'+fs[n].raw+'）':'')+'。');use([n]);}
 if(urine.length)add('URINE_GROUP','尿液',urine.join(''),[...used],['urine.blood','urine.infection','urine.epithelial','urine.uacr.invalid','urine.ketone']);
 const stool=['O.B.','Stool O.B.(EIA)'].filter(ab);
 if(stool.length)add('STOOL_OB','糞便','糞便潛血陽性反應。建議至肝膽腸胃內科門診追蹤檢查。',stool,['stool.positive']);
 // Unknown but explicit source abnormal flags are always visible, not silently dropped.
 const usedAll=new Set(sections.flatMap(s=>s.evidence.map(e=>e.field)));
 for(const [n,r] of Object.entries(results))if(ab(n)&&!usedAll.has(n)&&!['BMI值','胰島素阻抗','HBsAg','Anti-HBs'].includes(n))add('OTHER_'+n,'其他',finding(n)+'。',[n]);
 const peFields=['右眼','左眼','辨色力','血壓是否正常','脈搏是否正常','呼吸是否正常','左耳聽力','右耳聽力','頭頸部','營養狀況','精神狀態','淋巴腺腫大','甲狀腺腫大','眼睛','耳部','鼻部','心臟聽診','四肢','胸部','腹部','皮膚','口腔黏膜','神經系統','泌尿生殖系統'];
 const abnormalPE=peFields.filter(n=>has(n)&&! /^(?:無明顯異常|正常|無|normal|unremarkable|-)$/i.test(fs[n].raw));
 if(abnormalPE.length)add('PE','PE',abnormalPE.map(n=>n+'：'+fs[n].raw).join('；')+'。',abnormalPE);
 const cxr=Object.keys(fs).filter(n=>!n.startsWith('其他檢查：')&&/Chest|CXR|胸部.*[Xx]光/.test(n));const texts=cxr.filter(has).map(n=>fs[n].raw).filter(t=>! /^(?:未受檢|未做|未檢|拒檢)$/.test(t));
 const normals=opts.cxrNormals||[];
 if(context.includeCXR!==false){
  const status=context.cxrStatus||'auto';
  if(status==='doctor_normal'){add('CXR_DOCTOR_NORMAL','CXR','胸部X光檢查：心臟大小正常，無活動性肺病變，雙側肋膈角尖銳（無明顯異常）。',cxr,['cxr.normal']);review.push({code:'CXR_PROVISIONAL_NORMAL',detail:'CXR正常內容為醫師選擇暫填，尚未依放射科報告核實；不作為自動正常判讀或學習資料。'});}
  else if(status==='not_examined'||cxr.some(n=>/^(?:未受檢|未檢|未做|拒檢|因.*未受檢)$/.test(fs[n].raw))){add('CXR_NOT_EXAMINED','CXR','胸部X光檢查：'+(context.pregnant===true?'因懷孕未受檢。':'未受檢。'),cxr);}
  else if(status==='pending'||cxr.length&&!texts.length){if(cxr.length)add('CXR_PLACEHOLDER','CXR','胸部X光檢查：',cxr);review.push({code:'CXR_PENDING',detail:'胸部X光只有檢查標題，報告尚未提供；不自動判為正常，也不等同未受檢。'});}
  else if(texts.length){
   const isNormal=texts.every(t=>normals.some(x=>x.text.replace(/\s+/g,' ').trim().toLowerCase()===t.replace(/\s+/g,' ').trim().toLowerCase()));
   if(isNormal){if(context.includeNormalCXR===true)add('CXR_NORMAL','CXR',normalCxrText(texts.join('\n')),cxr,['cxr.normal']);}
   else {const text=texts.join('\n');add('CXR_MANUAL','CXR','胸部X光檢查（待人工確認）：\n'+text,cxr);review.push({code:'CXR_MANUAL',detail:'包含異常或尚未核定的完整報告寫法，保留原文人工處理。'});if(/scoliosis|\bspur\b|osteophyte/i.test(text))candidateAdvice.push({motherId:'cxr.spine',text:'若有不適，建議至復健科門診追蹤檢查。',status:'供人工插入，不自動改寫放射科結論'});}
  }
 }
 const pendingHeadings=new Map();
 for(const n of Object.keys(fs)){
  const label=n.startsWith('其他檢查：')?n.slice(5).replace(/報告$/,''):
   /^(?:ECG Report|心電圖)/i.test(n)?'心電圖檢查':
   /^(?:Lung Function Report|肺功能)/i.test(n)?'肺功能檢查':
   /超音波/.test(n)?n.replace(/(?:檢查|報告)+$/,'')+'檢查':null;
  if(label){const fields=pendingHeadings.get(label)||[];fields.push(n);pendingHeadings.set(label,fields);}
 }
 for(const [label,fields] of pendingHeadings){
  if(fields.every(n=>!has(n))||label==='肺功能檢查')add('EXAM_PLACEHOLDER_'+label,'待人工填寫',label+'：',fields);
  else if(fields.every(n=>n.startsWith('其他檢查：'))){const text=fields.filter(has).map(n=>fs[n].raw).join('\n');add('EXAM_MANUAL_'+label,'待人工確認',label+'：\n'+text,fields);}
 }
 for(const n of Object.keys(fs).filter(n=>!n.startsWith('其他檢查：')&&/ECG Report|心電圖|超音波|sonography|ultrasound/i.test(n)))if(has(n)){add('TRANSLATE_'+n,'待翻譯',n+'（待LLM翻譯，原文保留）：\n'+fs[n].raw,[n]);review.push({code:'LLM_PENDING',detail:n+'翻譯尚未串接，不計算原文中的任何數字。'});}
 for(const [cat,list] of [['抽血',context.expectedBloodFields||[]],['尿液',context.expectedUrineFields||[]]])if(!input.unparsed?.length&&list.length&&list.every(n=>{n=canonical(n);return ['normal','not_applicable'].includes(st(n))||cat==='抽血'&&(n==='HBsAg'&&st(n)==='negative'||n==='Anti-HBs'&&st(n)==='positive');})&&!sections.some(s=>cat==='尿液'?s.category==='尿液':Object.keys(groupLists).includes(s.category)||['HOMA','B肝'].includes(s.category)&&s.ruleId!=='HOMA_normal'))add('NORMAL_'+cat,cat,cat+'檢查大致正常。',list);
 if(Object.keys(fs).some(n=>/ECG Report/.test(n)&&!has(n)))review.push({code:'ECG_PENDING',detail:'上方心電圖報告空白，待人工補入；未從檢查判讀以下成稿回讀。'});
 const agents=context.occupationalAgents||[];const grading={followup:{requested:false,level:null,status:'忽略一般健檢1／2A／2B欄位'},occupational:agents.filter(x=>! /噪音|生物/.test(x)).map(agent=>({agent,level:null,status:'精簡版標準尚未接入本版，待人工判級'})),fitness:{conclusion:null,status:'人工核定後使用「可以從事XXX作業。」'}};
 if(agents.length)review.push({code:'SPECIAL_MANUAL',detail:'特殊作業標準尚未接入，不能把歷史級數當作新判定。'});
 return {version:'0.4.0-beta',mode:'使用者核定規則',draft:sections.map(s=>s.text).join('\n'),sections,referenceResults:Object.values(results).filter(r=>P.rules.some(p=>canonical(p.field)===r.field)||urineNames.includes(r.field)||['O.B.','Stool O.B.(EIA)'].includes(r.field)),review,candidateAdvice,grading,trace:traceOut,ignoredOutputColumns:Object.keys(fs).filter(n=>/_g$/.test(n))};
}
A.generate=generate;A.classifyV03=(name,value,sex='男')=>classify(canonical(name),{raw:String(value?.value??value),unit:value?.unit,status:value?.status},sex);A.collectV03=collect;A.referenceProfile=P;A.VERSION='0.4.0-beta';A.urineNames=urineNames;A.groupLists=groupLists;
if(typeof module!=='undefined'&&module.exports)module.exports=A;
})(typeof globalThis!=='undefined'?globalThis:this);
