(() => {
  'use strict';
  const nav=document.getElementById('scholar-game-tabs');
  if(!nav)return;
  const games=['wordle','crossword','sudoku'].map(id=>document.getElementById('game-tab-'+id));
  const portrait=matchMedia('(orientation: portrait)');
  const button=document.createElement('button');
  button.type='button';button.className='sg-tab sg-games-button';button.dataset.gameGroup='';
  button.id='game-group-button';button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','game-group-menu');
  button.append(games[0].querySelector('svg').cloneNode(true),document.createTextNode('遊戲 ▾'));
  nav.insertBefore(button,games[0]);
  const menu=document.createElement('div');menu.id='game-group-menu';menu.className='sg-games-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','遊戲');
  nav.parentElement.append(menu);
  const items=games.map(tab=>{
    const item=document.createElement('button');item.type='button';item.setAttribute('role','menuitemradio');item.setAttribute('aria-label',tab.textContent.trim());item.tabIndex=-1;
    item.append(tab.querySelector('svg').cloneNode(true),document.createTextNode(tab.textContent.trim()));
    item.addEventListener('click',()=>{tab.click();close();button.focus({preventScroll:true});});menu.append(item);return item;
  });
  function close(){menu.hidden=true;button.setAttribute('aria-expanded','false');}
  function open(last=false){menu.hidden=false;button.setAttribute('aria-expanded','true');const selected=items.find(item=>item.getAttribute('aria-checked')==='true');(last?items.at(-1):selected||items[0]).focus({preventScroll:true});}
  function sync(){
    const active=games.find(tab=>tab.getAttribute('aria-selected')==='true');
    button.dataset.active=String(portrait.matches&&Boolean(active));
    button.setAttribute('aria-label',active?'遊戲：'+active.textContent.trim():'遊戲');
    items.forEach((item,i)=>item.setAttribute('aria-checked',games[i]===active?'true':'false'));
  }
  function layout(){
    const focused=document.activeElement;
    games.forEach(tab=>{tab.hidden=portrait.matches;});button.hidden=!portrait.matches;close();sync();
    if(portrait.matches&&games.includes(focused))button.focus({preventScroll:true});
    if(!portrait.matches&&(focused===button||menu.contains(focused)))(games.find(tab=>tab.getAttribute('aria-selected')==='true')||games[0]).focus({preventScroll:true});
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
  portrait.addEventListener('change',layout);layout();
})();
