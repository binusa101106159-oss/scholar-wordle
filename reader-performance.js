/* Keep a small, bounded set of detached native table trees for A → B → A. */
(() => {
  'use strict';
  const bodies=new WeakMap(),limit=2,nodeLimit=(navigator.deviceMemory&&navigator.deviceMemory<=4)?10000:25000;
  const recent=new Set();let retained=0;
  function discard(entry){entry.cache.items.delete(entry.key);entry.cache.nodes-=entry.count;retained-=entry.count;recent.delete(entry);}
  function state(body){if(!bodies.has(body))bodies.set(body,{items:new Map(),nodes:0});return bodies.get(body);}
  function release(body){
    const key=body.dataset.renderKey;
    if(!key)return;
    const cache=state(body),count=body.querySelectorAll('*').length;
    delete body.dataset.renderKey;
    if(!count||count>nodeLimit)return;
    const previous=cache.items.get(key);if(previous){discard(previous);}
    const fragment=document.createDocumentFragment();while(body.firstChild)fragment.append(body.firstChild);
    const entry={fragment,count,key,cache};cache.items.set(key,entry);cache.nodes+=count;recent.add(entry);retained+=count;
    while(cache.items.size>limit||cache.nodes>nodeLimit){const oldest=cache.items.keys().next().value;discard(cache.items.get(oldest));}
    while(retained>nodeLimit)discard(recent.values().next().value);
  }
  function restore(body,key){
    if(body.dataset.renderKey===key&&body.childElementCount)return true;
    const cache=state(body),hit=cache.items.get(key);
    if(hit)discard(hit);
    release(body);
    if(!hit)return false;
    body.replaceChildren(hit.fragment);body.dataset.renderKey=key;return true;
  }
  window.ScholarPopupCache={restore,release};
})();

/* Anchor by content, not estimated pixels, when off-screen layout is deferred. */
(() => {
  const tokens=new WeakMap(),bound=new WeakSet();
  function to(sc,el,offset=10,instant=false){
    if(!el||!sc.contains(el))return;
    const token=(tokens.get(sc)||0)+1;tokens.set(sc,token);
    if(!bound.has(sc)){bound.add(sc);for(const event of ['wheel','touchstart','pointerdown','keydown'])sc.addEventListener(event,()=>tokens.set(sc,(tokens.get(sc)||0)+1),{passive:true});}
    const distance=el.getBoundingClientRect().top-sc.getBoundingClientRect().top-offset;
    if(!instant&&Math.abs(distance)<=2500){sc.scrollTo({top:sc.scrollTop+distance,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});return;}
    const align=left=>{
      if(tokens.get(sc)!==token||!el.isConnected)return;
      const previous=sc.style.scrollBehavior;sc.style.scrollBehavior='auto';
      sc.scrollTop+=el.getBoundingClientRect().top-sc.getBoundingClientRect().top-offset;
      sc.style.scrollBehavior=previous;if(left)requestAnimationFrame(()=>align(left-1));
    };
    align(7);
  }
  function capture(sc){
    const r=sc.getBoundingClientRect();
    for(const y of [20,60,120,r.height/2]){
      const el=document.elementFromPoint(r.left+r.width/2,Math.min(r.bottom-2,r.top+y))?.closest('.lx-art[id],.gx-body>[id],.hx-body>[id]');
      if(el&&sc.contains(el))return {id:el.id,offset:el.getBoundingClientRect().top-r.top};
    }
    return null;
  }
  function restore(sc,anchor){const el=anchor&&document.getElementById(anchor.id);if(!el||!sc.contains(el))return false;to(sc,el,anchor.offset,true);return true;}
  window.ScholarReaderScroll={to,capture,restore};
})();
