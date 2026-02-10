/* HikeTracker: The Ultimate Multi-Tool Version */

// 1. Service Worker
if ('serviceWorker' in navigator) {
  const path = window.location.pathname.includes('views') ? '../sw.js' : 'sw.js';
  navigator.serviceWorker.register(path).catch(err => console.log("SW Error"));
}

// Глобальное состояние
let watchId = null, timerInterval = null, seconds = 0;
let currentHikePhotos = [], routeCoords = [];
let currentLat = 52.2297, currentLng = 21.0122; 
let map = null, userMarker = null, routePath = null;

const getEl = (id) => document.getElementById(id);

// === 1. ИСТОРИЯ И ОТОБРАЖЕНИЕ ===
function renderAllData() {
  const history = JSON.parse(localStorage.getItem('savedHikes') || "[]");
  if (getEl('hikesCount')) getEl('hikesCount').textContent = history.length;
  if (getEl('totalDistance')) {
    const total = history.reduce((sum, h) => sum + parseFloat(h.distance || 0), 0);
    getEl('totalDistance').textContent = total.toFixed(1);
  }

  const list = getEl('saved-list') || getEl('recentHikes');
  if (!list) return;

  if (history.length === 0) {
    list.innerHTML = "<li style='padding:15px;'>Brak zapisanych wędrówek</li>";
    return;
  }

  const items = list.id === 'saved-list' ? [...history].reverse() : history.slice(-3).reverse();
  list.innerHTML = items.map(h => {
    const photosHtml = (h.photos || []).map(p => `
      <div style="position:relative; display:inline-block; margin:5px;">
        <img src="${p.url}" onclick="showPhotoMap('${p.url}', ${p.lat}, ${p.lng})" 
             style="width:70px; height:70px; object-fit:cover; border-radius:8px; cursor:pointer; border:1px solid #ddd;">
      </div>`).join('');

    return `
      <li class="card" style="margin-bottom:15px; list-style:none; padding:15px; border-left:5px solid #2d5016; background:#fff; border-radius:10px;">
        <div style="font-weight:bold; color:#2d5016;">${h.date}</div>
        <div style="font-size:0.85rem; color:#666;">⏱ ${h.time} | 📏 ${h.distance} km</div>
        <div style="margin-top:10px; display:flex; flex-wrap:wrap;">${photosHtml}</div>
        ${list.id === 'saved-list' ? `<button onclick="deleteHike(${h.id})" style="background:#ff4d4d; color:white; border:none; padding:5px 10px; border-radius:6px; margin-top:10px; cursor:pointer;">Usuń</button>` : ''}
      </li>`;
  }).join('');
}

window.deleteHike = function(id) {
    if(!confirm("Usunąć?")) return;
    let history = JSON.parse(localStorage.getItem('savedHikes') || "[]");
    history = history.filter(h => h.id !== id);
    localStorage.setItem('savedHikes', JSON.stringify(history));
    renderAllData();
};

