// Draws the barrels and scrap metal that props.js simulates.
import * as THREE from 'three';
import { BARREL } from './props.js';

const PAINT = [new THREE.Color(0xb8351f), new THREE.Color(0xd39b1c)];    // red drums, with the odd yellow one
const HOT = new THREE.Color(3, 2.1, 1.4);                               // over-bright, so a lit drum glows white-hot

/** An oil drum: a lathe profile with two pressed rings and a rolled rim, darker at the ends. */
function drumGeometry() {
  const r = BARREL.radius, h = BARREL.height / 2, k = BARREL.height / 0.9;       // details scale with the drum
  const prof = [[0, -h], [r * 0.9, -h], [r, -h + 0.03 * k], [r, -0.17 * k], [r * 0.95, -0.15 * k], [r, -0.13 * k], [r, 0.13 * k], [r * 0.95, 0.15 * k], [r, 0.17 * k], [r, h - 0.03 * k], [r * 0.9, h], [0, h]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 18);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = Math.abs(pos.getY(i)), end = y > h - 0.06 * k ? 0.55 : 1, ring = Math.abs(y - 0.15 * k) < 0.025 * k ? 0.82 : 1;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = end * ring;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class PropsView {
  constructor(scene) {
    this.scene = scene;
    this.drums = null; this.bits = null;
    this.drumGeo = drumGeometry();
    this.drumMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
    this.bitGeo = new THREE.BoxGeometry(1, 1, 1);
    this.bitMat = new THREE.MeshStandardMaterial({ color: 0x3b3a40, roughness: 0.6, metalness: 0.6 });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  /** (Re)build the instanced meshes for the barrels a Props currently holds. */
  build(props) {
    if (this.drums) { this.scene.remove(this.drums); this.drums.dispose(); this.drums = null; }
    const n = props.barrels.length;
    if (n) {
      const im = this.drums = new THREE.InstancedMesh(this.drumGeo, this.drumMat, n);
      props.barrels.forEach((b, i) => im.setColorAt(i, PAINT[b.paint]));
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      this.scene.add(im);
    }
    if (!this.bits) {
      const bm = this.bits = new THREE.InstancedMesh(this.bitGeo, this.bitMat, props.bits.length);
      bm.castShadow = true; bm.frustumCulled = false; bm.count = 0; this.scene.add(bm);
    }
    this.update(props, true);
  }

  update(props, force = false) {
    const im = this.drums;
    if (im) {
      let dirty = force;
      let paint = false;
      props.barrels.forEach((b, i) => {
        // a lit drum blinks white-hot, faster and faster is not needed: the fuse is short
        const want = b.alive && b.fuse >= 0 && Math.floor(b.fuse * 12) % 2 === 0 ? 1 : 0;
        if (b._col !== want) { im.setColorAt(i, want ? HOT : PAINT[b.paint]); b._col = want; paint = true; }
        const settled = (!b.alive || b.asleep) && b.fuse < 0;                  // hasn't moved since it was last drawn
        if (!force && settled && b._drawn) return;
        if (b.alive) { this._p.set(b.pos.x, b.pos.y, b.pos.z); this._q.set(b.q.x, b.q.y, b.q.z, b.q.w); this._m.compose(this._p, this._q, this._s); im.setMatrixAt(i, this._m); }
        else im.setMatrixAt(i, this._zero);
        b._drawn = settled; dirty = true;
      });
      if (dirty) im.instanceMatrix.needsUpdate = true;
      if (paint && im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    const bm = this.bits;
    if (bm) {
      let n = 0;
      for (const p of props.bits) {
        if (p.life <= 0) continue;
        const k = Math.min(1, p.life);                                         // shrink away over the last second
        this._p.set(p.pos.x, p.pos.y, p.pos.z); this._q.set(p.q.x, p.q.y, p.q.z, p.q.w); this._s.set(p.sx * k, p.sy * k, p.sz * k);
        this._m.compose(this._p, this._q, this._s); bm.setMatrixAt(n++, this._m);
      }
      this._s.set(1, 1, 1);
      bm.count = n; bm.instanceMatrix.needsUpdate = true;
    }
  }
}
