(() => {
  'use strict';
  const readers = ['lx-scroll', 'gx-scroll', 'ax-scroll', 'rv-scroll', 'nt-scroll', 'il-scroll'];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'reader-top';
  button.textContent = '↑ 回到頂端';
  button.hidden = true;
  document.body.append(button);
  let target = null, frame = 0;
  function update() {
    frame = 0;
    target = readers.map(id => document.getElementById(id)).find(el => el && el.getClientRects().length) || null;
    if(target?.id==='il-scroll'&&matchMedia('(max-width:760px)').matches)target=document.scrollingElement;
    const hidden = !target || target.scrollTop < 300;
    if (button.hidden !== hidden) button.hidden = hidden;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  button.addEventListener('click', () => {
    update();
    if (!target) return;
    target.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
  document.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'data-game'] });
  update();
})();
