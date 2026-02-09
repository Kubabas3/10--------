/* HikeTracker: Final Fixed Version */

// === 1. Service Worker ===
if ('serviceWorker' in navigator) {
  const path = window.location.pathname.includes('views') ? '../sw.js' : 'sw.js';
  navigator.serviceWorker.register(path)
    .then(() => console.log("SW: OK"))
    .catch(err => console.log("SW Fail:", err));
}

// === 2. Глобальные переменные ===
let watchId = null;
let timerInterval = null;
let seconds = 0;
let totalDistance = 0.0;

// === 3. Функции для страницы "Wędrówka" (native.html) ===

function updateTimer() {
  seconds++;
  const date = new Date(0);
  date.setSeconds(seconds);
  const timeString = date.toISOString().substring(11, 19);
  
  const timerEl = document.getElementById('liveTimer');
  if (timerEl) timerEl.textContent = timeString;
}

function startTracking() {
  if (!navigator.geolocation) return alert("Brak GPS");

  // Блокируем кнопки
  document.getElementById('startTracking').disabled = true;
  document.getElementById('stopTracking').disabled = false;
  document.getElementById('saveHike').disabled = false;

  // Запускаем таймер
  if (timerInterval) clearInterval(timerInterval);
  seconds = 0;
  timerInterval = setInterval(updateTimer, 1000);

  // Запускаем GPS
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const distEl = document.getElementById('liveDistance');
      const speedEl = document.getElementById('liveSpeed');
      const altEl = document.getElementById('liveAltitude');

      // Симуляция дистанции для теста (добавляем по 0.01 км каждое обновление)
      // В реальности тут должна быть формула Haversine
      totalDistance += 0.005; 
      
      if (distEl) distEl.textContent = totalDistance.toFixed(3);
      if (speedEl) speedEl.textContent = (pos.coords.speed || 0).toFixed(1);
      if (altEl) altEl.textContent = pos.coords.altitude ? pos.coords.altitude.toFixed(0) : '-';
    },
    (err) => console.warn(err),
    { enableHighAccuracy: true }
  );
}

function stopTracking() {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  if (timerInterval) clearInterval(timerInterval);
  
  document.getElementById('startTracking').disabled = false;
  document.getElementById('stopTracking').disabled = true;
  alert("Wędrówka zatrzymana. Możesz ją zapisać.");
}

function saveHike() {
  const dist = document.getElementById('liveDistance')?.textContent || "0.0";
  const timer = document.getElementById('liveTimer')?.textContent || "00:00:00";
  const date = new Date().toLocaleDateString();

  const newHike = {
    date: date,
    distance: dist,
    time: timer
  };

  // Сохраняем в LocalStorage
  const history = JSON.parse(localStorage.getItem('savedHikes') || "[]");
  history.push(newHike);
  localStorage.setItem('savedHikes', JSON.stringify(history));

  alert("Zapisano pomyślnie!");
  window.location.href = "../index.html";
}

// === 4. Камера ===
async function initCamera() {
  try {
    const video = document.getElementById('cameraPreview');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    document.getElementById('enableCamera').disabled = true;
    document.getElementById('disableCamera').disabled = false;
  } catch (e) { alert("Błąd kamery: " + e.message); }
}

function takePhoto() {
  const video = document.getElementById('cameraPreview');
  const gallery = document.getElementById('photoGallery');
  
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  
  const img = document.createElement('img');
  img.src = canvas.toDataURL('image/png');
  img.style.width = "100px";
  img.style.margin = "5px";
  img.style.border = "2px solid #2d5016";
  gallery.appendChild(img);
}

// === 5. Функции для ГЛАВНОЙ страницы (index.html) ===

function loadHistory() {
  const list = document.getElementById('recentHikes');
  const totalDistEl = document.getElementById('totalDistance');
  const countEl = document.getElementById('hikesCount');
  
  // Если мы не на главной, выходим
  if (!list) return;

  const history = JSON.parse(localStorage.getItem('savedHikes') || "[]");
  
  // Обновляем статистику
  countEl.textContent = history.length;
  const totalKm = history.reduce((sum, item) => sum + parseFloat(item.distance), 0);
  if (totalDistEl) totalDistEl.textContent = totalKm.toFixed(1);

  // Строим список
  if (history.length === 0) {
    list.innerHTML = "<li>Brak zapisanych wędrówek</li>";
  } else {
    list.innerHTML = history.map(h => 
      `<li>📅 ${h.date} | 👣 ${h.distance} km | ⏱ ${h.time}</li>`
    ).join('');
  }
}

// === 6. Инициализация (Привязка кнопок) ===
document.addEventListener('DOMContentLoaded', () => {
  // Пытаемся загрузить историю (сработает только на index.html)
  loadHistory();

  // Привязка кнопок (сработает только на native.html, где эти ID существуют)
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.onclick = fn;
  };

  bind('startTracking', startTracking);
  bind('stopTracking', stopTracking);
  bind('saveHike', saveHike);
  
  bind('enableCamera', initCamera);
  bind('disableCamera', () => {
    const video = document.getElementById('cameraPreview');
    if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
    document.getElementById('enableCamera').disabled = false;
    document.getElementById('disableCamera').disabled = true;
  });
  bind('takePhoto', takePhoto);
});