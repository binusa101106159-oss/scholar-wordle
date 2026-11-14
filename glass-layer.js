/* A separate blur surface shares the sheet's transform/opacity timeline.
   Table content scrolls independently; no filter values animate. */
(() => {
  'use strict';
  const layers=new WeakMap(),active=new Set();
  function sync(card,force=false){
    const state=layers.get(card);if(!state||state.hidden)return;
    // getBoundingClientRect includes animated transforms. Measuring it during
    // motion and applying that transform again made the glass wobble/flash.
    if(!force&&state.motion&&!['finished','idle'].includes(state.motion.playState))return;
    const r=card.getBoundingClientRect();
    Object.assign(state.plane.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',borderRadius:getComputedStyle(card).borderRadius});
  }
  function hide(card){
    const state=layers.get(card);if(!state||state.hidden)return;
    state.hidden=true;active.delete(card);
    if(state.motion)state.motion.cancel();state.motion=null;
    state.plane.remove();
  }
  function cancel(card){
    const state=layers.get(card);if(!state)return;
    if(state.motion)state.motion.cancel();state.motion=null;
  }
  function watch(card){
    if(layers.has(card))return;
    const plane=document.createElement('div');plane.className='pg-glass-plane';plane.setAttribute('aria-hidden','true');plane.inert=true;
    const state={plane,hidden:true,motion:null,frame:0};layers.set(card,state);
    const schedule=()=>{if(!state.hidden&&!state.frame)state.frame=requestAnimationFrame(()=>{state.frame=0;sync(card);});};
    new ResizeObserver(schedule).observe(card);
    // Selection and table subtree changes must never restart the optical layer.
    new MutationObserver(schedule).observe(card,{attributes:true,attributeFilter:['style','class']});
    if(card instanceof HTMLDialogElement){
      card.addEventListener('toggle',()=>card.open?show(card):hide(card));
      card.addEventListener('close',()=>{if(!card.open)hide(card);});
    }
  }
  function show(card){
    watch(card);const state=layers.get(card);
    if(!state.hidden){sync(card);return;}
    state.hidden=false;document.body.append(state.plane);active.add(card);
    const overlay=card.closest('.pg-overlay');state.plane.style.zIndex=overlay?String((Number(getComputedStyle(overlay).zIndex)||50)-1):'999';
    sync(card,true);
  }
  function animate(card,frames,options){
    const state=layers.get(card);if(!state||state.hidden)return;
    if(state.motion)state.motion.cancel();
    const motion=state.plane.animate(frames,options);state.motion=motion;
    motion.finished.then(()=>{
      if(state.motion!==motion||options.fill==='forwards')return;
      state.motion=null;sync(card);
    },()=>{});
  }
  window.addEventListener('resize',()=>active.forEach(card=>sync(card)),{passive:true});
  window.ScholarGlass={watch,show,hide,sync,animate,cancel};
})();
