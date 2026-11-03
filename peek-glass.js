/* Shared lightweight glass motion for existing non-AMA popups. */
(() => {
  'use strict';
  const states=new WeakMap(),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frames=Array.from({length:37},(_,i)=>{
    const t=i/36,p=(1-(1+9*t)*Math.exp(-9*t))/(1-10*Math.exp(-9));
    const f=Math.min(1,t/.34);
    return {offset:t,opacity:f*f*(3-2*f),transform:`translateY(${8*(1-p)}px) scale(${.9+.1*p})`};
  });
  const gleams=new WeakMap(),finePointer=matchMedia('(hover:hover) and (pointer:fine)');
  let reflectionFrame=0,pointerSample=null;
  function glass(card) {
    if(gleams.has(card))return;
    card.classList.add('lg-surface');
    const gleam=document.createElement('span');gleam.className='lg-gleam';gleam.setAttribute('aria-hidden','true');card.append(gleam);gleams.set(card,gleam);
  }
  // Move one small, pre-painted reflection rather than repainting a gradient or
  // propagating changing custom properties through thousands of table glyphs.
  document.addEventListener('pointermove',event=>{
    if(event.pointerType!=='mouse'||!finePointer.matches||reduced())return;
    const card=event.target.closest?.('.lg-surface');
    if(!card||!gleams.has(card))return;
    pointerSample={card,x:event.clientX,y:event.clientY};
    if(reflectionFrame)return;
    reflectionFrame=requestAnimationFrame(()=>{
      reflectionFrame=0;const sample=pointerSample;
      if(!sample.card.isConnected)return;
      const rect=sample.card.getBoundingClientRect(),gleam=gleams.get(sample.card);
      gleam.style.transform=`translate3d(${Math.max(0,Math.min(rect.width,sample.x-rect.left))}px,${Math.max(0,Math.min(30,(sample.y-rect.top)*.08))}px,0)`;
    });
  },{passive:true});
  document.addEventListener('pointerout',event=>{
    const card=event.target.closest?.('.lg-surface');
    if(!card||card.contains(event.relatedTarget)||!gleams.has(card))return;
    gleams.get(card).style.transform='';
  },{passive:true});
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
    if(reduced())return;
    el.classList.add('pg-moving');
    const motion=card.animate(frames,{duration:520,easing:'linear'});s.motion=motion;
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
      const motion=card.animate([start,{opacity:0,transform:'translateY(8px) scale(.985)'}],{duration:340,easing:'cubic-bezier(.25,.1,.25,1)',fill:'forwards'});s.motion=motion;
      try{await motion.finished;}catch(_){return false;}
    }
    if(s.native)el.close();else{el.classList.add('hidden');el.classList.remove('flex');}
    if(s.motion)s.motion.cancel();s.motion=null;s.closing=false;
    el.classList.remove('pg-closing','pg-moving');return true;
  }
  function liquidTabs(nav) {
    if(!nav)return;
    nav.classList.add('lg-tab-track');
    const lens=document.createElement('span');lens.className='lg-tab-lens';lens.setAttribute('aria-hidden','true');nav.append(lens);
    let selected=null,motion=null,ready=false,frame=0;
    function sync(animate) {
      const next=nav.querySelector('[role="tab"][aria-selected="true"]');
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
      const unionX=Math.min(oldX,x),unionRight=Math.max(oldX+oldWidth,x+rect.width),direction=x+rect.width/2>=oldX+oldWidth/2?1:-1;
      const shape=(left,width,sy=1)=>`translateX(${left-x}px) scale(${width/rect.width},${sy})`;
      const frames=[
        {offset:0,transform:shape(oldX,oldWidth,before.height/rect.height),easing:'cubic-bezier(.3,.1,.25,1)'},
        {offset:.38,transform:shape(unionX,unionRight-unionX,.82),easing:'cubic-bezier(.22,.65,.2,1)'},
        {offset:.86,transform:shape(x-direction*3,rect.width+6,1.025),easing:'ease-out'},
        {offset:1,transform:'none'}
      ];
      lens.classList.add('lg-flowing');const flow=lens.animate(frames,{duration:620,easing:'linear'});motion=flow;
      flow.finished.then(()=>{if(motion===flow){motion=null;lens.classList.remove('lg-flowing');}},()=>{});
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;sync(true);});};
    new MutationObserver(schedule).observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-selected','hidden']});
    const resize=new ResizeObserver(()=>sync(false));resize.observe(nav);nav.querySelectorAll('[role="tab"]').forEach(tab=>resize.observe(tab));
    reducedMotion.addEventListener('change',()=>sync(false));
    sync(false);requestAnimationFrame(()=>{sync(false);ready=true;});
  }
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  liquidTabs(document.getElementById('scholar-game-tabs'));
  liquidTabs(document.getElementById('study-nav'));
  window.ScholarPeek={open,close,glass};
})();
