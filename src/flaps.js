// Holy Moley: torn panels that stay hinged to the car and flap about. The motion is flapMath.js; this draws the plates and feeds them the car's movement.
import * as THREE from 'three';
import { newFlap, stepFlap, hingeFor } from './flapMath.js';

const BURNT = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.9, metalness: 0.3, side: THREE.BackSide });

function plateGeometry(W, L) {                                   // a curled, ragged sheet: hinge along x at y = 0, the free end at y = L, curling outward (+z)
  const g = new THREE.PlaneGeometry(W, L, 4, 6); g.translate(0, L / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / L, x = p.getX(i) / W;
    p.setZ(i, 0.28 * L * y * y);                                 // curled outward
    p.setY(i, p.getY(i) * (1 - 0.18 * Math.abs(Math.sin(i * 12.9898) * 43758.5453 % 1) * y));       // a ragged free end
    p.setX(i, p.getX(i) * (1 - 0.35 * y * y) + 0.05 * W * Math.sin(i * 3.7) * y);                     // tapering
    void x;
  }
  g.computeVertexNormals(); return g;
}

export class Flaps {
  /** `root` is the node whose space is the car's own (x right, y up, z forward). */
  constructor(root, max = 4) {
    this.root = root; this.max = max; this.list = [];
    this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._pp = null; this._v = new THREE.Vector3(); this._a = new THREE.Vector3(); this._vp = new THREE.Vector3();
    this._t = 0; this._last = 0; this._g = new THREE.Vector3();
  }

  /** A hole `b` has torn through: { cx, cy, cz (centre, car space), nx, ny, nz (outward), hr (hole radius, m) }. `paint` the car's colour. */
  add(b, paint) {
    const L = Math.min(1.1, Math.max(0.45, b.hr * 1.8)), W = Math.min(1.0, Math.max(0.4, b.hr * 1.6));
    const hinge = hingeFor([b.cx, b.cy, b.cz], [b.nx, b.ny, b.nz], b.hr);
    const f = newFlap(hinge.s, [b.nx, b.ny, b.nz], L);
    const pivot = new THREE.Group(), plate = new THREE.Group(), geo = plateGeometry(W, L);
    const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: paint, roughness: 0.4, metalness: 0.35, side: THREE.FrontSide }));
    const back = new THREE.Mesh(geo, BURNT);
    front.frustumCulled = false; back.frustumCulled = false; front.castShadow = false;
    plate.add(front, back); pivot.add(plate);
    pivot.position.set(hinge.pivot[0], hinge.pivot[1], hinge.pivot[2]);
    pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...f.a), new THREE.Vector3(...f.s), new THREE.Vector3(...f.n)));
    this.root.add(pivot);
    const e = { f, pivot, plate, geo, front };
    this.list.push(e);
    if (this.list.length > this.max) this._drop(this.list.shift());
    this._place(e);
    return e;
  }

  _place(e) { e.plate.rotation.x = e.f.th; }
  _drop(e) { e.pivot.removeFromParent(); e.geo.dispose(); e.front.material.dispose(); }
  clear() { for (const e of this.list) this._drop(e); this.list.length = 0; this._pp = null; }
  get count() { return this.list.length; }
  setPaint(hex) { for (const e of this.list) e.front.material.color.set(hex); }

  /** Move the plates: called every frame the car is drawn. Reads how the car itself moved since last time (so it works live and in the replay). */
  update(now = performance.now() / 1000) {
    if (!this.list.length) return;
    const dt = Math.min(0.05, now - this._last); this._last = now;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldPosition(this._p); this.root.getWorldQuaternion(this._q);
    if (this._pp === null || dt <= 1e-4) { this._pp = (this._pp || new THREE.Vector3()).copy(this._p); this._v.set(0, 0, 0); this._a.set(0, 0, 0); return; }
    const inv = this._q.clone().invert();
    this._vp.copy(this._v);
    const jump = this._p.distanceTo(this._pp) > 60 * dt + 2;                  // teleported (respawn): not a real movement
    if (jump) this._v.set(0, 0, 0); else this._v.copy(this._p).sub(this._pp).multiplyScalar(1 / dt);
    this._pp.copy(this._p);
    const acc = jump ? this._a.set(0, 0, 0) : this._a.copy(this._v).sub(this._vp).multiplyScalar(1 / dt).clampLength(0, 60);
    const v = this._v.clone().applyQuaternion(inv), a = acc.clone().applyQuaternion(inv), g = this._g.set(0, -9.8, 0).applyQuaternion(inv);
    this._t += dt;
    const env = { ax: a.x, ay: a.y, az: a.z, vx: v.x, vy: v.y, vz: v.z, gx: g.x, gy: g.y, gz: g.z, flutter: Math.min(1, v.length() / 30), t: this._t };
    for (const e of this.list) { stepFlap(e.f, env, dt); this._place(e); }
  }
}
