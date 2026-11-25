const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../games/logic.js');

test('2048 slides and merges each pair once, in the move direction',()=>{
 assert.deepEqual(L.slideLine([2,2,2,2]).line,[4,4,0,0]);
 assert.deepEqual(L.slideLine([2,2,4,0]).line,[4,4,0,0]);
 assert.deepEqual(L.slideLine([4,0,0,4]),{line:[8,0,0,0],gained:8,moved:true});
 assert.equal(L.slideLine([2,4,8,16]).moved,false);
 const b=[2,0,0,2, 0,0,0,0, 0,0,0,0, 0,0,0,0];
 assert.deepEqual(L.move2048(b,'right').board.slice(0,4),[0,0,0,4]);
 assert.deepEqual(L.move2048(b,'down').board.filter(Boolean),[2,2]);assert.equal(L.move2048(b,'down').board[12],2);
 const full=[2,4,2,4, 4,2,4,2, 2,4,2,4, 4,2,4,2];assert.equal(L.canMove2048(full),false);full[1]=2;assert.equal(L.canMove2048(full),true);
 const start=L.new2048(L.rng(1));assert.equal(start.filter(Boolean).length,2);assert.ok(start.filter(Boolean).every(v=>v===2||v===4));
});

test('minesweeper keeps the first click and its neighbours safe, floods empty areas and chords on flags',()=>{
 const {rows,cols,mines:count}=L.MINE_LEVELS.easy;
 for(let seed=1;seed<30;seed++){const m=L.layMines(rows,cols,count,40,L.rng(seed));assert.equal(m.filter(Boolean).length,count);for(const i of [40,...L.neighbors(40,rows,cols)])assert.equal(m[i],false);}
 assert.deepEqual(L.neighbors(0,9,9).sort((a,b)=>a-b),[1,9,10]);
 // 3x3 board, one mine in the corner.
 const g={rows:3,cols:3,mines:[true,false,false,false,false,false,false,false,false],open:Array(9).fill(false),flags:Array(9).fill(false)};
 const r=L.revealCells(g,8);assert.equal(r.hit,false);assert.equal(g.open.filter(Boolean).length,8);assert.equal(L.minesWon(g),true);
 const h={rows:3,cols:3,mines:[true,false,false,false,false,false,false,false,true],open:Array(9).fill(false),flags:Array(9).fill(false)};
 L.revealCells(h,4);assert.equal(L.countAround(h.mines,4,3,3),2);assert.deepEqual(L.chord(h,4).opened,[]);
 h.flags[0]=true;h.flags[8]=true;const c=L.chord(h,4);assert.equal(c.hit,false);assert.equal(L.minesWon(h),true);
 h.open[2]=false;h.flags[8]=false;h.flags[2]=true;assert.equal(L.chord(h,4).hit,true);
});

test('IARC questions use the site data and spread answers evenly across the four groups',()=>{
 const data=require('../iarc/data.json'),rand=L.rng(7),seen={};
 for(let i=0;i<400;i++){const q=L.iarcQuestion(data.entries,rand);assert.equal(q.entry.group,q.answer);assert.ok(data.entries.includes(q.entry));seen[q.answer]=(seen[q.answer]||0)+1;}
 for(const g of L.IARC_GROUPS)assert.ok(seen[g]>60,g+' '+seen[g]);
});

test('law questions come from article text in the law reader, skipping deleted and table articles',()=>{
 const index=require('../laws/index.json');
 const articles=index.laws.filter(l=>l.tier==='S').flatMap(l=>L.lawArticles(require('../laws/text/'+l.id+'.json')));
 assert.ok(articles.length>300);assert.ok(articles.every(a=>a.text.length>=20&&a.text!=='（刪除）'));
 const a2=articles.find(a=>a.law==='s01'&&a.no==='2');assert.ok(a2.text.startsWith('本規則用詞，定義如下：\n一、特別危害健康作業'));
 assert.equal(L.articleLabel(a2),'《勞工健康保護規則》第 2 條');
 const rand=L.rng(11);
 for(let i=0;i<200;i++){const q=L.lawQuestion(articles,i%2?'label':'text',rand),keys=q.choices.map(a=>a.law+'#'+a.no);
  assert.equal(q.choices.length,4);assert.equal(new Set(keys).size,4);assert.equal(new Set(q.choices.map(a=>a.text)).size,4);assert.ok(q.choices.includes(q.answer));
  assert.ok(q.choices.filter(a=>a.law===q.answer.law).length>=2||articles.filter(a=>a.law===q.answer.law).length===1);}
});

