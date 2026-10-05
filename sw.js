const CACHE_PREFIX = 'rhythm-practice-';
const CACHE_NAME = CACHE_PREFIX + 'v2';
const APP_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin ||
      !url.href.startsWith(self.registration.scope)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(event.request, { cache: 'no-cache' });
        if (!response.ok) throw new Error('Page unavailable');
        await cache.put('./index.html', response.clone());
        return response;
      } catch {
        return cache.match('./index.html');
      }
    })());
  } else {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) =>
      (await cache.match(event.request)) || fetch(event.request)
    ));
  }
});
