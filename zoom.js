/* Page zoom (縮小／100%／放大) for phones and tablets, like Safari's page zoom. Stored per device only.
 * The viewport meta is rewritten to a narrower layout width shown at a larger scale, so the page reflows
 * and every vh / innerHeight / popup position stays consistent. Pinch zoom stays off as before.
 * Desktop browsers ignore the viewport meta and have their own ⌘/Ctrl ＋／－, so the control is not shown there. */
(() => {
 'use strict';
 const KEY='scholar-zoom-v1',STEPS=[50,75,85,100,115,125,150,175,200];
 const meta=document.querySelector('meta[name=viewport]');
 if(!meta||!matchMedia('(pointer:coarse)').matches)return;
 const original=meta.getAttribute('content');
 const read=()=>{try{const v=Number(localStorage.getItem(KEY));return STEPS.includes(v)?v:100;}catch(_){return 100;}};
 let level=read();
 // Device width in CSS px for the current orientation (iOS reports screen size in portrait).
 const deviceWidth=()=>{const a=screen.width||innerWidth,b=screen.height||innerHeight;return matchMedia('(orientation: landscape)').matches?Math.max(a,b):Math.min(a,b);};
 function apply(){
  const scale=level/100;document.documentElement.dataset.pageZoom=String(level);
  meta.setAttribute('content',level===100?original:'width='+Math.round(deviceWidth()/scale)+', initial-scale='+scale+', minimum-scale='+scale+', maximum-scale='+scale+', user-scalable=no');
 }
 apply();
 let orientation=matchMedia('(orientation: landscape)').matches;
 addEventListener('resize',()=>{const now=matchMedia('(orientation: landscape)').matches;if(now!==orientation){orientation=now;if(level!==100)apply();}},{passive:true});
 let out,label,inn;
 function set(next){
  level=next;try{level===100?localStorage.removeItem(KEY):localStorage.setItem(KEY,String(level));}catch(_){/* zoom still applies for this visit */}
  apply();render();
 }
 function render(){
  if(!label)return;const i=STEPS.indexOf(level);
  label.textContent=level+'%';label.setAttribute('aria-label','頁面縮放 '+level+'%'+(level===100?'':'，按一下回到 100%'));
  out.disabled=i===0;inn.disabled=i===STEPS.length-1;label.dataset.changed=String(level!==100);
 }
 function mount(){
  const host=document.querySelector('.sg-nav-inner');if(!host||document.getElementById('page-zoom'))return;
  const box=document.createElement('div');box.id='page-zoom';box.className='sg-zoom';box.setAttribute('role','group');box.setAttribute('aria-label','頁面縮放');
  const make=(cls,text,aria)=>{const b=document.createElement('button');b.type='button';b.className='sg-zoom-btn '+cls;b.textContent=text;if(aria)b.setAttribute('aria-label',aria);return b;};
  out=make('sg-zoom-out','A','縮小頁面');label=make('sg-zoom-level','100%');inn=make('sg-zoom-in','A','放大頁面');
  out.onclick=()=>{const i=STEPS.indexOf(level);if(i>0)set(STEPS[i-1]);};
  inn.onclick=()=>{const i=STEPS.indexOf(level);if(i<STEPS.length-1)set(STEPS[i+1]);};
  label.onclick=()=>{if(level!==100)set(100);};
  box.append(out,label,inn);host.prepend(box);render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 addEventListener('storage',e=>{if(e.key===KEY){level=read();apply();render();}});
 window.ScholarZoom={get level(){return level;},set,STEPS};
})();
