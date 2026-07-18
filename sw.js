/* ============================================================
   GACA V5.1 - SERVICE WORKER (PWA)
   Strategi:
   - App shell (index.html, manifest, ikon) : network-first, fallback cache
   - Aset CDN (font, firebase sdk, supabase sdk, wilayah emsifa) : cache-first + update di belakang
   - Semua API (Supabase, Firestore, Gemini, Nominatim) : JANGAN di-cache, selalu network
   ============================================================ */
const CACHE_NAME = 'gaca-v5.1.1';   // NAIKKAN versi ini setiap deploy update!
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

// Host yang TIDAK BOLEH di-cache (data dinamis / API)
const NETWORK_ONLY_HOSTS = [
  'supabase.co',
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'generativelanguage.googleapis.com',
  'nominatim.openstreetmap.org'
];

// Host aset statis yang aman di-cache
const CACHEABLE_CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'www.gstatic.com',          // SDK firebase-app / firebase-firestore
  'cdn.jsdelivr.net',         // SDK supabase-js
  'www.emsifa.com',           // dataset wilayah (statis)
  'ik.imagekit.io'            // logo & gambar materi
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. API dinamis: langsung network, tanpa cache
  if (NETWORK_ONLY_HOSTS.some((h) => url.hostname.endsWith(h))) return;

  // 2. Navigasi (buka app): network-first agar update cepat, fallback ke cache saat offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 3. Aset same-origin & CDN statis: cache-first + perbarui di latar belakang
  const isSameOrigin = url.origin === self.location.origin;
  const isCdn = CACHEABLE_CDN_HOSTS.some((h) => url.hostname.endsWith(h));
  if (isSameOrigin || isCdn) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchAndUpdate = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetchAndUpdate;
      })
    );
  }
  // 4. Selain itu: biarkan default browser
});
