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
    // fireballs: bigger and longer-lived than exhaust flames, with a white-hot flash sprite first
    this.hot = [];
    for (let i = 0; i < 44; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xffb040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      s.visible = false; s.userData = { life: 0, max: 1, v: new THREE.Vector3(), size: 1, flash: false }; scene.add(s); this.hot.push(s);
    }
    this.si = 0; this.pi = 0; this.fi = 0; this.hi = 0;
  }
  puff(x, y, z, vx, vz, size = 1.6, life = 0.9 + Math.random() * 0.6, tint = 0xd9d4cf) {
    const s = this.smoke[this.si++ % this.smoke.length], d = s.userData;
    s.position.set(x, y + 0.2, z); d.v.set(vx * 0.15 + (Math.random() - 0.5), 0.9 + Math.random() * 0.6, vz * 0.15 + (Math.random() - 0.5));
    d.life = d.max = life; d.size = size; s.material.color.setHex(tint); s.visible = true;
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
  /** A barrel going off: flash, fireball, lingering black smoke and a spray of sparks. */
  blast(x, y, z) {
    const R = Math.random, hot = (flash, vx, vy, vz, life, size) => {
      const s = this.hot[this.hi++ % this.hot.length], d = s.userData;
      s.position.set(x, y, z); d.v.set(vx, vy, vz); d.life = d.max = life; d.size = size; d.flash = flash; s.visible = true;
    };
    hot(true, 0, 0, 0, 0.16, 12);
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, h = 1 + R() * 6;
      hot(false, Math.cos(a) * h, 1.5 + R() * 6, Math.sin(a) * h, 0.35 + R() * 0.45, 2.6 + R() * 2.2);
    }
    for (let i = 0; i < 12; i++) {
      const a = R() * Math.PI * 2, h = R() * 3;
      this.puff(x + Math.cos(a) * h * 0.4, y + R(), z + Math.sin(a) * h * 0.4, Math.cos(a) * h * 5, Math.sin(a) * h * 5, 3.2 + R() * 2.5, 1.6 + R() * 1.4, 0x3a3538);
    }
    for (let i = 0; i < 18; i++) this.spark(x, y, z, (R() - 0.5) * 8, 3 + R() * 6, (R() - 0.5) * 8);
  }
  update(dt) {
    for (const s of this.hot) {
      const d = s.userData; if (d.life <= 0) continue;
      d.life -= dt; s.position.addScaledVector(d.v, dt); d.v.multiplyScalar(1 - 2.2 * dt);
      const t = 1 - Math.max(0, d.life) / d.max;
      if (d.flash) { s.scale.setScalar(d.size * (0.6 + t * 0.8)); s.material.color.setRGB(1, 0.95, 0.8); s.material.opacity = 1 - t; }
      else {
        s.scale.setScalar(d.size * (0.55 + t * 0.85));
        s.material.color.setRGB(1, Math.max(0.1, 0.8 - t * 0.7), Math.max(0, 0.35 - t * 0.35));
        s.material.opacity = 0.9 * Math.pow(1 - t, 1.3);
      }
      if (d.life <= 0) s.visible = false;
    }
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
  clear() { for (const s of [...this.smoke, ...this.sparks, ...this.flames, ...this.hot]) { s.visible = false; s.userData.life = 0; } }
}

/** Dark scorch marks left on the road by explosions. */
export class Scorch {
  constructor(scene, capacity = 60) {
    this.cap = capacity; this.i = 0; this.count = 0;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: puffTexture(), color: 0x000000, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._n = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }
  clear() { this.i = 0; this.count = 0; this.mesh.count = 0; }
  /** Lay a mark at ground point (x, y, z) lying flat on the surface with normal (nx, ny, nz). */
  add(x, y, z, nx, ny, nz, radius = 3) {
    this._q.setFromUnitVectors(this._up, this._n.set(nx, ny, nz).normalize());
    this._p.set(x + nx * 0.035, y + ny * 0.035, z + nz * 0.035);
    this._s.set(radius * 2, 1, radius * 2 * (0.85 + Math.random() * 0.3));
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(this.i, this._m);
    this.i = (this.i + 1) % this.cap; this.count = Math.min(this.count + 1, this.cap);
    this.mesh.count = this.count; this.mesh.instanceMatrix.needsUpdate = true;
  }
}
