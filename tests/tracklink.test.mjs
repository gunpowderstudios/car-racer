import test from 'node:test';
import assert from 'node:assert/strict';
import { packTrack, unpackTrack, trackLinkUrl, packedFromHash } from '../src/trackLink.js';
import { makeTemplate, TEMPLATE_KEYS } from '../src/templates.js';
import { normalizeTrack } from '../src/track.js';

test('every built-in track survives being packed into a link and unpacked again', async () => {
  for (const k of TEMPLATE_KEYS.filter((k) => k !== 'random')) {
    const d = normalizeTrack(makeTemplate(k));
    const back = await unpackTrack(await packTrack(d));
    assert.deepEqual(back, d, k);
  }
});

test('track links are short enough to paste anywhere, and use only web-safe characters', async () => {
  const d = makeTemplate('oval'); d.name = 'My track';
  const url = await trackLinkUrl(d, 'https://example.com/car-racer/');
  assert.match(url, /^https:\/\/example\.com\/car-racer\/#t=[A-Za-z0-9_-]+$/);
  assert.ok(url.length < 1500, `link is ${url.length} characters`);
  assert.equal(packedFromHash(new URL(url).hash), url.split('#t=')[1]);
  assert.equal(packedFromHash('#other'), null);
});

test('a link that is not a track is turned away', async () => {
  for (const bad of ['', 'not a track!', 'AAAA', 'x'.repeat(70000), null, undefined, 42]) assert.equal(await unpackTrack(bad), null);
  const tiny = await packTrack({ name: 'Two points', handles: [{ x: 0, z: 0 }, { x: 10, z: 0 }] });
  assert.equal(await unpackTrack(tiny), null);                                   // fewer than three points is not a circuit
});
