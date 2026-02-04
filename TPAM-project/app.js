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
        loadPage(href);
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
let photos = [];

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
  document.getElementById('hikeTimer').textContent = formatTime(elapsed);

  if (positions.length > 1) {
    let totalDist = 0;
    for (let i = 1; i < positions.length; i++) {
      totalDist += calculateDistance(positions[i-1], positions[i]);
    }
    document.getElementById('hikeDistance').textContent = totalDist.toFixed(2);

    const speed = (totalDist / (elapsed / 3600)).toFixed(1);
    document.getElementById('hikeSpeed').textContent = speed;
  }

  if (positions.length > 0) {
    document.getElementById('hikeAltitude').textContent = positions[positions.length - 1].alt || '-';
  }
}

function startTracking() {
  if (isTracking) return;
  isTracking = true;
  startTime = Date.now();
  positions = [];
  markers = [];
  photos = [];
  document.getElementById('startTracking').disabled = true;
  document.getElementById('stopTracking').disabled = false;
  document.getElementById('saveHike').disabled = true;

  // Initialize map if not already
  if (!map && typeof L !== 'undefined') {
    map = L.map('trackingMap').setView([52.2297, 21.0122], 13); // Default to Warsaw
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
  }

  // Start timer
  timerInterval = setInterval(updateStats, 1000);

  // Start geolocation watch
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition((pos) => {
      const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude, alt: pos.coords.altitude };
      positions.push(latlng);
      document.getElementById('pointsCount').textContent = positions.length;

      if (map) {
        const marker = L.marker([latlng.lat, latlng.lng]).addTo(map);
        markers.push(marker);
        if (positions.length === 1) {
          map.setView([latlng.lat, latlng.lng], 15);
        }
      }
    }, (err) => {
      console.warn('Błąd geolokalizacji podczas śledzenia:', err);
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 });
  }
}

function stopTracking() {
  if (!isTracking) return;
  isTracking = false;
  clearInterval(timerInterval);
  document.getElementById('startTracking').disabled = false;
  document.getElementById('stopTracking').disabled = true;
  document.getElementById('saveHike').disabled = false;
}

function saveHike() {
  if (positions.length === 0) return;
  const hikeData = {
    date: new Date().toISOString(),
    duration: Math.floor((Date.now() - startTime) / 1000),
    distance: parseFloat(document.getElementById('hikeDistance').textContent),
    positions: positions,
    photos: photos
  };
  const hikes = JSON.parse(localStorage.getItem('hikes') || '[]');
  hikes.push(hikeData);
  localStorage.setItem('hikes', JSON.stringify(hikes));

  // Also save to savedHikes for history
  const summary = `Wędrówka ${new Date().toLocaleDateString()}: ${hikeData.distance.toFixed(2)} km, ${formatTime(hikeData.duration)}, ${photos.length} zdjęć`;
  const savedHikes = JSON.parse(localStorage.getItem('savedHikes') || '[]');
  savedHikes.push(summary);
  localStorage.setItem('savedHikes', JSON.stringify(savedHikes));

  showToast('Wędrówka zapisana!');
  // Reset
  positions = [];
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  photos = [];
  document.getElementById('hikePhotos').innerHTML = '';
  document.getElementById('pointsCount').textContent = '0';
  document.getElementById('hikeTimer').textContent = '00:00:00';
  document.getElementById('hikeDistance').textContent = '0.0';
  document.getElementById('hikeSpeed').textContent = '0.0';
  document.getElementById('hikeAltitude').textContent = '-';
  document.getElementById('saveHike').disabled = true;
}

