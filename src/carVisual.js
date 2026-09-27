// Visual car (glTF model aligned to the physics wheels) and the chase camera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CAR } from './vehicle.js';
import { clamp, wrapPi } from './math.js';
import { Track } from './track.js';

// Measurements of cars/car.glb (model units). The model is a single mesh, 189 units long
// with its nose towards -X. Wheel centres were measured from the silhouette.
// cars/car-textured.glb is the textured car.gltf, baked into the same position and scale,
// so these numbers fit both. Models that carry their own textures keep their materials;
// untextured ones get the paint colour from the menu.
export const MODEL = {
  url: 'cars/car-textured.glb',
  frontAxleX: -62, rearAxleX: 45,
  centerZ: 3.5845, groundY: -9.3037,
  flip: false,            // set true if your model's nose points the other way
  paint: 0xd9482b,
};

// Paint jobs for the rival cars. `rot` turns the hue of the model's (orange) texture; `sat` washes it out.
// Each look is made once, the first time a rival wears it, and shared by every car with that look.
export const RIVAL_LOOKS = [
  { name: 'Yellow', rot: 38, sat: 1.05, val: 1.05, tint: 0xe8c22a },
  { name: 'Green', rot: 115, sat: 0.9, val: 0.95, tint: 0x3f9a55 },
  { name: 'Teal', rot: 160, sat: 0.95, val: 1.0, tint: 0x2aa6a0 },
  { name: 'Blue', rot: 215, sat: 1.0, val: 1.0, tint: 0x3a6fd0 },
  { name: 'Violet', rot: 270, sat: 0.95, val: 1.0, tint: 0x7d52c8 },
  { name: 'Pink', rot: 320, sat: 0.95, val: 1.05, tint: 0xd8558f },
  { name: 'Grey', rot: 0, sat: 0.08, val: 1.05, tint: 0xa9a9a9 },
];
const recoloured = new WeakMap();           // source texture -> Map(look -> texture)

