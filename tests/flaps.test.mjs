// Holy Moley: torn panels that stay hinged on and flap (flapMath.js is pure; flaps.js needs three.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAP, newFlap, stepFlap, hingeFor, plateDir } from '../src/flapMath.js';
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const still = { ax: 0, ay: 0, az: 0, vx: 0, vy: 0, vz: 0, gx: 0, gy: -9.8, gz: 0, flutter: 0, t: 0 };
// a side panel (normal +x), hinged at the top: it lies down the side, s points down (-y)
const side = () => newFlap([0, -1, 0], [1, 0, 0], 0.7);

test('a flung-open panel settles hanging, within its stops', () => {
  const f = side(); f.th = 1.6; f.w = 8;
  for (let i = 0; i < 600; i++) { stepFlap(f, still, 1 / 60); assert.ok(f.th >= FLAP.min && f.th <= FLAP.max); }
  assert.ok(Math.abs(f.w) < 0.05, 'it comes to rest');
  assert.ok(f.th > FLAP.min && f.th < 1.3);
});
test('it swings out with a turn (inertia) and the wind lays it back', () => {
  const a = side(), b = side();
  for (let i = 0; i < 300; i++) { stepFlap(a, still, 1 / 60); stepFlap(b, still, 1 / 60); }
  const rest = a.th; let peak = rest;
  for (let i = 0; i < 40; i++) { stepFlap(a, { ...still, ax: -25 }, 1 / 60); peak = Math.max(peak, a.th); }   // car accelerates sideways (-x): plate lags outward (+x)
  assert.ok(peak > rest + 0.15, 'a sideways shove swings it out');
  const f = newFlap([0, 0, -1], [1, 0, 0], 0.7);                                   // hinged at the front edge, pointing back
  for (let i = 0; i < 300; i++) stepFlap(f, { ...still, gy: 0, vz: 40, t: i / 60 }, 1 / 60);
  assert.ok(f.th <= FLAP.rest + 0.3, 'driving at speed holds it close against the body');
});
test('hinge sits on the upper rim of a side panel and the front rim of a roof panel', () => {
  const h = hingeFor([1, 0.5, 0], [1, 0, 0], 0.3);
  assert.ok(h.pivot[1] > 0.5 && h.s[1] < 0, 'plate hangs down');
  const r = hingeFor([0, 1, 0], [0, 1, 0], 0.3);
  assert.ok(r.pivot[2] > 0 && r.s[2] < 0, 'roof plate points back');
  const d = plateDir(side(), 0); assert.ok(Math.abs(d[1] + 1) < 1e-9);
});
test('wired in: only with a hole, cleared on respawn, capped, and moved every frame', () => {
  const cv = read('src/carVisual.js'), m = read('src/main.js'), d = read('src/dents.js');
  assert.match(d, /nx: n\.x, ny: n\.y, nz: n\.z/);
  assert.match(cv, /clearDents\(\) \{[^}]*this\.flaps\.clear\(\)/); assert.match(cv, /dispose\(\) \{\s*if \(this\.flaps\) this\.flaps\.clear\(\)/);
  assert.match(m, /v\.addFlap\(b, paint/); assert.match(m, /visual\.updateFlaps\(\)/); assert.match(m, /v\.updateFlaps\(\)/);
  assert.match(read('src/replayMode.js'), /v\.updateFlaps\(\)/);
  assert.match(read('src/flaps.js'), /this\.list\.length > this\.max/);
});
