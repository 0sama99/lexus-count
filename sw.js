// Offline support: the app opens and works with no internet once it has been opened online one time.
const VERSION = "lexus-count-v3";
const SHELL = ["./", "./index.html", "./config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./logo-white.png"];
const FBV = "10.12.2";
const CDN = ["app", "auth", "firestore"].map(n => `https://www.gstatic.com/firebasejs/${FBV}/firebase-${n}.js`);

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    await Promise.all(CDN.map(u => c.add(new Request(u, { mode: "cors" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

function withTimeout(p, ms) {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then(v => { clearTimeout(t); res(v); }, err => { clearTimeout(t); rej(err); }); });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App files: try the network briefly (to pick up updates), fall back to the saved copy.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        const res = await withTimeout(fetch(req), 3500);
        if (res && res.ok) c.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await c.match(req, { ignoreSearch: true }) || (req.mode === "navigate" ? await c.match("./index.html") : null);
        return hit || Response.error();
      }
    })());
    return;
  }

  // Pinned library files never change: saved copy first.
  const lib = (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) ||
              (url.hostname === "cdnjs.cloudflare.com" && url.pathname.includes("/xlsx/"));
  if (lib) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
      return res;
    })());
  }
  // Everything else (Firebase data traffic) goes straight to the network.
});