function takePhoto() {
  const video = document.getElementById('hikeCamera');
  if (!video || video.style.display === 'none') return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const imgData = canvas.toDataURL('image/jpeg');
  photos.push(imgData);
  const img = document.createElement('img');
  img.src = imgData;
  document.getElementById('hikePhotos').appendChild(img);
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

  // Camera for tracking
  const hikeCamera = document.getElementById('hikeCamera');
  const takePhotoBtn = document.getElementById('takePhoto');
  if (hikeCamera && takePhotoBtn) {
    takePhotoBtn.addEventListener('click', takePhoto);
    // Initialize camera
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
        hikeCamera.srcObject = stream;
      }).catch((err) => {
        console.warn('Nie można uzyskać dostępu do kamery:', err);
      });
    }
  }

  // Initialize map if on tracking page
  const trackingMap = document.getElementById('trackingMap');
  if (trackingMap && typeof L !== 'undefined' && !map) {
    map = L.map('trackingMap').setView([52.2297, 21.0122], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
  }

  // Legacy buttons (for compatibility)
  const getLocationBtn = document.getElementById('get-location');
  const locationResult = document.getElementById('location-result');
  if (getLocationBtn){
    getLocationBtn.addEventListener('click', () => {
      if (!navigator.geolocation){
        if (locationResult) locationResult.textContent = 'Geolokalizacja nie jest obsługiwana.';
        console.log('Geolocation not supported');
        return;
      }
      navigator.geolocation.getCurrentPosition((pos) => {
        const coords = `Szer: ${pos.coords.latitude.toFixed(6)}, Dł: ${pos.coords.longitude.toFixed(6)}`;
        console.log('Pozycja wędrówki:', coords);
        if (locationResult) locationResult.textContent = coords;
        // Save hike data
        const hikeData = `Pozycja wędrówki: ${coords} (${new Date().toLocaleString()})`;
        const items = JSON.parse(localStorage.getItem('savedHikes') || '[]');
        items.push(hikeData);
        localStorage.setItem('savedHikes', JSON.stringify(items));
        // Re-render if on history page
        const savedList = document.getElementById('saved-list');
        if (savedList) {
          savedList.innerHTML = '';
          if (items.length === 0){
            const li = document.createElement('li'); li.textContent = 'Brak zapisanych wędrówek'; savedList.appendChild(li);
          } else {
            items.forEach(it => { const li = document.createElement('li'); li.textContent = it; savedList.appendChild(li); });
          }
        }
      }, (err) => {
        console.warn('Błąd geolokalizacji:', err.message);
        if (locationResult) locationResult.textContent = `Błąd: ${err.message}`;
      }, { enableHighAccuracy: true, timeout: 10000 });
    });
  }

  const openCameraBtn = document.getElementById('open-camera');
  const stopCameraBtn = document.getElementById('stop-camera');
  const cameraPreview = document.getElementById('camera-preview');
  let stream = null;
  if (openCameraBtn){
    openCameraBtn.addEventListener('click', async () => {
      try{
        stream = await navigator.mediaDevices.getUserMedia({video:true});
        if (cameraPreview) {
          cameraPreview.srcObject = stream;
          cameraPreview.style.display = 'block';
        }
        if (stopCameraBtn) stopCameraBtn.style.display = 'inline-block';
        console.log('Kamera uruchomiona dla zdjęć wędrówki');
        // Save photo event
        const photoData = `Zdjęcie wędrówki zrobione: ${new Date().toLocaleString()}`;
        const items = JSON.parse(localStorage.getItem('savedHikes') || '[]');
        items.push(photoData);
        localStorage.setItem('savedHikes', JSON.stringify(items));
        // Re-render if on history page
        const savedList = document.getElementById('saved-list');
        if (savedList) {
          savedList.innerHTML = '';
          if (items.length === 0){
            const li = document.createElement('li'); li.textContent = 'Brak zapisanych wędrówek'; savedList.appendChild(li);
          } else {
            items.forEach(it => { const li = document.createElement('li'); li.textContent = it; savedList.appendChild(li); });
          }
        }
      }catch(e){
        console.warn('Błąd kamery:', e.message);
        alert('Brak dostępu do kamery: ' + e.message);
      }
    });
  }
  if (stopCameraBtn){
    stopCameraBtn.addEventListener('click', () => {
      if (stream){
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      if (cameraPreview) cameraPreview.style.display = 'none';
      stopCameraBtn.style.display = 'none';
    });
  }

  // saved-list rendering (if present)
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

// popstate handle
window.addEventListener('popstate', (e) => {
  loadPage(location.pathname, false);
});

// Init
document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  bindDynamic();
});