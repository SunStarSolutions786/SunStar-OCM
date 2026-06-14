/* SunStar OCM — minimal service worker (enables "Add to Home Screen" / PWA install) */
const CACHE_NAME = 'sunstar-ocm-shell-v1';
const SHELL_FILES = [
  './index.html',
  './app-core.js',
  './app-superadmin.js',
  './app-admin.js',
  './app-employee.js',
  './app-saleshead.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=> cache.addAll(SHELL_FILES)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event)=>{
  event.waitUntil(
    caches.keys().then(keys=> Promise.all(
      keys.filter(k=>k!==CACHE_NAME).map(k=> caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Network-first for navigation/HTML so the app always gets latest version when online;
// fall back to cache when offline.
self.addEventListener('fetch', (event)=>{
  const req = event.request;
  if(req.method !== 'GET') return;

  event.respondWith(
    fetch(req).then(res=>{
      const resClone = res.clone();
      caches.open(CACHE_NAME).then(cache=> cache.put(req, resClone)).catch(()=>{});
      return res;
    }).catch(()=> caches.match(req).then(cached=> cached || caches.match('./index.html')))
  );
});
