/* Shared lightweight glass motion for existing non-AMA popups. */
(() => {
  'use strict';
  const states=new WeakMap(),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frames=[{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}];
  function glass(card) {if(!card.classList.contains('lg-surface'))card.classList.add('lg-surface');window.ScholarGlass.watch(card);}
  function setup(el) {
    if(states.has(el))return states.get(el);
    const native=el instanceof HTMLDialogElement,state={native,motion:null,closing:false};
    el.classList.add(native?'pg-dialog':'pg-overlay');glass(native?el:el.firstElementChild);states.set(el,state);
    if(native) {
      el.addEventListener('cancel',e=>{e.preventDefault();close(el);});
      el.addEventListener('close',()=>{if(state.motion)state.motion.cancel();state.motion=null;state.closing=false;el.classList.remove('pg-closing','pg-moving');});
    }
    return state;
  }
  function open(el) {
    const s=setup(el),visible=s.native?el.open:!el.classList.contains('hidden');
    if(visible&&!s.closing)return;
    s.closing=false;
    if(s.motion)s.motion.cancel();
    el.classList.remove('pg-closing');
    if(s.native){if(!el.open)el.showModal();}
    else{el.classList.remove('hidden');el.classList.add('flex');}
    const card=s.native?el:el.firstElementChild;
    window.ScholarGlass.show(card);
    if(reduced())return;
    el.classList.add('pg-moving');
    const motion=card.animate(frames,{duration:180,easing:'cubic-bezier(.2,.65,.25,1)'});s.motion=motion;
    motion.finished.then(()=>{if(s.motion===motion)el.classList.remove('pg-moving');},()=>{});
  }
  async function close(el) {
    const s=setup(el);
    if(s.closing||!(s.native?el.open:!el.classList.contains('hidden')))return false;
    s.closing=true;
    const card=s.native?el:el.firstElementChild,style=getComputedStyle(card);
    const start={opacity:style.opacity,transform:style.transform};
    const glass=getComputedStyle(el,s.native?'::backdrop':'::before');
    el.style.setProperty('--pg-glass-opacity',glass.opacity);
    if(s.motion)s.motion.cancel();
    el.classList.add('pg-closing','pg-moving');
    if(!reduced()) {
      const motion=card.animate([start,{opacity:0,transform:'translateY(2px)'}],{duration:120,easing:'cubic-bezier(.25,.1,.25,1)',fill:'forwards'});s.motion=motion;
      try{await motion.finished;}catch(_){return false;}
    }
    if(s.native)el.close();else{el.classList.add('hidden');el.classList.remove('flex');}
    window.ScholarGlass.hide(card);
    if(s.motion)s.motion.cancel();s.motion=null;s.closing=false;
    el.classList.remove('pg-closing','pg-moving');return true;
  }
  function liquidTabs(nav) {
    if(!nav)return;
    nav.classList.add('lg-tab-track');
    const lens=document.createElement('span');lens.className='lg-tab-lens';lens.setAttribute('aria-hidden','true');nav.append(lens);
    let selected=null,motion=null,ready=false,frame=0;
    function sync(animate) {
      const next=nav.querySelector('[data-game-group][data-active="true"]')||nav.querySelector('[role="tab"][aria-selected="true"]');
      if(!next||!nav.getClientRects().length){if(!lens.hidden)lens.hidden=true;return;}
      if(animate&&next===selected&&!lens.hidden)return;
      const track=nav.getBoundingClientRect(),rect=next.getBoundingClientRect(),base=track.left+nav.clientLeft;
      const x=rect.left-base+nav.scrollLeft,y=rect.top-track.top-nav.clientTop+nav.scrollTop;
      const before=!lens.hidden&&selected?lens.getBoundingClientRect():null;
      if(motion){motion.cancel();motion=null;}
      if(lens.hidden)lens.hidden=false;lens.style.left=x+'px';lens.style.top=y+'px';lens.style.width=rect.width+'px';lens.style.height=rect.height+'px';
      const changed=next!==selected;selected=next;
      if(!animate||!ready||!changed||!before||reduced()){lens.classList.remove('lg-flowing');return;}
      const oldX=before.left-base+nav.scrollLeft,oldWidth=before.width;
      const distance=x-oldX,stretch=Math.min(20,Math.abs(distance)*.1);
      const shape=(left,width,sy=1)=>`translateX(${left-x}px) scale(${width/rect.width},${sy})`;
      const frames=[
        {offset:0,transform:shape(oldX,oldWidth,before.height/rect.height)},
        {offset:.65,transform:shape(oldX+distance*.8,oldWidth+(rect.width-oldWidth)*.8+stretch,.98)},
        {offset:1,transform:'none'}
      ];
      const light=matchMedia('(pointer:coarse)').matches||CSS.supports('-moz-appearance','none');
      const steps=light?[{opacity:.45,transform:'none'},{opacity:1,transform:'none'}]:frames;
      lens.classList.add('lg-flowing');const flow=lens.animate(steps,{duration:light?120:220,easing:'cubic-bezier(.2,.65,.25,1)'});motion=flow;
      flow.finished.then(()=>{if(motion===flow){motion=null;lens.classList.remove('lg-flowing');}},()=>{});
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;sync(true);});};
    new MutationObserver(schedule).observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-selected','hidden','data-active']});
    const resize=new ResizeObserver(()=>sync(false));resize.observe(nav);nav.querySelectorAll('[role="tab"],[data-game-group]').forEach(tab=>resize.observe(tab));
    reducedMotion.addEventListener('change',()=>sync(false));
    sync(false);requestAnimationFrame(()=>{sync(false);ready=true;});
  }
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  liquidTabs(document.getElementById('scholar-game-tabs'));
  liquidTabs(document.getElementById('study-nav'));
  window.ScholarPeek={open,close,glass};
})();
