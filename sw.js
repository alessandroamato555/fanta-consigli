// Fa funzionare l'app anche senza rete: prova sempre prima internet (dati freschi), se manca usa la copia salvata.
const CACHE = "fantaconsigli-v7";
const FILE = ["./", "index.html", "style.css", "motore.js", "app.js", "data/giornata.json", "data/listone.json", "manifest.json", "icona-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // "no-cache": chiede sempre al sito se c'è una versione nuova (il telefono altrimenti tiene la vecchia per 10 minuti)
    fetch(e.request, { cache: "no-cache" })
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
