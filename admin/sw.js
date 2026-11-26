// Service worker minimal : l'interface admin s'ouvre même avec un réseau faible en montagne.
// Les appels /api ne sont jamais mis en cache (toujours l'état réel).
const CACHE = 'wd-admin-v10';
const SHELL = ['/admin/', '/admin/admin.css', '/admin/admin.js', '/admin/manifest.webmanifest', '/admin/icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Réseau d'abord, cache en secours.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || !url.pathname.startsWith('/admin/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/admin/')))
  );
});
