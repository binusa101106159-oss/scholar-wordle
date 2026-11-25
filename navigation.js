(() => {
  'use strict';
  const nav=document.getElementById('scholar-game-tabs');
  if(!nav)return;
  const games=['wordle','crossword','sudoku','g2048','mines','iarcquiz','lawmatch','connect'].map(id=>document.getElementById('game-tab-'+id));
  const button=document.createElement('button');
  button.type='button';button.className='sg-tab sg-games-button';button.dataset.gameGroup='';
  button.id='game-group-button';button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','game-group-menu');
  button.append(games[0].querySelector('svg').cloneNode(true),document.createTextNode('小遊戲 ▾'));
  nav.append(button);
  const menu=document.createElement('div');menu.id='game-group-menu';menu.className='sg-games-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','小遊戲');
  nav.parentElement.append(menu);
  const items=games.map(tab=>{
    const item=document.createElement('button');item.type='button';item.setAttribute('role','menuitemradio');item.setAttribute('aria-label',tab.textContent.trim());item.tabIndex=-1;
    item.append(tab.querySelector('svg').cloneNode(true),document.createTextNode(tab.textContent.trim()));
    item.addEventListener('click',()=>{tab.click();close();button.focus({preventScroll:true});});menu.append(item);return item;
  });
  function close(){menu.hidden=true;button.setAttribute('aria-expanded','false');}
  function positionMenu(){if(menu.hidden)return;const parent=nav.parentElement.getBoundingClientRect(),trigger=button.getBoundingClientRect(),edge=parseFloat(getComputedStyle(nav.parentElement).paddingRight)||12;menu.style.right='auto';menu.style.left=Math.max(edge,Math.min(trigger.left-parent.left,parent.width-edge-menu.offsetWidth))+'px';}
  function open(last=false){menu.hidden=false;positionMenu();button.setAttribute('aria-expanded','true');const selected=items.find(item=>item.getAttribute('aria-checked')==='true');(last?items.at(-1):selected||items[0]).focus({preventScroll:true});}
  function sync(){
    const active=games.find(tab=>tab.getAttribute('aria-selected')==='true');
    button.dataset.active=String(Boolean(active));
    button.setAttribute('aria-label',active?'小遊戲：'+active.textContent.trim():'小遊戲');
    items.forEach((item,i)=>item.setAttribute('aria-checked',games[i]===active?'true':'false'));
  }
  button.addEventListener('click',()=>menu.hidden?open():close());
  button.addEventListener('keydown',event=>{
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open(event.key==='ArrowUp');return;}
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const tabs=[...nav.querySelectorAll('[data-game-tab],[data-game-group]')].filter(tab=>!tab.hidden),index=tabs.indexOf(button);
    const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];
    if(next!==button)next.click();next.focus({preventScroll:true});
  });
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close();button.focus({preventScroll:true});return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const index=items.indexOf(document.activeElement);const next=event.key==='Home'?items[0]:event.key==='End'?items.at(-1):items[(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length];next.focus();
  });
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!button.contains(event.target))close();});
  document.addEventListener('focusin',event=>{if(!menu.contains(event.target)&&event.target!==button)close();});
  new MutationObserver(sync).observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-selected']});
  nav.addEventListener('scroll',positionMenu,{passive:true});window.addEventListener('resize',positionMenu);
  games.forEach(tab=>{tab.hidden=true;});sync();
})();

