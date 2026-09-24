// Visual car (glTF model aligned to the physics wheels) and the chase camera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAR } from './vehicle.js';
import { clamp, wrapPi } from './math.js';
import { Track } from './track.js';

// Measurements of cars/car.glb (model units). The model is a single mesh, 189 units long
// with its nose towards -X. Wheel centres were measured from the silhouette.
export const MODEL = {
  url: 'cars/car.glb',
  frontAxleX: -62, rearAxleX: 45,
  centerZ: 3.5845, groundY: -9.3037,
  flip: false,            // set true if your model's nose points the other way
  paint: 0xd9482b,
};

export class CarVisual {
  constructor(scene, restHeight) {
    this.restHeight = restHeight;
    this.root = new THREE.Group();
    this.holder = new THREE.Group();
    this.root.add(this.holder);
    scene.add(this.root);
    this.material = new THREE.MeshStandardMaterial({ color: MODEL.paint, roughness: 0.4, metalness: 0.35, side: THREE.DoubleSide });
    // cheap invisible shadow caster (the real mesh is 200k triangles)
    const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.62, 4.85), shadowMat);
    body.position.set(0, -0.05, 0); body.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.2), shadowMat);
    cabin.position.set(0, 0.45, -0.2); cabin.castShadow = true;
    this.root.add(body, cabin);
    this.placeholder = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.75, 4.85), this.material);
    this.placeholder.position.y = -0.1;
    this.holder.add(this.placeholder);
    this.loaded = false;
  }

  setPaint(hex) { this.material.color.set(hex); }

  async load(url = MODEL.url) {
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      const model = gltf.scene;
      model.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        o.material = this.material; o.castShadow = false; o.receiveShadow = false;
      });
      const wb = CAR.wheelbase;
      const s = wb / (MODEL.rearAxleX - MODEL.frontAxleX);
      const a = (1 - CAR.frontWeight) * wb;                 // COM to front axle
      model.scale.setScalar(s);
      if (!MODEL.flip) {
        this.holder.rotation.y = Math.PI / 2;
        model.position.set(-MODEL.frontAxleX * s - a, -this.restHeight - MODEL.groundY * s, -MODEL.centerZ * s);
      } else {
        this.holder.rotation.y = -Math.PI / 2;
        model.position.set(a - MODEL.rearAxleX * s, -this.restHeight - MODEL.groundY * s, MODEL.centerZ * s);
      }
      this.holder.remove(this.placeholder);
      this.holder.add(model);
      this.loaded = true;
    } catch (e) {
      console.warn('Could not load car model, using a box.', e);
    }
  }
}

/** Driver-style chase camera: sits low behind the car and lags into corners. */
export class ChaseCamera {
  constructor(camera) {
    this.cam = camera; this.mode = 0; this.yaw = 0; this.y = 0; this.ly = 0;
    this.pos = new THREE.Vector3(); this.shake = 0; this.ready = false;
    this._q = Track.newQuery(); this._f = new THREE.Vector3(); this._v = new THREE.Vector3();
  }
  cycle() { this.mode = (this.mode + 1) % 3; this.ready = false; return ['Chase', 'High', 'Bumper'][this.mode]; }
  snap() { this.ready = false; }
  impact(mag) { this.shake = Math.min(1, this.shake + mag * 0.05); }

  update(dt, p, quat, vel, track) {
    const f = this._f.set(0, 0, 1).applyQuaternion(quat);
    const speed = Math.hypot(vel.x, vel.z);
    const heading = Math.atan2(f.x, f.z);
    if (this.mode === 2) {
      const off = this._v.set(0, 0.5, 2.6).applyQuaternion(quat);
      this.cam.position.copy(p).add(off);
      this.cam.quaternion.copy(quat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.02, Math.PI, 0)));
      this.cam.fov += (74 + speed * 0.2 - this.cam.fov) * Math.min(1, 4 * dt);
      this.cam.updateProjectionMatrix();
      return;
    }
    let target = heading;
    if (speed > 8 && f.x * vel.x + f.z * vel.z > 0) {
      const w = clamp((speed - 8) / 22, 0, 1) * 0.5;
      target = heading + wrapPi(Math.atan2(vel.x, vel.z) - heading) * w;
    }
    if (!this.ready) { this.yaw = target; this.y = p.y; this.ly = p.y; this.ready = true; }
    this.yaw += wrapPi(target - this.yaw) * (1 - Math.exp(-4.2 * dt));
    this.y += (p.y - this.y) * (1 - Math.exp(-9 * dt));
    this.ly += (p.y - this.ly) * (1 - Math.exp(-14 * dt));
    const far = this.mode === 1;
    const dist = (far ? 12 : 7.2) + speed * 0.025, h = far ? 5.8 : 2.5;
    const sx = Math.sin(this.yaw), cz = Math.cos(this.yaw);
    this.pos.set(p.x - sx * dist, this.y + h, p.z - cz * dist);
    const q = track.query(this.pos.x, this.pos.y + 3, this.pos.z, this._q, 3);
    if (q.idx >= 0 || q.y === 0) this.pos.y = Math.max(this.pos.y, q.y + 0.9);
    this.shake *= Math.exp(-6 * dt);
    const sh = this.shake * 0.35;
    this.cam.position.set(this.pos.x + (Math.random() - 0.5) * sh, this.pos.y + (Math.random() - 0.5) * sh, this.pos.z + (Math.random() - 0.5) * sh);
    const look = (far ? 6 : 5) + speed * 0.12;
    this.cam.lookAt(p.x + sx * look, this.ly + (far ? 0.4 : 1.0), p.z + cz * look);
    const fov = (far ? 58 : 62) + clamp(speed, 0, 65) * 0.34;
    this.cam.fov += (fov - this.cam.fov) * Math.min(1, 5 * dt);
    this.cam.updateProjectionMatrix();
  }
}
