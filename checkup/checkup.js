/* Source and draft are kept only in page memory. */
(() => {
 'use strict';
 const panel=document.getElementById('checkup-panel'),A=window.HealthcheckLogic;
 let catalog=null,normals=[],loading=null,mounted=false,locked=false,selection=[0,0];
 const by=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const b=el('button',text,'sg-btn');b.type='button';b.onclick=fn;return b;};
 const status=text=>by('hc-status').textContent=text;
 async function copy(text){if(!text)return;try{await navigator.clipboard.writeText(text);status('已複製。');}catch(_){status('複製失敗，請選取文字手動複製。');}}
 function update(){by('hc-copy').disabled=!by('hc-report').value.trim();by('hc-regenerate').disabled=locked||!catalog||!by('hc-source').value.trim();}
 function setLock(value){locked=value;by('hc-source').readOnly=value;by('hc-lock').textContent=value?'已生成，可直接修改報告；清除資料後重新貼上才能再生成。':'';update();}
 function insert(text){const a=by('hc-report'),start=Math.min(selection[0],a.value.length),end=Math.min(selection[1],a.value.length);a.setRangeText(text,start,end,'end');a.focus();selection=[a.selectionStart,a.selectionEnd];update();status('已插入游標位置。');}
 function renderLibrary(){
  const host=by('hc-library');host.replaceChildren();const terms=by('hc-search').value.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const rows=catalog.snippets.filter(row=>terms.every(t=>(row.text+' '+(row.category||'')).normalize('NFKC').toLowerCase().includes(t)));by('hc-results').textContent=rows.length+' / '+catalog.snippets.length+' 則';
  for(const row of rows){const b=el('button',row.text,'hc-card');b.type='button';b.title='插入報告游標位置';b.setAttribute('aria-label','插入：'+row.text);b.onclick=()=>insert(row.text);host.append(b);}if(!rows.length)host.append(el('p','找不到符合的罐頭。'));
 }
 function renderAgents(){const previous=new Map([...panel.querySelectorAll('[data-grade]')].map(x=>[x.dataset.grade,x.value])),fits=new Map([...panel.querySelectorAll('[data-fit]')].map(x=>[x.dataset.fit,x.checked]));const host=by('hc-agent-review');host.replaceChildren();for(const box of panel.querySelectorAll('[data-agent]:checked')){
  if(box.value==='生物性實驗'){host.append(el('p','生物性實驗作業：不判健康管理級數。','hc-hint'));continue;}
  const row=el('div',undefined,'hc-agent-row');row.append(el('span',box.value+'作業'));const grade=el('select');grade.dataset.grade=box.value;grade.setAttribute('aria-label',box.value+'管理級數');grade.append(new Option('管理級數待醫師核定',''));for(const [v,t] of [['一','第一級管理'],['二','第二級管理'],['三','第三級管理'],['四','第四級管理']])grade.append(new Option(t,v));grade.value=previous.get(box.value)||'';row.append(grade);const label=el('label'),fit=el('input');fit.type='checkbox';fit.dataset.fit=box.value;fit.checked=fits.get(box.value)||false;label.append(fit,document.createTextNode('醫師確認可以從事'));row.append(label);host.append(row);
 }}
 function clear(){if(!mounted)return;by('hc-source').value='';by('hc-report').value='';by('hc-search').value='';status('');by('hc-review').replaceChildren();by('hc-trace').replaceChildren();by('hc-suggestions').replaceChildren();selection=[0,0];by('hc-pregnant').value='unknown';by('hc-cxr-status').value='auto';by('hc-normal-exceptions').checked=true;by('hc-source-meta').textContent='';panel.querySelectorAll('[data-agent]').forEach(x=>x.checked=false);renderAgents();setLock(false);if(catalog)renderLibrary();}
 function showInventory(input){const m=input.metadata;if(!m){by('hc-source-meta').textContent='';return;}const i=m.inventory;const parts=['抽血 '+i.blood.length+' 項','尿液 '+i.urine.length+' 項','PE '+i.pe.length+' 項'];if(i.imaging.length)parts.push('影像／功能 '+i.imaging.length+' 項');if(m.cutoffApplied)parts.push('已排除檢查判讀以下全部內容');by('hc-source-meta').textContent=parts.join('｜');}
 function generate(){
  if(locked||!catalog)return;
  try{const input=A.parseBetaInput(by('hc-source').value),fields=input.fields||input;if(!Object.keys(fields).length)throw Error('尚未辨識到檢查欄位。請使用欄名＋Tab＋值、欄名：值或JSON。');
   const context={...(input.context||{}),includeCXR:by('hc-cxr').checked,cxrStatus:by('hc-cxr-status').value,includeNormalCXR:by('hc-normal-exceptions').checked,includeHBVImmunity:by('hc-normal-exceptions').checked,examType:by('hc-exam').value},pregnancy=by('hc-pregnant').value;if(pregnancy!=='unknown')context.pregnant=pregnancy==='true';
   showInventory(input);
   const out=A.generate({...input,context},{mothers:catalog.snippets,cxrNormals:normals});
   for(const box of panel.querySelectorAll('[data-agent]:checked')){const agent=box.value;if(agent==='生物性實驗')continue;const grade=[...panel.querySelectorAll('[data-grade]')].find(x=>x.dataset.grade===agent)?.value;if(grade)out.draft+='\n'+agent+'作業管理分級：第'+grade+'級管理';else out.review.push({detail:agent+'作業管理級數待醫師核定；beta尚未接入精簡版自動判級。'});if([...panel.querySelectorAll('[data-fit]')].find(x=>x.dataset.fit===agent)?.checked)out.draft+='\n可以從事'+agent+'作業。';}
   by('hc-report').value=out.draft.trim();selection=[by('hc-report').value.length,by('hc-report').value.length];by('hc-review').replaceChildren();for(const item of out.review)by('hc-review').append(el('p',(item.field?item.field+'：':'')+(item.detail||item.reason||item.code),'hc-warning'));
   by('hc-trace').replaceChildren();for(const section of out.sections){const det=el('details');det.append(el('summary',section.category+' · '+section.ruleId),el('pre',section.evidence.map(e=>e.field+'：'+e.raw+(e.unit?' '+e.unit:'')).join('\n')));by('hc-trace').append(det);}
   by('hc-suggestions').replaceChildren();for(const item of out.candidateAdvice)by('hc-suggestions').append(button(item.text,()=>insert(item.text)));setLock(true);status('已生成 beta v0.2 草稿，請確認後人工編修。');
  }catch(error){status(error.message);}
 }
 function mount(){
  if(mounted)return;mounted=true;
  panel.innerHTML=`<div class="hc-shell"><div class="hc-head"><h1>健檢報告生成系統 <span class="hc-beta">beta v0.2</span></h1><p class="hc-hint">貼入資料 → 生成一次 → 人工編修</p></div><p id="hc-status" role="status" aria-live="polite"></p>
   <div class="hc-layout"><div class="hc-editor"><section class="hc-box"><div class="hc-section-head"><h2><label for="hc-source">原始資料</label></h2><button class="sg-btn" id="hc-source-clear" type="button">清除並重新貼上</button></div>
    <p class="hc-hint">可直接貼上診間系統Ctrl+A全文；只讀「檢查判讀」以上，依本次實際檢查項目判讀。</p><textarea id="hc-source" rows="12" placeholder="性別：男&#10;GLU AC：126&#10;HbA1c：6.5&#10;Ketone(Dipstick)：3+" autocomplete="off" spellcheck="false"></textarea>
    <p id="hc-source-meta" class="hc-hint" role="status"></p><details class="hc-options"><summary>檢查設定與特殊作業</summary><div class="hc-controls"><label>孕況 <select id="hc-pregnant"><option value="unknown">未記錄</option><option value="true">懷孕</option><option value="false">未懷孕</option></select></label><label><input id="hc-cxr" type="checkbox" checked>包含胸部X光</label><label>CXR狀態 <select id="hc-cxr-status"><option value="auto">依檢查內容</option><option value="pending">報告待上傳</option><option value="not_examined">確定未受檢</option><option value="doctor_normal">醫師暫填正常（待核對）</option></select></label><label><input id="hc-normal-exceptions" type="checkbox" checked>保留B肝免疫力與正常CXR結果</label></div><div id="hc-agents" class="hc-controls"></div><label class="hc-hint">檢查性質 <select id="hc-exam"><option>定期特殊健康檢查</option><option>特殊體格檢查</option><option>變更作業</option></select></label><p class="hc-hint">特殊作業級數由醫師核定後帶入；噪音另用獨立系統，生物不判級。</p><div id="hc-agent-review"></div></details>
    <div class="hc-actions"><button class="sg-btn sg-primary" id="hc-regenerate" type="button" disabled>生成報告</button><span id="hc-lock" class="hc-hint"></span></div></section>
   <section class="hc-box"><div class="hc-section-head"><h2><label for="hc-report">報告草稿</label></h2><div class="hc-actions"><button class="sg-btn sg-primary" id="hc-copy" type="button">複製報告</button><button class="sg-btn" id="hc-report-clear" type="button">清空報告</button></div></div><textarea id="hc-report" rows="15" placeholder="生成後直接人工編輯；右側罐頭插入游標位置。" autocomplete="off" spellcheck="false"></textarea></section></div>
   <aside class="hc-phrases" aria-label="罐頭"><div class="hc-section-head"><h2>罐頭 <small>插入游標位置</small></h2><span id="hc-results"></span></div><label class="hc-search-label" for="hc-search">搜尋罐頭</label><input id="hc-search" type="search" placeholder="搜尋檢查項目、異常或建議" autocomplete="off"><div id="hc-suggestions"></div><div id="hc-library"></div></aside></div>
   <div id="hc-review" aria-label="需要確認的項目"></div><details class="hc-audit"><summary>檢視選句來源</summary><div id="hc-trace"></div></details><p class="hc-hint">資料只留當次頁面，切換功能分頁、重新整理或關閉即清除。心電圖與超音波翻譯尚未串接；肺功能由人工輸入。</p></div>`;
  for(const agent of ['游離輻射','二甲基甲醯胺','正己烷','甲醛','鉛','汞及其無機化合物','粉塵','生物性實驗']){const label=el('label'),box=el('input');box.type='checkbox';box.value=agent;box.dataset.agent='';box.onchange=renderAgents;label.append(box,document.createTextNode(agent));by('hc-agents').append(label);}
  by('hc-search').oninput=()=>{if(catalog)renderLibrary();};by('hc-source').oninput=()=>{update();try{showInventory(A.parseBetaInput(by('hc-source').value));}catch(_){by('hc-source-meta').textContent='資料格式尚未完整。';}};by('hc-report').oninput=update;by('hc-copy').onclick=()=>copy(by('hc-report').value);by('hc-regenerate').onclick=generate;by('hc-source-clear').onclick=clear;by('hc-report-clear').onclick=()=>{by('hc-report').value='';selection=[0,0];update();};
  for(const event of ['keyup','click','select','blur'])by('hc-report').addEventListener(event,()=>selection=[by('hc-report').selectionStart,by('hc-report').selectionEnd]);
  const size=()=>{if(panel.hidden)return;const top=panel.getBoundingClientRect().top;panel.style.setProperty('--hc-height',Math.max(470,window.innerHeight-top-70)+'px');};window.addEventListener('resize',size);if(window.ResizeObserver)new ResizeObserver(size).observe(document.querySelector('.sg-nav-shell')||document.body);requestAnimationFrame(size);update();window.addEventListener('pagehide',clear);window.addEventListener('scholar-sync-status',clear);
 }
 async function show(){mount();if(catalog){renderLibrary();return;}if(loading)return loading;status('載入判讀規則與罐頭…');loading=(async()=>{try{const responses=await Promise.all(['checkup/snippets.json','checkup/normal-cxr.json'].map(url=>fetch(url,{cache:'no-store'})));if(responses.some(r=>!r.ok))throw Error('load');[catalog,normals]=await Promise.all(responses.map(r=>r.json()));renderLibrary();update();status('');}catch(_){status('載入失敗，請檢查連線後重試。');by('hc-library').replaceChildren(button('重試',show));}finally{loading=null;}})();return loading;}
 window.ScholarCheckup={show,hide:clear};
})();
