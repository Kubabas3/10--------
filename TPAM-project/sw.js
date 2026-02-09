const CACHE_NAME = 'hike-tracker-cache-v3'; // Изменили версию!
const PRECACHE = [
  'index.html', 
  'styles.css', 
  'app.js', 
  'manifest.json', 
  'views/native.html', 
  'views/offline.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Принудительно обновляем SW
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim(); // Немедленно берем контроль над страницей
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  
  // Стратегия: Сначала сеть, если нет интернета — кэш
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('views/offline.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});