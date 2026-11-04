/* Local law search: lightweight suggestions and paged results, never re-render on typing. */
((root)=>{
 'use strict';
 const fold=text=>String(text??'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
 const termsFor=q=>[...new Set(String(q).normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean))];
 function makeIndex(laws,corpus){
  const metas=new Map(laws.map((l,i)=>[l.id,{...l,order:i}])),out=[];
  for(const law of metas.values())out.push({law:law.id,meta:law,kind:'law',where:'法規全文',text:'',norm:'',hay:fold(law.name)});
  for(const d of corpus){const meta=metas.get(d.law);if(!meta)continue;const title=d.annex?meta.annexes.find(a=>a.id===d.annex)?.title||'':'';
   out.push({...d,meta,kind:d.annex?'annex':'article',title,hay:fold(meta.name+' '+d.where+' '+title+' '+d.norm)});
  }
  return out;
 }
 function findResults(index,query){
  const terms=termsFor(query).map(fold);if(!terms.length)return [];
  return index.filter(d=>terms.every(t=>d.hay.includes(t))).sort((a,b)=>{
   const rank=d=>d.kind==='law'?(fold(d.meta.name)===fold(query)?0:1):d.kind==='article'?2:3;
   return rank(a)-rank(b)||a.meta.order-b.meta.order||(a.art&&b.art?a.art.localeCompare(b.art,undefined,{numeric:true}):a.where.localeCompare(b.where,undefined,{numeric:true}));
  });
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={fold,termsFor,makeIndex,findResults};
 if(typeof document==='undefined')return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let mounted=null,visible=false,closePage=()=>{},refreshTitle=()=>{};
 function mount(api){
  if(mounted===document.getElementById('lx-global-form'))return;mounted=document.getElementById('lx-global-form');
  const by=id=>document.getElementById(id),form=by('lx-global-form'),input=by('lx-global-q'),popup=by('lx-global-popup'),pane=by('lx-search-doc'),scroll=by('lx-scroll');
  let index=null,promise=null,timer=0,revision=0,submitRevision=0,active=-1,preview=[],committed='',results=[],page=0,saved=null;
  refreshTitle=()=>{if(visible)document.title=committed+' · 法規搜尋';};
  function hide(){popup.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;}
  function close(){if(!visible)return;visible=false;pane.hidden=true;by('lx-doc').hidden=saved.doc;by('lx-checked-doc').hidden=saved.checked;by('lx-reader-tools').hidden=saved.tools;by('lx-view-read').setAttribute('aria-pressed',saved.readPressed);by('lx-view-checked').setAttribute('aria-pressed',saved.checkedPressed);scroll.scrollTop=saved.top;api.closed?.();}
  closePage=()=>{revision++;submitRevision++;hide();close();};
  function enter(){
   if(!visible){api.remember();saved={doc:by('lx-doc').hidden,checked:by('lx-checked-doc').hidden,tools:by('lx-reader-tools').hidden,readPressed:by('lx-view-read').getAttribute('aria-pressed'),checkedPressed:by('lx-view-checked').getAttribute('aria-pressed'),top:scroll.scrollTop};}
   visible=true;by('lx-doc').hidden=by('lx-checked-doc').hidden=by('lx-reader-tools').hidden=true;pane.hidden=false;by('lx-view-read').setAttribute('aria-pressed','false');by('lx-view-checked').setAttribute('aria-pressed','false');scroll.scrollTop=0;
  }
  async function ensure(){
   if(index)return index;if(promise)return promise;
   promise=(async()=>{await api.ready();const docs=await api.corpus();index=makeIndex(api.catalog(),docs);return index;})().catch(e=>{promise=null;throw e;});return promise;
  }
  function excerpt(hit,terms){
   if(hit.kind==='law')return hit.meta.articles+'條條文'+(hit.meta.annexes.length?' · '+hit.meta.annexes.length+'個附表':'');
   const offsets=terms.map(t=>hit.norm.indexOf(t)).filter(n=>n>=0),target=offsets.length?Math.min(...offsets):0;let at=0,offset=0;
   while(at<hit.text.length&&offset<target){offset+=hit.text[at].normalize('NFKC').toLowerCase().length;at++;}
   const start=Math.max(0,at-28),end=Math.min(hit.text.length,at+125),piece=hit.text.slice(start,end).replace(/\s+/g,' ');
   return (start?'…':'')+api.rich(piece,null,terms)+(end<hit.text.length?'…':'');
  }
  function heading(hit,terms){return api.rich(hit.meta.name,null,terms)+(hit.kind==='law'?'':' — '+esc(hit.where)+(hit.title?' '+api.rich(hit.title,null,terms):''));}
  function showPreview(list,loading=false,error=false){
   if(document.activeElement!==input||!input.value.trim()){hide();return;}
   preview=list.slice(0,7);active=-1;input.removeAttribute('aria-activedescendant');
   popup.innerHTML=preview.map((hit,i)=>'<div role="option" aria-selected="false" id="lx-suggest-'+i+'" data-suggestion="'+i+'"><span class="lx-suggest-title">'+heading(hit,termsFor(input.value))+'</span><small>'+excerpt(hit,termsFor(input.value))+'</small></div>').join('')+'<div class="lx-suggest-status">'+(loading?'正在搜尋條文與附表…':error?'搜尋資料載入失敗，按Enter重試。':list.length?'共'+list.length+'筆 · 按Enter查看完整結果':'找不到符合的結果')+'</div>';
   popup.hidden=false;input.setAttribute('aria-expanded','true');
  }
  async function suggest(){
   const token=++revision,q=input.value.trim();by('lx-global-clear').hidden=!q;if(!q){hide();return;}
   if(index){showPreview(findResults(index,q));return;}
   showPreview(findResults(makeIndex(api.catalog(),[]),q),true);
   try{await ensure();if(token===revision)showPreview(findResults(index,q));}catch(_){if(token===revision)showPreview(findResults(makeIndex(api.catalog(),[]),q),false,true);}
  }
  function renderResults(){
   const terms=termsFor(committed),start=page*20,end=Math.min(start+20,results.length),pages=Math.ceil(results.length/20);
   let html='<div class="lx-results-head"><h1>搜尋結果</h1><p>「'+esc(committed)+'」 · 全部法規 · 共'+results.length+'筆'+(results.length?' · '+(start+1)+'–'+end:'')+'</p></div>';
   html+=results.slice(start,end).map((hit,i)=>'<section class="lx-result"><p class="lx-result-path">'+esc(hit.meta.tier)+' › '+(hit.kind==='law'?'法規全文':hit.kind==='annex'?'附表':'條文')+'</p><h2><button type="button" data-result="'+(start+i)+'">'+heading(hit,terms)+'</button></h2><p class="lx-result-snippet">'+excerpt(hit,terms)+'</p></section>').join('');
   if(!results.length)html+='<p class="lx-results-empty">找不到符合的法規、條文或附表。可試試較短的關鍵字，或用空格分開多個詞。</p>';
   if(pages>1)html+='<nav class="lx-results-pages" aria-label="搜尋結果分頁"><button type="button" data-result-page="'+(page-1)+'"'+(!page?' disabled':'')+'>上一頁</button><span>第'+(page+1)+'／'+pages+'頁</span><button type="button" data-result-page="'+(page+1)+'"'+(page+1===pages?' disabled':'')+'>下一頁</button></nav>';
   pane.innerHTML=html;scroll.scrollTop=0;document.title=committed+' · 法規搜尋';
  }
  async function submit(){
   const q=input.value.trim();if(!q){closePage();return;}
   const token=++submitRevision;revision++;clearTimeout(timer);hide();by('lx-global-clear').hidden=false;enter();committed=q;page=0;pane.innerHTML='<p class="lx-loading" role="status">搜尋「'+esc(q)+'」中…</p>';
   try{await ensure();if(token!==submitRevision||!visible)return;results=findResults(index,q);renderResults();}catch(_){if(token===submitRevision&&visible)pane.innerHTML='<p class="lx-results-empty" role="status">無法載入搜尋資料，請確認網路連線後重試。</p><button type="button" class="sg-btn" data-search-retry>重試</button>';}
   if(matchMedia('(pointer:coarse)').matches)input.blur();
  }
  async function open(hit,terms=termsFor(input.value)){hide();close();await api.open(hit,terms);}
  form.addEventListener('submit',e=>{e.preventDefault();if(active>=0&&preview[active])open(preview[active]);else submit();});
  input.addEventListener('input',e=>{if(e.isComposing)return;clearTimeout(timer);revision++;timer=setTimeout(suggest,140);});input.addEventListener('compositionend',()=>{clearTimeout(timer);timer=setTimeout(suggest,140);});
  input.addEventListener('focus',()=>{if(input.value.trim())suggest();});
  input.addEventListener('keydown',e=>{
   if(e.isComposing)return;
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();revision++;hide();}
   else if((e.key==='ArrowDown'||e.key==='ArrowUp')&&!popup.hidden&&preview.length){e.preventDefault();active=active<0?(e.key==='ArrowDown'?0:preview.length-1):(active+(e.key==='ArrowDown'?1:-1)+preview.length)%preview.length;popup.querySelectorAll('[role=option]').forEach((o,i)=>o.setAttribute('aria-selected',String(i===active)));input.setAttribute('aria-activedescendant','lx-suggest-'+active);by('lx-suggest-'+active).scrollIntoView({block:'nearest'});}
  });
  popup.addEventListener('mousedown',e=>e.preventDefault());popup.addEventListener('click',e=>{const option=e.target.closest('[data-suggestion]');if(option)open(preview[Number(option.dataset.suggestion)]);});
  document.addEventListener('pointerdown',e=>{if(!popup.hidden&&!form.contains(e.target)){revision++;hide();}});
  by('lx-global-clear').onclick=()=>{input.value='';by('lx-global-clear').hidden=true;closePage();input.focus();};
  pane.addEventListener('click',e=>{const hit=e.target.closest('[data-result]'),next=e.target.closest('[data-result-page]');if(hit)open(results[Number(hit.dataset.result)],termsFor(committed));else if(next){page=Number(next.dataset.resultPage);renderResults();pane.querySelector('h1').tabIndex=-1;pane.querySelector('h1').focus({preventScroll:true});}else if(e.target.closest('[data-search-retry]'))submit();});
 }
 root.ScholarLawSearch={mount,close:()=>closePage(),active:()=>visible,show:()=>refreshTitle()};
})(typeof window==='undefined'?globalThis:window);
