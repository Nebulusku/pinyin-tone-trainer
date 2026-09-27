/* Offline cache: app files load fresh when online (cache is the offline fallback); audio clips are cached permanently. */
importScripts("audio/manifest.js"); // top level: importScripts is only reliable here
const VERSION = "ptt-v25";
const SHELL = ["./", "index.html", "app.js", "supabase-config.js", "login.js", "sync.js", "auth.js", "flashcards.js", "worksheet-pics.js", "worksheets.js", "tone-model.js", "tone-engine.js", "lessons.js", "lessons-hsk1.js", "audio/manifest.js", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: "reload" skips the browser's HTTP cache, which could otherwise hand back a stale page
    await Promise.all(SHELL.map(u => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    // Audio never changes: reuse clips from the previous version's cache, download only the missing ones
    await Promise.all([...new Set(Object.values(AUDIO_FILES))].map(async f => {
      const url = "audio/" + f, old = await caches.match(url);
      return old ? cache.put(url, old) : cache.add(url).catch(() => {});
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  const isAudio = new URL(e.request.url).pathname.includes("/audio/") && !e.request.url.endsWith(".js");
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (isAudio && hit) return hit;
    // A page-load request can't be re-issued with options, so fetch its URL instead
    const req = e.request.mode === "navigate" ? new Request(e.request.url, { cache: "no-cache" }) : e.request;
    return fetch(req, e.request.mode === "navigate" ? undefined : { cache: "no-cache" })
      .then(r => { if (r.ok && r.status === 200) cache.put(e.request, r.clone()); return r; })
      .catch(() => hit || Response.error());
  }));
});
