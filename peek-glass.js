/* Shared compositor motion for reader dialogs and overlay sheets. */
(() => {
  'use strict';
  const states=new WeakMap(),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OPEN_MS=220,CLOSE_MS=150;
  function glass(card) {if(!card.classList.contains('lg-surface'))card.classList.add('lg-surface');window.ScholarGlass.watch(card);}
  const cardOf=(el,s)=>s.native?el:el.firstElementChild;
  function stop(el,s) {
    if(s.motion)s.motion.cancel();s.motion=null;
    window.ScholarGlass.cancel(cardOf(el,s));
    el.classList.remove('pg-moving','pg-closing');
  }
  function setup(el) {
    if(states.has(el))return states.get(el);
    const native=el instanceof HTMLDialogElement,state={native,motion:null,closing:false};
    el.classList.add(native?'pg-dialog':'pg-overlay');glass(cardOf(el,state));states.set(el,state);
    if(native) {
      el.addEventListener('cancel',e=>{e.preventDefault();close(el);});
      // Native close events are queued. A rapid reopen may already be visible.
      el.addEventListener('close',()=>{if(el.open)return;stop(el,state);state.closing=false;window.ScholarGlass.hide(el);});
    }
    return state;
  }
  function play(el,s,frames,options) {
    const card=cardOf(el,s);el.classList.add('pg-moving');
    // Measure only the final, untransformed sheet, then move both layers with
    // the same compositor animation. Never animate blur or table layout.
    window.ScholarGlass.show(card);window.ScholarGlass.sync(card,true);
    const motion=card.animate(frames,options);s.motion=motion;
    window.ScholarGlass.animate(card,frames,options);
    motion.finished.then(()=>{if(s.motion===motion&&!s.closing){s.motion=null;el.classList.remove('pg-moving');}},()=>{});
    return motion;
  }
  function open(el) {
    const s=setup(el),visible=s.native?el.open:!el.classList.contains('hidden');
    if(visible&&!s.closing)return;
    const card=cardOf(el,s),current=visible?getComputedStyle(card):null;
    const start=current?{opacity:current.opacity,transform:current.transform}:{opacity:0,transform:'translateY(12px) scale(.955)'};
    el.style.setProperty('--pg-glass-start',visible?getComputedStyle(el,s.native?'::backdrop':'::before').opacity:'0');
    s.closing=false;stop(el,s);
    if(s.native){if(!el.open)el.showModal();}
    else{el.classList.remove('hidden');el.classList.add('flex');}
    window.ScholarGlass.show(card);
    if(reduced())return;
    play(el,s,[
      {...start,offset:0,easing:'cubic-bezier(.16,.8,.22,1)'},
      {opacity:1,transform:'translateY(-1px) scale(1.006)',offset:.76,easing:'cubic-bezier(.25,.1,.3,1)'},
      {opacity:1,transform:'none',offset:1}
    ],{duration:OPEN_MS,easing:'linear'});
  }
  function resize(el,before) {
    const s=setup(el);if(!el.open)return open(el);
    const opacity=getComputedStyle(cardOf(el,s)).opacity;
    s.closing=false;stop(el,s);
    const card=cardOf(el,s);window.ScholarGlass.show(card);
    if(reduced())return;
    const after=card.getBoundingClientRect();
    const initial=`translate(${before.left+before.width/2-after.left-after.width/2}px,${before.top+before.height/2-after.top-after.height/2}px) scale(${before.width/after.width},${before.height/after.height})`;
    play(el,s,[{opacity,transform:initial},{opacity:1,transform:'none'}],{duration:200,easing:'cubic-bezier(.16,.8,.22,1)'});
  }
  async function close(el) {
    const s=setup(el);
    if(s.closing||!(s.native?el.open:!el.classList.contains('hidden')))return false;
    const card=cardOf(el,s),style=getComputedStyle(card),start={opacity:style.opacity,transform:style.transform};
    const backdrop=getComputedStyle(el,s.native?'::backdrop':'::before');
    el.style.setProperty('--pg-glass-opacity',backdrop.opacity);
    stop(el,s);s.closing=true;el.classList.add('pg-closing');
    if(!reduced()) {
      const motion=play(el,s,[start,{opacity:0,transform:'translateY(8px) scale(.965)'}],{duration:CLOSE_MS,easing:'cubic-bezier(.4,0,.8,.4)',fill:'forwards'});
      try{await motion.finished;}catch(_){return false;}
      if(!s.closing||s.motion!==motion)return false;
    }
    if(s.native)el.close();else{el.classList.add('hidden');el.classList.remove('flex');}
    window.ScholarGlass.hide(card);stop(el,s);s.closing=false;return true;
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
      // Offset geometry ignores temporary FLIP transforms during tab sorting.
      const x=next.offsetLeft,y=next.offsetTop;
      const before=!lens.hidden&&selected?lens.getBoundingClientRect():null;
      if(motion){motion.cancel();motion=null;}
      if(lens.hidden)lens.hidden=false;lens.style.left=x+'px';lens.style.top=y+'px';lens.style.width=rect.width+'px';lens.style.height=rect.height+'px';
      const changed=next!==selected;selected=next;
      if(!animate||!ready||!changed||!before||reduced()){lens.classList.remove('lg-flowing');return;}
      const oldX=before.left-base+nav.scrollLeft,oldWidth=before.width;
      const distance=x-oldX, direction=Math.sign(distance), travel=Math.abs(distance);
      const stretch=Math.min(rect.width*.26,travel*.18), overshoot=direction*Math.min(8,travel*.035);
      const shape=(left,width,sy=1)=>`translateX(${left-x}px) scale(${width/rect.width},${sy})`;
      // Deform the small glass layer only; labels and page contents stay still.
      const frames=[
        {offset:0,transform:shape(oldX,oldWidth,before.height/rect.height),easing:'cubic-bezier(.3,0,.35,1)'},
        {offset:.28,transform:shape(oldX+distance*.44-(direction<0?stretch:0),oldWidth+(rect.width-oldWidth)*.44+stretch,.91),easing:'cubic-bezier(.16,.65,.24,1)'},
        {offset:.62,transform:shape(x+overshoot,rect.width*.97,1.025),easing:'cubic-bezier(.3,0,.3,1)'},
        {offset:.82,transform:shape(x-overshoot*.25,rect.width*1.012,.992),easing:'cubic-bezier(.2,.6,.25,1)'},
        {offset:1,transform:'none'}
      ];
      lens.classList.add('lg-flowing');
      const flow=lens.animate(frames,{duration:460+Math.min(60,travel*.09),easing:'linear'});motion=flow;
      flow.finished.then(()=>{if(motion===flow){motion=null;lens.classList.remove('lg-flowing');}},()=>{});
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;sync(true);});};
    nav.addEventListener('scholar:taborder',()=>sync(false));
    new MutationObserver(schedule).observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-selected','hidden','data-active']});
    const resize=new ResizeObserver(()=>sync(false));resize.observe(nav);nav.querySelectorAll('[role="tab"],[data-game-group]').forEach(tab=>resize.observe(tab));
    reducedMotion.addEventListener('change',()=>sync(false));
    sync(false);requestAnimationFrame(()=>{sync(false);ready=true;});
  }
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  liquidTabs(document.getElementById('scholar-game-tabs'));
  liquidTabs(document.getElementById('study-nav'));
  window.ScholarPeek={open,close,resize,glass};
})();
