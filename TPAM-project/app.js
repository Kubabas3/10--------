// 1. Service Worker
if ('serviceWorker' in navigator) {
  const path = window.location.pathname.includes('views') ? '../sw.js' : 'sw.js';
  navigator.serviceWorker.register(path).catch(err => console.log("SW Error"));
}

let watchId = null, timerInterval = null, seconds = 0;
let currentHikePhotos = [], routeCoords = [];
let currentLat = 52.2297, currentLng = 21.0122; 
let map = null, userMarker = null, routePath = null;

const getEl = (id) => document.getElementById(id);

// POPRAWKA: Niestandardowe okno potwierdzenia zamiast confirm()
 
function showCustomConfirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:10000; padding:20px;";
  
  const box = document.createElement('div');
  box.style.cssText = "background:white; padding:25px; border-radius:15px; text-align:center; max-width:300px; width:100%; box-shadow:0 10px 25px rgba(0,0,0,0.2);";
  
  const text = document.createElement('p');
  text.textContent = message;
  text.style.marginBottom = "20px";
  
  const btnOk = document.createElement('button');
  btnOk.textContent = "Tak, usuń";
  btnOk.style.cssText = "background:#ff4d4d; color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; margin-right:10px;";
  btnOk.onclick = () => { onConfirm(); overlay.remove(); };
  
  const btnNo = document.createElement('button');
  btnNo.textContent = "Anuluj";
  btnNo.style.cssText = "background:#eee; color:#333; border:none; padding:10px 20px; border-radius:8px; cursor:pointer;";
  btnNo.onclick = () => overlay.remove();
  
  box.append(text, btnOk, btnNo);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// HISTORIA I WYŚWIETLANIE 
function renderAllData() {
  const history = JSON.parse(localStorage.getItem('savedHikes') || "[]");
  if (getEl('hikesCount')) getEl('hikesCount').textContent = history.length;
  if (getEl('totalDistance')) {
    const total = history.reduce((sum, h) => sum + parseFloat(h.distance || 0), 0);
    getEl('totalDistance').textContent = total.toFixed(1);
  }

  const list = getEl('saved-list') || getEl('recentHikes');
  if (!list) return;

  list.textContent = ''; // Bezpieczne czyszczenie

  if (history.length === 0) {
    const li = document.createElement('li');
    li.textContent = "Brak zapisanych wędrówek";
    li.style.padding = "15px";
    list.appendChild(li);
    return;
  }

  const items = list.id === 'saved-list' ? [...history].reverse() : history.slice(-3).reverse();

  items.forEach(h => {
    const li = document.createElement('li');
    li.className = "card";
    li.style.cssText = "margin-bottom:15px; list-style:none; padding:15px; border-left:5px solid #2d5016; background:#fff; border-radius:10px;";

    const title = document.createElement('div');
    title.style.cssText = "font-weight:bold; color:#2d5016;";
    title.textContent = h.date;

    const info = document.createElement('div');
    info.style.cssText = "font-size:0.85rem; color:#666;";
    info.textContent = `⏱ ${h.time} | 📏 ${h.distance} km`;

    const photosDiv = document.createElement('div');
    photosDiv.style.cssText = "margin-top:10px; display:flex; flex-wrap:wrap;";

    (h.photos || []).forEach(p => {
      const img = document.createElement('img');
      img.src = p.url;
      img.style.cssText = "width:70px; height:70px; object-fit:cover; border-radius:8px; cursor:pointer; border:1px solid #ddd; margin-right:5px;";
      img.onclick = () => showPhotoMap(p.url, p.lat, p.lng);
      photosDiv.appendChild(img);
    });

    li.append(title, info, photosDiv);

    if (list.id === 'saved-list') {
      const delBtn = document.createElement('button');
      delBtn.textContent = "Usuń";
      delBtn.style.cssText = "background:#ff4d4d; color:white; border:none; padding:5px 10px; border-radius:6px; margin-top:10px; cursor:pointer;";
      delBtn.onclick = () => showCustomConfirm("Czy na pewno chcesz usunąć?", () => deleteHike(h.id));
      li.appendChild(delBtn);
    }
    list.appendChild(li);
  });
}

