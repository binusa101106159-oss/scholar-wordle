/* 自訂：桌布、強調色、主題色調、文字（字型、大小、顏色、粗體）、減少動態效果。Settings follow the account (ScholarStorage); an uploaded wallpaper
 * picture stays on this device only. A local mirror applies the look before the page paints. */
(() => {
 'use strict';
 const KEY='scholar-customize-v1',MIRROR='scholar-customize-local',IMAGE='scholar-wallpaper-image';
 // Solid colours; 預設 keeps the site's original background.
 const WALLPAPERS=[
  {id:'default',name:'預設',css:'radial-gradient(40vmax 30vmax at 15% 20%, rgba(197,160,89,0.10), transparent 70%), radial-gradient(35vmax 30vmax at 85% 75%, rgba(56,120,255,0.09), transparent 70%), radial-gradient(30vmax 25vmax at 60% 40%, rgba(29,78,216,0.06), transparent 70%)'},
  {id:'black',name:'純黑',color:'#000000'},
  {id:'graphite',name:'石墨',color:'#1c1c1e'},
  {id:'navy',name:'深藍',color:'#0b1a33'},
  {id:'ocean',name:'海藍',color:'#0e2a47'},
  {id:'forest',name:'墨綠',color:'#0f2a1d'},
  {id:'wine',name:'酒紅',color:'#3a0f1a'},
  {id:'plum',name:'深紫',color:'#2a1840'},
  {id:'brown',name:'咖啡',color:'#2b1d12'},
  {id:'custom',name:'自選顏色',color:''},
  {id:'image',name:'自己的圖片',css:''}
 ];
 const ACCENTS=[['預設藍','#a9c8ff'],['青','#7fe3e3'],['綠','#8fe3a3'],['金','#f2c96b'],['橘','#ffb86b'],['粉','#ff9dc4'],['紫','#c3a7ff'],['白','#f1f5f9']];
 // One-tap original themes: each sets a solid wallpaper, accent, tone and text colour; everything stays adjustable after.
 const THEMES=[
  {id:'gale',name:'疾風',hint:'寶藍 × 亮黃',set:{wallpaper:'custom',color:'#0b2a6b',accent:'#ffd23f',tone:'blue',text:'#ffffff'}},
  {id:'wild',name:'林野',hint:'墨綠 × 古銅金',set:{wallpaper:'custom',color:'#13301f',accent:'#d4a93a',tone:'green',text:'#efe0c0'}},
  {id:'brick',name:'紅磚',hint:'磚紅 × 天空藍',set:{wallpaper:'custom',color:'#5a1712',accent:'#7cc4ff',tone:'warm',text:'#fff4e0'}}
 ];
 const TONES=[['neutral','中性',[255,255,255]],['blue','藍',[120,170,255]],['teal','青綠',[90,210,200]],['green','綠',[110,210,140]],['purple','紫',[180,140,255]],['warm','暖',[255,190,130]],['rose','玫瑰',[255,140,170]]];
 // Fonts: system fonts first where every device has them; 黑體／明體／楷體 also load a web font so they look the same everywhere.
 const FONTS=[
  {id:'default',name:'預設',stack:''},
  {id:'system',name:'系統',stack:'system-ui,-apple-system,"Segoe UI","PingFang TC","Microsoft JhengHei",sans-serif'},
  {id:'sans',name:'黑體',stack:'"Noto Sans TC","PingFang TC","Microsoft JhengHei","Heiti TC",sans-serif',web:'Noto+Sans+TC:wght@400;500;700'},
  {id:'serif',name:'明體',stack:'"Noto Serif TC","Songti TC","PMingLiU","MingLiU",serif',web:'Noto+Serif+TC:wght@400;600;700'},
  {id:'kai',name:'楷體',stack:'"LXGW WenKai TC","Kaiti TC","BiauKai","DFKai-SB",serif',web:'LXGW+WenKai+TC:wght@400;700'}
 ];
 const TEXTS=[['預設',''],['純白','#ffffff'],['暖白','#fff4e0'],['米色','#efe0c0'],['淺灰','#d4d4d8'],['淺藍','#cfe2ff'],['淺綠','#d3f5dc'],['淺粉','#ffd9e6']];
 const DEFAULTS={wallpaper:'default',accent:'',tone:'neutral',dim:35,blur:0,color:'#000000',font:'default',size:100,text:'',bold:false,motion:false};
 const HEX=/^#[0-9a-f]{6}$/i;
 // '#abc', 'abc', '#AABBCC' → '#aabbcc'; anything else → ''
 function hexOf(v){v=String(v||'').trim().replace(/^#?/,'#').toLowerCase();if(/^#[0-9a-f]{3}$/.test(v))v='#'+[...v.slice(1)].map(c=>c+c).join('');return HEX.test(v)?v:'';}
 const clamp=(v,lo,hi,d)=>Number.isFinite(Number(v))?Math.min(hi,Math.max(lo,Number(v))):d;
 function clean(s){
  s=s&&typeof s==='object'?s:{};
  return {wallpaper:WALLPAPERS.some(w=>w.id===s.wallpaper)?s.wallpaper:'default',accent:HEX.test(s.accent||'')?s.accent.toLowerCase():'',tone:TONES.some(t=>t[0]===s.tone)?s.tone:'neutral',color:HEX.test(s.color||'')?s.color.toLowerCase():'#000000',dim:clamp(s.dim,0,80,35),blur:clamp(s.blur,0,20,0),
   font:FONTS.some(f=>f.id===s.font)?s.font:'default',size:Math.round(clamp(s.size,85,130,100)/5)*5,text:HEX.test(s.text||'')?s.text.toLowerCase():'',bold:s.bold===true,motion:s.motion===true};
 }
 const parse=t=>{try{return clean(JSON.parse(t||'{}'));}catch(_){return {...DEFAULTS};}};
 const local={get:k=>{try{return localStorage.getItem(k);}catch(_){return null;}},set:(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);return true;}catch(_){return false;}}};
 let settings=parse(local.get(MIRROR)),panel=null,status=null;
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));

 /* ---------- text: size, colour and weight ----------
  * The site sizes text in px, so 文字大小 scales the px font-size of every same-origin style rule (and the root
  * font-size for rem/em). 文字顏色 replaces light, unsaturated text colours (the white and grey body text) with the
  * chosen colour, keeping each one's relative brightness and transparency; coloured text (correct/wrong, links,
  * the accent) is left alone. 粗體文字 raises every font-weight a step. Original values are kept, so 預設 restores
  * them exactly. Layout, popups and the page zoom are not touched. */
 const ORIG=new WeakMap();let engineOn=false,queued=0;
 const textChanged=s=>s.size!==100||!!s.text||s.bold;
 function parseColor(v){
  v=String(v).trim().toLowerCase();if(v==='white')return [255,255,255,1];
  let m=v.match(/^#([0-9a-f]{3,8})$/);
  if(m){let h=m[1];if(h.length<5)h=[...h].map(c=>c+c).join('');if(h.length!==6&&h.length!==8)return null;return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)).concat(h.length===8?parseInt(h.slice(6),16)/255:1);}
  m=v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/);
  if(m)return [+m[1],+m[2],+m[3],m[4]===undefined?1:m[5]?m[4]/100:+m[4]];
  return null;
 }
 function recolor(v,t){
  const c=parseColor(v);if(!c)return v;const [r,g,b,a]=c,mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  if(mx<140||mx-mn>48)return v;
  const o=t.map(x=>Math.round(x*mx/255)).join(', ');return a>=1?'rgb('+o+')':'rgba('+o+', '+a+')';
 }
 const scaleSize=(v,f)=>v.replace(/(\d*\.?\d+)px/g,(m,n)=>Math.round(n*f*100)/100+'px');
 function heavier(v){const n={normal:400,bold:700,bolder:700,lighter:300}[v]??Number(v);return Number.isFinite(n)&&n>0?String(Math.min(900,n<=400?n+200:n+100)):v;}
 function fixStyle(st,f,t,bold){
  let o=ORIG.get(st);
  if(o===undefined){const g=p=>{const v=st.getPropertyValue(p);return v?{v,pr:st.getPropertyPriority(p),now:v}:null;};o={fs:g('font-size'),c:g('color'),fw:g('font-weight')};if(!o.fs&&!o.c&&!o.fw)o=null;ORIG.set(st,o);}
  if(!o)return;
  const set=(p,x,val)=>{if(!x||x.now===val)return;st.setProperty(p,val,x.pr);x.now=val;};
  set('font-size',o.fs,o.fs&&(f===1?o.fs.v:scaleSize(o.fs.v,f)));set('color',o.c,o.c&&(t?recolor(o.c.v,t):o.c.v));set('font-weight',o.fw,o.fw&&(bold?heavier(o.fw.v):o.fw.v));
 }
 function walk(rules,f,t,bold){for(const r of rules){if(r.type===5)continue;if(r.type===1&&r.style)fixStyle(r.style,f,t,bold);if(r.cssRules&&r.cssRules.length)walk(r.cssRules,f,t,bold);}}
 function runText(){
  queued=0;const s=settings,on=textChanged(s);if(!on&&!engineOn)return;engineOn=on;
  const f=s.size/100,t=s.text?rgb(s.text):null;
  for(const sh of document.styleSheets){if(sh.ownerNode&&sh.ownerNode.id==='cz-base')continue;let rules=null;try{rules=sh.cssRules;}catch(_){continue;}if(rules)walk(rules,f,t,s.bold);}
  document.documentElement.style.fontSize=f===1?'':f*100+'%';
 }
 const queueText=()=>{if(!queued)queued=requestAnimationFrame(runText);};
 // Style sheets that arrive later (lazy tabs) get the same treatment.
 document.addEventListener('load',e=>{if(e.target&&e.target.tagName==='LINK')queueText();},true);
 function watchStyles(){const mo=new MutationObserver(ms=>{if(ms.some(m=>[...m.addedNodes].some(n=>n.nodeName==='STYLE'||n.nodeName==='LINK')))queueText();});mo.observe(document.head,{childList:true});if(document.body)mo.observe(document.body,{childList:true});addEventListener('hashchange',queueText);queueText();}
 // Font family, the bold base weight and 減少動態效果 live in one small sheet the text pass skips.
 function baseSheet(){
  let st=document.getElementById('cz-base');if(st)return;st=document.createElement('style');st.id='cz-base';
  st.textContent='html[data-font] body,html[data-font] body *:not(svg,svg *,.cz-font-chip){font-family:var(--cz-font)!important}'+
   'html[data-font] :is(code,pre,kbd,samp),html[data-font] :is(code,pre,kbd,samp) *{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important}'+
   'html[data-bold] body{font-weight:600}'+
   'html[data-motion=reduce] *,html[data-motion=reduce] *::before,html[data-motion=reduce] *::after{animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:.01ms!important;transition-delay:0s!important;scroll-behavior:auto!important}';
  document.head.append(st);
 }
 function webFont(f){
  let link=document.getElementById('cz-webfont');
  if(!f||!f.web){link?.remove();return;}
  const href='https://fonts.googleapis.com/css2?family='+f.web+'&display=swap';
  if(link&&link.getAttribute('href')===href)return;
  if(!link){link=document.createElement('link');link.id='cz-webfont';link.rel='stylesheet';document.head.append(link);}
  link.href=href;
 }

 function apply(rebuild=true){
  const root=document.documentElement,s=settings,wp=WALLPAPERS.find(w=>w.id===s.wallpaper),img=s.wallpaper==='image'?local.get(IMAGE):null;
  root.dataset.wallpaper=img||s.wallpaper!=='image'?s.wallpaper:'default';
  const base=img||s.wallpaper!=='image'?wp:WALLPAPERS[0];
  let bg=base.id==='custom'?s.color:base.color||base.css;
  if(img)bg='linear-gradient(rgba(0,0,0,'+(s.dim/100)+'),rgba(0,0,0,'+(s.dim/100)+')), url("'+img+'") center / cover no-repeat';
  root.style.setProperty('--wallpaper',bg);root.style.setProperty('--wallpaper-blur',img&&s.blur?s.blur+'px':'0px');
  if(s.accent){const [r,g,b]=rgb(s.accent);root.dataset.accent='custom';root.style.setProperty('--accent',s.accent);root.style.setProperty('--accent-rgb',r+','+g+','+b);}
  else{delete root.dataset.accent;root.style.removeProperty('--accent');root.style.removeProperty('--accent-rgb');}
  const tone=TONES.find(t=>t[0]===s.tone);
  if(s.tone!=='neutral'){root.dataset.tone=s.tone;root.style.setProperty('--tone-rgb',tone[2].join(','));}else{delete root.dataset.tone;root.style.removeProperty('--tone-rgb');}
  baseSheet();const font=FONTS.find(f=>f.id===s.font);
  if(font.stack){root.dataset.font=s.font;root.style.setProperty('--cz-font',font.stack);}else{delete root.dataset.font;root.style.removeProperty('--cz-font');}
  webFont(font);
  if(s.bold)root.dataset.bold='';else delete root.dataset.bold;
  if(s.motion)root.dataset.motion='reduce';else delete root.dataset.motion;
  runText();
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
 function hook(){watchStyles();runText();if(!window.ScholarSync)return;fromAccount();window.ScholarSync.subscribe(key=>{if(key===KEY)fromAccount();});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook,{once:true});else hook();

 /* ---------- panel ---------- */
 const el=(tag,text='',cls='')=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 function swatch(group,label,selected,paint,onPick){
  const b=el('button','','cz-swatch');b.type='button';b.setAttribute('role','radio');b.setAttribute('aria-checked',String(selected));b.setAttribute('aria-label',label);b.dataset.group=group;
  const chip=el('span','','cz-chip');paint(chip);b.append(chip,el('span',label,'cz-name'));b.onclick=onPick;return b;
 }
 // 色碼 field next to a colour choice: typing a valid code previews it at once, Enter or leaving the field keeps it.
 function hexField(label,value,live,commit){
  const l=el('label','','cz-hex'),i=el('input');i.type='text';i.value=value;i.maxLength=7;i.spellcheck=false;i.autocomplete='off';i.placeholder='#RRGGBB';i.setAttribute('aria-label',label);i.setAttribute('inputmode','text');
  i.oninput=()=>{const h=hexOf(i.value);if(h||!i.value.trim())i.removeAttribute('aria-invalid');else i.setAttribute('aria-invalid','true');if(h)live(h);};
  i.onchange=()=>{const h=hexOf(i.value);if(h)commit(h);else{i.value=value;i.removeAttribute('aria-invalid');}};
  i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();i.blur();}};
  l.append(el('span','色碼','cz-hex-label'),i);return l;
 }
 function toggle(label,hint,key){
  const b=el('button','','cz-toggle');b.type='button';b.setAttribute('role','switch');b.setAttribute('aria-checked',String(settings[key]));
  const t=el('span','','cz-toggle-text');t.append(el('span',label,'cz-toggle-label'));if(hint)t.append(el('span',hint,'cz-hint'));
  b.append(t,el('span','','cz-knob'));b.onclick=()=>save({[key]:!settings[key]});return b;
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
  const head=el('header','','cz-head');head.append(el('h1','自訂'),el('p','所有設定會跟著帳號同步到其他裝置；上傳的圖片只存在這台裝置。','cz-hint'));wrap.append(head);
  const th=section('一鍵主題','一次換好桌布、強調色、色調和文字顏色；之後每一項仍可單獨調整。');
  const thg=el('div','','cz-grid cz-grid-theme');thg.setAttribute('role','radiogroup');thg.setAttribute('aria-label','一鍵主題');
  THEMES.forEach(t=>{const on=Object.entries(t.set).every(([k,v])=>s[k]===v);
   thg.append(swatch('theme',t.name,on,chip=>{chip.classList.add('cz-theme-chip');chip.style.background=t.set.color;chip.style.color=t.set.text;chip.style.boxShadow='inset 0 -6px 0 '+t.set.accent;chip.textContent='Aa';chip.title=t.hint;},()=>save({...t.set})));});
  th.append(thg);
  const wp=section('桌布');const grid=el('div','','cz-grid');grid.setAttribute('role','radiogroup');grid.setAttribute('aria-label','桌布');
  for(const w of WALLPAPERS){
   if(w.id==='image'&&!hasImage)continue;
   if(w.id==='custom'){
    const label=el('label','','cz-swatch cz-wall-custom'),chip=el('span','','cz-chip cz-wall'),pick=el('input');pick.type='color';pick.value=s.color;pick.setAttribute('aria-label','自選桌布顏色');
    chip.style.background=s.color;label.setAttribute('aria-checked',String(s.wallpaper==='custom'));label.append(chip,pick,el('span',w.name,'cz-name'));
    pick.oninput=()=>{chip.style.background=pick.value;settings.color=pick.value;settings.wallpaper='custom';apply(false);};pick.onchange=()=>save({wallpaper:'custom',color:pick.value});
    grid.append(label);continue;
   }
   grid.append(swatch('wallpaper',w.name,s.wallpaper===w.id,chip=>{chip.classList.add('cz-wall');chip.style.background=w.id==='image'?'url("'+local.get(IMAGE)+'") center/cover':w.color||w.css+', #000';},()=>save({wallpaper:w.id})));
  }
  wp.append(grid);
  const wallNow=WALLPAPERS.find(w=>w.id===s.wallpaper);
  const wallHex=el('div','','cz-row');wallHex.append(hexField('桌布色碼',s.wallpaper==='custom'?s.color:wallNow&&wallNow.color||s.color,
   h=>{settings.color=h;settings.wallpaper='custom';const c=panel.querySelector('.cz-wall-custom .cz-chip');if(c)c.style.background=h;apply(false);},h=>save({wallpaper:'custom',color:h})));
  wp.append(wallHex);
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
  const acHex=el('div','','cz-row');acHex.append(hexField('強調色色碼',s.accent||'#a9c8ff',h=>{settings.accent=h;apply(false);},h=>save({accent:h})));ac.append(acHex);
  const tn=section('主題色調','為玻璃面板與導覽列加上淡淡的顏色。');const tg=el('div','','cz-grid cz-grid-color');tg.setAttribute('role','radiogroup');tg.setAttribute('aria-label','主題色調');
  TONES.forEach(([id,name,c])=>tg.append(swatch('tone',name,s.tone===id,chip=>{chip.style.background='rgb('+c.map(v=>Math.round(v*.35+11*.65)).join(',')+')';},()=>save({tone:id}))));tn.append(tg);
  const tx=section('文字','字型、大小、顏色與粗細會套用到整個網站。');
  tx.append(el('h3','字型','cz-sub'));
  const fg=el('div','','cz-grid cz-grid-font');fg.setAttribute('role','radiogroup');fg.setAttribute('aria-label','字型');
  FONTS.forEach(f=>fg.append(swatch('font',f.name,s.font===f.id,chip=>{chip.classList.add('cz-font-chip');chip.textContent='永 Aa';chip.style.fontFamily=f.stack||"'Roboto','Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif";},()=>save({font:f.id}))));
  tx.append(fg);
  if(s.font!=='default'&&FONTS.find(f=>f.id===s.font).web)tx.append(el('p','黑體、明體、楷體需要網路下載字型；離線時會改用裝置內建的相近字型。','cz-hint'));
  const sl=el('label','','cz-slider'),si=el('input'),sv=el('span',s.size+'%','cz-value');si.type='range';si.min='85';si.max='130';si.step='5';si.value=String(s.size);si.setAttribute('aria-label','文字大小');
  si.oninput=()=>{sv.textContent=si.value+'%';settings.size=Number(si.value);apply(false);};si.onchange=()=>save({size:Number(si.value)});sl.append(el('span','文字大小'),si,sv);tx.append(sl);
  tx.append(el('p','預覽：勞工健康保護規則 第 6 條 · Aa Bb 123','cz-preview'));
  tx.append(el('h3','文字顏色','cz-sub'),el('p','換掉白色與灰色的內文；紅綠等有意義的顏色維持原樣。','cz-hint'));
  const tg2=el('div','','cz-grid cz-grid-color');tg2.setAttribute('role','radiogroup');tg2.setAttribute('aria-label','文字顏色');
  TEXTS.forEach(([name,hex])=>tg2.append(swatch('text',name,s.text===hex,chip=>{chip.style.background=hex||'#edf3fb';if(!hex)chip.classList.add('cz-chip-default');},()=>save({text:hex}))));
  const tc=el('label','','cz-swatch cz-custom'),tci=el('input');tci.type='color';tci.value=s.text||'#ffffff';tci.setAttribute('aria-label','自訂文字顏色');tci.oninput=()=>{settings.text=tci.value;apply(false);};tci.onchange=()=>save({text:tci.value});
  tc.setAttribute('aria-checked',String(!!s.text&&!TEXTS.some(([,h])=>h===s.text)));tc.append(tci,el('span','自訂','cz-name'));tg2.append(tc);tx.append(tg2);
  const txHex=el('div','','cz-row');txHex.append(hexField('文字顏色色碼',s.text||'#ffffff',h=>{settings.text=h;apply(false);},h=>save({text:h})));tx.append(txHex);
  tx.append(toggle('粗體文字','所有文字加粗一級，較好閱讀。','bold'));
  const ot=section('其他');ot.append(toggle('減少動態效果','關閉翻牌、滑動與淡入淡出等動畫。','motion'));
  const foot=el('div','','cz-row cz-foot'),reset=el('button','全部恢復預設','cz-btn');reset.type='button';reset.onclick=()=>{save({...DEFAULTS});status.textContent='已恢復預設。';};
  status=status||el('p','','cz-status');status.setAttribute('role','status');foot.append(reset);wrap.append(foot,status);panel.scrollTop=scroll;
 }
 function show(){
  panel=document.getElementById('customize-panel');
  // Small font slices for the 字型 previews only (the text= parameter keeps them to a few glyphs).
  if(!document.getElementById('cz-webfont-preview')){const l=document.createElement('link');l.id='cz-webfont-preview';l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Noto+Sans+TC&family=Noto+Serif+TC&family=LXGW+WenKai+TC&text='+encodeURIComponent('永Aa')+'&display=swap';document.head.append(l);}
  render();
 }
 window.ScholarCustomize={show,THEMES,get settings(){return {...settings};},WALLPAPERS,ACCENTS,TONES,FONTS,TEXTS,clean,hexOf,recolor};
})();
