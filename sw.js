const CACHE_NAME = "scholar-games-v103";
const AMA_DATA_CACHE = "scholar-ama-data-v1";
const ASSETS = ["./calculator/calculator.css", "./calculator/calculator.js", "./ilo/ilo.css", "./ilo/ilo.js", "./ilo/films.json", "./ilo/study.json", "./ama/fast/index.json", "./peek-glass.css", "./peek-glass.js", "./reader-top.css", "./reader-top.js", "./", "./index.html", "./manifest.json", "./laws/laws.css", "./laws/laws.js", "./laws/index.json", "./guides/guides.css", "./guides/guides.js", "./guides/index.json", "./ama/ama.css", "./ama/ama.js", "./ama/index.json", "./review/review.css", "./review/review.js", "./notes/notes.css", "./notes/notes.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

// Take over open pages right away and drop old caches, so a new version shows on the next load.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== AMA_DATA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, always revalidating our own files with the server (skips the browser's
// 10-minute HTTP cache); fall back to the cached copy only when offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url=new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;
  // Hash-addressed AMA data is immutable and survives interface cache updates.
  if(sameOrigin && /\/ama\/fast\/[^/]+-[a-f0-9]{16}\.json\.gz$/.test(url.pathname)) {
    e.respondWith(caches.open(AMA_DATA_CACHE).then(async cache=>{
      const hit=await cache.match(e.request);if(hit)return hit;
      const response=await fetch(e.request);
      if(response.ok){const copy=response.clone();e.waitUntil(cache.put(e.request,copy));}
      return response;
    }));return;
  }
  e.respondWith(
    fetch(e.request, sameOrigin ? { cache: "no-cache" } : undefined)
      .then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});

