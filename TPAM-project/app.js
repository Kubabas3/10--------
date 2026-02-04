/* App script: rejestracja SW, geolokalizacja, kamera, powiadomienie offline, prosta nawigacja SPA, tracking wędrówki */

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker zarejestrowany');
    } catch (e) {
      console.warn('Rejestracja Service Workera nie powiodła się:', e);
    }
  }
}

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 5000);
}

function extractMain(htmlText){
  const m = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(htmlText);
  return m ? m[1] : htmlText;
}

async function loadPage(url, addToHistory = true){
  try{
    const res = await fetch(url, {cache: 'no-cache'});
    if (!res.ok) throw new Error('Network response was not ok');
    const text = await res.text();
    const mainHtml = extractMain(text);
    const main = document.querySelector('main');
    if (main) main.innerHTML = mainHtml;
    if (addToHistory) history.pushState({url}, '', url);
    // re-initialize dynamic behaviors on the newly loaded content
    bindDynamic();
  }catch(e){
    console.warn('Nie można załadować strony, używam offline:', e);
    // try to load offline page from cache
    try{
      const offlineRes = await fetch('/views/offline.html');
      const t = await offlineRes.text();
      const mainHtml = extractMain(t);
      const main = document.querySelector('main');
      if (main) main.innerHTML = mainHtml;
      bindDynamic();
    }catch(err){
      showToast('Brak połączenia i brak offline strony.');
    }
  }
}

function bindNavigation(){
  document.querySelectorAll('nav a[href]').forEach(a => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      // internal navigation only
      if (href && !href.startsWith('http') && !href.startsWith('mailto:')){
        e.preventDefault();
        // Resolve relative hrefs against current location
        try {
          const resolved = new URL(href, location.href);
          // If page is opened via file://, do a full navigation instead of SPA fetch
          if (location.protocol === 'file:') {
            window.location.href = resolved.href;
            return;
          }
          // Use pathname (keeps site-root relative)
          loadPage(resolved.pathname + resolved.search + resolved.hash);
        } catch (err) {
          // Fallback: use simple normalization
          const normalizedHref = href.startsWith('/') ? href : ('/' + href);
          loadPage(normalizedHref);
        }
      }
    });
  });
}

// Tracking variables
let isTracking = false;
let startTime = null;
let positions = [];
let timerInterval = null;
let map = null;
let markers = [];
let photos = []; // {dataUrl, lat, lng, time}
let watchId = null;
let trackPolyline = null;
let photoMarkers = [];
let camStream = null; // Global camera stream

