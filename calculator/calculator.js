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
 function mountCalendar(host){
  const KEY='scholar-calendar-v1', current=()=>{const d=new Date();return d.getFullYear()*12+d.getMonth();};
  let visible=current(),frame=0,timer=0,pending=null;
  const saved=()=>{try{const value=JSON.parse(root.ScholarStorage.getItem(KEY)||'{}')?.month;return Number.isInteger(value)&&value>=15&&value<=119984?value:current();}catch(_){return current();}};
  host.insertAdjacentHTML('beforeend','<section class="cl-calendar" aria-labelledby="cl-calendar-title"><div class="cl-calendar-head"><h2 id="cl-calendar-title">月曆</h2><div><button type="button" data-month-shift="-1" aria-label="上一個月">‹</button><button type="button" id="cl-calendar-today">本月</button><button type="button" data-month-shift="1" aria-label="下一個月">›</button></div></div><div class="cl-calendar-week" aria-hidden="true">'+['日','一','二','三','四','五','六'].map(day=>'<span>'+day+'</span>').join('')+'</div><div id="cl-calendar-scroll" tabindex="0" role="region" aria-label="月曆，上下捲動瀏覽月份"></div></section>');
  const viewport=host.querySelector('#cl-calendar-scroll'),card=host.querySelector('.cl-calendar');
  function refresh(){
   if(pending!==null&&viewport.clientHeight){const found=[...viewport.children].find(el=>Number(el.dataset.month)===pending);if(found)viewport.scrollTop=found.offsetTop;pending=null;}
   const d=new Date(),today=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
   viewport.querySelectorAll('[data-date]').forEach(el=>{
    const match=el.dataset.date===today;el.classList.toggle('is-today',match);
    if(match)el.setAttribute('aria-current','date');else el.removeAttribute('aria-current');
   });
  }
  function month(index){
   const data=monthGrid(index),el=document.createElement('section');el.className='cl-calendar-month';el.dataset.month=index;
   el.setAttribute('aria-label',data.year+'年'+(data.month+1)+'月');
   const title=document.createElement('h3');title.textContent=data.year+'年 '+(data.month+1)+'月';el.append(title);
   const grid=document.createElement('div');grid.className='cl-calendar-days';
   data.days.forEach((day,i)=>{
    const cell=document.createElement('span');cell.className=i%7===0||i%7===6?'is-weekend':'';
    if(day){cell.textContent=day;cell.dataset.date=data.year+'-'+(data.month+1)+'-'+day;cell.setAttribute('aria-label',data.year+'年'+(data.month+1)+'月'+day+'日');}
    else cell.setAttribute('aria-hidden','true');
    grid.append(cell);
   });el.append(grid);return el;
  }
  function reset(index){
   if(index<15||index>119984)return;
   viewport.replaceChildren(...Array.from({length:7},(_,i)=>month(index+i-3)));
   visible=index;pending=index;refresh();
  }
  function persist(){
   clearTimeout(timer);timer=setTimeout(()=>{
    if(saved()!==visible)root.ScholarStorage.setItem(KEY,JSON.stringify({month:visible}));
   },300);
  }
  function jump(index){
   clearTimeout(timer);cancelAnimationFrame(frame);
   const found=[...viewport.children].find(el=>Number(el.dataset.month)===index);
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
    // Add months only at the edges and retain a bounded window of rendered months.
    if(viewport.scrollTop<120&&Number(children[0].dataset.month)>15){
     const anchor=children[0],top=anchor.offsetTop,index=Number(anchor.dataset.month);
     viewport.prepend(...[3,2,1].map(n=>month(index-n)));viewport.scrollTop+=anchor.offsetTop-top;
     while(viewport.children.length>13)viewport.lastElementChild.remove();refresh();
    }else if(viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight<120&&Number(children[children.length-1].dataset.month)<119984){
     const index=Number(children[children.length-1].dataset.month);viewport.append(...[1,2,3].map(n=>month(index+n)));
     if(viewport.children.length>13){const removed=children.slice(0,3).reduce((sum,el)=>sum+el.offsetHeight,0);for(let i=0;i<3;i++)viewport.firstElementChild.remove();viewport.scrollTop-=removed;}
     refresh();
    }
    persist();
   });
  },{passive:true});
  card.addEventListener('click',event=>{
   const button=event.target.closest('button');if(!button)return;
   if(button.id==='cl-calendar-today')jump(current());
   else if(button.dataset.monthShift)jump(visible+Number(button.dataset.monthShift));
  });
  viewport.addEventListener('keydown',event=>{
   if(event.target!==viewport)return;
   if(['ArrowLeft','ArrowRight','PageUp','PageDown','Home'].includes(event.key)){
    event.preventDefault();jump(event.key==='Home'?current():visible+(['ArrowLeft','PageUp'].includes(event.key)?-1:1));
   }
  });
  root.ScholarSync.subscribe(key=>{if(key===KEY&&saved()!==visible){clearTimeout(timer);reset(saved());}});
  reset(saved());return {refresh};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={calculate,monthGrid};
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
 root.ScholarCalculator={show};
})(typeof window==='undefined'?globalThis:window);
