// Minimal offline shell cache. Capture must work even with a flaky connection -
// the moment of intent doesn't wait for a network round-trip.

const CACHE = "blurt-capture-v0.1.1";
const ASSETS = ["./index.html", "./app.js", "./style.css", "./manifest.json", "./icon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
