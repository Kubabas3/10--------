const CACHE_NAME = 'my-pwa-cache-v1';
const PRECACHE = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json', '/views/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Navigation requests (HTML pages): try network, fallback to cache offline page
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept') && req.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match('/views/offline.html'))
    );
    return;
  }

  // Other requests: try cache first, then network
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req)).catch(() => caches.match('/views/offline.html'))
  );
});