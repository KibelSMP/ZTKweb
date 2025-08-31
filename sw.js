const CACHE_VERSION = 'ztkweb-v3';
const STATIC_CACHE = CACHE_VERSION + '-static';
const DATA_CACHE = CACHE_VERSION + '-data';

// Pliki krytyczne do działania offline
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/export.html',
  '/assets/app.css',
  '/assets/export-page.css',
  '/assets/map-renderer.js',
  '/assets/map-zoom.js',
  '/assets/route-search.js',
  '/assets/legend-renderer.js',
  '/assets/mc-status.js',
  '/assets/theme-toggle.js',
  '/assets/pwa-install.js',
  '/assets/vendor/html2pdf.bundle.min.js',
  '/assets/logo_ztk.png',
  '/assets/favicon.png',
  '/assets/map_light.webp',
  '/assets/map_dark.webp'
];
const DATA_ASSETS = [
  '/assets/stations.json',
  '/assets/lines.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(DATA_CACHE).then((cache) => cache.addAll(DATA_ASSETS))
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))))
      .then(async () => {
        await self.clients.claim();
        // Automatyczna aktualizacja: przeładuj otwarte karty, by wczytały nowe assety
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          try { client.navigate(client.url); } catch {}
        }
      })
  );
});

// Strategia: 
// - JSON (assets/stations.json, assets/lines.json): network-first z fallbackiem do cache
// - Inne: cache-first
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin && /\/assets\/(stations|lines)\.json$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE, event));
    return;
  }

  // Dla CSS/JS stosuj SWR, by szybciej aktualizować zmiany
  if (isSameOrigin && (req.destination === 'style' || req.destination === 'script')) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE, event));
    return;
  }

  if (isSameOrigin) {
    // dla nawigacji: fallback na index.html offline
  if (req.mode === 'navigate') {
      event.respondWith((async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(req, res.clone());
          return res;
        } catch {
      // Spróbuj dokładnie zażądanej strony z cache (np. export.html), a potem fallback do index.html
      const cachedReq = await caches.match(req, { ignoreSearch: true });
      if (cachedReq) return cachedReq;
      const cachedIndex = await caches.match('/index.html');
      return cachedIndex || Response.error();
        }
      })());
      return;
    }
    event.respondWith(cacheFirst(req));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const res = await fetch(request);
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, res.clone());
    return res;
  } catch {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName, fetchEvent) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const fetchPromise = fetch(request, { cache: 'no-store' })
    .then((res) => { cache.put(request, res.clone()); return res; })
    .catch(() => null);
  // natychmiast zwróć z cache jeśli jest, w tle aktualizuj
  if (cached) {
  if (fetchEvent && fetchEvent.waitUntil) fetchEvent.waitUntil(fetchPromise);
    return cached;
  }
  // brak cache → sieć lub błąd offline
  const res = await fetchPromise;
  if (res) return res;
  return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
}

// Broadcast info o aktualizacji SW
self.addEventListener('message', (evt) => {
  if (evt.data === 'SKIP_WAITING') self.skipWaiting();
});
