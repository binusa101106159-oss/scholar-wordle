/* NTUH Ctrl+A adapter. Read source checks only, never the report/editor below 檢查判讀. */
(function(root){
 'use strict';const A=root.HealthcheckLogic;
 const extra=['BMI','性別','年齡','身高','體重','Ideal Weight','個人病史','家族病史','受傷','工作開始時間','現在工作性質','過去工作開始時間1','過去工作開始時間2','過去工作開始時間3','過去工作性質1','過去工作性質2','過去工作性質3','過去1個月，平均每週工時為','過去6個月，平均每週工時為','工作日期間，平均每天睡眠時間為','現在危害暴露','現在防護用具','過去危害暴露1','過去危害暴露2','過去危害暴露3','過去防護用具1','過去防護用具2','過去防護用具3','吸菸','飲酒','吃檳榔','脈搏','是否長期服藥','長期服藥原因','長期用藥原因','頭頸部','營養狀況','精神狀態','淋巴腺腫大','甲狀腺腫大','眼睛','耳部','鼻部','心臟聽診','四肢','胸部','腹部','皮膚','口腔黏膜','神經系統','泌尿生殖系統','右眼','左眼','辨色力','血壓是否正常','脈搏是否正常','呼吸是否正常','左耳聽力','右耳聽力','B型肝炎檢驗','eGFR (MDRD)','eGFR (CKD-EPI)','Chest : PA View (Standing)','Chest :  Lateral Right','CXR','胸部X光','Lung Function Report','ECG Report','超音波','腹部超音波報告','Stool O.B.(EIA)','O.B.','Paras Ova'];
 const sourceNames=[...new Set([...A.referenceProfile.rules.map(r=>r.field),...A.urineNames,...extra])].sort((a,b)=>b.length-a.length);
 const key=s=>String(s).normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase(),known=new Map(sourceNames.map(n=>[key(n),n]));
 const canonical=s=>A.canonical(known.get(key(s))||s),recognized=s=>sourceNames.some(n=>key(n)===key(s))||sourceNames.includes(canonical(s));
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
 const pairPattern=new RegExp('(^|\\t+| {2,})('+sourceNames.map(escape).join('|')+')(?=\\t| {2,}|$)','gi');
 const unitPattern=/^(?:mg\/dL|mg\/L|mg\/g|mmol\/L|g\/dL|g\/L|U\/L|IU\/L|IU\/mL|mIU\/mL|ng\/mL|ng\/dL|[μµu]IU\/mL|[μµu]U\/mL|[μµu]g\/dL|mmHg|毫米汞柱|fL|pg|%|COI|\/(?:HPF|LPF)|[kM]\/\s*[μµu]L|(?:[×x]\s*)?10[³⁶⁹^0-9]+\s*\/[μµu]L|mL\/min\/1\.73\s*m(?:\^?2|²)|kg\/m(?:\^?2|²)|cm|kg|公分|公斤)$/i;
 const bloodNames=new Set([...Object.values(A.groupLists).flat(),'HBsAg','Anti-HBs','胰島素阻抗']);
 const peNames=new Set(['右眼','左眼','辨色力','血壓是否正常','脈搏是否正常','呼吸是否正常','左耳聽力','右耳聽力','頭頸部','營養狀況','精神狀態','淋巴腺腫大','甲狀腺腫大','眼睛','耳部','鼻部','心臟聽診','四肢','胸部','腹部','皮膚','口腔黏膜','神經系統','泌尿生殖系統']);
 function imageKind(name){const q=key(name);return /^chest\s*:|^cxr$|胸部.*x光/.test(q)?'CXR':q==='ecg report'?'ECG':q==='lung function report'?'PFT':/超音波/.test(name)?'SONO':null;}
 function finalize(fields,unparsed,metadata,context={}){
  // Repeated personal/family history cells are additive, not conflicting numerical results.
  for(const name of ['個人病史','家族病史','長期服藥原因','長期用藥原因']){const rows=fields.filter(f=>f.name===name);if(rows.length>1){const values=[...new Set(rows.map(f=>String(f.value).trim()).filter(Boolean))];fields=fields.filter(f=>f.name!==name);fields.push({name,value:values.join('、')});}}
  const names=[...new Set(fields.map(f=>f.name))],blood=names.filter(n=>bloodNames.has(n)),urine=names.filter(n=>A.urineNames.includes(n)),pe=names.filter(n=>peNames.has(n));
  const imaging=fields.filter(f=>imageKind(f.name)).map(f=>({field:f.name,kind:imageKind(f.name),state:/^(?:未受檢|未檢|未做|拒檢|因.*未受檢)$/.test(String(f.value).trim())?'not_examined':String(f.value).trim()?'reported':'pending_report'}));
  metadata.inventory={blood,urine,pe,imaging};
  return {fields,unparsed,metadata,context:{...context,expectedBloodFields:blood,expectedUrineFields:urine,inventory:metadata.inventory}};
 }
 function parse(text){
  text=String(text||'').trim();if(!text)return finalize([],[],{format:'empty',cutoffApplied:false});
  if(/^[\[{]/.test(text)){const value=JSON.parse(text);if(!value||typeof value!=='object')throw Error('JSON必須為欄位物件或陣列。');const src=Array.isArray(value)?value:value.fields||Object.fromEntries(Object.entries(value).filter(([n])=>n!=='context'));const fields=Array.isArray(src)?src.map(f=>({...f,name:canonical(f.name)})):Object.entries(src).map(([name,value])=>({name:canonical(name),...(value&&typeof value==='object'?value:{value})}));return finalize(fields,[],{format:'json',cutoffApplied:false},value.context||{});}
  const all=text.split(/\r?\n/),cut=all.findIndex(l=>/^\s*檢查判讀\s*$/.test(l));
  const above=cut<0?all:all.slice(0,cut),start=above.findIndex(l=>/^\s*報告結果\s*$/.test(l));
  const lines=start<0?above:above.slice(start+1),fields=[],unparsed=[],metadata={format:start>=0?'ntuh-ctrl-a':'labeled-rows',cutoffApplied:cut>=0,ignoredTrailingLines:cut<0?0:all.length-cut,cutoffLine:cut<0?null:cut+1};
  const header=above.slice(0,start<0?0:start).join('\n'),gender=header.match(/\(\s*([FM])\s*,/i);if(gender)fields.push({name:'性別',value:gender[1].toUpperCase()==='F'?'女':'男'});
  let pending=null,imaging=null,imagingLines=[];
  function flushImage(){if(!imaging)return;let value=imagingLines.join('\n').trim().replace(/\s*檢查者\s*[:：][\s\S]*$/,'').trim();fields.push({name:imaging,value});imaging=null;imagingLines=[];}
  function add(name,segment){
   const sourceName=name;name=canonical(name);if(name==='PS')return;
   const cells=segment.trim().split(/\t+| {2,}/).map(s=>s.trim()),first=cells.shift()||'';
   let value=first,unit,referenceRaw,status;
   if(unitPattern.test(first)){value='';unit=first;}else if(cells.length&&unitPattern.test(cells[0]))unit=cells.shift();else if(cells[0]==='*')cells.shift();
   if(cells.length)referenceRaw=cells.filter(s=>! /^(?:H|L)$/i.test(s)).join(' ');if((bloodNames.has(name)||A.urineNames.includes(name))&&cells.filter(s=>s&&!/^(?:H|L)$/i.test(s)).length>1)unparsed.push(name+'後有額外未辨識欄位：'+cells.join(' | '));status=cells.find(s=>/^(?:H|L)$/i.test(s));
   if(bloodNames.has(name)||A.urineNames.includes(name)||A.referenceProfile.rules.some(r=>r.field===name)){
    const m=value.match(/^(.*?)(?:\s+([HL]))?(?:\s+((?:mg|mmol|g|ng|IU|mIU|[μµu]IU|[μµu]U|[μµu]g)\/(?:dL|mL|L|g)|mmHg|fL|pg|%|COI))?(?:\s+([HL]))?$/i);if(m){value=m[1];status=status||m[2]||m[4];unit=unit||m[3];}
   }
   const f={name,value,sourceName};if(unit)f.unit=unit;if(referenceRaw)f.referenceRaw=referenceRaw;if(status)f.status=status.toUpperCase()==='H'?'high':'low';fields.push(f);
  }
  for(const raw of lines){const line=raw.trim();if(!line)continue;
   if(/^項目名稱\s+(?:檢查值|檢驗值)|^X光暨其他檢查之純文字報告$/.test(line)){flushImage();continue;}
   if(recognized(line)&&imageKind(known.get(key(line))||line)){flushImage();imaging=known.get(key(line))||line;continue;}
   if(!imaging&&recognized(line)){if(pending)add(pending,'');pending=canonical(line);continue;}
   const matches=[...line.matchAll(pairPattern)];
   if(imaging&&!matches.length){imagingLines.push(line);continue;}
   if(matches.length){flushImage();if(pending)add(pending,'');pending=null;for(let i=0;i<matches.length;i++){const m=matches[i],begin=m.index+m[0].length,end=matches[i+1]?.index??line.length;add(m[2],line.slice(begin,end));}continue;}
   if(recognized(line)){if(pending)add(pending,'');pending=canonical(line);continue;}
   const split=line.match(/^(.+?)\s*[:：=]\s*(.*)$/);if(split&&recognized(split[1])){if(pending)add(pending,'');pending=null;add(split[1],split[2]);continue;}
   let simple=false;for(const n of sourceNames){const m=line.match(new RegExp('^'+escape(n)+'\\s+(.+)$','i'));if(m){if(pending)add(pending,'');pending=null;add(n,m[1]);simple=true;break;}}if(simple)continue;
   if(pending){add(pending,line);pending=null;continue;}
   if(!/^(?:姓名|病歷號|身分證|檢驗項目|參考值|檢查結果|單位)/.test(line))unparsed.push(line);
  }
  flushImage();if(pending)add(pending,'');return finalize(fields,unparsed,metadata);
 }
 A.parseBetaInput=parse;if(typeof module!=='undefined'&&module.exports)module.exports={parse};
})(typeof globalThis!=='undefined'?globalThis:this);
