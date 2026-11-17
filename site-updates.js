/* Update complete offline shells without interrupting in-progress edits. */
(() => {
 'use strict';
 if(!('serviceWorker' in navigator)||location.protocol!=='https:')return;
 let edited=false,ready=false,reloading=false,registration=null,checking=false;
 const existing=navigator.serviceWorker.controller;
 const dirty=()=>edited||[...document.querySelectorAll('textarea,input:not([type=search]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio])')].some(n=>n.value&&n.value!==n.defaultValue);
 document.addEventListener('input',e=>{if(e.target.matches('textarea,[contenteditable=true],input:not([type=search])'))edited=true;},true);
 document.addEventListener('change',e=>{if(e.target.matches('select,input[type=checkbox],input[type=radio]'))edited=true;},true);
 function reload(){
  if(reloading)return;
  if(dirty()&&!confirm('更新會重新載入頁面。請先複製或儲存尚未完成的內容，確定更新？'))return;
  reloading=true;location.reload();
 }
 function offer(){
  if(!ready||document.hidden)return;
  if(!dirty()){reload();return;}
  if(document.getElementById('scholar-update-notice'))return;
  const notice=document.createElement('div');notice.id='scholar-update-notice';notice.setAttribute('role','status');
  notice.style.cssText='position:fixed;bottom:64px;right:12px;left:12px;z-index:10000;display:flex;gap:12px;align-items:center;justify-content:center;padding:12px;border:1px solid #9dc8ff66;border-radius:12px;background:#14202e;color:#edf2f8;font:13px/1.5 system-ui';
  const label=document.createElement('span');label.textContent='新版已就緒。請先儲存或複製編輯內容，再更新。';
  const button=document.createElement('button');button.type='button';button.className='sg-btn';button.textContent='更新頁面';button.onclick=reload;
  notice.append(label,button);document.body.append(notice);
 }
 function available(){ready=true;offer();}
 function watch(worker){
  if(!worker)return;
  const changed=()=>{if(worker.state==='activated'&&existing)available();};
  worker.addEventListener('statechange',changed);changed();
 }
 async function check(){
  if(!registration||checking)return;checking=true;
  try{
   await registration.update();
   if(existing&&registration.active&&registration.active.scriptURL===existing.scriptURL&&registration.active!==navigator.serviceWorker.controller)available();
  }catch(_){/* Offline: retain the complete installed shell. */}
  finally{checking=false;}
 }
 navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
  registration=reg;watch(reg.installing);watch(reg.waiting);
  reg.addEventListener('updatefound',()=>watch(reg.installing));
  if(existing&&reg.active&&reg.active!==existing)available();
  check();
 }).catch(()=>{});
 window.addEventListener('online',check);window.addEventListener('focus',check);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){offer();check();}});
 setInterval(check,60000);
})();