// Просмотр фото с картой
window.showPhotoMap = function(url, lat, lng) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:10000; padding:15px;`;
    overlay.innerHTML = `
        <img src="${url}" style="max-width:95%; max-height:50%; border-radius:10px; margin-bottom:15px; border:2px solid #fff;">
        <div id="miniMap" style="width:100%; max-width:450px; height:250px; border-radius:10px; background:#fff;"></div>
        <button id="closeBtn" style="margin-top:20px; padding:15px 35px; border-radius:30px; border:none; background:#fff; font-weight:bold; cursor:pointer;">Zamknij</button>
    `;
    document.body.appendChild(overlay);
    getEl('closeBtn').onclick = () => overlay.remove();

    if (lat && lng && window.L) {
        setTimeout(() => {
            const m = L.map('miniMap', { zoomControl: false }).setView([lat, lng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
            L.marker([lat, lng]).addTo(m);
            setTimeout(() => m.invalidateSize(), 200);
        }, 300);
    }
};

// === 2. ЛОГИКА ТРЕКИНГА (NATIVE.HTML) ===
function updatePosition(lat, lng) {
    currentLat = lat; currentLng = lng;
    const pos = [lat, lng];

    if (!map && getEl('trackingMap')) {
        map = L.map('trackingMap').setView(pos, 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        userMarker = L.marker(pos).addTo(map);
        routePath = L.polyline([], {color: '#d32f2f', weight: 5, opacity: 0.8}).addTo(map);
    }

    if (map) {
        userMarker.setLatLng(pos);
        map.panTo(pos);
        routeCoords.push(pos);
        routePath.setLatLngs(routeCoords);
        if (getEl('pointsCount')) getEl('pointsCount').textContent = routeCoords.length;
        if (getEl('liveDistance')) getEl('liveDistance').textContent = (routeCoords.length * 0.005).toFixed(3);
    }
}

function startTracking() {
  if (!navigator.geolocation) return alert("GPS niedostępny");
  seconds = 0; routeCoords = []; currentHikePhotos = [];
  if (getEl('photoGallery')) getEl('photoGallery').innerHTML = '';

  timerInterval = setInterval(() => {
    seconds++;
    const time = new Date(seconds * 1000).toISOString().substr(11, 8);
    if (getEl('liveTimer')) getEl('liveTimer').textContent = time;
  }, 1000);

  watchId = navigator.geolocation.watchPosition(pos => {
    updatePosition(pos.coords.latitude, pos.coords.longitude);
  }, null, { enableHighAccuracy: true });

  getEl('startTracking').disabled = true;
  getEl('stopTracking').disabled = false;
  getEl('saveHike').disabled = false;
}

function stopTracking() {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (timerInterval) clearInterval(timerInterval);
  getEl('startTracking').disabled = false;
  getEl('stopTracking').disabled = true;
}

// Кнопка ДЕМО
function runDemo() {
    startTracking();
    let step = 0;
    const demoInt = setInterval(() => {
        if (!getEl('stopTracking') || getEl('stopTracking').disabled) return clearInterval(demoInt);
        updatePosition(currentLat + 0.0003, currentLng + (step % 2 ? 0.0002 : -0.0002));
        step++;
        if (step > 30) clearInterval(demoInt);
    }, 1500);
}

function saveHikeData() {
  const hike = {
    id: Date.now(),
    date: new Date().toLocaleString('pl-PL'),
    distance: getEl('liveDistance')?.textContent || "0.0",
    time: getEl('liveTimer')?.textContent || "00:00:00",
    photos: currentHikePhotos 
  };
  const history = JSON.parse(localStorage.getItem('savedHikes') || "[]");
  history.push(hike);
  localStorage.setItem('savedHikes', JSON.stringify(history));
  window.location.href = "../index.html";
}

// === 3. КАМЕРА ===
async function toggleCamera(enable) {
    const video = getEl('cameraPreview');
    if (enable) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            video.srcObject = stream;
            getEl('enableCamera').disabled = true;
            getEl('disableCamera').disabled = false;
        } catch (e) { alert("Błąd kamery!"); }
    } else {
        const stream = video.srcObject;
        if (stream) stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        getEl('enableCamera').disabled = false;
        getEl('disableCamera').disabled = true;
    }
}

function takePhoto() {
  const v = getEl('cameraPreview');
  if (!v || !v.srcObject) return alert("Włącz kamerę!");
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  canvas.getContext('2d').drawImage(v, 0, 0, 640, 480);
  const url = canvas.toDataURL('image/jpeg', 0.7);
  currentHikePhotos.push({ url: url, lat: currentLat, lng: currentLng });
  const img = document.createElement('img');
  img.src = url;
  img.style.cssText = "width:60px; height:60px; object-fit:cover; margin:5px; border-radius:8px; border:2px solid #fff; box-shadow:0 2px 5px rgba(0,0,0,0.2);";
  getEl('photoGallery').appendChild(img);
}

// Инициализация событий
document.addEventListener('DOMContentLoaded', () => {
  renderAllData();
  if (getEl('startTracking')) getEl('startTracking').onclick = startTracking;
  if (getEl('stopTracking')) getEl('stopTracking').onclick = stopTracking;
  if (getEl('saveHike')) getEl('saveHike').onclick = saveHikeData;
  if (getEl('demoMode')) getEl('demoMode').onclick = runDemo;
  if (getEl('takePhoto')) getEl('takePhoto').onclick = takePhoto;
  if (getEl('enableCamera')) getEl('enableCamera').onclick = () => toggleCamera(true);
  if (getEl('disableCamera')) getEl('disableCamera').onclick = () => toggleCamera(false);
});