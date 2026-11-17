/* Verbatim public catalog; report drafts stay in memory only. */
(() => {
 'use strict';
 const panel=document.getElementById('checkup-panel');
 let catalog=null,loading=null,mounted=false,items=[],serial=0;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const by=id=>document.getElementById(id);
 const button=(text,fn)=>{const b=el('button',text,'sg-btn');b.type='button';b.onclick=fn;return b;};
 const compose=()=>items.map(i=>i.text).filter(t=>t.trim()).join('\n');
 async function copy(text){if(!text)return;try{await navigator.clipboard.writeText(text);by('hc-status').textContent='已複製。';}catch(_){by('hc-status').textContent='複製失敗，請選取文字手動複製。';}}
 function preview(){by('hc-preview').value=compose();by('hc-count').textContent=items.length+' 則';by('hc-copy').disabled=!compose();by('hc-clear').disabled=!items.length;}
 function renderItems(){
  const host=by('hc-items');host.replaceChildren();
  items.forEach((item,index)=>{
   const card=el('li'),label=el('label','第 '+(index+1)+' 則'),input=el('textarea');
   input.rows=4;input.value=item.text;input.spellcheck=false;input.oninput=()=>{item.text=input.value;preview();};label.append(input);card.append(label);
   const actions=el('div',undefined,'hc-actions');
   for(const [name,delta]of [['上移',-1],['下移',1]]){const b=button(name,()=>{const target=index+delta;[items[index],items[target]]=[items[target],items[index]];renderItems();});b.disabled=!items[index+delta];actions.append(b);}
   actions.append(button('刪除此則',()=>{items=items.filter(i=>i.id!==item.id);renderItems();}));card.append(actions);host.append(card);
  });preview();
 }
 function renderLibrary(){
  const host=by('hc-library');host.replaceChildren();
  const terms=by('hc-search').value.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const rows=catalog.snippets.filter(row=>terms.every(t=>row.text.normalize('NFKC').toLocaleLowerCase().includes(t)));
  by('hc-results').textContent=rows.length+' / '+catalog.snippets.length+' 則';
  rows.forEach(row=>{
   const card=el('article',undefined,'hc-card');card.append(el('p',row.text));
   const actions=el('div',undefined,'hc-actions');
   actions.append(button('複製',()=>copy(row.text)),button('加入',()=>{items.push({id:++serial,text:row.text});renderItems();by('hc-status').textContent='已加入組合區。';}));
   card.append(actions);host.append(card);
  });if(!rows.length)host.append(el('p','找不到符合的罐頭。'));
 }
 function clear(){if(!mounted)return;items=[];by('hc-search').value='';by('hc-status').textContent='';renderItems();if(catalog)renderLibrary();}
 function mount(){
  if(mounted)return;mounted=true;
  panel.innerHTML='<div class="hc-shell"><header class="hc-head"><h1>健檢報告</h1><label>搜尋罐頭<input id="hc-search" type="search" placeholder="搜尋檢查項目、異常或建議" autocomplete="off"></label><span id="hc-results"></span><p>選取罐頭後可編輯、排序及複製。組合內容不會儲存，切換分頁即清除。</p></header><p id="hc-status" role="status" aria-live="polite"></p><div class="hc-layout"><section aria-label="健檢罐頭" id="hc-library"></section><section class="hc-composer" aria-label="組合區"><h2>組合區 <span id="hc-count">0 則</span></h2><ol id="hc-items"></ol><label>完整內容<textarea id="hc-preview" rows="8" readonly></textarea></label><div class="hc-actions"><button class="sg-btn sg-primary" id="hc-copy" type="button">全部複製</button><button class="sg-btn" id="hc-clear" type="button">清空</button></div></section></div></div>';
  by('hc-search').oninput=()=>{if(catalog)renderLibrary();};by('hc-copy').onclick=()=>copy(compose());by('hc-clear').onclick=clear;preview();
  window.addEventListener('pagehide',clear);window.addEventListener('scholar-sync-status',clear);
 }
 async function show(){
  mount();if(catalog){renderLibrary();return;}if(loading)return loading;
  by('hc-status').textContent='載入罐頭…';
  loading=(async()=>{try{const r=await fetch('checkup/snippets.json');if(!r.ok)throw Error('load');catalog=await r.json();renderLibrary();by('hc-status').textContent='';}catch(_){by('hc-status').textContent='罐頭載入失敗，請檢查連線後重試。';by('hc-library').replaceChildren(button('重試',show));}finally{loading=null;}})();return loading;
 }
 window.ScholarCheckup={show,hide:clear};
})();
