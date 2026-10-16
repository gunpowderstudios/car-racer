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

export const CARAVAN_MODEL = { url: 'cars/caravan-SHRINK.glb', length: 4.4 };

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
    model.position.set(-axleX, -wheelR - floor, -axleZ);
    this.holder.updateMatrixWorld(true);
    this.wheels = [];
    wheelNodes.forEach((w) => {
      const c = new THREE.Box3().setFromObject(w).getCenter(new THREE.Vector3());
      const pivot = new THREE.Group(); this.holder.add(pivot); pivot.position.copy(this.holder.worldToLocal(c.clone()));
      pivot.updateMatrixWorld(true); pivot.attach(w); this.wheels.push(pivot);
    });
    const fb = new THREE.Box3().setFromObject(this.holder), fs = fb.getSize(new THREE.Vector3());
    this.dims = { dAxle: Math.max(1.5, fb.max.z), wheelR, length: fs.z, width: fs.x, wheelsFound: wheelNodes.length };
  }

  /** Remember where the caravan is after a physics step (the picture blends between the last two). Call with null when there is no caravan. */
  capture(van) {
    if (!van) { this._prev = this._cur = null; return; }
    const a = van.axle, snap = [a.x, a.y, a.z, van.yaw, van.pitch, van.roll, van.spin];
    this._prev = this._cur || snap; this._cur = snap;
  }
  /** Put the picture straight at the caravan's state, with nothing to blend from. */
  snap(van) { this._prev = this._cur = null; this.capture(van); this.capture(van); this.update(1); }

  update(a = 1) {
    if (!this.loaded || !this._cur) return;
    const p = this._prev || this._cur, c = this._cur, l = (x, y) => x + (y - x) * a;
    this.root.position.set(l(p[0], c[0]), l(p[1], c[1]), l(p[2], c[2]));
    this._e.set(-l(p[4], c[4]), p[3] + wrap(c[3] - p[3]) * a, l(p[5], c[5]));
    this.root.quaternion.setFromEuler(this._e);
    const spin = l(p[6], c[6]) % (Math.PI * 2);
    for (const w of this.wheels) w.rotation.x = spin;
  }
}
