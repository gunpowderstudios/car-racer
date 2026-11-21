import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeTrack, curveHandle } from '../src/track.js';
import { packTrack, unpackTrack } from '../src/trackLink.js';

const ring = () => Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return { x: Math.round(Math.cos(a) * 150), z: Math.round(Math.sin(a) * 100), y: 0.65 }; });
const def = (H) => ({ name: 'c', width: 16, handles: H });

test('a curve handle bends the road and an untouched point is unchanged', () => {
  const H = ring(), a = new Track(def(H));
  const H2 = ring(); const [vx, vz] = curveHandle(normalizeTrack(def(H2)).handles, 0);
  H2[0].hx = vx * 3; H2[0].hz = vz * 3;
  const b = new Track(def(H2));
  assert.ok(b.length !== a.length, 'the handle changes the curve');
  // a point with the automatic handle: setting it to its own default value leaves the road about where it was
  const H3 = ring(); H3[0].hx = vx; H3[0].hz = vz;
  const c = new Track(def(H3));
  assert.ok(Math.abs(c.length - a.length) / a.length < 0.02);
});

test('the curve handle is kept by normalize and survives a share link', async () => {
  const H = ring(); H[2].hx = 31.4; H[2].hz = -12.3;
  const n = normalizeTrack(def(H));
  assert.equal(n.handles[2].hx, 31.4); assert.equal(n.handles[1].hx, undefined);
  const back = await unpackTrack(await packTrack(n));
  assert.ok(Math.abs(back.handles[2].hx - 31.4) < 0.11 && Math.abs(back.handles[2].hz + 12.3) < 0.11, JSON.stringify(back.handles[2]));
  assert.equal(back.handles[3].hx, undefined);
});
