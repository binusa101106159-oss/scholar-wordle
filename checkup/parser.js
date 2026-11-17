/* Labeled rows / TSV / JSON adapter. Full hospital Ctrl+A format awaits a sample. */
(function(root){
 'use strict';const A=root.HealthcheckLogic;
 const extra=['性別','年齡','身高','體重','個人病史','家族病史','是否長期服藥','長期服藥原因','長期用藥原因','頭頸部','營養狀況','精神狀態','淋巴腺腫大','甲狀腺腫大','眼睛','耳部','鼻部','心臟聽診','四肢','胸部','腹部','皮膚','口腔黏膜','神經系統','泌尿生殖系統','Chest : PA View (Standing)','Chest :  Lateral Right','CXR','胸部X光','ECG Report','超音波','Stool O.B.(EIA)','O.B.'];
 const names=[...new Set([...A.referenceProfile.rules.map(r=>r.field),...A.urineNames,...extra])].sort((a,b)=>b.length-a.length),key=s=>String(s).normalize('NFKC').replace(/\s+/g,' ').trim().toLowerCase(),known=new Map(names.map(n=>[key(n),n]));
 const canonical=s=>known.get(key(s))||A.canonical(s),recognized=s=>names.includes(canonical(s));
 function parse(text){
  text=String(text||'').trim();if(!text)return {fields:[],unparsed:[]};
  if(/^[\[{]/.test(text)){const v=JSON.parse(text);if(!v||typeof v!=='object')throw Error('JSON必須為欄位物件或陣列。');return Array.isArray(v)?{fields:v,unparsed:[]}:v;}
  const fields=[],unparsed=[];let pending=null;
  for(const raw of text.split(/\r?\n/)){const line=raw.trim();if(!line)continue;let name=null,value=null,tail=[];const cols=line.split(/\t+/).map(s=>s.trim());
   if(cols.length>=2&&recognized(cols[0])){name=canonical(cols[0]);value=cols[1];tail=cols.slice(2);}
   else if(recognized(line)){pending=canonical(line);continue;}
   else {for(const n of names){const rx=new RegExp('^'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+')+'(?:\\s*[:：=]\\s*|\\s+)(.*)$','i'),m=line.match(rx);if(m){name=n;value=m[1].trim();break;}}
    if(!name){const m=line.match(/^([^：=]+)\s*[:：=]\s*(.*)$/);if(m&&recognized(m[1])){name=canonical(m[1]);value=m[2];}}
    if(!name&&pending){name=pending;value=line;pending=null;}}
   if(!name){if(!/^(?:姓名|病歷號|身分證|檢驗項目|參考值|檢查結果|單位)/.test(line))unparsed.push(line);continue;}pending=null;
   let status=tail.find(t=>/^[HL]$/i.test(t)),unit=tail.find(t=>/^(?:mg\/dL|mg\/L|mg\/g|mmol\/L|g\/dL|U\/L|IU\/L|ng\/mL|ng\/dL|[μµu]IU\/mL|[μµu]U\/mL|[μµu]g\/dL|mmHg|fL|pg|%|COI|\/(?:HPF|LPF))$/i.test(t));
   if(A.referenceProfile.rules.some(r=>canonical(r.field)===name)||A.urineNames.includes(name)){const m=value.match(/^(.*?)(?:\s+([HL]))?(?:\s+(mg\/dL|mg\/L|mg\/g|mmol\/L|g\/dL|U\/L|IU\/L|ng\/mL|ng\/dL|[μµu]IU\/mL|[μµu]U\/mL|[μµu]g\/dL|mmHg|fL|pg|%|COI|\/(?:HPF|LPF)))?(?:\s+([HL]))?$/i);if(m){value=m[1];status=status||m[2]||m[4];unit=unit||m[3];}}
   const row={name,value};if(status)row.status=status.toUpperCase()==='H'?'high':'low';if(unit)row.unit=unit;fields.push(row);
  }if(pending)fields.push({name:pending,value:''});return {fields,unparsed};
 }
 A.parseBetaInput=parse;if(typeof module!=='undefined'&&module.exports)module.exports={parse};
})(typeof globalThis!=='undefined'?globalThis:this);
