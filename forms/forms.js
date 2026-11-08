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
 if(typeof module==='object'&&module.exports)module.exports={scoreBSRS,scorePDQ};
 if(typeof document==='undefined')return;
 const KEY=id=>'scholar-form-'+id+'-v1';
 let catalog=null,aaos=null,loading=null,active='bsrs',views=new Map();
 const element=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 function read(id){try{return JSON.parse(root.ScholarStorage.getItem(KEY(id))||'{}')||{};}catch(_){return {};}}
 function score(form,values){
  if(form.id==='bsrs')return scoreBSRS(values);
  if(form.id==='pdq')return scorePDQ(values);
  if(form.id==='aaos')return root.ScholarQuestionnaireScores.scoreAAOS(values,aaos);
  return root.ScholarQuestionnaireScores.scoreQuickDASH(values);
 }
 function mountForm(form,host){
  const section=element('section','', 'fm-questionnaire');section.id='fm-'+form.id;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','fm-tab-'+form.id);section.hidden=form.id!==active;
  const heading=element('div','', 'fm-heading');heading.append(element('h1',form.name));section.append(heading);
  if(form.notice)section.append(element('p',form.notice,'fm-version'));
  if(form.pending){section.append(element('p','完整題目尚待匯入，請使用原始問卷；計算機的11題快速計分仍可使用。','fm-pending'));host.append(section);views.set(form.id,{section,hydrate(){}});return;}
  const questionnaire=element('form');questionnaire.id='fm-answers-'+form.id;questionnaire.noValidate=true;const groups=[];
  form.questions.forEach((q,i)=>{
   if(q.section)questionnaire.append(element('h2',q.section,'fm-section-title'));
   const group=element('fieldset','', 'fm-question');group.id='fm-'+form.id+'-q'+(i+1);
   group.append(element('legend',String(i+1)+'. '+q.text));
   if(q.prompt)group.append(element('p',q.prompt,'fm-intro'));
   if(q.original){const original=element('details','', 'fm-original');original.append(element('summary','英文原題'),element('p',q.original));group.append(original);}
   const first=q.options[0],last=q.options.at(-1),anchors=q.anchors||[first.label,last.label];
   const endpoints=element('div','', 'fm-endpoints');endpoints.append(element('span',first.value+' · '+anchors[0]),element('span',last.value+' · '+anchors[1]));group.append(endpoints);
   const wrap=element('div','', 'fm-slider'),range=document.createElement('input'),value=element('output','未作答','fm-slider-value');
   if(!q.anchors)value.classList.add('fm-slider-choice');
   if(q.options.some(option=>option.label.length>28))value.classList.add('fm-slider-long-choice');
   range.type='range';range.name='q'+(i+1);range.min=String(first.value);range.max=String(last.value);range.step='1';range.value=String(Math.round((first.value+last.value)/2));range.dataset.answered='false';range.setAttribute('aria-label','第'+(i+1)+'題，'+first.value+'至'+last.value);
   range.id=group.id+'-slider';value.setAttribute('for',range.id);
   const ticks=element('div','', 'fm-slider-ticks');ticks.setAttribute('aria-hidden','true');q.options.forEach(option=>ticks.append(element('span',String(option.value))));
   const accept=()=>{range.dataset.answered='true';submitted=false;const saved=read(form.id);saved[range.name]=Number(range.value);saved.submitted=false;root.ScholarStorage.setItem(KEY(form.id),JSON.stringify(saved));update();};
   range.addEventListener('input',accept);range.addEventListener('change',accept);range.addEventListener('pointerup',accept);
   const dots=element('div','', 'fm-start-dots');dots.setAttribute('aria-hidden','true');
   for(let point=0;point<5;point++)dots.append(element('span','', 'fm-start-dot'));
   const rail=element('div','', 'fm-slider-rail'),hint=element('span','左右滑動作答','fm-slider-hint');rail.append(range,dots);
   wrap.append(value,rail,ticks,hint);group.append(wrap);
   if(form.id==='quickdash'){const clear=element('button','清除此題','fm-clear-question');clear.type='button';clear.onclick=()=>{const saved=read(form.id);delete saved['q'+(i+1)];saved.submitted=false;root.ScholarStorage.setItem(KEY(form.id),JSON.stringify(saved));hydrate();};group.append(clear);}
   questionnaire.append(group);groups.push(group);
  });
  const footer=element('div','', 'fm-footer'),progress=element('span','', 'fm-progress'),submit=element('button','完成作答','fm-primary'),reset=element('button','清除本份','fm-reset');submit.type='submit';submit.setAttribute('form',questionnaire.id);reset.type='button';footer.append(progress,reset,submit);questionnaire.append(footer);
  const result=element('section','', 'fm-result');result.setAttribute('role','status');result.setAttribute('aria-live','polite');result.hidden=true;
  let submitted=false;
  function values(){return groups.map(g=>{const slider=g.querySelector('input[type=range]');return slider.dataset.answered==='true'?Number(slider.value):null;});}
  function update(){
   const answers=values(),done=answers.filter(v=>v!==null).length;progress.textContent=`已填 ${done} / ${answers.length} 題`;
   groups.forEach((g,i)=>{
    g.classList.toggle('fm-answered',answers[i]!==null);const slider=g.querySelector('input[type=range]'),q=form.questions[i];
    const option=q.options.find(o=>o.value===answers[i]);
    const label=answers[i]===null?'未作答':q.anchors?answers[i]+' 分':answers[i]+' · '+option.label;
    g.querySelector('output').textContent=label;
    const answered=answers[i]!==null,wrap=g.querySelector('.fm-slider');wrap.querySelector('.fm-start-dots').hidden=answered;wrap.querySelector('.fm-slider-hint').hidden=answered;[wrap.querySelector('output'),wrap.querySelector('.fm-slider-ticks')].forEach(e=>e.hidden=!answered);
    slider.setAttribute('aria-valuetext',answers[i]===null?'未作答，請選擇'+slider.min+'至'+slider.max:label);
   });result.replaceChildren();result.hidden=!submitted;
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
   groups.forEach((g,i)=>{const input=g.querySelector('input[type=range]'),value=saved['q'+(i+1)],q=form.questions[i];const answered=q.options.some(option=>option.value===value);input.dataset.answered=String(answered);input.value=answered?value:Math.round((Number(input.min)+Number(input.max))/2);});
   submitted=saved.submitted===true;update();
  }
  questionnaire.onsubmit=event=>{
   event.preventDefault();const answers=values();const missing=answers.findIndex(v=>v===null);
   if(missing!==-1 && !(form.id==='quickdash' && answers.filter(v=>v!==null).length>=10)){submitted=false;update();groups[missing].scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});groups[missing].querySelector('input[type=range]').focus({preventScroll:true});progress.textContent+=' · 請完成第'+(missing+1)+'題';return;}
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
   const responses=await Promise.all(['forms/data.json','calculator/aaos.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error('無法載入表單');return r.json();})));catalog=responses[0];aaos=responses[1];panel.replaceChildren();
   const shell=element('div','', 'fm-shell'),tabs=element('div','', 'fm-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-orientation','vertical');tabs.id='fm-menu';tabs.setAttribute('aria-label','選擇表單');
   catalog.forms.forEach(form=>{const button=element('button',form.name);button.type='button';button.dataset.form=form.id;button.id='fm-tab-'+form.id;button.setAttribute('role','tab');button.setAttribute('aria-controls','fm-'+form.id);button.onclick=()=>select(form.id);tabs.append(button);});
   tabs.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();shell.classList.remove('fm-menu-open');document.getElementById('fm-menu-toggle').setAttribute('aria-expanded','false');document.getElementById('fm-menu-toggle').focus();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...tabs.children],index=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+buttons.length)%buttons.length;select(buttons[next].dataset.form,false);buttons[next].focus();};
   const toggle=element('button','表單選單','fm-menu-toggle');toggle.id='fm-menu-toggle';toggle.type='button';toggle.setAttribute('aria-controls','fm-menu');toggle.setAttribute('aria-expanded','false');toggle.onclick=()=>{const open=shell.classList.toggle('fm-menu-open');toggle.setAttribute('aria-expanded',String(open));};
   const content=element('div','', 'fm-content'),side=element('aside','','fm-side'),actions=element('div','','fm-actions');side.append(tabs,actions);shell.append(toggle,side,content);catalog.forms.forEach(form=>mountForm(form,content));views.forEach(view=>{if(view.footer)actions.append(view.footer);});panel.append(shell);select(active);requestAnimationFrame(sizePanel);if(root.ResizeObserver)new ResizeObserver(sizePanel).observe(document.querySelector('.sg-nav-shell')||document.body);root.addEventListener('resize',sizePanel);
   root.ScholarSync.subscribe(key=>catalog.forms.forEach(form=>{if(key===KEY(form.id))views.get(form.id).hydrate();}));
  }catch(error){catalog=null;panel.textContent='表單載入失敗。';const retry=element('button','重試');retry.onclick=()=>{loading=null;show();};panel.append(retry);}})();return loading;
 }
 root.ScholarForms={show};
})(typeof window==='undefined'?globalThis:window);
