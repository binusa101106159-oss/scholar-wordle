/* AMA 6e unit conversion. Explicit source-table and stepwise rounding paths. */
((root)=>{
 'use strict';
 const integer=raw=>{if(typeof raw==='boolean')return null;const s=String(raw??'').normalize('NFKC').trim(),n=Number(s);return s!==''&&Number.isInteger(n)&&n>=0&&n<=100?n:null;};
 const digits={thumb:{label:'拇指',column:0,weight:4},index:{label:'食指',column:3,weight:2},middle:{label:'中指',column:3,weight:2},ring:{label:'無名指',column:6,weight:1},little:{label:'小指',column:6,weight:1}};
 const roundTenth=(n,m)=>Math.floor((n*m+5)/10);
 function convert(data,input){
  const value=integer(input.value),unit=input.unit,mode=input.mode||'table';
  if(value===null)throw Error('請輸入 0–100 的整數百分比。');
  if(!['DI','HI','UEI','LEI'].includes(unit)||!['table','stepwise'].includes(mode))throw Error('請選擇有效的換算單位與方式。');
  const values={[unit]:value};let source='',steps=[];
  if(unit==='DI'){
   const digit=digits[input.digit];if(!digit)throw Error('DI 換算請先選擇手指。');
   if(mode==='table'){
    const row=data.digit[value];if(!row)throw Error('原書 Table 15-12 缺少 32% DI 這一列。可切換「逐層取整」計算，並確認採用的換算路徑。');
    [values.HI,values.UEI,values.WPI]=row.slice(digit.column,digit.column+3);source='Table 15-12 · 原書 421–423 頁（各欄直接查表）';
   }else{
    values.HI=roundTenth(value,digit.weight);values.UEI=roundTenth(values.HI,9);values.WPI=data.ueiToWpi[values.UEI];
    steps=[`${value}% DI × ${digit.weight/10} → ${values.HI}% HI`,`${values.HI}% HI × 0.9 → ${values.UEI}% UEI`,`${values.UEI}% UEI → ${values.WPI}% WPI`];source='原書 419 頁 · 每一階段四捨五入；與 Table 15-12 直接查表可不同。';
   }
   return {unit,value,mode,digit:digit.label,values,source,steps};
  }
  if(unit==='HI'){values.UEI=roundTenth(value,9);values.WPI=data.ueiToWpi[values.UEI];steps=[`${value}% HI × 0.9 → ${values.UEI}% UEI`,`${values.UEI}% UEI → ${values.WPI}% WPI`];source='原書 419 頁、Table 15-11（420 頁）· 逐層取整';}
  if(unit==='UEI'){values.WPI=data.ueiToWpi[value];source='Table 15-11 · 原書 420 頁';}
  if(unit==='LEI'){values.WPI=data.leiToWpi[value];source='Table 16-10 · 原書 531 頁'+(value===1?'（1% LEI＝1% WPI）':'');}
  return {unit,value,mode,values,source,steps};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={convert,integer};
 if(typeof document==='undefined')return;
 let loading;
 async function mount(){
  const host=document.getElementById('cl-impairment');if(!host||host.dataset.ready)return;
  if(loading)return loading;
  host.textContent='載入單位換算…';
  loading=(async()=>{
   const response=await fetch('calculator/impairment.json');if(!response.ok)throw Error('無法載入換算表');const data=await response.json();
   host.innerHTML='<section class="ic-card" aria-labelledby="ic-title"><header><h2 id="ic-title">Impairment 單位換算</h2><button type="button" id="ic-reset">重設</button></header><form id="ic-form"><div class="ic-inputs"><label>原始單位<select id="ic-unit"><option>DI</option><option>HI</option><option>UEI</option><option>LEI</option></select></label><label>百分比 (%)<input id="ic-value" type="number" min="0" max="100" step="1" inputmode="numeric" placeholder="0–100"></label><label id="ic-digit-wrap">手指<select id="ic-digit"><option value="">請選擇</option>'+Object.entries(digits).map(([key,d])=>`<option value="${key}">${d.label}</option>`).join('')+'</select></label><label id="ic-mode-wrap">DI 換算方式<select id="ic-mode"><option value="table">原書表值</option><option value="stepwise">逐層取整</option></select></label></div><dl id="ic-results" class="ic-results"></dl><p id="ic-error" role="status"></p><p id="ic-source" class="ic-source"></p><div class="ic-footer"><button type="button" id="ic-copy" disabled>複製換算結果</button><span id="ic-status" role="status"></span></div></form></section>';
   const by=id=>host.querySelector('#'+id),form=by('ic-form');let result;
   const names={DI:'手指',HI:'手',UEI:'上肢',LEI:'下肢',WPI:'全人'};
   function update(){
    const unit=by('ic-unit').value,di=unit==='DI';by('ic-digit-wrap').hidden=!di;by('ic-mode-wrap').hidden=!di;result=null;by('ic-error').textContent='';by('ic-source').textContent='';by('ic-status').textContent='';
    if(by('ic-value').value!==''){try{result=convert(data,{unit,value:by('ic-value').value,digit:by('ic-digit').value,mode:by('ic-mode').value});}catch(e){by('ic-error').textContent=e.message;}}
    const units=unit==='DI'?['DI','HI','UEI','WPI']:unit==='HI'?['HI','UEI','WPI']:[unit,'WPI'];
    by('ic-results').replaceChildren(...units.map(key=>{const d=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key+' · '+names[key];dd.dataset.unit=key;dd.textContent=result?result.values[key]+'%':'—';d.append(dt,dd);return d;}));
    by('ic-copy').disabled=!result;if(result)by('ic-source').textContent=[result.source,...result.steps].join(' · ');
   }
   form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('input',update);form.addEventListener('change',update);
   by('ic-reset').onclick=()=>{form.reset();update();};
   by('ic-copy').onclick=async()=>{if(!result)return;const text=['AMA Guides 6e · 單位換算'+(result.digit?' · '+result.digit:''),...Object.entries(result.values).map(([unit,value])=>`${unit}: ${value}%`),result.source,...result.steps].join('\n');try{await navigator.clipboard.writeText(text);by('ic-status').textContent='已複製';}catch(_){by('ic-status').textContent='請選取換算結果複製。';}};
   host.dataset.ready='true';update();
  })().catch(()=>{host.textContent='單位換算暫時無法載入。';const retry=document.createElement('button');retry.type='button';retry.textContent='重試';retry.onclick=()=>mount();host.append(retry);}).finally(()=>{loading=null;});return loading;
 }
 root.ScholarImpairment={mount};
})(typeof window==='undefined'?globalThis:window);
