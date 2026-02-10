/* HikeTracker: Real GPS + Smooth Demo Mode */

const SETTINGS = {
  demoRadius: 0.0005, // Радиус круга
};

let watchId = null;       
let demoInterval = null;  
let timerInterval = null; 
let seconds = 0;
let currentStream = null;
let currentHikePhotos = [];

let map = null;
let userMarker = null;
let routeLine = null;
let routeCoords = []; 
let currentLat = 0;
let currentLng = 0;
let isDemoMode = false;

const getEl = (id) => document.getElementById(id);

if ('serviceWorker' in navigator) {
  const swPath = window.location.pathname.includes('views') ? '../sw.js' : 'sw.js';
  navigator.serviceWorker.register(swPath).catch(console.error);
}

// === HISTORIA ===
window.renderAllData = function() {
  const history = JSON.parse(localStorage.getItem('savedHikes') || "[]");
  if (getEl('hikesCount')) getEl('hikesCount').textContent = history.length;
  if (getEl('totalDistance')) {
    const total = history.reduce((sum, h) => sum + parseFloat(h.distance || 0), 0);
    getEl('totalDistance').textContent = total.toFixed(1);
  }

  const list = getEl('saved-list') || getEl('recentHikes');
  if (list) {
    if (history.length === 0) {
      list.innerHTML = "<li style='padding:15px;'>Brak zapisanych wędrówek</li>";
    } else {
      const isHistoryPage = !!getEl('saved-list');
      const items = isHistoryPage ? [...history].reverse() : history.slice(-3).reverse();
      list.innerHTML = items.map(h => `
        <li class="card" style="margin-bottom:15px; border-left:5px solid var(--primary); list-style:none; background: #fff; padding: 15px; border-radius: 12px; box-shadow: var(--shadow);">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
              <div style="font-size:1.1rem; font-weight:bold; color:var(--primary);">${h.date}</div>
              <div style="margin:5px 0; color:var(--text-light); font-size: 0.9rem;">
                ⏱ ${h.time} | 📏 ${h.distance} km
              </div>
              ${h.photos && h.photos.length > 0 ? `
                <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                  ${h.photos.map(p => `<img src="${p}" onclick="window.zoomPhoto('${p}')" style="width:60px; height:60px; object-fit:cover; border-radius:6px; cursor:pointer; border:1px solid #ddd;">`).join('')}
                </div>
              ` : ''}
            </div>
            ${isHistoryPage ? `<button onclick="deleteHike(${h.id})" style="background:#ff4d4d; color:white; border:none; padding:6px 10px; border-radius:6px; cursor:pointer;">Usuń</button>` : ''}
          </div>
        </li>
      `).join('');
    }
  }
};

