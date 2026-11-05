/* Compact AAOS and QuickDASH scores. AAOS source constants are in aaos.json. */
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
 // IWH QuickDASH Information for Users, p.4: at least 10/11 responses;
 // disability/symptom score = (mean of completed 1-5 responses - 1) * 25.
 // https://dash.iwh.on.ca/sites/dash/files/downloads/QuickDASH_scoring_2010.pdf
 function scoreQuickDASH(answers){
  if(!Array.isArray(answers)||answers.length!==11)throw Error('需要11題答案。');
  let valid=0,sum=0;
  answers.forEach((value,i)=>{
   const raw=typeof value==='string'?value.normalize('NFKC').trim():value;
   if(raw===null||raw===undefined||raw==='')return;
   if(!['number','string'].includes(typeof raw)||(typeof raw==='string'&&!/^[1-5]$/.test(raw))||!Number.isInteger(Number(raw))||Number(raw)<1||Number(raw)>5)throw Error('Q'+(i+1)+'：1–5');
   valid++;sum+=Number(raw);
  });
  return {valid,ready:valid>=10,score:valid>=10?(sum/valid-1)*25:null};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={scoreAAOS,severityFor,round,scoreQuickDASH};
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
  if(document.activeElement?.closest('#cl-quickdash'))return;
  const first=document.getElementById('aa-q1');
  if(first&&first.getClientRects().length&&!matchMedia('(pointer:coarse)').matches){first.focus({preventScroll:true});first.select();}
 }
 function render(host){
  host.innerHTML='<section class="aa-compact" aria-label="AAOS下肢計算器"><h2 class="aa-label">AAOS</h2><form id="aa-form" autocomplete="off" novalidate><div class="aa-inputs">'+data.questions.map((q,i)=>'<label for="aa-'+q.id+'"><input id="aa-'+q.id+'" name="'+q.id+'" type="text" inputmode="numeric" maxlength="1" pattern="[1-'+q.max+']" aria-label="Q'+(i+1)+'，1至'+q.max+'" placeholder="—" spellcheck="false"></label>').join('')+'</div></form><p id="aa-error" role="status"></p><div id="aa-result" role="status" aria-live="polite" aria-atomic="true"><p class="aa-score">—<span>／100</span></p><p class="aa-severity">—</p></div></section>';
  const fields=[...host.querySelectorAll('input')],score=host.querySelector('.aa-score'),severity=host.querySelector('.aa-severity'),error=document.getElementById('aa-error');
  const previousValues=fields.map(()=> '');
  const reset=document.createElement('button');reset.type='button';reset.id='aa-reset';reset.textContent='↺';reset.title='重設 AAOS';reset.setAttribute('aria-label','重設 AAOS');host.querySelector('.aa-compact').append(reset);
  function update(persist=true){
   let invalid=null;
   fields.forEach((field,i)=>{const bad=field.value!==''&&!new RegExp('^[1-'+data.questions[i].max+']$').test(field.value);field.setAttribute('aria-invalid',String(bad));if(bad&&!invalid)invalid='Q'+(i+1)+'：1–'+data.questions[i].max;});
   error.textContent=invalid||'';
   const result=invalid?null:scoreAAOS(fields.map(f=>f.value),data);
   score.innerHTML=(result?.ready?result.displayScore:'—')+'<span>／100</span>';
   severity.textContent=result?.ready?result.severity.original:'—';
   if(persist)root.ScholarStorage.setItem('scholar-aaos-v1',JSON.stringify({answers:fields.map(f=>f.value)}));
  }
  function deleteBackward(i){
   const target=fields[i].value===''&&i>0?fields[i-1]:fields[i];
   target.value='';target.dispatchEvent(new Event('input',{bubbles:true}));target.focus();
  }
  fields.forEach((field,i)=>{
   function accept(){
    const normalized=field.value.normalize('NFKC');
    if(normalized!==''&&!/^[0-9]$/.test(normalized)){field.value=previousValues[i];update();return;}
    field.value=normalized;previousValues[i]=normalized;update();
    if(new RegExp('^[1-'+data.questions[i].max+']$').test(field.value)&&i<6)fields[i+1].focus();
   }
   field.addEventListener('input',e=>{if(!e.isComposing)accept();});
   field.addEventListener('compositionend',accept);
   field.addEventListener('focus',()=>field.select());field.addEventListener('click',()=>field.select());
   field.addEventListener('beforeinput',e=>{
    if(e.isComposing)return;
    if(e.inputType==='deleteContentBackward'){e.preventDefault();deleteBackward(i);return;}
    if(e.inputType!=='insertText')return;
    e.preventDefault();const digit=(e.data||'').normalize('NFKC');
    if(/^[0-9]$/.test(digit)){field.value=digit;accept();}
   });
   field.addEventListener('paste',e=>{e.preventDefault();const digit=(e.clipboardData.getData('text/plain')||e.clipboardData.getData('text')).trim().normalize('NFKC');if(/^[0-9]$/.test(digit)){field.value=digit;accept();}});
   field.addEventListener('keydown',e=>{
    if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='Backspace'){e.preventDefault();e.stopPropagation();deleteBackward(i);return;}
    const digit=e.key.normalize('NFKC');
    if(/^[0-9]$/.test(digit)){e.preventDefault();e.stopPropagation();field.value=digit;accept();}
    else if(e.key.length===1){e.preventDefault();}
    else if(e.key==='Enter'){e.preventDefault();fields[Math.min(i+1,6)].focus();}
   });
  });
  document.getElementById('aa-form').addEventListener('submit',e=>e.preventDefault());
  reset.addEventListener('click',()=>{fields.forEach(f=>f.value='');previousValues.fill('');update();focusFirst();});
  function hydrate(){const saved=JSON.parse(root.ScholarStorage.getItem('scholar-aaos-v1')||'{}');fields.forEach((f,i)=>{f.value=String(saved.answers?.[i]||'');previousValues[i]=f.value;});update(false);}
  root.ScholarSync.subscribe(key=>{if(key==='scholar-aaos-v1')hydrate();});
  hydrate();focusFirst();
 }
 function mountQuickDASH(){
  const host=document.getElementById('cl-quickdash');if(!host||host.dataset.ready)return;
  host.dataset.ready='true';
  host.innerHTML='<section class="qd-compact" aria-label="QuickDASH計算器"><h2 class="qd-label">QuickDASH</h2><form id="qd-form" autocomplete="off" novalidate><div class="qd-inputs">'+Array.from({length:11},(_,i)=>'<label><input id="qd-q'+(i+1)+'" name="q'+(i+1)+'" type="text" inputmode="numeric" maxlength="1" pattern="[1-5]" aria-label="QuickDASH Q'+(i+1)+'，1至5" placeholder="—" spellcheck="false"></label>').join('')+'</div></form><p id="qd-error" role="status"></p><output id="qd-result" aria-live="polite" aria-atomic="true"><span id="qd-score">—</span><span class="qd-unit">／100</span></output><button type="button" id="qd-reset" title="重設 QuickDASH" aria-label="重設 QuickDASH">↺</button></section>';
  const fields=[...host.querySelectorAll('input')],previous=fields.map(()=>''),score=document.getElementById('qd-score'),error=document.getElementById('qd-error'),key='scholar-quickdash-v1';
  let persisted='';
  function update(save=true){
   fields.forEach(field=>{const invalid=String(field.value!==''&&!/^[1-5]$/.test(field.value));if(field.getAttribute('aria-invalid')!==invalid)field.setAttribute('aria-invalid',invalid);});
   let value='—',message='';
   try{const result=scoreQuickDASH(fields.map(f=>f.value));if(result.ready)value=result.score.toLocaleString('en-US',{maximumFractionDigits:2});}catch(e){message=e.message;}
   if(score.textContent!==value)score.textContent=value;
   if(error.textContent!==message)error.textContent=message;
   const raw=JSON.stringify(Object.fromEntries(fields.map(f=>[f.name,f.value])));
   if(save&&raw!==persisted)root.ScholarStorage.setItem(key,raw);
   persisted=raw;
  }
  function backward(i){const at=fields[i].value===''&&i>0?i-1:i;fields[at].value='';previous[at]='';update();fields[at].focus();}
  fields.forEach((field,i)=>{
   function accept(){
    const digit=field.value.normalize('NFKC');
    if(digit!==''&&!/^[0-9]$/.test(digit)){field.value=previous[i];return;}
    field.value=digit;previous[i]=digit;update();
    if(/^[1-5]$/.test(digit)&&i<10)fields[i+1].focus();
   }
   field.addEventListener('input',e=>{if(!e.isComposing)accept();});field.addEventListener('compositionend',accept);
   field.addEventListener('focus',()=>field.select());field.addEventListener('click',()=>field.select());
   field.addEventListener('beforeinput',e=>{
    if(e.isComposing)return;
    if(e.inputType==='deleteContentBackward'){e.preventDefault();backward(i);return;}
    if(e.inputType!=='insertText')return;
    e.preventDefault();const digit=(e.data||'').normalize('NFKC');if(/^[0-9]$/.test(digit)){field.value=digit;accept();}
   });
   field.addEventListener('paste',e=>{e.preventDefault();const digit=(e.clipboardData.getData('text/plain')||e.clipboardData.getData('text')).trim().normalize('NFKC');if(/^[0-9]$/.test(digit)){field.value=digit;accept();}});
   field.addEventListener('keydown',e=>{
    if(e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='Backspace'){e.preventDefault();e.stopPropagation();backward(i);return;}
    const digit=e.key.normalize('NFKC');
    if(/^[0-9]$/.test(digit)){e.preventDefault();e.stopPropagation();field.value=digit;accept();}
    else if(e.key.length===1)e.preventDefault();
    else if(e.key==='Enter'){e.preventDefault();fields[Math.min(i+1,10)].focus();}
   });
  });
  document.getElementById('qd-form').addEventListener('submit',e=>e.preventDefault());
  document.getElementById('qd-reset').addEventListener('click',()=>{fields.forEach(f=>f.value='');previous.fill('');update();if(!matchMedia('(pointer:coarse)').matches)fields[0].focus({preventScroll:true});});
  function hydrate(){
   let saved={};try{saved=JSON.parse(root.ScholarStorage.getItem(key)||'{}')||{};}catch(_){}
   fields.forEach((field,i)=>{field.value=String(saved[field.name]??'');previous[i]=field.value;});update(false);
  }
  root.ScholarSync.subscribe(changed=>{if(changed===key)hydrate();});hydrate();
 }
 root.ScholarAAOS={mount};
 root.ScholarQuickDASH={mount:mountQuickDASH};
})(typeof window==='undefined'?globalThis:window);
