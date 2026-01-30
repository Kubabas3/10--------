/* App script: rejestracja SW, geolokalizacja, kamera, powiadomienie offline, prosta nawigacja SPA */

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

function bindDynamic(){
  // Bind navigation links again
  bindNavigation();
  // Re-bind buttons if present
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
        console.log('Pozycja:', coords);
        if (locationResult) locationResult.textContent = coords;
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
        console.log('Kamera uruchomiona');
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
    const items = JSON.parse(localStorage.getItem('savedItems') || '[]');
    savedList.innerHTML = '';
    if (items.length === 0){
      const li = document.createElement('li'); li.textContent = 'Brak zapisanej zawartości'; savedList.appendChild(li);
    } else {
      items.forEach(it => { const li = document.createElement('li'); li.textContent = it; savedList.appendChild(li); });
    }
  }
}

// Offline / online events
window.addEventListener('offline', () => {
  showToast('Brak połączenia sieciowego — pracujesz offline');
  // opcjonalne powiadomienie systemowe
  if ('Notification' in window && Notification.permission === 'granted'){
    new Notification('Brak połączenia', { body: 'Pracujesz w trybie offline.' });
  } else if ('Notification' in window && Notification.permission !== 'denied'){
    Notification.requestPermission().then(p => { if (p === 'granted') new Notification('Brak połączenia', { body: 'Pracujesz w trybie offline.' }); });
  }
});
window.addEventListener('online', () => { showToast('Połączenie sieciowe przywrócone'); });

// popstate handle
window.addEventListener('popstate', (e) => {
  loadPage(location.pathname, false);
});

// Init
document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  bindDynamic();
});