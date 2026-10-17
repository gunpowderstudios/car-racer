// Visual car (glTF model aligned to the physics wheels) and the chase camera.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CAR } from './vehicle.js';
import { clamp, wrapPi } from './math.js';
import { Track } from './track.js';
import { makeDentable } from './dents.js';

// Measurements of the current car model (model units). The model is a single mesh, 189 units long
// with its nose towards -X. Wheel centres were measured from the silhouette.
// cars/dodge-shrink.glb is the current player car. Vertical placement is measured automatically
// from each model's bounding box, so replacement GLBs can have a different origin without sinking/floating.
// Models that carry their own textures keep their materials; untextured ones get the paint colour from the menu.
export const MODEL = {
  url: 'cars/dodge-shrink.glb',
  frontAxleX: -62, rearAxleX: 45,
  centerZ: 3.5845, groundY: -9.3037, // legacy reference only; Y is now auto-grounded from the model bounds
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
/** A model exported without metal/roughness factors gets the glTF defaults (fully metal) and renders as chrome, or black where
 *  there is no environment map (the menu preview). Give it the same painted-metal look as the other cars. */
export function tidyGltfMaterial(m) {
  if (m && m.metalness >= 1 && m.roughness >= 1) { m.metalness = 0; m.roughness = 0.54; }
}
/** Where a wheel mesh's axle really is, in the mesh's own coordinates (the axle runs along Z). The wheels in the models were cut out of
 *  the car, and a wheel's bounding box is not centred on its axle (it also carries bits of arch), so spinning it about the box centre
 *  made it wobble up and down. This fits a circle to the outer rim instead, ignoring anything that sticks out past it. Cached per geometry. */
const axleCache = new WeakMap();
export function wheelAxle(geo) {
  let c = axleCache.get(geo);
  if (c) return c;
  const a = geo.attributes.position, N = a.count, B = 72;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx0 = (bb.min.x + bb.max.x) / 2, cy0 = (bb.min.y + bb.max.y) / 2, R0 = Math.min(bb.max.x - bb.min.x, bb.max.y - bb.min.y) / 2;
  let ox = cx0, oy = cy0, R = R0;
  const best = new Array(B);
  for (let it = 0; it < 4; it++) {
    best.fill(null);
    for (let i = 0; i < N; i++) {
      const x = a.getX(i), y = a.getY(i), dx = x - ox, dy = y - oy, r = Math.hypot(dx, dy);
      if (it > 0 && r > R * 1.04) continue;                                   // bits of arch and trim sticking out past the tyre
      const k = Math.min(B - 1, Math.floor((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * B));
      if (!best[k] || r > best[k].r) best[k] = { x, y, r };
    }
    const pts = best.filter(Boolean);
    if (pts.length < 12) break;
    let mx = 0, my = 0; for (const p of pts) { mx += p.x; my += p.y; } mx /= pts.length; my /= pts.length;
    let Suu = 0, Svv = 0, Suv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
    for (const p of pts) { const u = p.x - mx, v = p.y - my; Suu += u * u; Svv += v * v; Suv += u * v; Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u; }
    const det = Suu * Svv - Suv * Suv;
    if (Math.abs(det) < 1e-12) break;
    const uc = (0.5 * (Suuu + Suvv) * Svv - 0.5 * (Svvv + Svuu) * Suv) / det, vc = (0.5 * (Svvv + Svuu) * Suu - 0.5 * (Suuu + Suvv) * Suv) / det;
    ox = uc + mx; oy = vc + my;
    R = pts.reduce((t, p) => t + Math.hypot(p.x - ox, p.y - oy), 0) / pts.length;
  }
  // A wheel whose fitted radius is nowhere near its box (the Dodge's: it locked on to the cream hub, not the black tyre) keeps the fitted centre - that is the hub, so it still spins true -
  // but r = 0 tells trimWheel to leave the mesh alone, so no tyre is ever cut away.
  const sane = R > R0 * 0.75 && R < R0 * 1.25;
  c = { x: ox, y: oy, z: (bb.min.z + bb.max.z) / 2, r: sane ? R : 0 };
  axleCache.set(geo, c);
  return c;
}
/** The wheels in some models were cut out of the car with a little of the body still attached (a lump of bumper, arch or mud flap).
 *  Drop every triangle that is not on the wheel: one with a corner out past the tyre's radius, seen along the axle. Done once per geometry. */
export function trimWheel(geo, ax) {
  if (geo.userData.wheelTrimmed || !(ax.r > 0)) return;
  geo.userData.wheelTrimmed = true;
  const a = geo.attributes.position, lim = (ax.r * 1.08) ** 2;
  const idx = geo.index ? geo.index.array : null, n = idx ? idx.length : a.count;
  const out = [], inside = (i) => { const dx = a.getX(i) - ax.x, dy = a.getY(i) - ax.y; return dx * dx + dy * dy <= lim; };
  for (let t = 0; t < n; t += 3) {
    const i0 = idx ? idx[t] : t, i1 = idx ? idx[t + 1] : t + 1, i2 = idx ? idx[t + 2] : t + 2;
    if (inside(i0) && inside(i1) && inside(i2)) out.push(i0, i1, i2);
  }
  if (out.length === n || out.length < n * 0.85) return;                 // nothing to cut, or the fit looks wrong (a real clean-up only removes a few lumps): leave the wheel alone
  geo.setIndex(out);
  geo.userData.wheelCut = (n - out.length) / 3;
}
const RIVAL_TEX_MAX = 1024;
/** Phones: shrink a car's 2048px textures to `max` px before they go to the graphics card (a quarter of the memory and bandwidth). */
function shrinkTexture(t, max) {
  try {
    const img = t.image, sw = img && img.width, sh = img && img.height;
    if (!sw || !sh || Math.max(sw, sh) <= max) return;
    const k = max / Math.max(sw, sh), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
    if (img.close) img.close();
    t.image = cv; t.needsUpdate = true;
  } catch { /* keep the full-size picture */ }
}

const recoloured = new WeakMap();
const pristine = new WeakMap();

export function recolour(tex, look) {
  let per = recoloured.get(tex);
  if (!per) recoloured.set(tex, per = new Map());
  if (per.has(look)) return per.get(look);
  let out = null;
  try {
    const img = tex.image, sw = img.width, sh = img.height;
    if (!sw || !sh) throw new Error('no picture');
    const k = Math.min(1, RIVAL_TEX_MAX / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));   // rivals are seen from a distance: 1024 px is plenty and 4x cheaper than 2048
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h), px = data.data;
    const a = look.rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
    const m0 = 0.213 + c * 0.787 - sn * 0.213, m1 = 0.715 - c * 0.715 - sn * 0.715, m2 = 0.072 - c * 0.072 + sn * 0.928;
    const m3 = 0.213 - c * 0.213 + sn * 0.143, m4 = 0.715 + c * 0.285 + sn * 0.140, m5 = 0.072 - c * 0.072 - sn * 0.283;
    const m6 = 0.213 - c * 0.213 - sn * 0.787, m7 = 0.715 - c * 0.715 + sn * 0.715, m8 = 0.072 + c * 0.928 + sn * 0.072;
    const sat = look.sat, val = look.val;
    if (tex.userData?.neutralBody) {
      // A model whose paint is off-white/grey (the Mini): turning the hue does nothing to it and only recolours the glass. Instead
      // paint the light, low-saturation pixels (the body panels) in the rival's colour, keeping their shading. Dark trim, tyres and
      // the roof, blue glass, lights and plates are left alone; near-white highlights stay light so chrome and plates don't go pastel.
      const tr = (look.tint >> 16) & 255, tg = (look.tint >> 8) & 255, tb = look.tint & 255;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], gg = px[i + 1], b = px[i + 2];
        const hi = Math.max(r, gg, b), lo = Math.min(r, gg, b), v = hi / 255, sat = hi ? (hi - lo) / hi : 0;
        const sk = sat < 0.12 ? 1 : Math.max(0, (0.2 - sat) / 0.08);
        const vk = Math.min(1, Math.max(0, (v - 0.42) / 0.15)) * (1 - 0.7 * Math.min(1, Math.max(0, (v - 0.9) / 0.08)));
        const kk = sk * vk;
        if (kk <= 0) continue;
        const shade = Math.min(1.15, hi / 205);
        px[i] = r + (Math.min(255, tr * shade) - r) * kk; px[i + 1] = gg + (Math.min(255, tg * shade) - gg) * kk; px[i + 2] = b + (Math.min(255, tb * shade) - b) * kk;
      }
    } else for (let i = 0; i < px.length; i += 4) {
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
    out.offset.copy(tex.offset); out.repeat.copy(tex.repeat); out.center.copy(tex.center); out.rotation = tex.rotation;   // the lite models keep their UV scale/offset here (KHR_texture_transform)
  } catch (e) { console.warn('Could not recolour the rival texture, tinting instead.', e); out = null; }
  per.set(look, out);
  return out;
}

