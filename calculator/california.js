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
 function createSearch(data,occupations){
  if(occupations.version!==data.version||occupations.pdfSha256!==data.sources.pdfSha256)throw Error('職業資料版本不符。');
  const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const aliases={
   '醫師':['physician','surgeon','anesthesiologist'],'醫生':['physician','surgeon','anesthesiologist'],'doctor':['physician','surgeon','anesthesiologist'],
   '麻醉醫師':['anesthesiologist'],'外科醫師':['surgeon'],'牙醫':['dentist'],'護理師':['nurse'],'護士':['nurse'],'藥師':['pharmacist'],
   '工程師':['engineer'],'土木工程師':['civil engineer'],'機械工程師':['mechanical engineer'],'電機工程師':['electrical engineer'],'電子工程師':['electronics engineer'],
   '程式設計師':['programmer'],'軟體工程師':['programmer'],'會計':['accountant','accounting'],'律師':['lawyer'],'教師':['teacher'],'老師':['teacher'],
   '司機':['driver'],'卡車司機':['truck driver'],'廚師':['cook','chef'],'清潔':['cleaner','janitor'],'焊工':['welder'],'電工':['electrician'],
   '技工':['mechanic','repairer'],'機械技工':['mechanic'],'建築工':['construction worker','laborer construction'],'作業員':['operator','assembler','laborer'],
   '店員':['sales clerk'],'銷售':['sales'],'倉管':['stock clerk'],'保全':['guard'],'警察':['police'],'消防':['fire fighter'],'秘書':['secretary'],'行政':['clerk']
  };
  const numbers=data.impairments.map(row=>({id:'n-'+row[0],value:row[0],label:row[1],category:row[3],search:normalize(row[1]),digits:row[0].replaceAll('.','')}));
  const jobs=occupations.jobs.map((row,i)=>({id:'job-'+i,kind:'job',group:row[0],title:row[1],industry:row[2],page:row[3],value:row[0]+' · '+row[1],label:row[0]+' · '+row[1]+(row[2]?' · '+row[2]:''),search:normalize(row.slice(0,3).join(' ')),words:normalize(row[1]).split(' ')}));
  const codes=data.groups.map(group=>({id:'group-'+group,kind:'group',group,value:group,label:group+' · 直接使用組別代碼',search:group+' 組別代碼'}));
  const jobMap=new Map(jobs.map(job=>[job.id,job])),groups=new Set(data.groups);
  return {
   numbers(query,category=''){
    const raw=String(query??'').normalize('NFKC').trim(),numeric=/^[\d.\s]+$/.test(raw),digits=raw.replace(/\D/g,'');
    const effective=numeric&&digits.length>=2&&data.categories.some(c=>c[0]===digits.slice(0,2))?digits.slice(0,2):category;
    const terms=normalize(raw).split(' ').filter(Boolean);
    return numbers.filter(row=>(!effective||row.category===effective)&&(numeric?row.digits.startsWith(digits):terms.every(term=>row.search.includes(term))));
   },
   jobs(query){
    const q=normalize(query);if(!q)return [...jobs,...codes];
    if(/^\d+$/.test(q))return [...codes,...jobs].filter(row=>row.group.startsWith(q));
    const terms=q.split(' '),expanded=Object.entries(aliases).filter(([key])=>normalize(key).startsWith(q)).flatMap(([,values])=>values).map(phrase=>phrase.split(' '));
    return [...jobs,...codes].filter(row=>terms.every(term=>row.search.includes(term))||(row.kind==='job'&&expanded.some(words=>words.every(word=>row.words.includes(word)))));
   },
   job:id=>jobMap.get(id),validGroup:group=>groups.has(group)
  };
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
  ...(r.occupationTitle?[`職業: ${r.occupationTitle}${r.occupationIndustry?' · '+r.occupationIndustry:''}`]:[]),
  `WPI: ${r.wpi}%`,`FEC (${r.rank}): ${r.fec}%`,
  `Occupation (${r.group?r.group+', ':''}${r.variant}): ${r.occupation}%`,
  ...(r.basis?['職業變數依據: '+r.basis]:[]),...(r.birthDate?[`生日: ${r.birthDate}`,`受傷日期: ${r.injuryDate}`]:[]),`Age (${r.age}): ${r.final}%`
 ].join('\n');
 const api={integer,normalizeNumber,parseDate,resolveAge,needsInjuryDate,createSearch,combine,createEngine,summary};
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof document==='undefined')return;
 const KEY='scholar-california-v1';let loading;
 function bindCombo({input,button,popup,list,status,items,commit,context=()=>'',empty}){
  let opened=false,selecting=false,key=null,matches=[],shown=[],active=-1,frame=0;
  const cache=new Map(),box=input.parentElement;
  function position(){
   if(!opened)return;
   const rect=box.getBoundingClientRect(),view=root.visualViewport,topLimit=view?.offsetTop||0,bottomLimit=topLimit+(view?.height||root.innerHeight);
   const width=Math.min(Math.max(rect.width,300),root.innerWidth-24),left=Math.max(12,Math.min(rect.left,root.innerWidth-width-12));
   const below=bottomLimit-rect.bottom-8,above=rect.top-topLimit-8,up=below<160&&above>below,space=Math.max(60,Math.min(270,up?above:below));
   popup.style.width=width+'px';popup.style.left=left+'px';list.style.maxHeight=Math.max(36,space-34)+'px';
   popup.style.top=(up?Math.max(topLimit+6,rect.top-popup.offsetHeight-4):rect.bottom+4)+'px';
  }
  function close(){opened=false;popup.hidden=true;input.setAttribute('aria-expanded','false');button.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  function highlight(index){
   active=index;
   [...list.children].forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));
   if(active>=0){const el=list.children[active];input.setAttribute('aria-activedescendant',el.id);el.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');
  }
  function refresh(force=false){
   if(!opened)return;
   const next=context()+'\n'+input.value;
   if(force||next!==key){
    key=next;matches=items(input.value);shown=matches.slice(0,40);active=-1;
    list.replaceChildren(...shown.map((item,i)=>{
     let el=cache.get(item.id);if(!el){el=document.createElement('button');el.type='button';el.className='ca-option';el.setAttribute('role','option');el.tabIndex=-1;el.textContent=item.label;el.dataset.value=item.value;el.dataset.item=item.id;cache.set(item.id,el);}
     el.id=list.id+'-'+i;el.setAttribute('aria-selected','false');return el;
    }));
    status.hidden=matches.length>0;
    status.textContent=matches.length?'':(empty||'沒有符合項目。');
    input.removeAttribute('aria-activedescendant');list.scrollTop=0;
   }
   position();
  }
  function open(){if(selecting)return;opened=true;popup.hidden=false;input.setAttribute('aria-expanded','true');button.setAttribute('aria-expanded','true');refresh();}
  function choose(index){
   const item=shown[index];if(!item)return;
   selecting=true;input.value=item.value;commit(item);close();input.focus({preventScroll:true});selecting=false;
  }
  input.addEventListener('focus',open);
  input.addEventListener('input',()=>{active=-1;open();});
  input.addEventListener('keydown',e=>{
   if(e.isComposing)return;
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();if(!opened)open();if(shown.length)highlight(e.key==='ArrowDown'?(active+1)%shown.length:(active<=0?shown.length-1:active-1));}
   else if(e.key==='Enter'&&opened){e.preventDefault();e.stopPropagation();if(active>=0)choose(active);else if(shown.length===1)choose(0);}
   else if(e.key==='Escape'&&opened){e.preventDefault();e.stopPropagation();close();}
   else if(e.key==='Tab')close();
  });
  button.addEventListener('mousedown',e=>e.preventDefault());
  button.addEventListener('click',()=>{if(opened)close();else{selecting=true;input.focus({preventScroll:true});selecting=false;open();}});
  list.addEventListener('mousedown',e=>e.preventDefault());
  list.addEventListener('click',e=>{const option=e.target.closest('[role=option]');if(option)choose([...list.children].indexOf(option));});
  input.addEventListener('blur',e=>{if(!box.contains(e.relatedTarget))close();});
  document.addEventListener('pointerdown',e=>{if(opened&&!box.contains(e.target))close();},{passive:true});
  const schedule=()=>{if(opened&&!frame)frame=requestAnimationFrame(()=>{frame=0;position();});};
  root.addEventListener('scroll',e=>{if(!popup.contains(e.target))schedule();},{capture:true,passive:true});
  root.addEventListener('resize',schedule,{passive:true});root.visualViewport?.addEventListener('resize',schedule,{passive:true});
  root.addEventListener('hashchange',close);
  return {close,refresh};
 }
 async function mount(){
  const host=document.getElementById('cl-california');if(!host||host.dataset.ready)return;
  host.dataset.ready='true';host.innerHTML='<p class="ca-loading">載入加州調整…</p>';
  try{
   if(!loading)loading=Promise.all(['california.json','california-occupations.json'].map(name=>fetch('calculator/'+name).then(r=>{if(!r.ok)throw Error();return r.json();}))).catch(e=>{loading=null;throw e;});
   const [data,occupations]=await loading;render(host,data,occupations);
  }catch(_){host.innerHTML='<p class="ca-loading">無法載入加州調整。<button type="button">重試</button></p>';host.querySelector('button').onclick=()=>{delete host.dataset.ready;mount();};}
 }
 function render(host,data,occupations){
  const engine=createEngine(data),search=createSearch(data,occupations);
  host.innerHTML=`<section class="ca-app" aria-labelledby="ca-title"><header class="ca-header"><h2 id="ca-title">加州調整 <span>PDRS 2005</span></h2><div class="ca-header-actions"><div class="ca-modes" role="group" aria-label="加州調整輸入方式"><button type="button" data-ca-mode="auto">自動查表</button><button type="button" data-ca-mode="manual">手動輸入</button></div><button type="button" id="ca-reset">重設</button></div></header><form id="ca-form" novalidate autocomplete="off"><input type="hidden" name="mode" value="auto"><div class="ca-primary"><label>WPI (%)<input name="wpi" type="number" min="0" max="100" step="1" inputmode="numeric"></label><label class="ca-age-input">年齡／生日<input name="age" type="text" inputmode="text" maxlength="30" placeholder="年齡或生日" aria-label="受傷時年齡或生日" aria-describedby="ca-age-hint" title="可填受傷時年齡，或國曆／民國生日"></label><label class="ca-injury-input" id="ca-injury-wrap" hidden>受傷日期<input name="injuryDate" type="text" inputmode="text" maxlength="30" placeholder="YYYY/MM/DD" title="生日換算需填受傷日；支援國曆或民國年月日"></label><div class="ca-job-input" data-ca-show="auto"><label for="ca-group-input">職業</label><div class="ca-combo"><input id="ca-group-input" name="groupQuery" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ca-group-options" placeholder="職稱或三位數代碼" maxlength="160" spellcheck="false"><button type="button" id="ca-group-toggle" class="ca-combo-toggle" tabindex="-1" aria-label="開啟職業清單" aria-controls="ca-group-options" aria-expanded="false">▾</button><div id="ca-group-popup" class="ca-combo-popup" hidden><div id="ca-group-options" class="ca-combo-list" role="listbox" aria-label="職業搜尋結果"></div><p id="ca-group-count" class="ca-combo-count" role="status"></p></div></div></div><input name="group" type="hidden"><input name="jobId" type="hidden"><label data-ca-show="manual" hidden>FEC rank<select name="rank"></select></label><label data-ca-show="manual" hidden>職業變數<input name="variant" type="text" maxlength="1" placeholder="C–J" autocapitalize="characters"></label><output id="ca-final">—</output></div><p id="ca-age-hint" class="ca-note" hidden></p><p id="ca-job-description" class="ca-note" hidden></p><div class="ca-selectors" data-ca-show="auto"><label>損傷分類<select name="category"></select></label><div class="ca-number"><label for="ca-number-input">Impairment No.</label><div class="ca-combo"><input id="ca-number-input" name="number" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="ca-number-options" placeholder="輸入編碼或關鍵字" maxlength="160" spellcheck="false"><button type="button" id="ca-number-toggle" class="ca-combo-toggle" tabindex="-1" aria-label="開啟編碼清單" aria-controls="ca-number-options" aria-expanded="false">▾</button><div id="ca-number-popup" class="ca-combo-popup" hidden><div id="ca-number-options" class="ca-combo-list" role="listbox" aria-label="編碼搜尋結果"></div><p id="ca-number-count" class="ca-combo-count" role="status"></p></div></div></div></div><p id="ca-description" class="ca-note" hidden></p><label class="ca-basis" id="ca-basis-wrap" hidden>職業變數依據<select name="basis"></select></label><p id="ca-guidance" class="ca-note" hidden></p><dl class="ca-chain"><div><dt>WPI</dt><dd id="ca-wpi">—</dd></div><div><dt id="ca-fec-label">FEC</dt><dd id="ca-fec">—</dd></div><div><dt id="ca-occupation-label">Occupation</dt><dd id="ca-occupation">—</dd></div><div><dt id="ca-age-label">Age</dt><dd id="ca-age">—</dd></div></dl><p id="ca-error" class="ca-note" role="status"></p><div class="ca-actions"><button type="button" id="ca-copy" disabled>複製調整結果</button><button type="button" id="ca-add" disabled>加入合併</button></div><div class="ca-combine"><div class="ca-combine-entry"><label id="ca-rating-label">合併評分 (%)</label><div id="ca-rating-slots" class="ca-rating-slots" role="group" aria-labelledby="ca-rating-label"></div><input name="ratings" type="hidden"></div><output id="ca-combined">—</output><button type="button" id="ca-copy-combined" disabled>複製合併結果</button></div><p id="ca-combine-error" class="ca-note" role="status"></p><p id="ca-status" class="ca-note" role="status"></p></form></section>`;
  const form=host.querySelector('form'),fields=[...form.querySelectorAll('[name]')],by=id=>host.querySelector('#'+id);
  const named=name=>form.elements.namedItem(name);
  const setText=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
  const hide=(el,value)=>{if(el.hidden!==value)el.hidden=value;};
  const disable=(el,value)=>{if(el.disabled!==value)el.disabled=value;};
  const options=(select,rows,placeholder)=>{select.replaceChildren(new Option(placeholder,''),...rows.map(([value,label])=>new Option(label,value)));};
  options(named('category'),data.categories,'選擇分類');
  options(named('rank'),Array.from({length:8},(_,i)=>[String(i+1),String(i+1)]),'—');
  let current=null,combined=null,signature='',persisted='',basisCode='',categoryValue='',numberCombo,groupCombo;
  const ratingFields=[],ratingHost=by('ca-rating-slots');
  function ensureRatings(count){
   while(ratingFields.length<count){
    const field=document.createElement('input'),index=ratingFields.length;
    field.type='text';field.inputMode='numeric';field.maxLength=3;field.placeholder='—';field.dataset.caRating=String(index);field.autocomplete='off';field.spellcheck=false;
    field.setAttribute('aria-label','合併評分 '+(index+1)+'，0至100');ratingFields.push(field);ratingHost.append(field);
   }
  }
  function validateRatings(){for(const field of ratingFields)field.setAttribute('aria-invalid',String(field.value.trim()!==''&&integer(field.value,0,100)===null));}
  function populateRatings(raw){
   const values=String(raw??'').trim().normalize('NFKC').split(/[\s,、;]+/).filter(Boolean),count=Math.max(7,values.length);
   ensureRatings(count);while(ratingFields.length>count)ratingFields.pop().remove();
   ratingFields.forEach((field,i)=>field.value=values[i]||'');validateRatings();
  }
  function syncRatings(){named('ratings').value=ratingFields.map(f=>f.value).filter(value=>value.trim()!=='').join(', ');validateRatings();}
  function populateNumbers(keep=''){
   const record=engine.record(keep);if(record)named('category').value=record[3];
   categoryValue=named('category').value;
   if(named('number').value!==keep)named('number').value=keep;
   numberCombo?.refresh(true);
  }
  function populateBasis(){
   const code=normalizeNumber(named('number').value);if(code===basisCode)return;
   basisCode=code;options(named('basis'),engine.basisOptions(code).map(r=>[r[0],r[1]]),'依受影響功能選擇');
  }
  function selectedJob(){const job=search.job(named('jobId').value);return job&&job.group===named('group').value&&job.value===named('groupQuery').value?job:null;}
  function syncGroup(){
   const value=named('groupQuery').value.normalize('NFKC').trim();
   if(search.validGroup(value)){named('group').value=value;named('jobId').value='';}
   else if(!selectedJob()){named('group').value='';named('jobId').value='';}
  }
  const read=()=>Object.fromEntries(fields.map(f=>[f.name,f.value]));
  function update(){
   syncGroup();populateBasis();const input=read(),raw=JSON.stringify(input);if(raw===signature)return;signature=raw;
   const manual=input.mode==='manual',number=normalizeNumber(input.number),record=engine.record(number),basis=!manual&&Boolean(data.variantRules[number]);
   if(manual){numberCombo?.close();groupCombo?.close();}
   const chosen=selectedJob(),jobText=!manual&&chosen?`${chosen.group} · ${chosen.title}${chosen.industry?' · '+chosen.industry:''}`:!manual&&input.groupQuery&&!input.group?'請從清單選擇職稱，或直接輸入三位數組別代碼。':'';
   setText(by('ca-job-description'),jobText);hide(by('ca-job-description'),!jobText);
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
   if(required.every(k=>input[k].trim()!=='')){try{current=engine.rate(input);if(!manual&&chosen)current={...current,occupationTitle:chosen.title,occupationIndustry:chosen.industry};}catch(e){error=e.message;}}
   setText(by('ca-error'),error);
   for(const [id,value] of [['ca-final',current?current.final+'%':'—'],['ca-wpi',current?current.wpi+'%':'—'],['ca-fec',current?current.fec+'%':'—'],['ca-occupation',current?current.occupation+'%':'—'],['ca-age',current?current.final+'%':'—'],['ca-fec-label',current?`FEC (${current.rank})`:'FEC'],['ca-occupation-label',current?`Occupation (${current.group?current.group+', ':''}${current.variant})`:'Occupation'],['ca-age-label',current?`Age (${current.age})`:'Age']])setText(by(id),value);
   disable(by('ca-copy'),!current);disable(by('ca-add'),!current);
   combined=null;let combineError='';if(input.ratings.trim()){try{if(ratingFields.some(f=>f.value.trim()!==''&&integer(f.value,0,100)===null))throw Error('合併評分須為 0–100 的整數。');combined=combine(input.ratings);}catch(e){combineError=e.message;}}
   setText(by('ca-combined'),combined?combined.total+'%':'—');setText(by('ca-combine-error'),combineError);disable(by('ca-copy-combined'),!combined);
  }
  function save(){const raw=JSON.stringify(read());if(raw===persisted)return;root.ScholarStorage.setItem(KEY,raw);persisted=raw;}
  function change(){update();save();}
  form.addEventListener('submit',e=>e.preventDefault());
  const edited=e=>{
   if(e.target.dataset.caRating!==undefined){e.target.value=e.target.value.normalize('NFKC');syncRatings();}
   if(e.target.name==='category'&&categoryValue!==named('category').value){populateNumbers();numberCombo?.close();}
   if(e.target.name==='number'){
    const code=normalizeNumber(named('number').value),record=engine.record(code);
    if(record&&named('category').value!==record[3]){const typed=named('number').value;named('category').value=record[3];populateNumbers(typed);}
    else if(/^[\d.\s]+$/.test(code)&&data.categories.some(row=>row[0]===code.slice(0,2))&&named('category').value!==code.slice(0,2)){const typed=named('number').value;named('category').value=code.slice(0,2);populateNumbers(typed);}
    if(record&&e.type==='change')named('number').value=code;
   }
   change();numberCombo?.refresh();groupCombo?.refresh();
  };
  form.addEventListener('input',edited);form.addEventListener('change',edited);
  host.addEventListener('click',e=>{const button=e.target.closest('[data-ca-mode]');if(button){named('mode').value=button.dataset.caMode;change();}});
  ratingHost.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();const at=ratingFields.indexOf(e.target);if(at>=0){ensureRatings(Math.max(7,at+2));ratingFields[at+1].focus();ratingFields[at+1].select();}}});
  ratingHost.addEventListener('paste',e=>{
   const values=(e.clipboardData.getData('text/plain')||e.clipboardData.getData('text')).trim().normalize('NFKC').split(/[\s,、;]+/).filter(Boolean),at=ratingFields.indexOf(e.target);
   if(values.length>1&&at>=0){e.preventDefault();ensureRatings(Math.max(7,at+values.length));values.forEach((value,i)=>ratingFields[at+i].value=value);syncRatings();change();}
  });
  by('ca-add').onclick=()=>{if(!current)return;let field=ratingFields.find(f=>!f.value.trim());if(!field){ensureRatings(ratingFields.length+1);field=ratingFields.at(-1);}field.value=String(current.final);syncRatings();change();};
  by('ca-reset').onclick=()=>{form.reset();populateRatings('');numberCombo.close();groupCombo.close();by('ca-copy-fallback')?.remove();named('mode').value='auto';basisCode='';populateNumbers();change();setText(by('ca-status'),'');};
  async function copy(value){try{await navigator.clipboard.writeText(value);setText(by('ca-status'),'已複製。');}catch(_){let area=by('ca-copy-fallback');if(!area){area=document.createElement('textarea');area.id='ca-copy-fallback';area.setAttribute('aria-label','可複製的加州調整結果');by('ca-status').after(area);}area.value=value;area.focus();area.select();setText(by('ca-status'),'請按 Ctrl+C 或長按複製。');}}
  by('ca-copy').onclick=()=>{if(current)copy(summary(current));};
  by('ca-copy-combined').onclick=()=>{if(combined)copy(['合併評分 · PDRS 2005',...combined.steps.map(s=>`${s.left}% ⊕ ${s.right}% = ${s.result}%`),`合併結果：${combined.total}%`].join('\n'));};
  const combo=(prefix,items,commit,context,empty)=>bindCombo({input:by('ca-'+prefix+'-input'),button:by('ca-'+prefix+'-toggle'),popup:by('ca-'+prefix+'-popup'),list:by('ca-'+prefix+'-options'),status:by('ca-'+prefix+'-count'),items,commit,context,empty});
  numberCombo=combo('number',query=>search.numbers(query,named('category').value),item=>{populateNumbers(item.value);change();},()=>named('category').value,'沒有符合的編碼，可試其他關鍵字或分類。');
  groupCombo=combo('group',query=>search.jobs(query),item=>{named('group').value=item.group;named('jobId').value=item.kind==='job'?item.id:'';change();},()=>'', '沒有符合職稱，可試英文職稱或三位數代碼。');
  function hydrate(){let saved={};try{saved=JSON.parse(root.ScholarStorage.getItem(KEY)||'{}')||{};}catch(_){}
   for(const f of fields)if(!['number','basis'].includes(f.name))f.value=String(saved[f.name]??(f.name==='mode'?'auto':''));
   if(!['auto','manual'].includes(named('mode').value))named('mode').value='auto';
   numberCombo.close();groupCombo.close();
   if(!selectedJob()){named('jobId').value='';if(search.validGroup(named('group').value))named('groupQuery').value=named('group').value;}
   populateNumbers(String(saved.number??''));populateRatings(named('ratings').value);basisCode='';populateBasis();named('basis').value=String(saved.basis??'');update();persisted=JSON.stringify(read());
  }
  let hydrationPending=false;
  root.ScholarSync.subscribe(key=>{
   if(key!==KEY)return;
   // A server acknowledgement must not dismiss the open occupation search or
   // replace its query/caret while the user is typing (including IME input).
   if(form.contains(document.activeElement)){hydrationPending=true;return;}
   hydrate();
  });
  form.addEventListener('focusout',()=>setTimeout(()=>{
   if(hydrationPending&&!form.contains(document.activeElement)){hydrationPending=false;hydrate();}
  },0));
  hydrate();
 }
 root.ScholarCalifornia={...api,mount};
})(typeof window==='undefined'?globalThis:window);
