/* Public phrase catalog; pasted data and report drafts stay in page memory. */
(() => {
 'use strict';
 const panel=document.getElementById('checkup-panel');
 let catalog=null,loading=null,mounted=false;
 const by=id=>document.getElementById(id);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const b=el('button',text,'sg-btn');b.type='button';b.onclick=fn;return b;};
 async function copy(text){if(!text)return;try{await navigator.clipboard.writeText(text);by('hc-status').textContent='已複製。';}catch(_){by('hc-status').textContent='複製失敗，請選取文字手動複製。';}}
 function update(){by('hc-copy').disabled=!by('hc-report').value.trim();}
 function append(text){const report=by('hc-report');report.value+=(report.value&&!report.value.endsWith('\n')?'\n':'')+text;update();by('hc-status').textContent='已加入報告，可直接編輯。';}
 function renderLibrary(){
  const host=by('hc-library');host.replaceChildren();
  const terms=by('hc-search').value.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const rows=catalog.snippets.filter(row=>terms.every(t=>row.text.normalize('NFKC').toLocaleLowerCase().includes(t)));
  by('hc-results').textContent=rows.length+' / '+catalog.snippets.length+' 則';
  for(const row of rows){const card=el('article',undefined,'hc-card'),actions=el('div',undefined,'hc-actions');card.append(el('p',row.text));actions.append(button('複製',()=>copy(row.text)),button('加入報告',()=>append(row.text)));card.append(actions);host.append(card);}
  if(!rows.length)host.append(el('p','找不到符合的罐頭。'));
 }
 function clear(){if(!mounted)return;by('hc-source').value='';by('hc-report').value='';by('hc-search').value='';by('hc-status').textContent='';update();if(catalog)renderLibrary();}
 function mode(){by('hc-work-label').hidden=by('hc-mode').value==='general';}
 function mount(){
  if(mounted)return;mounted=true;
  panel.innerHTML=`<div class="hc-shell">
   <header class="hc-head"><h1>健檢報告</h1><div class="hc-controls">
    <label>類型<select id="hc-mode"><option value="general">一般</option><option value="special-pre">特殊作業體格檢查</option><option value="special-periodic">特殊作業健康檢查</option></select></label>
    <label id="hc-work-label" hidden>作業<input id="hc-work" type="text" placeholder="輸入作業名稱" autocomplete="off"></label>
   </div></header>
   <p id="hc-status" role="status" aria-live="polite"></p>
   <div class="hc-layout"><div class="hc-editor">
    <section class="hc-box"><div class="hc-section-head"><h2><label for="hc-source">原始資料</label></h2><button class="sg-btn" id="hc-source-clear" type="button">清除資料</button></div>
     <textarea id="hc-source" rows="12" placeholder="將判讀頁面 Ctrl+A、Ctrl+C 後貼在這裡，包含 PE、抽血、CXR、超音波等。" autocomplete="off" spellcheck="false"></textarea>
    </section>
    <section class="hc-box"><div class="hc-section-head"><h2><label for="hc-report">報告</label></h2><div class="hc-actions"><button class="sg-btn" id="hc-regenerate" type="button" disabled title="待建立判讀規則">重新生成</button><button class="sg-btn sg-primary" id="hc-copy" type="button">複製報告</button><button class="sg-btn" id="hc-report-clear" type="button">清空報告</button></div></div>
     <p class="hc-hint">目前可手動編輯及加入罐頭；自動判讀規則尚未建立。</p>
     <textarea id="hc-report" rows="15" placeholder="在此編輯報告，或從右側加入罐頭。" autocomplete="off" spellcheck="false"></textarea>
    </section>
   </div><aside class="hc-phrases" aria-label="罐頭"><div class="hc-section-head"><h2>罐頭</h2><span id="hc-results"></span></div><label class="hc-search-label" for="hc-search">搜尋罐頭</label><input id="hc-search" type="search" placeholder="搜尋檢查項目、異常或建議" autocomplete="off"><div id="hc-library"></div></aside></div>
   <p class="hc-hint">貼入資料與報告僅留在本頁，切換分頁即清除。</p>
  </div>`;
  by('hc-mode').onchange=mode;by('hc-search').oninput=()=>{if(catalog)renderLibrary();};
  by('hc-report').oninput=update;by('hc-copy').onclick=()=>copy(by('hc-report').value);
  by('hc-source-clear').onclick=()=>{by('hc-source').value='';};
  by('hc-report-clear').onclick=()=>{if(by('hc-report').value&&!confirm('清空報告內容？'))return;by('hc-report').value='';update();};
  update();window.addEventListener('pagehide',clear);window.addEventListener('scholar-sync-status',clear);
 }
 async function show(){
  mount();if(catalog){renderLibrary();return;}if(loading)return loading;
  by('hc-status').textContent='載入罐頭…';
  loading=(async()=>{try{const r=await fetch('checkup/snippets.json');if(!r.ok)throw Error('load');catalog=await r.json();renderLibrary();by('hc-status').textContent='';}catch(_){by('hc-status').textContent='罐頭載入失敗，請檢查連線後重試。';by('hc-library').replaceChildren(button('重試',show));}finally{loading=null;}})();return loading;
 }
 window.ScholarCheckup={show,hide:clear};
})();