/* Device-local ordering; move the existing buttons, never rebuild open pages. */
(() => {
  'use strict';
  const nav=document.getElementById('scholar-game-tabs');if(!nav)return;
  const KEY='scholar-tab-order-v1',LONG_PRESS=300;
  const tabs=()=>[...nav.querySelectorAll(':scope>.sg-tab')].filter(tab=>!tab.hidden);
  const defaults=tabs(),known=new Map(defaults.map(tab=>[tab.id,tab]));
  const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
  const status=document.createElement('span');status.id='sg-tab-order-status';status.className='sg-order-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');nav.after(status);
  const hint='拖曳排序；觸控長按後拖曳；鍵盤按 Alt＋Shift＋左右方向鍵排序。';
  for(const tab of defaults){tab.setAttribute('aria-describedby',((tab.getAttribute('aria-describedby')||'')+' '+status.id).trim());tab.title=(tab.title?tab.title+'；':'')+hint;}
  let drag=null,frame=0,lastTime=0,blockClick=false,clickTimer=0,settling=null;
  const motions=new Map();
  const order=()=>tabs().map(tab=>tab.id);
  function valid(raw){
    if(!Array.isArray(raw))return null;
    const ids=[...new Set(raw.filter(id=>typeof id==='string'&&known.has(id)))];
    for(const tab of defaults)if(!ids.includes(tab.id)){const games=ids.indexOf('game-group-button');if(games>=0&&tab.id!=='game-group-button')ids.splice(games,0,tab.id);else ids.push(tab.id);}
    return ids;
  }
  function notify(){nav.dispatchEvent(new Event('scholar:taborder'));}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(order()));}catch(_){/* Ordering still works in this session. */}}
  function apply(ids){
    const focus=document.activeElement;for(const id of ids)nav.append(known.get(id));notify();
    if(focus!==document.activeElement&&nav.contains(focus))focus.focus({preventScroll:true});
  }
  try{const ids=valid(JSON.parse(localStorage.getItem(KEY)));if(ids)apply(ids);}catch(_){/* Optional device preference. */}
  function animateMove(change,source){
    const nodes=[...tabs(),...nav.querySelectorAll(':scope>.lg-tab-lens')],before=new Map(nodes.map(n=>[n,n.getBoundingClientRect()]));
    for(const motion of motions.values())motion.cancel();motions.clear();change();notify();
    if(reduced())return;
    for(const node of nodes){
      if(node===source)continue;
      const old=before.get(node),next=node.getBoundingClientRect(),x=old.left-next.left,y=old.top-next.top;
      if(Math.abs(x)+Math.abs(y)<.5)continue;
      const motion=node.animate([{transform:`translate(${x}px,${y}px)`},{transform:'none'}],{duration:170,easing:'cubic-bezier(.2,.8,.2,1)'});motions.set(node,motion);
      motion.finished.then(()=>{if(motions.get(node)===motion)motions.delete(node);},()=>{});
    }
  }
  function announce(tab){status.textContent=tab.textContent.replace('▾','').trim()+'，第 '+(tabs().indexOf(tab)+1)+' 個分頁，共 '+tabs().length+' 個。';}
  function blockNextClick(){blockClick=true;clearTimeout(clickTimer);clickTimer=setTimeout(()=>blockClick=false,0);}
  nav.addEventListener('click',event=>{if(!blockClick&&!drag?.active)return;blockClick=false;event.preventDefault();event.stopImmediatePropagation();},true);
  function begin(){
    if(!drag||drag.active)return;
    document.getElementById('game-group-menu').hidden=true;document.getElementById('game-group-button').setAttribute('aria-expanded','false');
    settling?.();settling=null;
    const d=drag,r=d.tab.getBoundingClientRect();d.active=true;d.width=r.width;d.height=r.height;d.offset=d.startX-r.left;d.top=r.top;d.previousScrollBehavior=nav.style.scrollBehavior;nav.style.scrollBehavior='auto';
    d.ghost=d.tab.cloneNode(true);d.ghost.removeAttribute('id');d.ghost.removeAttribute('data-game-tab');d.ghost.removeAttribute('data-game-group');d.ghost.removeAttribute('aria-describedby');d.ghost.setAttribute('aria-hidden','true');d.ghost.inert=true;d.ghost.tabIndex=-1;d.ghost.classList.add('sg-tab-drag-ghost');
    const style=getComputedStyle(d.tab);
    Object.assign(d.ghost.style,{width:r.width+'px',height:r.height+'px',left:'0px',top:r.top+'px',font:style.font,padding:style.padding,borderRadius:style.borderRadius,gap:style.gap});
    [...d.ghost.children].forEach((child,i)=>child.style.display=getComputedStyle(d.tab.children[i]).display);
    document.body.append(d.ghost);d.tab.classList.add('sg-tab-drag-placeholder');nav.classList.add('sg-nav-sorting');
    if(d.pointerId!==undefined){try{nav.setPointerCapture(d.pointerId);}catch(_){}}
    lastTime=0;tick();status.textContent='正在排序，移動到想要的位置後放開；Escape 取消。';
  }
  function tick(now=0){
    if(!drag?.active)return;
    const d=drag,r=nav.getBoundingClientRect(),dt=lastTime?Math.min(32,now-lastTime):16;lastTime=now;
    const left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),edge=40;
    const speed=d.x<left+edge?-Math.min(14,(left+edge-d.x)*.4):d.x>right-edge?Math.min(14,(d.x-right+edge)*.4):0;
    if(speed)nav.scrollLeft+=speed*dt/16;
    d.ghost.style.transform=`translate3d(${d.x-d.offset}px,-3px,0) scale(1.035)`;
    const center=d.x-d.offset+d.width/2,others=tabs().filter(tab=>tab!==d.tab);
    const before=others.find(tab=>center<r.left+nav.clientLeft+tab.offsetLeft-nav.scrollLeft+tab.offsetWidth/2);
    const current=tabs(),index=current.indexOf(d.tab),next=current[index+1];
    if((before&&next!==before)||(!before&&index!==current.length-1))animateMove(()=>nav.insertBefore(d.tab,before||null),d.tab);
    frame=requestAnimationFrame(tick);
  }
  function finish(commit){
    if(!drag)return;
    const d=drag;drag=null;clearTimeout(d.timer);cancelAnimationFrame(frame);frame=0;
    if(!d.active)return;
    if(d.pointerId!==undefined){try{nav.releasePointerCapture(d.pointerId);}catch(_){}}
    if(!commit)animateMove(()=>apply(d.original),d.tab);else if(JSON.stringify(order())!==JSON.stringify(d.original))save();
    d.tab.classList.remove('sg-tab-drag-placeholder');nav.classList.remove('sg-nav-sorting');nav.style.scrollBehavior=d.previousScrollBehavior;if(d.pointerId!==undefined||!commit)blockNextClick();notify();announce(d.tab);
    const cleanup=()=>{d.ghost.remove();if(settling===cleanup)settling=null;};settling=cleanup;
    if(reduced()){cleanup();return;}
    const r=d.tab.getBoundingClientRect(),motion=d.ghost.animate([{transform:d.ghost.style.transform,opacity:1},{transform:`translate3d(${r.left}px,${r.top-d.top}px,0) scale(1)`,opacity:0}],{duration:150,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    motion.finished.then(cleanup,cleanup);
  }
  function candidate(tab,x,y,pointerId){
    if(drag)return;
    drag={tab,startX:x,startY:y,x,y,pointerId,original:order(),active:false};
    if(pointerId===undefined)drag.timer=setTimeout(begin,LONG_PRESS);
  }
  nav.addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch'||!event.isPrimary||event.button!==0)return;
    const tab=event.target.closest('.sg-tab');if(!known.has(tab?.id))return;candidate(tab,event.clientX,event.clientY,event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    drag.x=event.clientX;drag.y=event.clientY;
    if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>7)begin();
    if(drag?.active)event.preventDefault();
  },{passive:false});
  document.addEventListener('pointerup',event=>{if(drag?.pointerId===event.pointerId)finish(true);});
  document.addEventListener('pointercancel',event=>{if(drag?.pointerId===event.pointerId)finish(false);});
  nav.addEventListener('lostpointercapture',event=>{if(drag?.pointerId===event.pointerId)finish(false);});
  nav.addEventListener('touchstart',event=>{
    if(event.touches.length!==1){finish(false);return;}
    const tab=event.target.closest('.sg-tab');if(!known.has(tab?.id))return;const t=event.touches[0];candidate(tab,t.clientX,t.clientY);
  },{passive:true});
  nav.addEventListener('touchmove',event=>{
    if(!drag||drag.pointerId!==undefined)return;
    if(event.touches.length!==1){finish(false);return;}
    const t=event.touches[0];drag.x=t.clientX;drag.y=t.clientY;
    if(drag.active){event.preventDefault();return;}
    if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>8)finish(false);
  },{passive:false});
  nav.addEventListener('touchend',event=>{if(!drag||drag.pointerId!==undefined)return;if(drag.active)event.preventDefault();finish(true);},{passive:false});
  nav.addEventListener('touchcancel',()=>finish(false),{passive:true});
  nav.addEventListener('contextmenu',event=>{if(drag||event.target.closest('.sg-tab'))event.preventDefault();});
  nav.addEventListener('dragstart',event=>event.preventDefault());
  nav.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drag){event.preventDefault();event.stopImmediatePropagation();finish(false);return;}
    if(!event.altKey||!event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
    const tab=event.target.closest('.sg-tab'),list=tabs(),index=list.indexOf(tab);if(index<0)return;
    event.preventDefault();event.stopImmediatePropagation();const next=index+(event.key==='ArrowRight'?1:-1);if(next<0||next>=list.length)return;
    animateMove(()=>nav.insertBefore(tab,event.key==='ArrowRight'?list[next+1]||null:list[next]));tab.focus({preventScroll:true});tab.scrollIntoView({block:'nearest',inline:'nearest'});save();announce(tab);
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();event.stopImmediatePropagation();finish(false);}},true);
  window.addEventListener('blur',()=>finish(false));window.addEventListener('resize',()=>finish(false));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)finish(false);});
  window.addEventListener('storage',event=>{if(event.key!==KEY||drag)return;try{const ids=valid(JSON.parse(event.newValue));if(ids)apply(ids);}catch(_){}});
})();
