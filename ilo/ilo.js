/* ILO teaching viewer: original JPEGs, interaction-only rendering, source-cited notes. */
((root)=>{
 'use strict';
 const fitPose=(iw,ih,w,h)=>{const s=Math.min(w/iw,h/ih)*.96;return {s,x:(w-iw*s)/2,y:(h-ih*s)/2};};
 const zoomPose=(p,x,y,s)=>({s,x:x-(x-p.x)*s/p.s,y:y-(y-p.y)*s/p.s});
 if(typeof module!=='undefined'&&module.exports)module.exports={fitPose,zoomPose};
 if(typeof document==='undefined')return;
 const STORE='scholar-ilo-v1',by=id=>document.getElementById(id),esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const SOURCE='https://www.ilo.org/resource/other/ilo-international-classification-radiographs-pneumoconioses';
 let pref={};try{pref=JSON.parse(window.ScholarStorage.getItem(STORE))||{};}catch(_){}
 if(typeof pref!=='object'||Array.isArray(pref))pref={};
 const state={promise:null,ready:false,films:[],lessons:[],mode:'learn',lesson:'start',film:'normal-1',other:'pp-11',compare:false,sync:false,group:'all',query:'',quiz:null,score:{seen:0,correct:0}};
 let viewers=[];
 function updateScore(){const results=Object.values(JSON.parse(window.ScholarStorage.getItem('scholar-ilo-results-v1')||'{}'));state.score={seen:results.length,correct:results.filter(r=>r.correct).length};}
 function save(){try{window.ScholarStorage.setItem(STORE,JSON.stringify({film:state.film,other:state.other,lesson:state.lesson,mode:state.mode,score:state.score,quiz:state.quiz,compare:state.compare,sync:state.sync,group:state.group,query:state.query}));}catch(_){} }
 const film=id=>state.films.find(f=>f.id===id)||state.films[0];
 const source=pages=>'<span class="il-cite">2022指引，原書 p.'+esc(pages)+'</span>';
 const options=(items,current)=>items.map(f=>'<option value="'+esc(f.id)+'"'+(f.id===current?' selected':'')+'>'+esc(f.label)+'</option>').join('');
 class Viewer {
  constructor(host,index){
   this.host=host;this.index=index;this.p={x:0,y:0,s:1};this.fit=1;this.points=new Map();this.frame=0;this.seq=0;this.brightness=1;this.contrast=1;this.pristine=true;
   host.innerHTML='<div class="il-view-heading"><h3></h3><span class="il-resolution"></span></div><div class="il-tools" role="group" aria-label="影像工具"><button type="button" data-v="fit">適合視窗</button><button type="button" data-v="minus" aria-label="縮小">−</button><button type="button" data-v="plus" aria-label="放大">＋</button><button type="button" data-v="native">100%</button><button type="button" data-v="reset">重設</button><output class="il-magnification">—</output></div><div class="il-viewport" tabindex="0" role="group" aria-label="影像；拖曳平移、滾輪或雙指縮放"><p class="il-image-status" role="status">選擇影像</p></div><details class="il-adjust"><summary>顯示調整</summary><label>亮度<input type="range" min="50" max="150" value="100" data-adjust="brightness" aria-label="亮度"></label><label>對比<input type="range" min="50" max="200" value="100" data-adjust="contrast" aria-label="對比"></label><small>8-bit JPEG顯示調整；「重設」恢復原圖。</small></details>';
   this.viewport=host.querySelector('.il-viewport');this.status=host.querySelector('.il-image-status');this.heading=host.querySelector('h3');this.resolution=host.querySelector('.il-resolution');this.magnification=host.querySelector('output');
   host.addEventListener('click',e=>{const action=e.target.closest('[data-v]')?.dataset.v;if(!action||!this.image?.naturalWidth)return;const w=this.viewport.clientWidth,h=this.viewport.clientHeight;if(action==='fit'){this.pristine=true;this.resize();}else if(action==='reset'){this.brightness=this.contrast=1;host.querySelectorAll('input').forEach(i=>i.value=100);this.pristine=true;this.resize();}else this.zoom(w/2,h/2,action==='native'?1:this.p.s*(action==='plus'?1.3:1/1.3));});
   host.addEventListener('input',e=>{if(e.target.dataset.adjust){this[e.target.dataset.adjust]=Number(e.target.value)/100;this.schedule();}});
   this.viewport.addEventListener('wheel',e=>{if(!this.image?.naturalWidth)return;e.preventDefault();const r=this.viewport.getBoundingClientRect();this.zoom(e.clientX-r.left,e.clientY-r.top,this.p.s*Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.003));},{passive:false});
   this.viewport.addEventListener('pointerdown',e=>{if(e.button!==0||!this.image?.naturalWidth)return;e.preventDefault();this.viewport.focus({preventScroll:true});this.viewport.setPointerCapture(e.pointerId);this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});this.pristine=false;});
   this.viewport.addEventListener('pointermove',e=>{
    if(!this.points.has(e.pointerId))return;
    const old=[...this.points.values()];this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});const now=[...this.points.values()];
    if(now.length===1){this.p.x+=now[0].x-old[0].x;this.p.y+=now[0].y-old[0].y;}
    else {const r=this.viewport.getBoundingClientRect(),a={x:(old[0].x+old[1].x)/2-r.left,y:(old[0].y+old[1].y)/2-r.top},b={x:(now[0].x+now[1].x)/2-r.left,y:(now[0].y+now[1].y)/2-r.top};const before=Math.hypot(old[1].x-old[0].x,old[1].y-old[0].y),after=Math.hypot(now[1].x-now[0].x,now[1].y-now[0].y);if(before>4)this.p=zoomPose(this.p,a.x,a.y,this.limit(this.p.s*after/before));this.p.x+=b.x-a.x;this.p.y+=b.y-a.y;}
    this.schedule();this.propagate();
   });
   for(const type of ['pointerup','pointercancel','lostpointercapture'])this.viewport.addEventListener(type,e=>this.points.delete(e.pointerId));
   this.viewport.addEventListener('dblclick',e=>{const r=this.viewport.getBoundingClientRect();if(this.p.s/this.fit>1.8){this.pristine=true;this.resize();}else this.zoom(e.clientX-r.left,e.clientY-r.top,this.fit*2);});
   this.viewport.addEventListener('keydown',e=>{if(e.key==='+'||e.key==='='){e.preventDefault();this.zoom(this.viewport.clientWidth/2,this.viewport.clientHeight/2,this.p.s*1.3);}else if(e.key==='-'){e.preventDefault();this.zoom(this.viewport.clientWidth/2,this.viewport.clientHeight/2,this.p.s/1.3);}else if(e.key==='0'){this.pristine=true;this.resize();}else if(e.key.startsWith('Arrow')){e.preventDefault();this.pristine=false;this.p.x+=e.key==='ArrowLeft'?24:e.key==='ArrowRight'?-24:0;this.p.y+=e.key==='ArrowUp'?24:e.key==='ArrowDown'?-24:0;this.schedule();this.propagate();}});
   host.addEventListener('click',()=>this.rememberView());host.addEventListener('input',()=>this.rememberView());this.viewport.addEventListener('keydown',()=>this.rememberView());
   new ResizeObserver(()=>this.resize()).observe(this.viewport);
  }
  rememberView(){
   if(!this.image?.naturalWidth||!this.film||!this.fit)return;
   const id=this.film.id,view={scale:this.p.s/this.fit,cx:(this.viewport.clientWidth/2-this.p.x)/(this.film.width*this.p.s),cy:(this.viewport.clientHeight/2-this.p.y)/(this.film.height*this.p.s),brightness:this.brightness,contrast:this.contrast,pristine:this.pristine};
   clearTimeout(this.persistTimer);this.persistTimer=setTimeout(()=>{
    const all=JSON.parse(window.ScholarStorage.getItem('scholar-ilo-views-v1')||'{}');all[id]=view;
    window.ScholarStorage.setItem('scholar-ilo-views-v1',JSON.stringify(all));
   },250);
  }
  restoreView(){
   const view=JSON.parse(window.ScholarStorage.getItem('scholar-ilo-views-v1')||'{}')[this.film?.id];
   if(!view||!this.image?.naturalWidth||![view.scale,view.cx,view.cy,view.brightness,view.contrast].every(Number.isFinite))return;
   const scale=this.limit(this.fit*view.scale);this.p={s:scale,x:this.viewport.clientWidth/2-view.cx*this.film.width*scale,y:this.viewport.clientHeight/2-view.cy*this.film.height*scale};
   this.pristine=Boolean(view.pristine);this.brightness=view.brightness;this.contrast=view.contrast;
   this.host.querySelectorAll('[data-adjust]').forEach(input=>input.value=this[input.dataset.adjust]*100);this.schedule();
  }
  limit(s){return Math.max(this.fit*.5,Math.min(Math.max(4,this.fit*12),s));}
  zoom(x,y,s){this.pristine=false;this.p=zoomPose(this.p,x,y,this.limit(s));this.schedule();this.propagate();}
  propagate(){
   this.rememberView();
   if(!state.compare||!state.sync)return;const other=viewers[1-this.index];if(!this.film||!other?.film||!other.image?.naturalWidth)return;
   const cx=(this.viewport.clientWidth/2-this.p.x)/(this.film.width*this.p.s),cy=(this.viewport.clientHeight/2-this.p.y)/(this.film.height*this.p.s),s=other.limit(other.fit*this.p.s/this.fit);
   other.pristine=false;other.p={s,x:other.viewport.clientWidth/2-cx*other.film.width*s,y:other.viewport.clientHeight/2-cy*other.film.height*s};other.schedule();other.rememberView();
  }
  resize(){
   if(!this.film||!this.image?.naturalWidth||!this.viewport.clientWidth||!this.viewport.clientHeight)return;
   const next=fitPose(this.film.width,this.film.height,this.viewport.clientWidth,this.viewport.clientHeight);
   if(this.pristine)this.p=next;else if(this.oldWidth&&this.fit){const cx=(this.oldWidth/2-this.p.x)/this.p.s,cy=(this.oldHeight/2-this.p.y)/this.p.s,s=next.s*this.p.s/this.fit;this.p={s,x:this.viewport.clientWidth/2-cx*s,y:this.viewport.clientHeight/2-cy*s};}
   this.fit=next.s;this.oldWidth=this.viewport.clientWidth;this.oldHeight=this.viewport.clientHeight;this.schedule();
  }
  schedule(){if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;if(!this.image?.isConnected)return;this.image.style.transform=`translate3d(${this.p.x}px,${this.p.y}px,0) scale(${this.p.s})`;this.image.style.visibility='visible';const filter=this.brightness===1&&this.contrast===1?'none':`brightness(${this.brightness}) contrast(${this.contrast})`;if(this.image.style.filter!==filter)this.image.style.filter=filter;this.magnification.textContent=Math.round(this.p.s*100)+'%';this.viewport.dataset.zoom=String(this.p.s);});}
  show(data,masked=false){
   this.heading.textContent=masked?'練習影像':data.label;this.resolution.textContent=masked?'':data.width+' × '+data.height;
   if(this.film?.id===data.id&&this.image?.getAttribute('src')){this.image.alt=masked?'ILO練習影像':data.label;return;}
   this.release();this.film=data;this.pristine=true;this.brightness=this.contrast=1;this.host.querySelectorAll('input').forEach(i=>i.value=100);this.status.hidden=false;this.status.textContent='載入原圖…';this.viewport.setAttribute('aria-busy','true');
   const seq=++this.seq,img=new Image();this.image=img;img.className='il-image';img.draggable=false;img.alt=masked?'ILO練習影像':data.label;img.decoding='async';img.style.visibility='hidden';img.style.width=data.width+'px';img.style.height=data.height+'px';
   img.onload=async()=>{try{await img.decode();}catch(_){}if(seq!==this.seq)return;this.status.hidden=true;this.viewport.setAttribute('aria-busy','false');this.resize();this.restoreView();};
   img.onerror=()=>{if(seq!==this.seq)return;this.status.hidden=false;this.status.textContent='影像載入失敗，請按重試。';this.viewport.setAttribute('aria-busy','false');const retry=document.createElement('button');retry.type='button';retry.textContent='重試';retry.onclick=()=>{this.release();this.show(data,masked);};this.status.append(retry);};
   this.viewport.append(img);img.src='ilo/images/'+encodeURIComponent(data.file);
  }
  release(){this.seq++;this.points.clear();if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;if(this.image){this.image.onload=this.image.onerror=null;this.image.removeAttribute('src');this.image.remove();this.image=null;}this.pristine=true;}
 }
 function revealImage(){if(matchMedia('(max-width:760px)').matches)by('ilo-panel').querySelector('.il-image-area').scrollIntoView({block:'start'});}
 function shell(){
  by('ilo-panel').innerHTML='<div class="il-layout"><header class="il-top"><div><p class="il-kicker">ILO · 2022</p><h1>塵肺影像學習</h1></div><div class="il-modes" role="tablist" aria-label="ILO學習模式"><button role="tab" type="button" data-mode="learn" aria-controls="il-scroll">學習指引</button><button role="tab" type="button" data-mode="library" aria-controls="il-scroll">標準片圖庫</button><button role="tab" type="button" data-mode="quiz" aria-controls="il-scroll">閱片練習</button></div></header><div class="il-workspace"><aside id="il-scroll" class="il-sidebar" role="tabpanel" aria-label="學習內容"></aside><section class="il-image-area" aria-label="影像工作區"><div class="il-compare-bar"><label><input id="il-compare" type="checkbox">雙片對照</label><label id="il-sync-label" hidden><input id="il-sync" type="checkbox">同步檢視</label><label id="il-other-label" hidden>對照片<select id="il-other"></select></label><button id="il-fullscreen" type="button">放大工作區</button></div><div id="il-viewers" class="il-viewers"><section id="il-view-a" class="il-view"></section><section id="il-view-b" class="il-view" hidden></section></div><p class="il-help">拖曳平移 · 滾輪／雙指縮放 · 雙擊放大／還原 · 0適合視窗 · ＋／−縮放</p><div id="il-image-info" class="il-info" aria-live="polite"></div><footer class="il-source">ILO 2022 標準JPEG · 教學用途 <a href="'+SOURCE+'" target="_blank" rel="noopener">來源與使用說明</a></footer></section></div></div>';
  viewers=[new Viewer(by('il-view-a'),0),new Viewer(by('il-view-b'),1)];by('il-other').innerHTML=options(state.films,state.other);
  const panel=by('ilo-panel');
  panel.addEventListener('click',e=>{
   const mode=e.target.closest('[data-mode]')?.dataset.mode;if(mode){state.mode=mode;if(mode==='quiz'&&!state.quiz)nextQuiz('small');render();save();return;}
   const lesson=e.target.closest('[data-lesson]')?.dataset.lesson;if(lesson){state.lesson=lesson;renderSidebar();by('il-scroll').scrollTop=0;save();return;}
   const id=e.target.closest('[data-film]')?.dataset.film;if(id){state.film=id;renderSidebar();updateImages();revealImage();save();return;}
   const pair=e.target.closest('[data-pair]')?.dataset.pair;if(pair){const ids=pair.split(',');state.film=ids[0];if(ids[1]){state.other=ids[1];state.compare=true;}render();revealImage();save();return;}
   const action=e.target.closest('[data-quiz]')?.dataset.quiz;if(action==='next'){nextQuiz(state.quiz?.group||'small');render();revealImage();}else if(action==='check')checkQuiz();
  });
  panel.addEventListener('change',e=>{if(e.target.id==='il-compare'){state.compare=e.target.checked;updateImages();}else if(e.target.id==='il-sync'){state.sync=e.target.checked;if(state.sync)viewers[0].propagate();}else if(e.target.id==='il-other'){state.other=e.target.value;updateImages();save();}else if(e.target.id==='il-filter'){state.group=e.target.value;renderSidebar();}else if(e.target.id==='il-quiz-group'){nextQuiz(e.target.value);render();}});
  panel.addEventListener('input',e=>{if(e.target.id==='il-search'){state.query=e.target.value;renderGallery();save();}});
  panel.addEventListener('change',e=>{if(e.target.id.startsWith('il-answer-')&&state.quiz){state.quiz.answer=state.quiz.group==='small'?[by('il-answer-prof').value,by('il-answer-shape').value]:[by('il-answer-large').value];}save();});
  panel.querySelector('.il-modes').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...panel.querySelectorAll('[data-mode]')],i=tabs.indexOf(e.target);const next=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs[(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];next.click();next.focus();});
  by('il-fullscreen').addEventListener('click',async()=>{const area=panel.querySelector('.il-image-area');if(document.fullscreenElement){await document.exitFullscreen();return;}if(area.classList.contains('il-expanded')){area.classList.remove('il-expanded');by('il-fullscreen').textContent='放大工作區';return;}try{if(!area.requestFullscreen)throw Error();await area.requestFullscreen();}catch(_){area.classList.add('il-expanded');by('il-fullscreen').textContent='離開放大';}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){panel.querySelector('.il-image-area').classList.remove('il-expanded');by('il-fullscreen').textContent='放大工作區';}});
  document.addEventListener('fullscreenchange',()=>{by('il-fullscreen').textContent=document.fullscreenElement?'離開放大':'放大工作區';});
 }
 function renderGallery(){
  const q=state.query.toLowerCase().replace(/\s/g,''),items=state.films.filter(f=>(state.group==='all'||f.group===state.group||(state.group==='rounded'&&f.group==='small'&&'pqr'.includes(f.shape[0]))||(state.group==='irregular'&&f.group==='small'&&'stu'.includes(f.shape[0])))&&(f.label+f.file).toLowerCase().replace(/\s/g,'').includes(q));
  by('il-gallery').innerHTML=items.length?items.map(f=>'<button class="il-film'+(state.film===f.id?' il-selected':'')+'" type="button" data-film="'+f.id+'" aria-pressed="'+(state.film===f.id)+'"><img src="ilo/thumbs/'+encodeURIComponent(f.file)+'" alt="" loading="lazy" decoding="async" width="160" height="170"><strong>'+esc(f.label)+'</strong><small>'+f.width+' × '+f.height+'</small></button>').join(''):'<p>找不到符合的標準片。</p>';
 }
 function renderSidebar(){
  const side=by('il-scroll');
  if(state.mode==='library'){
   side.innerHTML='<h2>23張標準片</h2><label class="il-field">搜尋表現／標籤<input id="il-search" type="search" value="'+esc(state.query)+'" placeholder="例如：2/2、q/q、肋膜"></label><label class="il-field">分類<select id="il-filter">'+[['all','全部'],['normal','正常'],['rounded','圓形小陰影'],['irregular','不規則小陰影'],['composite','u/u合成片'],['large','大陰影'],['pleural','肋膜／肋膈角']].map(([v,t])=>'<option value="'+v+'"'+(v===state.group?' selected':'')+'>'+t+'</option>').join('')+'</select></label><div id="il-gallery" class="il-gallery"></div>';renderGallery();return;
  }
  if(state.mode==='quiz'){renderQuiz();return;}
  const lesson=state.lessons.find(l=>l.id===state.lesson)||state.lessons[0];
  side.innerHTML='<nav class="il-lesson-nav" aria-label="指引主題">'+state.lessons.map(l=>'<button type="button" data-lesson="'+l.id+'" aria-current="'+(l.id===lesson.id?'page':'false')+'">'+esc(l.title)+'</button>').join('')+'</nav><article class="il-lesson"><p class="il-eyebrow">中文學習筆記 · 依2022指引整理</p><h2>'+esc(lesson.title)+'</h2><p>'+esc(lesson.intro)+'</p>'+source(lesson.pages)+lesson.points.map(([title,text,pages])=>'<section><h3>'+esc(title)+'</h3><p>'+esc(text)+'</p>'+source(pages)+'</section>').join('')+'<h3>查看標準片</h3><div class="il-examples">'+lesson.examples.map(id=>'<button type="button" data-film="'+id+'">'+esc(film(id).label)+'</button>').join('')+'</div>'+(lesson.examples.length>1?'<button class="il-action" type="button" data-pair="'+lesson.examples.slice(0,2).join(',')+'">前兩張並排對照</button>':'')+'<p class="il-reference"><a href="https://www.ilo.org/publications/guidelines-use-ilo-international-classification-radiographs-pneumoconioses-1" target="_blank" rel="noopener">開啟完整指引來源</a> · 頁碼為原書頁碼。</p></article>';
 }
 function nextQuiz(group){
  const pool=state.films.filter(f=>f.group===group),old=state.quiz?.id;const choices=pool.filter(f=>f.id!==old);const target=choices[Math.floor(Math.random()*choices.length)]||pool[0];
  state.quiz={group,id:target.id,attemptId:crypto.randomUUID(),revealed:false,correct:false};save();
 }
 function renderQuiz(){
  const q=state.quiz;if(!q){nextQuiz('small');return renderQuiz();}
  const target=film(q.id),small=q.group==='small';
  by('il-scroll').innerHTML='<h2>標準片辨識練習</h2><p class="il-muted">先觀察影像，再作答並對照附錄C。部分原圖本身印有分類標記；本練習保留完整原圖，屬引導式練習。</p><label class="il-field">練習主題<select id="il-quiz-group"><option value="small"'+(small?' selected':'')+'>小陰影：15張</option><option value="large"'+(!small?' selected':'')+'>大陰影：3張</option></select></label><p class="il-score">累計 '+state.score.correct+' / '+state.score.seen+' 題符合標準片記錄</p>'+(small?'<label class="il-field">密集度<select id="il-answer-prof"><option value="">請選擇</option>'+['1/1','2/2','3/3'].map(v=>'<option>'+v+'</option>').join('')+'</select></label><label class="il-field">主要／次要形狀大小<select id="il-answer-shape"><option value="">請選擇</option>'+['p/p','q/q','r/r','s/s','t/t','t/s'].map(v=>'<option>'+v+'</option>').join('')+'</select></label>':'<label class="il-field">大陰影類別<select id="il-answer-large"><option value="">請選擇</option>'+['A','B','C'].map(v=>'<option>'+v+'</option>').join('')+'</select></label>')+'<button type="button" class="il-action" data-quiz="check"'+(q.revealed?' disabled':'')+'>核對答案</button><div id="il-feedback" class="il-feedback" role="status">'+(q.revealed?'<strong>'+(q.correct?'與標準片記錄一致':'請對照標準片記錄')+'</strong><p>'+esc(target.label)+'</p>'+source(target.page):'')+'</div><button type="button" class="il-action il-secondary" data-quiz="next">下一題</button><p class="il-muted">練習使用已知標準片，不代表臨床分類能力認證。</p>';
  if(q.answer){const ids=small?['il-answer-prof','il-answer-shape']:['il-answer-large'];ids.forEach((id,i)=>by(id).value=q.answer[i]||'');}
  if(q.revealed){const fields=small?['il-answer-prof','il-answer-shape']:['il-answer-large'];fields.forEach((id,i)=>{by(id).value=q.answer?.[i]||'';by(id).disabled=true;});}
 }
 function checkQuiz(){
  const q=state.quiz;if(!q||q.revealed)return;const f=film(q.id),small=q.group==='small';
  const answer=small?[by('il-answer-prof').value,by('il-answer-shape').value]:[by('il-answer-large').value];
  if(answer.some(v=>!v)){by('il-feedback').textContent='請先選擇所有欄位。';return;}
  q.answer=answer;q.revealed=true;q.correct=small?answer[0]===f.profusion&&answer[1]===f.shape:answer[0]===f.large;const results=JSON.parse(window.ScholarStorage.getItem('scholar-ilo-results-v1')||'{}');q.attemptId||=crypto.randomUUID();results[q.attemptId]||={id:q.attemptId,correct:q.correct};window.ScholarStorage.setItem('scholar-ilo-results-v1',JSON.stringify(results));updateScore();save();renderSidebar();updateImages();
 }
 function updateImages(){
  if(by('ilo-panel').hidden){viewers.forEach(v=>v.release());return;}
  const quiz=state.mode==='quiz',q=state.quiz,primary=film(quiz?q.id:state.film),masked=quiz&&!q.revealed,compare=state.compare&&!quiz;
  by('il-compare').checked=compare;by('il-compare').disabled=quiz;by('il-sync-label').hidden=!compare;by('il-other-label').hidden=!compare;by('il-other').value=state.other;by('il-sync').checked=state.sync;by('il-view-b').hidden=!compare;by('il-viewers').classList.toggle('il-double',compare);
  viewers[0].show(primary,masked);if(compare)viewers[1].show(film(state.other));else viewers[1].release();
  by('il-image-info').innerHTML=masked?'作答後顯示附錄C記錄與來源頁碼；原片內建標記仍會保留。':'<strong>'+esc(primary.label)+'</strong> '+(primary.profusion?'<span>密集度 '+esc(primary.profusion)+'</span> ':'')+(primary.shape?'<span>形狀／大小 '+esc(primary.shape)+'</span> ':'')+(primary.quality?'<span>附錄C影像品質 '+primary.quality+'</span> ':'')+source(primary.page)+(primary.note?'<p class="il-note">'+esc(primary.note)+'</p>':'')+(compare?'<p class="il-muted">同步檢視連動倍率及相對位置，不進行解剖配準。</p>':'');
 }
 function render(){
  by('ilo-panel').querySelectorAll('[data-mode]').forEach(b=>{const selected=b.dataset.mode===state.mode;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});renderSidebar();updateImages();
 }
 async function show(){
  if(state.ready){updateImages();return;}
  if(state.promise)return state.promise;
  state.promise=(async()=>{try{
   const [a,b]=await Promise.all([fetch('ilo/films.json'),fetch('ilo/study.json')]);if(!a.ok||!b.ok)throw Error();const [images,study]=await Promise.all([a.json(),b.json()]);
   state.films=images.films;state.lessons=study.lessons;
   if(state.films.some(f=>f.id===pref.film))state.film=pref.film;if(state.films.some(f=>f.id===pref.other))state.other=pref.other;if(state.lessons.some(l=>l.id===pref.lesson))state.lesson=pref.lesson;
   if(['learn','library','quiz'].includes(pref.mode))state.mode=pref.mode;
   if(Number.isSafeInteger(pref.score?.seen)&&Number.isSafeInteger(pref.score?.correct)&&pref.score.correct>=0&&pref.score.seen>=pref.score.correct)state.score=pref.score;
   if(pref.quiz&&state.films.some(f=>f.id===pref.quiz.id))state.quiz=pref.quiz;
   state.compare=Boolean(pref.compare);state.sync=Boolean(pref.sync);state.group=pref.group||'all';state.query=pref.query||'';updateScore();
   shell();state.ready=true;render();
  }catch(_){state.promise=null;by('ilo-panel').innerHTML='<p class="il-error">無法載入ILO教材。<button type="button" id="il-retry">重試</button></p>';by('il-retry').onclick=show;}})();return state.promise;
 }
 function hide(){viewers.forEach(v=>v.release());by('ilo-panel').querySelector('.il-image-area')?.classList.remove('il-expanded');}
 window.ScholarSync.subscribe(key=>{if(key==='scholar-ilo-views-v1'){viewers.forEach(v=>v.restoreView());return;}if(key==='scholar-ilo-results-v1'){updateScore();if(state.ready)renderSidebar();return;}if(key!==STORE)return;pref=JSON.parse(window.ScholarStorage.getItem(STORE)||'{}');if(!state.ready)return;for(const k of ['film','other','lesson','mode','score','quiz','compare','sync','group','query'])if(k in pref)state[k]=pref[k];render();});
 root.ScholarILO={show,hide};
})(typeof window==='undefined'?globalThis:window);
