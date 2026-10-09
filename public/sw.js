const CACHE = "outputtracer-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/ws/")) return;

  const cacheable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/p/") ||
    url.pathname === "/" ||
    url.pathname.startsWith("/projects") ||
    url.pathname.startsWith("/login");

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(request);
        if (fresh.ok && cacheable) {
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const home = await caches.match("/");
          if (home) return home;
        }
        throw error;
      }
    })()
  );
});
