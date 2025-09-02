const CACHE_VERSION = 'ztkweb-v9';
const STATIC_CACHE = CACHE_VERSION + '-static';
const DATA_CACHE = CACHE_VERSION + '-data';
const REMOTE_CACHE = CACHE_VERSION + '-remote';

// Critical files for offline functionality
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
  '/assets/promo.js',
  '/assets/mc-status.js',
  '/assets/theme-toggle.js',
  '/assets/map-layers.js',
  '/assets/pwa-install.js',
  '/assets/contributors.js',
  '/assets/vendor/html2pdf.bundle.min.js',
  '/assets/logo_ztk.png',
  '/assets/favicon.png',
  '/assets/map_light.webp',
  '/assets/map_dark.webp',
  '/assets/map_political_light.webp',
  '/assets/map_political_dark.webp',
  '/assets/promo-default.png'
];
const DATA_ASSETS = [
  '/assets/stations.json',
  '/assets/lines.json',
  '/contributors.md'
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
  // Auto-update: reload open tabs to load new assets
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of clients) {
          try { client.navigate(client.url); } catch {}
        }
      })
  );
});

// Strategy: 
// - JSON (assets/stations.json, assets/lines.json): network-first with cache fallback
// - Others: cache-first
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isRemoteRaw = url.origin === 'https://raw.githubusercontent.com';

  if (isSameOrigin && /\/assets\/(stations|lines)\.json$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE, event));
    return;
  }

  // External promotions schedule (raw.githubusercontent.com) – SWR cache with offline fallback
  if (isRemoteRaw && /\/KibelSMP\/ZTKweb-promotions\/refs\/heads\/main\/promotions\.json$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, REMOTE_CACHE, event, { ignoreSearch: false }));
    return;
  }

  // Promotional images hosted on raw.githubusercontent.com – SWR cache (runtime)
  if (isRemoteRaw && req.destination === 'image') {
    event.respondWith(staleWhileRevalidate(req, REMOTE_CACHE, event, { ignoreSearch: false }));
    return;
  }

  // Images (any origin) – SWR cache; same-origin to STATIC_CACHE, external to REMOTE_CACHE
  if (req.destination === 'image') {
    const cacheName = isSameOrigin ? STATIC_CACHE : REMOTE_CACHE;
    event.respondWith(staleWhileRevalidate(req, cacheName, event, { ignoreSearch: false }));
    return;
  }

  // Use SWR for CSS/JS to propagate updates faster
  if (isSameOrigin && (req.destination === 'style' || req.destination === 'script')) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE, event));
    return;
  }

  if (isSameOrigin) {
  // for navigation: fallback to index.html when offline
  if (req.mode === 'navigate') {
      event.respondWith((async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(req, res.clone());
          return res;
        } catch {
  // Try the exact requested page from cache (e.g., export.html), then fallback to index.html
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

async function staleWhileRevalidate(request, cacheName, fetchEvent, opts = {}) {
  const cache = await caches.open(cacheName);
  const ignoreSearch = Object.prototype.hasOwnProperty.call(opts, 'ignoreSearch') ? !!opts.ignoreSearch : true;
  const cached = await cache.match(request, { ignoreSearch });
  const fetchPromise = fetch(request, { cache: 'no-store' })
    .then((res) => { cache.put(request, res.clone()); return res; })
    .catch(() => null);
  // return from cache immediately if present; update in the background
  if (cached) {
  if (fetchEvent && fetchEvent.waitUntil) fetchEvent.waitUntil(fetchPromise);
    return cached;
  }
  // no cache -> network or offline error
  const res = await fetchPromise;
  if (res) return res;
  return new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
}

// Broadcast info about SW update
self.addEventListener('message', (evt) => {
  if (evt.data === 'SKIP_WAITING') self.skipWaiting();
});
