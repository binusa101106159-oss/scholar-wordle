/* Sources and boundary decisions: tools/overload-calculator.md. */
((root)=>{
 'use strict';
 const KEY='scholar-overload-v1';
 const SOURCE='https://www.osha.gov.tw/media/4ojoyi2s/異常工作負荷促發疾病預防指引-第二版-108年4月.pdf';
 const FHS='https://www.framinghamheartstudy.org/fhs-risk-functions/cardiovascular-disease-10-year-risk/';
 const personalQuestions=['你常覺得疲勞嗎?','你常覺得身體上體力透支嗎?','你常覺得情緒上心力交瘁嗎?','你常會覺得，「我快要撐不下去了」嗎?','你常覺得精疲力竭嗎?','你常常覺得虛弱，好像快要生病了嗎?'];
 const workQuestions=['你的工作會令人情緒上心力交瘁嗎？','你的工作會讓你覺得快要累垮了嗎?','你的工作會讓你覺得挫折嗎?','工作一整天之後，你覺得精疲力竭嗎?','上班之前只要想到又要工作一整天，你就覺得沒力嗎?','上班時你會覺得每一刻都很難熬嗎?','不工作的時候，你有足夠的精力陪朋友或家人嗎?'];
 const patterns=[
  ['irregular','不規律的工作','工作排程或內容經常變更、無法預估，常在前一天或當天才通知。'],
  ['travel','經常出差的工作','經常出差，伴隨時差、缺乏適當休息或住宿、長途開車等，無法恢復疲勞。'],
  ['temperature','異常溫度環境','低溫、高溫、高低溫交替，或經常出入有明顯溫差的場所。'],
  ['noise','噪音','暴露於超過 80 分貝的噪音環境。'],
  ['timezone','時差','超過 5 小時以上的時差，或頻繁變更不同時差環境。'],
  ['tension','伴隨精神緊張的工作','例如生命／財產危險、高危險物質、限期完成困難工作、重大客戶衝突或複雜勞資紛爭。']
 ];
 const loadNames=['低負荷','中負荷','高負荷'];
 const riskNames=['低度風險','中度風險','高度風險','極高風險'];
 const interviews=[['不需面談','不需面談','建議面談'],['不需面談','建議面談','需要面談'],['建議面談','需要面談','需要面談']];
 const management=[
  '不需處理，可從事一般工作。',
  '建議改變生活型態，注意工時的調整，至少每年追蹤一次。',
  '建議改變生活型態，考慮醫療協助，調整工作型態，至少每半年追蹤一次。',
  '建議尋求醫療協助及改變生活型態，需工作限制，至少每3個月追蹤一次。',
  '建議尋求醫療協助及改變生活型態，需工作限定，至少每1至3個月追蹤一次。'
 ];
 function number(value,min,max,integer=false){
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='string'&&!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()))return null;
  const n=Number(value);return Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isInteger(n))?n:null;
 }
 function burnout(answers,kind){
  const count=kind==='personal'?6:kind==='work'?7:0;
  if(!count||!Array.isArray(answers)||answers.length!==count)return null;
  const a=answers.map(x=>number(x,1,5,true));if(a.some(x=>x===null))return null;
  return a.reduce((sum,x,i)=>sum+(kind==='work'&&i===6?(x-1)*25:(5-x)*25),0)/count;
 }
 function loadLevel(value,kind){
  const limits={personal:[50,70,100],work:[45,60,100],overtime:[45,80,744]};
  const rule=limits[kind];if(!rule)return null;
  const n=number(value,0,rule[2]);return n===null?null:n<rule[0]?0:n<=rule[1]?1:2;
 }
 function cardiovascularLevel(value){const n=number(value,0,100);return n===null?null:n<10?0:n<=20?1:n<=30?2:3;}
 function framingham(input){
  const age=number(input.age,30,74),sbp=number(input.sbp,1,1000),tc=number(input.tc,1,2000),hdl=number(input.hdl,1,1000);
  if(!['m','f'].includes(input.sex)||[age,sbp,tc,hdl].includes(null)||!['treated','smoker','diabetes'].every(k=>['yes','no'].includes(input[k])))return null;
  const male=input.sex==='m',treated=input.treated==='yes';
  const b=male?[3.06117,1.12370,-.93263,treated?1.99881:1.93303,.65451,.57367,.88936,23.9802]:[2.32888,1.20904,-.70833,treated?2.82263:2.76157,.52873,.69154,.95012,26.1931];
  const sum=b[0]*Math.log(age)+b[1]*Math.log(tc)+b[2]*Math.log(hdl)+b[3]*Math.log(sbp)+b[4]*Number(input.smoker==='yes')+b[5]*Number(input.diabetes==='yes');
  return -Math.expm1(Math.log(b[6])*Math.exp(sum-b[7]))*100;
 }
 function evaluate(d){
  const scores={personal:d.personalMode==='score'?number(d.personalScore,0,100):burnout(personalQuestions.map((_,i)=>d['p'+(i+1)]),'personal'),work:d.workMode==='score'?number(d.workScore,0,100):burnout(workQuestions.map((_,i)=>d['w'+(i+1)]),'work')};
  const months=Array.from({length:6},(_,i)=>number(d['ot'+(i+1)],0,744));
  const overtime=d.overtimeMode==='mean'?number(d.overtimeMean,0,744):months.some(x=>x===null)?null:months.reduce((a,b)=>a+b,0)/6;
  const checks=patterns.map(([id])=>d[id]),patternComplete=checks.every(x=>['yes','no'].includes(x));
  const patternCount=checks.filter(x=>x==='yes').length;
  const levels={personal:loadLevel(scores.personal,'personal'),work:loadLevel(scores.work,'work'),overtime:loadLevel(overtime,'overtime'),pattern:patternComplete?(patternCount<2?0:patternCount<4?1:2):null};
  const complete=Object.values(levels).every(x=>x!==null),workload=complete?Math.max(...Object.values(levels)):null;
  const missing=[];if(scores.personal===null)missing.push('個人過勞');if(scores.work===null)missing.push('工作過勞');if(overtime===null)missing.push('加班時數');if(!patternComplete)missing.push('工作型態');
  const warnings=[];
  let risk=null,cvd=null;
  if(d.riskMode==='manual'){risk=number(d.manualRisk,0,100);if(risk===null)missing.push('10 年心血管風險');}
  else if(d.history!=='yes'){
   risk=framingham(d);
   if(risk===null)missing.push('Framingham 資料');
   const age=number(d.age,0,150);if(age!==null&&(age<30||age>74))warnings.push('年齡超出 Framingham 2008 模型的 30–74 歲範圍，未外推計算；可輸入其他適用評估工具的已知風險。');
  }
  if(risk!==null)cvd=Math.min(2,cardiovascularLevel(risk));
  if(!['yes','no'].includes(d.history)){missing.push('腦心血管疾病病史');cvd=null;}
  if(d.history==='yes'){
   warnings.push('已有腦心血管疾病病史者不適用此初次發病模型。請由醫師評估為中度或高度風險，再進行工作負荷分級。');
   const clinical=number(d.clinicalRisk,1,2,true);
   if(clinical===null){missing.push('醫師評估風險');cvd=null;}else cvd=cvd===null?clinical:Math.max(cvd,clinical);
  }
  const combined=workload!==null&&cvd!==null?workload+cvd:null;
  const interview=workload!==null&&cvd!==null?interviews[workload][cvd]:null;
  return {scores,overtime,patternCount,levels,workload,risk,cardiovascular:cvd,riskLevel:cardiovascularLevel(risk),combined,combinedLevel:combined===null?null:combined===0?0:combined<=2?1:2,interview,management:combined===null?null:management[combined],missing,warnings};
 }
 const fmt=n=>n===null?'待填':n.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:2});
 function summary(d,r=evaluate(d)){
  const lines=[`個人相關過勞分數：${fmt(r.scores.personal)}${r.levels.personal===null?'':`（${loadNames[r.levels.personal]}）`}`,`工作相關過勞分數：${fmt(r.scores.work)}${r.levels.work===null?'':`（${loadNames[r.levels.work]}）`}`,`近 6 個月平均每月加班：${fmt(r.overtime)} 小時`, `工作型態：${r.levels.pattern===null?'待填':`${r.patternCount} 項（${loadNames[r.levels.pattern]}）`}`,`工作負荷等級：${r.workload===null?'待填':`${r.workload} · ${loadNames[r.workload]}`}`,`10 年心血管疾病風險：${r.risk===null?'未估算':fmt(r.risk)+'%'}${r.riskLevel===null?'':`（${riskNames[r.riskLevel]}）`}`,`風險來源：${d.riskMode==='manual'?'已知風險（'+(d.manualSource||'來源未填')+'）':'Framingham 2008 General CVD 血脂模型'}`];
  if(d.history==='yes')lines.push(`既有腦心血管疾病：醫師評估${r.cardiovascular===null?'待填':riskNames[r.cardiovascular]}`);
  lines.push(`職業促發腦心血管疾病風險分級：${r.combined===null?'待填':`${r.combined} · ${riskNames[r.combinedLevel]}`}`,`異常工作負荷促發疾病風險／面談建議：${r.interview||'待填'}`);
  if(r.management)lines.push(`健康管理措施：${r.management}`);
  if(d.previousPersonal||d.previousWork)lines.push(`上次個人／工作過勞分數：${d.previousPersonal||'未填'}／${d.previousWork||'未填'}`);
  if(r.missing.length)lines.push('待填：'+r.missing.join('、'));
  lines.push(...r.warnings,'依據：異常工作負荷促發疾病預防指引第二版（108 年 4 月），表二至表六、附錄二。');return lines.join('\n');
 }
 const api={number,burnout,loadLevel,cardiovascularLevel,framingham,evaluate,summary,personalQuestions,workQuestions,patterns};
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof document==='undefined')return;
 let mounted=false;
 function mount(){
  const target=document.getElementById('cl-overload');if(!target||mounted)return;mounted=true;
  const select=(key,label,options,extra='')=>{
   if(key.endsWith('Mode'))return `<div class="ol-mode"><span>${label}</span><input type="hidden" name="${key}" value="${options[0][0]}" data-default="${options[0][0]}"><div role="group" aria-label="${label}">${options.map(([value,text])=>`<button type="button" data-ol-mode="${key}" data-value="${value}" aria-pressed="false">${text}</button>`).join('')}</div></div>`;
   const kind=key==='sex'?'sex':key==='clinicalRisk'?'clinical':'boolean';
   const hint=kind==='sex'?'男／女':kind==='clinical'?'1 中／2 高':'0 無／1 有';
   return `<label class="ol-field">${label}<input type="text" name="${key}" data-ol-enum="${kind}" inputmode="${kind==='sex'?'text':'numeric'}" maxlength="${kind==='sex'?2:1}" autocomplete="off" placeholder="${hint}" aria-label="${label}：${hint}" ${extra}></label>`;
  };
  const numeric=(key,label,min,max,extra='')=>`<label class="ol-field">${label}<input name="${key}" type="number" inputmode="decimal" min="${min}" max="${max}" step="any" ${extra}></label>`;
  const yn=[['','請選擇'],['no','無'],['yes','有']];
  const answerRows=(prefix,questions)=>questions.map((_,i)=>`<input name="${prefix}${i+1}" class="ol-answer" type="text" inputmode="numeric" pattern="[1-5]" maxlength="1" autocomplete="off" placeholder="—" aria-label="${prefix==='p'?'個人':'工作'}相關過勞第 ${i+1} 題">`).join('');
  const burnoutSection=(kind,title,questions,prefix)=>`<section class="ol-burnout" aria-label="${title}"><div class="ol-burnout-bar"><h3>${kind==='personal'?'個人過勞':'工作過勞'}</h3><div class="ol-answer-bar" style="--ol-count:${questions.length}" data-ol-show="${kind}:questionnaire">${answerRows(prefix,questions)}</div><div class="ol-direct-score" data-ol-show="${kind}:score" hidden>${numeric(kind+'Score','分數（0–100）',0,100)}</div><div class="ol-burnout-result"><output id="ol-${kind}-score">—</output><span id="ol-${kind}-level"></span></div><details class="ol-score-options"><summary aria-label="${title}輸入設定">⋯</summary><div>${select(kind+'Mode','輸入方式',[['questionnaire','輸入各題答案'],['score','輸入已有分數']])}${numeric(kind==='personal'?'previousPersonal':'previousWork','上次分數（選填，不納入本次計算）',0,100)}</div></details></div></section>`;
  target.innerHTML=`<section class="ol-app" aria-labelledby="ol-title"><header class="ol-header"><div><p>Overload assessment</p><h2 id="ol-title">過負荷計算機</h2><span>過勞量表 → 心血管風險 → 工作負荷 → 綜合分級</span></div><div class="ol-actions"><button type="button" id="ol-jump">查看結果</button><button type="button" id="ol-reset">清除本次</button></div></header><div class="ol-layout"><form id="ol-form" autocomplete="off" novalidate><div class="ol-two">${burnoutSection('personal','個人相關過勞',personalQuestions,'p')}${burnoutSection('work','工作相關過勞',workQuestions,'w')}</div><section class="ol-card"><h3>Framingham risk <output id="ol-frs">待填</output></h3>${select('riskMode','風險資料',[['calculate','由健檢資料計算'],['manual','輸入已知 10 年風險']])}<div data-ol-show="risk:calculate"><p class="ol-hint">Framingham 2008 · 30–74 歲</p><div class="ol-fields">${select('sex','性別',[['','請選擇'],['m','男'],['f','女']])}${numeric('age','年齡（歲）',30,74,'step="1"')}${numeric('sbp','收縮壓（mmHg）',1,1000)}${numeric('tc','總膽固醇（mg/dL）',1,2000)}${numeric('hdl','HDL（mg/dL）',1,1000)}${select('treated','服用降血壓藥',yn)}${select('smoker','目前吸菸',yn)}${select('diabetes','糖尿病',yn)}</div></div><div data-ol-show="risk:manual" hidden><div class="ol-fields">${numeric('manualRisk','10 年心血管疾病風險（%）',0,100)}<label class="ol-field">評估工具／來源<input name="manualSource" type="text" maxlength="120" placeholder="例如其他適用模型或醫師評估"></label></div></div>${select('history','既有腦心血管疾病病史',yn)}<div id="ol-clinical" hidden>${select('clinicalRisk','醫師評估的心血管風險',[['','請由醫師評估'],['1','中度風險'],['2','高度風險']])}</div></section><section class="ol-card"><h3>月加班時數 <output id="ol-ot">待填</output></h3><input type="hidden" name="overtimeMode" value="mean" data-default="mean">${numeric('overtimeMean','平均每月加班（小時）',0,744)}</section><section class="ol-card"><h3>工作型態評估 <output id="ol-pattern">待填</output></h3><div class="ol-pattern-checks">${patterns.map(([id,title])=>`<label class="ol-pattern-check"><input type="checkbox" name="${id}"><span>${title}</span></label>`).join('')}</div><button type="button" id="ol-pattern-none">清除勾選</button></section></form><aside class="ol-results" aria-label="評估結果"><section class="ol-card"><h3>評估結果</h3><dl id="ol-results"></dl><p id="ol-missing" class="ol-hint"></p><div id="ol-warnings"></div><p id="ol-management"></p><button type="button" id="ol-copy">複製完整結果</button><p id="ol-copy-status" role="status"></p><p class="ol-hint" id="ol-sync-note"></p></section><details class="ol-card"><summary>計分與來源</summary><p>個人：6 題平均。工作：7 題平均，第 7 題反向。選項 1–5 對應 100、75、50、25、0 分。</p><p>個人過勞：&lt;50 低、50–70 中、&gt;70 高。工作過勞：&lt;45 低、45–60 中、&gt;60 高。</p><p>加班：&lt;45 小時低、45–80 中、&gt;80 高。工作型態：0–1 項低、2–3 項中、4 項以上高。取四項最嚴重者為工作負荷；四項未完整時不顯示最終等級。</p><p>表四心血管評分：&lt;10%=0、10–20%=1、&gt;20%=2，加上工作負荷 0–2，得到總分 0–4。0 低度、1–2 中度、3–4 高度。表五面談建議另行查表，不等同表四分數。</p><p>表一的 20% 分界有重疊；本工具以表四明確的 &gt;20% 為高風險，20% 歸中度。過勞臨界值依表二，使用未四捨五入的分數判定。</p><p><a href="${SOURCE}" target="_blank" rel="noopener">職安署指引第二版（108 年 4 月）</a>：第 7–8 頁表一至四、第 10 頁表五、第 15 頁表六、第 20–21 頁附錄二。</p><p><a href="${FHS}" target="_blank" rel="noopener">Framingham 2008 模型與係數</a> · <a href="https://www.ntuh.gov.tw/telehealth/Fpage.action?muid=1699&fid=1551" target="_blank" rel="noopener">原範本連結的臺大計算器</a></p><p>心血管風險顯示至小數點後兩位；分級使用未四捨五入值。已有疾病者由醫師判斷，不自動視為低風險。表六為健康管理參考，不自動開立工作限制。</p></details></aside></div></section>`;
  const form=document.getElementById('ol-form'),fields=[...form.querySelectorAll('[name]')],by=id=>document.getElementById(id);
  let data={},copyText='';
  function fieldValue(f){
   if(f.type==='checkbox')return f.checked?'yes':'no';
   const value=f.value.trim().toLowerCase();
   if(f.dataset.olEnum==='sex')return ({'男':'m','女':'f',m:'m',f:'f'})[value]??value;
   if(f.dataset.olEnum==='boolean')return ({'0':'no','1':'yes','無':'no','有':'yes',no:'no',yes:'yes'})[value]??value;
   return f.value;
  }
  function read(){return Object.fromEntries(fields.map(f=>[f.name,fieldValue(f)]));}
  function render(){
   data=read();const r=evaluate(data);
   for(const el of target.querySelectorAll('[data-ol-show]')){const [type,mode]=el.dataset.olShow.split(':');const selected=data[type==='risk'?'riskMode':type+'Mode'];el.hidden=selected!==mode;}
   by('ol-clinical').hidden=data.history!=='yes';
   for(const button of target.querySelectorAll('[data-ol-mode]'))button.setAttribute('aria-pressed',String(data[button.dataset.olMode]===button.dataset.value));
   for(const kind of ['personal','work']){by('ol-'+kind+'-score').textContent=r.scores[kind]===null?'—':fmt(r.scores[kind]);by('ol-'+kind+'-level').textContent=r.levels[kind]===null?'':loadNames[r.levels[kind]];}
   by('ol-frs').textContent=r.risk===null?(data.history==='yes'&&data.riskMode!=='manual'?'不適用':'待填'):fmt(r.risk)+'%';by('ol-ot').textContent=r.overtime===null?'待填':fmt(r.overtime)+' 小時';by('ol-pattern').textContent=r.levels.pattern===null?'待填':r.patternCount+' 項';
   const rows=[['個人相關過勞',r.levels.personal===null?'待填':`${fmt(r.scores.personal)} · ${loadNames[r.levels.personal]}`,r.levels.personal],['工作相關過勞',r.levels.work===null?'待填':`${fmt(r.scores.work)} · ${loadNames[r.levels.work]}`,r.levels.work],['月加班負荷',r.levels.overtime===null?'待填':loadNames[r.levels.overtime],r.levels.overtime],['工作型態負荷',r.levels.pattern===null?'待填':loadNames[r.levels.pattern],r.levels.pattern],['工作負荷等級',r.workload===null?'待填':`${r.workload} · ${loadNames[r.workload]}`,r.workload],['10 年心血管疾病風險',r.riskLevel===null?(data.history==='yes'&&r.cardiovascular!==null?'醫師評估 · '+riskNames[r.cardiovascular]:'未估算'):`${fmt(r.risk)}% · ${riskNames[r.riskLevel]}`,r.riskLevel],['職業促發腦心血管疾病風險分級',r.combined===null?'待填':`${r.combined} · ${riskNames[r.combinedLevel]}`,r.combinedLevel],['異常工作負荷促發疾病風險／面談建議',r.interview||'待填',r.interview===null?null:r.interview==='需要面談'?2:r.interview==='建議面談'?1:0]];
   by('ol-results').replaceChildren(...rows.map(([label,value,level])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dd.dataset.level=level??'';row.append(dt,dd);return row;}));
   by('ol-missing').textContent=r.missing.length?'待填：'+r.missing.join('、'):'資料完整 · 已完成自動分級';
   by('ol-warnings').replaceChildren(...r.warnings.map(message=>{const p=document.createElement('p');p.className='ol-warning';p.textContent=message;return p;}));
   by('ol-management').textContent=r.management?'表六健康管理措施：'+r.management:'';
   copyText=summary(data,r);
   for(const f of fields){if(f.type==='number')f.setAttribute('aria-invalid',String(f.value!==''&&!f.validity.valid));if(f.classList.contains('ol-answer'))f.setAttribute('aria-invalid',String(f.value!==''&&number(f.value,1,5,true)===null));}
  }
  function save(){root.ScholarStorage.setItem(KEY,JSON.stringify(read()));}
  function hydrate(){
   let saved={};try{saved=JSON.parse(root.ScholarStorage.getItem(KEY)||'{}')||{};}catch(_){}
   if(saved.overtimeMode==='months'){
    const months=Array.from({length:6},(_,i)=>number(saved['ot'+(i+1)],0,744));
    saved.overtimeMean=months.every(n=>n!==null)?String(months.reduce((a,b)=>a+b,0)/6):'';
   }
   saved.overtimeMode='mean';
   for(const f of fields){
    const value=String(saved[f.name]??f.dataset.default??'');
    if(f.type==='checkbox'){f.checked=value==='yes';continue;}
    if(fieldValue(f)!==value){f.value=f.dataset.olEnum==='sex'?({m:'男',f:'女'}[value]??value):f.dataset.olEnum==='boolean'?({yes:'1',no:'0'}[value]??value):value;}
   }
   render();
  }
  function syncNote(){by('ol-sync-note').textContent=root.ScholarSync.status().user?'本次輸入使用私人帳號雲端同步；儲存狀態請看 Account。':'登入後可將本次輸入同步至其他裝置。未登入時僅在本次頁面暫存。';}
  form.addEventListener('submit',e=>e.preventDefault());
  for(const type of ['pointerdown','focusin'])target.addEventListener(type,e=>{for(const menu of target.querySelectorAll('.ol-score-options[open]'))if(!menu.contains(e.target))menu.open=false;});
  form.addEventListener('input',e=>{const f=e.target;if(f.classList.contains('ol-answer')){f.value=f.value.replace(/[^1-5]/g,'').slice(-1);if(f.value){const a=[...form.querySelectorAll('.ol-answer')],next=a[a.indexOf(f)+1];if(next&&!next.closest('[hidden]')){next.focus();next.select();}}}render();save();});
  form.addEventListener('change',()=>{render();save();});
  form.addEventListener('keydown',e=>{const f=e.target;if(f.classList.contains('ol-answer')&&e.key==='Backspace'&&!f.value){const a=[...form.querySelectorAll('.ol-answer')],previous=a[a.indexOf(f)-1];if(previous&&!previous.closest('[hidden]')){e.preventDefault();previous.focus();previous.value='';render();save();}}});
  target.addEventListener('click',e=>{const button=e.target.closest('[data-ol-mode]');if(!button)return;form.elements.namedItem(button.dataset.olMode).value=button.dataset.value;render();save();});
  by('ol-pattern-none').addEventListener('click',()=>{for(const [id] of patterns)form.elements.namedItem(id).checked=false;render();save();});
  by('ol-jump').addEventListener('click',()=>{by('ol-results').scrollIntoView({block:'start',behavior:'smooth'});});
  by('ol-reset').addEventListener('click',()=>{form.reset();render();save();by('ol-copy-status').textContent='已清除本次輸入。';});
  by('ol-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(copyText);by('ol-copy-status').textContent='已複製完整評估結果。';}catch(_){by('ol-copy-status').textContent='無法使用剪貼簿，請選取下方結果複製。';let text=by('ol-copy-fallback');if(!text){text=document.createElement('textarea');text.id='ol-copy-fallback';text.setAttribute('aria-label','可複製的評估結果');by('ol-copy-status').after(text);}text.value=copyText;text.focus();text.select();}});
  root.ScholarSync.subscribe(key=>{if(key===KEY)hydrate();});root.addEventListener('scholar-sync-status',syncNote);hydrate();syncNote();
 }
 root.ScholarOverload={...api,mount};
})(typeof window==='undefined'?globalThis:window);
