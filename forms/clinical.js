/* Clinician-entered observations only. Drafts stay in this page's memory. */
((root)=>{
 'use strict';
 const row=(id,label,options,single=false)=>({id,label,options,single});
 const sections=[
  {id:'observations',label:'Observations',rows:[row('appearance','Appearance',['Neat','Disheveled','Inappropriate','Bizarre','Other']),row('speech','Speech',['Normal','Tangential','Pressured','Impoverished','Other']),row('eye','Eye Contact',['Normal','Intense','Avoidant','Other']),row('motor','Motor Activity',['Normal','Restless','Tics','Slowed','Other']),row('affect','Affect',['Full','Constricted','Flat','Labile','Other'])]},
  {id:'mood',label:'Mood',rows:[row('mood','Mood',['Euthymic','Anxious','Angry','Depressed','Euphoric','Irritable','Other'])]},
  {id:'cognition',label:'Cognition',rows:[row('orientation','Orientation Impairment',['None','Place','Object','Person','Time']),row('memory','Memory Impairment',['None','Short-Term','Long-Term','Other']),row('attention','Attention',['Normal','Distracted','Other'])]},
  {id:'perception',label:'Perception',rows:[row('hallucinations','Hallucinations',['None','Auditory','Visual','Other']),row('perception','Other Perceptual Experiences',['None','Derealization','Depersonalization'])]},
  {id:'thoughts',label:'Thoughts',rows:[row('suicidality','Suicidality',['None','Ideation','Plan','Intent','Self-Harm']),row('homicidality','Homicidality',['None','Aggressive','Intent','Plan']),row('delusions','Delusions',['None','Grandiose','Paranoid','Religious','Other'])]},
  {id:'behavior',label:'Behavior',rows:[row('behavior','Behavior',['Cooperative','Guarded','Hyperactive','Agitated','Paranoid','Stereotyped','Aggressive','Bizarre','Withdrawn','Other'])]},
  {id:'insight',label:'Insight',rows:[row('insight','Insight',['Good','Fair','Poor'],true)]},
  {id:'judgment',label:'Judgment',rows:[row('judgment','Judgment',['Good','Fair','Poor'],true)]}
 ];
 const mmseItems=[
  {id:'time',label:'I-1 時間定向',max:5,prompt:'年、月、日、星期、季節。'},
  {id:'place',label:'I-2 地點定向',max:5,prompt:'依院內原表詢問五項地點。'},
  {id:'registration',label:'II-1 記銘登錄',max:3,prompt:'腳踏車、快樂、紅色。記錄立即覆誦的得分。'},
  {id:'calculation',label:'II-2 系列減七',max:5,prompt:'100 − 7：93、86、79、72、65。'},
  {id:'recall',label:'III 記憶',max:3,prompt:'回憶先前的三個詞語：腳踏車、快樂、紅色。'},
  {id:'naming',label:'IV-1 命名',max:2,prompt:'錶、筆。'},
  {id:'repetition',label:'IV-2 複誦',max:1,prompt:'白紙真正寫黑字。'},
  {id:'reading',label:'IV-3 閱讀理解',max:1,prompt:'請閉上眼睛。'},
  {id:'writing',label:'IV-4 書寫造句',max:1,prompt:'依院內原表評估書寫造句。'},
  {id:'command',label:'V 口語理解及行動能力',max:3,prompt:'用左（右）手拿紙、折成一半、再交給我。'},
  {id:'construction',label:'VI 建構力',max:1,prompt:'依原表圖形抄寫，記錄得分。'}
 ];
 function choose(item,current,value,checked){
  const valid=new Set((current||[]).filter(v=>item.options.includes(v)));
  if(!item.options.includes(value))return [...valid];
  if(!checked){valid.delete(value);return [...valid];}
  if(item.single||value==='None'||value==='Normal')return [value];
  valid.delete('None');valid.delete('Normal');valid.add(value);
  return item.options.filter(v=>valid.has(v));
 }
 const clean=v=>typeof v==='string'?v.trim():'';
 function buildMSE(state={}){
  const lines=[];
  if(clean(state.name))lines.push('Client Name: '+clean(state.name));
  if(clean(state.date))lines.push('Date: '+clean(state.date));
  for(const section of sections){
   const content=[];
   for(const item of section.rows){const values=item.options.filter(v=>(state.values?.[item.id]||[]).includes(v));if(values.length)content.push(item.label+': '+values.join(', '));}
   if(clean(state.comments?.[section.id]))content.push('Comments: '+clean(state.comments[section.id]));
   if(content.length)lines.push(section.label+'\n'+content.join('\n'));
  }
  return lines.length?'Mental Status Exam\n'+lines.join('\n\n'):'';
 }
 function scoreMMSE(values={}){
  const valid=mmseItems.map(item=>Number.isInteger(values[item.id])&&values[item.id]>=0&&values[item.id]<=item.max?values[item.id]:null);
  const count=valid.filter(v=>v!==null).length;
  return {count,ready:count===mmseItems.length,total:count===mmseItems.length?valid.reduce((a,b)=>a+b,0):null};
 }
 function buildMMSE(state={}){
  const result=scoreMMSE(state.values),lines=[];
  for(const [key,label]of [['name','姓名'],['date','日期'],['education','教育程度'],['age','年齡'],['sex','性別'],['words','記銘詞語']])if(clean(state[key]))lines.push(label+'：'+clean(state[key]));
  for(const item of mmseItems){const value=state.values?.[item.id];if(Number.isInteger(value)&&value>=0&&value<=item.max)lines.push(item.label+'：'+value+' / '+item.max);}
  if(clean(state.comments))lines.push('備註：'+clean(state.comments));
  if(!lines.length)return '';
  lines.push(result.ready?'總分：'+result.total+' / 30':'尚未完成評估（已填 '+result.count+' / 11 項），不計總分。');
  return 'MMSE（中文）\n'+lines.join('\n');
 }
 const api={sections,mmseItems,choose,buildMSE,scoreMMSE,buildMMSE};
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof document==='undefined')return;
 const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
 api.mount=function(id,host){
  const mse=id==='mse',state=mse?{values:{},comments:{}}:{values:{}},inputs=[],checks=[];
  const section=el('section','','fm-questionnaire fm-clinical');section.id='fm-'+id;section.lang=mse?'en':'zh-Hant';section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','fm-tab-'+id);section.hidden=true;
  const heading=el('div','','fm-heading');heading.append(el('h1',mse?'MSE':'MMSE'));section.append(heading,el('p',mse?'Mental Status Exam · Clinician entry':'簡短智能測驗 · 醫療人員記分','fm-clinical-caption'));
  const editor=el('div'),meta=el('div','','fm-clinical-meta');editor.append(meta);
  let revision=0;
  function field(parent,key,label,multiline=false,container=state){
   const wrap=el('label','','fm-clinical-field'),input=el(multiline?'textarea':'input');
   input.id='fm-'+id+'-'+key;input.name=key;input.maxLength=multiline?4000:200;input.autocomplete='off';input.spellcheck=mse;
   if(!multiline)input.type=key==='date'?'date':'text';else input.rows=3;
   wrap.append(el('span',label),input);parent.append(wrap);inputs.push(input);
   input.addEventListener('input',()=>{container[key]=input.value;update();});return input;
  }
  field(meta,'name',mse?'Client Name':'姓名');field(meta,'date',mse?'Date':'日期');
  if(mse){
   for(const group of sections){
    const block=el('section','','fm-clinical-block');block.append(el('h2',group.label));
    for(const item of group.rows){
     const set=el('fieldset','','fm-clinical-row');set.append(el('legend',item.label));const options=el('div','','fm-clinical-options');
     item.options.forEach((value,index)=>{
      const label=el('label','','fm-clinical-option'),input=el('input');input.type='checkbox';input.name=item.id;input.value=value;input.id='fm-mse-'+item.id+'-'+index;
      label.append(input,el('span',value));options.append(label);checks.push({input,item,value});
      input.addEventListener('change',()=>{state.values[item.id]=choose(item,state.values[item.id],value,input.checked);checks.filter(c=>c.item===item).forEach(c=>{c.input.checked=state.values[item.id].includes(c.value);});update();});
     });set.append(options);block.append(set);
    }
    field(block,group.id,'Comments',true,state.comments);editor.append(block);
   }
   section.append(editor,el('p','Adapted from the user-provided Mental Status Exam. © 2013 Therapist Aid LLC. Provided by TherapistAid.com.','fm-clinical-credit'));
  }else{
   field(meta,'education','教育程度');field(meta,'age','年齡');field(meta,'sex','性別');field(editor,'words','記銘／回憶詞語（如有調整）');
   const summary=el('p','','fm-mmse-score');summary.id='fm-mmse-score';summary.setAttribute('role','status');editor.append(summary);
   for(const item of mmseItems){
    const set=el('fieldset','','fm-clinical-block');set.append(el('legend',item.label),el('p',item.prompt,'fm-clinical-caption'));const options=el('div','','fm-clinical-options');
    for(let value=0;value<=item.max;value++){
     const label=el('label','','fm-clinical-option'),input=el('input');input.type='radio';input.name=item.id;input.value=String(value);input.id='fm-mmse-'+item.id+'-'+value;
     label.append(input,el('span',value+' / '+item.max));options.append(label);checks.push({input});input.addEventListener('change',()=>{state.values[item.id]=value;update();});
    }
    const clear=el('button','清除此項','fm-clear-question');clear.type='button';clear.onclick=()=>{delete state.values[item.id];set.querySelectorAll('input').forEach(n=>n.checked=false);update();};set.append(options,clear);editor.append(set);
   }
   field(editor,'comments','備註',true);section.append(editor,el('p','依使用者提供之台大醫院 MMSE 紀錄表照片建立。施測及圖形抄寫請搭配院內原表。','fm-clinical-credit'));
  }
  const previewLabel=el('label','','fm-clinical-field'),preview=el('textarea');preview.id='fm-'+id+'-preview';preview.readOnly=true;preview.rows=12;preview.placeholder=mse?'Selected findings will appear here.':'已填結果將顯示於此。';previewLabel.append(el('span',mse?'Chart note preview':'病歷預覽'),preview);section.append(previewLabel);
  const footer=el('div','','fm-footer'),status=el('span','','fm-progress'),copy=el('button',mse?'Copy chart note':'複製病歷','fm-primary'),reset=el('button',mse?'Clear MSE':'清除 MMSE','fm-reset');status.setAttribute('role','status');status.setAttribute('aria-live','polite');copy.type=reset.type='button';footer.append(status,copy,reset);
  function update(){
   revision++;preview.value=mse?buildMSE(state):buildMMSE(state);copy.disabled=!preview.value;status.textContent='';
   if(!mse){const result=scoreMMSE(state.values);section.querySelector('#fm-mmse-score').textContent=result.ready?'總分：'+result.total+' / 30':'已填 '+result.count+' / 11 項 · 尚未完成，不計總分';}
  }
  copy.onclick=async()=>{
   const text=preview.value,at=revision;if(!text)return;
   try{await navigator.clipboard.writeText(text);if(revision===at)status.textContent=mse?'Copied.':'已複製。';}
   catch(_){section.closest('.fm-shell')?.classList.remove('fm-menu-open');document.getElementById('fm-menu-toggle')?.setAttribute('aria-expanded','false');preview.focus();preview.select();status.textContent=mse?'Copy unavailable. Note selected; use your device’s Copy command.':'無法自動複製，已選取病歷文字，請使用裝置的複製功能。';}
  };
  reset.onclick=()=>{
   if(preview.value&&!confirm(mse?'Clear this MSE?':'清除本份 MMSE？'))return;
   for(const key of Object.keys(state))if(key!=='values'&&key!=='comments')delete state[key];state.values={};if(mse)for(const key of Object.keys(state.comments))delete state.comments[key];else state.comments='';
   inputs.forEach(input=>input.value='');checks.forEach(({input})=>input.checked=false);update();
  };
  host.append(section);update();return {section,footer,hydrate(){}};
 };
 root.ScholarClinicalForms=api;
})(typeof window==='undefined'?globalThis:window);
