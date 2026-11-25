/* 小遊戲：2048、踩地雷、IARC 分級、法規條次、職醫 Connections. Rules live in games/logic.js. */
((root)=>{
 'use strict';
 const L=root.ScholarGameLogic,KEY='scholar-minigames-v1',GAMES={g2048:'2048',mines:'踩地雷',iarcquiz:'IARC 分級',lawmatch:'法規條次',connect:'職醫 Connections'};
 const el=(tag,text='',cls='')=>{const n=document.createElement(tag);if(text!=='')n.textContent=text;if(cls)n.className=cls;return n;};
 const btn=(text,cls='mg-btn')=>{const b=el('button',text,cls);b.type='button';return b;};
 function load(){try{return JSON.parse(root.ScholarStorage.getItem(KEY)||'{}')||{};}catch(_){return {};}}
 // Read-modify-write one game's slice so the games never overwrite each other.
 function store(game,value){const all=load();all[game]=value;root.ScholarStorage.setItem(KEY,JSON.stringify(all));}
 let saveTimer=0;const storeSoon=(game,value)=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>store(game,value),800);};
 const cache=new Map();
 const json=url=>{if(!cache.has(url))cache.set(url,fetch(url).then(r=>{if(!r.ok)throw Error('無法載入資料');return r.json();}).catch(e=>{cache.delete(url);throw e;}));return cache.get(url);};
 let panel=null,current=null,stop=null;
 const rand=L.rng(Date.now()^Math.floor(Math.random()*1e9));

 function frame(id){
  const wrap=el('div','','mg-wrap'),head=el('header','','mg-head'),title=el('h1',GAMES[id]),tools=el('div','','mg-tools'),body=el('div','','mg-body'),status=el('p','','mg-status');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');head.append(title,tools);wrap.append(head,body,status);panel.replaceChildren(wrap);return {tools,body,status};
 }

 /* ---------- 2048 ---------- */
 function play2048(){
  const {tools,body,status}=frame('g2048'),saved=load().g2048||{};
  let s=Array.isArray(saved.board)&&saved.board.length===16?{...saved}:{board:L.new2048(rand),score:0,best:saved.best||0,won:false,keep:false,over:false};
  const score=el('span','','mg-pill'),best=el('span','','mg-pill'),again=btn('新遊戲');tools.append(score,best,again);
  const board=el('div','','mg-2048');board.tabIndex=0;board.setAttribute('role','grid');board.setAttribute('aria-label','2048 棋盤，用方向鍵或滑動移動');
  const cells=Array.from({length:16},()=>{const c=el('div','','mg-tile');c.setAttribute('role','gridcell');board.append(c);return c;});
  body.append(board,el('p','方向鍵／WASD 或在棋盤上滑動；相同數字相撞會合併。','mg-hint'));
  function render(){
   cells.forEach((c,i)=>{const v=s.board[i];c.textContent=v||'';c.dataset.v=v?String(Math.min(v,4096)):'0';c.setAttribute('aria-label',v?String(v):'空');});
   score.textContent='分數 '+s.score;best.textContent='最高 '+s.best;
   status.textContent=s.over?'沒有可移動的方向了，遊戲結束。':s.won&&!s.keep?'拼出 2048！可以繼續挑戰更高分。':'';
  }
  function go(dir){
   if(s.over)return;const r=L.move2048(s.board,dir);if(!r.moved)return;
   s.board=L.spawn2048(r.board,rand);s.score+=r.gained;s.best=Math.max(s.best,s.score);
   if(!s.won&&s.board.includes(2048))s.won=true;else if(s.won)s.keep=true;
   s.over=!L.canMove2048(s.board);render();storeSoon('g2048',s);
  }
  again.onclick=()=>{s={board:L.new2048(rand),score:0,best:s.best,won:false,keep:false,over:false};render();store('g2048',s);board.focus({preventScroll:true});};
  const keys={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',a:'left',d:'right',w:'up',s:'down'};
  const onKey=e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.target.closest?.('input,select,textarea,[contenteditable="true"],[role="tablist"],[role="menu"]'))return;const dir=keys[e.key]||keys[e.key.toLowerCase?.()];if(!dir)return;e.preventDefault();go(dir);};
  document.addEventListener('keydown',onKey);
  let start=null;
  board.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY,id:e.pointerId};board.setPointerCapture?.(e.pointerId);});
  board.addEventListener('pointerup',e=>{if(!start||start.id!==e.pointerId)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;go(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));});
  board.addEventListener('pointercancel',()=>{start=null;});
  render();
  return ()=>{document.removeEventListener('keydown',onKey);clearTimeout(saveTimer);store('g2048',s);};
 }

 /* ---------- 踩地雷 ---------- */
 function playMines(){
  const {tools,body,status}=frame('mines');
  const level=el('select');level.setAttribute('aria-label','難度');for(const [k,v] of Object.entries(L.MINE_LEVELS))level.append(new Option(v.label+'（'+v.cols+'×'+v.rows+'，'+v.mines+' 雷）',k));
  level.value=load().minesLevel||'easy';
  const left=el('span','','mg-pill'),clock=el('span','','mg-pill'),flagMode=btn('插旗：關','mg-btn mg-toggle'),again=btn('新局');flagMode.setAttribute('aria-pressed','false');
  tools.append(level,left,clock,flagMode,again);
  const grid=el('div','','mg-mines');grid.setAttribute('role','grid');body.append(grid,el('p','點開格子；右鍵、長按或開「插旗」模式可插旗。點已開的數字可一次開周圍格（旗數需相符）。','mg-hint'));
  let g,timer=0,cells=[];
  function reset(){
   const cfg=L.MINE_LEVELS[level.value];clearInterval(timer);
   g={...cfg,key:level.value,mines:null,open:Array(cfg.rows*cfg.cols).fill(false),flags:Array(cfg.rows*cfg.cols).fill(false),over:false,won:false,start:0,seconds:0};
   grid.style.setProperty('--cols',cfg.cols);grid.replaceChildren();
   cells=Array.from({length:cfg.rows*cfg.cols},(_,i)=>{const c=btn('','mg-cell');c.dataset.i=i;c.setAttribute('aria-label','第 '+(Math.floor(i/cfg.cols)+1)+' 列第 '+(i%cfg.cols+1)+' 行，未開');grid.append(c);return c;});
   status.textContent='';render();
  }
  function render(){
   const {rows,cols}=g;
   cells.forEach((c,i)=>{
    const open=g.open[i],flag=g.flags[i],mine=g.mines&&g.mines[i];let text='',state='未開';
    c.className='mg-cell';
    if(open){c.classList.add('open');if(mine){text='✸';state='地雷';c.classList.add('boom');}else{const n=L.countAround(g.mines,i,rows,cols);text=n?String(n):'';c.dataset.n=n;state=n?n+' 個雷':'空白';}}
    else if(flag){text='⚑';state='已插旗';c.classList.add('flag');if(g.over&&!g.won&&!mine)c.classList.add('wrong');}
    else if(g.over&&mine){text='✸';state='地雷';c.classList.add('mine');}
    c.textContent=text;c.setAttribute('aria-label','第 '+(Math.floor(i/cols)+1)+' 列第 '+(i%cols+1)+' 行，'+state);
   });
   left.textContent='剩餘 '+(L.MINE_LEVELS[g.key].mines-g.flags.filter(Boolean).length)+' 雷';
   clock.textContent=g.seconds+' 秒';
  }
  function finish(won){
   g.over=true;g.won=won;clearInterval(timer);
   const all=load(),best=(all.minesBest||{})[g.key];
   if(won&&(!best||g.seconds<best)){all.minesBest={...(all.minesBest||{}),[g.key]:g.seconds};root.ScholarStorage.setItem(KEY,JSON.stringify(all));}
   const record=(load().minesBest||{})[g.key];
   status.textContent=won?'全部安全格都打開了！用時 '+g.seconds+' 秒'+(record?'（本難度最佳 '+record+' 秒）':'')+'。':'踩到地雷了，按「新局」再來一次。';
  }
  function open(i){
   if(g.over||g.flags[i])return;
   if(!g.mines){g.mines=L.layMines(g.rows,g.cols,L.MINE_LEVELS[g.key].mines,i,rand);g.start=Date.now();timer=setInterval(()=>{g.seconds=Math.floor((Date.now()-g.start)/1000);clock.textContent=g.seconds+' 秒';},1000);}
   const r=g.open[i]?L.chord(g,i):L.revealCells(g,i);
   if(r.hit)finish(false);else if(L.minesWon(g)){g.flags=g.mines.slice();finish(true);}
   render();
  }
  function flag(i){if(g.over||g.open[i])return;g.flags[i]=!g.flags[i];render();}
  grid.addEventListener('click',e=>{const c=e.target.closest('.mg-cell');if(!c||c.dataset.long==='1'){if(c)c.dataset.long='';return;}const i=Number(c.dataset.i);flagMode.getAttribute('aria-pressed')==='true'&&!g.open[i]?flag(i):open(i);});
  grid.addEventListener('contextmenu',e=>{const c=e.target.closest('.mg-cell');if(!c)return;e.preventDefault();flag(Number(c.dataset.i));});
  let press=0;
  grid.addEventListener('pointerdown',e=>{const c=e.target.closest('.mg-cell');if(!c||e.pointerType==='mouse')return;press=setTimeout(()=>{c.dataset.long='1';flag(Number(c.dataset.i));},420);});
  ['pointerup','pointercancel','pointerleave'].forEach(t=>grid.addEventListener(t,()=>clearTimeout(press)));
  flagMode.onclick=()=>{const on=flagMode.getAttribute('aria-pressed')!=='true';flagMode.setAttribute('aria-pressed',String(on));flagMode.textContent='插旗：'+(on?'開':'關');};
  again.onclick=reset;level.onchange=()=>{store('minesLevel',level.value);reset();};
  reset();
  return ()=>clearInterval(timer);
 }

 /* ---------- 共用：選擇題 ---------- */
 function scoreLine(stats){return '答對 '+(stats.right||0)+' / '+(stats.total||0)+'　連續 '+(stats.streak||0)+'　最佳連續 '+(stats.best||0);}
 function record(game,correct){const s=load()[game]||{};s.total=(s.total||0)+1;if(correct){s.right=(s.right||0)+1;s.streak=(s.streak||0)+1;s.best=Math.max(s.best||0,s.streak);}else s.streak=0;store(game,s);return s;}

 /* ---------- IARC 分級 ---------- */
 async function playIarc(){
  const {tools,body,status}=frame('iarcquiz'),stats=el('span',scoreLine(load().iarcquiz||{}),'mg-pill');tools.append(stats);
  body.append(el('p','載入中…','mg-hint'));
  let data;try{data=await json('iarc/data.json');}catch(e){body.replaceChildren(el('p','暫時無法載入 IARC 資料。','mg-hint'));return;}
  const card=el('section','','mg-card'),name=el('p','','mg-question'),meta=el('p','','mg-meta'),choices=el('div','','mg-choices'),result=el('div','','mg-result'),next=btn('下一題','mg-btn mg-primary');
  card.append(el('p','這個物質／暴露的 IARC 分級是？','mg-hint'),name,meta,choices,result,next);
  body.replaceChildren(card,el('p','題目取自本站 IARC 分頁快照（IARC 官方資料，更新於 '+data.lastUpdate+'），各分級出題機率相同。','mg-source'));
  const label={'1':'Group 1','2A':'Group 2A','2B':'Group 2B','3':'Group 3'};
  function ask(){
   const q=L.iarcQuestion(data.entries,rand);name.textContent=q.entry.text;meta.textContent=q.entry.cas?.length?'CAS '+q.entry.cas.join('、'):'';result.replaceChildren();next.hidden=true;status.textContent='';
   choices.replaceChildren(...q.choices.map(c=>{const b=btn(label[c],'mg-choice');b.onclick=()=>{
    const ok=c===q.answer;[...choices.children].forEach((x,i)=>{x.disabled=true;if(q.choices[i]===q.answer)x.classList.add('right');else if(x===b)x.classList.add('wrong');});
    const s=record('iarcquiz',ok);stats.textContent=scoreLine(s);
    result.replaceChildren(el('p',(ok?'答對！':'答錯。')+'正確答案：'+label[q.answer]+'。',ok?'mg-ok':'mg-bad'),el('p',[q.entry.evaluationYear?'評估年份 '+q.entry.evaluationYear:'',q.entry.volume?.length?'Monograph Vol. '+q.entry.volume.join('、'):''].filter(Boolean).join('　'),'mg-meta'));
    status.textContent=ok?'答對':'答錯，正確答案 '+label[q.answer];next.hidden=false;next.focus({preventScroll:true});
   };return b;}));
  }
  next.onclick=ask;ask();
 }

 /* ---------- 法規條次 ---------- */
 async function playLaw(){
  const {tools,body,status}=frame('lawmatch'),saved=load().lawmatch||{};
  const tier=el('select'),mode=el('select'),stats=el('span',scoreLine(saved),'mg-pill');tier.setAttribute('aria-label','法規範圍');mode.setAttribute('aria-label','題型');
  mode.append(new Option('看條文，選法規與條次','text'),new Option('看法規與條次，選條文','label'));mode.value=saved.mode||'text';
  tools.append(tier,mode,stats);body.append(el('p','載入中…','mg-hint'));
  let index;try{index=await json('laws/index.json');}catch(e){body.replaceChildren(el('p','暫時無法載入法規資料。','mg-hint'));return;}
  for(const t of index.tiers)if(index.laws.some(l=>l.tier===t.id))tier.append(new Option(t.id+(t.name?'｜'+t.name:''),t.id));
  tier.append(new Option('全部法規','all'));tier.value=[...tier.options].some(o=>o.value===saved.tier)?saved.tier:'S';
  const card=el('section','','mg-card'),prompt=el('p','','mg-hint'),question=el('div','','mg-question mg-law-text'),choices=el('div','','mg-choices mg-law-choices'),result=el('div','','mg-result'),next=btn('下一題','mg-btn mg-primary');
  card.append(prompt,question,choices,result,next);body.replaceChildren(card,el('p','條文取自本站「法規」分頁收錄的全國法規資料庫內容；含表格或公式的條文與刪除條文不出題。','mg-source'));
  let articles=[];
  async function loadTier(){
   question.textContent='載入中…';choices.replaceChildren();next.hidden=true;
   const laws=index.laws.filter(l=>tier.value==='all'||l.tier===tier.value);
   try{const texts=await Promise.all(laws.map(l=>json('laws/text/'+l.id+'.json')));articles=texts.flatMap(t=>L.lawArticles(t));}catch(e){question.textContent='暫時無法載入條文。';return;}
   ask();
  }
  function persist(){const s=load().lawmatch||{};s.tier=tier.value;s.mode=mode.value;store('lawmatch',s);}
  function ask(){
   if(articles.length<4){question.textContent='這個範圍的條文不足 4 條。';return;}
   const q=L.lawQuestion(articles,mode.value,rand);result.replaceChildren();next.hidden=true;status.textContent='';
   prompt.textContent=q.mode==='text'?'這是哪一部法規的第幾條？':'下列哪一則是這一條的條文？';
   question.textContent=q.mode==='text'?q.answer.text:L.articleLabel(q.answer);
   choices.replaceChildren(...q.choices.map(a=>{
    const b=btn('','mg-choice');if(q.mode==='text')b.textContent=L.articleLabel(a);else{const t=a.text.replace(/\s+/g,' ');b.textContent=t.length>110?t.slice(0,110)+'…':t;}
    b.onclick=()=>{
     const ok=a===q.answer;[...choices.children].forEach((x,i)=>{x.disabled=true;if(q.choices[i]===q.answer)x.classList.add('right');else if(x===b)x.classList.add('wrong');});
     const s=record('lawmatch',ok);persist();stats.textContent=scoreLine(s);
     const detail=el('details');detail.append(el('summary','正確條文：'+L.articleLabel(q.answer)),el('p',q.answer.text,'mg-law-full'));
     result.replaceChildren(el('p',ok?'答對！':'答錯。',ok?'mg-ok':'mg-bad'),detail);if(q.mode==='label'||!ok)detail.open=!ok;
     status.textContent=ok?'答對':'答錯，正確答案 '+L.articleLabel(q.answer);next.hidden=false;next.focus({preventScroll:true});
    };return b;}));
  }
  next.onclick=ask;tier.onchange=()=>{persist();loadTier();};mode.onchange=()=>{persist();ask();};
  loadTier();
 }

 /* ---------- 職醫 Connections ---------- */
 async function playConnect(){
  const {tools,body,status}=frame('connect'),saved=load().connect||{};
  const theme=el('select'),stats=el('span','','mg-pill'),fresh=btn('新題目');theme.setAttribute('aria-label','題庫');
  theme.append(new Option('指引分類＋法規附表','guide-law'),new Option('IARC 分級','iarc'));theme.value=saved.theme||'guide-law';tools.append(theme,stats,fresh);
  body.append(el('p','載入中…','mg-hint'));
  let groups;try{const [guides,laws,iarc]=await Promise.all(['guides/index.json','laws/index.json','iarc/data.json'].map(json));groups=L.connectionGroups({guides,laws,iarc});}catch(e){body.replaceChildren(el('p','暫時無法載入題庫。','mg-hint'));return;}
  const solvedBox=el('div','','mg-solved'),grid=el('div','','mg-connect'),dots=el('p','','mg-meta'),actions=el('div','','mg-actions');
  const shuffle=btn('打亂'),clear=btn('取消選取'),submit=btn('送出','mg-btn mg-primary');actions.append(shuffle,clear,submit);
  body.replaceChildren(el('p','把 16 個項目分成 4 組，每組 4 個；錯 4 次結束。','mg-hint'),solvedBox,grid,dots,actions,el('p','分組依本站資料：指引依「指引」分頁的危害分類；法規附表依所屬法規；IARC 依官方分級。','mg-source'));
  let p,picked,solved,mistakes,done,guesses;
  function showStats(){const s=load().connect||{};stats.textContent='完成 '+(s.won||0)+' / '+(s.played||0);}
  function start(){
   p=L.connectionsPuzzle(groups,theme.value,rand);picked=new Set();solved=[];mistakes=0;done=false;guesses=new Set();status.textContent='';render();
  }
  function finish(won){
   done=true;const s=load().connect||{};s.played=(s.played||0)+1;if(won)s.won=(s.won||0)+1;s.theme=theme.value;store('connect',s);showStats();
   p.groups.forEach((g,i)=>{if(!solved.includes(i))solved.push(i);});status.textContent=won?'全部完成！':'錯 4 次了，答案已全部顯示。';render();
  }
  function render(){
   solvedBox.replaceChildren(...solved.map(gi=>{const row=el('div','','mg-group g'+(solved.indexOf(gi)%4));row.append(el('strong',p.groups[gi].label),el('span',p.groups[gi].items.join('、')));return row;}));
   grid.replaceChildren(...p.tiles.filter(t=>!solved.includes(t.group)).map(t=>{const b=btn(t.text,'mg-tile-word');b.setAttribute('aria-pressed',String(picked.has(t.text)));b.disabled=done;b.onclick=()=>{if(picked.has(t.text))picked.delete(t.text);else if(picked.size<4)picked.add(t.text);render();};return b;}));
   dots.textContent='剩餘錯誤次數：'+'●'.repeat(4-mistakes)+'○'.repeat(mistakes);
   submit.disabled=done||picked.size!==4;clear.disabled=done||!picked.size;shuffle.disabled=done;
  }
  submit.onclick=()=>{
   const guess=[...picked],sig=guess.slice().sort().join('|');
   if(guesses.has(sig)){status.textContent='這組已經猜過了。';return;}guesses.add(sig);
   const r=L.checkGuess(p,guess);
   if(r.correct){solved.push(r.group);picked.clear();status.textContent='答對：'+p.groups[r.group].label;if(solved.length===4)return finish(true);}
   else{mistakes++;status.textContent=r.oneAway?'差一個！':'不對喔。';if(mistakes>=4)return finish(false);}
   render();
  };
  shuffle.onclick=()=>{p.tiles=L.shuffle(p.tiles,rand);render();};clear.onclick=()=>{picked.clear();render();};
  fresh.onclick=start;theme.onchange=()=>{const s=load().connect||{};s.theme=theme.value;store('connect',s);start();};
  showStats();start();
 }

 const PLAY={g2048:play2048,mines:playMines,iarcquiz:playIarc,lawmatch:playLaw,connect:playConnect};
 function show(id){
  panel=document.getElementById('minigames-panel');if(!PLAY[id])id='g2048';
  if(current===id&&panel.firstChild)return;
  hide();current=id;const r=PLAY[id]();stop=typeof r==='function'?r:null;
 }
 function hide(){if(stop)stop();stop=null;current=null;}
 root.ScholarMiniGames={show,hide};
})(window);
