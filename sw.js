// Service worker: speeds up repeat visits (and flaky mobile data) without ever trapping the game on old code.
//  - the page, scripts and styles: network first, cached copy only if the network fails
//  - car models (.glb): network first, so replacing a model under the same filename is visible on the next reload
//  - sounds and images: served from cache straight away and refreshed in the background
//  - three.js from the CDN: it is pinned to an exact version, so cache first
// Anything else (multiplayer traffic, other sites, range requests) is left alone.
const CACHE = 'car-racer-v2';
const CODE = /\.(?:html|js|mjs|css|webmanifest|json)$/i;
const MODEL = /\.glb$/i;
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    // 'no-cache' = always check with the server (a cheap 304 if unchanged). Without it GitHub Pages' 10-minute browser cache can
    // hand out an old copy of one script next to a new copy of another, and the game runs half old, half new after an update.
    // (a page navigation can't be re-fetched with extra options, so it is rebuilt from its URL; scripts and styles are copied)
    const res = await fetch(req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(req, { cache: 'no-cache' }));
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.href.startsWith(THREE_CDN)) { e.respondWith(cacheFirst(req)); return; }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' || CODE.test(url.pathname) || MODEL.test(url.pathname) || url.pathname.endsWith('/')) e.respondWith(networkFirst(req));
  else e.respondWith(staleWhileRevalidate(req));
});
