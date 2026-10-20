/* cost-alloc PWA service worker */
const CACHE = 'cost-alloc-v1';
const PRECACHE = ['./', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API·채팅은 캐시하지 않음
  if (url.pathname.includes('/api/')) return;

  const isNav = req.mode === 'navigate';
  const isStatic =
    url.pathname.includes('/_next/static/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.includes('/icons/') ||
    url.pathname.endsWith('.webmanifest');

  if (isStatic) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // HTML·JSON 데이터: 네트워크 우선, 실패 시 캐시
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (isNav) return caches.match('./');
        return Response.error();
      }),
  );
});
