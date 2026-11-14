/* Match edit sheets to the visible viewport when an on-screen keyboard opens. */
(() => {
 const viewport=window.visualViewport;if(!viewport)return;
 let frame=0;
 function update(){frame=0;const root=document.documentElement,editing=document.activeElement?.matches('input,textarea,select'),keyboard=editing&&viewport.scale<=1.05&&innerHeight-viewport.height>120;
  root.toggleAttribute('data-soft-keyboard',Boolean(keyboard));
  if(keyboard){root.style.setProperty('--edit-vh',viewport.height+'px');root.style.setProperty('--edit-top',(viewport.offsetTop+8)+'px');}
 }
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)};
 viewport.addEventListener('resize',schedule,{passive:true});viewport.addEventListener('scroll',schedule,{passive:true});document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);
})();
