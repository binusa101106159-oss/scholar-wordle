/* Official IARC classification snapshot; raw official records retained in data.json. */
((root)=>{
 'use strict';
 const normalize=text=>String(text??'').normalize('NFKC').toLowerCase().replace(/[αβγ]/g,c=>({α:'alpha',β:'beta',γ:'gamma'}[c])).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 function createIndex(data){
  const rows=new Map(data.entries.map(row=>[row.id,row]));
  const indexed=data.entries.map(row=>({row,search:normalize([row.text,...row.category,rows.get(row.parent)?.text||'',row.group,'group'+row.group].join(' '))}));
  return (query='',group='')=>{
   const terms=normalize(query).split(' ').filter(Boolean);
   return indexed.filter(item=>(!group||item.row.group===group)&&terms.every(term=>item.search.includes(term))).map(item=>item.row);
  };
 }
 if(typeof module==='object'&&module.exports)module.exports={normalize,createIndex};
 if(typeof document==='undefined')return;
 let loading,ready=false;
 async function show(){
  const host=document.getElementById('iarc-panel');if(!host||ready)return;
  host.innerHTML='<p role="status">載入 IARC 清單…</p>';
  try{
   if(!loading)loading=fetch('iarc/data.json').then(r=>{if(!r.ok)throw Error();return r.json();}).catch(e=>{loading=null;throw e;});
   const data=await loading;if(ready)return;ready=true;render(host,data);
  }catch(_){host.innerHTML='<p role="status">無法載入 IARC 清單。</p><button type="button">重試</button>';host.querySelector('button').onclick=show;}
 }
 function render(host,data){
  host.innerHTML='<section class="ir-app"><button id="ir-menu-toggle" type="button" aria-controls="ir-sidebar" aria-expanded="false">搜尋／分類</button><aside id="ir-sidebar" class="ir-sidebar" aria-label="IARC搜尋與分類"><header class="ir-header"><h1>IARC</h1><a href="https://monographs.iarc.who.int/list-of-classifications/" target="_blank" rel="noopener">官方分類</a></header><div class="ir-search-bar"><label for="ir-search" class="ir-sr">搜尋 IARC 清單</label><input id="ir-search" type="search" placeholder="搜尋英文名稱或關鍵字" autocomplete="off" spellcheck="false"><button type="button" id="ir-clear" aria-label="清除搜尋">×</button></div><div id="ir-groups" class="ir-groups" role="group" aria-label="分類篩選"><button type="button" data-ir-group="" aria-pressed="true">全部</button>'+['1','2A','2B','3'].map(group=>'<button type="button" data-ir-group="'+group+'" aria-pressed="false">Group '+group+'</button>').join('')+'</div></aside><div class="ir-content"><div class="ir-table-wrap"><table class="ir-table"><colgroup><col class="ir-group-col"><col></colgroup><thead><tr><th scope="col">分類</th><th scope="col">項目</th></tr></thead><tbody id="ir-rows"></tbody></table></div><p id="ir-empty" role="status" hidden>沒有符合項目。</p><button id="ir-more" type="button" hidden>顯示更多</button></div></section>';
  const by=id=>host.querySelector('#'+id),query=by('ir-search'),body=by('ir-rows'),more=by('ir-more');
  by('ir-menu-toggle').onclick=()=>{const app=host.querySelector('.ir-app'),open=app.classList.toggle('ir-menu-open');by('ir-menu-toggle').setAttribute('aria-expanded',String(open));};
  const search=createIndex(data),all=new Map(data.entries.map(row=>[row.id,row])),cache=new Map();
  let group='',limit=60,matches=[],frame=0;
  function rowNode(row){
   if(cache.has(row.id))return cache.get(row.id);
   const tr=document.createElement('tr'),classification=document.createElement('td'),name=document.createElement('td'),text=document.createElement('p'),category=document.createElement('p');
   tr.dataset.irId=row.id;classification.className='ir-classification';classification.textContent=row.group;
   text.className='ir-name';text.textContent=row.text;
   category.className='ir-category';category.textContent=[...row.category,all.get(row.parent)?.text].filter(Boolean).join(' / ');
   name.append(text,category);tr.append(classification,name);tr.tabIndex=-1;cache.set(row.id,tr);return tr;
  }
  function paint(){body.replaceChildren(...matches.slice(0,limit).map(rowNode));more.hidden=matches.length<=limit;by('ir-empty').hidden=matches.length!==0;}
  function update(){limit=60;matches=search(query.value,group);paint();}
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;update();});}
  query.addEventListener('input',schedule);
  by('ir-clear').onclick=()=>{query.value='';query.focus();update();};
  by('ir-groups').onclick=e=>{const button=e.target.closest('[data-ir-group]');if(!button)return;group=button.dataset.irGroup;by('ir-groups').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));update();host.querySelector('.ir-app').classList.remove('ir-menu-open');by('ir-menu-toggle').setAttribute('aria-expanded','false');};
  more.onclick=()=>{const before=limit;limit+=60;paint();body.children[before]?.focus({preventScroll:true});};
  update();
 }
 root.ScholarIARC={show};
})(typeof window==='undefined'?globalThis:window);
