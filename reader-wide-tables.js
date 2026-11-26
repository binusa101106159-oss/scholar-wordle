/* 法規／指引／健檢 readers: wide tables use the room beside the text column (most of all when the sidebar is
 * collapsed), and letter-spaced headings from the source PDFs (「行 業 種 類」) read as one word.
 * Display only: the text, search and highlight offsets are unchanged (the spaces stay in the DOM, drawn at zero
 * width), and nothing is stored. */
(() => {
 'use strict';
 const READERS=['lx','gx','hx'];
 const desktop=matchMedia('(min-width: 901px)');
 const CJK='[\u3400-\u9fff\uf900-\ufaff]';
 // A short cell label made only of CJK words split by single spaces (「行 業 種 類」「連 續作 業」) is a spacing artifact.
 // Cells with blanks to fill in (「每週 次」「年 月 日」), punctuation or other text are left exactly as they are.
 const LABEL=new RegExp('^'+CJK+'+(?: '+CJK+'+)+$');

 function tidy(table){
  if(table.dataset.rtTidy)return;table.dataset.rtTidy='1';
  for(const cell of table.querySelectorAll('td,th')){
   if(cell.closest('table')!==table||cell.querySelector('table'))continue;
   const text=cell.textContent.trim();
   if(text.length>24||!LABEL.test(text)||/[年月日人次時分]/.test(text.replace(/ /g,'').slice(-1)))continue;
   const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT),nodes=[];let n;
   while((n=walker.nextNode()))if(n.nodeValue.includes(' ')&&!n.parentElement.closest('.rt-gap'))nodes.push(n);
   for(const node of nodes){
    const frag=document.createDocumentFragment();
    node.nodeValue.split(/( )/).forEach(part=>{if(part===' '){const gap=document.createElement('span');gap.className='rt-gap';gap.textContent=' ';frag.append(gap);}else if(part)frag.append(part);});
    node.replaceWith(frag);
   }
  }
 }

 // How wide the table would like to be with no line wrapping.
 // (an invisible copy without the column percentages, which would otherwise squeeze it back to the current width)
 function natural(table){
  const copy=table.cloneNode(true);copy.querySelector(':scope>colgroup')?.remove();
  Object.assign(copy.style,{tableLayout:'auto',position:'absolute',visibility:'hidden',left:'0',top:'0',width:'max-content',minWidth:'0',maxWidth:'none'});
  table.parentElement.append(copy);const v=copy.getBoundingClientRect().width;copy.remove();return Math.ceil(v)+2;
 }
 // Articles skip painting while off screen (content-visibility), which also clips anything wider than them.
 function unclip(wrap,doc,on){
  for(let n=wrap.parentElement;n&&n!==doc;n=n.parentElement){
   if(on&&getComputedStyle(n).contentVisibility==='auto'){n.style.contentVisibility='visible';n.dataset.rtUnclip='1';}
   else if(!on&&n.dataset.rtUnclip){n.style.contentVisibility='';delete n.dataset.rtUnclip;}
  }
 }
 function widen(prefix){
  const reader=document.querySelector('.'+prefix+'-reader'),doc=document.getElementById(prefix+'-doc');
  if(!reader||!doc)return;
  const wraps=[...doc.querySelectorAll('.'+prefix+'-twrap:not(.'+prefix+'-nested)')];
  for(const w of wraps){w.style.marginLeft='';w.style.marginRight='';if(w.classList.contains('rt-wide')){w.classList.remove('rt-wide');unclip(w,doc,false);}const t=w.querySelector('table');if(t)tidy(t);}
  if(!desktop.matches||!reader.getClientRects().length)return;
  const cs=getComputedStyle(reader),box=reader.getBoundingClientRect();
  const left=box.left+parseFloat(cs.paddingLeft||0),right=box.right-parseFloat(cs.paddingRight||0);
  for(const w of wraps){
   const t=w.querySelector('table');if(!t)continue;
   const r=w.getBoundingClientRect();if(!r.width)continue;
   const cols=t.querySelectorAll(':scope>colgroup>col').length;
   // only tables that are wide by nature: five or more columns, or already too wide for the text column
   if(cols<5&&t.scrollWidth<=w.clientWidth+1)continue;
   // keep the source column proportions; grow to a little more than the no-wrap width, up to all the room there is
   const nat=natural(t);if(nat<=r.width+1&&t.scrollWidth<=w.clientWidth+1)continue;
   const want=Math.min(Math.max(nat*1.25,t.scrollWidth),right-left)-r.width;if(want<4)continue;
   const roomL=Math.max(0,r.left-left),roomR=Math.max(0,right-r.right);
   let addR=Math.min(roomR,want/2),addL=Math.min(roomL,want-addR);addR=Math.min(roomR,want-addL);
   if(addL+addR<4)continue;
   w.style.marginLeft=-Math.floor(addL)+'px';w.style.marginRight=-Math.floor(addR)+'px';w.classList.add('rt-wide');unclip(w,doc,true);
  }
 }
 const pending=new Set();let frame=0;
 const queue=prefix=>{pending.add(prefix);if(!frame)frame=requestAnimationFrame(()=>{frame=0;const list=[...pending];pending.clear();list.forEach(widen);});};
 const watched=new WeakSet();let attached=0,mo=null;
 function attach(){
  for(const prefix of READERS){
   const reader=document.querySelector('.'+prefix+'-reader'),doc=document.getElementById(prefix+'-doc');
   if(!reader||!doc||watched.has(doc))continue;watched.add(doc);attached++;
   new ResizeObserver(()=>queue(prefix)).observe(reader);
   new MutationObserver(()=>queue(prefix)).observe(doc,{childList:true});
   queue(prefix);
  }
  if(attached>=READERS.length&&mo){mo.disconnect();mo=null;}
 }
 // The readers are built when their tab first opens; the callback is a few lookups, and stops once all are found.
 function start(){
  mo=new MutationObserver(attach);
  for(const id of ['laws-panel','guides-panel','health-panel']){const p=document.getElementById(id);if(p)mo.observe(p,{childList:true,subtree:true});}
  attach();
  desktop.addEventListener('change',()=>READERS.forEach(queue));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
 window.ScholarWideTables={widen,tidy};
})();
