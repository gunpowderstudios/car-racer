// What Weeval Keneval looks like: the row of parked buses, the painted bullseye on the landing ramp, the barrier at the end of the run-out,
// the concrete under the jump, pylons holding the long ramp up and the signs. The solid parts (buses, barrier) are the boxes weeval.js puts in the
// track's `blocks`, so what you see is what you hit.
import * as THREE from 'three';
import { Track, GROUND_Y } from './track.js';
import { WEEVAL, stageLayout } from './weeval.js';

const BUS_COLOURS = [0xc0281f, 0xf2b400, 0xe8e6df, 0x2d6cdf, 0x2f9a56, 0xc0281f];

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
    this.track = track; this.group = group; this.L = stageLayout(track.def.weeval.stage);
    const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.1, ...o });
    this.mat = { concrete: m(0x9b9a93, { roughness: 0.95 }), dark: m(0x1d1d24), glass: m(0x20303c, { roughness: 0.25, metalness: 0.4 }), tyre: m(0x151515, { roughness: 0.9 }),
      white: m(0xf0efe8), red: m(0xc0281f), yellow: m(0xffc21a), steel: m(0xc9ccd2, { metalness: 0.6, roughness: 0.4 }) };
    this._pylons(); this._abutments(); this._buses(); this._bullseye(); this._barrier(); this._signs();
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
    const L = this.L, W = WEEVAL.width, top = (x) => this.track.query(x, WEEVAL.lipY + 6, 0, undefined, 6).y - 0.7;
    for (const [x0, x1] of [[L.lipX - 14, L.lipX - 0.4], [L.gapEnd + 0.4, L.gapEnd + 9]]) {
      const y = top((x0 + x1) / 2), h = Math.max(1, y - GROUND_Y);
      this._box(this.mat.concrete, x1 - x0, h, W, (x0 + x1) / 2, GROUND_Y + h / 2, 0);
    }
  }

  _buses() {
    const B = WEEVAL.bus, g = new THREE.Group(); this.group.add(g);
    const bodyG = new THREE.BoxGeometry(B.w * 0.94, 2.35, B.len), winG = new THREE.BoxGeometry(B.w * 0.94 + 0.06, 0.8, B.len - 1.4), roofG = new THREE.BoxGeometry(B.w * 0.8, 0.14, B.len - 0.6);
    const whG = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14); whG.rotateZ(Math.PI / 2);
    for (const b of this.L.busList) {
      const cx = (b.x0 + b.x1) / 2, mat = new THREE.MeshStandardMaterial({ color: BUS_COLOURS[b.i % BUS_COLOURS.length], roughness: 0.55, metalness: 0.15 });
      const body = new THREE.Mesh(bodyG, mat); body.position.set(cx, GROUND_Y + 0.5 + 1.175, 0); body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false; g.add(body);
      const win = new THREE.Mesh(winG, this.mat.glass); win.position.set(cx, GROUND_Y + 2.2, 0); win.frustumCulled = false; g.add(win);
      const roof = new THREE.Mesh(roofG, this.mat.white); roof.position.set(cx, GROUND_Y + 3.2, 0); roof.frustumCulled = false; g.add(roof);
      for (const sx of [-1, 1]) for (const z of [-3.4, 3.4]) { const w = new THREE.Mesh(whG, this.mat.tyre); w.position.set(cx + sx * (B.w * 0.47), GROUND_Y + 0.5, z); w.frustumCulled = false; g.add(w); }
    }
  }

  /** The painted target, draped over the landing ramp so it follows the slope. */
  _bullseye() {
    const L = this.L, R = WEEVAL.rings[WEEVAL.rings.length - 1], n = 24, pos = [], uv = [], idx = [], q = Track.newQuery();
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = L.zoneX + (i / n - 0.5) * R * 2, z = L.zoneZ + (j / n - 0.5) * R * 2;
      this.track.query(x, WEEVAL.lipY + 4, z, q, 6);
      pos.push(x, (q.idx >= 0 ? q.y : GROUND_Y) + 0.07, z); uv.push(i / n, 1 - j / n);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const tex = bullseyeTex(), mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    mesh.frustumCulled = false; mesh.renderOrder = 3; this.group.add(mesh); this.bullseye = mesh;
  }

  /** The concrete barrier and tyre stacks at the end of the run-out. */
  _barrier() {
    const L = this.L, W = WEEVAL.width, y = this.track.query(L.endX - 6, WEEVAL.lipY, 0, undefined, 12).y;
    const stripe = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#ffc21a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1b1b'; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 40, h); g.lineTo(i * 40 + 20, h); g.lineTo(i * 40 + 20 + h, 0); g.lineTo(i * 40 + h, 0); g.fill(); } });
    this._box(this.mat.concrete, 4, 3.6, W + 8, L.endX - 2, y + 1.8, 0);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, 1.4), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.7 })); face.rotation.y = -Math.PI / 2; face.position.set(L.endX - 4.05, y + 2.6, 0); face.frustumCulled = false; this.group.add(face);
    const tyreG = new THREE.CylinderGeometry(0.55, 0.55, 0.42, 12);
    for (const z of [-W / 2 + 1.5, -W / 4, 0, W / 4, W / 2 - 1.5]) for (let k = 0; k < 3; k++) { const tyre = new THREE.Mesh(tyreG, this.mat.tyre); tyre.position.set(L.endX - 5.4, y + 0.25 + k * 0.45, z); tyre.frustumCulled = false; this.group.add(tyre); }
  }

  _sign(text, sub, x, z, y, face = 1) {
    const tex = signTex(text, sub), s = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.9), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    s.position.set(x, y + 4.0, z); s.rotation.y = face > 0 ? -Math.PI / 2 : Math.PI / 2; s.frustumCulled = false; this.group.add(s);
    for (const dz of [-2.6, 2.6]) this._box(this.mat.steel, 0.2, 4.4, 0.2, x - 0.1 * face, y + 2.2, z + dz);
  }
  _signs() {
    const L = this.L, t = this.track, W = WEEVAL.width, yAt = (x) => t.query(x, 70, 0, undefined, 12).y;
    this._sign('WEEVAL KENEVAL', 'THE GREAT BUS JUMP', 4, -W / 2 - 9, WEEVAL.top, 1);
    this._sign(`STAGE ${L.stage}`, `${L.buses} BUSES`, L.lipX - 40, W / 2 + 9, yAt(L.lipX - 40), 1);
    this._sign('LAND HERE', 'CLOSER TO THE MIDDLE = MORE POINTS', L.gapEnd + 4, -W / 2 - 9, yAt(L.gapEnd + 4), 1);
  }
}
