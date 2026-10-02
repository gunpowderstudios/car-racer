// Service worker: speeds up repeat visits (and flaky mobile data) without ever trapping the game on old code.
//  - the page, scripts and styles: network first, cached copy only if the network fails
//  - car models, sounds, images: served from the cache straight away and refreshed in the background, so a
//    replaced model shows up on the visit after next reload rather than never
//  - three.js from the CDN: it is pinned to an exact version, so cache first
// Anything else (multiplayer traffic, other sites, range requests) is left alone.
const CACHE = 'car-racer-v1';
const CODE = /\.(?:html|js|mjs|css|webmanifest|json)$/i;
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
    const res = await fetch(req);
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
  if (req.mode === 'navigate' || CODE.test(url.pathname) || url.pathname.endsWith('/')) e.respondWith(networkFirst(req));
  else e.respondWith(staleWhileRevalidate(req));
});