/**
 * Make the rivals' paint jobs ahead of time, a little at a time while the player is looking at the menu, so that when a race
 * starts the cars can put their paint on instantly instead of freezing the game for each new colour. `upload(texture)`, when given,
 * also sends each finished texture to the graphics card now rather than on the first frame it is drawn.
 */
export async function warmRivalLooks(src, count, upload) {
  const maps = [];
  for (const m of src.mats || []) { const t = (pristine.get(m) || m).map; if (t && !maps.includes(t)) maps.push(t); }
  const idle = () => new Promise((r) => (window.requestIdleCallback ? window.requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 30)));
  for (let k = 0; k < Math.min(count, RIVAL_LOOKS.length); k++) {
    for (const t of maps) {
      await idle();
      const out = recolour(t, RIVAL_LOOKS[k]);
      if (out && upload) { try { upload(out); } catch { /* not ready yet: it will upload when first drawn */ } }
    }
  }
}

export class CarVisual {
  static aniso = 8;   // texture anisotropy; main.js sets this from the quality tier before any model loads
  static texMax = 0;  // 0 = keep full-size car textures; otherwise shrink them to this many pixels (set from the quality tier)
  static dentMax = 0; // how many crash dents a car can show at once (0 = none); main.js sets this from the quality tier too
  constructor(scene, restHeight) {
    this.restHeight = restHeight;
    this.root = new THREE.Group();
    this.holder = new THREE.Group();
    this.root.add(this.holder);
    scene.add(this.root);
    this.material = new THREE.MeshStandardMaterial({ color: MODEL.paint, roughness: 0.4, metalness: 0.35, side: THREE.DoubleSide });
    const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.62, 4.85), shadowMat);
    body.position.set(0, -0.05, 0); body.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.2), shadowMat);
    cabin.position.set(0, 0.45, -0.2); cabin.castShadow = true;
    this.root.add(body, cabin);
    this.placeholder = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.75, 4.85), this.material);
    this.placeholder.position.y = -0.1;
    // Keep a simple car visible while the GLB is downloading/decoding so the race never starts blank.
    this.placeholder.visible = true;
    this.holder.add(this.placeholder);
    this.loaded = false;
  }

  setPaint(hex) {
    this.material.color.set(hex); this.material.userData.base = this.material.color.clone(); this._lookKey = -1;
    const kept = pristine.get(this.material); if (kept) kept.color.set(hex);
    if (this._ownLook) this._applyOwnLook();
  }

  setOwnLook(look) {
    look = look || null;
    if (look === (this._ownLook || null)) return;
    this._ownLook = look;
    if (this.loaded) this._applyOwnLook();
  }
  _applyOwnLook() {
    const look = this._ownLook;
    for (const m of this.mats || []) {
      let base = pristine.get(m);
      if (!base) pristine.set(m, base = { map: m.map, color: m.color.clone() });
      m.map = base.map; m.color.copy(base.color);
      if (look) {
        if (base.map) { const t = recolour(base.map, look); if (t) m.map = t; else m.color.set(look.tint); }
        else m.color.set(look.tint);
      }
      m.userData.base = m.color.clone(); m.needsUpdate = true;
    }
    this._lookKey = -1;
  }

  adopt(src, look) {
    if (this.loaded || !src.loaded || !src.model || src._wheelsOff) return false;      // (a wrecked source has no wheels on it to copy)
    const model = src.model.clone(true);
    this.mats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material.clone(), kept = pristine.get(o.material);
      if (kept) { m.map = kept.map; m.color.copy(kept.color); }
      if (m.map) {
        const t = recolour(m.map, look);
        if (t) m.map = t; else m.color.set(look.tint);
      } else m.color.set(look.tint);
      m.userData.base = m.color.clone();
      o.material = m; o.castShadow = false; o.receiveShadow = false;
      this.mats.push(m);
    });
    this.holder.rotation.copy(src.holder.rotation);
    this.placeholder.scale.copy(src.placeholder.scale);   // the plain box used by setFar() should match this vehicle's footprint
    this.holder.remove(this.placeholder);
    this.holder.add(model);
    this.model = model; this.loaded = true; this.hasTexture = src.hasTexture;
    this._findWheels();
    this._initDents();
    this._lookKey = -1;
    return true;
  }

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
    if (this.proxy && !list.includes(this.material)) {   // keep the distant box in step with damage and wreck darkening
      const m = this.material, base = m.userData.base || (m.userData.base = m.color.clone());
      m.color.copy(base).multiplyScalar(dark);
      m.emissive.setRGB(flash * 0.9, flash * 0.2, 0);
    }
  }

  // ---- separate wheels (models exported with nodes named Wheel_FL / Wheel_FR / Wheel_RL / Wheel_RR, in the physics' wheel order).
  // A model without them is left alone. The wheel pivots sit on the axles, nose towards -X, so a wheel is steered about its
  // Y axis and rolled about its Z axis. Positive steer turns left, as in vehicle.js.
  _findWheels() {
    this.wheelNodes = null; this.wheelRest = null; this._wheelsOff = false;
    if (!this.model) return;
    const found = {}, axles = {};
    this.model.traverse((o) => {
      const m = /^Wheel_(FL|FR|RL|RR|F)(_axle)?$/.exec(o.name);
      if (m) (m[2] ? axles : found)[m[1]] = o;
    });
    // A three-wheeler has one front wheel (Wheel_F): it stands in for both front wheels, steering and rolling with their average.
    let order = ['FL', 'FR', 'RL', 'RR'];
    if (!order.every((k) => found[k] || axles[k]) && (found.F || axles.F) && (found.RL || axles.RL) && (found.RR || axles.RR)) {
      order = ['F', 'F', 'RL', 'RR'];
    }
    if (order.every((k) => axles[k])) {                                       // a copy of a car that is already fitted (a rival's clone)
      this.wheelNodes = order.map((k) => axles[k]);
      this.wheelRest = this.wheelNodes.map((n) => ({ parent: n.parent, pos: n.position.clone(), quat: n.quaternion.clone(), scale: n.scale.clone() }));
      for (const n of this.wheelNodes) n.rotation.order = 'YZX';
      return;
    }
    if (!order.every((k) => found[k])) return;
    // Re-pivot every wheel on its real axle: a group sits on the axle, the mesh hangs off it, and the group is what turns.
    const made = {};
    this.wheelNodes = order.map((k) => {
      if (made[k]) return made[k];                                            // the single front wheel of a three-wheeler is listed twice
      const host = found[k], m = host.isMesh ? host : host.children.find((c) => c.isMesh);
      if (!m) return host;
      m.updateMatrix();
      // A wheel saved from Shrink says so (extras.wheel) and is already clean and centred on its axle (the node's origin): use it exactly as it is. Older models are guessed at.
      const exact = !!((host.userData && host.userData.wheel) || (m.userData && m.userData.wheel));
      const ax = exact ? { x: 0, y: 0, z: 0, r: 0 } : wheelAxle(m.geometry);
      if (!exact) trimWheel(m.geometry, ax);
      const P = new THREE.Vector3(ax.x, ax.y, ax.z).applyMatrix4(m.matrix);
      const pivot = new THREE.Group(); pivot.name = host.name + '_axle';
      const parent = m.parent;
      pivot.position.copy(P); parent.add(pivot); pivot.add(m); m.position.sub(P);
      return (made[k] = pivot);
    });
    this.wheelRest = this.wheelNodes.map((n) => ({ parent: n.parent, pos: n.position.clone(), quat: n.quaternion.clone(), scale: n.scale.clone() }));
    for (const n of this.wheelNodes) n.rotation.order = 'YZX';
  }
  /** Turn the wheels to match the physics car: front wheels steer, all four roll. Cheap; call it every frame for cars you can see up close. */
  setWheels(car) {
    if (!this.wheelNodes || this._wheelsOff || !car || !car.wheels) return;
    const st = car.steerAngle || 0, n = this.wheelNodes;
    for (let i = 0; i < 4; i++) {
      if (i === 1 && n[1] === n[0]) continue;                                 // one front wheel: set once, from the average of the two
      const w = car.wheels[i], spin = n[1] === n[0] && i === 0 ? (w.spin + car.wheels[1].spin) / 2 : w.spin;
      n[i].rotation.set(0, i < 2 ? st : 0, spin % (Math.PI * 2));
    }
  }
  /** Tear the wheels off into the scene and hand them back as { node, radius } so wheelDebris.js can throw them. */
  detachWheels() {
    if (!this.wheelNodes || this._wheelsOff || !this.root.parent) return null;
    this.root.updateWorldMatrix(true, true);
    const scene = this.root.parent, box = new THREE.Box3(), out = [];
    for (const n of new Set(this.wheelNodes)) {
      box.setFromObject(n);
      const r = Math.max(0.15, (box.max.y - box.min.y) / 2);
      scene.attach(n);
      out.push({ node: n, radius: r });
    }
    this._wheelsOff = true;
    return out;
  }
  /** Put the wheels back on the car (a respawn, or the car going back in the pool). */
  restoreWheels() {
    if (!this.wheelNodes || !this._wheelsOff) return;
    this.wheelNodes.forEach((n, i) => {
      const r = this.wheelRest[i];
      n.removeFromParent(); r.parent.add(n);
      n.position.copy(r.pos); n.quaternion.copy(r.quat); n.scale.copy(r.scale); n.visible = true;
      n.rotation.order = 'YZX';
    });
    this._wheelsOff = false;
  }

  // ---- crash dents (see dents.js). All of this is a no-op on the low tier, where CarVisual.dentMax is 0.
  _initDents() { this.dents = CarVisual.dentMax > 0 && this.model && this.mats && this.mats.length ? makeDentable(this.root, this.model, CarVisual.dentMax, this.material) : null; }
  /** Dent the body where a crash of `hp` hit points landed at (x, y, z) in the car's own space (x right, y up, z forward, metres). */
  addDent(x, y, z, hp) { return this.dents ? this.dents.add(x, y, z, hp) : false; }
  clearDents() { if (this.dents) this.dents.clear(); this.restoreWheels(); }   // (every respawn clears the dents, so it puts the wheels back too)

  /**
   * Level of detail for rivals and remote players. Far away, the 190k-620k triangle model is swapped for
   * a simple two-box silhouette in the car's paint colour. Callers add their own hysteresis. Does nothing
   * until the real model has loaded - the loading box is showing till then.
   */
  setFar(far) {
    if (!this.loaded || !this.model) return;
    if (far === this._far) return;
    this._far = far;
    if (far && !this.proxy) {
      const proxy = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.52, 4.85), this.material);
      body.position.set(0, -0.16, 0);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.46, 2.35), this.material);
      cabin.position.set(0, 0.32, -0.18);
      proxy.add(body, cabin);
      proxy.scale.copy(this.placeholder.scale);
      proxy.position.copy(this.placeholder.position);
      this.proxy = proxy;
      this.root.add(proxy);
    }
    this.model.visible = !far;
    if (this.proxy) this.proxy.visible = far;
  }

  get textured() { return this.hasTexture === true; }

  async load(url = MODEL.url) {
    try {
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url, (e) => this.onProgress?.(e.loaded, e.total));
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
            for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) { t.anisotropy = CarVisual.aniso; if (CarVisual.texMax) shrinkTexture(t, CarVisual.texMax); }
            m.envMapIntensity = 0.8;
            tidyGltfMaterial(m);
            this.mats.push(m);
          }
        } else {
          o.material = this.material;
          this.mats.push(this.material);
        }
      });
      const wb = CAR.wheelbase;
      const s = wb / (MODEL.rearAxleX - MODEL.frontAxleX);
      const a = (1 - CAR.frontWeight) * wb;
      model.scale.setScalar(s);

      if (!MODEL.flip) {
        this.holder.rotation.y = Math.PI / 2;
        model.position.set(-MODEL.frontAxleX * s - a, 0, -MODEL.centerZ * s);
      } else {
        this.holder.rotation.y = -Math.PI / 2;
        model.position.set(a - MODEL.rearAxleX * s, 0, MODEL.centerZ * s);
      }
      model.updateMatrixWorld(true);
      const groundBox = new THREE.Box3().setFromObject(model);
      if (!groundBox.isEmpty() && Number.isFinite(groundBox.min.y)) {
        model.position.y = -this.restHeight - groundBox.min.y;
      } else {
        model.position.y = -this.restHeight - MODEL.groundY * s;
      }

      this.holder.remove(this.placeholder);
      this.holder.add(model);
      this.model = model; this._lookKey = -1;
      this._findWheels();
      this._initDents();
      this.loaded = true;
      if (this._ownLook) this._applyOwnLook();
      this.onLoad?.(this);
    } catch (e) {
      this.placeholder.visible = true;
      this.onProgress?.(-1, 0);                          // tell the loading bar to go away
      console.warn('Could not load car model, using a box.', e);
    }
  }
}

