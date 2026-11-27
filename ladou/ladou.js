/* LaDou native reader: separate content, progress and highlight namespaces. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const findMatches = (text,query) => {
    const q=query.trim().toLocaleLowerCase();if(!q)return [];
    const source=text.toLocaleLowerCase(),matches=[];let from=0,index;
    while((index=source.indexOf(q,from))!==-1){matches.push([index,index+q.length]);from=index+q.length;}
    return matches;
  };
  if(typeof module!=='undefined'&&module.exports)module.exports={findMatches};
  if(typeof document==='undefined')return;
  const by=id=>document.getElementById(id),KEY='scholar-ladou-v1',MARKS='scholar-ladou-marks-v1';
  const compact=matchMedia('(max-width:1199px)');
  let saved={},marks={};try{saved=JSON.parse(window.ScholarStorage.getItem(KEY)||'{}')||{};marks=JSON.parse(window.ScholarStorage.getItem(MARKS)||'{}')||{};}catch(_){}
  if(typeof saved!=='object'||Array.isArray(saved))saved={};if(typeof marks!=='object'||Array.isArray(marks))marks={};
  let boot,manifest,current,data,request=0,searchRanges=[],active=-1,kind='table',selection=null,scrollTimer,observer,pageEditing=false;
  function persist(){try{window.ScholarStorage.setItem(KEY,JSON.stringify(saved));}catch(_){} }
  function saveMarks(){try{window.ScholarStorage.setItem(MARKS,JSON.stringify(marks));}catch(_){} }
  function measure(){const panel=by('ladou-panel');if(panel&&!panel.hidden)panel.style.setProperty('--ld-top',Math.max(0,panel.getBoundingClientRect().top)+'px');}
  function side(which,open){by('ld-layout').dataset[which]=String(open);by(which==='left'?'ld-side':'ld-rail').hidden=!open;by(which==='left'?'ld-menu':'ld-quick').setAttribute('aria-expanded',String(open));}
  function status(text){by('ld-status').textContent=text;}
  function nodes(root){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const result=[];let node;while((node=walker.nextNode()))result.push(node);return result;}
  function rangeAt(root,start,end){let offset=0,range=document.createRange(),begun=false;for(const node of nodes(root)){const next=offset+node.length;if(!begun&&start<next){range.setStart(node,start-offset);begun=true;}if(begun&&end<=next){range.setEnd(node,end-offset);return range;}offset=next;}return null;}
  function customHighlight(name,ranges){
    if(window.CSS?.highlights&&window.Highlight){CSS.highlights.set(name,new Highlight(...ranges));return true;}return false;
  }
  function paintSaved(){
    const ranges=[];for(const m of marks[current]||[]){const root=by(m.page);if(root){const r=rangeAt(root,m.start,m.end);if(r)ranges.push(r);}}
    if(customHighlight('ld-marks',ranges))return;
    by('ld-document').querySelectorAll('.ld-saved-mark').forEach(el=>el.replaceWith(...el.childNodes));
    for(const m of [...(marks[current]||[])].reverse()){
      const root=by(m.page);if(!root)continue;let offset=0;
      for(const node of nodes(root)){const start=Math.max(0,m.start-offset),end=Math.min(node.length,m.end-offset);offset+=node.length;if(end>start){const r=document.createRange();r.setStart(node,start);r.setEnd(node,end);const span=document.createElement('mark');span.className='ld-saved-mark';r.surroundContents(span);}}
    }
  }
  function remember(){if(!data||by('ladou-panel').hidden)return;const box=by('ld-scroll').getBoundingClientRect();const page=[...by('ld-document').querySelectorAll('.ld-page')].find(el=>el.getBoundingClientRect().bottom>box.top+30);if(page){saved.chapter=current;saved.page=Number(page.dataset.page);persist();}}
  function jump(id){const el=by(id);if(!el)return;el.scrollIntoView({block:'start',behavior:'instant'});if(compact.matches){side('left',false);side('right',false);}remember();}
  function renderToc(){
    const q=by('ld-toc-search').value.trim().toLocaleLowerCase();
    by('ld-contents').innerHTML=data.outline.filter(h=>!q||h.title.toLocaleLowerCase().includes(q)).map(h=>`<button type="button" class="ld-toc-link" data-ld-jump="${escape(h.id)}" data-level="${h.level}">${escape(h.title)}<small>p.${h.page}</small></button>`).join('')||'<p>找不到章節標題。</p>';
  }
  function renderObjects(){
    for(const k of ['table','figure'])by('ld-kind-'+k).setAttribute('aria-selected',String(k===kind));
    by('ld-object-list').innerHTML=data.objects.filter(o=>o.kind===kind).map(o=>`<button type="button" class="ld-object-link" data-ld-object="${escape(o.id)}"><strong>${escape(o.label)}</strong>${escape(o.title)}<small>p.${o.page}</small></button>`).join('')||'<p>本章沒有此類圖表。</p>';
  }
  async function loadChapter(id,restore=true){
    const ticket=++request;status('正在載入…');const chapter=manifest.chapters.find(c=>c.id===id)||manifest.chapters[0];
    try{
      const response=await fetch(chapter.file);if(!response.ok)throw Error('content unavailable');const next=await response.json();if(ticket!==request)return;
      current=chapter.id;data=next;searchRanges=[];active=-1;customHighlight('ld-search',[]);customHighlight('ld-active',[]);
      by('ld-document').innerHTML=`<header><h1>${escape(next.label)}: ${escape(next.title)}</h1><p>${escape(next.author)} · LaDou 6e</p></header>`+next.pages.map(p=>`<section class="ld-page" id="${escape(p.id)}" data-page="${p.number}"><span class="ld-page-number">PDF p.${p.number} / ${next.pages.length}</span><div class="ld-page-content" id="${escape(p.id)}-content">${p.html}</div></section>`).join('');
      by('ld-chapters').innerHTML=manifest.chapters.map(c=>`<button type="button" class="ld-chapter" data-ld-chapter="${escape(c.id)}" aria-current="${c.id===current?'true':'false'}">${escape(c.label)}<small>${escape(c.title)} · ${c.pages} 頁</small></button>`).join('');
      by('ld-page-number').max=next.pages.length;by('ld-page-number').value=restore?saved.page||1:1;by('ld-find-count').textContent='';
      renderToc();renderObjects();applySettings();linkReferences();paintSaved();
      const previous=restore?saved.page||1:1;by('ld-scroll').scrollTop=0;
      requestAnimationFrame(()=>{if(previous>1)jump(`a-page-${previous}`);});
      observer?.disconnect();observer=new IntersectionObserver(entries=>{if(pageEditing)return;for(const e of entries)if(e.isIntersecting)by('ld-page-number').value=e.target.dataset.page;},{root:by('ld-scroll'),rootMargin:'0px 0px -75% 0px'});
      by('ld-document').querySelectorAll('.ld-page').forEach(el=>observer.observe(el));status('');
    }catch(_){if(ticket===request){status('內容載入失敗，請重試。');const b=document.createElement('button');b.type='button';b.textContent='重試';b.onclick=()=>loadChapter(id,restore);by('ld-status').append(b);}}
  }
  function linkReferences(){
    for(const node of nodes(by('ld-document'))){if(node.parentElement.closest('button,a,figcaption,h1,h2,h3,h4,h5,h6'))continue;
      const re=/(Table|Figure) A[–-](\d+)/g;let match,from=0,fragment=null;
      while((match=re.exec(node.data))){const object=data.objects.find(o=>o.label.replace(/–/g,'-')===match[0].replace(/–/g,'-'));if(!object)continue;
        fragment||=document.createDocumentFragment();fragment.append(node.data.slice(from,match.index));const a=document.createElement('a');a.href='#'+object.id;a.dataset.ldObject=object.id;a.textContent=match[0];fragment.append(a);from=match.index+match[0].length;
      }if(fragment){fragment.append(node.data.slice(from));node.replaceWith(fragment);}
    }
  }
  function applySettings(){const panel=by('ladou-panel');panel.style.setProperty('--ld-font',(saved.font||18)+'px');panel.style.setProperty('--ld-line',saved.line||1.85);panel.style.setProperty('--ld-measure',saved.width==='full'?'none':'900px');panel.style.setProperty('--ld-face',saved.face==='serif'?"Georgia,'Times New Roman',serif":"Arial,'Noto Sans TC',sans-serif");}
  function search(){
    const query=by('ld-find').value.trim();searchRanges=[];active=-1;
    by('ld-document').querySelectorAll('.ld-search-mark').forEach(el=>el.replaceWith(...el.childNodes));
    if(query)for(const page of by('ld-document').querySelectorAll('.ld-page-content'))for(const [start,end]of findMatches(page.textContent,query)){const range=rangeAt(page,start,end);if(range)searchRanges.push(range);}
    customHighlight('ld-search',searchRanges);by('ld-find-count').textContent=query?`0 / ${searchRanges.length}`:'';
    if(searchRanges.length)moveFind(1);else customHighlight('ld-active',[]);
  }
  function moveFind(direction){if(!searchRanges.length)return;active=(active+direction+searchRanges.length)%searchRanges.length;const r=searchRanges[active];customHighlight('ld-active',[r]);r.startContainer.parentElement.scrollIntoView({block:'center',behavior:'instant'});by('ld-find-count').textContent=`${active+1} / ${searchRanges.length}`;if(compact.matches){side('left',false);side('right',false);}}
  async function copy(text,statusNode=by('ld-status')){try{await navigator.clipboard.writeText(text);statusNode.textContent='已複製';}catch(_){const area=document.createElement('textarea');area.className='ld-copy-fallback';area.value=text;area.setAttribute('aria-label','選取並複製內容');statusNode.replaceChildren(document.createTextNode('請按 Ctrl／⌘＋C 複製：'),area);area.focus();area.select();}}
  function openObject(id){const object=data.objects.find(o=>o.id===id);if(!object)return;by('ld-dialog-title').textContent=object.label+' · '+object.title;by('ld-dialog-body').innerHTML=object.html;by('ld-dialog-status').textContent='';by('ld-dialog').dataset.object=id;const dialog=by('ld-dialog');if(!dialog.open){if(window.ScholarPeek)window.ScholarPeek.open(dialog);else dialog.showModal();}by('ld-dialog-body').scrollTop=0;}
  function closeDialog(){const d=by('ld-dialog');if(window.ScholarPeek)window.ScholarPeek.close(d);else d.close();}
  function captureSelection(){const s=getSelection();selection=null;if(!s||s.isCollapsed||!s.rangeCount)return;const range=s.getRangeAt(0);const root=range.startContainer.parentElement.closest('.ld-page-content');if(!root||!root.contains(range.endContainer))return;const before=document.createRange();before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);selection={page:root.id,start:before.toString().length,end:before.toString().length+range.toString().length};}
  function bootReader(){
    by('ladou-panel').innerHTML=`<div class="ld-layout" id="ld-layout"><aside class="ld-side" id="ld-side"><div class="ld-side-head"><h2>LaDou <small>6e</small></h2><button type="button" id="ld-close-left" aria-label="收合目錄">‹</button></div><div class="ld-chapters" id="ld-chapters"></div><input id="ld-toc-search" type="search" placeholder="搜尋章節標題" aria-label="搜尋章節標題"><nav class="ld-contents" id="ld-contents" aria-label="章節目錄"></nav></aside><section class="ld-reader" aria-label="LaDou 閱讀器"><div class="ld-bar"><button id="ld-menu" type="button" aria-controls="ld-side">目錄</button><form class="ld-page-jump" id="ld-page-form"><input id="ld-page-number" type="number" min="1" value="1" aria-label="PDF 頁碼"><button type="submit">前往</button></form><form class="ld-word-search" id="ld-search-form"><input id="ld-find" type="search" placeholder="章內搜尋" aria-label="章內搜尋"><button type="submit">搜尋</button><button id="ld-find-prev" type="button" aria-label="上一筆搜尋結果">↑</button><button id="ld-find-next" type="button" aria-label="下一筆搜尋結果">↓</button><output id="ld-find-count" aria-live="polite"></output></form><button type="button" id="ld-mark">畫線</button><button type="button" id="ld-unmark">移除畫線</button><details id="ld-reading-settings"><summary>閱讀設定</summary><div class="ld-settings"><label>字級<select id="ld-font"><option>16</option><option>18</option><option>20</option><option>22</option><option>24</option></select></label><label>行距<select id="ld-line"><option value="1.6">緊湊</option><option value="1.85">標準</option><option value="2.1">寬鬆</option></select></label><label>寬度<select id="ld-width"><option value="reading">閱讀寬度</option><option value="full">填滿</option></select></label><label>字體<select id="ld-face"><option value="sans">無襯線</option><option value="serif">襯線</option></select></label></div></details><button id="ld-quick" type="button" aria-controls="ld-rail">表格快覽</button></div><div class="ld-status" id="ld-status" role="status"></div><div class="ld-scroll" id="ld-scroll" tabindex="0" aria-label="附錄內文"><article class="ld-document" id="ld-document"></article></div></section><aside class="ld-rail" id="ld-rail"><div class="ld-rail-head"><h2>表格快覽</h2><div class="ld-kind-tabs" role="tablist" aria-label="圖表類型"><button type="button" role="tab" id="ld-kind-table" aria-controls="ld-object-list">Table</button><button type="button" role="tab" id="ld-kind-figure" aria-controls="ld-object-list">Figure</button></div><button type="button" id="ld-close-right" aria-label="收合表格快覽">›</button></div><div class="ld-object-list" id="ld-object-list" role="tabpanel"></div></aside></div><dialog class="ld-dialog" id="ld-dialog"><div class="ld-dialog-head"><h2 id="ld-dialog-title"></h2><button type="button" id="ld-dialog-copy">複製</button><button type="button" id="ld-dialog-close" aria-label="關閉圖表">關閉</button></div><div class="ld-dialog-status" id="ld-dialog-status" role="status"></div><div class="ld-dialog-body" id="ld-dialog-body"></div></dialog>`;
    by('ld-menu').onclick=()=>side('left',by('ld-side').hidden);by('ld-close-left').onclick=()=>side('left',false);by('ld-quick').onclick=()=>side('right',by('ld-rail').hidden);by('ld-close-right').onclick=()=>side('right',false);
    side('left',!compact.matches);side('right',!compact.matches);
    by('ladou-panel').addEventListener('click',e=>{const object=e.target.closest('[data-ld-object]');if(object){e.preventDefault();openObject(object.dataset.ldObject);}const heading=e.target.closest('[data-ld-jump]');if(heading)jump(heading.dataset.ldJump);const chapter=e.target.closest('[data-ld-chapter]');if(chapter&&chapter.dataset.ldChapter!==current)loadChapter(chapter.dataset.ldChapter,false);});
    by('ld-toc-search').oninput=renderToc;by('ld-kind-table').onclick=()=>{kind='table';renderObjects();};by('ld-kind-figure').onclick=()=>{kind='figure';renderObjects();};
    for(const k of ['font','line','width','face']){const el=by('ld-'+k);el.value=saved[k]||({font:18,line:1.85,width:'reading',face:'sans'})[k];el.onchange=()=>{saved[k]=el.value;applySettings();persist();};}
    by('ld-page-number').oninput=()=>{pageEditing=true;};
    by('ld-page-form').onsubmit=e=>{e.preventDefault();const number=Math.max(1,Math.min(data.pages.length,Number(by('ld-page-number').value)||1));pageEditing=false;by('ld-page-number').value=number;jump(`a-page-${number}`);};
    by('ld-search-form').onsubmit=e=>{e.preventDefault();search();};by('ld-find').addEventListener('input',()=>{if(!by('ld-find').value)search();});by('ld-find-prev').onclick=()=>moveFind(-1);by('ld-find-next').onclick=()=>moveFind(1);
    by('ld-document').addEventListener('pointerup',captureSelection);document.addEventListener('selectionchange',()=>{if(!by('ladou-panel').hidden)captureSelection();});
    by('ld-mark').addEventListener('pointerdown',e=>{captureSelection();e.preventDefault();});by('ld-mark').onclick=()=>{if(!selection){status('請先選取同一頁內要畫線的文字。');return;}marks[current]||=[];marks[current].push({...selection});saveMarks();paintSaved();status('已畫線');};
    by('ld-unmark').addEventListener('pointerdown',e=>{captureSelection();e.preventDefault();});by('ld-unmark').onclick=()=>{if(!selection){status('請先選取要移除畫線的文字。');return;}marks[current]=(marks[current]||[]).filter(m=>m.page!==selection.page||m.end<=selection.start||m.start>=selection.end);saveMarks();paintSaved();status('已移除選取範圍的畫線');};
    by('ld-dialog-close').onclick=closeDialog;by('ld-dialog').addEventListener('cancel',e=>{e.preventDefault();closeDialog();});by('ld-dialog').setAttribute('aria-labelledby','ld-dialog-title');by('ld-dialog-copy').onclick=()=>copy(by('ld-dialog-title').textContent+'\n'+by('ld-dialog-body').innerText,by('ld-dialog-status'));
    by('ld-scroll').addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(remember,300);},{passive:true});window.addEventListener('pagehide',remember);
    new ResizeObserver(measure).observe(by('study-nav'));window.addEventListener('resize',measure,{passive:true});
  }
  window.ScholarLadou={async show(){if(!boot)boot=(async()=>{bootReader();const r=await fetch('ladou/index.json');if(!r.ok)throw Error('manifest unavailable');manifest=await r.json();await loadChapter(saved.chapter||manifest.chapters[0].id);})().catch(()=>{boot=null;by('ladou-panel').textContent='載入失敗，請切換分頁後重試。';});await boot;measure();}};
})();
