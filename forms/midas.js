/* Chinese entry UI for MIDAS domains; question wording is condensed for the screen.
 * Reference: https://taiwanheadache.org.tw/headache-diary-and-assessment-scale/
 * Grades: https://www.scripps.org/services/neurology/headache-migraine-treatment/midas-test
 * The instrument belongs to Innovative Medical Research, Inc. Drafts are page-local.
 */
((root)=>{
 'use strict';
 const items=[
  {id:'q1',label:'1',text:'最近三個月，頭痛讓你缺勤或缺課的天數是多少？',short:'無法上班／上課',unit:'天'},
  {id:'q2',label:'2',text:'同一期間，上班或上課時，因頭痛而使效率下降至少一半的天數是多少？',hint:'排除第1題已記錄的缺勤、缺課日。',short:'工作／課業效率下降至少一半',unit:'天'},
  {id:'q3',label:'3',text:'最近三個月，因頭痛而完全無法處理家務的天數是多少？',short:'無法做家事',unit:'天'},
  {id:'q4',label:'4',text:'同一期間，仍有做家務，但因頭痛使效率下降至少一半的天數是多少？',hint:'排除第3題已記錄的無法做家務日。',short:'家事效率下降至少一半',unit:'天'},
  {id:'q5',label:'5',text:'最近三個月，頭痛使你無法參與家庭活動、社交或休閒的天數是多少？',short:'無法參與家庭／社交／休閒活動',unit:'天'},
  {id:'a',label:'A',text:'最近三個月，出現頭痛的日子總共有幾天？',hint:'一次頭痛若持續數日，每一天都要計入。這題不加進總分。',short:'頭痛總天數',unit:'天'},
  {id:'b',label:'B',text:'這段期間，頭痛發作時的平均疼痛強度是多少？',hint:'以0至10評分：0代表不痛，10代表最劇烈的疼痛。這題不加進總分。',short:'平均疼痛強度',unit:'/ 10',max:10}
 ];
 function scoreMIDAS(values){
  if(!Array.isArray(values)||values.length!==7)throw Error('需要5個主項與A、B兩項紀錄。');
  values.forEach((value,index)=>{if(value!==null&&(!Number.isSafeInteger(value)||value<0||(index===6&&value>10)))throw Error(index===6?'B題請輸入0至10的整數。':'天數請輸入0以上的整數。');});
  const count=values.slice(0,5).filter(v=>v!==null).length;
  if(count!==5)return {ready:false,count,total:null,grade:'',level:''};
  const total=values.slice(0,5).reduce((sum,value)=>sum+value,0);
  if(!Number.isSafeInteger(total))throw Error('總分超出可計算範圍。');
  const index=total<=5?0:total<=10?1:total<=20?2:3;
  return {ready:true,count,total,grade:['I','II','III','IV'][index],level:['極少或無失能','輕度失能','中度失能','重度失能'][index]};
 }
 function buildNote(values){
  const result=scoreMIDAS(values);if(values.every(v=>v===null))return '';
  const lines=['MIDAS（過去3個月）'];
  items.forEach((item,index)=>{if(values[index]!==null)lines.push(item.label+'. '+item.short+'：'+values[index]+(index===6?' / 10':' 天')+(index>=5?'（不計入總分）':''));});
  lines.push(result.ready?'總分：'+result.total+'；第'+result.grade+'級，'+result.level:'主項尚未完成（'+result.count+' / 5），不計總分。');return lines.join('\n');
 }
 const api={items,scoreMIDAS,buildNote};
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(typeof document==='undefined')return;
 const el=(tag,text='',cls='')=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
 api.mount=function(host){
  const values=Array(7).fill(null),inputs=[],section=el('section','','fm-questionnaire fm-clinical fm-midas');section.id='fm-midas';section.lang='zh-Hant';section.hidden=true;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','fm-tab-midas');
  section.append(el('p','請回想最近三個月。若沒有從事某項活動，該題填0；第2、4題請排除前一題已計入的日子。','fm-midas-instructions'));
  const summary=el('p','','fm-midas-summary');summary.id='fm-midas-summary';summary.setAttribute('role','status');section.append(summary);
  const paper=el('div','','fm-midas-paper');
  items.forEach((item,index)=>{
   const line=el('div','','fm-midas-line'),label=el('label','','fm-midas-question'),input=el('input'),box=el('div','','fm-midas-answer'),error=el('span','','fm-midas-error');
   label.htmlFor='fm-midas-'+item.id;label.append(el('span',item.label+'. '+item.text));if(item.hint)label.append(el('small',item.hint));
   input.type='number';input.min='0';input.step='1';input.inputMode='numeric';input.id=label.htmlFor;input.autocomplete='off';input.setAttribute('aria-describedby',input.id+'-error');if(item.max!==undefined)input.max=String(item.max);
   error.id=input.id+'-error';error.hidden=true;error.textContent=index===6?'請填0至10的整數':'請填0以上的整數';
   input.addEventListener('input',()=>{const value=input.valueAsNumber,empty=input.value===''&&!input.validity.badInput,valid=!empty&&input.validity.valid&&Number.isSafeInteger(value);values[index]=valid?value:null;error.hidden=empty||valid;input.setAttribute('aria-invalid',String(!empty&&!valid));update();});
   box.append(input,el('span',item.unit),error);line.append(label,box);paper.append(line);inputs.push(input);
  });section.append(paper);
  const source=el('a','中文原表','fm-midas-reference');source.href='https://taiwanheadache.org.tw/headache-diary-and-assessment-scale/';source.target='_blank';source.rel='noopener noreferrer';source.setAttribute('aria-label','開啟台灣頭痛學會 MIDAS 中文原表');section.append(source);
  const footer=el('div','','fm-footer'),status=el('span','','fm-progress'),copy=el('button','複製結果','fm-primary'),reset=el('button','清除 MIDAS','fm-reset');copy.type=reset.type='button';status.setAttribute('role','status');status.setAttribute('aria-live','polite');footer.append(status,copy,reset);
  let revision=0,note='',fallback=null;
  function update(){
   revision++;status.textContent='';if(fallback){fallback.remove();fallback=null;}
   const invalid=inputs.some(input=>input.getAttribute('aria-invalid')==='true');
   let result;try{result=scoreMIDAS(values);note=buildNote(values);}catch(_){summary.textContent='請確認填入的數字。';copy.disabled=true;return;}
   summary.textContent=result.ready?'MIDAS：'+result.total+' 分 · 第'+result.grade+'級 · '+result.level:'主項已填 '+result.count+' / 5 題';copy.disabled=invalid||!note;
  }
  copy.onclick=async()=>{const text=note,at=revision;if(!text||copy.disabled)return;try{await navigator.clipboard.writeText(text);if(at===revision)status.textContent='已複製。';}catch(_){if(at!==revision)return;section.closest('.fm-shell')?.classList.remove('fm-menu-open');document.getElementById('fm-menu-toggle')?.setAttribute('aria-expanded','false');fallback=fallback||el('textarea','','fm-copy-fallback');fallback.id='fm-midas-copy-fallback';fallback.readOnly=true;fallback.setAttribute('aria-label','待複製結果');fallback.value=text;section.append(fallback);fallback.focus();fallback.select();status.textContent='無法自動複製，已選取結果，請使用裝置的複製功能。';}};
  reset.onclick=()=>{if(inputs.some(input=>input.value!==''||input.validity.badInput)&&!confirm('清除本份 MIDAS？'))return;values.fill(null);inputs.forEach(input=>{input.value='';input.removeAttribute('aria-invalid');document.getElementById(input.id+'-error').hidden=true;});update();};
  host.append(section);update();return {section,footer,hydrate(){}};
 };
 root.ScholarMIDAS=api;
})(typeof window==='undefined'?globalThis:window);
