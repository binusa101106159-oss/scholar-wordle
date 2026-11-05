/* A childless glass plane behind the interactive sheet lets scrolling content
   composite independently from the backdrop filter (notably in WebKit/Firefox). */
(() => {
  'use strict';
  const layers=new WeakMap(),active=new Set();
  function sync(card){
    const state=layers.get(card);if(!state||state.hidden)return;
    const r=card.getBoundingClientRect();
    Object.assign(state.plane.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',borderRadius:getComputedStyle(card).borderRadius});
  }
  function hide(card){
    const state=layers.get(card);if(!state||state.hidden)return;
    state.hidden=true;active.delete(card);clearTimeout(state.timer);
    if(state.motion)state.motion.cancel();
    state.plane.remove();
  }
  function watch(card){
    if(layers.has(card))return;
    const plane=document.createElement('div');plane.className='pg-glass-plane';plane.setAttribute('aria-hidden','true');plane.inert=true;
    const state={plane,hidden:true,motion:null,timer:0,frame:0};layers.set(card,state);
    const schedule=()=>{if(!state.hidden&&!state.frame)state.frame=requestAnimationFrame(()=>{state.frame=0;sync(card);});};
    new ResizeObserver(schedule).observe(card);
    new MutationObserver(records=>{
      if(state.hidden)return;
      if(card.matches('.pg-closing,.ax-closing,.gx-closing,.lx-closing')&&!state.motion&&!matchMedia('(prefers-reduced-motion:reduce)').matches)state.motion=plane.animate([{opacity:1},{opacity:0}],{duration:120,fill:'forwards'});
      schedule();
    }).observe(card,{attributes:true,attributeFilter:['style','class'],childList:true,subtree:true});
    if(card instanceof HTMLDialogElement){
      card.addEventListener('toggle',()=>card.open?show(card):hide(card));
      card.addEventListener('close',()=>hide(card));
    }
  }
  function show(card){
    watch(card);const state=layers.get(card);
    if(state.motion){state.motion.cancel();state.motion=null;}
    if(state.hidden){
      state.hidden=false;document.body.append(state.plane);active.add(card);
      const overlay=card.closest('.pg-overlay');state.plane.style.zIndex=overlay?String((Number(getComputedStyle(overlay).zIndex)||50)-1):'999';
    }
    sync(card);clearTimeout(state.timer);state.timer=setTimeout(()=>sync(card),240);
  }
  window.addEventListener('resize',()=>active.forEach(sync),{passive:true});
  window.ScholarGlass={watch,show,hide,sync};
})();
