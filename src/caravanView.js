// How the towed caravan looks (the physics is in caravan.js). It loads cars/caravan-SHRINK.glb and works out the rest for itself,
// so the model can be dropped in as it comes out of Shrink:
//  * the long way along the model is the way it faces; the narrow, lower end (the A-frame drawbar) is the end that is hooked to the car
//    (or the end nearest a node called Hitch / Tow / Coupling / Drawbar, if the model has one);
//  * the model is scaled to `length` metres long;
//  * wheels are the nodes called Wheel...: they are pivoted about their own centres and spun as the caravan rolls, and where they sit gives the axle.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { assetUrl } from './assetVersion.js';
import { recolour, CarVisual, wheelAxle } from './carVisual.js';
import { splitWheelTriangles } from './wheelSplit.js';
import { makeDentable } from './dents.js';

export const CARAVAN_MODEL = { url: 'cars/caravan-SHRINK.glb', length: 4.4 };

const clampH = (h) => (h > 1 ? 1 : h < 0 ? 0 : h || 0);
const DENT_BOOST = 3;     // a caravan's thin skin crumples visibly even from a modest knock
const vanDentMax = () => Math.max(CarVisual.dentMax, 6);   // dents show even on the low quality tier: it is the one clear sign the caravan is being hurt
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class CaravanView {
  constructor(scene) {
    this.root = new THREE.Group(); this.root.visible = false;
    this.holder = new THREE.Group(); this.root.add(this.holder);
    scene.add(this.root);
    this.wheels = [];
    this.loaded = false; this.failed = false; this._loading = null;
    this.dims = null;                       // { dAxle, wheelR, length, width } once loaded
    this._prev = null; this._cur = null;
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._spinAxis = new THREE.Vector3(); this._hq = new THREE.Quaternion();
  }

  /** A copy for a rival's caravan, painted in the rival's colour (`look` is one of RIVAL_LOOKS; the model's own paint is a mint green, not the cars' orange). Needs this one loaded. */
  cloneFor(scene, look) {
    const v = new CaravanView(scene);
    v.root.remove(v.holder); v.holder = this.holder.clone(true); v.root.add(v.holder);
    const l = { ...look, rot: look.rot - 135 }, tint = new THREE.Color(look.tint);
    v.holder.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (o.material.map) { const t = recolour(o.material.map, l); if (t) o.material.map = t; }
      o.material.color.setHex(0xffffff).lerp(tint, 0.55); o.material.userData.base = o.material.color.clone();      // the model's paint is a pale pastel, so give it some of the colour on top of the turned hue
    });
    v.wheels = []; v.holder.traverse((o) => { if (o.userData?.pivot) v.wheels.push(o); });
    v._markRest();
    v.dents = makeDentable(v.root, v.holder, vanDentMax(), (o) => { for (let p = o; p; p = p.parent) if (/wheel|arch/i.test(p.name || '')) return true; return false; }); v.isClone = true; v._h = 1;      // (rival and remote caravans dent from their health dropping: see update)
    v.loaded = true; v.dims = this.dims; v._wantVisible = true; v.root.visible = true;
    return v;
  }

  _markRest() { for (const w of this.wheels) w.userData.rest = { pos: w.position.clone(), quat: w.quaternion.clone(), scale: w.scale.clone() }; }
  /** Dent the body where a knock landed (`e` has the world x, y, z and the damage `hp`). */
  dent(e) {
    if (!this.dents || !(e.hp > 0)) return;
    this._dv = this._dv || new THREE.Vector3();
    this.root.updateWorldMatrix(true, false);
    this.root.worldToLocal(this._dv.set(e.x, e.y, e.z));
    this.dents.add(this._dv.x, this._dv.y, this._dv.z, e.hp * DENT_BOOST);
    this._roofDent(e.hp * DENT_BOOST);
  }
  /** Every knock a caravan takes also crumples a bit of its roof (a flat, thin roof flexes whatever hit the sides): a dent somewhere on top, away from the last one. */
  _roofDent(hp) {
    const d = this.dims; if (!this.dents || !d || !(d.roof > 0)) return;
    const n = (this._rn = (this._rn || 0) + 1), u = (n * 0.618034) % 1, v = (n * 0.381966 + 0.2) % 1;       // (spread about the roof without a random number)
    this.dents.add((u - 0.5) * d.width * 0.6, d.roof - 0.04, d.rear + (d.front - d.rear) * (0.1 + 0.8 * v), hp * 0.7);
  }
  /** Hand the wheel that comes off to be thrown (see wheelDebris.js; the same shape as CarVisual.detachWheels). A wrecked caravan loses its LEFT wheel only, and the other stays on: it sags to that side and is dragged. */
  detachWheels() {
    if (!this.loaded || !this.wheels.length || this._wheelsOff || !this.root.parent) return null;
    this.root.updateWorldMatrix(true, true);
    const scene = this.root.parent, out = [], p = new THREE.Vector3();
    let left = this.wheels[0], best = -Infinity;
    for (const w of this.wheels) { w.getWorldPosition(p); this.root.worldToLocal(p); if (p.x > best) { best = p.x; left = w; } }      // (+x is the left, as on the cars)
    scene.attach(left); out.push({ node: left, radius: (this.dims?.wheelR || 0.3) });
    this._wheelsOff = true; this._lostWheel = left;
    return out;
  }
  restoreWheels() {
    if (!this._wheelsOff) return;
    for (const w of this.wheels) { const r = w.userData.rest; w.removeFromParent(); this.holder.add(w); if (r) { w.position.copy(r.pos); w.quaternion.copy(r.quat); w.scale.copy(r.scale); } w.visible = true; }
    this._wheelsOff = false; this._lostWheel = null; this._sag = 0;
  }
  get visible() { return this.root.visible; }
  set visible(v) { this.root.visible = !!v && this.loaded; this._wantVisible = !!v; }

  /** Load the model (once). Resolves to the measurements the physics needs, or null if the file could not be loaded. */
  load(url = CARAVAN_MODEL.url, length = CARAVAN_MODEL.length) {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      try {
        const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(assetUrl(url));
        this._build(gltf.scene, length);
        this.loaded = true; this.root.visible = !!this._wantVisible;
        return this.dims;
      } catch (e) {
        console.warn('Could not load the caravan model.', e);
        this.failed = true; return null;
      }
    })();
    return this._loading;
  }

  _build(model, length) {
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      o.castShadow = false; o.receiveShadow = false;
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    const lengthAxis = size.x > size.z ? 'x' : 'z', sideAxis = lengthAxis === 'x' ? 'z' : 'x';
    // which end is the drawbar: a node with a telling name, else the narrower end
    let towMax = null;
    model.traverse((o) => {
      if (towMax !== null || !/hitch|tow|coupl|drawbar/i.test(o.name || '')) return;
      const p = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      towMax = p[lengthAxis] > (box.min[lengthAxis] + box.max[lengthAxis]) / 2;
    });
    if (towMax === null) {
      const lo = box.min[lengthAxis], hi = box.max[lengthAxis], cut = size[lengthAxis] * 0.12;
      const ext = { lo: [Infinity, -Infinity], hi: [Infinity, -Infinity] }, v = new THREE.Vector3();
      model.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 2) {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          const a = v[lengthAxis], b = v[sideAxis];
          const e = a < lo + cut ? ext.lo : a > hi - cut ? ext.hi : null;
          if (e) { if (b < e[0]) e[0] = b; if (b > e[1]) e[1] = b; }
        }
      });
      towMax = (ext.hi[1] - ext.hi[0]) < (ext.lo[1] - ext.lo[0]);
    }
    // turn the model so its drawbar points along +z (the way a car faces), and scale it to length
    this.holder.rotation.y = lengthAxis === 'z' ? (towMax ? 0 : Math.PI) : (towMax ? -Math.PI / 2 : Math.PI / 2);
    const s = length / size[lengthAxis];
    model.scale.setScalar(s);
    this.holder.add(model);
    this.holder.updateMatrixWorld(true);
    // wheels
    const wheelNodes = [];
    model.traverse((o) => { if (/wheel/i.test(o.name || '') && !wheelNodes.some((w) => { let p = o.parent; while (p) { if (p === w) return true; p = p.parent; } return false; })) wheelNodes.push(o); });
    // the wheel meshes carry a bit of the body's wheel-arch skirt: hand that back to the body so it stays put when the wheel turns
    for (const w of wheelNodes.slice()) {
      if (!w.isMesh || !w.geometry.index) continue;
      const { wheel, rest } = splitWheelTriangles(w.geometry);
      if (!rest.length || !wheel.length) continue;
      const mk = (ix) => { const g = new THREE.BufferGeometry(); for (const k in w.geometry.attributes) g.setAttribute(k, w.geometry.attributes[k]); g.setIndex(ix); return g; };
      const arch = new THREE.Mesh(mk(rest), w.material);
      arch.name = 'ArchSkirt'; arch.position.copy(w.position); arch.quaternion.copy(w.quaternion); arch.scale.copy(w.scale);
      w.parent.add(arch);
      w.geometry = mk(wheel);
    }
    this.holder.updateMatrixWorld(true);
    const hb = new THREE.Box3().setFromObject(this.holder), hs = hb.getSize(new THREE.Vector3());
    let axleX = 0, axleZ = (hb.min.z + hb.max.z) / 2 - hs.z * 0.05, floor = hb.min.y, wheelR = 0.33;
    const centres = [];
    if (wheelNodes.length) {
      let sx = 0, sz = 0, rMax = 0, yMin = Infinity;
      for (const w of wheelNodes) {
        const wb = new THREE.Box3().setFromObject(w), c = wb.getCenter(new THREE.Vector3());
        centres.push(c); sx += c.x; sz += c.z; rMax = Math.max(rMax, (wb.max.y - wb.min.y) / 2); yMin = Math.min(yMin, wb.min.y);
      }
      axleX = sx / wheelNodes.length; axleZ = sz / wheelNodes.length; wheelR = rMax || wheelR; floor = yMin;
    }
    // origin of the caravan = the centre of the axle, at the wheel centre height; the ground is wheelR below
    this.holder.position.set(-axleX, -wheelR - floor, -axleZ);       // (the holder, not the model: these numbers are in the car-facing frame, the model is turned inside the holder)
    this.holder.updateMatrixWorld(true);
    this.wheels = [];
    wheelNodes.forEach((w) => {
      const c = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3());
      // a wheel turns about its real hub, not its box centre: fit the tyre's rim and use that when it is believable and close (else the box centre stays)
      const wm = w.isMesh ? w : w.children.find((k) => k.isMesh);
      if (wm && wm.geometry && wm.geometry.attributes.position) {
        const f = wheelAxle(wm.geometry), hub = new THREE.Vector3(f.x, f.y, f.z).applyMatrix4(wm.matrixWorld);
        const half = (new THREE.Box3().setFromObject(w).getSize(new THREE.Vector3()).y) / 2;
        if (f.r > 0 && hub.distanceTo(c) < half * 0.15) c.copy(hub);
      }
      const pivot = new THREE.Group(); pivot.userData.pivot = true; this.holder.add(pivot); pivot.position.copy(this.holder.worldToLocal(c.clone()));
      pivot.updateMatrixWorld(true); pivot.attach(w); this.wheels.push(pivot);
    });
    this._markRest();
    // dents: the body gets a material of its own, so the wheels and wheel-arch skirt (which share the model's one material) are not dented with it
    // (a wheel can hold more vertices than the body, and its mesh may be unnamed under a node called Wheel...: look up the tree too)
    const isWheelish = (o) => { for (let p = o; p; p = p.parent) if (/wheel|arch/i.test(p.name || '')) return true; return false; };
    let body = null; model.traverse((o) => { if (o.isMesh && !isWheelish(o) && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o; });
    if (body && !Array.isArray(body.material)) body.material = body.material.clone();
    this.dents = makeDentable(this.root, this.holder, vanDentMax(), isWheelish);
    const fb = new THREE.Box3().setFromObject(this.holder), fs = fb.getSize(new THREE.Vector3());
    // where the body ends and the A-frame drawbar starts: the furthest slice along the caravan that is still nearly as wide as the whole thing
    const bins = new Map(), pv = new THREE.Vector3();
    this.holder.updateMatrixWorld(true);
    this.holder.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 2) {
        pv.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const k = Math.round(pv.z * 10), e = bins.get(k) || [Infinity, -Infinity];
        if (pv.x < e[0]) e[0] = pv.x; if (pv.x > e[1]) e[1] = pv.x; bins.set(k, e);
      }
    });
    let bodyFront = 0;
    for (const [k, e] of bins) if (e[1] - e[0] > 0.6 * fs.x && k / 10 > bodyFront) bodyFront = k / 10;
    // The ball is put just ahead of the body, so the drawbar tucks under the back of the car and the caravan looks hitched on, not trailing behind with a gap.
    this.dims = { dAxle: Math.min(fb.max.z, Math.max(1.5, bodyFront + 0.4)), tip: fb.max.z, front: bodyFront, rear: fb.min.z, wheelR, length: fs.z, width: fs.x, roof: fb.max.y, wheelsFound: wheelNodes.length };
  }

  /** Remember where the caravan is after a physics step (the picture blends between the last two). Call with null when there is no caravan. */
  capture(van) {
    if (!van) { this._prev = this._cur = null; return; }
    const a = van.axle, snap = [a.x, a.y, a.z, van.yaw, van.pitch, van.roll, van.spin, van.sway, van.health / van.spec.hp];
    this._prev = this._cur || snap; this._cur = snap;
  }
  /** Battered paint: the less health, the darker and dirtier the caravan looks. */
  _shade(h) {
    h = Math.round(clampH(h) * 20) / 20;
    if (h === this._shaded) return;
    this._shaded = h;
    const k = 0.3 + 0.7 * h;
    this.holder.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (!m.userData.base) m.userData.base = m.color.clone(); m.color.copy(m.userData.base).multiplyScalar(k); }
    });
  }
  /** Put the picture straight at the caravan's state, with nothing to blend from. */
  snap(van) { this._prev = this._cur = null; this.capture(van); this.capture(van); this.update(1); }

  update(a = 1) {
    if (!this.loaded || !this._cur) return;
    const p = this._prev || this._cur, c = this._cur, l = (x, y) => x + (y - x) * a;
    this.root.position.set(l(p[0], c[0]), l(p[1], c[1]), l(p[2], c[2]));
    this._e.set(-l(p[4], c[4]), p[3] + wrap(c[3] - p[3]) * a, l(p[5], c[5]) + l(p[7], c[7]));      // (road lean + the body rocking on its springs)
    this._shade(c[8]);
    if (this.isClone && this.dents) {                                                 // someone else's caravan: a dent wherever a knock cost it health (the spot is only a good guess)
      const drop = this._h - c[8];
      if (drop > 0.02 && this.dims) {
        const n = (this._n = (this._n || 0) + 1), d = this.dims, side = n % 3 === 0 ? 0 : (n % 2 ? 1 : -1);
        this.dents.add(side * d.width / 2, 0.9, side ? d.rear + (d.front - d.rear) * ((n * 0.37) % 1) : d.rear, drop * 60 * DENT_BOOST * 4);
        this._roofDent(drop * 60 * DENT_BOOST * 2);
        this._h = c[8];
      } else if (drop < 0) this._h = c[8];
      if (c[8] >= 0.999 && this.dents.count) this.dents.clear();
    }
    this.wrecked = c[8] <= 0;
    if (!this.wrecked && this._wheelsOff) this.restoreWheels();                       // repaired / a restart: wheels back on
    if (c[8] >= 0.999 && this.dents && this.dents.count) this.dents.clear();
    // wheel gone: it sags down on that side, easing over in about half a second, and sits a little lower
    this._sag = (this._sag || 0) + ((this.wrecked && this._wheelsOff ? 1 : 0) - (this._sag || 0)) * 0.12;
    if (this._sag > 0.001) { this.root.position.y -= 0.1 * this._sag; this._e.z -= 0.2 * this._sag; }
    this.root.quaternion.setFromEuler(this._e);
    const spin = l(p[6], c[6]) % (Math.PI * 2);
    // spin about the car's sideways axis (the holder is turned to face the car, so that axis is not the pivots' own x)
    this._spinAxis.set(1, 0, 0).applyQuaternion(this._hq.copy(this.holder.quaternion).invert());
    for (const w of this.wheels) if (w !== this._lostWheel && !(this.wrecked && this._wheelsOff)) w.quaternion.setFromAxisAngle(this._spinAxis, spin);      // (the one wheel left on a wrecked caravan is dragged: it does not turn)
  }
}
