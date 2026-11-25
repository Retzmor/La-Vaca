const CACHE_NAME = "la-vaca-shell-v1";
const PRECACHE_URLS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navegación HTML: network-first para mantener salas y datos siempre frescos
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        return new Response(
          `<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Sin conexión — La Vaca</title>
  <style>
    body { margin:0; font-family:system-ui,-apple-system,sans-serif; background:#0B0E0D; color:#F2F5F3; display:flex; min-height:100vh; align-items:center; justify-content:center; padding:24px; text-align:center; }
    .card { max-width:380px; background:#131816; border:1px solid #242E2A; border-radius:24px; padding:28px; }
    h1 { font-size:20px; margin:0 0 8px; }
    p { font-size:14px; color:#94A39D; line-height:1.5; margin:0 0 20px; }
    button { background:#10B981; color:#041F15; border:0; border-radius:14px; padding:12px 20px; font-weight:800; font-size:14px; cursor:pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>No tienes conexión a internet</h1>
    <p>La Vaca necesita señal para sincronizar tu sala en vivo. Revisa tu conexión e intenta de nuevo.</p>
    <button onclick="location.reload()">Reintentar</button>
  </div>
</body>
</html>`,
          {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }
        );
      })
    );
    return;
  }

  // Recursos estáticos propios: network-first con respaldo en caché
  if (
    url.pathname.startsWith("/_next/static/") ||
    PRECACHE_URLS.includes(url.pathname)
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
