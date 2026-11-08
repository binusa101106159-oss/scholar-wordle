/* Small arithmetic parser; no eval, dependencies, or background work. */
((root)=>{
 'use strict';
 function calculate(raw){
  const text=String(raw).replace(/[×]/g,'*').replace(/[÷]/g,'/').replace(/[−]/g,'-').replace(/\s/g,'');
  if(!text)throw Error('請輸入算式。');
  if(text.length>500)throw Error('算式過長。');
  let at=0,depth=0;
  const finite=n=>{if(!Number.isFinite(n))throw Error('結果超出可計算範圍。');return n;};
  function factor(){
   if(++depth>80)throw Error('括號或正負號層數過多。');
   let n;
   if(text[at]==='+'||text[at]==='-'){const negative=text[at++]==='-';n=factor();if(negative)n=-n;}
   else if(text[at]==='('){at++;n=sum();if(text[at++]!==')')throw Error('請檢查括號。');}
   else {const match=text.slice(at).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);if(!match)throw Error('請檢查算式。');at+=match[0].length;n=finite(Number(match[0]));}
   while(text[at]==='%'){at++;n/=100;}
   depth--;return finite(n);
  }
  function product(){let n=factor();while(text[at]==='*'||text[at]==='/'){const op=text[at++],right=factor();if(op==='/'&&right===0)throw Error('不能除以零。');n=finite(op==='*'?n*right:n/right);}return n;}
  function sum(){let n=product();while(text[at]==='+'||text[at]==='-'){const op=text[at++],right=product();n=finite(op==='+'?n+right:n-right);}return n;}
  const result=sum();if(at!==text.length)throw Error('請檢查算式。');
  return Number(result.toPrecision(15)).toString();
 }
 // UTC arithmetic keeps calendar dates stable across daylight-saving changes.
 function monthGrid(index){
  if(!Number.isInteger(index)||index<12||index>119987)throw Error('月份超出範圍。');
  const year=Math.floor(index/12),month=index%12,first=new Date(0),last=new Date(0);
  first.setUTCFullYear(year,month,1);last.setUTCFullYear(year,month+1,0);
  return {year,month,days:Array.from({length:42},(_,i)=>{const day=i-first.getUTCDay()+1;return day>0&&day<=last.getUTCDate()?day:null;})};
 }
 function weekDates(start){
  return Array.from({length:7},(_,i)=>{const date=new Date((start+i)*86400000);return {year:date.getUTCFullYear(),month:date.getUTCMonth(),day:date.getUTCDate()};});
 }
 function monthWeek(index){
  const {year,month,days}=monthGrid(index),date=new Date(0);date.setUTCFullYear(year,month,1);
  return date.getTime()/86400000-days.indexOf(1);
 }
 function dateKey(year,month,day){return year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');}
 function followupDate(raw){
  const text=String(raw||'').normalize('NFKC').trim();
  const match=text.match(/^(民國\s*)?(\d{3,4})\s*(?:年|[./-])\s*(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})(?:日|號)?(.*)$/);
  if(!match)return null;
  let year=Number(match[2]);const month=Number(match[3]),day=Number(match[4]),rest=match[5];
  if(/^\d/.test(rest)||/(?:取消|改|或|待定|未定|\d+[./-]\d+)/.test(rest))return null;
  if(match[1]||match[2].length===3){if(year<1||year>999)return null;year+=1911;}
  if(year<1900||year>9999)return null;
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?dateKey(year,month,day):null;
 }
 function dayInfo(key,data){
  const [year,month,day]=key.split('-').map(Number),weekday=new Date(Date.UTC(year,month-1,day)).getUTCDay(),weekend=weekday===0||weekday===6;
  const known=Boolean(data?.years.includes(year)),exception=known?data.dates[key]:null;
  const off=exception?exception[0]:weekend;
  return {known,off,makeup:known&&weekend&&!off,label:exception?.[1]||(off?'週末':'')};
 }
 function mountCalendar(host){
  const KEY='scholar-calendar-v1', current=()=>{const d=new Date();return d.getFullYear()*12+d.getMonth();};
  let visible=current(),frame=0,timer=0,pending=null,holidays=null,holidayError=false,selected=null,appointments=new Map(),missingDates=0,caseError=false;
  let identity=root.ScholarSync.status?.()?.user?.uid;
  const saved=()=>{try{const value=JSON.parse(root.ScholarStorage.getItem(KEY)||'{}')?.month;return Number.isInteger(value)&&value>=15&&value<=119984?value:current();}catch(_){return current();}};
  host.insertAdjacentHTML('beforeend','<section class="cl-calendar" aria-labelledby="cl-calendar-title"><div class="cl-calendar-head"><h2 id="cl-calendar-title">月曆</h2><div><button type="button" data-month-shift="-1" aria-label="上一個月">‹</button><button type="button" id="cl-calendar-today">本月</button><button type="button" data-month-shift="1" aria-label="下一個月">›</button></div></div><div class="cl-calendar-week" aria-hidden="true">'+['日','一','二','三','四','五','六'].map(day=>'<span>'+day+'</span>').join('')+'</div><div id="cl-calendar-scroll" tabindex="0" role="region" aria-label="月曆，上下捲動瀏覽月份"></div><div class="cl-calendar-meta"><a href="https://data.gov.tw/dataset/14718" target="_blank" rel="noopener noreferrer" id="cl-calendar-source">假日資料載入中…</a><span>藍點：回診</span></div><p id="cl-calendar-warning" hidden></p><section id="cl-calendar-details" class="cl-calendar-details" aria-live="polite" hidden><div><strong id="cl-calendar-detail-date"></strong><button type="button" id="cl-calendar-close" aria-label="關閉日期詳情">×</button></div><p id="cl-calendar-detail-holiday"></p><ul id="cl-calendar-patients"></ul><p id="cl-calendar-detail-status" role="status"></p><a href="#cases">個案追蹤</a></section></section>');
  const viewport=host.querySelector('#cl-calendar-scroll'),card=host.querySelector('.cl-calendar');
  function refresh(){
   if(viewport.clientHeight)card.style.setProperty('--calendar-gutter',(viewport.offsetWidth-viewport.clientWidth)+'px');
   if(pending!==null&&viewport.clientHeight){const found=[...viewport.children].find(el=>Number(el.dataset.start)===monthWeek(pending));if(found)viewport.scrollTop=found.offsetTop;pending=null;}
   const d=new Date(),today=dateKey(d.getFullYear(),d.getMonth()+1,d.getDate());
   viewport.querySelectorAll('[data-date]').forEach(el=>{
    const key=el.dataset.date,match=key===today,info=dayInfo(key,holidays),patients=appointments.get(key)||[];
    el.classList.toggle('is-today',match);el.classList.toggle('is-holiday',info.known&&info.off);el.classList.toggle('is-makeup',info.makeup);
    el.classList.toggle('has-appointments',patients.length>0);
    el.classList.toggle('is-selected',selected===key);el.setAttribute('aria-expanded',String(selected===key));
    if(info.known)el.classList.toggle('is-weekend',info.off);
    const label=key.replaceAll('-','/')+(info.label?' · '+info.label:'')+(patients.length?' · '+patients.length+'筆回診':'');
    el.title=label;el.setAttribute('aria-label',label);
    if(match)el.setAttribute('aria-current','date');else el.removeAttribute('aria-current');
   });
   const source=card.querySelector('#cl-calendar-source');source.textContent=holidays?'臺灣辦公日曆 '+holidays.years[0]+'–'+holidays.years[holidays.years.length-1]:holidayError?'假日資料暫無法載入':'假日資料載入中…';
   source.title='行政院人事行政總處政府行政機關辦公日曆表';
   const warning=card.querySelector('#cl-calendar-warning');warning.replaceChildren();
   if(caseError)warning.textContent='無法讀取回診資料。';
   else if(missingDates){const link=document.createElement('a');link.href='#cases';link.textContent=missingDates+'筆回診時間需確認完整日期';warning.append(link);}
   warning.hidden=!warning.textContent;
   renderDetails();
  }
  function readAppointments(){
   appointments=new Map();missingDates=0;caseError=false;
   if(!root.ScholarSync.status?.()?.user)return;
   try{
    const data=JSON.parse(root.ScholarStorage.getItem('scholar-cases-v1')||'{"version":1,"records":[]}');
    if(data.version!==1||!Array.isArray(data.records))throw Error('Invalid cases');
    for(const row of data.records){
     if(!row.followup?.trim())continue;
     const key=followupDate(row.followup);if(!key){missingDates++;continue;}
     if(!appointments.has(key))appointments.set(key,[]);appointments.get(key).push(row);
    }
   }catch(_){appointments.clear();caseError=true;}
  }
  function renderDetails(){
   const details=card.querySelector('#cl-calendar-details');details.hidden=!selected;if(!selected)return;
   const patients=root.ScholarSync.status?.()?.user?(appointments.get(selected)||[]):[],info=dayInfo(selected,holidays);
   card.querySelector('#cl-calendar-detail-date').textContent=selected.replaceAll('-','/');
   card.querySelector('#cl-calendar-detail-holiday').textContent=!holidays?(holidayError?'假日資料暫無法載入':'假日資料載入中…'):info.known?(info.label||'上班日'):info.label?info.label+' · 此年份尚無官方假日資料':'此年份尚無官方假日資料';
   const list=card.querySelector('#cl-calendar-patients');list.replaceChildren();
   for(const row of patients){
    const li=document.createElement('li'),name=document.createElement('strong'),time=document.createElement('span');
    name.textContent=row.name||'未填姓名';li.append(name);
    if(row.mrn){const copy=document.createElement('button');copy.type='button';copy.className='cl-calendar-mrn';copy.dataset.mrn=row.mrn;copy.textContent=row.mrn;copy.title='複製病歷號';li.append(copy);}
    time.textContent=(row.vs?'VS '+row.vs+' · ':'')+(root.ScholarCases?.followupText?.(row)||row.followup);li.append(time);list.append(li);
   }
   if(!patients.length){const li=document.createElement('li');li.textContent=caseError?'回診資料暫無法讀取。':root.ScholarSync.status?.()?.user?'當天沒有已標示的回診個案。':'登入後可查看回診個案。';list.append(li);}
  }
  function week(start){
   const dates=weekDates(start),first=dates.find(date=>date.day===1),context=first||dates[0];
   const el=document.createElement('div');el.className='cl-calendar-weekrow';el.dataset.start=start;el.dataset.month=context.year*12+context.month;
   const label=document.createElement('div');label.className='cl-calendar-label';label.setAttribute('aria-hidden','true');
   if(first){const year=document.createElement('span'),month=document.createElement('strong');year.textContent=first.year;month.textContent=(first.month+1)+'月';label.append(year,month);}
   el.append(label);
   const grid=document.createElement('div');grid.className='cl-calendar-days';
   dates.forEach((date,i)=>{
    const cell=document.createElement('button');cell.type='button';cell.className=i===0||i===6?'is-weekend':'';cell.setAttribute('aria-controls','cl-calendar-details');
    cell.textContent=date.day;cell.dataset.date=dateKey(date.year,date.month+1,date.day);
    cell.setAttribute('aria-label',date.year+'年'+(date.month+1)+'月'+date.day+'日');
    if(date.day===1)cell.classList.add('is-month-start');
    grid.append(cell);
   });el.append(grid);return el;
  }
  function reset(index){
   if(index<15||index>119984)return;
   const first=monthWeek(index)-84;
   viewport.replaceChildren(...Array.from({length:32},(_,i)=>week(first+i*7)));
   visible=index;pending=index;refresh();
  }
  function persist(){
   clearTimeout(timer);timer=setTimeout(()=>{
    if(saved()!==visible)root.ScholarStorage.setItem(KEY,JSON.stringify({month:visible}));
   },300);
  }
  function jump(index){
   clearTimeout(timer);cancelAnimationFrame(frame);
   const found=[...viewport.children].find(el=>Number(el.dataset.start)===monthWeek(index));
   if(found)viewport.scrollTo({top:found.offsetTop,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
   else reset(index);
   visible=index;persist();
  }
  viewport.addEventListener('scroll',()=>{
   cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
    if(!viewport.clientHeight){pending=visible;return;}
    const children=[...viewport.children];
    const active=children.find(el=>el.offsetTop+el.offsetHeight>viewport.scrollTop+50)||children[children.length-1];
    visible=Number(active.dataset.month);
    // Whole weeks keep month boundaries continuous, with no duplicate or empty dates.
    if(viewport.scrollTop<120&&Number(children[0].dataset.start)>monthWeek(15)){
     const anchor=children[0],top=anchor.offsetTop,start=Number(anchor.dataset.start);
     viewport.prepend(...Array.from({length:12},(_,i)=>week(start-(12-i)*7)));viewport.scrollTop+=anchor.offsetTop-top;
     while(viewport.children.length>68)viewport.lastElementChild.remove();refresh();
    }else if(viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight<120&&Number(children[children.length-1].dataset.start)<monthWeek(119984)){
     const start=Number(children[children.length-1].dataset.start);viewport.append(...Array.from({length:12},(_,i)=>week(start+(i+1)*7)));
     if(viewport.children.length>68){const removed=children.slice(0,12).reduce((sum,el)=>sum+el.offsetHeight,0);for(let i=0;i<12;i++)viewport.firstElementChild.remove();viewport.scrollTop-=removed;}
     refresh();
    }
    persist();
   });
  },{passive:true});
  card.addEventListener('click',async event=>{
   const button=event.target.closest('button');if(!button)return;
   if(button.dataset.date){selected=selected===button.dataset.date?null:button.dataset.date;card.querySelector('#cl-calendar-detail-status').textContent='';refresh();return;}
   if(button.id==='cl-calendar-close'){selected=null;refresh();return;}
   if(button.dataset.mrn){try{await navigator.clipboard.writeText(button.dataset.mrn);card.querySelector('#cl-calendar-detail-status').textContent='病歷號已複製。';}catch(_){card.querySelector('#cl-calendar-detail-status').textContent='無法複製，請允許剪貼簿存取後再試。';}return;}
   if(button.id==='cl-calendar-today')jump(current());
   else if(button.dataset.monthShift)jump(visible+Number(button.dataset.monthShift));
  });
  viewport.addEventListener('keydown',event=>{
   if(event.target!==viewport)return;
   if(['ArrowLeft','ArrowRight','PageUp','PageDown','Home'].includes(event.key)){
    event.preventDefault();jump(event.key==='Home'?current():visible+(['ArrowLeft','PageUp'].includes(event.key)?-1:1));
   }
  });
  root.ScholarSync.subscribe(key=>{
   if(key===KEY&&saved()!==visible){clearTimeout(timer);reset(saved());}
   if(key==='scholar-cases-v1'){readAppointments();refresh();}
  });
  window.addEventListener('scholar-sync-status',()=>{const next=root.ScholarSync.status?.()?.user?.uid;if(next!==identity){identity=next;readAppointments();refresh();}});
  readAppointments();reset(saved());
  fetch('calculator/taiwan-calendar.json').then(response=>{if(!response.ok)throw Error('Calendar unavailable');return response.json();}).then(data=>{holidays=data;refresh();}).catch(()=>{holidayError=true;refresh();});
  return {refresh(){readAppointments();refresh();}};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={calculate,monthGrid,weekDates,monthWeek,followupDate,dayInfo};
 if(typeof document==='undefined')return;
 let ready=false,calendar;
 function show(){
  if(ready){calendar?.refresh();root.ScholarQuickDASH?.mount();root.ScholarAAOS?.mount();root.ScholarCalifornia?.mount();root.ScholarOverload?.mount();return;}ready=true;
  const panel=document.getElementById('calculator-panel');
  panel.innerHTML='<div class="cl-calculators"><div id="cl-basic"><section class="cl-card" aria-labelledby="cl-title"><div class="cl-heading"><h1 id="cl-title">計算機</h1><span>Calculator</span></div><div class="cl-display"><p id="cl-previous">基本運算</p><input id="cl-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0" maxlength="500" aria-label="算式" aria-describedby="cl-help"><p id="cl-status" role="status" aria-live="polite"></p></div><div class="cl-edit" role="group" aria-label="編輯算式"><button type="button" data-key="(">(</button><button type="button" data-key=")">)</button><button type="button" data-action="delete" aria-label="刪除一個字元">⌫</button><button type="button" id="cl-copy" disabled>複製結果</button></div><div class="cl-keys" role="group" aria-label="計算按鍵">'+[
   ['AC','clear','function','清除'],['±','sign','function','整個算式變號'],['%','%','function','百分比'],['÷','÷','operator','除'],
   ['7','7'],['8','8'],['9','9'],['×','×','operator','乘'],
   ['4','4'],['5','5'],['6','6'],['−','−','operator','減'],
   ['1','1'],['2','2'],['3','3'],['+','+','operator','加'],
   ['0','0','zero'],['.','.'],['=','equals','equal','等於']
  ].map(([label,key,kind,aria])=>'<button type="button" class="cl-key '+(kind?'cl-'+kind:'')+'" '+(['clear','sign','equals'].includes(key)?'data-action':'data-key')+'="'+key+'"'+(aria?' aria-label="'+aria+'"':'')+'>'+label+'</button>').join('')+'</div><p id="cl-help">支援鍵盤輸入、括號與乘除優先。Enter 計算 · Esc 清除<br>% 表示除以100。</p></section></div><div id="cl-aaos"></div></div>';
  calendar=mountCalendar(document.getElementById('cl-basic'));
  root.ScholarAAOS?.mount();
  const specialty=document.createElement('div');specialty.className='cl-specialty';
  const aaos=document.getElementById('cl-aaos');aaos.before(specialty);
  const functionRow=document.createElement('div');functionRow.className='cl-functional-row';specialty.append(functionRow);
  const quickdash=document.createElement('div');quickdash.id='cl-quickdash';functionRow.append(quickdash,aaos);root.ScholarQuickDASH?.mount();
  const california=document.createElement('div');california.id='cl-california';specialty.append(california);root.ScholarCalifornia?.mount();
  const overload=document.createElement('div');overload.id='cl-overload';specialty.append(overload);root.ScholarOverload?.mount();
  const input=document.getElementById('cl-input'),previous=document.getElementById('cl-previous'),status=document.getElementById('cl-status'),copy=document.getElementById('cl-copy');let evaluated=false,result='';
  function persist(){root.ScholarStorage.setItem('scholar-calculator-v1',JSON.stringify({input:input.value,previous:previous.textContent,result,evaluated}));}
  function changed(){evaluated=false;result='';copy.disabled=true;status.textContent='';input.removeAttribute('aria-invalid');persist();}
  function clear(){input.value='';previous.textContent='基本運算';changed();}
  function insert(key){if(evaluated){if(/[0-9.(]/.test(key))input.value='';input.setSelectionRange(input.value.length,input.value.length);}const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;input.setRangeText(key,start,end,'end');changed();}
  function action(name){
   if(name==='clear')clear();
   else if(name==='sign'){input.value=input.value?'−('+input.value+')':'−';changed();}
   else if(name==='delete'){if(evaluated)input.setSelectionRange(input.value.length,input.value.length);const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;input.setRangeText('',start===end?Math.max(0,start-1):start,end,'end');changed();}
   else if(name==='equals'){try{const expression=input.value;result=calculate(expression);previous.textContent=expression+' =';input.value=result;evaluated=true;copy.disabled=false;input.removeAttribute('aria-invalid');status.textContent='結果：'+result;if(document.activeElement===input)input.select();}catch(e){status.textContent=e.message;input.setAttribute('aria-invalid','true');copy.disabled=true;evaluated=false;}}
  }
  panel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.key)insert(b.dataset.key);else if(b.dataset.action)action(b.dataset.action);});
  input.addEventListener('input',changed);
  input.addEventListener('focus',()=>{if(evaluated)input.select();});
  input.addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='Enter'||e.key==='='){e.preventDefault();action('equals');}else if(e.key==='Escape'){e.preventDefault();clear();}else if(evaluated&&['+','-','*','/','%'].includes(e.key))input.setSelectionRange(input.value.length,input.value.length);});
  copy.addEventListener('click',async()=>{if(!result)return;try{await navigator.clipboard.writeText(result);status.textContent='已複製結果。';}catch(_){input.focus();input.select();status.textContent='請按 Ctrl+C 或長按複製結果。';}});
  function hydrate(){const saved=JSON.parse(root.ScholarStorage.getItem('scholar-calculator-v1')||'{}');input.value=saved.input||'';previous.textContent=saved.previous||'基本運算';result=saved.result||'';evaluated=Boolean(saved.evaluated);copy.disabled=!result;}
  panel.addEventListener('click',()=>queueMicrotask(persist));input.addEventListener('input',()=>queueMicrotask(persist));input.addEventListener('keydown',()=>queueMicrotask(persist));
  root.ScholarSync.subscribe(key=>{if(key==='scholar-calculator-v1')hydrate();});hydrate();

 }
 root.ScholarCalculator={show,followupDate,dayInfo,monthWeek,weekDates};
})(typeof window==='undefined'?globalThis:window);
