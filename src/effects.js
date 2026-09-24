// Skid marks painted on the road, tyre smoke and scrape sparks.
import * as THREE from 'three';
import { puffTexture } from './textures.js';

export class SkidMarks {
  constructor(scene, capacity = 2600) {
    this.cap = capacity; this.i = 0; this.count = 0;
    const geo = new THREE.PlaneGeometry(0.3, 0.9).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x0b0a0d, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
    this.last = [null, null, null, null];
    this._m = new THREE.Matrix4(); this._r = new THREE.Vector3(); this._n = new THREE.Vector3(); this._f = new THREE.Vector3();
  }
  clear() { this.i = 0; this.count = 0; this.mesh.count = 0; this.last.fill(null); }
  /** Lay a mark for wheel w if it moved far enough since the last one. */
  add(w, pos, normal, vel) {
    const l = this.last[w];
    if (l && (pos.x - l.x) ** 2 + (pos.z - l.z) ** 2 < 0.16) return;
    this.last[w] = { x: pos.x, z: pos.z };
    this._n.set(normal.x, normal.y, normal.z);
    this._f.set(vel.x, vel.y, vel.z); this._f.addScaledVector(this._n, -this._f.dot(this._n));
    if (this._f.lengthSq() < 1e-4) return;
    this._f.normalize();
    this._r.crossVectors(this._f, this._n).normalize();
    this._m.makeBasis(this._r, this._n, this._f).setPosition(pos.x + this._n.x * 0.03, pos.y + this._n.y * 0.03, pos.z + this._n.z * 0.03);
    this.mesh.setMatrixAt(this.i, this._m);
    this.i = (this.i + 1) % this.cap; this.count = Math.min(this.count + 1, this.cap);
    this.mesh.count = this.count; this.mesh.instanceMatrix.needsUpdate = true;
  }
  lift(w) { this.last[w] = null; }
}

export class Particles {
  constructor(scene) {
    const map = puffTexture();
    this.smoke = []; this.sparks = [];
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xd9d4cf, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; s.userData = { life: 0, max: 1, v: new THREE.Vector3(), size: 1 }; scene.add(s); this.smoke.push(s);
    }
    for (let i = 0; i < 50; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xffa64a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.visible = false; s.userData = { life: 0, max: 1, v: new THREE.Vector3(), size: 1 }; scene.add(s); this.sparks.push(s);
    }
    this.flames = [];
    for (let i = 0; i < 48; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xff8a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.visible = false; s.userData = { life: 0, max: 1, v: new THREE.Vector3(), size: 1 }; scene.add(s); this.flames.push(s);
    }
    this.si = 0; this.pi = 0; this.fi = 0;
  }
  puff(x, y, z, vx, vz, size = 1.6) {
    const s = this.smoke[this.si++ % this.smoke.length], d = s.userData;
    s.position.set(x, y + 0.2, z); d.v.set(vx * 0.15 + (Math.random() - 0.5), 0.9 + Math.random() * 0.6, vz * 0.15 + (Math.random() - 0.5));
    d.life = d.max = 0.9 + Math.random() * 0.6; d.size = size; s.visible = true;
  }
  spark(x, y, z, vx, vy, vz) {
    const s = this.sparks[this.pi++ % this.sparks.length], d = s.userData;
    s.position.set(x, y, z); d.v.set(vx + (Math.random() - 0.5) * 5, vy + Math.random() * 4, vz + (Math.random() - 0.5) * 5);
    d.life = d.max = 0.25 + Math.random() * 0.3; d.size = 0.35; s.visible = true;
  }
  /** Boost exhaust flame: short-lived, hot at the pipe, fading to orange. */
  flame(x, y, z, vx, vy, vz) {
    const s = this.flames[this.fi++ % this.flames.length], d = s.userData;
    s.position.set(x, y, z); d.v.set(vx + (Math.random() - 0.5) * 0.8, vy + Math.random() * 0.4, vz + (Math.random() - 0.5) * 0.8);
    d.life = d.max = 0.1 + Math.random() * 0.08; d.size = 0.55 + Math.random() * 0.2; s.visible = true;
  }
  update(dt) {
    for (const s of this.flames) {
      const d = s.userData; if (d.life <= 0) continue;
      d.life -= dt; s.position.addScaledVector(d.v, dt);
      const t = 1 - d.life / d.max;
      s.scale.setScalar(d.size * (1 - t * 0.4)); s.material.opacity = 0.75 * (1 - t);
      s.material.color.setRGB(1, 0.62 - t * 0.4, 0.22 - t * 0.2);
      if (d.life <= 0) s.visible = false;
    }
    for (const s of this.smoke) {
      const d = s.userData; if (d.life <= 0) continue;
      d.life -= dt; s.position.addScaledVector(d.v, dt); d.v.multiplyScalar(1 - 1.5 * dt);
      const t = 1 - d.life / d.max;
      s.scale.setScalar(d.size * (0.6 + t * 2.4)); s.material.opacity = 0.42 * (1 - t);
      if (d.life <= 0) s.visible = false;
    }
    for (const s of this.sparks) {
      const d = s.userData; if (d.life <= 0) continue;
      d.life -= dt; d.v.y -= 14 * dt; s.position.addScaledVector(d.v, dt);
      const t = 1 - d.life / d.max;
      s.scale.setScalar(d.size * (1 - t * 0.6)); s.material.opacity = 1 - t;
      if (d.life <= 0) s.visible = false;
    }
  }
  clear() { for (const s of [...this.smoke, ...this.sparks, ...this.flames]) { s.visible = false; s.userData.life = 0; } }
}
