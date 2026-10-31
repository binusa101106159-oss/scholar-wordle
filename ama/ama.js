/* AMA reader. Content, storage and controls are independent of 指引. */
(() => {
  'use strict';
  const STORE = 'scholar-ama-v1', MARKS = 'scholar-ama-marks-v1';
  const mobile = matchMedia('(max-width: 900px)'), by = id => document.getElementById(id), chapters = new Map();
  let catalogue, loading, current, menuOpen = false, revision = 0, scrollTimer, searchRevision = 0;
  let saved = {}, highlights = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (_) { /* Optional storage. */ }
  try { highlights = JSON.parse(localStorage.getItem(MARKS) || '{}'); } catch (_) { /* Optional storage. */ }
  if (!saved || typeof saved !== 'object') saved = {};
  if (!highlights || typeof highlights !== 'object') highlights = {};
  saved.positions ||= {};

  function persist() { try { localStorage.setItem(STORE,JSON.stringify(saved)); } catch (_) { /* Reading stays available. */ } }
  function measure() {
    const panel = by('ama-panel');
    if (panel && !panel.hidden) panel.style.setProperty('--ax-top',Math.max(0,panel.getBoundingClientRect().top)+'px');
  }
  function revealSelection() {
    if (by('ax-side').hidden) return;
    const list = by('ax-list'), selected = list.querySelector('[aria-selected="true"]');
    if (!selected) return;
    const item = selected.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop += item.top-bounds.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom-bounds.bottom;
  }
  function menu(open) {
    menuOpen = mobile.matches && open;
    by('ax-side').hidden = mobile.matches && !menuOpen;
    by('ax-menu').setAttribute('aria-expanded',String(menuOpen)); revealSelection();
  }
  async function content(id) {
    if (!chapters.has(id)) chapters.set(id,(async () => {
      const response = await fetch('ama/'+id+'.json');
      if (!response.ok) throw new Error('AMA chapter unavailable');
      return response.json();
    })().catch(error => { chapters.delete(id); throw error; }));
    return chapters.get(id);
  }
  function chapterText(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('button,.ax-page-label').forEach(n => n.remove());
    return copy.textContent;
  }
  function textNodes(root) {
    const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
      acceptNode(node) { return node.parentElement.closest('button,svg,.ax-page-label')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT; }
    });
    const nodes = []; let node;
    while ((node=walker.nextNode())) nodes.push(node);
    return nodes;
  }
  function applyMarks(page,ranges) {
    const nodes = textNodes(page); let offset = 0;
    for (const node of nodes) {
      const start = offset, end = start+node.length; offset = end;
      const intersections = ranges.filter(r => r.start<end && r.end>start).map(r => [Math.max(0,r.start-start),Math.min(node.length,r.end-start)]);
      if (!intersections.length) continue;
      const cuts = [...new Set([0,node.length,...intersections.flat()])].sort((a,b)=>a-b), fragment = document.createDocumentFragment();
      for (let i=0;i<cuts.length-1;i++) {
        const text = node.textContent.slice(cuts[i],cuts[i+1]);
        if (intersections.some(([a,b])=>a<=cuts[i] && b>=cuts[i+1])) {
          const mark = document.createElement('mark'); mark.className='ax-highlight'; mark.textContent=text; fragment.append(mark);
        } else fragment.append(document.createTextNode(text));
      }
      node.replaceWith(fragment);
    }
  }
  function restoreMarks() {
    const entries = highlights[current] || {};
    by('ax-body').querySelectorAll('.ax-page').forEach(page => {
      const stored = entries[page.dataset.page];
      if (stored && textNodes(page).reduce((n,node)=>n+node.length,0)===stored.length) applyMarks(page,stored.ranges);
    });
  }
  function markSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0), startElement = range.startContainer.parentElement;
    const page = startElement && startElement.closest('.ax-page');
    if (!page || !by('ax-body').contains(page) || !page.contains(range.endContainer) || startElement.closest('svg,button')) {
      by('ax-status').textContent='請選取同一原書頁內的正文。'; return;
    }
    const nodes = textNodes(page); let offset=0,start=-1,end=-1;
    for (const node of nodes) {
      if (node===range.startContainer) start=offset+range.startOffset;
      if (node===range.endContainer) end=offset+range.endOffset;
      offset+=node.length;
    }
    if (start<0 || end<=start) return;
    highlights[current] ||= {};
    const entry = highlights[current][page.dataset.page] ||= {length:offset,ranges:[]};
    entry.ranges.push({start,end});
    try { localStorage.setItem(MARKS,JSON.stringify(highlights)); } catch (_) { /* Optional storage. */ }
    applyMarks(page,[{start,end}]); selection.removeAllRanges(); by('ax-status').textContent='已儲存標記。';
  }
  function renderChapter(data) {
    const fragment = document.createDocumentFragment();
    for (const source of data.pages) {
      const page = document.createElement('section'); page.className='ax-page'; page.id='ax-page-'+source.page; page.dataset.page=source.page;
      const label = document.createElement('div'); label.className='ax-page-label'; label.textContent='原書第 '+source.page+' 頁';
      const body = document.createElement('div'); body.className='ax-page-content'; body.innerHTML=source.html;
      page.append(label,body); fragment.append(page);
    }
    by('ax-body').replaceChildren(fragment);
    const choices = [{id:'',title:'本章小節'},...data.sections,...data.attachments.filter(a=>a.kind==='appendix').map(a=>({id:a.id,title:a.label}))];
    by('ax-section').replaceChildren(...choices.map(section => {
      const option=document.createElement('option'); option.value=section.id; option.textContent=section.title; return option;
    }));
    restoreMarks();
  }
  function scrollToId(id) {
    const target=document.getElementById(id);
    if (target && by('ax-body').contains(target)) by('ax-scroll').scrollTop+=target.getBoundingClientRect().top-by('ax-scroll').getBoundingClientRect().top-16;
  }
  async function selectChapter(id,options={}) {
    const chapter=catalogue.chapters.find(c=>c.id===id);
    if (!chapter) return;
    clearTimeout(scrollTimer);
    if (current) saved.positions[current]=by('ax-scroll').scrollTop;
    current=id; const version=++revision;
    document.querySelectorAll('.ax-chapter').forEach(button => {
      const selected=button.dataset.chapter===id;
      button.setAttribute('aria-selected',String(selected)); button.tabIndex=selected?0:-1;
    });
    by('ax-content').setAttribute('aria-labelledby','ax-tab-'+id);
    by('ax-kicker').textContent='Chapter '+chapter.no; by('ax-title').textContent=chapter.title;
    by('ax-meta').textContent='原書第 '+chapter.start+'–'+chapter.end+' 頁 · '+chapter.pages+' 頁';
    by('ax-location').textContent='第 '+chapter.no+' 章／共 '+catalogue.chapters.length+' 章';
    by('ax-tools').hidden=!chapter.ready; by('ax-status').textContent=''; by('ax-section').replaceChildren();
    by('ax-body').innerHTML='<div class="ax-pending sg-glass"><p>'+(chapter.ready?'載入中…':'正文準備中。')+'</p>'+(chapter.ready?'':'<p>本章正文與圖表尚未匯入。</p>')+'</div>';
    saved.chapter=id; persist();
    if (mobile.matches && options.closeMenu!==false) menu(false); else revealSelection();
    if (options.focusTab) by('ax-tab-'+id).focus();
    else if (options.focusHeading && mobile.matches) by('ax-title').focus({preventScroll:true});
    by('ax-scroll').scrollTop=0;
    if (!chapter.ready) return;
    try {
      const data=await content(id);
      if (version!==revision) return;
      renderChapter(data);
      requestAnimationFrame(() => {
        if (version!==revision) return;
        if (options.anchor) scrollToId(options.anchor); else by('ax-scroll').scrollTop=saved.positions[id]||0;
      });
    } catch (_) { if (version===revision) by('ax-body').textContent='無法載入本章，請稍後再試。'; }
  }
  async function openObject(id,chapterId) {
    const chapter=chapterId||current, data=await content(chapter), object=data.attachments.find(a=>a.id===id);
    if (!object) return;
    by('ax-dialog-title').textContent=object.label+' · 原書第 '+object.page+' 頁';
    const body=by('ax-dialog-body'); body.innerHTML=object.html; body.dataset.chapter=chapter;
    const ids=new Map();
    body.querySelectorAll('[id]').forEach(node=>{const old=node.id;node.id='ax-popup-'+old;ids.set(old,node.id);});
    body.querySelectorAll('[clip-path]').forEach(node=>{
      node.setAttribute('clip-path',node.getAttribute('clip-path').replace(/url\(#([^)]+)\)/g,(_,old)=>'url(#'+(ids.get(old)||old)+')'));
    });
    if (!by('ax-dialog').open) by('ax-dialog').showModal();
    body.scrollTop=0;
  }
  async function search() {
    const query=by('ax-query').value.trim(),version=++searchRevision,results=by('ax-results');
    results.replaceChildren(); results.hidden=!query;
    if (!query) return;
    const needle=query.toLocaleLowerCase();let count=0;
    results.textContent='搜尋中…';const fragment=document.createDocumentFragment();
    for (const chapter of catalogue.chapters.filter(c=>c.ready)) {
      const data=await content(chapter.id);
      if (version!==searchRevision) return;
      for (const page of data.pages) {
        const holder=document.createElement('div'); holder.innerHTML=page.html;
        const text=chapterText(holder).replace(/\s+/g,' '),index=text.toLocaleLowerCase().indexOf(needle);
        if (index<0) continue;
        const button=document.createElement('button');button.type='button';button.className='ax-result';
        const label=document.createElement('strong');label.textContent='Chapter '+chapter.no+' · 第 '+page.page+' 頁';
        const excerpt=document.createElement('span');excerpt.textContent=(index>60?'…':'')+text.slice(Math.max(0,index-60),index+needle.length+100)+'…';
        button.append(label,excerpt);
        button.addEventListener('click',async()=>{results.hidden=true;await selectChapter(chapter.id,{anchor:'ax-page-'+page.page});});
        fragment.append(button);count++;
      }
    }
    const status=document.createElement('p');status.textContent=count?count+' 頁符合（已匯入章節）':'已匯入章節中沒有符合的內容。';
    results.replaceChildren(status,fragment);
  }
  function fontSize(delta=0) {
    saved.fontSize=Math.max(15,Math.min(24,(Number(saved.fontSize)||18)+delta));
    by('ama-panel').style.setProperty('--ax-font-size',saved.fontSize+'px');persist();
  }
  async function boot() {
    const response=await fetch('ama/index.json',{cache:'no-cache'});
    if (!response.ok) throw new Error('AMA catalogue unavailable');
    catalogue=await response.json();
    const panel=by('ama-panel');
    panel.innerHTML='<div class="ax-layout">'+
      '<aside id="ax-side" class="ax-side sg-glass" aria-label="AMA 章節選單"><div class="ax-side-head"><p>AMA Guides · Sixth Edition</p><h2>章節<span id="ax-count"></span></h2></div>'+
      '<form id="ax-search" class="ax-search"><label class="ax-sr" for="ax-query">搜尋已匯入章節</label><input id="ax-query" type="search" placeholder="搜尋已匯入章節" autocomplete="off"><button type="submit" class="sg-btn">搜尋</button></form>'+
      '<div id="ax-results" class="ax-results" aria-live="polite" hidden></div><div id="ax-list" class="ax-list" role="tablist" aria-label="AMA 章節" aria-orientation="vertical"></div></aside>'+
      '<div class="ax-reader"><div class="ax-bar"><button id="ax-menu" class="sg-btn" type="button" aria-controls="ax-side" aria-expanded="false">章節</button><span id="ax-location" class="ax-location"></span></div>'+
      '<div id="ax-tools" class="ax-tools" hidden><label class="ax-sr" for="ax-section">本章小節</label><select id="ax-section"></select><div class="ax-reading-controls"><button id="ax-smaller" type="button" aria-label="縮小文字">A−</button><button id="ax-larger" type="button" aria-label="放大文字">A＋</button><button id="ax-mark" type="button">標記選取</button><button id="ax-clear-marks" type="button">清除本章標記</button></div></div><div id="ax-status" class="ax-status" role="status"></div>'+
      '<div id="ax-scroll" class="ax-scroll"><article id="ax-content" role="tabpanel" tabindex="0"><div class="ax-head sg-glass"><p id="ax-kicker" class="ax-kicker"></p><h1 id="ax-title" class="ax-title" tabindex="-1"></h1><p id="ax-meta" class="ax-meta"></p></div><div id="ax-body"></div></article></div></div></div>'+
      '<dialog id="ax-dialog" class="ax-dialog" aria-labelledby="ax-dialog-title"><div class="ax-dialog-bar"><h2 id="ax-dialog-title"></h2><button id="ax-dialog-close" type="button" aria-label="關閉圖表">關閉</button></div><div id="ax-dialog-body" class="ax-dialog-body"></div></dialog>';
    by('ax-count').textContent=catalogue.chapters.length+' 章';
    for (const chapter of catalogue.chapters) {
      const button=document.createElement('button');
      button.type='button';button.id='ax-tab-'+chapter.id;button.className='ax-chapter';button.dataset.chapter=chapter.id;
      button.setAttribute('role','tab');button.setAttribute('aria-controls','ax-content');
      for (const [cls,value] of [['ax-number',chapter.no],['ax-name',chapter.title],['ax-pages',chapter.pages+' 頁'+(chapter.ready?' · 已匯入':'')]]) {
        const span=document.createElement('span');span.className=cls;span.textContent=value;button.append(span);
      }
      button.addEventListener('click',()=>selectChapter(chapter.id,{focusHeading:true}));by('ax-list').append(button);
    }
    by('ax-list').addEventListener('keydown',event=>{
      const button=event.target.closest('.ax-chapter');
      if (!button || !['ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
      event.preventDefault();event.stopPropagation();
      const list=catalogue.chapters,index=list.findIndex(c=>c.id===button.dataset.chapter);
      const next=event.key==='Home'?0:event.key==='End'?list.length-1:(index+(event.key==='ArrowDown'?1:-1)+list.length)%list.length;
      selectChapter(list[next].id,{focusTab:true,closeMenu:false});
    });
    by('ax-menu').addEventListener('click',()=>menu(!menuOpen));
    by('ax-section').addEventListener('change',()=>scrollToId(by('ax-section').value));
    by('ax-body').addEventListener('click',event=>{
      const ref=event.target.closest('[data-open]');if(ref){event.preventDefault();openObject(ref.dataset.open,ref.dataset.chapter);}
    });
    by('ax-dialog-body').addEventListener('click',event=>{
      const ref=event.target.closest('[data-open]');if(ref){event.preventDefault();openObject(ref.dataset.open,ref.dataset.chapter||by('ax-dialog-body').dataset.chapter);}
    });
    by('ax-dialog-close').addEventListener('click',()=>by('ax-dialog').close());
    by('ax-dialog').addEventListener('click',event=>{if(event.target===by('ax-dialog'))by('ax-dialog').close();});
    by('ax-search').addEventListener('submit',event=>{event.preventDefault();search();});
    by('ax-query').addEventListener('input',()=>{if(!by('ax-query').value){searchRevision++;by('ax-results').hidden=true;}});
    by('ax-smaller').addEventListener('click',()=>fontSize(-1));by('ax-larger').addEventListener('click',()=>fontSize(1));
    by('ax-mark').addEventListener('mousedown',event=>event.preventDefault());by('ax-mark').addEventListener('click',markSelection);
    by('ax-clear-marks').addEventListener('click',()=>{
      delete highlights[current];try{localStorage.setItem(MARKS,JSON.stringify(highlights));}catch(_){/* Optional storage. */}
      by('ax-body').querySelectorAll('mark.ax-highlight').forEach(mark=>mark.replaceWith(...mark.childNodes));by('ax-status').textContent='已清除本章標記。';
    });
    by('ax-scroll').addEventListener('scroll',()=>{
      clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{if(current){saved.positions[current]=by('ax-scroll').scrollTop;persist();}},200);
    },{passive:true});
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuOpen){menu(false);by('ax-menu').focus();}});
    fontSize();await selectChapter(catalogue.chapters.some(c=>c.id===saved.chapter)?saved.chapter:catalogue.chapters[0].id);
    menu(false);measure();
  }
  function show() {
    measure();
    if(!loading)loading=boot().catch(()=>{by('ama-panel').textContent='無法載入 AMA 章節目錄，請稍後再試。';loading=null;});
    else if(catalogue)menu(false);
    return loading;
  }
  mobile.addEventListener('change',()=>{if(catalogue)menu(false);});
  window.addEventListener('resize',measure);window.addEventListener('pagehide',persist);
  window.ScholarAMA={show};
})();
