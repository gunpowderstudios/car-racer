// What Weeval Knievel looks like: the row of parked buses, the painted bullseye on the landing ramp, the barrier at the end of the run-out,
// the concrete under the jump, pylons holding the long ramp up and the signs. The solid parts (buses, barrier) are the boxes weeval.js puts in the
// track's `blocks`, so what you see is what you hit.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { loadGltf } from './modelCache.js';
import { assetUrl } from './assetVersion.js';
import { Track, GROUND_Y } from './track.js';
import { WEEVAL, layoutFor } from './weeval.js';

const BOXES = { S: 1.8, depth: 5, top: 3 };      // the cardboard stack: box size (m), rows deep, and how many high at the back (about half as many boxes again, each bigger)
const BUS_COLOURS = [0xc0281f, 0xc0281f, 0xc0281f, 0xb5241b, 0xc0281f, 0xc0281f, 0xd0402a, 0xc0281f];      // London red, mostly

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/** The painted target: concentric rings, outer edge first. The picture's x runs along the road, y across it. */
function bullseyeTex() {
  const rings = WEEVAL.rings, R = rings[rings.length - 1];
  return canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cols = ['#f4f1e8', '#d02a1f', '#f4f1e8', '#d02a1f'], mid = w / 2, k = (w / 2 - 4) / R;
    for (let i = rings.length - 1; i >= 0; i--) { g.beginPath(); g.arc(mid, mid, rings[i] * k, 0, Math.PI * 2); g.fillStyle = cols[i % 4]; g.fill(); }
    g.beginPath(); g.arc(mid, mid, rings[0] * k, 0, Math.PI * 2); g.fillStyle = '#ffc21a'; g.fill();
    g.lineWidth = 5; g.strokeStyle = '#1b1b1b'; for (const r of rings) { g.beginPath(); g.arc(mid, mid, r * k, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle';          // the points, written along the road so they read as you come in to land
    g.save(); g.translate(mid, mid); g.rotate(Math.PI / 2);
    const lab = (txt, r0, r1, size) => { g.font = `900 ${size}px Impact, "Arial Narrow", sans-serif`; g.fillText(txt, 0, -((r0 + r1) / 2) * k); };
    g.font = '900 44px Impact, sans-serif'; g.fillText(String(WEEVAL.points[0]), 0, 0);
    lab(String(WEEVAL.points[1]), rings[0], rings[1], 40); lab(String(WEEVAL.points[2]), rings[1], rings[2], 36); lab(String(WEEVAL.points[3]), rings[2], rings[3], 32);
    g.restore();
  });
}
const signTex = (a, b) => canvasTex(512, 160, (g, w, h) => {
  g.fillStyle = '#1b1230'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb31f'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffb31f'; g.font = '900 72px Impact, "Arial Narrow", sans-serif'; g.fillText(a, w / 2, 62);
  g.fillStyle = '#fff'; g.font = '800 40px Impact, "Arial Narrow", sans-serif'; g.fillText(b || '', w / 2, 120);
});

