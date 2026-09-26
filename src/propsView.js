// Draws the barrels, chickens and scrap metal that props.js simulates.
import * as THREE from 'three';
import { BARREL, CHICKEN } from './props.js';

const PAINT = [new THREE.Color(0xb8351f), new THREE.Color(0xd39b1c)];    // red drums, with the odd yellow one
const HOT = new THREE.Color(3, 2.1, 1.4);                               // over-bright, so a lit drum glows white-hot
const POP_V0 = 5, POP_G = 16, POP_DURATION = (2 * POP_V0) / POP_G;      // a splatted chicken's comedic launch: up, tumble, gone

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

/** Concatenate a few small geometries (each tinted a solid colour) into one vertex-coloured mesh. No addons needed. */
function mergeParts(parts) {
  let vN = 0, iN = 0;
  for (const { geo } of parts) { vN += geo.attributes.position.count; iN += geo.index ? geo.index.count : geo.attributes.position.count; }
  const pos = new Float32Array(vN * 3), nrm = new Float32Array(vN * 3), col = new Float32Array(vN * 3), idx = new Uint32Array(iN);
  let vOff = 0, iOff = 0;
  for (const { geo, color } of parts) {
    const pa = geo.attributes.position, na = geo.attributes.normal;
    pos.set(pa.array, vOff * 3); nrm.set(na.array, vOff * 3);
    for (let i = 0; i < pa.count; i++) { col[(vOff + i) * 3] = color.r; col[(vOff + i) * 3 + 1] = color.g; col[(vOff + i) * 3 + 2] = color.b; }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) idx[iOff + i] = geo.index.array[i] + vOff;
    else for (let i = 0; i < pa.count; i++) idx[iOff + i] = vOff + i;
    iOff += geo.index ? geo.index.count : pa.count; vOff += pa.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** A simple, cheerful low-poly chicken: a rounded body, a head, a beak and a comb. Purely cosmetic. */
function chickenGeometry() {
  const r = CHICKEN.radius, white = new THREE.Color(0xf2ede0), orange = new THREE.Color(0xe0872e), red = new THREE.Color(0xc23524);
  const body = new THREE.CapsuleGeometry(r * 0.85, r * 1.0, 4, 8); body.translate(0, r * 1.35, 0);
  const head = new THREE.SphereGeometry(r * 0.55, 8, 6); head.translate(0, r * 2.35, r * 0.55);
  const beak = new THREE.ConeGeometry(r * 0.22, r * 0.5, 6); beak.rotateX(Math.PI / 2); beak.translate(0, r * 2.3, r * 1.05);
  const comb = new THREE.BoxGeometry(r * 0.18, r * 0.32, r * 0.5); comb.translate(0, r * 2.85, r * 0.45);
  return mergeParts([{ geo: body, color: white }, { geo: head, color: white }, { geo: beak, color: orange }, { geo: comb, color: red }]);
}

export class PropsView {
  constructor(scene) {
    this.scene = scene;
    this.drums = null; this.chickens = null; this.bits = null;
    this.drumGeo = drumGeometry();
    this.drumMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
    this.chickenGeo = chickenGeometry();
    this.chickenMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    this.bitGeo = new THREE.BoxGeometry(1, 1, 1);
    this.bitMat = new THREE.MeshStandardMaterial({ color: 0x3b3a40, roughness: 0.6, metalness: 0.6 });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._e = new THREE.Euler();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  /** (Re)build the instanced meshes for the barrels and chickens a Props currently holds. */
  build(props) {
    if (this.drums) { this.scene.remove(this.drums); this.drums.dispose(); this.drums = null; }
    if (this.chickens) { this.scene.remove(this.chickens); this.chickens.dispose(); this.chickens = null; }
    const n = props.barrels.length;
    if (n) {
      const im = this.drums = new THREE.InstancedMesh(this.drumGeo, this.drumMat, n);
      props.barrels.forEach((b, i) => im.setColorAt(i, PAINT[b.paint]));
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      this.scene.add(im);
    }
    const nc = props.chickens.length;
    if (nc) {
      const cm = this.chickens = new THREE.InstancedMesh(this.chickenGeo, this.chickenMat, nc);
      cm.castShadow = true; cm.receiveShadow = true; cm.frustumCulled = false;
      this.scene.add(cm);
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
    const cm = this.chickens;
    if (cm) {
      props.chickens.forEach((c, i) => {
        if (c.deadT >= 0) {
          const t = c.deadT;
          if (t > POP_DURATION) { cm.setMatrixAt(i, this._zero); return; }
          const h = POP_V0 * t - 0.5 * POP_G * t * t;                      // a quick comedic launch, then it drops
          this._p.set(c.pos.x, c.pos.y + Math.max(0, h), c.pos.z);
          this._e.set(t * 26, t * 17, t * 11);
          this._q.setFromEuler(this._e);                                  // tumbling
          this._m.compose(this._p, this._q, this._s); cm.setMatrixAt(i, this._m);
          return;
        }
        if (!c.alive) { cm.setMatrixAt(i, this._zero); return; }

        const moving = c.state === 'walk' || c.state === 'flee';
        const pace = c.state === 'flee' ? 13 : 7;
        const phase = props.time * pace + c.bob;
        const bob = moving ? Math.abs(Math.sin(phase)) * (c.state === 'flee' ? 0.045 : 0.025) : 0;
        const roll = moving ? Math.sin(phase) * (c.state === 'flee' ? 0.18 : 0.11) : 0;
        let pitch = 0, yaw = c.heading || 0;

        if (c.state === 'peck') {
          const peck = 0.5 + 0.5 * Math.sin(props.time * 12 + c.bob);
          pitch = 0.2 + peck * 0.5;
        } else if (c.state === 'look') {
          yaw += Math.sin(props.time * 4.5 + c.bob) * 0.42;
        } else if (c.state === 'freeze') {
          pitch = -0.06;
        }

        this._p.set(c.pos.x, c.pos.y + bob, c.pos.z);
        this._e.set(pitch, yaw, roll, 'XYZ');
        this._q.setFromEuler(this._e);
        this._m.compose(this._p, this._q, this._s); cm.setMatrixAt(i, this._m);
      });
      cm.instanceMatrix.needsUpdate = true;
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