window.zoomPhoto = function(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:flex; align-items:center; justify-content:center; z-index:2000; cursor:zoom-out;`;
  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'max-width:95%; max-height:95%; border-radius:8px;';
  overlay.appendChild(img);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
};

// === MAPA I LOGIKA ===
function initMap(lat, lng) {
  if (map) return;
  map = L.map('trackingMap').setView([lat, lng], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  userMarker = L.marker([lat, lng]).addTo(map);
  routeLine = L.polyline([], {color: '#d32f2f', weight: 4}).addTo(map);
}

function updateMapPosition(lat, lng) {
  if (!map) return initMap(lat, lng);
  const newLatLng = [lat, lng];
  userMarker.setLatLng(newLatLng);
  if (!isDemoMode || seconds % 5 === 0) map.panTo(newLatLng);
  routeCoords.push(newLatLng);
  routeLine.setLatLngs(routeCoords);
  if(getEl('pointsCount')) getEl('pointsCount').textContent = routeCoords.length;
}

function startCommon() {
  seconds = 0; currentHikePhotos = []; routeCoords = [];
  if (getEl('photoGallery')) getEl('photoGallery').innerHTML = '';
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    seconds++;
    const time = new Date(seconds * 1000).toISOString().substr(11, 8);
    if (getEl('liveTimer')) getEl('liveTimer').textContent = time;
  }, 1000);
  getEl('startTracking').disabled = true;
  getEl('startDemo').disabled = true;
  getEl('stopTracking').disabled = false;
  getEl('saveHike').disabled = false;
}

window.startRealTracking = function() {
  if (!navigator.geolocation) return alert("Brak GPS");
  isDemoMode = false; startCommon();
  navigator.geolocation.getCurrentPosition(pos => initMap(pos.coords.latitude, pos.coords.longitude));
  watchId = navigator.geolocation.watchPosition(pos => {
    updateMapPosition(pos.coords.latitude, pos.coords.longitude);
    if (getEl('liveSpeed')) getEl('liveSpeed').textContent = (pos.coords.speed * 3.6 || 0).toFixed(1);
    const distEl = getEl('liveDistance');
    if (distEl && pos.coords.speed > 0.5) distEl.textContent = (parseFloat(distEl.textContent) + 0.001).toFixed(3);
  }, null, { enableHighAccuracy: true });
};

window.startDemoMode = function() {
  isDemoMode = true; startCommon();
  navigator.geolocation.getCurrentPosition(pos => {
    const sLat = pos.coords.latitude, sLng = pos.coords.longitude;
    initMap(sLat, sLng);
    demoInterval = setInterval(() => {
      const t = seconds * 0.2; // Плавность движения
      currentLat = sLat + (Math.sin(t) * SETTINGS.demoRadius);
      currentLng = sLng + (Math.cos(t) * SETTINGS.demoRadius * 1.5);
      updateMapPosition(currentLat, currentLng);
      if (getEl('liveDistance')) getEl('liveDistance').textContent = (parseFloat(getEl('liveDistance').textContent) + 0.003).toFixed(3);
      if (getEl('liveSpeed')) getEl('liveSpeed').textContent = "4.5";
    }, 1000);
  });
};

window.stopAll = function() {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  if (demoInterval) clearInterval(demoInterval);
  if (timerInterval) clearInterval(timerInterval);
  getEl('startTracking').disabled = false;
  getEl('startDemo').disabled = false;
  getEl('stopTracking').disabled = true;
};

window.saveHikeData = function() {
  const hike = {
    id: Date.now(),
    date: new Date().toLocaleDateString('pl-PL') + ' ' + new Date().toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'}),
    distance: getEl('liveDistance')?.textContent || "0.0",
    time: getEl('liveTimer')?.textContent || "00:00:00",
    photos: currentHikePhotos
  };
  const history = JSON.parse(localStorage.getItem('savedHikes') || "[]");
  history.push(hike);
  localStorage.setItem('savedHikes', JSON.stringify(history));
  alert("Wędrówka zapisana!");
  window.location.href = "../index.html";
};

// === KAMERA ===
window.initCamera = async function() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    getEl('cameraPreview').srcObject = stream;
    currentStream = stream;
    getEl('enableCamera').disabled = true;
    getEl('disableCamera').disabled = false;
  } catch (e) { alert("Błąd kamery"); }
};

window.takePhoto = function() {
  const v = getEl('cameraPreview');
  if (!v.srcObject) return alert("Włącz kamerę!");
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = (v.videoHeight/v.videoWidth)*800;
  canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/jpeg', 0.8);
  currentHikePhotos.push(data);
  const img = document.createElement('img');
  img.src = data; img.style.cssText = "width:70px;height:70px;object-fit:cover;margin:5px;border-radius:8px;cursor:pointer;";
  img.onclick = () => window.zoomPhoto(data);
  getEl('photoGallery').appendChild(img);
};

window.addEventListener('load', () => {
  window.renderAllData();
  const bind = (id, fn) => { if (getEl(id)) getEl(id).onclick = fn; };
  bind('startTracking', window.startRealTracking);
  bind('startDemo', window.startDemoMode);
  bind('stopTracking', window.stopAll);
  bind('saveHike', window.saveHikeData);
  bind('enableCamera', window.initCamera);
  bind('takePhoto', window.takePhoto);
  bind('disableCamera', () => {
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());
    getEl('enableCamera').disabled = false;
    getEl('disableCamera').disabled = true;
  });
});