const CACHE_NAME = 'faderdeck-shell-v2';
const CORE_ASSETS = ["/","/assets/ibm-plex-mono-latin-400-normal-CvHOgSBP.woff","/assets/ibm-plex-mono-latin-400-normal-DMJ8VG8y.woff2","/assets/ibm-plex-mono-latin-500-normal-CB9ihrfo.woff","/assets/ibm-plex-mono-latin-500-normal-DSY6xOcd.woff2","/assets/index-DJXyPAik.css","/assets/index-RrCrAh5A.js","/assets/inter-latin-400-normal-C38fXH4l.woff2","/assets/inter-latin-400-normal-CyCys3Eg.woff","/assets/inter-latin-500-normal-BL9OpVg8.woff","/assets/inter-latin-500-normal-Cerq10X2.woff2","/assets/inter-latin-600-normal-CiBQ2DWP.woff","/assets/inter-latin-600-normal-LgqL8muc.woff2","/assets/inter-latin-700-normal-BLAVimhd.woff","/assets/inter-latin-700-normal-Yt3aPRUw.woff2","/icons/apple-touch-icon.png","/icons/faderdeck-192.png","/icons/faderdeck-512.png","/icons/faderdeck.svg","/keepalive.mp4","/manifest.webmanifest","/manus-routes.json"] || ['/', '/manifest.webmanifest', '/icons/faderdeck.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('faderdeck-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put('/', response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match('/'))));
    return;
  }

  event.respondWith(caches.match(request).then(async (cached) => {
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
    return response;
  }));
});
