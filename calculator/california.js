/* PDRS 2005: verified lookup tables, local calculation, no external submissions. */
((root)=>{
 'use strict';
 const integer=(raw,min,max=Number.MAX_SAFE_INTEGER)=>{
  const value=String(raw??'').trim().normalize('NFKC'),n=Number(value);
  return value!==''&&Number.isSafeInteger(n)&&n>=min&&n<=max?n:null;
 };
 const normalizeNumber=raw=>{
  const value=String(raw??'').normalize('NFKC').replace(/\s/g,'');
  return /^\d{8}$/.test(value)?value.match(/\d{2}/g).join('.'):value;
 };
 const isAge=raw=>/^\d{1,3}(?:\.0+)?$/.test(String(raw??'').normalize('NFKC').trim());
 const needsInjuryDate=raw=>String(raw??'').trim()!==''&&!isAge(raw);
 function parseDate(raw){
  let value=String(raw??'').normalize('NFKC').trim(),roc=/^(?:民國|民国|ROC)/i.test(value),ad=/^(?:西元|公元)/.test(value);
  value=value.replace(/^(?:民國|民国|ROC|西元|公元)\s*/i,'').replace(/\s/g,'');
  let parts;
  if(/^\d{6,8}$/.test(value)){const y=value.length-4;parts=[value.slice(0,y),value.slice(y,y+2),value.slice(y+2)];}
  else{const match=value.replace(/[年月/.]/g,'-').replace(/日$/,'').match(/^(\d{1,4})-(\d{1,2})-(\d{1,2})$/);if(!match)return null;parts=match.slice(1);}
  let [year,month,day]=parts.map(Number);
  if(roc||(!ad&&parts[0].length<=3)){if(year<1)return null;year+=1911;}
  if(year<1||year>9999||month<1||month>12||day<1)return null;
  const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(day>days[month-1])return null;
  return {year,month,day,iso:`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
 }
 function resolveAge(raw,injuryRaw){
  if(isAge(raw))return {age:integer(raw,0)};
  if(String(raw??'').trim()==='')throw Error('請填受傷時年齡，或完整生日。');
  const birth=parseDate(raw);if(!birth)throw Error('生日請填有效年月日，例如 1986/05/06 或民國75/05/06。');
  const injury=parseDate(injuryRaw);if(!injury)throw Error('輸入生日時，請同時填寫有效的受傷日期。');
  if(injury.iso<birth.iso)throw Error('受傷日期不得早於生日。');
  const age=injury.year-birth.year-(injury.month<birth.month||(injury.month===birth.month&&injury.day<birth.day)?1:0);
  return {age,birthDate:birth.iso,injuryDate:injury.iso};
 }
 function combine(raw){
  const values=Array.isArray(raw)?raw:String(raw??'').trim().normalize('NFKC').split(/[\s,、;]+/).filter(Boolean);
  if(!values.length)throw Error('請輸入要合併的評分。');
  const sorted=values.map(v=>integer(v,0,100));
  if(sorted.some(v=>v===null))throw Error('合併評分須為 0–100 的整數。');
  sorted.sort((a,b)=>b-a);let total=sorted[0];const steps=[];
  for(const next of sorted.slice(1)){const result=Math.floor((total*100+next*(100-total)+50)/100);steps.push({left:total,right:next,result});total=result;}
  return {values:sorted,steps,total};
 }
 function createEngine(data){
  const records=new Map(data.impairments.map(row=>[row[0],row]));
  const groupIndex=new Map(data.groups.map((group,i)=>[group,i]));
  const basisOptions=code=>{
   const patterns=data.variantRules[normalizeNumber(code)]?.patterns||[];
   return data.impairments.filter(row=>row[4]&&patterns.some(pattern=>new RegExp('^'+pattern.replaceAll('.','\\.').replaceAll('X','\\d')+'$').test(row[0])));
  };
  function rate(input){
   const wpi=integer(input.wpi,0,100);
   if(wpi===null)throw Error('WPI 須為 0–100 的整數。');
   const ageInfo=resolveAge(input.age,input.injuryDate),age=ageInfo.age;
   let rank,variant,record=null,group='',basis='';
   if(input.mode==='manual'){
    rank=integer(input.rank,1,8);variant=String(input.variant??'').trim().toUpperCase();
    if(rank===null)throw Error('FEC rank 須為 1–8。');
    if(!/^[C-J]$/.test(variant))throw Error('職業變數須為 C–J。');
   }else{
    record=records.get(normalizeNumber(input.number));group=String(input.group??'').normalize('NFKC').trim();
    if(!record)throw Error('請選擇有效的 Impairment No.。');
    if(!groupIndex.has(group))throw Error('請填 PDRS 的三位數職業組別。');
    rank=record[2];
    if(rank===null)throw Error('疼痛請採受影響部位的編碼，或改用手動輸入對應的 FEC／職業變數。');
    let variants=record[4];
    if(!variants){
     const match=basisOptions(record[0]).find(row=>row[0]===input.basis);
     if(!match)throw Error('請依受影響功能選擇職業變數依據。');
     variants=match[4];basis=match[0];
    }
    variant=variants[groupIndex.get(group)];
   }
   const fec=data.fec[rank-1][wpi],occupation=data.occupation[variant.charCodeAt(0)-67][fec];
   const band=age<=21?0:age>=62?9:1+Math.floor((age-22)/5);
   const final=data.age[band][occupation];
   return {wpi,age,rank,variant,group,basis,number:record?.[0]||'',description:record?.[1]||'',fec,occupation,band,final,...(ageInfo.birthDate?{birthDate:ageInfo.birthDate,injuryDate:ageInfo.injuryDate}:{})};
  }
  return {rate,basisOptions,record:code=>records.get(normalizeNumber(code))};
 }
 const summary=r=>[
  '加州調整 · PDRS 2005',r.description?'DBI: '+r.description:'手動輸入',
  `WPI: ${r.wpi}%`,`FEC (${r.rank}): ${r.fec}%`,
  `Occupation (${r.group?r.group+', ':''}${r.variant}): ${r.occupation}%`,
  ...(r.basis?['職業變數依據: '+r.basis]:[]),...(r.birthDate?[`生日: ${r.birthDate}`,`受傷日期: ${r.injuryDate}`]:[]),`Age (${r.age}): ${r.final}%`
 ].join('\n');
 const api={integer,normalizeNumber,parseDate,resolveAge,needsInjuryDate,combine,createEngine,summary};
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof document==='undefined')return;
 const KEY='scholar-california-v1';let loading;
 async function mount(){
  const host=document.getElementById('cl-california');if(!host||host.dataset.ready)return;
  host.dataset.ready='true';host.innerHTML='<p class="ca-loading">載入加州調整…</p>';
  try{
   if(!loading)loading=fetch('calculator/california.json').then(r=>{if(!r.ok)throw Error();return r.json();}).catch(e=>{loading=null;throw e;});
   const data=await loading;render(host,data);
  }catch(_){host.innerHTML='<p class="ca-loading">無法載入加州調整。<button type="button">重試</button></p>';host.querySelector('button').onclick=()=>{delete host.dataset.ready;mount();};}
 }
 function render(host,data){
  const engine=createEngine(data);
  host.innerHTML=`<section class="ca-app" aria-labelledby="ca-title"><header class="ca-header"><h2 id="ca-title">加州調整 <span>PDRS 2005</span></h2><div class="ca-header-actions"><div class="ca-modes" role="group" aria-label="加州調整輸入方式"><button type="button" data-ca-mode="auto">自動查表</button><button type="button" data-ca-mode="manual">手動輸入</button></div><button type="button" id="ca-reset">重設</button></div></header><form id="ca-form" novalidate autocomplete="off"><input type="hidden" name="mode" value="auto"><div class="ca-primary"><label>WPI (%)<input name="wpi" type="number" min="0" max="100" step="1" inputmode="numeric"></label><label class="ca-age-input">年齡／生日<input name="age" type="text" inputmode="text" maxlength="30" placeholder="年齡或生日" aria-label="受傷時年齡或生日" aria-describedby="ca-age-hint" title="可填受傷時年齡，或國曆／民國生日"></label><label class="ca-injury-input" id="ca-injury-wrap" hidden>受傷日期<input name="injuryDate" type="text" inputmode="text" maxlength="30" placeholder="YYYY/MM/DD" title="生日換算需填受傷日；支援國曆或民國年月日"></label><label data-ca-show="auto">職業組別<input name="group" type="text" inputmode="numeric" maxlength="3" list="ca-groups" placeholder="三位數"></label><datalist id="ca-groups"></datalist><label data-ca-show="manual" hidden>FEC rank<select name="rank"></select></label><label data-ca-show="manual" hidden>職業變數<input name="variant" type="text" maxlength="1" placeholder="C–J" autocapitalize="characters"></label><output id="ca-final">—</output></div><p id="ca-age-hint" class="ca-note" hidden></p><div class="ca-selectors" data-ca-show="auto"><label>損傷分類<select name="category"></select></label><div class="ca-number"><label for="ca-number-input">Impairment No.</label><div class="ca-number-entry"><input id="ca-number-input" name="number" type="text" list="ca-numbers" placeholder="輸入編碼" maxlength="30" spellcheck="false"><select id="ca-number-pick" aria-label="從清單選擇 Impairment No."></select></div><datalist id="ca-numbers"></datalist></div></div><p id="ca-description" class="ca-note" hidden></p><label class="ca-basis" id="ca-basis-wrap" hidden>職業變數依據<select name="basis"></select></label><p id="ca-guidance" class="ca-note" hidden></p><dl class="ca-chain"><div><dt>WPI</dt><dd id="ca-wpi">—</dd></div><div><dt id="ca-fec-label">FEC</dt><dd id="ca-fec">—</dd></div><div><dt id="ca-occupation-label">Occupation</dt><dd id="ca-occupation">—</dd></div><div><dt id="ca-age-label">Age</dt><dd id="ca-age">—</dd></div></dl><p id="ca-error" class="ca-note" role="status"></p><div class="ca-actions"><button type="button" id="ca-copy" disabled>複製調整結果</button><button type="button" id="ca-add" disabled>加入合併</button></div><div class="ca-combine"><label>合併評分 (%)<input name="ratings" type="text" inputmode="decimal" placeholder="例如 17, 14, 34" maxlength="2000"></label><output id="ca-combined">—</output><button type="button" id="ca-copy-combined" disabled>複製合併結果</button></div><p id="ca-combine-error" class="ca-note" role="status"></p><p id="ca-status" class="ca-note" role="status"></p></form></section>`;
  const form=host.querySelector('form'),fields=[...form.querySelectorAll('[name]')],by=id=>host.querySelector('#'+id);
  const named=name=>form.elements.namedItem(name);
  const setText=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
  const hide=(el,value)=>{if(el.hidden!==value)el.hidden=value;};
  const disable=(el,value)=>{if(el.disabled!==value)el.disabled=value;};
  const options=(select,rows,placeholder)=>{select.replaceChildren(new Option(placeholder,''),...rows.map(([value,label])=>new Option(label,value)));};
  options(named('category'),data.categories,'選擇分類');
  options(named('rank'),Array.from({length:8},(_,i)=>[String(i+1),String(i+1)]),'—');
  by('ca-groups').replaceChildren(...data.groups.map(g=>new Option(g,g)));
  let current=null,combined=null,signature='',persisted='',basisCode='',categoryValue='';
  function populateNumbers(keep=''){
   const record=engine.record(keep);if(record)named('category').value=record[3];
   categoryValue=named('category').value;
   const rows=data.impairments.filter(r=>!categoryValue||r[3]===categoryValue);
   by('ca-numbers').replaceChildren(...rows.map(r=>new Option(r[1],r[0])));
   options(by('ca-number-pick'),rows.map(r=>[r[0],r[1]]),'選擇編碼');
   named('number').value=keep;
  }
  function populateBasis(){
   const code=normalizeNumber(named('number').value);if(code===basisCode)return;
   basisCode=code;options(named('basis'),engine.basisOptions(code).map(r=>[r[0],r[1]]),'依受影響功能選擇');
  }
  const read=()=>Object.fromEntries(fields.map(f=>[f.name,f.value]));
  function update(){
   populateBasis();const input=read(),raw=JSON.stringify(input);if(raw===signature)return;signature=raw;
   const manual=input.mode==='manual',number=normalizeNumber(input.number),record=engine.record(number),basis=!manual&&Boolean(data.variantRules[number]);
   if(by('ca-number-pick').value!==(record?number:''))by('ca-number-pick').value=record?number:'';
   const birthday=needsInjuryDate(input.age);hide(by('ca-injury-wrap'),!birthday);
   let ageHint='';if(birthday){try{const a=resolveAge(input.age,input.injuryDate);ageHint=`${a.birthDate} → ${a.injuryDate}：受傷時 ${a.age} 歲`;}catch(_){}}
   setText(by('ca-age-hint'),ageHint);hide(by('ca-age-hint'),!ageHint);
   setText(by('ca-description'),!manual&&record?record[1]:'');hide(by('ca-description'),manual||!record);
   for(const el of host.querySelectorAll('[data-ca-show]'))hide(el,el.dataset.caShow!==input.mode);
   for(const button of host.querySelectorAll('[data-ca-mode]')){const value=String(button.dataset.caMode===input.mode);if(button.getAttribute('aria-pressed')!==value)button.setAttribute('aria-pressed',value);}
   hide(by('ca-basis-wrap'),!basis);
   const guidance=!manual&&record?.[2]===null?'疼痛請依受影響部位選碼，或手動輸入該部位的 FEC／職業變數。':basis?'副神經障害請依吞嚥／言語、頸部或肩部功能選擇職業變數依據（原表第 4-3 頁）。':'';
   setText(by('ca-guidance'),guidance);hide(by('ca-guidance'),!guidance);
   let error='';current=null;
   const required=manual?['wpi','age','rank','variant']:['wpi','age','number','group'];
   if(required.every(k=>input[k].trim()!=='')){try{current=engine.rate(input);}catch(e){error=e.message;}}
   setText(by('ca-error'),error);
   for(const [id,value] of [['ca-final',current?current.final+'%':'—'],['ca-wpi',current?current.wpi+'%':'—'],['ca-fec',current?current.fec+'%':'—'],['ca-occupation',current?current.occupation+'%':'—'],['ca-age',current?current.final+'%':'—'],['ca-fec-label',current?`FEC (${current.rank})`:'FEC'],['ca-occupation-label',current?`Occupation (${current.group?current.group+', ':''}${current.variant})`:'Occupation'],['ca-age-label',current?`Age (${current.age})`:'Age']])setText(by(id),value);
   disable(by('ca-copy'),!current);disable(by('ca-add'),!current);
   combined=null;let combineError='';if(input.ratings.trim()){try{combined=combine(input.ratings);}catch(e){combineError=e.message;}}
   setText(by('ca-combined'),combined?combined.total+'%':'—');setText(by('ca-combine-error'),combineError);disable(by('ca-copy-combined'),!combined);
  }
  function save(){const raw=JSON.stringify(read());if(raw===persisted)return;root.ScholarStorage.setItem(KEY,raw);persisted=raw;}
  function change(){update();save();}
  form.addEventListener('submit',e=>e.preventDefault());
  const edited=e=>{
   if(e.target.id==='ca-number-pick')named('number').value=e.target.value;
   if(e.target.name==='category'&&categoryValue!==named('category').value)populateNumbers();
   if(e.target.name==='number'){
    const code=normalizeNumber(named('number').value),record=engine.record(code);
    if(record&&named('category').value!==record[3]){const typed=named('number').value;named('category').value=record[3];populateNumbers(typed);}
    if(record&&e.type==='change')named('number').value=code;
   }
   change();
  };
  form.addEventListener('input',edited);form.addEventListener('change',edited);
  host.addEventListener('click',e=>{const button=e.target.closest('[data-ca-mode]');if(button){named('mode').value=button.dataset.caMode;change();}});
  by('ca-add').onclick=()=>{if(!current)return;const values=named('ratings').value.trim();named('ratings').value=(values?values+', ':'')+current.final;change();};
  by('ca-reset').onclick=()=>{form.reset();by('ca-copy-fallback')?.remove();named('mode').value='auto';basisCode='';populateNumbers();change();setText(by('ca-status'),'');};
  async function copy(value){try{await navigator.clipboard.writeText(value);setText(by('ca-status'),'已複製。');}catch(_){let area=by('ca-copy-fallback');if(!area){area=document.createElement('textarea');area.id='ca-copy-fallback';area.setAttribute('aria-label','可複製的加州調整結果');by('ca-status').after(area);}area.value=value;area.focus();area.select();setText(by('ca-status'),'請按 Ctrl+C 或長按複製。');}}
  by('ca-copy').onclick=()=>{if(current)copy(summary(current));};
  by('ca-copy-combined').onclick=()=>{if(combined)copy(['合併評分 · PDRS 2005',...combined.steps.map(s=>`${s.left}% ⊕ ${s.right}% = ${s.result}%`),`合併結果：${combined.total}%`].join('\n'));};
  function hydrate(){let saved={};try{saved=JSON.parse(root.ScholarStorage.getItem(KEY)||'{}')||{};}catch(_){}
   for(const f of fields)if(!['number','basis'].includes(f.name))f.value=String(saved[f.name]??(f.name==='mode'?'auto':''));
   if(!['auto','manual'].includes(named('mode').value))named('mode').value='auto';
   populateNumbers(String(saved.number??''));basisCode='';populateBasis();named('basis').value=String(saved.basis??'');update();persisted=JSON.stringify(read());
  }
  root.ScholarSync.subscribe(key=>{if(key===KEY)hydrate();});hydrate();
 }
 root.ScholarCalifornia={...api,mount};
})(typeof window==='undefined'?globalThis:window);
