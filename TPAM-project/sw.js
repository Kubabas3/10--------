const CACHE_NAME = 'hiketracker-v2';

// Lista zasobów do zapamiętania w trybie offline
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

// Instalacja: zapisywanie kluczowych plików w pamięci podręcznej (cache)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Кэшируем ресурсы приложения');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Wymuszenie aktywacji nowej wersji bez czekania
});

// Aktywacja: czyszczenie starych wersji pamięci podręcznej
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// Obsługa zapytań sieciowych (Przechwytywanie żądań)
self.addEventListener('fetch', (event) => {
  
  // Specjalna obsługa map OpenStreetMap: zapobieganie błędom w trybie offline
  if (event.request.url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Zwraca pustą odpowiedź zamiast błędu, gdy nie ma internetu
        return new Response(''); 
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Jeśli plik jest w cache, użyj go. Jeśli nie, pobierz z sieci.
      return response || fetch(event.request).catch(() => {
        
        // Jeśli nie ma sieci, a użytkownik nawiguje do strony, pokaż offline.html
        if (event.request.mode === 'navigate') {
          return caches.match('/views/offline.html');
        }
      });
    })
  );
});