// Helper functions for tracking
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function calculateDistance(pos1, pos2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
  const dLon = (pos2.lng - pos1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(pos1.lat * Math.PI / 180) * Math.cos(pos2.lat * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

function updateStats() {
  if (!isTracking) return;
  const now = Date.now();
  const elapsed = Math.floor((now - startTime) / 1000);
  const timerEl = document.getElementById('liveTimer') || document.getElementById('hikeTimer');
  if (timerEl) timerEl.textContent = formatTime(elapsed);

  if (positions.length > 1) {
    let totalDist = 0;
    for (let i = 1; i < positions.length; i++) {
      totalDist += calculateDistance(positions[i-1], positions[i]);
    }
    const distEl = document.getElementById('liveDistance') || document.getElementById('hikeDistance');
    if (distEl) distEl.textContent = totalDist.toFixed(2);

    const speed = (totalDist / (elapsed / 3600)) || 0;
    const speedEl = document.getElementById('liveSpeed') || document.getElementById('hikeSpeed');
    if (speedEl) speedEl.textContent = speed.toFixed(1);
  }

  if (positions.length > 0) {
    const alt = positions[positions.length - 1].alt;
    const altEl = document.getElementById('liveAltitude') || document.getElementById('hikeAltitude');
    if (altEl) altEl.textContent = (alt !== null && alt !== undefined) ? alt : '-';
  }
}

function startTracking() {
  if (isTracking) return;
  if (!navigator.geolocation) {
    showToast('Geolokalizacja nie jest obsługiwana w tej przeglądarce.');
    return;
  }
  isTracking = true;
  startTime = Date.now();
  positions = [];
  markers = [];
  photos = [];
  photoMarkers = [];
  document.getElementById('startTracking').disabled = true;
  document.getElementById('stopTracking').disabled = false;
  document.getElementById('saveHike').disabled = true;

  // Initialize map if not already
  const trackingMap = document.getElementById('trackingMap');
  if (trackingMap && typeof L !== 'undefined' && !map) {
    map = L.map('trackingMap').setView([52.0691, 19.4800], 6); // view on Poland
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
  }

  // polyline for track
  if (map && !trackPolyline) {
    trackPolyline = L.polyline([], { color: '#2d5016' }).addTo(map);
  }

  // Start timer
  timerInterval = setInterval(updateStats, 1000);

  // Start geolocation watch
  watchId = navigator.geolocation.watchPosition((pos) => {
    const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude, alt: pos.coords.altitude };
    positions.push(latlng);
    const pc = document.getElementById('pointsCount'); if (pc) pc.textContent = positions.length;

    if (map) {
      const marker = L.circleMarker([latlng.lat, latlng.lng], { radius: 5, color: '#4a7c59' }).addTo(map);
      markers.push(marker);
      trackPolyline.addLatLng([latlng.lat, latlng.lng]);
      if (positions.length === 1) map.setView([latlng.lat, latlng.lng], 15);
    }
  }, (err) => {
    console.warn('Błąd geolokalizacji podczas śledzenia:', err);
    showToast('Błąd geolokalizacji: ' + err.message);
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 });
}

function stopTracking() {
  if (!isTracking) return;
  isTracking = false;
  clearInterval(timerInterval);
  if (watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  document.getElementById('startTracking').disabled = false;
  document.getElementById('stopTracking').disabled = true;
  document.getElementById('saveHike').disabled = false;
}

function saveHike() {
  if (positions.length === 0) return;
  const duration = Math.floor((Date.now() - startTime) / 1000);
  // compute distance
  let totalDist = 0;
  for (let i = 1; i < positions.length; i++) totalDist += calculateDistance(positions[i-1], positions[i]);
  const hikeData = {
    date: new Date().toISOString(),
    duration: duration,
    distance: parseFloat(totalDist.toFixed(2)),
    positions: positions,
    photos: photos
  };
  const hikes = JSON.parse(localStorage.getItem('hikes') || '[]');
  hikes.push(hikeData);
  localStorage.setItem('hikes', JSON.stringify(hikes));

  // Also save to savedHikes for history (summary)
  const summary = `Wędrówka ${new Date().toLocaleDateString()}: ${hikeData.distance.toFixed(2)} km, ${formatTime(hikeData.duration)}, ${photos.length} zdjęć`;
  const savedHikes = JSON.parse(localStorage.getItem('savedHikes') || '[]');
  savedHikes.push(summary);
  localStorage.setItem('savedHikes', JSON.stringify(savedHikes));

  showToast('Wędrówka zapisana!');
  // Reset visuals and data
  positions = [];
  markers.forEach(m => map.removeLayer(m)); markers = [];
  if (trackPolyline) { trackPolyline.setLatLngs([]); }
  photos = [];
  photoMarkers.forEach(pm => map.removeLayer(pm)); photoMarkers = [];
  const gallery = document.getElementById('photoGallery') || document.getElementById('hikePhotos'); if (gallery) gallery.innerHTML = '';
  const pc = document.getElementById('pointsCount'); if (pc) pc.textContent = '0';
  const timerEl = document.getElementById('liveTimer') || document.getElementById('hikeTimer'); if (timerEl) timerEl.textContent = '00:00:00';
  const distEl = document.getElementById('liveDistance') || document.getElementById('hikeDistance'); if (distEl) distEl.textContent = '0.0';
  const speedEl = document.getElementById('liveSpeed') || document.getElementById('hikeSpeed'); if (speedEl) speedEl.textContent = '0.0';
  const altEl = document.getElementById('liveAltitude') || document.getElementById('hikeAltitude'); if (altEl) altEl.textContent = '-';
  document.getElementById('saveHike').disabled = true;
}

function takePhoto() {
  const video = document.getElementById('cameraPreview') || document.getElementById('hikeCamera');
  if (!video || !video.srcObject) {
    showToast('Kamera nie jest uruchomiona');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imgData = canvas.toDataURL('image/jpeg');

  // attach to last known position
  const lastPos = positions.length ? positions[positions.length - 1] : null;
  const time = new Date().toISOString();
  const photoObj = { dataUrl: imgData, lat: lastPos ? lastPos.lat : null, lng: lastPos ? lastPos.lng : null, time };
  photos.push(photoObj);

  // add thumbnail
  const gallery = document.getElementById('photoGallery') || document.getElementById('hikePhotos');
  if (gallery) {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb card';
    const img = document.createElement('img'); img.src = imgData; img.alt = 'photo'; img.style.width = '100%';
    const meta = document.createElement('div'); meta.className = 'photo-meta';
    meta.textContent = `${lastPos ? `${lastPos.lat.toFixed(5)}, ${lastPos.lng.toFixed(5)}` : 'brak pozycji'} — ${new Date(time).toLocaleString()}`;
    const del = document.createElement('button'); del.textContent = 'Usuń zdjęcie'; del.className = 'secondary';
    del.addEventListener('click', () => {
      const idx = photos.indexOf(photoObj);
      if (idx !== -1) photos.splice(idx,1);
      wrap.remove();
      // remove marker
      const pm = photoMarkers[idx]; if (pm) { map.removeLayer(pm); photoMarkers.splice(idx,1); }
    });
    wrap.appendChild(img); wrap.appendChild(meta); wrap.appendChild(del);
    gallery.appendChild(wrap);
  }

  // add marker for photo
  if (map && lastPos) {
    const pm = L.marker([lastPos.lat, lastPos.lng]).addTo(map).bindPopup(`<img src="${imgData}" style="width:120px"><div>${new Date(time).toLocaleString()}</div>`);
    photoMarkers.push(pm);
  }
}

function bindDynamic(){
  // Bind navigation links again
  bindNavigation();

  // Tracking buttons
  const startBtn = document.getElementById('startTracking');
  const stopBtn = document.getElementById('stopTracking');
  const saveBtn = document.getElementById('saveHike');
  if (startBtn) startBtn.addEventListener('click', startTracking);
  if (stopBtn) stopBtn.addEventListener('click', stopTracking);
  if (saveBtn) saveBtn.addEventListener('click', saveHike);

  // Camera controls (enable/disable/take)
  const cameraPreview = document.getElementById('cameraPreview') || document.getElementById('hikeCamera');
  const enableBtn = document.getElementById('enableCamera');
  const disableBtn = document.getElementById('disableCamera');
  const takePhotoBtn = document.getElementById('takePhoto') || document.getElementById('takePhoto');
  if (enableBtn) {
    enableBtn.addEventListener('click', async () => {
      try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cameraPreview) cameraPreview.srcObject = camStream;
        if (disableBtn) disableBtn.disabled = false;
        if (enableBtn) enableBtn.disabled = true;
        showToast('Kamera włączona');
      } catch (e) {
        console.warn('Błąd kamery:', e);
        showToast('Nie można uruchomić kamery: ' + e.message);
      }
    });
  }
  if (disableBtn) {
    disableBtn.addEventListener('click', () => {
      if (camStream) {
        camStream.getTracks().forEach(t => t.stop());
        camStream = null;
      }
      if (cameraPreview) cameraPreview.srcObject = null;
      disableBtn.disabled = true;
      if (enableBtn) enableBtn.disabled = false;
      showToast('Kamera wyłączona');
    });
  }
  if (takePhotoBtn) {
    takePhotoBtn.addEventListener('click', takePhoto);
  }

  // reflect current camera state on buttons/preview
  try {
    if (enableBtn) enableBtn.disabled = !!camStream;
    if (disableBtn) disableBtn.disabled = !camStream;
    if (camStream && cameraPreview) cameraPreview.srcObject = camStream;
  } catch (e) {
    console.warn('Nie można ustawić stanu kamery:', e);
  }

  // Initialize map if on tracking page
  const trackingMap = document.getElementById('trackingMap');
  if (trackingMap && typeof L !== 'undefined' && !map) {
    map = L.map('trackingMap').setView([52.0691, 19.4800], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
  }

  // Legacy compatibility: render saved list if present
  const savedList = document.getElementById('saved-list');
  if (savedList){
    const items = JSON.parse(localStorage.getItem('savedHikes') || '[]');
    savedList.innerHTML = '';
    if (items.length === 0){
      const li = document.createElement('li'); li.textContent = 'Brak zapisanych wędrówek'; savedList.appendChild(li);
    } else {
      items.forEach(it => { const li = document.createElement('li'); li.textContent = it; savedList.appendChild(li); });
    }
  }
}

// Offline / online events
window.addEventListener('offline', () => {
  showToast('Brak połączenia sieciowego — pracujesz offline w górach');
  // opcjonalne powiadomienie systemowe
  if ('Notification' in window && Notification.permission === 'granted'){
    new Notification('Brak połączenia', { body: 'Pracujesz w trybie offline w górach.' });
  } else if ('Notification' in window && Notification.permission !== 'denied'){
    Notification.requestPermission().then(p => { if (p === 'granted') new Notification('Brak połączenia', { body: 'Pracujesz w trybie offline w górach.' }); });
  }
});
window.addEventListener('online', () => { showToast('Połączenie sieciowe przywrócone — synchronizacja danych wędrówki'); });

// popstate handle - for browser back/forward navigation
window.addEventListener('popstate', (e) => {
  const path = location.pathname === '/' ? '/index.html' : location.pathname;
  loadPage(path, false);
});

// Init
document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  bindDynamic();
});