const CACHE_NAME = "scholar-games-v205";
const AMA_DATA_CACHE = "scholar-ama-data-v1";
const ASSETS = ["./app-loader.js", "./reader-performance.js", "./reader-tables.js", "./forms/forms.js", "./forms/forms.css", "./forms/data.json", "./calendar/calendar.css", "./calendar/calendar.js", "./calendar/roster.json", "./calculator/taiwan-calendar.json", "./iarc/iarc.js", "./iarc/iarc.css", "./iarc/data.json", "./calculator/california-occupations.json", "./calculator/california.js", "./calculator/california.css", "./calculator/california.json", "./assets/tailwind.css", "./calculator/overload.js", "./calculator/overload.css", "./glass-layer.js", "./liquid-clear.css", "./guides/table-layout.js", "./navigation.css", "./navigation.js", "./reading-performance.css", "./sync/state.js", "./sync/store.js", "./sync/client.js", "./sync/firebase-config.js", "./sync/sync.css", "./cases/cases.css", "./cases/cases.js", "./reader-layout.css", "./health/health.css", "./health/health.js", "./health/index.json", "./laws/search.css", "./laws/search.js", "./calculator/aaos.css", "./calculator/aaos.js", "./calculator/aaos.json", "./calculator/calculator.css", "./calculator/calculator.js", "./ilo/ilo.css", "./ilo/ilo.js", "./ilo/films.json", "./ilo/study.json", "./ama/fast/index.json", "./peek-glass.css", "./peek-glass.js", "./reader-top.css", "./reader-top.js", "./", "./index.html", "./manifest.json", "./laws/laws.css", "./laws/laws.js", "./laws/index.json", "./guides/guides.css", "./guides/guides.js", "./guides/index.json", "./ama/ama.css", "./ama/ama.js", "./ama/index.json", "./review/review.css", "./review/review.js", "./notes/notes.css", "./notes/notes.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));

});

// Activate after old pages close; never take over an editor or mix shell versions.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== AMA_DATA_CACHE).map((k) => caches.delete(k))))

  );
});

// Network first, always revalidating our own files with the server (skips the browser's
// 10-minute HTTP cache); fall back to the cached copy only when offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url=new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;
  // Never intercept or cache authentication, Firestore, or other cross-origin responses.
  if(!sameOrigin)return;
  // Hash-addressed AMA data is immutable and survives interface cache updates.
  if(sameOrigin && /\/ama\/fast\/[^/]+-[a-f0-9]{16}\.json\.gz$/.test(url.pathname)) {
    e.respondWith(caches.open(AMA_DATA_CACHE).then(async cache=>{
      const hit=await cache.match(e.request);if(hit)return hit;
      const response=await fetch(e.request);
      if(response.ok){const copy=response.clone();e.waitUntil(cache.put(e.request,copy));}
      return response;
    }));return;
  }
  const shellPath=url.pathname.slice(self.registration.scope ? new URL(self.registration.scope).pathname.length : 0);
  const shell=ASSETS.some(asset=>asset.replace(/^\.\//,'')===shellPath)||(e.request.mode==='navigate');
  e.respondWith(caches.open(CACHE_NAME).then(async cache=>{
    // A complete installed shell is immutable for this worker's lifetime.
    const key=e.request.mode==='navigate'?new URL('index.html',self.registration.scope).href:e.request.url;
    const hit=await cache.match(key,{ignoreSearch:shell});
    if(shell&&hit)return hit;
    try{
      const response=await fetch(e.request);
      if(response.ok)e.waitUntil(cache.put(e.request,response.clone()).catch(()=>{}));
      return response;
    }catch(error){if(hit)return hit;throw error;}
  }));
});

// Retry GitHub Pages deployment.

