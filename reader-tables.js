/* Small shortcut-only rails. Source buttons retain the existing popup handlers. */
(() => {
 'use strict';
 const states=new Map();
 function tabs(state,view,panel){
  const group=document.createElement('div');group.className='reader-object-tabs';group.setAttribute('role','tablist');group.setAttribute('aria-label','圖表種類');
  for(const [kind,text]of [['table','Table'],['figure','Figure']]){
   const button=document.createElement('button');button.type='button';button.id='ax-'+view+'-'+kind+'-tab';button.dataset.objectTab=kind;button.textContent=text;button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);
   button.addEventListener('click',()=>{state.kind=kind;sync('ax');});
   button.addEventListener('keydown',event=>{const choices=[...group.children],index=choices.indexOf(button);let next;if(event.key==='ArrowRight')next=choices[(index+1)%2];if(event.key==='ArrowLeft')next=choices[(index+1)%2];if(event.key==='Home')next=choices[0];if(event.key==='End')next=choices[1];if(next){event.preventDefault();next.click();next.focus();}});group.append(button);
  }
  return group;
 }
 function selectTabs(group,panel,kind){
  for(const button of group.children){const selected=button.dataset.objectTab===kind;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;if(selected)panel.setAttribute('aria-labelledby',button.id);}
 }
 function sync(prefix){
  const layout=document.getElementById(prefix+'-layout');if(!layout)return;
  const doc=document.getElementById(prefix==='ax'?'ax-content':prefix+'-doc');
  const source=prefix==='ax'?document.getElementById('ax-table-shortcuts'):doc?.querySelector('.'+prefix+'-chips');
  let state=states.get(prefix);
  if(!state||state.layout!==layout){
   const rail=document.createElement('aside');rail.id=prefix+'-table-rail';rail.className='reader-table-rail';rail.setAttribute('aria-label',prefix==='lx'?'附表捷徑':'表格與附件捷徑');
   const heading=document.createElement('h2');heading.textContent=prefix==='lx'?'附表':prefix==='ax'?'表格快覽':'表格與附件';
   const list=document.createElement('nav');list.className='reader-table-list';list.setAttribute('aria-label',heading.textContent);rail.append(heading,list);layout.append(rail);
   state={layout,rail,list,kind:'table'};states.set(prefix,state);
   if(prefix==='ax'){list.id='ax-rail-objects';list.setAttribute('role','tabpanel');state.tabs=tabs(state,'rail',list);rail.insertBefore(state.tabs,list);}
   if(doc)new MutationObserver(()=>sync(prefix)).observe(doc,{attributes:true,attributeFilter:['hidden']});
  }
  const buttons=source?[...source.querySelectorAll(prefix==='ax'?'button[data-table-open]':'button')]:[];
  const visible=buttons.length>0&&!doc.hidden&&!source.hidden;
  state.rail.hidden=!visible;layout.dataset.tableRail=String(visible);
  if(!visible){state.list.replaceChildren();return;}
  if(prefix==='ax'){
   let panel=source.querySelector('.reader-inline-objects');
   if(!panel){panel=document.createElement('div');panel.id='ax-inline-objects';panel.className='reader-inline-objects';panel.setAttribute('role','tabpanel');panel.append(...buttons);const group=tabs(state,'inline',panel);source.append(group,panel);}
   selectTabs(state.tabs,state.list,state.kind);selectTabs(source.querySelector('.reader-object-tabs'),panel,state.kind);
   for(const button of buttons)button.hidden=button.dataset.objectKind!==state.kind;
   panel.querySelector('.reader-table-empty')?.remove();
   if(!buttons.some(b=>!b.hidden)){const empty=document.createElement('p');empty.className='reader-table-empty';empty.textContent=state.kind==='figure'?'本章沒有 Figure。':'本章沒有 Table。';panel.append(empty);}
  }
  const fragment=document.createDocumentFragment();
  for(const original of buttons){
   if(prefix==='ax'&&original.hidden)continue;
   const button=original.cloneNode(true);button.removeAttribute('id');button.classList.add('reader-table-shortcut');button.setAttribute('aria-haspopup','dialog');
   if(prefix==='ax'&&original.title&&original.title!==original.textContent&&!button.querySelector('.reader-table-caption')){const caption=document.createElement('span');caption.className='reader-table-caption';caption.textContent=original.title;button.append(caption);}
   button.addEventListener('click',()=>{if(original.isConnected)original.click();});fragment.append(button);
  }
  if(prefix==='ax'&&!fragment.childElementCount){const empty=document.createElement('p');empty.className='reader-table-empty';empty.textContent=state.kind==='figure'?'本章沒有 Figure。':'本章沒有 Table。';fragment.append(empty);}
  state.list.replaceChildren(fragment);state.list.scrollTop=0;
 }
 window.ScholarReaderTables={sync};
})();
