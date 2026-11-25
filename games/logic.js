/* Pure rules for the mini games. Quiz content comes only from the site's own data files
 * (iarc/data.json, laws/index.json + laws/text, guides/index.json); nothing is written here.
 */
((root)=>{
 'use strict';
 // Small seeded generator so tests can replay a game exactly.
 function rng(seed=Date.now()){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
 const pick=(list,rand)=>list[Math.floor(rand()*list.length)];
 function shuffle(list,rand){const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
 function sample(list,n,rand){return shuffle(list,rand).slice(0,n);}

 /* ---------- 2048 ---------- */
 function slideLine(line){
  const tiles=line.filter(Boolean),out=[];let gained=0;
  for(let i=0;i<tiles.length;i++){
   if(tiles[i]===tiles[i+1]){out.push(tiles[i]*2);gained+=tiles[i]*2;i++;}else out.push(tiles[i]);
  }
  while(out.length<line.length)out.push(0);
  return {line:out,gained,moved:out.some((v,i)=>v!==line[i])};
 }
 const LINES={
  left:Array.from({length:4},(_,r)=>[0,1,2,3].map(c=>r*4+c)),
  right:Array.from({length:4},(_,r)=>[3,2,1,0].map(c=>r*4+c)),
  up:Array.from({length:4},(_,c)=>[0,1,2,3].map(r=>r*4+c)),
  down:Array.from({length:4},(_,c)=>[3,2,1,0].map(r=>r*4+c))
 };
 function move2048(board,dir){
  const next=board.slice();let gained=0,moved=false;
  for(const idx of LINES[dir]){const r=slideLine(idx.map(i=>board[i]));r.line.forEach((v,k)=>{next[idx[k]]=v;});gained+=r.gained;moved=moved||r.moved;}
  return {board:next,gained,moved};
 }
 function spawn2048(board,rand){
  const empty=board.map((v,i)=>v?null:i).filter(i=>i!==null);if(!empty.length)return board;
  const next=board.slice();next[pick(empty,rand)]=rand()<0.9?2:4;return next;
 }
 function new2048(rand){return spawn2048(spawn2048(Array(16).fill(0),rand),rand);}
 const canMove2048=board=>Object.keys(LINES).some(dir=>move2048(board,dir).moved);

 /* ---------- Minesweeper ---------- */
 const MINE_LEVELS={easy:{label:'初級',rows:9,cols:9,mines:10},medium:{label:'中級',rows:16,cols:16,mines:40}};
 function neighbors(i,rows,cols){
  const r=Math.floor(i/cols),c=i%cols,out=[];
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const rr=r+dr,cc=c+dc;if(rr>=0&&rr<rows&&cc>=0&&cc<cols)out.push(rr*cols+cc);}
  return out;
 }
 // Mines are laid after the first click so the first cell and its neighbours are always safe.
 function layMines(rows,cols,count,safe,rand){
  const banned=new Set([safe,...neighbors(safe,rows,cols)]);
  const spots=Array.from({length:rows*cols},(_,i)=>i).filter(i=>!banned.has(i));
  const mines=Array(rows*cols).fill(false);sample(spots,count,rand).forEach(i=>{mines[i]=true;});
  return mines;
 }
 const countAround=(mines,i,rows,cols)=>neighbors(i,rows,cols).filter(j=>mines[j]).length;
 function revealCells(game,start){
  const {rows,cols,mines,open,flags}=game,opened=[];
  if(open[start]||flags[start])return {opened,hit:false};
  if(mines[start]){open[start]=true;return {opened:[start],hit:true};}
  const stack=[start];
  while(stack.length){
   const i=stack.pop();if(open[i]||flags[i])continue;open[i]=true;opened.push(i);
   if(countAround(mines,i,rows,cols)===0)neighbors(i,rows,cols).forEach(j=>{if(!open[j]&&!mines[j])stack.push(j);});
  }
  return {opened,hit:false};
 }
 // Clicking an opened number whose flags are all placed opens the rest of its neighbours.
 function chord(game,i){
  const {rows,cols,mines,open,flags}=game;if(!open[i])return {opened:[],hit:false};
  const around=neighbors(i,rows,cols);if(around.filter(j=>flags[j]).length!==countAround(mines,i,rows,cols))return {opened:[],hit:false};
  const result={opened:[],hit:false};
  for(const j of around){const r=revealCells(game,j);result.opened.push(...r.opened);result.hit=result.hit||r.hit;}
  return result;
 }
 const minesWon=game=>game.mines.every((m,i)=>m||game.open[i]);

 /* ---------- IARC 分級 ---------- */
 const IARC_GROUPS=['1','2A','2B','3'];
 // Draw the group first, then an agent in it, so each answer is equally likely.
 function iarcQuestion(entries,rand,given=null){
  if(given)return {entry:given,answer:given.group,choices:IARC_GROUPS};
  const group=pick(IARC_GROUPS,rand),pool=entries.filter(e=>e.group===group&&!e.parent);
  return {entry:pick(pool,rand),answer:group,choices:IARC_GROUPS};
 }

 /* ---------- 法規條次 ---------- */
 function lawArticles(law){
  const out=[];
  for(const item of law.items||[]){
   if(item.t!=='art')continue;
   const lines=item.paras.flatMap(p=>p.lines);
   if(lines.some(l=>typeof l.text!=='string'))continue; // tables and formulas are not shown as plain text
   const text=lines.map(l=>l.text).join('\n').trim();
   if(text.length<20||/^（刪除）$/.test(text))continue;
   out.push({law:law.id,lawName:law.name,no:item.no,text});
  }
  return out;
 }
 const articleLabel=a=>'《'+a.lawName+'》第 '+a.no+' 條';
 // mode 'text': show the article, choose law + number. mode 'label': show law + number, choose the article.
 function lawQuestion(articles,mode,rand,given=null){
  const answer=given||pick(articles,rand),key=a=>a.law+'#'+a.no;
  const sameLaw=articles.filter(a=>a.law===answer.law&&key(a)!==key(answer)),other=articles.filter(a=>a.law!==answer.law);
  const wrong=[];
  // One distractor from the same law keeps the number in play; the rest come from other laws when possible.
  if(sameLaw.length)wrong.push(pick(sameLaw,rand));
  for(const a of shuffle(other.length>=3?other:articles.filter(a=>key(a)!==key(answer)),rand)){if(wrong.length>=3)break;if(!wrong.some(w=>key(w)===key(a))&&key(a)!==key(answer)&&!wrong.some(w=>w.text===a.text)&&a.text!==answer.text)wrong.push(a);}
  return {mode,answer,choices:shuffle([answer,...wrong],rand)};
 }

 /* ---------- 職醫 Connections ---------- */
 const GUIDE_GROUPS={e:'人因性危害',c:'化學性危害',p:'物理性危害',b:'生物性危害',plans:'預防計畫指引'};
 const shortGuide=name=>name.replace(/\s*\(修訂版\)$/,'').replace(/認定參考指引$/,'').replace(/之$/,'').trim();
 // Candidate groups: guides by hazard category, annex titles by law, IARC agents by group.
 function connectionGroups(data){
  const groups=[];
  if(data.guides){
   const names=new Map();
   data.guides.guides.forEach(g=>{const s=shortGuide(g.name);names.set(s,(names.get(s)||new Set()).add(g.cat));});
   for(const [cat,label] of Object.entries(GUIDE_GROUPS)){
    const items=[...new Set(data.guides.guides.filter(g=>g.cat===cat).map(g=>shortGuide(g.name)))].filter(s=>names.get(s).size===1&&s.length<=22);
    if(items.length>=4)groups.push({theme:'guide-law',label:'指引分類：'+label,items});
   }
  }
  if(data.laws){
   const titles=new Map();
   data.laws.laws.forEach(l=>l.annexes.forEach(a=>titles.set(a.title,(titles.get(a.title)||new Set()).add(l.id))));
   for(const law of data.laws.laws){
    const items=[...new Set(law.annexes.map(a=>a.title))].filter(t=>titles.get(t).size===1&&t.length<=24);
    if(items.length>=4)groups.push({theme:'guide-law',label:'《'+law.name+'》附表',items});
   }
  }
  if(data.iarc){
   for(const group of IARC_GROUPS){
    const items=[...new Set(data.iarc.entries.filter(e=>e.group===group&&!e.parent).map(e=>e.text))].filter(t=>t.length<=26);
    groups.push({theme:'iarc',label:'IARC Group '+group,items});
   }
  }
  return groups;
 }
 function connectionsPuzzle(groups,theme,rand){
  const pool=groups.filter(g=>g.theme===theme);
  if(pool.length<4)throw Error('題庫不足');
  const chosen=[],used=new Set();
  for(const g of shuffle(pool,rand)){
   if(chosen.length===4)break;
   const items=sample(g.items.filter(t=>!used.has(t)),4,rand);if(items.length<4)continue;
   items.forEach(t=>used.add(t));chosen.push({label:g.label,items});
  }
  if(chosen.length<4)throw Error('題庫不足');
  return {theme,groups:chosen,tiles:shuffle(chosen.flatMap((g,gi)=>g.items.map(text=>({text,group:gi}))),rand)};
 }
 // Returns the matched group index, or how many of the guess share the most common group.
 function checkGuess(puzzle,texts){
  const groups=texts.map(t=>puzzle.tiles.find(x=>x.text===t).group),count=new Map();
  groups.forEach(g=>count.set(g,(count.get(g)||0)+1));
  const best=Math.max(...count.values());
  return best===4?{correct:true,group:groups[0]}:{correct:false,oneAway:best===3};
 }

 /* ---------- 條文填空 ---------- */
 const NUM='[〇零一二三四五六七八九十百千兩0-9０-９]';
 const CLOZE=new RegExp('(?:百分之|千分之)'+NUM+'+|'+NUM+'+分之'+NUM+'+|(?<!第)'+NUM+'+(?:個月|年|日|天|小時|分鐘|星期|週|歲|人|次|公斤|公尺|分貝|倍)','g');
 // Numbers with units (期限、人數、比例…) are what gets blanked; dates such as 一百十五年六月 are skipped.
 function clozeBlanks(text){
  const out=[];CLOZE.lastIndex=0;let m;
  while((m=CLOZE.exec(text))){
   const value=m[0],after=text.slice(m.index+value.length,m.index+value.length+4),before=text.slice(Math.max(0,m.index-4),m.index);
   if(/年$/.test(value)&&new RegExp('^'+NUM+'*月').test(after))continue;
   if(/日$/.test(value)&&new RegExp('月'+NUM+'*$').test(before))continue;
   if(/月$/.test(before)&&/日$/.test(value))continue;
   const unit=value.startsWith('百分之')?'百分之':value.startsWith('千分之')?'千分之':value.includes('分之')?'分之':value.replace(new RegExp(NUM,'g'),'');
   out.push({start:m.index,end:m.index+value.length,text:value,unit});
  }
  return out;
 }
 function clozeIndex(articles){
  const byUnit=new Map(),items=[];
  for(const a of articles)for(const b of clozeBlanks(a.text)){items.push({article:a,blank:b});(byUnit.get(b.unit)||byUnit.set(b.unit,new Set()).get(b.unit)).add(b.text);}
  return {items,byUnit};
 }
 // Distractors are other values with the same unit found elsewhere in the same set of laws.
 function clozeQuestion(index,rand,given=null){
  const usable=index.items.filter(x=>index.byUnit.get(x.blank.unit).size>=4);
  const item=given||pick(usable,rand);if(!item)return null;
  const wrong=sample([...index.byUnit.get(item.blank.unit)].filter(t=>t!==item.blank.text),3,rand);
  if(wrong.length<3)return null;
  return {article:item.article,blank:item.blank,answer:item.blank.text,choices:shuffle([item.blank.text,...wrong],rand)};
 }
 const clozeKey=(a,b)=>a.law+'#'+a.no+'#'+b.start;

 /* ---------- 錯題本 ---------- */
 function addMistake(list,game,key){const next=(list||[]).filter(m=>!(m.g===game&&m.k===key));const old=(list||[]).find(m=>m.g===game&&m.k===key);next.unshift({g:game,k:key,n:(old?.n||0)+1});return next.slice(0,300);}
 const dropMistake=(list,game,key)=>(list||[]).filter(m=>!(m.g===game&&m.k===key));

 /* ---------- 每日一題 ---------- */
 const taipeiDate=(now=new Date())=>now.toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'});
 function dateSeed(date){let h=2166136261;for(const ch of 'scholar-daily-'+date){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
 function previousDate(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
 // A day counts once all of its questions are answered; streak continues only from yesterday.
 function completeDay(state,date){
  const s={...state};if(s.done===date)return s;
  s.streak=s.done===previousDate(date)?(s.streak||0)+1:1;s.best=Math.max(s.best||0,s.streak);s.done=date;return s;
 }

 const api={rng,shuffle,slideLine,move2048,spawn2048,new2048,canMove2048,MINE_LEVELS,neighbors,layMines,countAround,revealCells,chord,minesWon,IARC_GROUPS,iarcQuestion,lawArticles,articleLabel,lawQuestion,shortGuide,connectionGroups,connectionsPuzzle,checkGuess,clozeBlanks,clozeIndex,clozeQuestion,clozeKey,addMistake,dropMistake,taipeiDate,dateSeed,previousDate,completeDay};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.ScholarGameLogic=api;
})(typeof window==='undefined'?globalThis:window);
