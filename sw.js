/* Retire legacy offline caching. Keep this URL for already-installed workers. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await Promise.all((await caches.keys()).filter(key=>key.startsWith('scholar-')).map(key=>caches.delete(key)));
 await self.clients.claim();
 await self.registration.unregister();
})()));
// During migration, every request goes to the network without a stored response.
self.addEventListener('fetch',event=>{
 if(event.request.method==='GET'&&new URL(event.request.url).origin===self.location.origin)
  event.respondWith(fetch(event.request,{cache:'no-store'}));
});
