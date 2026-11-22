/* Local image alignment. Images never leave this browser. */
(()=>{
 'use strict';
 const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;n.className=cls;return n;};
 let serial=0;
 function mount(body,id){
  if(!['f12-10','f12-11'].includes(id)||body.querySelector('.ax-overlay-tool'))return;
  const original=body.querySelector('svg.ax-source-overlay');if(!original)return;
  const tool=el('section','','ax-overlay-tool'),toggle=el('button','圖片疊合'),editor=el('div','','ax-overlay-editor');toggle.type='button';toggle.setAttribute('aria-expanded','false');editor.hidden=true;tool.append(toggle,editor);original.before(tool);
  const controls=el('div','','ax-overlay-controls'),uploadLabel=el('label','上傳視野圖片 '),upload=el('input');upload.type='file';upload.accept='image/png,image/jpeg,image/webp,image/gif,image/bmp';uploadLabel.append(upload);controls.append(uploadLabel);
  const targetLabel=el('label','調整圖層 '),target=el('select');for(const [value,text]of [['photo','圖片'],['grid','格線']]){const option=el('option',text);option.value=value;target.append(option);}targetLabel.append(target);controls.append(targetLabel);
  const sliders={};for(const [key,title,min,max,step,value]of [['scale','縮放',10,400,1,100],['rotation','旋轉',-180,180,.5,0],['opacity','格線透明度',0,100,1,65]]){const label=el('label',title+' '),input=el('input'),out=el('output');input.type='range';input.min=min;input.max=max;input.step=step;input.value=value;input.setAttribute('aria-label',title);label.append(input,out);controls.append(label);sliders[key]={input,out};}
  const reset=el('button','重設位置'),remove=el('button','移除圖片'),save=el('button','下載疊合圖');for(const b of [reset,remove,save]){b.type='button';controls.append(b);}save.disabled=true;remove.disabled=true;
  const status=el('p','圖片僅在此瀏覽器處理。選擇圖層後拖曳對齊；以縮放、旋轉微調。','ax-overlay-status');status.setAttribute('role','status');
  const stage=el('div','','ax-overlay-stage');stage.tabIndex=0;stage.setAttribute('aria-label','圖片疊合區；方向鍵移動所選圖層，Shift 加速');const box=original.viewBox.baseVal;stage.style.aspectRatio=box.width+'/'+box.height;
  const photo=el('img','','ax-overlay-photo');photo.alt='上傳的視野圖片';photo.draggable=false;photo.hidden=true;
  const grid=original.cloneNode(true),ids=new Map(),prefix='field-overlay-'+(++serial)+'-';for(const n of [grid,...grid.querySelectorAll('[id]')])if(n.id){ids.set(n.id,prefix+n.id);n.id=prefix+n.id;}
  for(const n of [grid,...grid.querySelectorAll('*')])for(const attr of [...n.attributes]){let value=attr.value.replace(/url\(#([^)]*)\)/g,(all,key)=>ids.has(key)?'url(#'+ids.get(key)+')':all);if(value[0]==='#'&&ids.has(value.slice(1)))value='#'+ids.get(value.slice(1));if(value!==attr.value)n.setAttribute(attr.name,value);}
  grid.classList.remove('ax-vector','ax-reader-overlay','ax-source-overlay');grid.classList.add('ax-overlay-grid');grid.removeAttribute('data-source-figure');grid.setAttribute('aria-hidden','true');stage.append(photo,grid);editor.append(controls,status,stage);
  const initial=()=>({x:0,y:0,scale:100,rotation:0}),state={photo:initial(),grid:initial(),opacity:65};let loadRevision=0,drag=null;
  function render(){for(const [name,node]of [['photo',photo],['grid',grid]]){const s=state[name];node.style.transform=`translate(${s.x}%,${s.y}%) rotate(${s.rotation}deg) scale(${s.scale/100})`;}grid.style.opacity=state.opacity/100;const s=state[target.value];sliders.scale.input.value=s.scale;sliders.scale.out.value=s.scale+'%';sliders.rotation.input.value=s.rotation;sliders.rotation.out.value=s.rotation+'°';sliders.opacity.input.value=state.opacity;sliders.opacity.out.value=state.opacity+'%';}
  if(id==='f12-11'){
   const label=el('label','Humphrey 格線 '),choice=el('select');choice.setAttribute('aria-label','Humphrey 格線');const views=[['30-2 右眼',[80,535,410,410]],['30-2 左眼',[565,535,410,410]],['10-2 右眼',[90,90,400,390]],['10-2 左眼',[575,90,400,390]],['60-4 右眼',[80,990,410,426]],['60-4 左眼',[565,990,410,426]],['完整原圖',[0,0,980,1416]]];views.forEach(([name],index)=>{const option=el('option',name);option.value=index;choice.append(option);});label.append(choice);controls.prepend(label);choice.onchange=()=>{const view=views[Number(choice.value)][1];grid.setAttribute('viewBox',view.join(' '));stage.style.aspectRatio=view[2]+'/'+view[3];state.grid=initial();state.photo=initial();render();};choice.onchange();
  }
  toggle.onclick=()=>{editor.hidden=!editor.hidden;original.toggleAttribute('hidden',!editor.hidden);toggle.setAttribute('aria-expanded',String(!editor.hidden));toggle.textContent=editor.hidden?'圖片疊合':'返回原圖';};target.onchange=render;
  for(const key of ['scale','rotation','opacity'])sliders[key].input.oninput=()=>{if(key==='opacity')state.opacity=Number(sliders[key].input.value);else state[target.value][key]=Number(sliders[key].input.value);render();};
  reset.onclick=()=>{state.photo=initial();state.grid=initial();state.opacity=65;render();};
  remove.onclick=()=>{loadRevision++;photo.removeAttribute('src');photo.hidden=true;upload.value='';save.disabled=remove.disabled=true;state.photo=initial();render();status.textContent='已移除圖片。';};
  upload.onchange=async()=>{const revision=++loadRevision,file=upload.files[0];if(!file)return;if(!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)||file.size>20*1024*1024){status.textContent='請選擇 20 MB 以下的 PNG、JPEG、WebP、GIF 或 BMP 圖片。';upload.value='';return;}
   const url=URL.createObjectURL(file),image=new Image();try{image.src=url;await image.decode();if(revision!==loadRevision)return;if(image.naturalWidth*image.naturalHeight>50000000)throw Error('large');photo.src=url;await photo.decode();if(revision!==loadRevision)return;photo.hidden=false;state.photo=initial();save.disabled=remove.disabled=false;render();status.textContent='已載入圖片。拖曳所選圖層對齊；圖片不會上傳或同步。';}catch(_){if(revision===loadRevision)status.textContent='無法讀取圖片；請改用較小的 PNG 或 JPEG。';}finally{URL.revokeObjectURL(url);}
  };
  stage.onpointerdown=e=>{if(e.button!==0||drag)return;const s=state[target.value];drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:s.x,top:s.y,target:target.value};stage.setPointerCapture(e.pointerId);stage.focus({preventScroll:true});};
  stage.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const r=stage.getBoundingClientRect(),s=state[drag.target];s.x=drag.left+(e.clientX-drag.x)/r.width*100;s.y=drag.top+(e.clientY-drag.y)/r.height*100;render();};
  stage.onpointerup=stage.onpointercancel=stage.onlostpointercapture=()=>{drag=null;};
  stage.onkeydown=e=>{const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();const s=state[target.value],step=e.shiftKey?5:.25;s.x+=delta[0]*step;s.y+=delta[1]*step;render();};
  save.onclick=async()=>{if(photo.hidden)return;save.disabled=true;let url;try{const active=grid.viewBox.baseVal,w=1200,h=Math.round(w*active.height/active.width),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
    const source=original.cloneNode(true);source.setAttribute('xmlns','http://www.w3.org/2000/svg');source.setAttribute('viewBox',grid.getAttribute('viewBox'));source.setAttribute('width',w);source.setAttribute('height',h);source.removeAttribute('class');source.removeAttribute('hidden');source.style.cssText='';url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(source)],{type:'image/svg+xml'}));const image=new Image();image.src=url;await image.decode();
    const draw=(image,s,alpha,multiply)=>{ctx.save();ctx.globalAlpha=alpha;ctx.globalCompositeOperation=multiply?'multiply':'source-over';ctx.translate(w/2+s.x/100*w,h/2+s.y/100*h);ctx.rotate(s.rotation*Math.PI/180);ctx.scale(s.scale/100,s.scale/100);const ratio=Math.min(w/image.naturalWidth,h/image.naturalHeight),iw=image.naturalWidth*ratio,ih=image.naturalHeight*ratio;ctx.drawImage(image,-iw/2,-ih/2,iw,ih);ctx.restore();};draw(photo,state.photo,1,false);draw(image,state.grid,state.opacity/100,true);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('export');const download=URL.createObjectURL(blob),a=el('a');a.href=download;a.download=(id==='f12-10'?'Goldman':'Humphrey')+'-overlay.png';a.click();setTimeout(()=>URL.revokeObjectURL(download),30000);status.textContent='已下載疊合圖。';
   }catch(_){status.textContent='無法匯出，請重新選擇圖片後再試。';}finally{if(url)URL.revokeObjectURL(url);save.disabled=photo.hidden;}
  };render();
 }
 window.ScholarFieldOverlay={mount};
})();
