/* HikeTracker: Final Polish Version with Photo Zoom */

if ('serviceWorker' in navigator) {
  const swPath = window.location.pathname.includes('views') ? '../sw.js' : 'sw.js';
  navigator.serviceWorker.register(swPath).catch(err => console.error("SW Error:", err));
}

let watchId = null;
let timerInterval = null;
let seconds = 0;
let currentStream = null;
let currentHikePhotos = [];

const getEl = (id) => document.getElementById(id);

// === 1. HISTORIA I STATYSTYKI ===
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
                ⏱ Czas: <strong>${h.time}</strong> | 📏 Dystans: <strong>${h.distance} km</strong>
              </div>
              ${h.photos && h.photos.length > 0 ? `
                <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                  ${h.photos.map(p => `<img src="${p}" onclick="window.zoomPhoto('${p}')" style="width:70px; height:70px; object-fit:cover; border-radius:6px; cursor:pointer; border:1px solid #ddd; transition: transform 0.2s;">`).join('')}
                </div>
              ` : '<div style="font-size:0.8rem; color:#999; margin-top:5px;">Brak zdjęć</div>'}
            </div>
            ${isHistoryPage ? `<button onclick="deleteHike(${h.id})" style="background:#ff4d4d; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer; font-weight:bold;">Usuń</button>` : ''}
          </div>
        </li>
      `).join('');
    }
  }
};

// Функция увеличения фото
window.zoomPhoto = function(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center;
    z-index: 1000; cursor: zoom-out; animation: fadeIn 0.3s ease;
  `;
  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = 'max-width: 95%; max-height: 95%; border-radius: 8px; box-shadow: 0 0 20px rgba(0,0,0,0.5);';
  
  overlay.appendChild(img);
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
};

window.deleteHike = function(id) {
  if (!confirm("Czy na pewno chcesz usunąć tę wędrówkę wraz ze zdjęciami?")) return;
  let history = JSON.parse(localStorage.getItem('savedHikes') || "[]");
  history = history.filter(h => h.id !== id);
  localStorage.setItem('savedHikes', JSON.stringify(history));
  window.renderAllData();
};

// === 2. KAMERA I ZDJĘCIA ===
window.initCamera = async function() {
  try {
    const video = getEl('cameraPreview');
    currentStream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: "environment" }, 
      audio: false 
    });
    video.srcObject = currentStream;
    getEl('enableCamera').disabled = true;
    getEl('disableCamera').disabled = false;
  } catch (err) {
    alert("Błąd kamery: " + err.message);
  }
};

window.stopCamera = function() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    getEl('cameraPreview').srcObject = null;
  }
  getEl('enableCamera').disabled = false;
  getEl('disableCamera').disabled = true;
};

window.takePhoto = function() {
  const video = getEl('cameraPreview');
  const gallery = getEl('photoGallery');
  
  if (!currentStream || !video.videoWidth) {
    alert("Najpierw włącz kamerę!");
    return;
  }

  const canvas = document.createElement('canvas');
  // Optymalny rozmiar zdjęcia
  canvas.width = 800;
  canvas.height = (video.videoHeight / video.videoWidth) * 800;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imageData = canvas.toDataURL('image/jpeg', 0.8);
  currentHikePhotos.push(imageData);

  const img = document.createElement('img');
  img.src = imageData;
  img.style.cssText = "width:80px; height:80px; object-fit:cover; margin:5px; border-radius:8px; cursor:pointer;";
  img.onclick = () => window.zoomPhoto(imageData);
  gallery.appendChild(img);
};

// === 3. ŚLEDZENIE I ZAPIS ===
window.startTracking = function() {
  if (!navigator.geolocation) return alert("Błąd: Brak GPS w Twoim urządzeniu.");
  
  seconds = 0;
  currentHikePhotos = [];
  if (getEl('photoGallery')) getEl('photoGallery').innerHTML = '';

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    seconds++;
    const time = new Date(seconds * 1000).toISOString().substr(11, 8);
    if (getEl('liveTimer')) getEl('liveTimer').textContent = time;
  }, 1000);

  watchId = navigator.geolocation.watchPosition(pos => {
    const distEl = getEl('liveDistance');
    if (distEl) {
      let cur = parseFloat(distEl.textContent) || 0;
      distEl.textContent = (cur + 0.005).toFixed(3); 
    }
  }, null, { enableHighAccuracy: true });

  getEl('startTracking').disabled = true;
  getEl('stopTracking').disabled = false;
  getEl('saveHike').disabled = false;
};

window.saveHikeData = function() {
  const hike = {
    id: Date.now(),
    date: new Date().toLocaleDateString('pl-PL') + ' ' + new Date().toLocaleTimeString('pl-PL', {hour: '2-digit', minute:'2-digit'}),
    distance: getEl('liveDistance')?.textContent || "0.0",
    time: getEl('liveTimer')?.textContent || "00:00:00",
    photos: currentHikePhotos
  };

  const history = JSON.parse(localStorage.getItem('savedHikes') || "[]");
  history.push(hike);
  
  try {
    localStorage.setItem('savedHikes', JSON.stringify(history));
  } catch (e) {
    alert("Błąd: Pamięć przeglądarki jest pełna. Usuń stare wędrówki, aby zwolnić miejsce.");
    return;
  }

  alert("Wędrówka została zapisana!");
  window.location.href = window.location.pathname.includes('views') ? '../index.html' : 'index.html';
};

// === 4. INICJALIZACJA ===
window.addEventListener('load', () => {
  window.renderAllData();

  const bind = (id, fn) => {
    const el = getEl(id);
    if (el) el.onclick = fn;
  };

  bind('enableCamera', window.initCamera);
  bind('disableCamera', window.stopCamera);
  bind('takePhoto', window.takePhoto);
  bind('startTracking', window.startTracking);
  bind('saveHike', window.saveHikeData);
  bind('stopTracking', () => {
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (timerInterval) clearInterval(timerInterval);
    getEl('startTracking').disabled = false;
    getEl('stopTracking').disabled = true;
  });
});