const CACHE_NAME = 'hiketracker-v2';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/views/native.html',
  '/views/offline.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Кэшируем ресурсы приложения');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});


self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});


self.addEventListener('fetch', (event) => {
  
  if (event.request.url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        
        return new Response(''); 
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      
      return response || fetch(event.request).catch(() => {
        
        if (event.request.mode === 'navigate') {
          return caches.match('/views/offline.html');
        }
      });
    })
  );
});