import test from 'node:test';
import assert from 'node:assert/strict';
import { findBonnet } from '../src/bonnetCam.js';

// a box car: z forward. Low bonnet from the nose back to z = 0.8, then a windscreen climbing to a roof at 1.4 m
function carPoints({ bonnetLen = 1.2, noseH = 0.8, roof = 1.45, L = 4.4, W = 1.8 } = {}) {
  const pts = [], zN = L / 2, zStep = zN - bonnetLen;
  for (let z = -L / 2; z <= zN; z += 0.05) for (let x = -W / 2; x <= W / 2; x += 0.3) {
    let y = noseH; if (z < zStep) y = Math.min(roof, noseH + (zStep - z) * 1.2); if (z < zStep - 2.0) y = roof - 0.1;
    pts.push(x, y, z);
  }
  return pts;
}
test('a car with a bonnet gets a camera just ahead of the windscreen, above the bonnet', () => {
  const r = findBonnet(carPoints());
  assert.ok(r, 'a bonnet should be found');
  assert.ok(r.len > 0.9 && r.len < 1.5, `bonnet length ${r.len}`);
  assert.ok(r.y > 0.8 + 0.2 && r.y < 1.4, `camera height ${r.y}`);
  assert.ok(r.z > 0.3 && r.z < 2.2, `camera z ${r.z}`);
  assert.ok(Math.abs(r.pitch) <= 0.12 + 1e-9);
});
test('a bus or van with a flat nose has no bonnet camera', () => {
  const pts = []; for (let z = -4; z <= 4; z += 0.05) for (let x = -1.2; x <= 1.2; x += 0.3) pts.push(x, z > 3.6 ? 0.6 + (3.9 - z) * 0 + (z > 3.85 ? -0.4 : 0) + 1.8 * (z < 3.8 ? 1 : 0) : 2.6, z);
  assert.equal(findBonnet(pts), null);
  assert.equal(findBonnet([]), null);
});
test('a low-poly body with gaps in the vertices still finds its bonnet', () => {
  const p = carPoints(), keep = [];
  for (let i = 0; i < p.length; i += 3) if (Math.round(p[i + 2] * 20) % 3 !== 0) keep.push(p[i], p[i + 1], p[i + 2]);
  assert.ok(findBonnet(keep));
});
test('the camera cycle skips the bonnet view for a vehicle without one', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('../src/cameraChoice.js', import.meta.url), 'utf8');
  assert.match(js, /while \(m === 3 && !this\.bonnet\)/);
  assert.match(readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'), /chase\.bonnet = visual\.loaded \? visual\.bonnetCam : null/);
});