export class WeevalView {
  /** `group` is the track's mesh group (it is disposed with the track). */
  constructor(track, group) {
    this.track = track; this.group = group; this.L = layoutFor(track.def);
    const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.1, ...o });
    this.mat = { concrete: m(0x9b9a93, { roughness: 0.95 }), dark: m(0x1d1d24), glass: m(0x20303c, { roughness: 0.25, metalness: 0.4 }), tyre: m(0x151515, { roughness: 0.9 }),
      white: m(0xf0efe8), red: m(0xc0281f), yellow: m(0xffc21a), steel: m(0xc9ccd2, { metalness: 0.6, roughness: 0.4 }) };
    this.t = 0; this.flare = 0;
    if (this.L.pieces) { this._busesCustom(); if (this.L.hasTarget) this._bullseye(); this._boxes(); }                  // stunt pieces on an ordinary track: just the pieces
    else if (this.L.custom) { this._abutments(); this._busesCustom(); this._bullseye(); this._boxes(); this._flames(); if (isFinite(this.L.endX)) { this._barrier(); this._finishLine(); } }      // (a stunt track from the editor: its own buses, stacks and target, no barrier or signs)
    else { this._abutments(); this._buses(); this._bullseye(); this._barrier(); this._boxes(); this._flames(); this._signs(); }
  }

  _box(mat, w, h, d, x, y, z, parent = this.group, cast = true) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = cast; b.receiveShadow = true; b.frustumCulled = false; parent.add(b); return b;
  }

  /** Concrete piers holding the high road up: every so often, from the ground to the road's underside. */
  _pylons() {
    const t = this.track, q = Track.newQuery(), W = WEEVAL.width;
    for (let s = 20; s < t.length - 20; s += 46) {
      const f = t.frameAt(s);
      if (f.y < 5) continue;
      if (Math.abs(f.x - this.L.cx) < this.L.gap / 2 + 14) continue;           // (none right at the jump: the abutments are there)
      t.query(f.x, f.y + 0.5, f.z, q, 1);
      const top = f.y - 1.5, h = top - GROUND_Y;
      if (h < 1) continue;
      this._box(this.mat.concrete, W * 0.34, h, 2.2, f.x, GROUND_Y + h / 2, f.z);
    }
  }

  /** Blocks of concrete under both lips of the gap, so the road does not hang in the air. */
  _abutments() {
    const L = this.L, W = WEEVAL.width, cz = L.cz || 0, top = (x) => this.track.query(x, L.lipY + 6, cz, undefined, 6).y - 0.7;
    for (const [x0, x1] of [[L.lipX - 14, L.lipX - 0.4], [L.gapEnd + 0.4, L.gapEnd + 9]]) {
      const y = top((x0 + x1) / 2), h = Math.max(1, y - GROUND_Y);
      this._box(this.mat.concrete, x1 - x0, h, W, (x0 + x1) / 2, GROUND_Y + h / 2, cz);
    }
  }

  /** The row of double-deckers on their platform, side-on to the ramp and all facing the same way (left, looking down the ramp). */
  _buses() {
    const B = WEEVAL.bus, L = this.L, g = new THREE.Group(); this.group.add(g);
    if (!L.busList.length) return;
    const first = L.busList[0], last = L.busList[L.busList.length - 1], deck = L.deckTop, mid = (first.x0 + last.x1) / 2, span = last.x1 - first.x0 + 2;
    this._box(this.mat.concrete, span, deck - GROUND_Y, B.len + 3, mid, GROUND_Y + (deck - GROUND_Y) / 2, 0, g);                 // the platform: a solid block up from the ground
    this._box(this.mat.white, span + 0.4, 0.3, B.len + 3.4, mid, deck + 0.15, 0, g);                                            // its edge
    const w = B.w * 0.94, bodyG = new THREE.BoxGeometry(w, B.h - 0.5, B.len), glassLo = new THREE.BoxGeometry(w + 0.06, 0.85, B.len - 1.6), glassHi = new THREE.BoxGeometry(w + 0.06, 0.85, B.len - 1.6);
    const roofG = new THREE.BoxGeometry(w * 0.86, 0.14, B.len - 0.5), whG = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14); whG.rotateZ(Math.PI / 2);
    const frontG = new THREE.PlaneGeometry(w * 0.9, 0.9), lampG = new THREE.CircleGeometry(0.17, 10), grilleG = new THREE.PlaneGeometry(w * 0.5, 0.5);
    const slots = [];
    for (const b of L.busList) {
      const cx = (b.x0 + b.x1) / 2, mat = new THREE.MeshStandardMaterial({ color: BUS_COLOURS[b.i % BUS_COLOURS.length], roughness: 0.55, metalness: 0.15 }), y0 = deck + 0.5;
      const bg = new THREE.Group(); g.add(bg); slots.push({ bg, cx }); const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = geo.type === 'BoxGeometry'; o.frustumCulled = false; bg.add(o); return o; };
      add(bodyG, mat, cx, y0 + (B.h - 0.5) / 2, 0);
      add(glassLo, this.mat.glass, cx, y0 + 1.3, 0); add(glassHi, this.mat.glass, cx, y0 + 3.0, 0);                          // a row of windows downstairs and another up
      add(roofG, this.mat.white, cx, y0 + B.h - 0.5 + 0.07, 0);
      for (const sx of [-1, 1]) for (const z of [-3.2, 3.2]) add(whG, this.mat.tyre, cx + sx * (w / 2 - 0.05), deck + 0.5, z);
      const zf = -B.len / 2 - 0.02;                                                                                               // the nose faces -z: windscreens, grille and lamps
      add(frontG, this.mat.glass, cx, y0 + 1.5, zf, Math.PI); add(frontG, this.mat.glass, cx, y0 + 3.1, zf, Math.PI);
      add(grilleG, this.mat.dark, cx, y0 + 0.4, zf, Math.PI);
      for (const sx of [-1, 1]) add(lampG, this.mat.yellow, cx + sx * w * 0.36, y0 + 0.4, zf - 0.01, Math.PI);
    }
    this._busModel(slots, deck);
  }

  /** The buses of a stunt track from the editor: each is wherever its prop is (a quarter turn if asked), on a concrete platform if it is raised off the ground. */
  _busesCustom() {
    const B = WEEVAL.bus, L = this.L, slots = [];
    const w = B.w * 0.94, bodyG = new THREE.BoxGeometry(w, B.h - 0.5, B.len), glassG = new THREE.BoxGeometry(w + 0.06, 0.85, B.len - 1.6), roofG = new THREE.BoxGeometry(w * 0.86, 0.14, B.len - 0.5);
    const whG = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14); whG.rotateZ(Math.PI / 2);
    const frontG = new THREE.PlaneGeometry(w * 0.9, 0.9), lampG = new THREE.CircleGeometry(0.17, 10), grilleG = new THREE.PlaneGeometry(w * 0.5, 0.5);
    for (const b of L.busList) {
      const g = new THREE.Group(); g.position.set(b.cx, 0, b.cz); g.rotation.y = (b.rot || 0) * Math.PI / 180; this.group.add(g);
      const deck = b.y, y0 = deck + 0.5;
      if (b.ground < GROUND_Y + 1 && deck - GROUND_Y > 0.5) {
        this._box(this.mat.concrete, B.w + 2, deck - GROUND_Y, B.len + 2, 0, GROUND_Y + (deck - GROUND_Y) / 2, 0, g);
        this._box(this.mat.white, B.w + 2.4, 0.3, B.len + 2.4, 0, deck + 0.15, 0, g);
      }
      const mat = new THREE.MeshStandardMaterial({ color: BUS_COLOURS[b.i % BUS_COLOURS.length], roughness: 0.55, metalness: 0.15 });
      const bg = new THREE.Group(); g.add(bg); slots.push({ bg, cx: 0, deck });
      const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = geo.type === 'BoxGeometry'; o.frustumCulled = false; bg.add(o); };
      add(bodyG, mat, 0, y0 + (B.h - 0.5) / 2, 0); add(glassG, this.mat.glass, 0, y0 + 1.3, 0); add(glassG, this.mat.glass, 0, y0 + 3.0, 0); add(roofG, this.mat.white, 0, y0 + B.h - 0.5 + 0.07, 0);
      for (const sx of [-1, 1]) for (const z of [-3.2, 3.2]) add(whG, this.mat.tyre, sx * (w / 2 - 0.05), deck + 0.5, z);
      const zf = -B.len / 2 - 0.02;
      add(frontG, this.mat.glass, 0, y0 + 1.5, zf, Math.PI); add(frontG, this.mat.glass, 0, y0 + 3.1, zf, Math.PI); add(grilleG, this.mat.dark, 0, y0 + 0.4, zf, Math.PI);
      for (const sx of [-1, 1]) add(lampG, this.mat.yellow, sx * w * 0.36, y0 + 0.4, zf - 0.01, Math.PI);
    }
    if (slots.length) this._busModel(slots, 0);
  }

  /** Swap the plain boxes for the real Rootmaster from the main game once its model has loaded (the boxes stay if it cannot be loaded). */
  async _busModel(slots, deck) {
    try {
      const gltf = await loadGltf(new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), assetUrl('cars/bus-SHRINK.glb'));
      const model = gltf.scene, box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
      const alongX = size.x > size.z, k = WEEVAL.bus.len / (alongX ? size.x : size.z);
      model.traverse((o) => { if (o.isMesh) { if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals(); o.castShadow = true; o.frustumCulled = false; } });
      slots.forEach((slot, i) => {
        const { bg, cx } = slot;
        const m = i === 0 ? model : model.clone(true);
        const holder = new THREE.Group(); m.position.set(-mid.x, -box.min.y, -mid.z); holder.add(m); holder.scale.setScalar(k);
        holder.rotation.y = alongX ? (WEEVAL.bus.flip ? -Math.PI / 2 : Math.PI / 2) : (WEEVAL.bus.flip ? 0 : Math.PI);          // (the nose points the way -z, to the left looking down the ramp)
        holder.position.set(cx, slot.deck ?? deck, 0);
        bg.clear(); bg.add(holder);
      });
    } catch (e) { console.warn('Could not load the bus model; plain boxes will do.', e); }
  }

  /** The painted target, draped over the landing ramp so it follows the slope. */
  _bullseye() {
    const L = this.L, R = WEEVAL.rings[WEEVAL.rings.length - 1], n = 24, pos = [], uv = [], idx = [], q = Track.newQuery();
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = L.zoneX + (i / n - 0.5) * R * 2, z = L.zoneZ + (j / n - 0.5) * R * 2;
      this.track.query(x, L.lipY + 4, z, q, 6);
      pos.push(x, (q.idx >= 0 ? q.y : GROUND_Y) + 0.07, z); uv.push(i / n, 1 - j / n);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const tex = bullseyeTex(), mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    mesh.frustumCulled = false; mesh.renderOrder = 3; this.group.add(mesh); this.bullseye = mesh;
  }

  /** Jets of flame on poles down both sides of the gap: a flicker most of the time, a great roar of fire while you are in the air. */
  _flames() {
    const L = this.L, W = WEEVAL.width, n = Math.max(2, Math.round(L.gap / 18) + 1), poleG = new THREE.BoxGeometry(0.45, 1, 0.45), burnG = new THREE.CylinderGeometry(0.7, 0.55, 0.5, 12);
    this.jets = [];
    for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
      const x = L.lipX + L.gap * (i / (n - 1)), z = (L.cz || 0) + side * (W / 2 + 4), h = L.lipY - GROUND_Y;
      const pole = new THREE.Mesh(poleG, this.mat.steel); pole.scale.y = h; pole.position.set(x, GROUND_Y + h / 2, z); pole.frustumCulled = false; this.group.add(pole);
      const burner = new THREE.Mesh(burnG, this.mat.dark); burner.position.set(x, L.lipY + 0.25, z); burner.frustumCulled = false; this.group.add(burner);
      const flame = new THREE.Group(); flame.position.set(x, L.lipY + 0.4, z);
      const layers = [[1.0, 0xff4a0a, 0.85], [0.68, 0xff9d1a, 0.9], [0.38, 0xffe27a, 0.95]].map(([k, c, o]) => {
        const m = new THREE.Mesh(new THREE.ConeGeometry(1.05 * k, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        m.position.y = 0.5; m.frustumCulled = false; flame.add(m); return m;
      });
      this.group.add(flame); this.jets.push({ layers, ph: i * 1.7 + side });
    }
  }

  /** The ground under a box's stack: the landing ramp slopes, so the floor is a plane along it. */
  _floor(x, b) { const k = b.stk; return Math.max(this.L.low, k.gy0 + k.gsl * (x - k.x)); }
  _boxHome(b, d, c, k) {
    const { S } = BOXES, st = b.stk;
    const lx = (d - (st.depth - 1) / 2) * S, lz = (c - (st.cols - 1) / 2) * S, th = st.rot || 0, cs = Math.cos(th), sn = Math.sin(th);      // (a turned stack: the whole stack swings round its middle)
    b.x = st.x + lx * cs + lz * sn; b.z = st.z - lx * sn + lz * cs; b.y = this._floor(b.x, b) + b.sz / 2 + k * S;
    b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = b.rx = b.rz = 0; b.ry = th + ((d * 3 + c) % 7) * 0.02; b.awake = false; b.hit = false; b.crush = 1;
  }
  /** Big stacks of cardboard boxes, tallest at the back: the official one down the landing ramp, or each 'boxes' prop of a stunt track. Drive into them and the boxes fly, tumble, knock each other about and crumple. */
  _boxes() {
    const L = this.L, W = WEEVAL.width, { S, depth, top } = BOXES, t = this.track, q = Track.newQuery();
    const spots = L.custom ? L.stacks.map((s) => ({ x: s.x, z: s.z, rot: (s.rot || 0) * Math.PI / 180, cols: 5, depth: 4 })) : [{ x: L.stackX, z: 0, cols: Math.floor((W - 1) / S), depth }];
    this.stacks = spots.map((sp) => {
      const at = (x) => { t.query(x, L.lipY, sp.z, q, 60); return q.idx >= 0 ? q.y : GROUND_Y; };
      return { ...sp, gy0: at(sp.x), gsl: (at(sp.x + 6) - at(sp.x - 6)) / 12 };
    });
    this.boxes = [];
    this.stacks.forEach((st, si) => {
      for (let d = 0; d < st.depth; d++) for (let c = 0; c < st.cols; c++) for (let k = 0; k < Math.min(top, d + 1); k++) {
        const sz = S * (0.88 + ((d * 7 + c * 13 + k * 5) % 10) * 0.012), b = { sz, stk: st, d, c, k, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, awake: false, hit: false, crush: 1, col: si * 1000 + d * st.cols + c, layer: k };
        this._boxHome(b, d, c, k); this.boxes.push(b);
      }
    });
    if (!this.boxes.length) { this.boxes = null; return; }
    const tex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#b98a54'; g.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${90 + (i * 7) % 40},${60 + (i * 5) % 30},30,0.12)`; g.fillRect((i * 37) % w, (i * 53) % h, 18, 2); }
      g.fillStyle = '#d9c28f'; g.fillRect(0, h / 2 - 7, w, 14); g.strokeStyle = '#7a5a30'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
    });
    this.boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), this.boxes.length);
    this.boxMesh.frustumCulled = false; this.boxMesh.castShadow = true; this.boxMesh.receiveShadow = true; this.group.add(this.boxMesh);
    this._boxDummy = new THREE.Object3D(); this._boxDummy.rotation.order = 'YXZ'; this._boxAll = true; this._syncBoxes();
  }
  _syncBoxes() {
    const D = this._boxDummy;
    this.boxes.forEach((b, i) => { if (!this._boxAll && !b.awake) return; D.position.set(b.x, b.y, b.z); D.rotation.set(b.rx, b.ry, b.rz); D.scale.set(b.sz, b.sz * b.crush, b.sz); D.updateMatrix(); this.boxMesh.setMatrixAt(i, D.matrix); });
    this.boxMesh.instanceMatrix.needsUpdate = true; this._boxAll = false;
  }
  /** Put the stack back as it was (a new try). */
  reset() {
    if (!this.boxes) return;
    for (const b of this.boxes) this._boxHome(b, b.d, b.c, b.k);
    this._boxAll = true; this._syncBoxes();
  }
  _stepBoxes(dt, car) {
    let hits = 0, moved = false;
    const B = this.boxes;
    if (car && this.stacks.some((st) => Math.hypot(car.pos.x - st.x, car.pos.z - st.z) < 40)) {                        // the car ploughs in: whatever it touches is thrown up and out, hard
      const ax = car.ax, ay = car.ay, az = car.az;
      for (const b of B) {
        const dx = b.x - car.pos.x, dy = b.y - car.pos.y, dz = b.z - car.pos.z;
        if (dx * dx + dz * dz > 30) continue;
        const lx = dx * ax.x + dy * ax.y + dz * ax.z, ly = dx * ay.x + dy * ay.y + dz * ay.z, lz = dx * az.x + dy * az.y + dz * az.z, h = b.sz / 2;
        if (Math.abs(lx) < 0.95 + h && Math.abs(lz) < 2.3 + h && ly > -0.5 - h && ly < 0.9 + h) {
          if (!b.hit) { b.hit = true; hits++; }
          const sp = Math.max(6, car.speed), side = Math.sign(lx) || (Math.random() - 0.5), r = Math.random();                  // a real cardboard box has some weight: it is shoved along, not fired off
          b.vx = car.vel.x * (0.5 + r * 0.2) + ax.x * side * (1 + r * 2); b.vz = car.vel.z * (0.5 + r * 0.2) + ax.z * side * (1 + r * 2);
          b.vy = 1.5 + r * 2 + sp * (0.07 + 0.07 * Math.random()) + Math.max(0, ly) * 1.5;
          b.wx = (Math.random() - 0.5) * 8; b.wz = (Math.random() - 0.5) * 8; b.wy = (Math.random() - 0.5) * 5; b.awake = true; b.crush = Math.max(0.5, b.crush * 0.85);
          for (const o of B) if (!o.awake && o.col === b.col && o.layer > b.layer) o.awake = true;          // whatever was stacked on it comes down
        }
      }
    }
    const awake = B.filter((b) => b.awake);
    for (const b of awake) {                                                       // boxes bang into each other: a moving box shoves whatever it touches
      for (const o of B) {
        if (o === b) continue;
        const dx = o.x - b.x, dy = o.y - b.y, dz = o.z - b.z, r = (b.sz + o.sz) * 0.5 * 0.92;
        if (dx > r || dx < -r || dz > r || dz < -r || dy > r || dy < -r) continue;
        const d2 = dx * dx + dy * dy + dz * dz; if (d2 >= r * r || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, nz = dz / d, rv = (b.vx - o.vx) * nx + (b.vy - o.vy) * ny + (b.vz - o.vz) * nz;
        if (rv <= 0 && o.awake) continue;
        const j = Math.max(rv, 0.5) * 0.55;
        b.vx -= nx * j; b.vy -= ny * j * 0.5; b.vz -= nz * j; o.vx += nx * j * 1.1; o.vy += Math.abs(ny * j) * 0.5 + 0.3; o.vz += nz * j * 1.1;
        o.wx += (Math.random() - 0.5) * 6; o.wz += (Math.random() - 0.5) * 6; o.awake = true; o.crush = Math.max(0.6, o.crush * 0.93);
        const push = (r - d) * 0.5; o.x += nx * push; o.y += ny * push * 0.3; o.z += nz * push; b.x -= nx * push; b.z -= nz * push;
        if (!o.hit) { o.hit = true; hits += 0.25; }
      }
    }
    const Q = Math.PI / 2, E = this._boxEuler || (this._boxEuler = new THREE.Euler(0, 0, 0, 'YXZ')), M = this._boxMat || (this._boxMat = new THREE.Matrix4());
    for (const b of B) {
      if (!b.awake) continue;
      moved = true;
      b.vy -= 9.81 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
      // how far the lowest corner sits below the centre at the angle it is now (a tilted box is taller than a flat one, so it never sinks into the road)
      const e = M.makeRotationFromEuler(E.set(b.rx, b.ry, b.rz)).elements, hx = b.sz / 2, hy = b.sz * b.crush / 2;
      const drop = Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hx;
      const floor = this._floor(b.x, b) + drop;
      let down = false;
      if (b.y <= floor) {
        down = true; const vin = -b.vy; b.y = floor;
        if (vin > 1.2) {                                                                  // it bounces, like a tyre: lively at first, then smaller and smaller, and a knock on a corner sets it tumbling
          b.vy = vin * 0.42; const k = Math.min(1, vin / 8);
          b.wx += (Math.random() - 0.5) * 7 * k; b.wz += (Math.random() - 0.5) * 7 * k; b.wy += (Math.random() - 0.5) * 3 * k;
          const sk = Math.exp(-dt * 6); b.vx *= sk; b.vz *= sk;                            // (a bounce costs it some of its slide)
        } else b.vy = 0;
        const fr = Math.exp(-dt * (b.vy > 0.3 ? 0.8 : 2.4)); b.vx *= fr; b.vz *= fr;       // on the ground it slides and scuffs to a stop; in a bounce it carries on
        const sp = Math.exp(-dt * 2.2); b.wx *= sp; b.wy *= sp; b.wz *= sp;
      }
      if (down && b.vy <= 0.3) {                                                           // settling: ease over onto the nearest flat face, however it landed, as the spin dies
        const slow = Math.hypot(b.wx, b.wz) < 4, k = 1 - Math.exp(-dt * (slow ? 9 : 2));
        b.rx += (Math.round(b.rx / Q) * Q - b.rx) * k; b.rz += (Math.round(b.rz / Q) * Q - b.rz) * k;
      }
      const flat = Math.abs(b.rx - Math.round(b.rx / Q) * Q) < 0.03 && Math.abs(b.rz - Math.round(b.rz / Q) * Q) < 0.03;
      if (down && flat && b.y <= floor + 0.01 && Math.abs(b.vx) + Math.abs(b.vz) < 0.45 && Math.hypot(b.wx, b.wy, b.wz) < 0.8) { b.vx = b.vz = 0; b.wx = b.wy = b.wz = 0; b.rx = Math.round(b.rx / Q) * Q; b.rz = Math.round(b.rz / Q) * Q; b.awake = false; }
    }
    if (moved || hits) this._syncBoxes();
    return hits;
  }

  /** Per frame: the flames flare while you are airborne, and the boxes fly. Returns how many boxes the car newly hit (the game slows the car for each). */
  update(dt, w, car) {
    this.t += dt;
    const on = w && (w.state === 'air' || (w.state === 'landed' && w.sinceLand < 1.5));
    this.flare += ((on ? 1 : 0) - this.flare) * Math.min(1, dt * (on ? 8 : 1.4));
    for (const j of this.jets || []) {
      const h = 1.1 + 0.35 * Math.sin(this.t * 14 + j.ph) + this.flare * (8 + 2.5 * Math.sin(this.t * 19 + j.ph * 2));
      j.layers.forEach((m, i) => { m.scale.y = Math.max(0.2, h * (1 - i * 0.18)); m.scale.x = m.scale.z = (1 + this.flare * 0.5) * (0.9 + 0.1 * Math.sin(this.t * 25 + i * 2 + j.ph)); m.position.y = m.scale.y / 2; });
    }
    return this.boxes ? this._stepBoxes(Math.min(dt, 0.05), car) : 0;
  }

  /** The concrete barrier at the end of the run-out (the cardboard stack in front of it is drawn by _boxes, and the skull barrels in front of that are real props, see weeval.js). */
  _barrier() {
    const L = this.L, W = WEEVAL.width, ez = L.endZ || 0, y = this.track.query(L.endX - 6, L.lipY, ez, undefined, 12).y;
    const stripe = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#ffc21a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1b1b'; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 40, h); g.lineTo(i * 40 + 20, h); g.lineTo(i * 40 + 20 + h, 0); g.lineTo(i * 40 + h, 0); g.fill(); } });
    this._box(this.mat.concrete, 4, 3.6, W + 8, L.endX - 2, y + 1.8, ez);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, 1.4), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.7 })); face.rotation.y = -Math.PI / 2; face.position.set(L.endX - 4.05, y + 2.6, ez); face.frustumCulled = false; this.group.add(face);
  }

  /** A chequered finish line across the road, a little way before the barrier (a one-road stunt track). */
  _finishLine() {
    const L = this.L, W = WEEVAL.width, ez = L.endZ || 0, x = L.endX - 18, y = this.track.query(x, L.lipY, ez, undefined, 12).y + 0.06;
    const tex = canvasTex(256, 64, (g, w, h) => { const c = 16; for (let i = 0; i < w / c; i++) for (let j = 0; j < h / c; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f1e8'; g.fillRect(i * c, j * c, c, c); } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, W), new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, ez); m.frustumCulled = false; this.group.add(m);
  }

  _sign(text, sub, x, z, y, face = 1) {
    const tex = signTex(text, sub), s = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.9), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    s.position.set(x, y + 4.0, z); s.rotation.y = face > 0 ? -Math.PI / 2 : Math.PI / 2; s.frustumCulled = false; this.group.add(s);
    for (const dz of [-2.6, 2.6]) this._box(this.mat.steel, 0.2, 4.4, 0.2, x - 0.1 * face, y + 2.2, z + dz);
  }
  /** The big sign on a gantry above the skull barrels: WARNING, HIGH EXPLOSIVES!, framed with yellow and black chevrons. */
  _warning() {
    const L = this.L, W = WEEVAL.width, y = this.track.query(L.boomX, L.lipY, 0, undefined, 12).y, bw = W + 4, bh = 5, cy = y + 9;
    const tex = canvasTex(1024, 288, (g, w, h) => {
      g.fillStyle = '#16161a'; g.fillRect(0, 0, w, h);
      const band = 44; g.fillStyle = '#ffc21a';
      for (const y0 of [0, h - band]) for (let x = -band; x < w + band; x += band * 1.5) { g.beginPath(); g.moveTo(x, y0 + band); g.lineTo(x + band * 0.75, y0); g.lineTo(x + band * 1.5, y0 + band); g.lineTo(x + band * 1.05, y0 + band); g.lineTo(x + band * 0.75, y0 + band * 0.4); g.lineTo(x + band * 0.45, y0 + band); g.closePath(); g.fill(); }
      for (const side of [0, 1]) for (let k = 0; k < 2; k++) { const cx = side ? w - 44 - k * 34 : 44 + k * 34, dir = side ? -1 : 1; g.beginPath(); g.moveTo(cx - 14 * dir, band + 14); g.lineTo(cx + 14 * dir, h / 2); g.lineTo(cx - 14 * dir, h - band - 14); g.lineWidth = 12; g.strokeStyle = '#ffc21a'; g.stroke(); }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffc21a'; g.font = '900 84px Impact, "Arial Narrow", sans-serif'; g.fillText('WARNING', w / 2, 100);
      g.fillStyle = '#fff'; g.font = '900 96px Impact, "Arial Narrow", sans-serif'; g.fillText('HIGH EXPLOSIVES!', w / 2, 190);
    });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    s.position.set(L.boomX - 0.6, cy, 0); s.rotation.y = -Math.PI / 2; s.frustumCulled = false; this.group.add(s);
    for (const z of [-bw / 2 + 0.4, bw / 2 - 0.4]) this._box(this.mat.steel, 0.4, cy - y + bh / 2, 0.4, L.boomX - 0.6, y + (cy - y + bh / 2) / 2, z);
  }
  _signs() {
    const L = this.L, t = this.track, W = WEEVAL.width, yAt = (x) => t.query(x, 70, 0, undefined, 12).y;
    this._sign('WEEVAL KNIEVEL', 'THE GREAT BUS JUMP', 4, -W / 2 - 9, L.top, 1);
    this._sign(`STAGE ${L.stage}`, `${L.buses} BUSES`, L.lipX - 40, W / 2 + 9, yAt(L.lipX - 40), 1);
    this._sign('LAND HERE', 'CLOSER TO THE MIDDLE = MORE POINTS', L.gapEnd + 4, -W / 2 - 9, yAt(L.gapEnd + 4), 1);
    this._warning();
  }
}
