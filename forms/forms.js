/* Patient-completed questionnaires; no item is preselected. */
((root)=>{
 'use strict';
 function scoreBSRS(values){
  if(!Array.isArray(values)||values.length!==6)throw Error('需要5題與1題附加題。');
  values.forEach(v=>{if(v!==null&&v!==''&&(!Number.isInteger(v)||v<0||v>4))throw Error('答案須為0至4分。');});
  const ready=values.slice(0,5).every(v=>Number.isInteger(v));
  const total=ready?values.slice(0,5).reduce((a,b)=>a+b,0):null;
  return {ready,total,extra:values[5],level:!ready?'':total<6?'身心適應狀況良好':total<10?'輕度情緒困擾':total<15?'中度情緒困擾':'重度情緒困擾'};
 }
 function scorePDQ(values){
  if(!Array.isArray(values)||values.length!==15)throw Error('需要15題答案。');
  values.forEach(v=>{if(v!==null&&v!==''&&(!Number.isInteger(v)||v<0||v>10))throw Error('答案須為0至10分。');});
  if(!values.every(v=>Number.isInteger(v)))return {ready:false,total:null,level:''};
  const total=values.reduce((a,b)=>a+b,0);
  return {ready:true,total,level:total===0?'None':total<=70?'Mild':total<=100?'Moderate':total<=130?'Severe':'Extreme'};
 }
 // Chart-note text: answered items in form order, then the same result the page shows.
 function buildNote(form,values,calculated){
  if(!values.some(v=>v!==null))return '';
  const lines=[form.name+(form.subtitle?'（'+form.subtitle+'）':'')];
  form.questions.forEach((q,i)=>{if(values[i]===null)return;const option=q.options.find(o=>o.value===values[i]);lines.push((form.id==='bsrs'&&i===5?'★ ':(i+1)+'. ')+q.text+'：'+(form.id==='pdq'?values[i]:option?option.label+'（'+values[i]+'）':values[i]));});
  const answered=values.filter(v=>v!==null).length;
  if(!calculated||!calculated.ready)lines.push('尚未完成（已填 '+answered+' / '+values.length+' 題），不計分。');
  else{
   const value=calculated.total??calculated.displayScore??calculated.score,max=form.id==='bsrs'?20:form.id==='pdq'?150:100,level=calculated.level||calculated.severity?.original;
   lines.push('結果：'+Number(value).toLocaleString('en-US',{maximumFractionDigits:2})+' / '+max+(level?'，'+level:''));
   if(form.id==='quickdash'&&values.includes(null))lines.push('已依 '+answered+' 題計分；未填第 '+values.map((v,i)=>v===null?i+1:null).filter(v=>v!==null).join('、')+' 題。');
  }
  if(form.id==='bsrs')lines.push('附加題：'+(values[5]===null?'未填':values[5]+' 分')+'（不計入總分）');
  return lines.join('\n');
 }
 if(typeof module==='object'&&module.exports)module.exports={scoreBSRS,scorePDQ,buildNote};
 if(typeof document==='undefined')return;
 const KEY=id=>'scholar-form-'+id+'-v1';
 let catalog=null,aaos=null,guide=null,loading=null,active='bsrs',views=new Map();
 const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 function read(id){try{return JSON.parse(root.ScholarStorage.getItem(KEY(id))||'{}')||{};}catch(_){return {};}}
 function score(form,values){
  if(form.id==='bsrs')return scoreBSRS(values);
  if(form.id==='pdq')return scorePDQ(values);
  if(form.id==='aaos')return root.ScholarQuestionnaireScores.scoreAAOS(values,aaos);
  return root.ScholarQuestionnaireScores.scoreQuickDASH(values);
 }
 function mountForm(form,host){
  const section=element('section','','fm-questionnaire fm-paper');section.id='fm-'+form.id;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','fm-tab-'+form.id);section.hidden=form.id!==active;
  const heading=element('div','','fm-heading');heading.append(element('h1',form.subtitle||form.name));section.append(heading);
  if(form.intro)section.append(element('p',form.intro,'fm-paper-instructions'));
  if(form.notice)section.append(element('p',form.notice,'fm-version'));
  if(form.pending){section.append(element('p','完整題目尚待匯入，請使用原始問卷。','fm-pending'));host.append(section);views.set(form.id,{section,hydrate(){}});return;}
  const questionnaire=element('form');questionnaire.id='fm-answers-'+form.id;questionnaire.noValidate=true;const groups=[];let matrix=null,matrixKey='';
  function option(q,index,answer,withText=false){
   const label=element('label','','fm-paper-number'),input=document.createElement('input'),number=element('span',String(answer.value),'fm-paper-value');
   input.type='radio';input.name='q'+(index+1);input.value=String(answer.value);input.id='fm-'+form.id+'-q'+(index+1)+'-v'+answer.value;input.setAttribute('aria-label','第'+(index+1)+'題，'+answer.label+'（'+answer.value+'）');
   input.addEventListener('change',()=>{if(!input.checked)return;submitted=false;const saved=read(form.id);saved[input.name]=Number(input.value);saved.submitted=false;root.ScholarStorage.setItem(KEY(form.id),JSON.stringify(saved));update();});
   label.append(input,number);if(withText){label.classList.add('fm-paper-statement');label.append(element('span',answer.label,'fm-paper-answer'));}return label;
  }
  function clearQuestion(index){const clear=element('button','↻','fm-paper-clear');clear.type='button';clear.title='清除此題';clear.setAttribute('aria-label','清除第'+(index+1)+'題');clear.onclick=()=>{const saved=read(form.id);delete saved['q'+(index+1)];saved.submitted=false;root.ScholarStorage.setItem(KEY(form.id),JSON.stringify(saved));hydrate();};return clear;}
  form.questions.forEach((q,i)=>{
   if(q.section){questionnaire.append(element('h2',q.section,'fm-section-title'));matrixKey='';}
   const questionText=(form.id==='bsrs'&&i===5?'★ ':String(i+1)+'. ')+q.text;
   let group;
   if(form.id==='pdq'){
    group=element('fieldset','','fm-paper-block fm-paper-pdq');group.append(element('legend',questionText));
    const scale=element('div','','fm-paper-scale'),numbers=element('div','','fm-paper-numbers');q.options.forEach(answer=>numbers.append(option(q,i,answer)));
    scale.append(element('span',q.anchors[0],'fm-paper-anchor fm-paper-left'),numbers,element('span',q.anchors[1],'fm-paper-anchor fm-paper-right'));group.append(scale);questionnaire.append(group);matrixKey='';
   }else if(form.id==='aaos'&&i===5){
    group=element('fieldset','','fm-paper-block');group.append(element('legend',questionText));const list=element('div','','fm-paper-statements');q.options.forEach(answer=>list.append(option(q,i,answer,true)));group.append(list);questionnaire.append(group);matrixKey='';
   }else{
    const key=JSON.stringify([q.options,q.prompt||'']);
    if(key!==matrixKey){
     const table=element('table','','fm-paper-table');table.setAttribute('aria-label',form.name+' 選項');table.style.setProperty('--fm-choice-count',String(q.options.length));
     if(q.prompt)table.append(element('caption',q.prompt));
     const cols=document.createElement('colgroup'),questionCol=document.createElement('col');questionCol.className='fm-paper-question-col';questionCol.style.width=q.options.length>5?'38%':'45%';cols.append(questionCol);q.options.forEach(()=>cols.append(document.createElement('col')));table.append(cols);
     const head=document.createElement('thead'),row=document.createElement('tr'),topic=element('th',form.id==='bsrs'?'最近一週以來，您是否有…':'');topic.scope='col';row.append(topic);
     q.options.forEach(answer=>{const cell=element('th',answer.label);cell.scope='col';row.append(cell);});head.append(row);table.append(head);matrix=document.createElement('tbody');table.append(matrix);questionnaire.append(table);matrixKey=key;
    }
    group=element('tr','','fm-paper-row');const question=element('th',questionText,'fm-paper-question');question.scope='row';group.append(question);
    q.options.forEach(answer=>{const cell=document.createElement('td');cell.append(option(q,i,answer));group.append(cell);});matrix.append(group);
    if(form.id==='quickdash')question.append(clearQuestion(i));
   }
   group.id='fm-'+form.id+'-q'+(i+1);groups.push(group);
  });
  const footer=element('div','', 'fm-footer'),progress=element('span','', 'fm-progress'),submit=element('button','完成作答','fm-primary'),reset=element('button','清除本份','fm-reset'),copy=element('button','複製結果','fm-copy');submit.type='submit';submit.setAttribute('form',questionnaire.id);reset.type=copy.type='button';progress.setAttribute('aria-live','polite');footer.append(progress,copy,reset,submit);
  copy.onclick=()=>{const answers=values();let calculated=null;try{calculated=score(form,answers);}catch(_){}const text=buildNote(form,answers,calculated);if(text)root.ScholarGuideForms.copyText(text,section,progress,'fm-'+form.id);};questionnaire.append(footer);
  const result=element('section','', 'fm-result');result.setAttribute('role','status');result.setAttribute('aria-live','polite');result.hidden=true;
  let submitted=false;
  function values(){return groups.map(group=>{const checked=group.querySelector('input[type=radio]:checked');return checked?Number(checked.value):null;});}
  function update(){
   const answers=values(),done=answers.filter(v=>v!==null).length;progress.textContent=`已填 ${done} / ${answers.length} 題`;copy.disabled=!done;section.querySelector('.fm-copy-fallback')?.remove();
   groups.forEach((group,i)=>group.classList.toggle('fm-answered',answers[i]!==null));result.replaceChildren();result.hidden=!submitted;
   if(!submitted)return;
   const calculated=score(form,answers);
   if(!calculated.ready){result.append(element('p','尚未完成，請確認未填的題目。'));return;}
   let value=calculated.total??calculated.displayScore??calculated.score;
   result.append(element('h2','填寫結果'),element('p',Number(value).toLocaleString('en-US',{maximumFractionDigits:2})+' / '+(form.id==='bsrs'?20:form.id==='pdq'?150:100),'fm-total'));
   const level=calculated.level||calculated.severity?.original;if(level)result.append(element('p',level));
   if(form.id==='quickdash' && answers.includes(null))result.append(element('p','已依 '+answers.filter(v=>v!==null).length+' 題計分；未填第 '+answers.map((v,i)=>v===null?i+1:null).filter(v=>v!==null).join('、')+' 題。'));
   if(form.id==='bsrs'){
    result.append(element('p','附加題：'+(answers[5]===null?'未填':answers[5]+' 分')+'（不計入總分）'));
    if(answers[5]>=2)result.append(element('p','請將附加題的答案告訴現場醫療人員，安排進一步評估。','fm-attention'));
   }
   result.append(element('p','請將此畫面交給醫療人員確認。','fm-intro'));
  }
  function hydrate(){
   const saved=read(form.id);
   groups.forEach((group,i)=>{const value=saved['q'+(i+1)],valid=form.questions[i].options.some(option=>option.value===value);group.querySelectorAll('input[type=radio]').forEach(input=>input.checked=valid&&Number(input.value)===value);});
   submitted=saved.submitted===true;update();
  }
  questionnaire.onsubmit=event=>{
   event.preventDefault();document.querySelector('.fm-shell')?.classList.remove('fm-menu-open');document.getElementById('fm-menu-toggle')?.setAttribute('aria-expanded','false');const answers=values();const missing=answers.findIndex(v=>v===null);
   if(missing!==-1 && !(form.id==='quickdash' && answers.filter(v=>v!==null).length>=10)){submitted=false;update();groups[missing].scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});groups[missing].querySelector('input[type=radio]').focus({preventScroll:true});progress.textContent+=' · 請完成第'+(missing+1)+'題';return;}
   submitted=true;const saved=read(form.id);saved.submitted=true;root.ScholarStorage.setItem(KEY(form.id),JSON.stringify(saved));update();result.scrollIntoView({block:'center',behavior:'smooth'});
  };
  reset.onclick=()=>{if(values().some(v=>v!==null)&&!confirm('清除這份問卷的全部答案？'))return;root.ScholarStorage.removeItem(KEY(form.id));hydrate();};
  section.append(questionnaire,result);host.append(section);views.set(form.id,{section,footer,hydrate});hydrate();
 }
 function select(id,closeMenu=true){const changed=active!==id;active=id;views.forEach((view,key)=>{view.section.hidden=key!==id;if(view.footer)view.footer.hidden=key!==id;});document.querySelectorAll('[data-form]').forEach(button=>{const chosen=button.dataset.form===id;button.setAttribute('aria-selected',String(chosen));button.tabIndex=chosen?0:-1;});if(changed)document.querySelector('.fm-content')?.scrollTo(0,0);if(closeMenu){document.querySelector('.fm-shell')?.classList.remove('fm-menu-open');const toggle=document.getElementById('fm-menu-toggle');if(toggle)toggle.setAttribute('aria-expanded','false');}}
 function sizePanel(){const panel=document.getElementById('forms-panel');if(panel&&!panel.hidden)panel.style.height=Math.max(200,root.innerHeight-panel.getBoundingClientRect().top)+'px';}
 async function show(){
  if(catalog){select(active);requestAnimationFrame(sizePanel);return;}
  if(loading)return loading;
  const panel=document.getElementById('forms-panel');panel.textContent='載入表單…';
  loading=(async()=>{try{
   const responses=await Promise.all(['forms/data.json','calculator/aaos.json','forms/guide-forms.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error('無法載入表單');return r.json();})));catalog=responses[0];aaos=responses[1];guide=responses[2];panel.replaceChildren();
   const shell=element('div','', 'fm-shell'),tabs=element('div','', 'fm-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-orientation','vertical');tabs.id='fm-menu';tabs.setAttribute('aria-label','選擇表單');
   const forms=[...catalog.forms,{id:'mmse',name:'MMSE'},{id:'mse',name:'MSE'},{id:'midas',name:'MIDAS'},...guide.forms.map(form=>({...form,guide:true}))];
   forms.forEach(form=>{const button=element('button',form.name);button.type='button';button.dataset.form=form.id;button.id='fm-tab-'+form.id;button.setAttribute('role','tab');button.setAttribute('aria-controls','fm-'+form.id);button.onclick=()=>select(form.id);tabs.append(button);});
   tabs.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();shell.classList.remove('fm-menu-open');document.getElementById('fm-menu-toggle').setAttribute('aria-expanded','false');document.getElementById('fm-menu-toggle').focus();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...tabs.children],index=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+buttons.length)%buttons.length;select(buttons[next].dataset.form,false);buttons[next].focus();};
   const toggle=element('button','表單選單','fm-menu-toggle');toggle.id='fm-menu-toggle';toggle.type='button';toggle.setAttribute('aria-controls','fm-menu');toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>{const open=shell.classList.toggle('fm-menu-open');toggle.setAttribute('aria-expanded',String(open));};
   const content=element('div','', 'fm-content'),side=element('aside','','fm-side'),actions=element('div','','fm-actions');side.append(tabs,actions);shell.append(toggle,side,content);forms.forEach(form=>{if(form.guide)views.set(form.id,root.ScholarGuideForms.mount(form,content));else if(form.id==='midas')views.set(form.id,root.ScholarMIDAS.mount(content));else if(form.id==='mse'||form.id==='mmse')views.set(form.id,root.ScholarClinicalForms.mount(form.id,content));else mountForm(form,content);});views.forEach(view=>{if(view.footer)actions.append(view.footer);});panel.append(shell);select(active);requestAnimationFrame(sizePanel);if(root.ResizeObserver)new ResizeObserver(sizePanel).observe(document.querySelector('.sg-nav-shell')||document.body);root.addEventListener('resize',sizePanel);
   root.ScholarSync.subscribe(key=>{catalog.forms.forEach(form=>{if(key===KEY(form.id))views.get(form.id).hydrate();});views.forEach(view=>{if(view.key&&view.key===key)view.hydrate();});});
  }catch(error){catalog=null;panel.textContent='表單載入失敗。';const retry=element('button','重試');retry.onclick=()=>{loading=null;show();};panel.append(retry);}})();return loading;
 }
 root.ScholarForms={show};
})(typeof window==='undefined'?globalThis:window);
