/* AMA reader. Content, storage and controls are independent of 指引. */
(() => {
  'use strict';
  const STORE = 'scholar-ama-v1', MARKS = 'scholar-ama-marks-v1';
  const NEURO_CHART_TEMPLATE = [
    '13-4 Consciousness and Awareness:',
    '13-5 Episodic Loss of Consciousness and Awareness:',
    '13-6 Sleep and Arousal Disorders:',
    '13-8 Alteration in MSCHIF:',
    '13-9 Aphasia or Dysphasia',
    '13-11 Upper Extremity:',
    '13-12 Station and Gait:',
    '13-13 Neurogenic Bowel:',
    '13-14 Neurogenic Bladder:',
    '13-15 Neurogenic Sexual Dysfunction:',
    '13-16 Neurogenic Respiratory Dysfunction:',
    '13-17 Dysesthetic Pain:',
    '13-18 Migraine Headache:',
    '13-19 Trigeminal or Glossopharyngeal Neuralgia:',
    '13-20 Miscellaneous Peripheral Nerves:'
  ].join('\n');
  let neuroCopyBusy=false;
  const mobile = matchMedia('(max-width:1099px), (orientation:portrait)'), by = id => document.getElementById(id), chapters = new Map();
  const tableCaptions=new Map(), tableQueries=new Map(), objects=new Map();
  const chapterSearchText=new Map();let chapterSearchRevision=0,pageJumpRevision=0;
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
  // The book sets headings in letter-spaced capitals; the source keeps a space glyph between every letter.
  const CHAPTER_MARK=/^C H A P T E R(?: \d)+$/;
  function spacedRunText(run) {
    const glyphs=[...run.children];
    if(glyphs.length<7||glyphs.some(glyph=>glyph.children.length))return null;
    const chars=glyphs.map(glyph=>glyph.textContent),left=glyphs.map(glyph=>parseFloat(glyph.style.left));
    if(left.some(Number.isNaN))return null;
    const gaps=[];for(let i=0;i<chars.length-1;i++)if(chars[i]===' ')gaps.push(left[i+1]-left[i]);
    const solid=chars.filter(char=>char!==' ').length;
    if(gaps.length<3||gaps.length<solid*.6)return null;
    // Word breaks are the gaps clearly wider than the usual letter spacing.
    const sorted=[...gaps].sort((a,b)=>a-b),usual=sorted[sorted.length>>1];
    return chars.map((char,i)=>char!==' '?char:(i<chars.length-1&&left[i+1]-left[i]>usual*1.6?' ':'')).join('').trim();
  }
  function readableCopy(copy) {
    copy.querySelectorAll('.ax-form-view-tools,.ax-form-source[hidden],.ax-form-reader[hidden]').forEach(n=>n.remove());
    normalizeFlowTables(copy);
    printedSourceHeadings(copy);
    // Hyphens left by the book's line breaks stay in the data (saved highlights count them) but never in copied text.
    copy.querySelectorAll('.ax-soft-break').forEach(n=>n.remove());
    copy.querySelectorAll('.ax-flow-heading').forEach(n=>{n.textContent=n.dataset.readableTitle+(n.classList.contains('ax-plain-caption')&&n.nextSibling&&!/^\s/.test(n.nextSibling.textContent)?' ':'');});
    copy.querySelectorAll('.ax-source-run').forEach(run=>{const text=spacedRunText(run);if(text!==null)run.textContent=text;});
    copy.querySelectorAll('svg text').forEach(n=>{const title=continuedHeading(n.textContent);if(title)n.textContent=title;});
    copy.querySelectorAll('h3 strong').forEach(mark=>{if(CHAPTER_MARK.test(mark.textContent))mark.textContent='CHAPTER '+mark.textContent.slice(14).replace(/ /g,'');});
    return copy;
  }
  function sourceHeadingText(run) {
    if([...run.children].some(glyph=>[...glyph.textContent].length!==1))return null;
    const text=spacedRunText(run);
    const continued=continuedHeading(text||'');if(continued)return continued;
    if(text===null || !/^(?:TABLE|FIGURE)\s+\d/i.test(text))return null;
    return text.replace(/^(?:TABLE|FIGURE)\b/i,label=>label[0].toUpperCase()+label.slice(1).toLowerCase())
      .replace(/\bCONTINUED\b/g,'continued').replace(/\bSENSORY AND MOTOR SEVERITY\b/,'Sensory and Motor Severity');
  }
  function continuedHeading(text) {
    const compact=text.replace(/\s/g,'');
    return compact==='CONTINUED'?'continued':compact==='(CONTINUED)'?'(continued)':null;
  }
  function printedSourceHeadings(root,objectLabel) {
    root.querySelectorAll('p,h3,strong,b').forEach(paragraph=>{
      if(!['p','h3','strong','b'].includes(paragraph.localName)||paragraph.closest('table')||paragraph.querySelector('.ax-source-run,.ax-flow-heading'))return;
      const object=paragraph.closest('.ax-object'),id=object?.id?.match(/^([tf])(\d+-[\dA-Z]+)(?:-|$)/i);
      let label=id?(id[1].toLowerCase()==='t'?'Table ':'Figure ')+id[2].replace(/-[a-z]$/i,s=>s.toUpperCase()):objectLabel;
      if(!label)return;
      const continued=continuedHeading(paragraph.textContent);if(continued)label=continued;
      const pattern=[...label.replace(/\s/g,'')].map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*');
      const match=continued?[paragraph.textContent]:paragraph.textContent.match(new RegExp('^\\s*'+pattern+'(?!\\s*\\d)','i'));if(!match)return;
      const walker=document.createTreeWalker(paragraph,NodeFilter.SHOW_TEXT),nodes=[];let n;while(n=walker.nextNode())nodes.push(n);
      const bold=nodes[0]?.parentElement.closest('strong,b'),range=document.createRange();range.setStart(paragraph,0);let remaining=match[0].length;
      for(const node of nodes){if(remaining<=node.length){range.setEnd(node,remaining);break;}remaining-=node.length;}
      const span=document.createElement('span');span.className='ax-flow-heading ax-plain-caption';span.dataset.readableTitle=label;span.textContent=match[0];
      if(bold)span.style.setProperty('font-weight','700','important');range.deleteContents();range.insertNode(span);
    });
  }
  function normalizeFlowTables(root) {
    const numeric=text=>/^(?:[<>≤≥±−+]?\s*\d+(?:[.,]\d+)?%?(?:\s*[–—−-]\s*\d+(?:[.,]\d+)?%?)?|[A-E])$/.test(text.trim());
    root.querySelectorAll('table.ax-table').forEach(table=>{
      if(table.closest('.ax-source-table,.ax-positioned,.ax-ca-sheet')||table.dataset.flowAligned)return;
      const columns=[],cells=[],occupied=[];
      // Resolve the real column through row/column spans, rather than guessing
      // alignment separately from each short word's original PDF coordinates.
      [...table.rows].forEach((row,index)=>{
        let col=0;
        for(const cell of row.cells){
          while((occupied[col]||0)>index)col++;
          const width=cell.colSpan||1;
          for(let n=col;n<col+width;n++)occupied[n]=index+(cell.rowSpan||1);
          cells.push({cell,col,width,header:index===0||cell.localName==='th'});
          const text=cell.textContent.trim();
          if(width===1&&index>0&&cell.localName!=='th'&&text){const stats=columns[col]||={numbers:0,total:0};stats.total++;if(numeric(text))stats.numbers++;}
          col+=width;
        }
      });
      const numericColumn=col=>columns[col]?.numbers>=2&&columns[col].numbers/columns[col].total>=.7;
      for(const {cell,col,width,header}of cells){
        const center=(width===1||header)&&Array.from({length:width},(_,n)=>col+n).every(numericColumn);
        cell.dataset.flowAlign=center?'center':'left';
        if(table.classList.contains('ax-hearing-table')&&/^ANSI\s+\d/.test(cell.textContent.trim()))cell.dataset.flowWrap='true';
      }
      // Source PDF page 490 splits "average" across two printed lines.
      // Preserve the source character for saved highlights, hide/copy it as a
      // line-break hyphen only in this verified range-of-motion summary table.
      const header=table.rows[0]?.textContent.replace(/\s/g,'');
      if(header==='GradeModifierSeverityRangeofMotion'){
        const walker=document.createTreeWalker(table,NodeFilter.SHOW_TEXT),nodes=[];let node;
        while(node=walker.nextNode())if(node.textContent.includes('aver-age:'))nodes.push(node);
        for(const node of nodes){const [before,after]=node.textContent.split('aver-age:');const hyphen=document.createElement('span');hyphen.className='ax-soft-break';hyphen.textContent='-';node.replaceWith(document.createTextNode(before+'aver'),hyphen,document.createTextNode('age:'+after));}
      }
      table.dataset.flowAligned='true';
    });
  }
  function sourceGlyphGroups(glyphs,size) {
    const groups=[];let previous;
    const tokens=glyphs.map(g=>g.text).join('').trim().split(/\s+/);
    const choices=tokens.length>=2&&tokens.every(t=>/^[A-Z]$/.test(t));
    const values=choices||tokens.length>=3&&tokens.every(t=>/^[\d/.,%°±+−<>≤≥-]+$/.test(t)||/^[A-E]$/.test(t)||/^[IVX]+$/.test(t));
    for(const glyph of glyphs){
      // A large jump denotes a separate diagram label or numeric column.
      // Preserve those anchors; normal words use the browser's own kerning.
      if(!previous||glyph.x-previous.x>size*1.35||glyph.x<previous.x-.1||(values&&/\s$/.test(previous.text)&&!/^\s/.test(glyph.text)))groups.push([]);
      groups.at(-1).push(glyph);previous=glyph;
    }
    return groups;
  }
  let sourceTextMeasure;
  function scopeObjectIds(root) {
    const ids=new Map();
    root.querySelectorAll('[id]').forEach(node=>{const old=node.id;node.id='ax-popup-'+old;ids.set(old,node.id);});
    // A stencil image, clip, gradient and marker must all follow their renamed
    // definition. Updating clip-path alone leaves masks pointing at the page
    // behind the popup, or at nothing when that page has been virtualized.
    root.querySelectorAll('*').forEach(node=>{
      for(const attr of [...node.attributes]){
        if(attr.localName==='id')continue;
        let value=attr.value.replace(/url\(\s*(['"]?)#([^\s)'" ]+)\1\s*\)/g,(match,quote,id)=>ids.has(id)?'url(#'+ids.get(id)+')':match);
        if(attr.localName==='href'&&value.startsWith('#')&&ids.has(value.slice(1)))value='#'+ids.get(value.slice(1));
        if(value!==attr.value)node.setAttributeNS(attr.namespaceURI,attr.name,value);
      }
    });
  }
  function naturalSourceLabels(root) {
    root.querySelectorAll('.ax-source-run').forEach(run=>{
      if(!run.style?.fontSize||run.closest('.ax-ca-sheet')||run.classList.contains('ax-readable-heading')||run.classList.contains('ax-natural-run'))return;
      const glyphs=[...run.children];
      if(!glyphs.length||glyphs.some(g=>g.children.length||!Number.isFinite(parseFloat(g.style.left))))return;
      const groups=sourceGlyphGroups(glyphs.map(g=>({x:parseFloat(g.style.left),text:g.textContent})),parseFloat(run.style.fontSize));
      const fragment=document.createDocumentFragment();
      for(const group of groups){
        const label=document.createElement('span');label.className='ax-natural-label';label.style.left=group[0].x+'px';label.textContent=group.map(g=>g.text).join('');
        if(group.length>2&&group.every(g=>g.x===group[0].x))label.classList.add('ax-vertical-label');
        // HTML labels also need room for a substitute font (not only SVG).
        // Use the source advances plus the final glyph, retaining the anchor.
        const size=parseFloat(run.style.fontSize);sourceTextMeasure ||= document.createElement('canvas').getContext('2d');
        sourceTextMeasure.font=`${run.style.fontStyle||'normal'} ${run.style.fontWeight||'normal'} ${size}px Arial,sans-serif`;
        const width=sourceTextMeasure.measureText(label.textContent).width,last=group.at(-1);
        const space=last.x-group[0].x+sourceTextMeasure.measureText(last.text).width,fit=last.x>group[0].x&&space>0&&width>0?Math.min(1,space/(width*1.02)):1;
        if(fit<1){label.style.setProperty('font-size',size*fit+'px','important');label.dataset.labelFit=fit.toFixed(4);}
        fragment.append(label);
      }
      run.replaceChildren(fragment);run.classList.add('ax-natural-run');
    });
    const svgLabels=[];
    root.querySelectorAll('svg text').forEach(text=>{
      if(text.localName!=='text'||text.closest('.ax-ca-sheet')||text.classList.contains('ax-natural-svg'))return;
      text.dataset.sourceText=text.textContent;
      const continued=continuedHeading(text.textContent);
      const glyphs=[...text.children],size=parseFloat(text.getAttribute('font-size'));
      if(glyphs.length&&Number.isFinite(size)&&glyphs.every(g=>g.localName==='tspan'&&[...g.textContent].length===1&&/^[-\d.]+$/.test(g.getAttribute('x')||''))){
        const original=glyphs.map(g=>({x:+g.getAttribute('x'),width:+g.getAttribute('textLength')||0,text:g.textContent,y:g.getAttribute('y')}));
        const groups=continued?[original]:sourceGlyphGroups(original,size);
        const fragment=document.createDocumentFragment();
        for(const group of groups){
          const label=document.createElementNS('http://www.w3.org/2000/svg','tspan');label.setAttribute('x',group[0].x);if(group[0].y!==null)label.setAttribute('y',group[0].y);label.textContent=continued||group.map(g=>g.text).join('');fragment.append(label);
          const piece={el:label,text:label.textContent,size,family:(text.getAttribute('font-family')||'').startsWith('Georgia')?'Georgia,serif':'Arial,sans-serif',weight:text.getAttribute('font-weight')||'normal',style:text.getAttribute('font-style')||'normal'};
          svgLabels.push({el:label,owner:text,x:group[0].x,y:parseFloat(group[0].y??text.getAttribute('y'))||0,end:group.at(-1).x+group.at(-1).width,raw:label.textContent,size,pieces:[piece]});
        }
        text.replaceChildren(fragment);
      }else if(glyphs.length)return;
      else if(continued)text.textContent=continued;
      text.removeAttribute('textLength');text.removeAttribute('lengthAdjust');text.classList.add('ax-natural-svg');
    });
    // Font changes inside a word or sentence are not independent coordinates.
    // Let their continuation flow naturally, while spaced numeric columns stay
    // anchored to their source positions (including visual-acuity score rows).
    let previous;
    for(const label of svgLabels){
      const size=Math.max(previous?.size||0,label.size),gap=label.x-(previous?.end||0);
      const numeric=s=>/^[\d/.,%°±+−<>≤≥-]+$/.test(s.trim());
      const spacedValues=previous&&(/\s$/.test(previous.raw)||/^\s/.test(label.raw))&&(numeric(previous.raw)||numeric(label.raw));
      if(previous&&previous.owner!==label.owner&&previous.owner.parentNode===label.owner.parentNode&&Math.abs(label.y-previous.y)<size*.18&&gap>=-size*.2&&gap<=size*.35&&!spacedValues){
        label.el.removeAttribute('x');label.el.removeAttribute('y');
        if(label.y!==previous.y)label.el.setAttribute('dy',label.y-previous.y);
        for(const [css,attr,fallback]of [['font-family','font-family','Arial,sans-serif'],['font-weight','font-weight','normal'],['font-style','font-style','normal'],['font-size','font-size',label.size]])label.el.style.setProperty(css,(label.owner.getAttribute(attr)||fallback)+(css==='font-size'?'px':''),'important');
        previous.el.append(label.el);previous.raw+=label.raw;previous.end=label.end;previous.y=label.y;previous.size=label.size;previous.pieces.push(...label.pieces);label.joined=true;
      }else previous=label;
    }
    // Substitute fonts can be wider than the PDF font. Fit the complete label
    // isotropically to its original allotted width, never stretch individual
    // letters or move the label's clinical/diagram anchor.
    for(const label of svgLabels){
      if(label.joined)continue;
      sourceTextMeasure ||= document.createElement('canvas').getContext('2d');
      const width=label.pieces.reduce((total,piece)=>{sourceTextMeasure.font=`${piece.style} ${piece.weight} ${piece.size}px ${piece.family}`;return total+sourceTextMeasure.measureText(piece.text).width;},0);
      const space=label.end-label.x,fit=space>0&&width>0?Math.min(1,space/(width*1.02)):1;
      if(fit<1){for(const piece of label.pieces)piece.el.style.setProperty('font-size',piece.size*fit+'px','important');label.el.dataset.labelFit=fit.toFixed(4);}
    }
  }
  function showSourceHeadings(root,objectLabel) {
    normalizeFlowTables(root);
    printedSourceHeadings(root,objectLabel);
    root.querySelectorAll('.ax-flow-heading').forEach(run=>{
      if(!run.dataset?.readableTitle)return;
      const title=run.dataset.readableTitle,letters=[...title.replace(/\s/g,'')],boundaries=new Set();let count=0;
      for(const word of title.split(' ').slice(0,-1)){count+=word.length;boundaries.add(count);}
      const raw=run.dataset.sourceText||run.textContent;run.dataset.sourceText=raw;run.replaceChildren();let at=0,lastBoundary=-1;
      for(const char of raw){
        if(/\s/.test(char)){
          const gap=document.createElement('span'),visible=boundaries.has(at)&&lastBoundary!==at;
          gap.textContent=char;if(!visible)gap.className='ax-letter-gap';else lastBoundary=at;run.append(gap);
        }else if(boundaries.has(at)&&lastBoundary!==at){const word=document.createElement('span');word.style.marginLeft='.25em';word.textContent=letters[at++]||char;lastBoundary=at-1;run.append(word);}
        else run.append(letters[at++]||char);
      }
    });
    root.querySelectorAll('.ax-source-run').forEach(run=>{
      if(run.closest('table'))return;
      const title=sourceHeadingText(run);if(title===null)return;
      if(run.dataset&&!run.dataset.sourceText)run.dataset.sourceText=run.textContent;
      const letters=[...title.replace(/\s/g,'')],boundaries=new Set();let count=0;
      for(const word of title.split(' ').slice(0,-1)){count+=word.length;boundaries.add(count);}
      // Keep the original text length so saved highlight offsets remain valid.
      let at=0,lastBoundary=-1;
      for(const glyph of run.children) {
        if(glyph.textContent===' ') {
          const wordGap=boundaries.has(at)&&lastBoundary!==at;
          glyph.classList.toggle('ax-letter-gap',!wordGap);if(wordGap)lastBoundary=at;
        } else glyph.textContent=letters[at++];
      }
      run.classList.add('ax-readable-heading');
    });
    naturalSourceLabels(root);
  }
  function showChapterMarks(root) {
    // Hide the letter gaps without changing the text length that saved highlights are checked against.
    root.querySelectorAll('h3 strong').forEach(mark=>{
      const text=mark.textContent;if(!CHAPTER_MARK.test(text))return;
      mark.classList.add('ax-chapter-mark');mark.replaceChildren();
      [...text].forEach((char,i)=>{
        if(char!==' '||i===13){mark.append(char);return;}
        const gap=document.createElement('span');gap.className='ax-letter-gap';gap.textContent=' ';mark.append(gap);
      });
    });
  }
  function chapterText(node) {
    const copy = node.cloneNode(true);
    copy.querySelectorAll('button,.ax-page-label').forEach(n => n.remove());
    return readableCopy(copy).textContent;
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
  function migratedRanges(stored,length,migration) {
    if(!stored)return [];
    const targetVersion=migration?.toVersion||2;
    if(!migration||stored.textVersion===targetVersion)return stored.length===length?stored.ranges:[];
    if(migration.previous&&(stored.textVersion||1)<(migration.fromVersion||2)){
      stored={length:migration.fromLength,textVersion:migration.fromVersion||2,ranges:migratedRanges(stored,migration.fromLength,migration.previous)};
    }
    if(stored.length===length&&stored.length!==migration.fromLength)return stored.ranges;
    if(stored.length!==migration.fromLength||length!==migration.toLength)return [];
    const mapped=[];
    for(const range of stored.ranges){
      for(const [before,after,size] of migration.blocks){
        const start=Math.max(range.start,before),end=Math.min(range.end,before+size);
        if(end>start)mapped.push({...range,id:range.id+(targetVersion===2?':flow:':':form'+targetVersion+':')+start+':'+end,start:after+start-before,end:after+end-before});
      }
    }
    return mapped;
  }
  function restoreMarks() {
    const previous=by('ax-body').querySelectorAll('mark.ax-highlight');
    previous.forEach(mark=>mark.replaceWith(...mark.childNodes));
    if(previous.length)by('ax-body').normalize();
    const entries = highlights[current] || {};
    by('ax-body').querySelectorAll('.ax-page').forEach(page => {
      const stored = entries[page.dataset.page];
      applyMarks(page,migratedRanges(stored,textNodes(page).reduce((n,node)=>n+node.length,0),page.amaTextMigration));
    });
  }
  function layoutExamples(container) {
    let active=null,fieldName='',analysis=false;
    const field=/^(Subject|History|Current Symptoms|Physical Exam(?:ination)?|Clinical Studies|Diagnosis|Impairment Rating|Comments?|Discussion|Treatment|Results|Conclusion):/i;
    for(const wrapper of container.children){
      const page=wrapper.querySelector('.ax-page-content')||wrapper;
      let section=null,columns=null,column=null,card=null;
      const create=()=>{
        section=document.createElement('section');section.className='ax-example';section.dataset.example=active;
        section.setAttribute('aria-label','Example '+active);columns=document.createElement('div');columns.className='ax-example-columns';
        column=document.createElement('div');column.className='ax-example-column';columns.append(column);
        page.insertBefore(section,node);section.append(columns);
      };
      // Wrapping only: preserve IDs, text order, source characters and saved
      // highlight offsets, including cases that continue onto the next page.
      let node;
      for(node of [...page.children]){
        const text=node.textContent.trim(),heading=text.match(/^EXAMPLE\s+(\d+-\d+[a-z]?)(?=[:.\s]|$)/i),label=text.match(field);
        if(heading){
          active=heading[1];fieldName='';analysis=false;section=null;card=null;create();section.prepend(node);node.classList.add('ax-example-title');continue;
        }
        if(!active)continue;
        const boundary=!label&&(/^H[1-3]$/.test(node.tagName)||node.classList.contains('ax-object')||/^CLASS\s+\d\b/.test(text)||/^\d+\.\d+\s/.test(text));
        if(boundary){active=null;fieldName='';analysis=false;section=null;card=null;continue;}
        if(!section){create();section.classList.add('ax-example-continuation');}
        if(label){
          fieldName=label[1];const nextAnalysis=/^(Impairment Rating|Comments?|Discussion|Conclusion)$/i.test(fieldName);
          if(nextAnalysis&&!analysis){analysis=true;if(column.childElementCount){column=document.createElement('div');column.className='ax-example-column';columns.append(column);}}
          card=document.createElement('div');card.className='ax-example-field';card.dataset.field=fieldName;column.append(card);
        }
        if(!card){card=document.createElement('div');card.className='ax-example-field';if(fieldName)card.setAttribute('aria-label',fieldName+' continued');column.append(card);}
        card.append(node);
      }
    }
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
    let entry=highlights[current][page.dataset.page];
    const textVersion=page.amaTextMigration?.toVersion||2;
    if(!entry||entry.textVersion!==textVersion)entry=highlights[current][page.dataset.page]={length:offset,textVersion,ranges:migratedRanges(entry,offset,page.amaTextMigration),...(entry?{legacy:entry}:{})};
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
    for (const object of data.attachments.filter(item=>item.kind==='table'||item.kind==='figure')) {
      const button=document.createElement('button');button.type='button';button.className='ax-table-shortcut';button.dataset.tableOpen=object.id;
      button.dataset.objectKind=object.kind;
      const caption=object.kind==='table'?tableCaption(object):figureCaption(object);
      button.textContent=object.label;button.title=caption;button.setAttribute('aria-label',object.label+' '+caption);button.setAttribute('aria-haspopup','dialog');shortcuts.append(button);
      if(object.kind==='figure'&&caption){const subtitle=document.createElement('span');subtitle.className='reader-table-caption';subtitle.textContent=caption;button.append(subtitle);}
    }
    by('ax-table-shortcuts').replaceChildren(shortcuts);by('ax-table-shortcuts').hidden=!by('ax-table-shortcuts').childElementCount;window.ScholarReaderTables?.sync('ax');syncNeuroTemplate();
    by('ax-section').replaceChildren(...choices.map(section => {
      const option=document.createElement('option'); option.value=section.id; option.textContent=section.title; return option;
    }));
    let fragment=document.createDocumentFragment(),started=performance.now();
    for(let i=0;i<data.pages.length;i++) {
      if(version!==revision)return false;
      const source=data.pages[i],page=document.createElement('section');page.className='ax-page';page.id='ax-page-'+source.page;page.dataset.page=source.page;
      page.amaTextMigration=source.textMigration;
      const label=document.createElement('div');label.className='ax-page-label';label.textContent='原書第 '+sourcePages(source)+' 頁';
      const body=document.createElement('div');body.className='ax-page-content';body.innerHTML=source.html;showChapterMarks(body);showSourceHeadings(body);
      page.append(label,body);fragment.append(page);
      if(i===1 || performance.now()-started>6) {
        container.append(fragment);fragment=document.createDocumentFragment();
        if(globalThis.scheduler?.yield)await globalThis.scheduler.yield();
        else await new Promise(resolve=>setTimeout(resolve,0));
        started=performance.now();
      }
    }
    if(version!==revision)return false;
    container.append(fragment);layoutExamples(container);restoreMarks();renderedChapter=current;
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
    chapterSearchRevision++;pageJumpRevision++;by('ax-chapter-results').hidden=true;by('ax-chapter-results').replaceChildren();by('ax-chapter-query').value='';
    clearTimeout(scrollTimer);
    rememberReaderPosition();renderedChapter=undefined;objectRevision++;
    current=id; const version=++revision;
    by('ama-panel').querySelectorAll('[data-neuro-template-copy]').forEach(button=>button.hidden=true);
    document.querySelectorAll('.ax-chapter').forEach(button => {
      const selected=button.dataset.chapter===id;
      button.setAttribute('aria-selected',String(selected)); button.tabIndex=selected?0:-1;
    });
    by('ax-content').setAttribute('aria-labelledby','ax-tab-'+id);
    by('ax-kicker').textContent=chapterLabel(chapter); by('ax-title').textContent=chapter.title;
    by('ax-table-shortcuts').hidden=true;window.ScholarReaderTables?.sync('ax');
    by('ax-location').textContent=chapter.type==='supplement' ? chapter.title : '第 '+chapter.no+' 章／共 '+catalogue.chapters.filter(c=>c.type!=='supplement').length+' 章';
    by('ax-tools').hidden=!chapter.ready; by('ax-status').textContent=''; by('ax-section').replaceChildren();
    by('ax-body').innerHTML='<div class="ax-pending sg-glass"><p>'+(chapter.ready?'載入中…':'正文準備中。')+'</p>'+(chapter.ready?'':'<p>本章正文與圖表尚未匯入。</p>')+'</div>';
    saved.chapter=id; persist();
    if (options.closeMenu!==false && mobile.matches) menu(false); else revealSelection();
    if (options.focusTab) by('ax-tab-'+id).focus();
    else if (options.focusHeading && mobile.matches) by('ax-content').focus({preventScroll:true});
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
  function presentPopup(before) {
    const dialog=by('ax-dialog');
    if(dialog.open && before)window.ScholarPeek.resize(dialog,before);
    else window.ScholarPeek.open(dialog);
  }
  async function dismissPopup() {
    objectRevision++;
    return window.ScholarPeek.close(by('ax-dialog'));
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
    const body=by('ax-dialog-body'),key='ama|'+chapter+'|'+id,reuse=window.ScholarPopupCache?.restore(body,key) || body.dataset.chapter===chapter&&body.dataset.object===id&&body.childElementCount>0;
    if(!reuse){body.innerHTML=object.html;showSourceHeadings(body,object.label);}body.dataset.chapter=chapter;body.dataset.object=id;body.dataset.renderKey=key;
    const tables=data.attachments.filter(item=>item.kind==='table'),index=tables.findIndex(item=>item.id===id);
    by('ax-table-nav').hidden=index<0;
    by('ax-table-prev').disabled=index<=0;by('ax-table-next').disabled=index<0||index===tables.length-1;
    by('ax-table-position').textContent=index<0?'':(index+1)+'／'+tables.length;
    if(!reuse)scopeObjectIds(body);
    presentPopup(before);
    window.ScholarFormReader?.mount(body,id);
    body.scrollTop=0;
    } catch(_){if(request===objectRevision)by('ax-status').textContent='無法載入圖表，請檢查連線後再試。';}
  }
  function cleanCaption(title,objectLabel) {
    // The table number may sit before, after or inside the title, and continued tables repeat it.
    const label=[...objectLabel.replace(/\s/g,'')].map(char=>/[-–—]/.test(char)?'[-–—]':char.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s*');
    title=title.replace(new RegExp(label+'(?!\\s*\\d)(?:\\s*\\(\\s*continued\\s*\\))?','gi'),' ')
      .replace(/\s+/g,' ').trim().replace(/^[a-z] (?=[A-Z])/,'').replace(/ [a-z]$/,'');
    const words=title.split(' '),half=words.length/2;
    if(words.length>1&&Number.isInteger(half)&&words.slice(0,half).join(' ')===words.slice(half).join(' '))title=words.slice(0,half).join(' ');
    return title.replace(/^SENSORY AND MOTOR SEVERITY$/,'Sensory and Motor Severity');
  }
  function tableCaption(object) {
    if(object.caption!==undefined)return cleanCaption(object.caption,object.label);
    if (!tableCaptions.has(object.id)) {
      const holder=document.createElement('div');holder.innerHTML=object.html;
      readableCopy(holder);
      holder.querySelectorAll('sup').forEach(n=>{if(/^(?:[a-z]|\*)$/.test(n.textContent.trim()))n.remove();});
      const table=holder.querySelector('table');let title='';
      const compact=s=>s.replace(/\s/g,'').toUpperCase(),label=compact(object.label);
      for(const p of holder.querySelectorAll('p,h3')){
        if(!p.closest('table')&&compact(p.textContent).startsWith(label)){
          title=cleanCaption(p.textContent,object.label);let next=p.nextElementSibling;
          while(title&&next?.localName==='p'&&(/[,，]$/.test(title)||(title.match(/\(/g)||[]).length>(title.match(/\)/g)||[]).length)){title+=' '+next.textContent.trim();next=next.nextElementSibling;}
          title=title.replace(/\s+Note:\s[\s\S]*$/i,'');
          if(title)break;
        }
      }
      if (!title&&table) {
        const range=document.createRange();range.setStart(holder,0);range.setEndBefore(table);
        title=chapterText(range.cloneContents()).replace(/\s+/g,' ').trim();
        if (!title) {
          // Positioned headings can follow the grid in DOM order while sitting above it.
          const top=node=>{let y=0;for(let n=node;n&&n!==holder;n=n.parentElement)y+=parseFloat(n.style.top)||0;return y;};
          readableCopy(holder);
          title=[...holder.querySelectorAll('.ax-source-run')].filter(run=>!run.closest('table')&&top(run)<top(table)-.5).sort((a,b)=>top(a)-top(b)).map(run=>run.textContent).join(' ').replace(/\s+/g,' ').trim();
        }
        title=cleanCaption(title,object.label);
      }
      tableCaptions.set(object.id,title);
    }
    return tableCaptions.get(object.id);
  }
  function figureCaption(object) {
    if(object.caption!==undefined)return cleanCaption(object.caption,object.label);
    if(!object.html)return '';
    const holder=document.createElement('div');holder.innerHTML=object.html;
    readableCopy(holder);
    holder.querySelectorAll('sup').forEach(n=>{if(/^[a-z]$/.test(n.textContent.trim()))n.remove();});
    const top=node=>{let y=0;for(let n=node;n&&n!==holder;n=n.parentElement)y+=parseFloat(n.style.top)||0;return y;};
    const runs=[...holder.querySelectorAll('.ax-source-run,span[style*="position:absolute"]')].filter(n=>!n.closest('table')&&!n.closest('svg')&&!n.parentElement.closest('.ax-source-run'));
    if(runs.length){
      const compact=s=>s.replace(/\s/g,'').toUpperCase(),label=compact(object.label),ordered=runs.sort((a,b)=>top(a)-top(b));
      const heading=ordered.find(n=>compact(n.textContent).startsWith(label));
      if(heading){
        const candidates=ordered.filter(n=>top(n)>=top(heading)-(parseFloat(heading.style.fontSize)||14)&&cleanCaption(n.textContent,object.label)&&n!==heading);
        if(candidates.length){
          const size=parseFloat(candidates[0].style.fontSize)||0,lines=[];let previous=top(candidates[0]);
          for(const n of candidates){if((parseFloat(n.style.fontSize)||0)<size*.95||top(n)-previous>size*1.7)break;lines.push(n.textContent);previous=top(n);}
          if(lines.length)return cleanCaption(lines.join(' '),object.label);
        }
      }
    }
    const compact=s=>s.replace(/\s/g,'').toUpperCase(),label=compact(object.label);
    for(const p of holder.querySelectorAll('p,h3')){
      if(!compact(p.textContent).startsWith(label))continue;
      let title=cleanCaption(p.textContent,object.label),next=p.nextElementSibling;
      while(!title&&next&&['P','H3'].includes(next.tagName)){title=cleanCaption(next.textContent,object.label);next=next.nextElementSibling;}
      if(!title&&holder.querySelector('svg text'))title=holder.querySelector('svg text').textContent;
      if(title)return title;
    }
    return '';
  }
  async function openTableIndex(chapterId=current) {
    const request=++objectRevision;
    const data=await content(chapterId);if(request!==objectRevision)return;
    const tables=data.attachments.filter(object=>object.kind==='table');
    const before=by('ax-dialog').open?by('ax-dialog').getBoundingClientRect():null;
    const chapter=catalogue.chapters.find(item=>item.id===chapterId),body=by('ax-dialog-body');
    by('ax-dialog').classList.remove('ax-peek','ax-popped');by('ax-peek-expand').hidden=true;
    by('ax-dialog-title').textContent=chapterLabel(chapter)+' · 本章表格';by('ax-table-nav').hidden=true;
    window.ScholarPopupCache?.release(body);delete body.dataset.renderKey;
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
  async function jumpBookPage() {
    const number=Number(by('ax-page-query').value),version=revision,request=++pageJumpRevision;
    if(!Number.isInteger(number)||number<1)return;
    const chapter=catalogue.chapters.find(c=>c.ready&&c.type!=='supplement'&&number>=c.start&&number<=c.end);
    if(!chapter){by('ax-status').textContent='找不到原書第 '+number+' 頁。';return;}
    try {
      const data=await content(chapter.id);if(version!==revision||request!==pageJumpRevision)return;
      const page=data.pages.find(p=>(p.sourcePages||[p.page]).some(n=>Number(n)===number));
      if(!page){by('ax-status').textContent='找不到原書第 '+number+' 頁。';return;}
      if(current===chapter.id)scrollToId('ax-page-'+page.page);else await selectChapter(chapter.id,{anchor:'ax-page-'+page.page});
      if(current===chapter.id&&renderedChapter===chapter.id)by('ax-status').textContent='原書第 '+number+' 頁';
    }catch(_){if(version===revision&&request===pageJumpRevision)by('ax-status').textContent='無法載入頁面，請再試一次。';}
  }
  async function searchChapter() {
    const query=by('ax-chapter-query').value.trim(),needle=query.toLocaleLowerCase(),chapterId=current,version=++chapterSearchRevision,results=by('ax-chapter-results');
    results.replaceChildren();results.hidden=!query;if(!query)return;
    results.textContent='本章搜尋中…';
    try {
      const data=await content(chapterId);if(version!==chapterSearchRevision)return;
      let pages=chapterSearchText.get(chapterId);
      if(!pages){
        pages=[];
        for(let i=0;i<data.pages.length;i++){
          const p=data.pages[i],holder=document.createElement('div');holder.innerHTML=p.html;
          pages.push({page:p.page,label:sourcePages(p),text:chapterText(holder).replace(/\s+/g,' ')});
          if(i%8===7){await new Promise(resolve=>setTimeout(resolve,0));if(version!==chapterSearchRevision)return;}
        }
        chapterSearchText.set(chapterId,pages);
      }
      const fragment=document.createDocumentFragment();let count=0;
      for(const page of pages){
        const index=page.text.toLocaleLowerCase().indexOf(needle);if(index<0)continue;
        const button=document.createElement('button');button.type='button';button.className='ax-result';button.dataset.page=page.page;
        const label=document.createElement('strong');label.textContent='原書第 '+page.label+' 頁';
        const excerpt=document.createElement('span'),hit=document.createElement('mark');hit.className='ax-find-hit';hit.textContent=page.text.slice(index,index+needle.length);
        excerpt.append(document.createTextNode((index>45?'…':'')+page.text.slice(Math.max(0,index-45),index)),hit,document.createTextNode(page.text.slice(index+needle.length,index+needle.length+90)+'…'));button.append(label,excerpt);
        button.addEventListener('click',()=>{if(current===chapterId){results.hidden=true;scrollToId('ax-page-'+page.page);by('ax-status').textContent='「'+query+'」· 原書第 '+page.label+' 頁';}});
        fragment.append(button);count++;
      }
      const status=document.createElement('p');status.setAttribute('role','status');status.textContent=count?'本章 '+count+' 頁符合':'本章沒有符合的文字。';
      results.replaceChildren(status,fragment);
    }catch(_){if(version===chapterSearchRevision)results.textContent='無法搜尋本章，請再試一次。';}
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
    readableCopy(root);
    root.querySelectorAll('svg').forEach(svg=>{
      const labels=document.createElement('div');
      for (const text of svg.querySelectorAll('text')) {const line=document.createElement('p');line.textContent=text.textContent;labels.append(line);}
      svg.replaceWith(labels);
    });
    // Diagram labels retain their anchors; clipboard words use their text order.
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

  async function copyNeuroTemplate() {
    if(current!=='c13'||neuroCopyBusy)return;
    neuroCopyBusy=true;
    const buttons=[...by('ama-panel').querySelectorAll('[data-neuro-template-copy]')];buttons.forEach(button=>button.disabled=true);
    const active=document.activeElement;let usedFallback=false;
    try {
      try {await navigator.clipboard.writeText(NEURO_CHART_TEMPLATE);}
      catch (_) {
        usedFallback=true;
        const selection=getSelection(),ranges=selection?Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()):[];
        const area=document.createElement('textarea');area.value=NEURO_CHART_TEMPLATE;area.style.cssText='position:fixed;left:-10000px;top:0';document.body.append(area);area.select();
        let copied;try {copied=document.execCommand('copy');}finally{area.remove();if(selection){selection.removeAllRanges();ranges.forEach(range=>selection.addRange(range));}}
        if(!copied)throw Error('Copy unavailable');
      }
      if(current==='c13')by('ax-status').textContent='已複製第13章病歷模板，可直接貼上。';
    } catch (_) {if(current==='c13')by('ax-status').textContent='複製未成功，請允許剪貼簿存取後再試。';}
    finally {neuroCopyBusy=false;buttons.forEach(button=>button.disabled=false);if(usedFallback&&active?.isConnected&&!active.hidden)active.focus({preventScroll:true});}
  }
  function syncNeuroTemplate() {
    if(current!=='c13')return;
    for(const target of [by('ax-table-shortcuts'),by('ax-table-rail')?.querySelector('.reader-table-heading')]){
      if(!target)continue;
      let button=target.querySelector('[data-neuro-template-copy]');
      if(!button){button=document.createElement('button');button.type='button';button.className='ax-template-copy';button.dataset.neuroTemplateCopy='true';button.textContent='複製病歷模板';button.addEventListener('click',copyNeuroTemplate);target.insertBefore(button,target.querySelector('.reader-object-tabs'));}
      button.hidden=false;button.disabled=neuroCopyBusy;
    }
  }

  async function boot() {
    const response=await fetch('ama/index.json',{cache:'no-cache'});
    if (!response.ok) throw new Error('AMA catalogue unavailable');
    catalogue=await response.json();
    const panel=by('ama-panel');
    panel.innerHTML='<div id="ax-layout" class="ax-layout">'+
      '<aside id="ax-side" class="ax-side sg-glass" aria-label="AMA 章節選單"><div class="ax-side-head"><button id="ax-sidebar-toggle" class="ax-sidebar-toggle" type="button" aria-label="收合側欄" title="收合側欄" aria-controls="ax-sidebar-content" aria-expanded="true"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M5.5 8h1M5.5 11.5h1M5.5 15h1"/></svg></button><div class="ax-side-heading"><p>AMA Guides · Sixth Edition</p><h2>章節</h2></div></div><div id="ax-sidebar-content" class="ax-side-content">'+
      '<form id="ax-search" class="ax-search"><label class="ax-sr" for="ax-query">搜尋已匯入章節</label><input id="ax-query" type="search" placeholder="搜尋已匯入章節" autocomplete="off"><button type="submit" class="sg-btn">搜尋</button></form>'+
      '<div id="ax-results" class="ax-results" aria-live="polite" hidden></div><div id="ax-list" class="ax-list" role="tablist" aria-label="AMA 章節" aria-orientation="vertical"></div></div></aside>'+
      '<div class="ax-reader"><div class="ax-bar"><button id="ax-menu" class="ax-sidebar-toggle" type="button" aria-controls="ax-sidebar-content" aria-expanded="false" aria-label="展開側欄" title="展開側欄"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16M5.5 8h1M5.5 11.5h1M5.5 15h1"/></svg></button><span id="ax-location" class="ax-location"></span><div class="ax-local-tools"><form id="ax-page-search" class="ax-page-search"><label class="ax-sr" for="ax-page-query">原書頁碼</label><input id="ax-page-query" type="number" min="1" step="1" placeholder="原書頁碼" required><button type="submit">跳頁</button></form><form id="ax-chapter-search" class="ax-chapter-search"><label class="ax-sr" for="ax-chapter-query">本章文字搜尋</label><input id="ax-chapter-query" type="search" placeholder="本章文字搜尋" autocomplete="off"><button type="submit">搜尋</button></form></div></div><div id="ax-chapter-results" class="ax-chapter-results" hidden></div>'+
      '<div id="ax-tools" class="ax-tools" hidden><label class="ax-sr" for="ax-section">本章小節</label><select id="ax-section"></select><div class="ax-reading-controls"><label class="ax-font-control" for="ax-font">正文字型<select id="ax-font"><option value="default">預設</option><option value="georgia">Georgia</option><option value="times">Times New Roman</option><option value="arial">Arial</option><option value="system">系統字型</option></select></label><button id="ax-smaller" type="button" aria-label="縮小文字">A−</button><button id="ax-larger" type="button" aria-label="放大文字">A＋</button><button id="ax-mark" type="button">標記選取</button><button id="ax-copy-chapter" type="button">複製本章</button><button id="ax-copy-all" type="button">複製已匯入全文</button><button id="ax-clear-marks" type="button">清除本章標記</button></div></div><div id="ax-status" class="ax-status" role="status"></div>'+
      '<div id="ax-scroll" class="ax-scroll"><article id="ax-content" role="tabpanel" tabindex="0"><div class="ax-head"><p id="ax-kicker" class="ax-kicker ax-sr"></p><h1 id="ax-title" class="ax-title ax-sr" tabindex="-1"></h1><nav id="ax-table-shortcuts" class="ax-table-shortcuts" aria-label="本章表格快覽" hidden></nav></div><div id="ax-body"></div></article></div></div></div>'+
      '<dialog id="ax-dialog" class="ax-dialog" aria-labelledby="ax-dialog-title"><div class="ax-dialog-bar"><h2 id="ax-dialog-title"></h2><button id="ax-peek-expand" type="button" hidden>展開</button><button id="ax-dialog-close" type="button" aria-label="關閉圖表">關閉</button></div><div id="ax-table-nav" class="ax-table-nav" hidden><button id="ax-table-prev" type="button">上一張</button><button id="ax-table-index" type="button">表格目錄</button><button id="ax-table-next" type="button">下一張</button><span id="ax-table-position" aria-live="polite"></span></div><div id="ax-dialog-body" class="ax-dialog-body"></div></dialog>';
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
    by('ax-page-search').addEventListener('submit',event=>{event.preventDefault();jumpBookPage();});
    by('ax-page-query').addEventListener('input',()=>{pageJumpRevision++;});
    by('ax-chapter-search').addEventListener('submit',event=>{event.preventDefault();searchChapter();});
    by('ax-chapter-query').addEventListener('input',()=>{chapterSearchRevision++;if(!by('ax-chapter-query').value){by('ax-chapter-results').hidden=true;by('ax-chapter-results').replaceChildren();}});
    by('ax-chapter-query').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();chapterSearchRevision++;by('ax-chapter-results').hidden=true;}});
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