test('Connections groups never share an item, and each item belongs to exactly one source group',()=>{
 const data={guides:require('../guides/index.json'),laws:require('../laws/index.json'),iarc:require('../iarc/data.json')},groups=L.connectionGroups(data);
 assert.ok(groups.filter(g=>g.theme==='guide-law').length>=8);assert.equal(groups.filter(g=>g.theme==='iarc').length,4);
 for(const theme of ['guide-law','iarc']){
  const owners=new Map();groups.filter(g=>g.theme===theme).forEach((g,i)=>g.items.forEach(t=>owners.set(t,(owners.get(t)||new Set()).add(i))));
  assert.ok([...owners.values()].every(s=>s.size===1),theme+' item in two groups');
 }
 // Guide items are the guide names with only the common suffix removed.
 assert.equal(L.shortGuide('職業性腕隧道症候群認定參考指引'),'職業性腕隧道症候群');
 const names=new Set(data.guides.guides.map(g=>L.shortGuide(g.name)));groups.filter(g=>g.label.startsWith('指引')).forEach(g=>g.items.forEach(t=>assert.ok(names.has(t))));
 const rand=L.rng(5);
 for(let i=0;i<50;i++){
  const p=L.connectionsPuzzle(groups,i%2?'iarc':'guide-law',rand);
  assert.equal(p.tiles.length,16);assert.equal(new Set(p.tiles.map(t=>t.text)).size,16);assert.equal(new Set(p.groups.map(g=>g.label)).size,4);
  const g0=p.groups[0].items;assert.deepEqual(L.checkGuess(p,g0),{correct:true,group:0});
  assert.deepEqual(L.checkGuess(p,[...g0.slice(0,3),p.groups[1].items[0]]),{correct:false,oneAway:true});
  assert.deepEqual(L.checkGuess(p,[...g0.slice(0,2),...p.groups[1].items.slice(0,2)]),{correct:false,oneAway:false});
 }
});

test('cloze blanks numbers with units from article text, skips dates, and offers same-unit choices',()=>{
 assert.deepEqual(L.clozeBlanks('一百十五年六月二十六日修正，自一百十六年七月一日施行，三個月內').map(b=>b.text),['三個月']);
 assert.deepEqual(L.clozeBlanks('第十二條規定，每年一次，達二分之一，百分之五十以上，五十人').map(b=>[b.text,b.unit]),[['一次','次'],['二分之一','分之'],['百分之五十','百分之'],['五十人','人']]);
 const index=require('../laws/index.json'),articles=index.laws.filter(l=>l.tier==='S').flatMap(l=>L.lawArticles(require('../laws/text/'+l.id+'.json')));
 const ci=L.clozeIndex(articles),rand=L.rng(9);assert.ok(ci.items.length>300);
 for(let i=0;i<200;i++){
  const q=L.clozeQuestion(ci,rand);assert.equal(q.article.text.slice(q.blank.start,q.blank.end),q.answer);
  assert.equal(new Set(q.choices).size,4);assert.ok(q.choices.includes(q.answer));
  assert.ok(q.choices.every(c=>ci.byUnit.get(q.blank.unit).has(c)),'choices share the unit');
 }
 const item=ci.items[5];assert.equal(L.clozeQuestion(ci,rand,item).answer,item.blank.text);
});

test('mistake list counts repeats, keeps newest first, and drops a reviewed item',()=>{
 let m=L.addMistake([], 'iarcquiz','official-1');m=L.addMistake(m,'lawmatch','s01#2#text');m=L.addMistake(m,'iarcquiz','official-1');
 assert.deepEqual(m,[{g:'iarcquiz',k:'official-1',n:2},{g:'lawmatch',k:'s01#2#text',n:1}]);
 assert.deepEqual(L.dropMistake(m,'iarcquiz','official-1'),[{g:'lawmatch',k:'s01#2#text',n:1}]);
 let big=[];for(let i=0;i<350;i++)big=L.addMistake(big,'iarcquiz','x'+i);assert.equal(big.length,300);assert.equal(big[0].k,'x349');
});

test('daily questions are fixed by Taipei date and the streak only continues from yesterday',()=>{
 assert.equal(L.taipeiDate(new Date('2026-11-24T16:30:00Z')),'2026-11-25');assert.equal(L.taipeiDate(new Date('2026-11-24T15:30:00Z')),'2026-11-24');
 assert.equal(L.previousDate('2026-03-01'),'2026-02-28');assert.equal(L.previousDate('2027-01-01'),'2026-12-31');
 const data=require('../iarc/data.json'),a=L.iarcQuestion(data.entries,L.rng(L.dateSeed('2026-11-25'))),b=L.iarcQuestion(data.entries,L.rng(L.dateSeed('2026-11-25')));assert.equal(a.entry.id,b.entry.id);
 assert.notEqual(L.dateSeed('2026-11-25'),L.dateSeed('2026-11-26'));
 let s=L.completeDay({},'2026-11-24');assert.deepEqual([s.streak,s.best],[1,1]);
 s=L.completeDay(s,'2026-11-25');assert.deepEqual([s.streak,s.best],[2,2]);assert.equal(L.completeDay(s,'2026-11-25').streak,2);
 s=L.completeDay(s,'2026-11-27');assert.deepEqual([s.streak,s.best],[1,2]);
});
