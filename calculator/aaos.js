/* AAOS Lower Limb Core Scale. Source ranges and exact constants are in aaos.json. */
((root)=>{
 'use strict';
 const round=n=>Math.sign(n)*Math.floor(Math.abs(n)+.5);
 function severityFor(score,data){return data.severity.find(s=>score>=s.min&&score<=s.max)||null;}
 function scoreAAOS(answers,data){
  if(!Array.isArray(answers)||answers.length!==7)throw Error('需要7題答案。');
  let answered=0,valid=0,raw=0;const omitted=[],missing=[],components=[];
  data.questions.forEach((q,i)=>{
   const value=answers[i];
   if(value===null||value===undefined||value===''){omitted.push(i+1);components.push(null);return;}
   const n=Number(value);if(!['number','string'].includes(typeof value)||!Number.isInteger(n)||n<1||n>q.max)throw Error('Q'+(i+1)+'的答案代碼無效。');
   answered++;if(q.missingCode===n){missing.push(i+1);components.push(null);return;}
   const component=(n-1)*q.factor;raw+=component;valid++;components.push(component);
  });
  const base={answered,valid,raw,omitted,missing,components,ready:valid>=data.required};
  if(!base.ready)return base;
  const mean=raw/valid,standardized=Math.max(0,Math.min(100,100-mean*20)),normative=50+10*(standardized-data.populationMean)/data.populationSD,displayScore=round(standardized);
  return {...base,mean,standardized,normative,displayScore,displayNormative:round(normative),severity:severityFor(displayScore,data)};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={scoreAAOS,severityFor,round};
 if(typeof document==='undefined')return;
 let data=null,promise=null;
 async function mount(){
  const host=document.getElementById('cl-aaos');if(data){focusFirst();return;}if(promise)return promise;
  host.innerHTML='<p class="aa-loading" role="status">載入AAOS計分資料…</p>';
  promise=(async()=>{try{
   const response=await fetch('calculator/aaos.json');if(!response.ok)throw Error();data=await response.json();render(host);
  }catch(_){data=null;promise=null;host.innerHTML='<p class="aa-loading" role="status">無法載入計分資料。<button type="button" id="aa-retry">重試</button></p>';document.getElementById('aa-retry').onclick=mount;}})();return promise;
 }
 function focusFirst(){
  const first=document.getElementById('aa-q1');
  if(first&&first.getClientRects().length&&!matchMedia('(pointer:coarse)').matches){first.focus({preventScroll:true});first.select();}
 }
 function render(host){
  host.innerHTML='<section class="aa-compact" aria-label="AAOS下肢計算器"><h2 class="aa-label">AAOS</h2><form id="aa-form" autocomplete="off" novalidate><div class="aa-inputs">'+data.questions.map((q,i)=>'<label for="aa-'+q.id+'">Q'+(i+1)+'<input id="aa-'+q.id+'" name="'+q.id+'" type="text" inputmode="numeric" maxlength="1" pattern="[1-'+q.max+']" aria-label="Q'+(i+1)+'，1至'+q.max+'" placeholder="—" spellcheck="false"></label>').join('')+'</div></form><p id="aa-error" role="status"></p><div id="aa-result" role="status" aria-live="polite" aria-atomic="true"><p class="aa-score">—<span>／100</span></p><p class="aa-severity">—</p></div></section>';
  const fields=[...host.querySelectorAll('input')],score=host.querySelector('.aa-score'),severity=host.querySelector('.aa-severity'),error=document.getElementById('aa-error');
  function update(){
   let invalid=null;
   fields.forEach((field,i)=>{const bad=field.value!==''&&!new RegExp('^[1-'+data.questions[i].max+']$').test(field.value);field.setAttribute('aria-invalid',String(bad));if(bad&&!invalid)invalid='Q'+(i+1)+'：1–'+data.questions[i].max;});
   error.textContent=invalid||'';
   const result=invalid?null:scoreAAOS(fields.map(f=>f.value),data);
   score.innerHTML=(result?.ready?result.displayScore:'—')+'<span>／100</span>';
   severity.textContent=result?.ready?result.severity.label:'—';
  }
  fields.forEach((field,i)=>{
   let previous=field.value;
   function accept(){
    const normalized=field.value.normalize('NFKC');
    if(normalized!==''&&!/^[0-9]$/.test(normalized)){field.value=previous;update();return;}
    field.value=normalized;previous=normalized;update();
    if(new RegExp('^[1-'+data.questions[i].max+']$').test(field.value)&&i<6)fields[i+1].focus();
   }
   field.addEventListener('input',e=>{if(!e.isComposing)accept();});
   field.addEventListener('compositionend',accept);
   field.addEventListener('focus',()=>field.select());field.addEventListener('click',()=>field.select());
   field.addEventListener('beforeinput',e=>{
    if(e.isComposing||e.inputType!=='insertText')return;
    e.preventDefault();const digit=(e.data||'').normalize('NFKC');
    if(/^[0-9]$/.test(digit)){field.value=digit;accept();}
   });
   field.addEventListener('paste',e=>{e.preventDefault();const digit=e.clipboardData.getData('text').trim().normalize('NFKC');if(/^[0-9]$/.test(digit)){field.value=digit;accept();}});
   field.addEventListener('keydown',e=>{
    if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
    const digit=e.key.normalize('NFKC');
    if(/^[0-9]$/.test(digit)){e.preventDefault();e.stopPropagation();field.value=digit;accept();}
    else if(e.key.length===1){e.preventDefault();}
    else if(e.key==='Enter'){e.preventDefault();fields[Math.min(i+1,6)].focus();}
   });
  });
  document.getElementById('aa-form').addEventListener('submit',e=>e.preventDefault());
  update();focusFirst();
 }
 root.ScholarAAOS={mount};
})(typeof window==='undefined'?globalThis:window);