export class ChaseCamera {
  constructor(camera) {
    this.cam = camera; this.mode = 0; this.yaw = 0; this.y = 0; this.ly = 0;
    this.pos = new THREE.Vector3(); this.shake = 0; this.ready = false;
    this.boosting = false; this.kick = 0;
    this.low = false;                            // set for tracks with roads stacked above each other (The Twister): the camera is kept out from behind the road above
    this.towLen = 0; this._tow = 0;              // metres of caravan behind the car: the camera drops back and up so it can see over it
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
    const far = this.mode === 1, stacked = this.low;                 // (stacked: a track with roads above each other - the camera must not end up behind the road above)
    this._tow += (this.towLen - this._tow) * (1 - Math.exp(-3 * dt));
    const dist = (far ? 12 : 7.2) + speed * 0.025 + this._tow * (far ? 0.7 : 1.0), h = (far ? 5.8 : 2.5) + this._tow * (far ? 0.4 : 0.85);
    const sx = Math.sin(this.yaw), cz = Math.cos(this.yaw);
    let reach = 1;
    if (stacked) {
      // Walk the line from the car out to where the camera wants to be. If any step of it would pass through the road above (a ceiling well over the car's own road), stop short of it.
      const cy0 = p.y + 1.4, cy1 = this.y + h;
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, x = p.x - sx * dist * t, z = p.z - cz * dist * t, y = cy0 + (cy1 - cy0) * t;
        const c = track.query(x, y + 40, z, this._q, 40);
        if (c.idx >= 0 && c.y > p.y + 3 && y > c.y - 1.3) { reach = Math.max(0.2, (k - 1) / 8); break; }
      }
    }
    this.pos.set(p.x - sx * dist * reach, p.y + 1.4 + (this.y + h - p.y - 1.4) * reach, p.z - cz * dist * reach);
    const q = stacked ? track.query(this.pos.x, p.y + 1.6, this.pos.z, this._q, 1.1) : track.query(this.pos.x, this.pos.y + 3, this.pos.z, this._q, 3);      // (on stacked roads only look for the road the car is on, not the one above)
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