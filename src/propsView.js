// Draws the barrels and scrap metal that props.js simulates.
import * as THREE from 'three';
import { BARREL, barrelNeedsDraw } from './props.js';

const PAINT = [new THREE.Color(0xb8351f), new THREE.Color(0xb8351f)];
const PEPPER = [new THREE.Color(0x3f9e2f), new THREE.Color(0x3f9e2f)];      // the Deep Pan Pizza's drums are painted green, like peppers
const HOT = new THREE.Color(3, 2.1, 1.4);
const WHITE = new THREE.Color(1, 1, 1);

function drumGeometry() {
  const r = BARREL.radius, h = BARREL.height / 2, k = BARREL.height / 0.9;
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

/** The black lethal drum: the same shape, matt black with a yellow skull and crossbones (three of them round the drum - a canvas texture mapped by angle and height). */
function hazardMaterial() {
  let map = null;
  try {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'); g.fillStyle = '#0c0c0e'; g.fillRect(0, 0, N, N);
    const Y = '#f2c200', cx = N / 2, cy = N * 0.5;
    g.strokeStyle = Y; g.fillStyle = Y; g.lineCap = 'round';
    g.lineWidth = N * 0.07;                                                           // the crossbones, behind the skull
    for (const sgn of [-1, 1]) {
      g.beginPath(); g.moveTo(cx - sgn * N * 0.3, cy - N * 0.26); g.lineTo(cx + sgn * N * 0.3, cy + N * 0.3); g.stroke();
      for (const e of [[cx - sgn * N * 0.3, cy - N * 0.26], [cx + sgn * N * 0.3, cy + N * 0.3]]) for (const d of [-1, 1]) { g.beginPath(); g.arc(e[0] + d * N * 0.035, e[1] + (e[1] < cy ? -1 : 1) * N * 0.03, N * 0.045, 0, 7); g.fill(); }
    }
    g.beginPath(); g.arc(cx, cy - N * 0.07, N * 0.2, 0, 7); g.fill();                  // cranium
    g.fillRect(cx - N * 0.12, cy + N * 0.05, N * 0.24, N * 0.15);                      // jaw
    g.fillStyle = '#0c0c0e';
    for (const sgn of [-1, 1]) { g.beginPath(); g.arc(cx + sgn * N * 0.08, cy - N * 0.06, N * 0.05, 0, 7); g.fill(); }   // eye sockets
    g.beginPath(); g.moveTo(cx, cy + N * 0.0); g.lineTo(cx - N * 0.025, cy + N * 0.05); g.lineTo(cx + N * 0.025, cy + N * 0.05); g.fill();   // nose
    g.lineWidth = N * 0.012; g.strokeStyle = '#0c0c0e';
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(cx + k * N * 0.04, cy + N * 0.12); g.lineTo(cx + k * N * 0.04, cy + N * 0.2); g.stroke(); }   // teeth
    map = new THREE.CanvasTexture(c); map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.ClampToEdgeWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  } catch { /* no canvas (a test): plain black */ }
  return new THREE.MeshStandardMaterial({ vertexColors: true, map, color: map ? 0xffffff : 0x111111, roughness: 0.5, metalness: 0.3 });
}
function lethalGeometry(base) {
  const g = base.clone(), pos = g.attributes.position, uv = new Float32Array(pos.count * 2), h = BARREL.height / 2;
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI * 2) * 3 + 0.5; uv[i * 2 + 1] = (pos.getY(i) + h) / BARREL.height; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

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

export class PropsView {
  constructor(scene) {
    this.scene = scene;
    this.drums = null; this.lethal = null; this.lethalMat = null; this.lethalGeo = null; this._slot = []; this.bits = null; this._paint = PAINT;
    this.drumGeo = drumGeometry();
    this.drumMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
    this.bitGeo = new THREE.BoxGeometry(1, 1, 1);
    this.bitMat = new THREE.MeshStandardMaterial({ color: 0x3b3a40, roughness: 0.6, metalness: 0.6 });
    this._lastPropsTime = 0; this._size = 1;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);

    this._e = new THREE.Euler();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  build(props, peppers = false) {
    this._paint = peppers ? PEPPER : PAINT;
    this._size = props.size || 1;
    this._s.set(this._size, this._size, this._size);
    if (this.drums) { this.scene.remove(this.drums); this.drums.dispose(); this.drums = null; }
    this._lastPropsTime = props.time;
    if (this.lethal) { this.scene.remove(this.lethal); this.lethal.dispose(); this.lethal = null; }
    this._slot = props.barrels.map(() => null);
    const plain = [], deadly = [];
    props.barrels.forEach((b, i) => (b.lethal ? deadly : plain).push(i));
    const make = (list, geo, mat, colour) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((bi, k) => { this._slot[bi] = { im, k }; im.setColorAt(k, colour(props.barrels[bi])); });
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      this.scene.add(im); return im;
    };
    this.drums = make(plain, this.drumGeo, this.drumMat, (b) => this._paint[b.paint]);
    if (deadly.length) { if (!this.lethalMat) { this.lethalGeo = lethalGeometry(this.drumGeo); this.lethalMat = hazardMaterial(); } this.lethal = make(deadly, this.lethalGeo, this.lethalMat, () => WHITE); }
    if (!this.bits) {
      const bm = this.bits = new THREE.InstancedMesh(this.bitGeo, this.bitMat, props.bits.length);
      bm.castShadow = true; bm.frustumCulled = false; bm.count = 0; this.scene.add(bm);
    }
    this.update(props, true);
  }

  update(props, force = false) {
    this._lastPropsTime = props.time;
    if (this.drums || this.lethal) {
      let dirty = force;
      const dirtyIm = new Set(), paintIm = new Set();
      props.barrels.forEach((b, i) => {
        const sl = this._slot[i]; if (!sl) return;
        const { im, k } = sl;
        const want = b.alive && b.fuse >= 0 && Math.floor(b.fuse * 12) % 2 === 0 ? 1 : 0;
        if (b._col !== want) { im.setColorAt(k, want ? HOT : b.lethal ? WHITE : this._paint[b.paint]); b._col = want; paintIm.add(im); }
        const settled = (!b.alive || b.asleep) && b.fuse < 0;
        if (!barrelNeedsDraw(b, force)) return;
        if (b.alive) { this._p.set(b.pos.x, b.pos.y, b.pos.z); this._q.set(b.q.x, b.q.y, b.q.z, b.q.w); this._m.compose(this._p, this._q, this._s); im.setMatrixAt(k, this._m); }
        else im.setMatrixAt(k, this._zero);
        b._drawn = settled; b._shown = b.alive; dirtyIm.add(im); dirty = true;
      });
      if (dirty) for (const im of [this.drums, this.lethal]) if (im && (force || dirtyIm.has(im))) im.instanceMatrix.needsUpdate = true;
      for (const im of paintIm) if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    const bm = this.bits;
    if (bm) {
      let n = 0;
      for (const p of props.bits) {
        if (p.life <= 0) continue;
        const k = Math.min(1, p.life);
        this._p.set(p.pos.x, p.pos.y, p.pos.z); this._q.set(p.q.x, p.q.y, p.q.z, p.q.w); this._s.set(p.sx * k, p.sy * k, p.sz * k);
        this._m.compose(this._p, this._q, this._s); bm.setMatrixAt(n++, this._m);
      }
      this._s.set(this._size || 1, this._size || 1, this._size || 1);
      bm.count = n; bm.instanceMatrix.needsUpdate = true;
    }
  }
}
