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
 if(typeof module!=='undefined'&&module.exports)module.exports={calculate};
 if(typeof document==='undefined')return;
 let ready=false;
 function show(){
  if(ready){root.ScholarAAOS?.mount();return;}ready=true;
  const panel=document.getElementById('calculator-panel');
  panel.innerHTML='<div class="cl-calculators"><div id="cl-basic"><section class="cl-card" aria-labelledby="cl-title"><div class="cl-heading"><h1 id="cl-title">計算機</h1><span>Calculator</span></div><div class="cl-display"><p id="cl-previous">基本運算</p><input id="cl-input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0" maxlength="500" aria-label="算式" aria-describedby="cl-help"><p id="cl-status" role="status" aria-live="polite"></p></div><div class="cl-edit" role="group" aria-label="編輯算式"><button type="button" data-key="(">(</button><button type="button" data-key=")">)</button><button type="button" data-action="delete" aria-label="刪除一個字元">⌫</button><button type="button" id="cl-copy" disabled>複製結果</button></div><div class="cl-keys" role="group" aria-label="計算按鍵">'+[
   ['AC','clear','function','清除'],['±','sign','function','整個算式變號'],['%','%','function','百分比'],['÷','÷','operator','除'],
   ['7','7'],['8','8'],['9','9'],['×','×','operator','乘'],
   ['4','4'],['5','5'],['6','6'],['−','−','operator','減'],
   ['1','1'],['2','2'],['3','3'],['+','+','operator','加'],
   ['0','0','zero'],['.','.'],['=','equals','equal','等於']
  ].map(([label,key,kind,aria])=>'<button type="button" class="cl-key '+(kind?'cl-'+kind:'')+'" '+(['clear','sign','equals'].includes(key)?'data-action':'data-key')+'="'+key+'"'+(aria?' aria-label="'+aria+'"':'')+'>'+label+'</button>').join('')+'</div><p id="cl-help">支援鍵盤輸入、括號與乘除優先。Enter 計算 · Esc 清除<br>% 表示除以100。</p></section></div><div id="cl-aaos"></div></div>';
  root.ScholarAAOS?.mount();
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