/** A copy of `tex` with the look applied, or null if the picture can't be read back (then the caller tints instead). */
function recolour(tex, look) {
  let per = recoloured.get(tex);
  if (!per) recoloured.set(tex, per = new Map());
  if (per.has(look)) return per.get(look);
  let out = null;
  try {
    const img = tex.image, w = img.width, h = img.height;
    if (!w || !h) throw new Error('no picture');
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, w, h), px = data.data;
    const a = look.rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    // the standard hue-rotation matrix
    const m0 = 0.213 + c * 0.787 - sn * 0.213, m1 = 0.715 - c * 0.715 - sn * 0.715, m2 = 0.072 - c * 0.072 + sn * 0.928;
    const m3 = 0.213 - c * 0.213 + sn * 0.143, m4 = 0.715 + c * 0.285 + sn * 0.140, m5 = 0.072 - c * 0.072 - sn * 0.283;
    const m6 = 0.213 - c * 0.213 - sn * 0.787, m7 = 0.715 - c * 0.715 + sn * 0.715, m8 = 0.072 + c * 0.928 + sn * 0.072;
    const sat = look.sat, val = look.val;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], gg = px[i + 1], b = px[i + 2];
      let R = m0 * r + m1 * gg + m2 * b, G = m3 * r + m4 * gg + m5 * b, B = m6 * r + m7 * gg + m8 * b;
      const l = 0.299 * R + 0.587 * G + 0.114 * B;
      R = (l + (R - l) * sat) * val; G = (l + (G - l) * sat) * val; B = (l + (B - l) * sat) * val;
      px[i] = R < 0 ? 0 : R > 255 ? 255 : R; px[i + 1] = G < 0 ? 0 : G > 255 ? 255 : G; px[i + 2] = B < 0 ? 0 : B > 255 ? 255 : B;
    }
    g.putImageData(data, 0, 0);
    out = new THREE.CanvasTexture(cv);
    out.flipY = tex.flipY; out.colorSpace = tex.colorSpace; out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
    out.minFilter = tex.minFilter; out.magFilter = tex.magFilter; out.anisotropy = tex.anisotropy; out.channel = tex.channel;
  } catch (e) { console.warn('Could not recolour the rival texture, tinting instead.', e); out = null; }
  per.set(look, out);
  return out;
}

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

  setPaint(hex) { this.material.color.set(hex); this.material.userData.base = this.material.color.clone(); this._lookKey = -1; }

  /**
   * Become a rival: copy the loaded model from `src` (sharing its geometry, so it costs almost nothing)
   * and give it a paint job from RIVAL_LOOKS. Returns false if `src` hasn't finished loading yet.
   */
  adopt(src, look) {
    if (this.loaded || !src.loaded || !src.model) return false;
    const model = src.model.clone(true);
    this.mats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material.clone();
      if (m.map) {
        const t = recolour(m.map, look);
        if (t) m.map = t; else m.color.set(look.tint);
      } else m.color.set(look.tint);
      m.userData.base = m.color.clone();
      o.material = m; o.castShadow = false; o.receiveShadow = false;
      this.mats.push(m);
    });
    this.holder.rotation.copy(src.holder.rotation);
    this.holder.remove(this.placeholder);
    this.holder.add(model);
    this.model = model; this.loaded = true; this.hasTexture = src.hasTexture;
    this._lookKey = -1;
    return true;
  }

  /**
   * Show damage: `dark` (1 = fresh, 0 = burnt black) dims the paint, `flash` (0..1) lights the car up red for a moment.
   * Nothing is touched until the values change, so calling it every frame is cheap.
   */
  setLook(dark, flash = 0) {
    const key = Math.round(dark * 50) * 100 + Math.round(flash * 20);
    if (key === this._lookKey) return;
    this._lookKey = key;
    const list = this.mats && this.mats.length ? this.mats : [this.material];
    for (const m of list) {
      const base = m.userData.base || (m.userData.base = m.color.clone());
      m.color.copy(base).multiplyScalar(dark);
      m.emissive.setRGB(flash * 0.9, flash * 0.2, 0);
    }
  }

  /** True once a model with its own texture is showing (the paint colour no longer applies). */
  get textured() { return this.hasTexture === true; }

  async load(url = MODEL.url) {
    try {
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
      const model = gltf.scene;
      this.hasTexture = false;
      this.mats = [];
      model.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
        o.castShadow = false; o.receiveShadow = false;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (mats.some((m) => m && m.map)) {
          this.hasTexture = true;
          for (const m of mats) {
            for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) t.anisotropy = 8;
            m.envMapIntensity = 0.8;
            this.mats.push(m);
          }
        } else {
          o.material = this.material;
          this.mats.push(this.material);
        }
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
      this.model = model; this._lookKey = -1;
      this.loaded = true;
      this.onLoad?.(this);
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
    this.boosting = false; this.kick = 0;   // widens the view while boosting
    this._q = Track.newQuery(); this._f = new THREE.Vector3(); this._v = new THREE.Vector3();
  }
  cycle() { this.mode = (this.mode + 1) % 4; this.ready = false; return ['Chase', 'High', 'Bumper', 'Bonnet'][this.mode]; }
  snap() { this.ready = false; }
  impact(mag) { this.shake = Math.min(1, this.shake + mag * 0.05); }

  update(dt, p, quat, vel, track) {
    const f = this._f.set(0, 0, 1).applyQuaternion(quat);
    const speed = Math.hypot(vel.x, vel.z);
    const heading = Math.atan2(f.x, f.z);
    this.kick += ((this.boosting ? 1 : 0) - this.kick) * Math.min(1, (this.boosting ? 5 : 2.5) * dt);
    if (this.mode === 2) {
      const off = this._v.set(0, 0.5, 2.6).applyQuaternion(quat);
      this.cam.position.copy(p).add(off);
      this.cam.quaternion.copy(quat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.02, Math.PI, 0)));
      this.cam.fov += (74 + speed * 0.2 + this.kick * 10 - this.cam.fov) * Math.min(1, 4 * dt);
      this.cam.updateProjectionMatrix();
      return;
    }
    if (this.mode === 3) {
      const off = this._v.set(0, 0.75, 1.3).applyQuaternion(quat);
      this.cam.position.copy(p).add(off);
      this.cam.quaternion.copy(quat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.02, Math.PI, 0)));
      this.cam.fov += (64 + speed * 0.22 + this.kick * 10 - this.cam.fov) * Math.min(1, 4 * dt);
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
    this.shake = Math.max(this.shake * Math.exp(-6 * dt), this.kick * 0.12);
    const sh = this.shake * 0.35;
    this.cam.position.set(this.pos.x + (Math.random() - 0.5) * sh, this.pos.y + (Math.random() - 0.5) * sh, this.pos.z + (Math.random() - 0.5) * sh);
    const look = (far ? 6 : 5) + speed * 0.12;
    this.cam.lookAt(p.x + sx * look, this.ly + (far ? 0.4 : 1.0), p.z + cz * look);
    const fov = (far ? 58 : 62) + clamp(speed, 0, 65) * 0.34 + this.kick * 12;
    this.cam.fov += (fov - this.cam.fov) * Math.min(1, 5 * dt);
    this.cam.updateProjectionMatrix();
  }
}
