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
 function buildMSE(state={}){
  const lines=[];
  for(const section of sections){
   const content=[];
   for(const item of section.rows){const values=item.options.filter(v=>(state.values?.[item.id]||[]).includes(v));if(values.length)content.push(item.label+': '+values.join(', '));}
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
  for(const item of mmseItems){
   const value=state.values?.[item.id];
   if(Number.isInteger(value)&&value>=0&&value<=item.max)lines.push(item.label+'：'+value+' / '+item.max);
  }
  if(!lines.length)return '';
  lines.push(result.ready?'總分：'+result.total+' / 30':'尚未完成評估（已填 '+result.count+' / 11 項），不計總分。');
  return 'MMSE（中文）\n'+lines.join('\n');
 }
 const api={sections,mmseItems,choose,buildMSE,scoreMMSE,buildMMSE};
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof document==='undefined')return;
 const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
 api.mount=function(id,host){
  const mse=id==='mse',state={values:{}},checks=[],scoreRows=[];
  const section=el('section','','fm-questionnaire fm-clinical');section.id='fm-'+id;section.lang=mse?'en':'zh-Hant';section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','fm-tab-'+id);section.hidden=true;
  const editor=el('div');
  let revision=0;
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
    editor.append(block);
   }
   section.append(editor);
  }else{
   const paper=el('div','','fm-mmse-paper fm-mmse-original'),header=el('div','','fm-mmse-original-head');header.append(el('span',''),el('span','得分'));paper.append(header);
   const labels={time:['年','月','日','星期','季'],place:['市','醫院','樓','科','新／舊大樓'],registration:['腳踏車','快樂','紅色'],calculation:['93','86','79','72','65'],recall:['腳踏車','快樂','紅色'],naming:['錶','筆'],repetition:['白紙真正寫黑字'],reading:['請閉上眼睛'],writing:['（合文意，多於三個字）'],command:['用左（右）手拿紙','折成一半','再交給我'],construction:['圖形抄繪']};
   const groups=[['I、定向感（10）',['time','place']],['II、注意力（8）',['registration','calculation']],['III、記憶（3）',['recall']],['IV、語言（5）',['naming','repetition','reading','writing']],['V、口語理解及行動能力（3）',['command']],['VI、建構力（1）',['construction']]];
   const titles={time:'1. 時間（5）：',place:'2. 地方（5）：',registration:'1. 記憶登錄（3）：',calculation:'2. 系列減七（5）：100 − 7',recall:'',naming:'1. 命名（2）：',repetition:'2. 複誦（1）：',reading:'3. 閱讀理解（1）：',writing:'4. 書寫造句（1）：',command:'',construction:''};
   for(const [heading,ids]of groups){
    const group=el('section','','fm-mmse-original-group');group.append(el('h2',heading));
    for(const key of ids){
     const item=mmseItems.find(item=>item.id===key),line=el('div','','fm-mmse-original-row'),body=el('fieldset','','fm-mmse-original-item');body.setAttribute('aria-label',item.label);
     if(titles[key])body.append(el('legend',titles[key]));
     const answers=el('div','','fm-mmse-original-blanks'),rowChecks=[];
     labels[key].forEach((label,index)=>{const wrap=el('label','','fm-mmse-original-tick'),input=el('input'),mark=el('span','','fm-mmse-original-mark');input.type='checkbox';input.id='fm-mmse-'+key+'-tick-'+index;input.setAttribute('aria-label',item.label+'：'+label+'，答對');mark.setAttribute('aria-hidden','true');wrap.append(input);if(['time','place'].includes(key))wrap.append(mark,el('span',label));else wrap.append(el('span',label),mark);answers.append(wrap);checks.push({input});rowChecks.push(input);input.addEventListener('change',()=>{state.values[key]=rowChecks.filter(input=>input.checked).length;update();});});body.append(answers);
     const score=el('div','','fm-mmse-original-score'),value=el('output');value.id='fm-mmse-'+key+'-score';value.setAttribute('aria-label',item.label+'得分');score.append(value,el('small','/ '+item.max));
     const zero=el('button','0','fm-mmse-original-zero');zero.type='button';zero.id='fm-mmse-'+key+'-zero';zero.setAttribute('aria-label',item.label+'，設為0分');zero.onclick=()=>{if(Object.hasOwn(state.values,key))delete state.values[key];else state.values[key]=0;rowChecks.forEach(input=>input.checked=false);update();};score.append(zero);scoreRows.push({item,value,zero});line.append(body,score);group.append(line);
    }paper.append(group);
   }
   const total=el('div','','fm-mmse-original-total'),totalValue=el('output','—');totalValue.id='fm-mmse-total';total.append(el('span','總分'),totalValue);paper.append(total);
   const stimuli=el('div','','fm-mmse-original-stimuli');stimuli.append(el('p','請 閉 上 眼 睛'));const diagram=document.createElementNS('http://www.w3.org/2000/svg','svg');diagram.setAttribute('viewBox','245 828 145 95');diagram.setAttribute('role','img');diagram.setAttribute('aria-label','原表交疊五邊形抄繪參考圖');
   for(const points of ['254,873 293,845 330,868 310,910 272,911','326,839 369,841 379,884 340,909 307,885']){const shape=document.createElementNS('http://www.w3.org/2000/svg','polygon');shape.setAttribute('points',points);shape.setAttribute('fill','none');shape.setAttribute('stroke','currentColor');shape.setAttribute('stroke-width','1.5');diagram.append(shape);}stimuli.append(diagram);paper.append(stimuli);
   const summary=el('p','','fm-mmse-score');summary.id='fm-mmse-score';summary.setAttribute('role','status');editor.append(paper,summary);section.append(editor);
  }

  let resultText='',fallback=null;
  const footer=el('div','','fm-footer'),status=el('span','','fm-progress'),copy=el('button',mse?'Copy result':'複製病歷','fm-primary'),reset=el('button',mse?'Clear MSE':'清除 MMSE','fm-reset');status.setAttribute('role','status');status.setAttribute('aria-live','polite');copy.type=reset.type='button';footer.append(status,copy,reset);
  function update(){
   revision++;resultText=mse?buildMSE(state):buildMMSE(state);copy.disabled=!resultText;status.textContent='';if(fallback){fallback.remove();fallback=null;}
   scoreRows.forEach(({item,value,zero})=>{const assessed=Object.hasOwn(state.values,item.id);value.textContent=assessed?String(state.values[item.id]):'—';zero.textContent=assessed?'↻':'0';zero.setAttribute('aria-label',item.label+(assessed?'，清除此項':'，設為0分'));});
   if(!mse){const result=scoreMMSE(state.values);section.querySelector('#fm-mmse-total').textContent=result.ready?String(result.total):'—';section.querySelector('#fm-mmse-score').textContent=result.ready?'總分：'+result.total+' / 30':'已填 '+result.count+' / 11 項 · 尚未完成，不計總分';}
  }
  copy.onclick=async()=>{
   const text=resultText,at=revision;if(!text)return;
   try{await navigator.clipboard.writeText(text);if(revision===at)status.textContent=mse?'Copied.':'已複製。';}
   catch(_){if(revision!==at)return;section.closest('.fm-shell')?.classList.remove('fm-menu-open');document.getElementById('fm-menu-toggle')?.setAttribute('aria-expanded','false');const target=fallback||el('textarea');fallback=target;target.id='fm-'+id+'-copy-fallback';target.readOnly=true;target.setAttribute('aria-label',mse?'Result to copy':'待複製結果');target.className='fm-copy-fallback';target.value=text;section.append(target);target.focus();target.select();status.textContent=mse?'Copy unavailable. Result selected; use your device’s Copy command.':'無法自動複製，已選取結果，請使用裝置的複製功能。';}
  };
  reset.onclick=()=>{
   if(resultText&&!confirm(mse?'Clear this MSE?':'清除本份 MMSE？'))return;
   state.values={};checks.forEach(({input})=>input.checked=false);update();
  };
  host.append(section);update();return {section,footer,hydrate(){}};
 };
 root.ScholarClinicalForms=api;
})(typeof window==='undefined'?globalThis:window);
