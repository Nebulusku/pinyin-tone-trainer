/* Offline cache: app files load fresh when online (cache is the offline fallback); audio clips are cached permanently. */
const VERSION = "ptt-v12";
const SHELL = ["./", "index.html", "app.js", "supabase-config.js", "login.js", "sync.js", "auth.js", "flashcards.js", "tone-engine.js", "lessons.js", "lessons-hsk1.js", "audio/manifest.js", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(SHELL.map(u => cache.add(u).catch(() => {})));
    importScripts("audio/manifest.js");
    await cache.addAll([...new Set(Object.values(AUDIO_FILES))].map(f => "audio/" + f)).catch(() => {});
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const isAudio = new URL(e.request.url).pathname.includes("/audio/") && !e.request.url.endsWith(".js");
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (isAudio && hit) return hit;
    return fetch(e.request, { cache: "no-cache" })
      .then(r => { if (r.ok && r.status === 200) cache.put(e.request, r.clone()); return r; })
      .catch(() => hit || Response.error());
  }));
});
