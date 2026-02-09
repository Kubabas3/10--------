const CACHE_NAME = 'hike-tracker-v5'; // Подняли версию
const PRECACHE = [
  'index.html', 
  'styles.css', 
  'app.js', 
  'manifest.json',
  'views/native.html', 
  'views/offline.html'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.map(k => k !== CACHE_NAME && caches.delete(k))
  )));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // ИСПРАВЛЕНИЕ: Fallback только для HTML-страниц
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('views/offline.html'))
    );
    return;
  }

  // Для всего остального (js, css, img): сначала кеш, потом сеть
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});