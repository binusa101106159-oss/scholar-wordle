/* AMA reader. Content, storage and controls are independent of 指引. */
(() => {
  'use strict';
  const STORE = 'scholar-ama-v1', MARKS = 'scholar-ama-marks-v1';
  const mobile = matchMedia('(max-width:1099px), (orientation:portrait)'), by = id => document.getElementById(id), chapters = new Map();
  const tableCaptions=new Map(), tableQueries=new Map(), objects=new Map();
  let fastIndex, searchIndex, renderedChapter, objectRevision=0, anchorRevision=0;
  const readingFonts={default:'',georgia:"Georgia,'Times New Roman',serif",times:"'Times New Roman',Times,serif",arial:'Arial,Helvetica,sans-serif',system:"system-ui,'Noto Sans TC','Microsoft JhengHei',sans-serif"};
  let catalogue, loading, current, menuOpen = false, revision = 0, scrollTimer, searchRevision = 0;
  let saved = {}, highlights = {};
  const visiblePages=new Map();let pageObserver;
  try { saved = JSON.parse(window.ScholarStorage.getItem(STORE) || '{}'); } catch (_) { /* Optional storage. */ }
  try { highlights = JSON.parse(window.ScholarStorage.getItem(MARKS) || '{}'); } catch (_) { /* Optional storage. */ }
  if (!saved || typeof saved !== 'object') saved = {};
  if (!highlights || typeof highlights !== 'object') highlights = {};
  saved.positions ||= {};saved.anchors ||= {};

  function persist() { try { window.ScholarStorage.setItem(STORE,JSON.stringify(saved)); } catch (_) { /* Reading stays available. */ } }
  function measure() {
    const panel = by('ama-panel');
    if (panel && !panel.hidden) panel.style.setProperty('--ax-top',Math.max(0,panel.getBoundingClientRect().top)+'px');
  }
  function revealSelection() {
    if (!menuOpen) return;
    const list = by('ax-list'), selected = list.querySelector('[aria-selected="true"]');
    if (!selected) return;
    const item = selected.getBoundingClientRect(), bounds = list.getBoundingClientRect();
    if (item.top < bounds.top) list.scrollTop += item.top-bounds.top;
    else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom-bounds.bottom;
  }
  function updateSidebar() {
    by('ax-layout').dataset.sidebarCollapsed = String(!menuOpen);
    by('ama-panel').classList.toggle('ax-drawer', menuOpen);
    by('ax-side').hidden = false;
    by('ax-side').inert = !menuOpen;
    by('ax-side').setAttribute('aria-hidden', String(!menuOpen));
    for (const id of ['ax-sidebar-toggle', 'ax-menu']) {
      const button = by(id);
      button.setAttribute('aria-expanded', String(menuOpen));
      button.setAttribute('aria-label', menuOpen ? '收合目錄' : '展開目錄');
      button.title = menuOpen ? '收合目錄' : '展開目錄';
    }
  }
  function menu(open) {
    const restoreFocus = !open && by('ax-side').contains(document.activeElement);
    menuOpen = Boolean(open);
    updateSidebar(); if (restoreFocus) by('ax-menu').focus({preventScroll:true}); revealSelection();
  }
  async function packedJSON(file) {
    const response=await fetch(file);
    if(!response.ok)throw new Error('AMA content unavailable');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes[0]===31 && bytes[1]===139) return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
    return new Response(bytes).json();
  }
  function fastManifest() {
    if(!fastIndex)fastIndex=fetch('ama/fast/index.json').then(r=>{if(!r.ok)throw new Error('AMA manifest unavailable');return r.json();}).catch(e=>{fastIndex=null;throw e;});
    return fastIndex;
  }
  async function legacyContent(id) {
    const response=await fetch('ama/'+id+'.json');
    if(!response.ok)throw new Error('AMA chapter unavailable');return response.json();
  }
  async function content(id) {
    if(!chapters.has(id))chapters.set(id,(async()=>{
      if('DecompressionStream' in window) {
        try {const index=await fastManifest();if(index.chapters[id])return await packedJSON(index.chapters[id].file);}catch(_){ /* Original source remains a fallback. */ }
      }
      return legacyContent(id);
    })().catch(error=>{chapters.delete(id);throw error;}));
    return chapters.get(id);
  }
  async function objectContent(meta,chapter) {
    if(meta.html!==undefined)return meta;
    if(!objects.has(meta.id))objects.set(meta.id,packedJSON(meta.file).catch(async()=>{
      const data=await legacyContent(chapter);return data.attachments.find(a=>a.id===meta.id);
    }).catch(error=>{objects.delete(meta.id);throw error;}));
    return objects.get(meta.id);
  }
  function rememberReaderPosition() {
    if(!current||renderedChapter!==current)return;
    const sc=by('ax-scroll'),top=sc.getBoundingClientRect().top;
    saved.positions[current]=sc.scrollTop;
    // Avoid a geometry scan across every preceding source page during scrolling.
    // IntersectionObserver already knows which source page is on screen.
    const page=[...visiblePages.keys()].filter(page=>page.isConnected).sort((a,b)=>Number(a.dataset.page)-Number(b.dataset.page))[0];
    if(page){const rect=page.getBoundingClientRect();saved.anchors[current]={page:page.dataset.page,offset:top-rect.top};}
  }
  function alignReaderTarget(target,offset) {
    const token=++anchorRevision,version=revision,sc=by('ax-scroll');
    // Nearby skipped pages can acquire their measured height after the first scroll.
    const align=remaining=>{
      if(token!==anchorRevision||version!==revision||!target.isConnected)return;
      sc.scrollTop+=target.getBoundingClientRect().top-sc.getBoundingClientRect().top-offset;
      if(remaining)requestAnimationFrame(()=>align(remaining-1));
    };
    align(4);
  }
  function restoreReaderPosition(id,options) {
    const sc=by('ax-scroll'),anchor=saved.anchors[id];
    if(options.anchor){scrollToId(options.anchor);return;}
    if(anchor) {
      const page=by('ax-page-'+anchor.page);
      if(page){alignReaderTarget(page,-anchor.offset);return;}
    }
    sc.scrollTop=saved.positions[id]||0;
  }
  function sourcePages(source) { return !source.kind && source.label ? source.label : (source.sourcePages || [source.page]).join('–'); }
  function chapterLabel(chapter) { return chapter.type==='supplement' ? '補充資料' : 'Chapter '+chapter.no; }
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
    const previous=by('ax-body').querySelectorAll('mark.ax-highlight');
    previous.forEach(mark=>mark.replaceWith(...mark.childNodes));
    if(previous.length)by('ax-body').normalize();
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
    entry.ranges.push({id:crypto.randomUUID(),start,end});
    try { window.ScholarStorage.setItem(MARKS,JSON.stringify(highlights)); } catch (_) { /* Optional storage. */ }
    applyMarks(page,[{start,end}]); selection.removeAllRanges(); by('ax-status').textContent='已儲存標記。';
  }
  async function renderChapter(data,version) {
    pageObserver?.disconnect();visiblePages.clear();
    const container=by('ax-body');container.replaceChildren();
    // Older saved positions are pixels in the original fully laid-out document.
    const legacyPosition=!saved.anchors[current] && (saved.positions[current]||0)>0;
    container.classList.toggle('ax-eager-position',legacyPosition);
    const supplement=catalogue.chapters.find(chapter=>chapter.id===current)?.type==='supplement';
    const sections=supplement ? data.sections : data.sections.filter(section=>/^\d+\.\d+(?=\s|$)/.test(section.title));
    const choices = [{id:'',title:'本章小節'},...sections];
    const shortcuts=document.createDocumentFragment();
    for (const object of data.attachments.filter(item=>item.kind==='table')) {
      const button=document.createElement('button');button.type='button';button.className='ax-table-shortcut';button.dataset.tableOpen=object.id;
      button.textContent=object.label;button.title=tableCaption(object);button.setAttribute('aria-label',object.label+' '+tableCaption(object));button.setAttribute('aria-haspopup','dialog');shortcuts.append(button);
    }
    by('ax-table-shortcuts').replaceChildren(shortcuts);by('ax-table-shortcuts').hidden=!by('ax-table-shortcuts').childElementCount;
    by('ax-section').replaceChildren(...choices.map(section => {
      const option=document.createElement('option'); option.value=section.id; option.textContent=section.title; return option;
    }));
    let fragment=document.createDocumentFragment(),started=performance.now();
    for(let i=0;i<data.pages.length;i++) {
      if(version!==revision)return false;
      const source=data.pages[i],page=document.createElement('section');page.className='ax-page';page.id='ax-page-'+source.page;page.dataset.page=source.page;
      const label=document.createElement('div');label.className='ax-page-label';label.textContent='原書第 '+sourcePages(source)+' 頁';
      const body=document.createElement('div');body.className='ax-page-content';body.innerHTML=source.html;
      page.append(label,body);fragment.append(page);
      if(i===1 || performance.now()-started>12) {
        container.append(fragment);fragment=document.createDocumentFragment();
        await new Promise(resolve=>setTimeout(resolve,0));started=performance.now();
      }
    }
    if(version!==revision)return false;
    container.append(fragment);restoreMarks();renderedChapter=current;
    pageObserver=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.isIntersecting)visiblePages.set(entry.target,true);else visiblePages.delete(entry.target);}},{root:by('ax-scroll'),threshold:0});
    for(const page of container.children)pageObserver.observe(page);
    return true;
  }
  function scrollToId(id) {
    const target=document.getElementById(id);
    if (target && by('ax-body').contains(target)) alignReaderTarget(target,16);
  }
  async function selectChapter(id,options={}) {
    const chapter=catalogue.chapters.find(c=>c.id===id);
    if (!chapter) return;
    clearTimeout(scrollTimer);
    rememberReaderPosition();renderedChapter=undefined;objectRevision++;
    current=id; const version=++revision;
    document.querySelectorAll('.ax-chapter').forEach(button => {
      const selected=button.dataset.chapter===id;
      button.setAttribute('aria-selected',String(selected)); button.tabIndex=selected?0:-1;
    });
    by('ax-content').setAttribute('aria-labelledby','ax-tab-'+id);
    by('ax-kicker').textContent=chapterLabel(chapter); by('ax-title').textContent=chapter.title;
    by('ax-table-shortcuts').hidden=true;
    by('ax-location').textContent=chapter.type==='supplement' ? chapter.title : '第 '+chapter.no+' 章／共 '+catalogue.chapters.filter(c=>c.type!=='supplement').length+' 章';
    by('ax-tools').hidden=!chapter.ready; by('ax-status').textContent=''; by('ax-section').replaceChildren();
    by('ax-body').innerHTML='<div class="ax-pending sg-glass"><p>'+(chapter.ready?'載入中…':'正文準備中。')+'</p>'+(chapter.ready?'':'<p>本章正文與圖表尚未匯入。</p>')+'</div>';
    saved.chapter=id; persist();
    if (options.closeMenu!==false && mobile.matches) menu(false); else revealSelection();
    if (options.focusTab) by('ax-tab-'+id).focus();
    else if (options.focusHeading && mobile.matches) by('ax-title').focus({preventScroll:true});
    by('ax-scroll').scrollTop=0;
    if (!chapter.ready) return;
    try {
      const data=await content(id);
      if (version!==revision) return;
      if(!await renderChapter(data,version))return;
      requestAnimationFrame(() => {
        if (version!==revision) return;
        restoreReaderPosition(id,options);
        if(by('ax-body').classList.contains('ax-eager-position')) {
          rememberReaderPosition();by('ax-body').classList.remove('ax-eager-position');
          requestAnimationFrame(()=>{if(version===revision)restoreReaderPosition(id,options);});
        }
      });
    } catch (_) { if (version===revision) by('ax-body').textContent='無法載入本章，請稍後再試。'; }
  }
  let popupMotion=null, popupClosing=false;
  const reducePopupMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function presentPopup(before) {
    const dialog=by('ax-dialog'),opening=!dialog.open;
    window.ScholarPeek?.glass(dialog);
    popupClosing=false;dialog.classList.remove('ax-closing');
    if (popupMotion) { popupMotion.cancel();popupMotion=null; }
    if (opening) dialog.showModal();
    if (reducePopupMotion()) {dialog.classList.remove('ax-animating');return;}
    const after=dialog.getBoundingClientRect();
    const initial=before ? `translate(${before.left+before.width/2-after.left-after.width/2}px,${before.top+before.height/2-after.top-after.height/2}px) scale(${before.width/after.width},${before.height/after.height})` : 'none';
    const frames=opening ? [{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}] : before ? [{transform:initial},{transform:'none'}] : null;
    if (!frames) return;
    dialog.classList.add('ax-animating');
    const motion=dialog.animate(frames,{duration:180,easing:'cubic-bezier(.2,.65,.25,1)'});
    popupMotion=motion;
    motion.finished.then(()=>{if(popupMotion===motion)dialog.classList.remove('ax-animating');},()=>{});
  }
  async function dismissPopup() {
    const dialog=by('ax-dialog');
    if (!dialog.open || popupClosing) return;
    popupClosing=true;objectRevision++;
    const style=getComputedStyle(dialog),start={opacity:style.opacity,transform:style.transform};
    if (popupMotion) {popupMotion.cancel();popupMotion=null;}
    if (!reducePopupMotion()) {
      const glass=getComputedStyle(dialog,'::backdrop');
      dialog.style.setProperty('--ax-glass-opacity',glass.opacity);
      dialog.classList.add('ax-closing');
      const motion=dialog.animate([start,{opacity:0,transform:'translateY(2px)'}],{duration:120,easing:'cubic-bezier(.25,.1,.25,1)',fill:'forwards'});
      popupMotion=motion;
      try { await motion.finished; } catch (_) { return; }
    }
    dialog.close();dialog.classList.remove('ax-closing','ax-animating');
    if (popupMotion) {popupMotion.cancel();popupMotion=null;}
    popupClosing=false;
  }
  async function openObject(id,chapterId,options={}) {
    const request=++objectRevision;by('ax-status').textContent='載入圖表…';
    try {
    const chapter=chapterId||current,data=await content(chapter),meta=data.attachments.find(a=>a.id===id);
    if(!meta||request!==objectRevision)return;
    const object=await objectContent(meta,chapter);if(!object||request!==objectRevision)return;
    by('ax-status').textContent='';
    const before=by('ax-dialog').open?by('ax-dialog').getBoundingClientRect():null;
    if (options.peek || (object.kind==='table' && !options.keepPreview)) {
      by('ax-dialog').classList.add('ax-peek');by('ax-dialog').classList.remove('ax-popped');by('ax-peek-expand').hidden=false;
    } else if (!options.keepPreview) {
      by('ax-dialog').classList.remove('ax-peek','ax-popped');by('ax-peek-expand').hidden=true;
    }
    by('ax-dialog-title').textContent=object.label+' · 原書第 '+sourcePages(object)+' 頁';
    const body=by('ax-dialog-body'),reuse=body.dataset.chapter===chapter&&body.dataset.object===id&&body.childElementCount>0;
    if(!reuse)body.innerHTML=object.html;body.dataset.chapter=chapter;body.dataset.object=id;
    const tables=data.attachments.filter(item=>item.kind==='table'),index=tables.findIndex(item=>item.id===id);
    by('ax-table-nav').hidden=index<0;
    by('ax-table-prev').disabled=index<=0;by('ax-table-next').disabled=index<0||index===tables.length-1;
    by('ax-table-position').textContent=index<0?'':(index+1)+'／'+tables.length;
    if(!reuse) {
    const ids=new Map();
    body.querySelectorAll('[id]').forEach(node=>{const old=node.id;node.id='ax-popup-'+old;ids.set(old,node.id);});
    body.querySelectorAll('[clip-path]').forEach(node=>{
      node.setAttribute('clip-path',node.getAttribute('clip-path').replace(/url\(#([^)]+)\)/g,(_,old)=>'url(#'+(ids.get(old)||old)+')'));
    });
    }
    presentPopup(before);
    body.scrollTop=0;
    } catch(_){if(request===objectRevision)by('ax-status').textContent='無法載入圖表，請檢查連線後再試。';}
  }
  function tableCaption(object) {
    if(object.caption!==undefined)return object.caption;
    if (!tableCaptions.has(object.id)) {
      const holder=document.createElement('div');holder.innerHTML=object.html;
      const table=holder.querySelector('table');let title='';
      if (table) {
        const range=document.createRange();range.setStart(holder,0);range.setEndBefore(table);
        title=chapterText(range.cloneContents()).replace(/\s+/g,' ').trim();
        if (!title) {
          // Positioned headings can follow the grid in DOM order while sitting above it.
          const top=node=>{let y=0;for(let n=node;n&&n!==holder;n=n.parentElement)y+=parseFloat(n.style.top)||0;return y;};
          title=[...holder.querySelectorAll('.ax-source-run')].filter(run=>!run.closest('table')&&top(run)<top(table)-.5).sort((a,b)=>top(a)-top(b)).map(run=>run.textContent).join(' ').replace(/\s+/g,' ').trim();
        }
        const label=[...object.label.replace(/\s/g,'')].map(char=>char.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*');
        title=title.replace(new RegExp('^'+label+'\\s*','i'),'').trim();
      }
      tableCaptions.set(object.id,title.slice(0,180));
    }
    return tableCaptions.get(object.id);
  }
  async function openTableIndex(chapterId=current) {
    const request=++objectRevision;
    const data=await content(chapterId);if(request!==objectRevision)return;
    const tables=data.attachments.filter(object=>object.kind==='table');
    const before=by('ax-dialog').open?by('ax-dialog').getBoundingClientRect():null;
    const chapter=catalogue.chapters.find(item=>item.id===chapterId),body=by('ax-dialog-body');
    by('ax-dialog').classList.remove('ax-peek','ax-popped');by('ax-peek-expand').hidden=true;
    by('ax-dialog-title').textContent=chapterLabel(chapter)+' · 本章表格';by('ax-table-nav').hidden=true;
    body.replaceChildren();body.dataset.chapter=chapterId;delete body.dataset.object;
    const intro=document.createElement('p');intro.className='ax-table-intro';intro.textContent=chapter.title+' · '+tables.length+' 張表格';
    const label=document.createElement('label');label.className='ax-table-filter';label.textContent='搜尋表號或標題';
    const input=document.createElement('input');input.type='search';input.id='ax-table-query';input.placeholder='輸入表號或標題關鍵字';input.value=tableQueries.get(chapterId)||'';label.append(input);
    const list=document.createElement('div');list.className='ax-table-index';const empty=document.createElement('p');empty.textContent='找不到符合的表格。';empty.hidden=true;
    for (const object of tables) {
      const button=document.createElement('button');button.type='button';button.className='ax-table-item';button.dataset.table=object.id;
      const number=document.createElement('strong');number.textContent=object.label;
      const title=document.createElement('span');title.textContent=tableCaption(object);
      const source=document.createElement('small');source.textContent='原書第 '+sourcePages(object)+' 頁';button.append(number,title,source);
      button.addEventListener('click',()=>openObject(object.id,chapterId,{peek:true}));list.append(button);
    }
    const filter=()=>{const query=input.value.trim().toLocaleLowerCase();tableQueries.set(chapterId,input.value);let count=0;for(const button of list.children){button.hidden=!button.textContent.toLocaleLowerCase().includes(query);if(!button.hidden)count++;}empty.hidden=count>0;};
    input.addEventListener('input',filter);filter();body.append(intro,label,list,empty);
    presentPopup(before);body.scrollTop=0;input.focus({preventScroll:true});
  }
  async function moveTable(direction) {
    const body=by('ax-dialog-body'),data=await content(body.dataset.chapter),tables=data.attachments.filter(object=>object.kind==='table');
    const index=tables.findIndex(object=>object.id===body.dataset.object),next=tables[index+direction];
    if (index>=0 && next) openObject(next.id,body.dataset.chapter,{keepPreview:true});
  }
  async function search() {
    const query=by('ax-query').value.trim(),version=++searchRevision,results=by('ax-results');
    results.replaceChildren(); results.hidden=!query;
    if (!query) return;
    const needle=query.toLocaleLowerCase();let count=0;
    results.textContent='搜尋中…';const fragment=document.createDocumentFragment();
    let indexed=null;
    if('DecompressionStream' in window) {
      try{if(!searchIndex)searchIndex=fastManifest().then(index=>packedJSON(index.search)).catch(e=>{searchIndex=null;throw e;});indexed=await searchIndex;}catch(_){ /* Search original source if the compact index is unavailable. */ }
    }
    for (const chapter of catalogue.chapters.filter(c=>c.ready)) {
      const data=indexed?.find(c=>c.id===chapter.id)||await content(chapter.id);
      if (version!==searchRevision) return;
      for (const page of data.pages) {
        let text=page.text;
        if(text===undefined){const holder=document.createElement('div');holder.innerHTML=page.html;text=chapterText(holder).replace(/\s+/g,' ');}
        const index=text.toLocaleLowerCase().indexOf(needle);
        if (index<0) continue;
        const button=document.createElement('button');button.type='button';button.className='ax-result';
        const label=document.createElement('strong');label.textContent=chapterLabel(chapter)+' · 第 '+sourcePages(page)+' 頁';
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
  function readingFont(value=saved.readingFont||'default') {
    if (!Object.hasOwn(readingFonts,value)) value='default';
    saved.readingFont=value;by('ama-panel').dataset.readingFont=value;
    by('ama-panel').style.setProperty('--ax-reading-font',readingFonts[value]||readingFonts.georgia);
    by('ax-font').value=value;persist();
  }

  function copyText(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    if (node.tagName === 'BR') return '\n';
    if (node.tagName === 'TABLE') {
      const rows=[], occupied=[];
      for (const [r,row] of Array.from(node.rows).entries()) {
        const cells=[];let col=0;
        for (const cell of row.cells) {
          while (occupied[col]>r) cells[col++]='';
          cells[col]=copyChildren(cell).replace(/\s+/g,' ').trim();
          for (let c=0;c<cell.colSpan;c++) {occupied[col+c]=r+cell.rowSpan;if(c)cells[col+c]='';}
          col+=cell.colSpan;
        }
        while (col<occupied.length) cells[col++]='';
        rows.push(cells.join('\t'));
      }
      return rows.join('\n')+'\n\n';
    }
    return copyChildren(node) + (/^(P|DIV|SECTION|ARTICLE|ASIDE|H[1-6])$/.test(node.tagName) ? '\n' : '');
  }
  function copyChildren(node) { return Array.from(node.childNodes, copyText).join(''); }
  function prepareCopy(root) {
    root.querySelectorAll('button,.ax-page-label').forEach(n=>n.remove());
    root.querySelectorAll('svg').forEach(svg=>{
      const labels=document.createElement('div');
      for (const text of svg.querySelectorAll('text')) {const line=document.createElement('p');line.textContent=text.textContent;labels.append(line);}
      svg.replaceWith(labels);
    });
    // Source glyphs stay positioned on screen; clipboard words use their text order.
    root.querySelectorAll('.ax-source-run').forEach(run=>{
      let text=document.createTextNode(run.textContent);
      if (run.style.fontStyle==='italic') {const wrapper=document.createElement('em');wrapper.append(text);text=wrapper;}
      if (run.style.fontWeight==='700') {const wrapper=document.createElement('strong');wrapper.append(text);text=wrapper;}
      run.replaceWith(text);
    });
    root.querySelectorAll('a[data-open]').forEach(link=>link.replaceWith(...link.childNodes));
    root.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
    root.querySelectorAll('[class]').forEach(n=>n.removeAttribute('class'));
    root.querySelectorAll('[style]').forEach(n=>n.removeAttribute('style'));
    root.querySelectorAll('table').forEach(table=>{table.style.borderCollapse='collapse';});
    root.querySelectorAll('th,td').forEach(cell=>{cell.style.border='1px solid #888';cell.style.padding='4px 8px';});
    return root;
  }
  function copySelection(event) {
    const selection=getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !event.clipboardData) return;
    const range=selection.getRangeAt(0), panel=by('ama-panel');
    if (!panel.contains(range.startContainer) || !panel.contains(range.endContainer)) return;
    const inReader=node=>(node.nodeType===Node.ELEMENT_NODE?node:node.parentElement).closest('#ax-content,#ax-dialog-body');
    if (!inReader(range.startContainer) || !inReader(range.endContainer)) return;
    const root=document.createElement('div');let fragment=range.cloneContents();
    let ancestor=range.commonAncestorContainer;
    if (ancestor.nodeType!==Node.ELEMENT_NODE) ancestor=ancestor.parentElement;
    const table=ancestor.closest('table');
    if (table) {
      // A Range inside a table omits its enclosing table/row/cell elements.
      for (;;) {const wrapper=ancestor.cloneNode(false);wrapper.append(fragment);fragment=wrapper;if(ancestor===table)break;ancestor=ancestor.parentElement;}
    }
    root.append(fragment);
    prepareCopy(root);
    event.clipboardData.setData('text/plain',copyChildren(root).replace(/\n{3,}/g,'\n\n').trim());
    event.clipboardData.setData('text/html',root.innerHTML);
    event.preventDefault();
  }
  async function copyAMA(all) {
    const button=by(all?'ax-copy-all':'ax-copy-chapter'); button.disabled=true;
    try {
      const chosen=catalogue.chapters.filter(c=>c.ready && (all || c.id===current));
      const root=document.createElement('article');
      for (const chapter of chosen) {
        const data=await content(chapter.id), heading=document.createElement('h1');
        heading.textContent=chapterLabel(chapter)+' '+chapter.title; root.append(heading);
        for (const page of data.pages) {
          const section=document.createElement('section'), label=document.createElement('p');
          label.textContent='原書第 '+sourcePages(page)+' 頁'; section.append(label);
          const body=document.createElement('div'); body.innerHTML=page.html;
          prepareCopy(body);
          section.append(body);root.append(section);
        }
      }
      const plain=copyText(root).replace(/\n{3,}/g,'\n\n').trim();
      try {
        if (navigator.clipboard?.write && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([plain],{type:'text/plain'}),'text/html':new Blob([root.outerHTML],{type:'text/html'})})]);
        else await navigator.clipboard.writeText(plain);
      } catch (_) {
        const active=document.activeElement, selection=getSelection(), ranges=Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange());
        const area=document.createElement('textarea');area.value=plain;area.style.cssText='position:fixed;left:-10000px;top:0';document.body.append(area);area.select();
        let ok;try {ok=document.execCommand('copy');} finally {area.remove();active?.focus({preventScroll:true});selection.removeAllRanges();ranges.forEach(range=>selection.addRange(range));}
        if(!ok)throw Error('Copy unavailable');
      }
      by('ax-status').textContent=all?'已複製全部已匯入章節（含表格與圖中文字）。':'已複製本章全文（含表格與圖中文字）。';
    } catch (_) {by('ax-status').textContent='複製未成功，仍可直接選取文字後複製。';}
    finally {button.disabled=false;}
  }

  async function boot() {
    const response=await fetch('ama/index.json',{cache:'no-cache'});
    if (!response.ok) throw new Error('AMA catalogue unavailable');
    catalogue=await response.json();
    const panel=by('ama-panel');
    panel.innerHTML='<div id="ax-layout" class="ax-layout">'+
      '<aside id="ax-side" class="ax-side sg-glass" aria-label="AMA 章節選單"><div class="ax-side-head"><button id="ax-sidebar-toggle" class="ax-sidebar-toggle" type="button" aria-label="收合側欄" title="收合側欄" aria-controls="ax-sidebar-content" aria-expanded="true"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M5.5 8h1M5.5 11.5h1M5.5 15h1"/></svg></button><div class="ax-side-heading"><p>AMA Guides · Sixth Edition</p><h2>章節<span id="ax-count"></span></h2></div></div><div id="ax-sidebar-content" class="ax-side-content">'+
      '<form id="ax-search" class="ax-search"><label class="ax-sr" for="ax-query">搜尋已匯入章節</label><input id="ax-query" type="search" placeholder="搜尋已匯入章節" autocomplete="off"><button type="submit" class="sg-btn">搜尋</button></form>'+
      '<div id="ax-results" class="ax-results" aria-live="polite" hidden></div><div id="ax-list" class="ax-list" role="tablist" aria-label="AMA 章節" aria-orientation="vertical"></div></div></aside>'+
      '<div class="ax-reader"><div class="ax-bar"><button id="ax-menu" class="ax-sidebar-toggle" type="button" aria-controls="ax-sidebar-content" aria-expanded="false" aria-label="展開側欄" title="展開側欄"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M5.5 8h1M5.5 11.5h1M5.5 15h1"/></svg></button><span id="ax-location" class="ax-location"></span></div>'+
      '<div id="ax-tools" class="ax-tools" hidden><label class="ax-sr" for="ax-section">本章小節</label><select id="ax-section"></select><div class="ax-reading-controls"><label class="ax-font-control" for="ax-font">正文字型<select id="ax-font"><option value="default">預設</option><option value="georgia">Georgia</option><option value="times">Times New Roman</option><option value="arial">Arial</option><option value="system">系統字型</option></select></label><button id="ax-smaller" type="button" aria-label="縮小文字">A−</button><button id="ax-larger" type="button" aria-label="放大文字">A＋</button><button id="ax-mark" type="button">標記選取</button><button id="ax-copy-chapter" type="button">複製本章</button><button id="ax-copy-all" type="button">複製已匯入全文</button><button id="ax-clear-marks" type="button">清除本章標記</button></div></div><div id="ax-status" class="ax-status" role="status"></div>'+
      '<div id="ax-scroll" class="ax-scroll"><article id="ax-content" role="tabpanel" tabindex="0"><div class="ax-head sg-glass"><p id="ax-kicker" class="ax-kicker"></p><h1 id="ax-title" class="ax-title" tabindex="-1"></h1><nav id="ax-table-shortcuts" class="ax-table-shortcuts" aria-label="本章表格快覽" hidden></nav></div><div id="ax-body"></div></article></div></div></div>'+
      '<dialog id="ax-dialog" class="ax-dialog" aria-labelledby="ax-dialog-title"><div class="ax-dialog-bar"><h2 id="ax-dialog-title"></h2><button id="ax-peek-expand" type="button" hidden>展開</button><button id="ax-dialog-close" type="button" aria-label="關閉圖表">關閉</button></div><div id="ax-table-nav" class="ax-table-nav" hidden><button id="ax-table-prev" type="button">上一張</button><button id="ax-table-index" type="button">表格目錄</button><button id="ax-table-next" type="button">下一張</button><span id="ax-table-position" aria-live="polite"></span></div><div id="ax-dialog-body" class="ax-dialog-body"></div></dialog>';
    const supplements=catalogue.chapters.filter(c=>c.type==='supplement').length;
    by('ax-count').textContent=(catalogue.chapters.length-supplements)+' 章'+(supplements?'＋'+supplements+' 附錄':'');
    for (const chapter of catalogue.chapters) {
      const button=document.createElement('button');
      button.type='button';button.id='ax-tab-'+chapter.id;button.className='ax-chapter';button.dataset.chapter=chapter.id;
      button.setAttribute('role','tab');button.setAttribute('aria-controls','ax-content');
      for (const [cls,value] of [['ax-number',chapter.no],['ax-name',chapter.title]]) {
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
    by('ax-menu').addEventListener('click',event=>{menu(!menuOpen);if(menuOpen && event.detail===0)by('ax-query').focus({preventScroll:true});});
    by('ax-sidebar-toggle').addEventListener('click',()=>{menu(false);by('ax-menu').focus({preventScroll:true});});
    document.addEventListener('pointerdown',event=>{
      if(mobile.matches && menuOpen && !by('ax-side').contains(event.target) && !by('ax-menu').contains(event.target))menu(false);
    });
    by('ax-section').addEventListener('change',()=>scrollToId(by('ax-section').value));
    let tableIntentTimer;
    const warmTable=async ref=>{
      const chapter=ref.dataset.chapter||current,id=ref.dataset.tableOpen||ref.dataset.open;
      if(!chapter||!id)return;
      try{const data=await content(chapter),meta=data.attachments.find(a=>a.id===id);if(meta?.file&&!objects.has(id))await objectContent(meta,chapter);}catch(_){ /* Clicking retains the normal retry/error path. */ }
    };
    by('ama-panel').addEventListener('pointerover',event=>{
      if(event.pointerType==='touch')return;
      const ref=event.target.closest('[data-table-open],[data-open]');
      clearTimeout(tableIntentTimer);if(ref)tableIntentTimer=setTimeout(()=>warmTable(ref),90);
    },{passive:true});
    by('ama-panel').addEventListener('pointerout',event=>{
      const ref=event.target.closest('[data-table-open],[data-open]');
      if(ref&&!ref.contains(event.relatedTarget))clearTimeout(tableIntentTimer);
    },{passive:true});
    for(const event of ['focusin','pointerdown'])by('ama-panel').addEventListener(event,e=>{
      const ref=e.target.closest('[data-table-open],[data-open]');if(ref)warmTable(ref);
    },{passive:true});
    by('ax-table-shortcuts').addEventListener('click',event=>{const button=event.target.closest('[data-table-open]');if(button)openObject(button.dataset.tableOpen,current,{peek:true});});
    by('ax-peek-expand').addEventListener('click',()=>{const before=by('ax-dialog').getBoundingClientRect();by('ax-dialog').classList.add('ax-popped');by('ax-peek-expand').hidden=true;presentPopup(before);by('ax-dialog-close').focus({preventScroll:true});});
    by('ax-table-prev').addEventListener('click',()=>moveTable(-1));by('ax-table-next').addEventListener('click',()=>moveTable(1));
    by('ax-table-index').addEventListener('click',()=>openTableIndex(by('ax-dialog-body').dataset.chapter));
    by('ax-body').addEventListener('click',event=>{
      const ref=event.target.closest('[data-open]');if(ref){event.preventDefault();openObject(ref.dataset.open,ref.dataset.chapter);}
    });
    by('ax-dialog-body').addEventListener('click',event=>{
      const ref=event.target.closest('[data-open]');if(ref){event.preventDefault();openObject(ref.dataset.open,ref.dataset.chapter||by('ax-dialog-body').dataset.chapter);}
    });
    by('ax-dialog-close').addEventListener('click',dismissPopup);
    by('ax-dialog').addEventListener('cancel',event=>{event.preventDefault();dismissPopup();});
    by('ax-dialog').addEventListener('click',event=>{if(event.target!==by('ax-dialog'))return;const r=by('ax-dialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dismissPopup();});
    by('ax-search').addEventListener('submit',event=>{event.preventDefault();search();});
    by('ax-query').addEventListener('input',()=>{if(!by('ax-query').value){searchRevision++;by('ax-results').hidden=true;}});
    by('ax-smaller').addEventListener('click',()=>fontSize(-1));by('ax-larger').addEventListener('click',()=>fontSize(1));
    by('ax-font').addEventListener('change',()=>readingFont(by('ax-font').value));
    by('ax-mark').addEventListener('mousedown',event=>event.preventDefault());by('ax-mark').addEventListener('click',markSelection);
    by('ax-copy-chapter').addEventListener('click',()=>copyAMA(false));
    by('ax-copy-all').addEventListener('click',()=>copyAMA(true));
    by('ama-panel').addEventListener('copy',copySelection);
    by('ax-clear-marks').addEventListener('click',()=>{
      delete highlights[current];try{window.ScholarStorage.setItem(MARKS,JSON.stringify(highlights));}catch(_){/* Optional storage. */}
      by('ax-body').querySelectorAll('mark.ax-highlight').forEach(mark=>mark.replaceWith(...mark.childNodes));by('ax-status').textContent='已清除本章標記。';
    });
    by('ax-scroll').addEventListener('scroll',()=>{
      clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{rememberReaderPosition();persist();},200);
    },{passive:true});
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuOpen){menu(false);by('ax-menu').focus();}});
    readingFont();fontSize();await selectChapter(catalogue.chapters.some(c=>c.id===saved.chapter)?saved.chapter:catalogue.chapters[0].id);
    menu(!mobile.matches);measure();
  }
  function show() {
    measure();
    if(!loading)loading=boot().catch(()=>{by('ama-panel').textContent='無法載入 AMA 章節目錄，請稍後再試。';loading=null;});
    else if(catalogue)updateSidebar();
    return loading;
  }
  mobile.addEventListener('change',()=>{if(catalogue)menu(!mobile.matches);});
  window.addEventListener('resize',measure);window.addEventListener('pagehide',persist);
  let cloudFont=JSON.stringify([saved.fontSize,saved.readingFont]);
  window.ScholarSync.subscribe(key=>{
    if(key===STORE){saved=JSON.parse(window.ScholarStorage.getItem(STORE)||'{}');saved.positions||={};saved.anchors||={};const next=JSON.stringify([saved.fontSize,saved.readingFont]);if(catalogue&&next!==cloudFont){cloudFont=next;fontSize();readingFont();}}
    if(key===MARKS){highlights=JSON.parse(window.ScholarStorage.getItem(MARKS)||'{}');if(current)restoreMarks();}
  });
  window.ScholarAMA={show};
})();
