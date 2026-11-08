/* Small shortcut-only rails. Source buttons retain the existing popup handlers. */
(() => {
 'use strict';
 const states=new Map();
 function sync(prefix){
  const layout=document.getElementById(prefix+'-layout');if(!layout)return;
  const doc=document.getElementById(prefix==='ax'?'ax-content':prefix+'-doc');
  const source=prefix==='ax'?document.getElementById('ax-table-shortcuts'):doc?.querySelector('.'+prefix+'-chips');
  let state=states.get(prefix);
  if(!state||state.layout!==layout){
   const rail=document.createElement('aside');rail.id=prefix+'-table-rail';rail.className='reader-table-rail';rail.setAttribute('aria-label',prefix==='lx'?'附表捷徑':'表格與附件捷徑');
   const heading=document.createElement('h2');heading.textContent=prefix==='lx'?'附表':prefix==='ax'?'表格快覽':'表格與附件';
   const list=document.createElement('nav');list.className='reader-table-list';list.setAttribute('aria-label',heading.textContent);rail.append(heading,list);layout.append(rail);
   state={layout,rail,list};states.set(prefix,state);
   if(doc)new MutationObserver(()=>sync(prefix)).observe(doc,{attributes:true,attributeFilter:['hidden']});
  }
  const buttons=source?[...source.querySelectorAll('button')]:[];
  const visible=buttons.length>0&&!doc.hidden&&!source.hidden;
  state.rail.hidden=!visible;layout.dataset.tableRail=String(visible);
  if(!visible){state.list.replaceChildren();return;}
  const fragment=document.createDocumentFragment();
  for(const original of buttons){
   const button=original.cloneNode(true);button.removeAttribute('id');button.classList.add('reader-table-shortcut');button.setAttribute('aria-haspopup','dialog');
   if(prefix==='ax'&&original.title&&original.title!==original.textContent){const caption=document.createElement('span');caption.className='reader-table-caption';caption.textContent=original.title;button.append(caption);}
   button.addEventListener('click',()=>{if(original.isConnected)original.click();});fragment.append(button);
  }
  state.list.replaceChildren(fragment);state.list.scrollTop=0;
 }
 window.ScholarReaderTables={sync};
})();