window.deleteHike = function(id) {
    let history = JSON.parse(localStorage.getItem('savedHikes') || "[]");
    history = history.filter(h => h.id !== id);
    localStorage.setItem('savedHikes', JSON.stringify(history));
    renderAllData();
};

window.showPhotoMap = function(url, lat, lng) {
    const overlay = document.createElement('div');
    overlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:10000; padding:15px;";
    
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = "max-width:95%; max-height:50%; border-radius:10px; margin-bottom:15px; border:2px solid #fff;";

    const miniMap = document.createElement('div');
    miniMap.id = "miniMap";
    miniMap.style.cssText = "width:100%; max-width:450px; height:250px; border-radius:10px; background:#fff;";

    const closeBtn = document.createElement('button');
    closeBtn.textContent = "Zamknij";
    closeBtn.style.cssText = "margin-top:20px; padding:15px 35px; border-radius:30px; border:none; background:#fff; font-weight:bold; cursor:pointer;";
    closeBtn.onclick = () => overlay.remove();

    overlay.append(img, miniMap, closeBtn);
    document.body.appendChild(overlay);

    if (lat && lng && window.L) {
        setTimeout(() => {
            const m = L.map('miniMap', { zoomControl: false }).setView([lat, lng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
            L.marker([lat, lng]).addTo(m);
            setTimeout(() => m.invalidateSize(), 200);
        }, 300);
    }
};

// ŚLEDZENIE TRASY (LOGIKA BEZ ZMIAN)
function updatePosition(lat, lng) {
    currentLat = lat; currentLng = lng;
    const pos = [lat, lng];
    if (!map && getEl('trackingMap')) {
        map = L.map('trackingMap').setView(pos, 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
        userMarker = L.marker(pos).addTo(map);
        routePath = L.polyline([], {color: '#d32f2f', weight: 5}).addTo(map);
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
  seconds = 0; routeCoords = []; currentHikePhotos = [];
  timerInterval = setInterval(() => {
    seconds++;
    if (getEl('liveTimer')) getEl('liveTimer').textContent = new Date(seconds * 1000).toISOString().substr(11, 8);
  }, 1000);
  watchId = navigator.geolocation.watchPosition(pos => updatePosition(pos.coords.latitude, pos.coords.longitude));
  getEl('startTracking').disabled = true;
  getEl('stopTracking').disabled = false;
  getEl('saveHike').disabled = false;
}

function stopTracking() {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  if (timerInterval) clearInterval(timerInterval);
  getEl('startTracking').disabled = false;
  getEl('stopTracking').disabled = true;
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
  window.location.href = "offline.html";
}

async function toggleCamera(enable) {
    const video = getEl('cameraPreview');
    if (enable) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        getEl('enableCamera').disabled = true;
        getEl('disableCamera').disabled = false;
    } else {
        if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
        getEl('enableCamera').disabled = false;
        getEl('disableCamera').disabled = true;
    }
}

function takePhoto() {
  const v = getEl('cameraPreview');
  if (!v || !v.srcObject) return;
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  canvas.getContext('2d').drawImage(v, 0, 0, 640, 480);
  const url = canvas.toDataURL('image/jpeg', 0.7);
  currentHikePhotos.push({ url, lat: currentLat, lng: currentLng });
  const img = document.createElement('img');
  img.src = url;
  img.style.cssText = "width:60px; height:60px; object-fit:cover; margin:5px; border-radius:8px;";
  getEl('photoGallery').appendChild(img);
}

document.addEventListener('DOMContentLoaded', () => {
  renderAllData();
  if (getEl('startTracking')) getEl('startTracking').onclick = startTracking;
  if (getEl('stopTracking')) getEl('stopTracking').onclick = stopTracking;
  if (getEl('saveHike')) getEl('saveHike').onclick = saveHikeData;
  if (getEl('takePhoto')) getEl('takePhoto').onclick = takePhoto;
  if (getEl('enableCamera')) getEl('enableCamera').onclick = () => toggleCamera(true);
  if (getEl('disableCamera')) getEl('disableCamera').onclick = () => toggleCamera(false);
});