import test from 'node:test';
import assert from 'node:assert/strict';
import { packTrack, unpackTrack, trackLinkUrl, packedFromHash } from '../src/trackLink.js';
import { makeTemplate, TEMPLATE_KEYS } from '../src/templates.js';
import { normalizeTrack } from '../src/track.js';

test('every built-in track survives being packed into a link and unpacked again', async () => {
  for (const k of TEMPLATE_KEYS.filter((k) => k !== 'random')) {
    const d = normalizeTrack(makeTemplate(k));
    const back = await unpackTrack(await packTrack(d));
    assert.equal(back.handles.length, d.handles.length, k);
    d.handles.forEach((h, i) => { for (const f of ['x', 'y', 'z', 'bank', 'gap', 'lip', 'kick', 'w']) assert.ok(Math.abs(h[f] - back.handles[i][f]) < 0.06, `${k} handle ${i} ${f}`); assert.equal(!!h.open, !!back.handles[i].open); });
    for (const f of ['name', 'width', 'walls', 'dirt', 'berm', 'lowCam', 'mode']) assert.equal(back[f], d[f], `${k} ${f}`);
    assert.equal((back.bumps || []).length, (d.bumps || []).length); assert.equal((back.puddles || []).length, (d.puddles || []).length); assert.equal(back.props.length, d.props.length); assert.equal((back.rocks || []).length, (d.rocks || []).length, k + ' rocks');
  }
});

test('links made before the compact form still open', async () => {
  const d = normalizeTrack(makeTemplate('technical'));
  const cs = new CompressionStream('deflate-raw'), wr = cs.writable.getWriter(); wr.write(new TextEncoder().encode(JSON.stringify(d))); wr.close();
  const parts = []; for (const r = cs.readable.getReader(); ;) { const { done, value } = await r.read(); if (done) break; parts.push(...value); }
  const old = btoa(String.fromCharCode(...parts)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.deepEqual(await unpackTrack(old), d);
});

test('track links are short enough to paste anywhere, and use only web-safe characters', async () => {
  const d = makeTemplate('oval'); d.name = 'My track';
  const url = await trackLinkUrl(d, 'https://example.com/car-racer/');
  assert.match(url, /^https:\/\/example\.com\/car-racer\/#t=~[A-Za-z0-9_-]+$/);
  assert.ok(url.length < 500, `link is ${url.length} characters`);
  assert.equal(packedFromHash(new URL(url).hash), url.split('#t=')[1]);
  assert.equal(packedFromHash('#other'), null);
});

test('a link that is not a track is turned away', async () => {
  for (const bad of ['', 'not a track!', 'AAAA', 'x'.repeat(70000), null, undefined, 42]) assert.equal(await unpackTrack(bad), null);
  const tiny = await packTrack({ name: 'Two points', handles: [{ x: 0, z: 0 }, { x: 10, z: 0 }] });
  assert.equal(await unpackTrack(tiny), null);                                   // fewer than three points is not a circuit
});
