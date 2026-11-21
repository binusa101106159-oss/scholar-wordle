/* User-supplied certificate wording. Inputs are blank; no clinical inference. */
((root)=>{
 'use strict';
 const BLANK='＿＿＿＿';
 const variables=body=>[...new Set([...body.matchAll(/\{\{([^{}]+)\}\}/g)].map(match=>match[1]))];
 function generate(body,values={}){return body.replace(/\{\{([^{}]+)\}\}/g,(_,key)=>String(values[key]??'').trim()||BLANK);}
 function validate(data){
  if(data?.version!==1||!Array.isArray(data.categories)||!Array.isArray(data.templates))throw Error('無法讀取診斷書範本。');
  const ids=new Set();for(const row of data.templates){if(!row||typeof row.id!=='string'||ids.has(row.id)||!data.categories.includes(row.category)||typeof row.title!=='string'||typeof row.body!=='string'||!variables(row.body).length)throw Error('診斷書範本格式錯誤。');ids.add(row.id);}return data;
 }
 if(typeof module==='object'&&module.exports)module.exports={variables,generate,validate,BLANK};
 if(typeof document==='undefined')return;
 let loading=null,mounted=false;
 async function show(){
  if(mounted)return;if(loading)return loading;
  const panel=document.getElementById('certificates-panel');
  loading=(async()=>{const response=await fetch('certificates/templates.json');if(!response.ok)throw Error('載入失敗');const data=validate(await response.json());mount(panel,data);mounted=true;})().catch(()=>{
   panel.replaceChildren();const text=document.createElement('p');text.textContent='診斷書範本暫時無法載入。';const retry=document.createElement('button');retry.textContent='重試';retry.type='button';retry.onclick=show;panel.append(text,retry);
  }).finally(()=>{loading=null;});return loading;
 }
 function mount(panel,data){
  panel.innerHTML='<div class="dc-shell"><aside class="dc-sidebar"><nav id="dc-categories" role="tablist" aria-label="診斷書種類" aria-orientation="vertical"></nav></aside><div class="dc-work"><section id="dc-templates" role="tabpanel"><div id="dc-template-list" role="group" aria-label="選擇模板"></div></section><div class="dc-columns"><form id="dc-form" autocomplete="off"><div class="dc-field-heading"><h1 id="dc-title"></h1><span id="dc-progress" role="status"></span></div><div id="dc-fields"></div><div class="dc-form-actions"><button type="submit" id="dc-generate">產生內容</button><button type="button" id="dc-reset" class="dc-icon" title="清除此模板" aria-label="清除此模板">↻</button><span id="dc-dirty" role="status"></span></div></form><section class="dc-result"><div class="dc-result-heading"><label for="dc-output">內容</label><button type="button" id="dc-copy">複製結果</button></div><textarea id="dc-output" aria-label="可編輯的診斷書內容" spellcheck="false"></textarea><span id="dc-status" role="status"></span></section></div></div></div>';
  const by=id=>panel.querySelector('#'+id),drafts=new Map(),controls=new Map();let category=data.categories[0],selected=null,generatedValues='';
  const state=()=>{if(!drafts.has(selected.id))drafts.set(selected.id,{values:{},text:generate(selected.body),generatedValues:'{}'});return drafts.get(selected.id);};
  function updateProgress(){const count=[...controls.values()].filter(input=>input.value.trim()).length;by('dc-progress').textContent=`${count} / ${controls.size}`;by('dc-dirty').textContent=JSON.stringify(state().values)!==generatedValues?'資料已變更':'';by('dc-status').textContent='';}
  function selectTemplate(template){
   selected=template;const draft=state();generatedValues=draft.generatedValues;by('dc-title').textContent=template.title;by('dc-output').value=draft.text;controls.clear();by('dc-fields').replaceChildren();
   for(const [index,key]of variables(template.body).entries()){
    const label=document.createElement('label');label.textContent=key;const long=/症狀|診斷|工作|暴露|結果|原因|經過|資料|外院名稱|因素|治療|評估日期|歷次/.test(key);const input=document.createElement(long?'textarea':'input');input.id='dc-field-'+index;input.dataset.variable=key;input.value=draft.values[key]||'';input.maxLength=4000;if(long){input.rows=2;label.className='dc-long';}else input.type='text';label.htmlFor=input.id;label.append(input);by('dc-fields').append(label);controls.set(key,input);
   }
   for(const button of by('dc-template-list').children)button.setAttribute('aria-pressed',String(button.dataset.template===template.id));updateProgress();
  }
  function selectCategory(value){
   category=value;for(const button of by('dc-categories').children){const active=button.dataset.category===category;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active)by('dc-templates').setAttribute('aria-labelledby',button.id);}
   by('dc-template-list').replaceChildren();const templates=data.templates.filter(template=>template.category===category);
   for(const template of templates){const button=document.createElement('button');button.type='button';button.dataset.template=template.id;button.textContent=template.title;button.onclick=()=>selectTemplate(template);by('dc-template-list').append(button);}selectTemplate(templates[0]);
  }
  data.categories.forEach((value,index)=>{const button=document.createElement('button');button.type='button';button.id='dc-category-'+index;button.dataset.category=value;button.setAttribute('role','tab');button.setAttribute('aria-controls','dc-templates');button.textContent=value;button.onclick=()=>selectCategory(value);by('dc-categories').append(button);});
  by('dc-categories').addEventListener('keydown',event=>{const buttons=[...by('dc-categories').children],index=buttons.indexOf(event.target);if(index<0||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(['ArrowUp','ArrowLeft'].includes(event.key)?-1:1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus();});
  by('dc-form').addEventListener('input',event=>{const key=event.target.dataset.variable;if(key){state().values[key]=event.target.value;updateProgress();}});
  by('dc-form').onsubmit=event=>{event.preventDefault();const draft=state();draft.text=generate(selected.body,draft.values);draft.generatedValues=JSON.stringify(draft.values);generatedValues=draft.generatedValues;by('dc-output').value=draft.text;updateProgress();};
  by('dc-output').addEventListener('input',()=>{state().text=by('dc-output').value;by('dc-status').textContent='';});
  by('dc-reset').onclick=()=>{drafts.delete(selected.id);selectTemplate(selected);};
  by('dc-copy').onclick=async()=>{try{await navigator.clipboard.writeText(by('dc-output').value);by('dc-status').textContent='已複製。';}catch(_){by('dc-output').focus();by('dc-output').select();by('dc-status').textContent='請按 Ctrl+C 或長按複製。';}};
  selectCategory(category);
 }
 root.ScholarCertificates={show};
})(typeof window==='undefined'?globalThis:window);
