// Run with:  npm test
// The service worker (sw.js) against a small fake of the worker environment: which files are fetched fresh, which come
// from the cache first, and that a failed network falls back to the cache instead of leaving a blank page.
import test from 'node:test';
import assert from 'node:assert/strict';

const handlers = {}, store = new Map(), calls = [];
let online = true;
const cacheObj = {
  async match(req) { return store.get(req.url); },
  async put(req, res) { store.set(req.url, res); },
};
globalThis.caches = { open: async () => cacheObj, keys: async () => ['car-racer-v1', 'car-racer-v2', 'other'], delete: async (k) => { calls.push('delete ' + k); return true; } };
globalThis.self = { location: { origin: 'https://site.test' }, addEventListener: (ev, fn) => { handlers[ev] = fn; }, skipWaiting() {}, clients: { claim: async () => {} } };
globalThis.fetch = async (req) => {
  calls.push({ url: req.url, cache: req.cache, mode: req.mode });
  if (!online) throw new TypeError('offline');
  return new Response('fresh:' + req.url, { status: 200 });
};
await import('../sw.js');

async function ask(url, init = {}) {
  const req = new Request(url, init);
  let answer;
  handlers.fetch({ request: req, respondWith: (p) => { answer = p; } });
  return answer ? (await answer).text() : null;
}
const reset = () => { store.clear(); calls.length = 0; online = true; };

test('old caches are cleaned up when the worker activates', async () => {
  reset();
  let done; handlers.activate({ waitUntil: (p) => { done = p; } }); await done;
  assert.deepEqual(calls.filter((c) => typeof c === 'string'), ['delete car-racer-v1', 'delete other']);
});

test('scripts and the page are always checked with the server first (no stale 10-minute browser cache)', async () => {
  reset();
  assert.equal(await ask('https://site.test/src/main.js'), 'fresh:https://site.test/src/main.js');
  assert.equal(calls.at(-1).cache, 'no-cache');
  assert.equal(await ask('https://site.test/index.html'), 'fresh:https://site.test/index.html');
  assert.equal(calls.at(-1).cache, 'no-cache');
  assert.equal(await ask('https://site.test/'), 'fresh:https://site.test/');
});

test('offline, a script comes from the cache; with nothing cached the failure is not hidden', async () => {
  reset();
  await ask('https://site.test/src/main.js');
  online = false;
  assert.equal(await ask('https://site.test/src/main.js'), 'fresh:https://site.test/src/main.js');
  const req = new Request('https://site.test/src/other.js'); let answer;
  handlers.fetch({ request: req, respondWith: (p) => { answer = p; } });
  await assert.rejects(answer);
});

test('car models and sounds are served from the cache at once and refreshed in the background', async () => {
  reset();
  assert.equal(await ask('https://site.test/cars/car.glb'), 'fresh:https://site.test/cars/car.glb');   // first visit: from the network
  const before = calls.length;
  online = false;
  assert.equal(await ask('https://site.test/cars/car.glb'), 'fresh:https://site.test/cars/car.glb');   // later: from the cache, even offline
  assert.ok(calls.length > before, 'it still tried to refresh in the background');
});

test('three.js from the pinned CDN is cache-first; other sites, non-GET and range requests are left alone', async () => {
  reset();
  const cdn = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
  await ask(cdn); const n = calls.length; await ask(cdn);
  assert.equal(calls.length, n, 'second load did not touch the network');
  assert.equal(await ask('https://other.example/x.js'), null);
  assert.equal(await ask('https://site.test/api', { method: 'POST', body: 'x' }), null);
  assert.equal(await ask('https://site.test/cars/car.glb', { headers: { range: 'bytes=0-9' } }), null);
});
