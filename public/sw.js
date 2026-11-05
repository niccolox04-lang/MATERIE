/**
 * Service worker: rende utilizzabile la web-app in classe SENZA rete stabile.
 *
 * Strategia:
 *  - shell statica (html/css/js/manifest/icona): cache-first con aggiornamento
 *    in background (stale-while-revalidate);
 *  - GET /api/*: network-first con fallback alla cache (i nodi già visitati
 *    restano leggibili offline; quelli mai visitati no, senza fingere);
 *  - POST e altre method: pass-through, MAI messi in cache (compose/progress/ask
 *    sono operazioni vive sul server, non risorse).
 *
 * Nessuna dipendenza. Aggiorna CACHE_VERSION a ogni rilascio che cambi risorse.
 */
const CACHE_VERSION = "v1";
const CACHE = `md-shell-${CACHE_VERSION}`;

const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/laboratorio.html",
  "/laboratorio.js",
  "/laboratorio.css",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // POST ecc. vanno sempre al server

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // esterno: mai cachato

  // API GET: prima la rete, poi la cache (offline → ultimo stato noto)
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { /* quota */ });
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || new Response(
          JSON.stringify({ error: "offline", note: "Risorsa non disponibile offline: mai visitata con la rete attiva." }),
          { status: 503, headers: { "content-type": "application/json; charset=utf-8" } }
        )))
    );
    return;
  }

  // Shell statica: cache-first con revalidazione in background
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { /* quota */ });
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
