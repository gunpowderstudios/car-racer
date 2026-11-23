import test from 'node:test';
import assert from 'node:assert/strict';
import { rescale, startWidth, drawParams } from '../src/editorMap.js';

test('Set scale: two points 50 m apart that should be 100 m double the picture about the first point', () => {
  const m = { x: 10, z: 20, w: 300 };
  const r = rescale(m, [0, 0], [30, 40], 100);                 // clicked 50 m apart, really 100 m
  assert.equal(r.f, 2); assert.equal(r.w, 600); assert.equal(r.x, 20); assert.equal(r.z, 40);
  // the first clicked point stays exactly where it was on the picture
  assert.deepEqual([0 + (m.x - 0) * 2 - r.x, 0 + (m.z - 0) * 2 - r.z], [0, 0]);
});
test('Set scale: bad input is refused', () => {
  const m = { x: 0, z: 0, w: 100 };
  assert.equal(rescale(m, [5, 5], [5, 5], 100), null);
  assert.equal(rescale(m, [0, 0], [3, 4], 0), null);
  assert.equal(rescale(m, [0, 0], [3, 4], NaN), null);
});
test('a new picture starts at about 80% of the screen width, never tiny', () => {
  assert.equal(startWidth(1000, 0.5), 1600);
  assert.equal(startWidth(10, 5), 40);
});
test('drawing scale: one image pixel covers width*zoom/imagewidth screen pixels, turn is in radians', () => {
  const p = drawParams({ w: 600, rot: 90 }, 1200, 2);
  assert.equal(p.k, 1); assert.ok(Math.abs(p.rot - Math.PI / 2) < 1e-9);
});
