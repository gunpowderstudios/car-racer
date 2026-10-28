// Holy Moley (real damage): deep dents tear holes in the bodywork and pieces fly off. A setting, off by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
let THREE = null; try { THREE = await import('three'); } catch { /* not installed here */ }
const skip = !THREE && 'three.js is not installed';
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('the setting exists, is off by default, and is wired to the shader switch', () => {
  assert.match(read('index.html'), /id="opt-holes"[^>]*> Holy Moley \(real damage\)/);
  const main = read('src/main.js');
  assert.match(main, /holes: false/); assert.match(main, /bindOpt\('opt-holes', 'holes', \(v\) => \{ opts\.holes = v; setHoles\(v\); \}\)/);
  assert.match(main, /CarVisual\.onHole = /); assert.match(main, /debris\.burst\(w\.x, w\.y, w\.z/);
  const d = read('src/dents.js');
  assert.match(d, /if \(uHoles > 0\.5 && holeV > 0\.0\) discard;/, 'the torn part of the body is not drawn');
  assert.match(d, /gl_FrontFacing/, 'the inside of the car is dark behind the hole');
});

test('a hard hit tears through and sends up pieces once - but only with Holy Moley on', { skip }, async () => {
  const { makeDentable, setHoles, holesOn } = await import('../src/dents.js');
  const mk = () => {
    const root = new THREE.Group(), geo = new THREE.BoxGeometry(2, 1, 4, 20, 10, 40), mat = new THREE.MeshStandardMaterial(), mesh = new THREE.Mesh(geo, mat);
    root.add(mesh); return { root, mat, ctl: makeDentable(root, root, 12) };
  };
  setHoles(false); assert.equal(holesOn(), false);
  let { ctl } = mk(); assert.ok(ctl.add(0, 0, 2, 60)); assert.equal(ctl.burst, null, 'off: a deep dent is only a dent');
  setHoles(true); assert.equal(holesOn(), true);
  const m = mk(); ctl = m.ctl;
  assert.equal(m.mat.side, THREE.DoubleSide, 'double sided while on, so the far panel can be seen through the hole');
  assert.ok(ctl.add(0, 0, 2, 3)); assert.equal(ctl.burst, null, 'a light knock does not tear');
  assert.ok(ctl.add(0, 0, 2, 60)); assert.ok(ctl.burst, 'a hard one does'); assert.ok(ctl.burst.size > 0.4);
  ctl.burst = null; ctl.add(0, 0, 2, 60, 99); assert.equal(ctl.burst, null, 'the same hole does not throw pieces twice');
  ctl.clear(); assert.equal(ctl.burst, null);
  setHoles(false); assert.equal(m.mat.side, THREE.FrontSide, 'and back to normal when switched off');
});

test('CarVisual passes a tear to the pieces-flying hook', () => {
  const v = read('src/carVisual.js');
  assert.match(v, /const r = this\.dents\.add\(x, y, z, hp\), b = this\.dents\.burst;/); assert.match(v, /CarVisual\.onHole\(this, b\)/);
});
