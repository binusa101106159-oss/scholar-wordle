/* Responsive, source-preserving reading cards for the book's filled examples. */
(()=>{
 'use strict';
 const examples=new Set(['f15-31','f16-13','f17-7']);let serial=0;
 const clean=s=>s.replace(/\s+/g,' ').trim();
 function mount(body,id){
  body.amaFormObserver?.disconnect();
  cancelAnimationFrame(body.amaFormFrame||0);
  if(!examples.has(id)||!body.querySelector('.ax-form-figure'))return;
  if(!body.querySelector('.ax-form-view-tools'))build(body,id);
  const fit=frame=>{const w=+frame.dataset.sourceWidth,h=+frame.dataset.sourceHeight,s=Math.min(1.6,frame.clientWidth/w);frame.firstElementChild.style.transform=`scale(${s})`;frame.style.height=h*s+'px';frame.dataset.fitted='true';};
  const widths=new WeakMap(),pending=new Set();body.amaFormFrame=0;
  body.amaFormObserver=new ResizeObserver(entries=>{
   for(const {target}of entries){const w=target.clientWidth;if(w&&Math.abs(w-(widths.get(target)||0))>.25){widths.set(target,w);pending.add(target);}}
   if(pending.size&&!body.amaFormFrame)body.amaFormFrame=requestAnimationFrame(()=>{body.amaFormFrame=0;for(const target of pending)if(target.isConnected&&target.clientWidth)fit(target);pending.clear();});
  });
  body.querySelectorAll('.ax-form-card-viewport').forEach(n=>body.amaFormObserver.observe(n));
 }
 function build(body,id){
  const source=document.createElement('div');source.className='ax-form-source';source.append(...body.childNodes);body.append(source);
  const reader=document.createElement('div');reader.className='ax-form-reader';reader.setAttribute('aria-label','範例表單欄式閱讀');
  const title=document.createElement('h2');title.textContent=body.closest('dialog')?.querySelector('h2')?.textContent||id;reader.append(title);
  const tools=document.createElement('div');tools.className='ax-form-view-tools';tools.setAttribute('role','group');tools.setAttribute('aria-label','表單閱讀方式');
  for(const [mode,label]of [['reading','欄式閱讀'],['source','原始表單']]){
   const button=document.createElement('button');button.type='button';button.dataset.formView=mode;button.textContent=label;
   button.onclick=()=>{const reading=mode==='reading';source.hidden=reading;reader.hidden=!reading;for(const b of tools.children)b.setAttribute('aria-pressed',String(b===button));body.scrollTop=body.scrollLeft=0;};tools.append(button);
  }
  // Measure before hiding the source. One coordinate scale accounts for the
  // popup's entry transform, so artwork and its printed choices stay together.
  const anchor=source.querySelector('.ax-form-figure'),scale=anchor.getBoundingClientRect().width/anchor.offsetWidth;
  const art=[...source.querySelectorAll('svg')].filter(n=>!n.closest('defs'));
  const measured=new WeakMap();
  const rect=n=>{if(!measured.has(n)){const r=n.getBoundingClientRect();measured.set(n,{x:r.x/scale,y:r.y/scale,w:r.width/scale,h:r.height/scale});}return measured.get(n);};
  source.querySelectorAll('table,td,th,.ax-natural-label,svg,.ax-positioned-cell,.ax-source-run,p').forEach(rect);
  let index=0,section;
  const makeSection=label=>{section=document.createElement('section');section.className='ax-form-reading-section';if(label){const h=document.createElement('h3');h.textContent=label;section.append(h);}reader.append(section);return section;};
  const field=(cell,label,{header=false}={})=>{
   const card=document.createElement('div');card.className='ax-form-card';card.dataset.sourceCell=String(index++);card.dataset.sourceText=cell.textContent;
   if(label){const h=document.createElement('h4');h.className='ax-form-card-label';h.textContent=label;card.append(h);}
   const cellRect=rect(cell),positioned=cell.querySelector('.ax-positioned-cell');
   // Identity, dates and long diagnostic text can reflow normally. Sex/side
   // retain the actual printed circles instead of guessing selected values.
   if(header&&!/\b(?:Sex|Side):/.test(cell.textContent)){
    const p=document.createElement('p');p.className='ax-form-card-text';p.textContent=clean(cell.textContent)||'—';card.append(p);return card;
   }
   const labels=[...cell.querySelectorAll('.ax-natural-label')];
   const cuts=header?labels.filter(n=>/^(?:ID Number|Sex|Side):/.test(n.textContent.trim())).map(n=>({x:rect(n).x-cellRect.x,label:n.textContent.trim().match(/^[^:]+:/)[0]})).sort((a,b)=>a.x-b.x):[];
   const pieces=cuts.length?cuts.map((c,i)=>({left:Math.max(0,c.x-3),right:cuts[i+1]?cuts[i+1].x-3:cellRect.w,label:c.label})):[{left:0,right:cellRect.w}];
   for(const piece of pieces){
    const selected=labels.filter(n=>{const x=rect(n).x-cellRect.x;return x>=piece.left-1&&x<piece.right-1;});
    if(!selected.length){if(!cuts.length){const p=document.createElement('p');p.className='ax-form-card-text';p.textContent='—';card.append(p);}continue;}
    const left=piece.left,right=header?Math.min(piece.right,Math.max(...selected.map(n=>rect(n).x-cellRect.x+rect(n).w))+7):piece.right,w=right-left;
    const fullHeight=positioned?parseFloat(positioned.style.height):cellRect.h,top=Math.max(0,Math.min(...selected.map(n=>rect(n).y-cellRect.y))-5),bottom=Math.min(fullHeight,Math.max(...selected.map(n=>rect(n).y-cellRect.y+rect(n).h))+6),h=bottom-top;
    const viewport=document.createElement('div');viewport.className='ax-form-card-viewport';viewport.dataset.sourceWidth=w;viewport.dataset.sourceHeight=h;
    const canvas=document.createElement('div');canvas.className='ax-form-card-canvas';canvas.style.width=w+'px';canvas.style.height=h+'px';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('ax-form-card-art');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('aria-hidden','true');
    for(const layer of art){
     const r=rect(layer);if(r.x+r.w<cellRect.x+left||r.x>cellRect.x+right||r.y+r.h<cellRect.y+top||r.y>cellRect.y+bottom)continue;
     const clone=layer.cloneNode(true);clone.setAttribute('x',r.x-cellRect.x-left);clone.setAttribute('y',r.y-cellRect.y-top);clone.setAttribute('width',r.w);clone.setAttribute('height',r.h);clone.style.setProperty('width',r.w+'px','important');clone.style.setProperty('height',r.h+'px','important');clone.classList.add('ax-form-card-layer');svg.append(clone);
    }
    canvas.append(svg);
    const text=document.createElement('div');text.className='ax-form-card-source-text';text.style.width=cellRect.w+'px';text.style.left=-left+'px';text.style.top=-top+'px';
    if(positioned){
     const clone=positioned.cloneNode(true);clone.querySelectorAll('svg').forEach(n=>n.remove());
     const keep=new Set(selected.map(n=>labels.indexOf(n)));clone.querySelectorAll('.ax-natural-label').forEach((n,i)=>{if(!keep.has(i))n.remove();});text.append(clone);
    }else text.textContent=clean(cell.textContent);
    canvas.append(text);scope(svg);viewport.append(canvas);card.append(viewport);queueMicrotask(()=>body.amaFormObserver?.observe(viewport));
   }
   return card;
  };
  function scope(root){
   const prefix='ax-reading-'+(++serial)+'-',ids=new Map();root.querySelectorAll('[id]').forEach(n=>{const old=n.id;n.id=prefix+old;ids.set(old,n.id);});
   root.querySelectorAll('*').forEach(n=>{for(const a of [...n.attributes]){if(a.localName==='id')continue;let v=a.value.replace(/url\(\s*(['"]?)#([^\s)'" ]+)\1\s*\)/g,(m,q,id)=>ids.has(id)?'url(#'+ids.get(id)+')':m);if(a.localName==='href'&&v.startsWith('#')&&ids.has(v.slice(1)))v='#'+ids.get(v.slice(1));if(v!==a.value)n.setAttributeNS(a.namespaceURI,a.name,v);}});
  }
  const loose=[...source.querySelectorAll('.ax-source-run,p')].filter(n=>!n.closest('table')&&!n.querySelector('.ax-source-run'));
  const events=[...source.querySelectorAll('table'),...loose].sort((a,b)=>rect(a).y-rect(b).y||rect(a).x-rect(b).x);
  for(const table of events){
   if(table.localName!=='table'){
    const text=clean(table.textContent).replace(/^F\s*I\s*G\s*U\s*R\s*E\s*\d+\s*-\s*\d+\s*/i,'');if(!text)continue;
    const p=document.createElement('p');p.className='ax-form-card-text ax-form-source-caption';p.textContent=text;reader.append(p);continue;
   }
   let headers=null;makeSection('');
   for(const row of table.rows){
    const cells=[...row.cells],texts=cells.map(c=>clean(c.textContent)),nonempty=texts.filter(Boolean);
    if(!nonempty.length)continue;
    if(cells.length>2&&nonempty.length===1&&!/^(?:Combined|Final|Whole Person)/i.test(nonempty[0])){makeSection(nonempty[0]);continue;}
    const headerRow=texts.filter(t=>/^(?:Grid|Table|Diagnosis \/ Criteria|Assigned Class|Class Diagnosis|Grade Modif|Adjustments|Assigned Grade|Assigned Dx|Final [UL]EI|Whole Person|Points|Level|Joint|Total [UL]EI|Summary|Sensory and Motor|Nerve$)/i.test(t)).length>=2;
    if(headerRow){headers=texts;continue;}
    const identity=/^(?:Name|ID Number|Diagnosis|Signed|Exam Date|Birth Date|Injury Date|Date):/.test(nonempty[0]);
    const group=document.createElement('div');group.className='ax-form-reading-row'+(identity?' ax-form-identity':'');
    const unused=!identity&&headers&&cells.length>=3&&((!texts.at(-1)&&(!texts[1]||/^(?:Sensory Deficit|0 1 2)/.test(texts[1])))||headers[0]==='Joint'&&!texts[0]&&!texts[1]);
    const fieldLabels=headers?[...headers]:null;group.amaFill=()=>{if(group.childElementCount)return;cells.forEach((cell,i)=>group.append(field(cell,identity?'':fieldLabels?.[i],{header:identity})));};
    if(unused){let details=section.querySelector(':scope>.ax-form-unused');if(!details){details=document.createElement('details');details.className='ax-form-unused';const summary=document.createElement('summary');summary.textContent='空白評分欄位';details.append(summary);details.addEventListener('toggle',()=>{if(details.open)details.querySelectorAll('.ax-form-reading-row').forEach(n=>n.amaFill());});section.append(details);}details.append(group);}else{group.amaFill();section.append(group);}
   }
  }
  body.prepend(tools,reader);tools.firstElementChild.click();
 }
 window.ScholarFormReader={mount};
})();
