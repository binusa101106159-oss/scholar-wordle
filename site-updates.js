/* Remove legacy offline caches; never register a caching worker again. */
(() => {
 if(!('serviceWorker' in navigator))return;
 const scope=new URL('./',location.href).href;
 navigator.serviceWorker.getRegistrations().then(regs=>Promise.all(regs.filter(reg=>reg.scope===scope).map(reg=>reg.unregister()))).catch(()=>{});
 if('caches' in window)caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('scholar-')).map(key=>caches.delete(key)))).catch(()=>{});
})();
