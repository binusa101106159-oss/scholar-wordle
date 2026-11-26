/* 自訂：桌布、強調色、主題色調。Settings follow the account (ScholarStorage); an uploaded wallpaper
 * picture stays on this device only. A local mirror applies the look before the page paints. */
(() => {
 'use strict';
 const KEY='scholar-customize-v1',MIRROR='scholar-customize-local',IMAGE='scholar-wallpaper-image';
 const WALLPAPERS=[
  {id:'default',name:'預設光暈',css:'radial-gradient(40vmax 30vmax at 15% 20%, rgba(197,160,89,0.10), transparent 70%), radial-gradient(35vmax 30vmax at 85% 75%, rgba(56,120,255,0.09), transparent 70%), radial-gradient(30vmax 25vmax at 60% 40%, rgba(29,78,216,0.06), transparent 70%)'},
  {id:'black',name:'純黑',css:'none'},
  {id:'aurora',name:'極光',css:'radial-gradient(60vmax 40vmax at 20% 10%, rgba(64,224,180,.22), transparent 70%), radial-gradient(50vmax 40vmax at 80% 30%, rgba(90,120,255,.22), transparent 70%), radial-gradient(60vmax 40vmax at 50% 100%, rgba(170,80,255,.16), transparent 70%)'},
  {id:'sunset',name:'夕陽',css:'radial-gradient(70vmax 45vmax at 15% 90%, rgba(255,120,60,.25), transparent 70%), radial-gradient(60vmax 40vmax at 85% 80%, rgba(255,70,120,.20), transparent 70%), radial-gradient(50vmax 35vmax at 50% 0%, rgba(120,60,200,.18), transparent 70%)'},
  {id:'ocean',name:'深海',css:'radial-gradient(70vmax 50vmax at 50% 110%, rgba(0,140,220,.28), transparent 70%), radial-gradient(50vmax 35vmax at 10% 20%, rgba(0,90,160,.20), transparent 70%), linear-gradient(180deg, #000 0%, #02101e 100%)'},
  {id:'forest',name:'森林',css:'radial-gradient(60vmax 45vmax at 20% 80%, rgba(40,160,90,.24), transparent 70%), radial-gradient(50vmax 35vmax at 85% 15%, rgba(150,200,80,.14), transparent 70%), linear-gradient(180deg, #000 0%, #04110a 100%)'},
  {id:'ember',name:'餘燼',css:'radial-gradient(60vmax 40vmax at 80% 85%, rgba(255,140,40,.20), transparent 70%), radial-gradient(45vmax 35vmax at 10% 15%, rgba(200,60,40,.16), transparent 70%)'},
  {id:'mono',name:'石墨',css:'radial-gradient(70vmax 50vmax at 50% 0%, rgba(255,255,255,.10), transparent 70%), linear-gradient(180deg, #0b0b0c 0%, #000 100%)'},
  {id:'image',name:'自己的圖片',css:''}
 ];
 const ACCENTS=[['預設藍','#a9c8ff'],['青','#7fe3e3'],['綠','#8fe3a3'],['金','#f2c96b'],['橘','#ffb86b'],['粉','#ff9dc4'],['紫','#c3a7ff'],['白','#f1f5f9']];
 const TONES=[['neutral','中性',[255,255,255]],['blue','藍',[120,170,255]],['teal','青綠',[90,210,200]],['green','綠',[110,210,140]],['purple','紫',[180,140,255]],['warm','暖',[255,190,130]],['rose','玫瑰',[255,140,170]]];
 const DEFAULTS={wallpaper:'default',accent:'',tone:'neutral',dim:35,blur:0};
 const clamp=(v,lo,hi,d)=>Number.isFinite(Number(v))?Math.min(hi,Math.max(lo,Number(v))):d;
 function clean(s){
  s=s&&typeof s==='object'?s:{};
  return {wallpaper:WALLPAPERS.some(w=>w.id===s.wallpaper)?s.wallpaper:'default',accent:/^#[0-9a-f]{6}$/i.test(s.accent||'')?s.accent.toLowerCase():'',tone:TONES.some(t=>t[0]===s.tone)?s.tone:'neutral',dim:clamp(s.dim,0,80,35),blur:clamp(s.blur,0,20,0)};
 }
 const parse=t=>{try{return clean(JSON.parse(t||'{}'));}catch(_){return {...DEFAULTS};}};
 const local={get:k=>{try{return localStorage.getItem(k);}catch(_){return null;}},set:(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);return true;}catch(_){return false;}}};
 let settings=parse(local.get(MIRROR)),panel=null,status=null;
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));

 function apply(rebuild=true){
  const root=document.documentElement,s=settings,wp=WALLPAPERS.find(w=>w.id===s.wallpaper),img=s.wallpaper==='image'?local.get(IMAGE):null;
  root.dataset.wallpaper=img||s.wallpaper!=='image'?s.wallpaper:'default';
  let bg=(img||s.wallpaper!=='image'?wp:WALLPAPERS[0]).css;
  if(img)bg='linear-gradient(rgba(0,0,0,'+(s.dim/100)+'),rgba(0,0,0,'+(s.dim/100)+')), url("'+img+'") center / cover no-repeat';
  root.style.setProperty('--wallpaper',bg);root.style.setProperty('--wallpaper-blur',img&&s.blur?s.blur+'px':'0px');
  if(s.accent){const [r,g,b]=rgb(s.accent);root.dataset.accent='custom';root.style.setProperty('--accent',s.accent);root.style.setProperty('--accent-rgb',r+','+g+','+b);}
  else{delete root.dataset.accent;root.style.removeProperty('--accent');root.style.removeProperty('--accent-rgb');}
  const tone=TONES.find(t=>t[0]===s.tone);
  if(s.tone!=='neutral'){root.dataset.tone=s.tone;root.style.setProperty('--tone-rgb',tone[2].join(','));}else{delete root.dataset.tone;root.style.removeProperty('--tone-rgb');}
  if(rebuild)render();
 }
 function save(next){
  settings=clean({...settings,...next});const text=JSON.stringify(settings);local.set(MIRROR,text);
  try{window.ScholarStorage?.setItem(KEY,text);}catch(_){/* the look still applies on this device */}
  apply();
 }
 apply();
 // When the account's settings arrive or change on another device, follow them.
 function fromAccount(){const text=window.ScholarStorage?.getItem(KEY);if(!text)return;const next=parse(text);if(JSON.stringify(next)!==JSON.stringify(settings)){settings=next;local.set(MIRROR,JSON.stringify(settings));apply();}}
 function hook(){if(!window.ScholarSync)return;fromAccount();window.ScholarSync.subscribe(key=>{if(key===KEY)fromAccount();});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook,{once:true});else hook();

 /* ---------- panel ---------- */
 const el=(tag,text='',cls='')=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 function swatch(group,label,selected,paint,onPick){
  const b=el('button','','cz-swatch');b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(selected));b.setAttribute('aria-label',label);b.dataset.group=group;
  const chip=el('span','','cz-chip');paint(chip);b.append(chip,el('span',label,'cz-name'));b.onclick=onPick;return b;
 }
 function section(title,hint){const s=el('section','','cz-card');s.append(el('h2',title));if(hint)s.append(el('p',hint,'cz-hint'));panel.querySelector('.cz-wrap').append(s);return s;}
 async function upload(file){
  if(!file||!/^image\//.test(file.type)){status.textContent='請選擇圖片檔。';return;}
  try{
   const bitmap=await createImageBitmap(file),max=2560,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   let data='';for(const q of [0.85,0.7,0.55]){data=canvas.toDataURL('image/jpeg',q);if(data.length<3_000_000)break;}
   if(!local.set(IMAGE,data)){status.textContent='圖片太大，這台裝置存不下；請換一張較小的圖片。';return;}
   save({wallpaper:'image'});status.textContent='已套用圖片桌布（只存在這台裝置）。';
  }catch(_){status.textContent='無法讀取這張圖片。';}
 }
 function render(){
  if(!panel||panel.hidden&&!panel.firstChild)return;
  const s=settings,hasImage=!!local.get(IMAGE),scroll=panel.scrollTop;
  panel.replaceChildren();const wrap=el('div','','cz-wrap');panel.append(wrap);
  const head=el('header','','cz-head');head.append(el('h1','自訂'),el('p','桌布、強調色與主題色調會跟著帳號同步到其他裝置；上傳的圖片只存在這台裝置。','cz-hint'));wrap.append(head);
  const wp=section('桌布');const grid=el('div','','cz-grid');grid.setAttribute('role','radiogroup');grid.setAttribute('aria-label','桌布');
  for(const w of WALLPAPERS){
   if(w.id==='image'&&!hasImage)continue;
   grid.append(swatch('wallpaper',w.name,s.wallpaper===w.id,chip=>{chip.classList.add('cz-wall');chip.style.background=w.id==='image'?'url("'+local.get(IMAGE)+'") center/cover':(w.css==='none'?'#000':w.css+', #000');},()=>save({wallpaper:w.id})));
  }
  wp.append(grid);
  const row=el('div','','cz-row'),pick=el('input');pick.type='file';pick.accept='image/*';pick.id='cz-upload';pick.className='cz-file';pick.onchange=()=>upload(pick.files[0]);
  const up=el('label',hasImage?'更換圖片':'上傳圖片','cz-btn');up.htmlFor='cz-upload';row.append(pick,up);
  if(hasImage){const rm=el('button','移除圖片','cz-btn');rm.type='button';rm.onclick=()=>{local.set(IMAGE,null);save({wallpaper:s.wallpaper==='image'?'default':s.wallpaper});status.textContent='已移除圖片。';};row.append(rm);}
  wp.append(row);
  if(s.wallpaper==='image'&&hasImage){
   const slider=(label,key,max,unit)=>{const l=el('label','','cz-slider'),i=el('input'),v=el('span',s[key]+unit,'cz-value');i.type='range';i.min='0';i.max=String(max);i.value=String(s[key]);i.setAttribute('aria-label',label);i.oninput=()=>{v.textContent=i.value+unit;settings[key]=Number(i.value);apply(false);};i.onchange=()=>save({[key]:Number(i.value)});l.append(el('span',label),i,v);return l;};
   wp.append(slider('變暗','dim',80,'%'),slider('模糊','blur',20,' px'));
  }
  if(s.wallpaper==='image'&&!hasImage)wp.append(el('p','另一台裝置選了圖片桌布；這台沒有那張圖片，暫時顯示預設光暈。','cz-hint'));
  const ac=section('強調色','用在目前分頁、主要按鈕、核取方塊與焦點外框。');const ag=el('div','','cz-grid cz-grid-color');ag.setAttribute('role','radiogroup');ag.setAttribute('aria-label','強調色');
  ACCENTS.forEach(([name,hex],i)=>ag.append(swatch('accent',name,(s.accent||'')===(i===0?'':hex),chip=>{chip.style.background=hex;},()=>save({accent:i===0?'':hex}))));
  const custom=el('label','','cz-swatch cz-custom'),ci=el('input');ci.type='color';ci.value=s.accent||'#a9c8ff';ci.setAttribute('aria-label','自訂強調色');ci.oninput=()=>save({accent:ci.value});
  const isCustom=!!s.accent&&!ACCENTS.some(([,h])=>h===s.accent);custom.setAttribute('aria-checked',String(isCustom));custom.append(ci,el('span','自訂','cz-name'));ag.append(custom);ac.append(ag);
  const tn=section('主題色調','為玻璃面板與導覽列加上淡淡的顏色。');const tg=el('div','','cz-grid cz-grid-color');tg.setAttribute('role','radiogroup');tg.setAttribute('aria-label','主題色調');
  TONES.forEach(([id,name,c])=>tg.append(swatch('tone',name,s.tone===id,chip=>{chip.style.background='linear-gradient(180deg,rgba('+c.join(',')+',.45),rgba('+c.join(',')+',.12)), #0b0f17';},()=>save({tone:id}))));tn.append(tg);
  const foot=el('div','','cz-row cz-foot'),reset=el('button','全部恢復預設','cz-btn');reset.type='button';reset.onclick=()=>{save({...DEFAULTS});status.textContent='已恢復預設。';};
  status=status||el('p','','cz-status');status.setAttribute('role','status');foot.append(reset);wrap.append(foot,status);panel.scrollTop=scroll;
 }
 function show(){panel=document.getElementById('customize-panel');render();}
 window.ScholarCustomize={show,get settings(){return {...settings};},WALLPAPERS,ACCENTS,TONES,clean};
})();
