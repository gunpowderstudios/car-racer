// What Apple Crumple looks like: gantries, hammers, boulders, spinning arms, presses, signs and checkpoint gates.
// Everything moves from the same clock the collisions use (assault.js), so what you see is what hits you.
import * as THREE from 'three';
import { Track } from './track.js';
import { COURSE, hammerHead, boulderAt, armAngle, pressAt, fireAt } from './assault.js';

const RED = 0xc0281f, GREEN = 0x5aa02c, YELLOW = 0xffc21a, STEEL = 0xc9ccd2, CONCRETE = 0x9b9a93, DARK = 0x23222a;

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
const stripeTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#ffc21a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1b1b';
  for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + h, h); g.lineTo(i * 32 + h, h); g.fill(); }
}, true);
const signTex = (text, sub) => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#ffc21a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1b1b1b'; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 120px Impact, "Arial Black", sans-serif'; g.fillText('!', w / 2, 70);
  g.font = '900 ' + (text.length > 9 ? 40 : 52) + 'px Impact, "Arial Narrow", sans-serif'; g.fillText(text, w / 2, 150);
  g.font = '800 30px Impact, "Arial Narrow", sans-serif'; g.fillText(sub || '', w / 2, 205);
});
const gateTex = (text) => canvasTex(512, 96, (g, w, h) => {
  g.fillStyle = '#241a48'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffb31f'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
  g.font = '900 64px Impact, "Arial Narrow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 3);
});

const SIGNS = {
  hammer: ['HAMMERS', 'TIME YOUR RUN'], boulder: ['ROLLING ROCKS', 'WATCH THE SIDES'], arm: ['SPINNER', 'FIND THE GAP'],
  press: ['CRUSHER', 'GREEN = GO'], barrels: ['BARRELS', 'EXPLOSIVE'], fire: ['FIRE PITS', 'KEEP CLEAR'], jump: ['BIG JUMP', 'KEEP YOUR SPEED UP'], gauntlet: ['GAUNTLET', 'EVERYTHING AT ONCE'], hoop: ['FLAMING HOOP', 'JUMP THROUGH IT'],
};

export class AssaultView {
  /** `group` is the track's mesh group (it is disposed with the track). */
  constructor(track, group) {
    this.track = track; this.def = track.def.assault; this.group = group;
    this.fw = null; this.hoopG = null; this.flames = []; this.fires = []; this.hammers = []; this.arms = []; this.boulders = []; this.presses = []; this.gates = [];
    const m = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15, ...o });
    this.mat = { steel: m(STEEL, { metalness: 0.6, roughness: 0.4 }), red: m(RED), green: m(GREEN), dark: m(DARK), concrete: m(CONCRETE, { roughness: 0.9 }), yellow: m(YELLOW) };
    const st = stripeTex(); this.mat.stripe = new THREE.MeshStandardMaterial({ map: st, roughness: 0.7 });
    this.stripeTex = st;
    const d = this.def;
    for (const h of d.hammers) this._hammer(h);
    for (const a of d.arms) this._arm(a);
    for (const b of d.boulders) this._boulder(b);
    for (const p of d.presses) this._press(p);
    for (const p of d.fires || []) this._fire(p);
    d.checkpoints.forEach((s, i) => this._gate(s, i + 1));
    this._signs();
    this._finish();
    if (d.hoop) this._hoop(d.hoop);
  }

  /** A group standing on the road at distance s, facing along it. `sx` turns a lateral offset into the group's own x. */
  _at(s) {
    const f = this.track.frameAt(s), g = new THREE.Group();
    g.position.set(f.x, f.y, f.z); g.rotation.y = Math.atan2(f.fx, f.fz);
    g.userData.sx = Math.sign(f.lx * f.fz - f.lz * f.fx) || 1; g.userData.hw = f.hw; g.userData.f = f;
    this.group.add(g); return g;
  }
  _box(g, mat, w, h, d, x, y, z, cast = true) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = cast; b.receiveShadow = true; b.frustumCulled = false; g.add(b); return b; }

  /** A flat patch lying ON the road (not just at the height of the road's middle): a grid that follows the surface up hills and round banks. `zc` is where along the road (group-local), `mat` its material. */
  _drape(g, width, depth, zc, mat, lift = 0.06) {
    const nx = Math.max(2, Math.ceil(width / 2)), nz = Math.max(2, Math.ceil(depth / 0.6)), pos = [], uv = [], idx = [], q = Track.newQuery();
    const c = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y), base = g.position.y;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const lx = (i / nx - 0.5) * width, lz = zc + (j / nz - 0.5) * depth;
      const wx = g.position.x + lx * c + lz * sn, wz = g.position.z - lx * sn + lz * c;
      this.track.query(wx, base + 2.5, wz, q, 3);
      pos.push(lx, (q.idx >= 0 ? q.y : base) - base + lift, lz); uv.push(i / nx, 1 - j / nz);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.receiveShadow = true; m.userData.drape = true; g.add(m); return m;
  }

  _stripes(g, hw) {                                  // hazard stripes across the road, a little before the danger (laid flat on the road surface)
    const tex = this.stripeTex.clone(); tex.needsUpdate = true; tex.repeat.set(hw * 2 / 3, 1);
    this._drape(g, hw * 2 - 0.6, 2.2, -16, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  }

  _hammer(h) {
    const g = this._at(h.s), hw = g.userData.hw, C = COURSE.hammer, span = hw + 1.4, top = C.pivot + 1.0;
    for (const sg of [-1, 1]) this._box(g, this.mat.steel, 1.1, top, 1.1, sg * span, top / 2, 0);
    this._box(g, this.mat.red, span * 2 + 1.1, 1.0, 1.3, 0, top, 0);
    this._stripes(g, hw);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 8), this.mat.steel); rod.castShadow = true; rod.frustumCulled = false;
    const head = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.2, 20), this.mat.steel); body.rotation.x = Math.PI / 2;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.5, 20), this.mat.red); cap.rotation.x = Math.PI / 2;
    const cap2 = cap.clone(); cap.position.z = 1.5; cap2.position.z = -1.5;
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), this.mat.dark); hub.position.y = 1.5;
    head.add(body, cap, cap2, hub); head.traverse((o) => { o.castShadow = true; o.frustumCulled = false; });
    g.add(rod, head);
    this.hammers.push({ h, g, rod, head });
  }

  _arm(a) {
    const g = this._at(a.s), hw = g.userData.hw, A = COURSE.arm;
    this._stripes(g, hw);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(A.pole, A.pole + 0.25, 1.7, 16), this.mat.red); drum.position.y = 0.85; drum.castShadow = true; drum.frustumCulled = false; g.add(drum);
    const tex = this.stripeTex.clone(); tex.needsUpdate = true; tex.repeat.set((a.len || A.len) * 2 / 2.2, 1);
    const bar = new THREE.Mesh(new THREE.BoxGeometry((a.len || A.len) * 2, 0.62, 0.62), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    bar.position.y = A.y; bar.castShadow = true; bar.frustumCulled = false; g.add(bar);
    for (const e of [-1, 1]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), this.mat.red); k.position.set(e * (a.len || A.len), A.y, 0); k.castShadow = true; k.frustumCulled = false; bar.add(k); k.position.set(e * (a.len || A.len), 0, 0); }
    this.arms.push({ a, g, bar });
  }

  _boulder(b) {
    const g = this._at(b.s), B = COURSE.boulder, geo = new THREE.IcosahedronGeometry(B.r, 2), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), n = 1 + 0.07 * Math.sin(x * 2.3 + y * 1.7) * Math.cos(z * 2.9 - y * 1.1) + 0.04 * Math.sin(x * 6 + z * 5);
      pos.setXYZ(i, x * n, y * n, z * n);
    }
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8b8680, roughness: 0.95, flatShading: true })); rock.castShadow = true; rock.frustumCulled = false;
    this._stripes(g, g.userData.hw);
    g.add(rock); this.boulders.push({ b, g, rock });
  }

  _press(p) {
    const g = this._at(p.s), hw = g.userData.hw, C = COURSE.press, width = Math.min(hw * 2 - 1, p.width || 14), top = C.up + C.thick + 2.2;
    this._stripes(g, hw);
    const lights = [];
    for (const sg of [-1, 1]) {
      this._box(g, this.mat.concrete, 1.5, top, 1.8, sg * (width / 2 + 0.95), top / 2, 0);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), new THREE.MeshStandardMaterial({ color: 0x00aa22, emissive: 0x00aa22, emissiveIntensity: 1.4 }));
      lamp.position.set(sg * (width / 2 + 0.95), top + 0.5, 0.95); lamp.frustumCulled = false; g.add(lamp); lights.push(lamp);
    }
    this._box(g, this.mat.concrete, width + 3.4, 1.0, 2.0, 0, top + 0.1, 0);
    const tex = this.stripeTex.clone(); tex.needsUpdate = true; tex.repeat.set(width / 3, 1);
    const block = new THREE.Mesh(new THREE.BoxGeometry(width, C.thick, C.depth), [this.mat.concrete, this.mat.concrete, this.mat.dark, this.mat.dark, new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]);
    block.castShadow = true; block.receiveShadow = true; block.frustumCulled = false; g.add(block);
    this.presses.push({ p, g, block, lights });
  }

  _fire(p) {                                           // a scorched pit with glowing embers; a column of flame shoots up out of it
    const g = this._at(p.s), sx = g.userData.sx, F = COURSE.fire, x = sx * (p.lat || 0);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(F.r * 0.85, F.r * 0.95, 0.35, 20), this.mat.dark); rim.position.set(x, 0.12, 0); rim.receiveShadow = true; rim.frustumCulled = false;
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x551100 });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(F.r * 0.72, 20), glowMat); glow.rotation.x = -Math.PI / 2; glow.position.set(x, 0.32, 0); glow.frustumCulled = false;
    const flame = new THREE.Group(); flame.position.set(x, 0.3, 0); flame.visible = false;
    const layers = [[1.0, 0xff4a0a, 0.85], [0.68, 0xff9d1a, 0.9], [0.38, 0xffe27a, 0.95]].map(([k, c, o]) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(F.r * k, 1, 14, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      m.position.y = 0.5; m.frustumCulled = false; flame.add(m); return m;
    });
    g.add(rim, glow, flame); this.fires.push({ p, g, glow, flame, layers });
  }

  _gate(s, n) {
    const g = this._at(s), hw = g.userData.hw, mat = new THREE.MeshStandardMaterial({ color: 0x777788, emissive: 0x000000, roughness: 0.5 });
    for (const sg of [-1, 1]) this._box(g, mat, 0.8, 7.2, 0.8, sg * (hw + 1.6), 3.6, 0);
    const bar = this._box(g, mat, hw * 2 + 3.2, 0.7, 0.8, 0, 7.2, 0);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.9), new THREE.MeshBasicMaterial({ map: gateTex(`CHECKPOINT ${n}`) }));
    sign.position.set(0, 6.0, -0.45); sign.rotation.y = Math.PI; g.add(sign);
    const sign2 = sign.clone(); sign2.position.z = 0.45; sign2.rotation.y = 0; g.add(sign2);
    const strip = this._drape(g, hw * 2 - 0.6, 1.2, 0, new THREE.MeshBasicMaterial({ color: 0xffb31f, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 0.08);
    this.gates.push({ n, g, mat, strip, bar });
  }

  _signs() {
    const make = (kind, s, side, big) => {
      const g = this._at(Math.max(5, s)), hw = g.userData.hw, sx = g.userData.sx, [t, sub] = SIGNS[kind];
      const x = side * sx * (hw + 2.4), size = big ? 3.2 : 2.5;
      this._box(g, this.mat.steel, 0.2, 2.2 + size, 0.2, x, (2.2 + size) / 2, 0);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: signTex(t, sub), side: THREE.DoubleSide }));
      pl.position.set(x, 2.2 + size / 2, 0); pl.rotation.y = Math.PI; pl.frustumCulled = false; g.add(pl);
    };
    const d = this.def;
    for (const h of d.hammers) { make('hammer', h.s - 60, 1, true); make('hammer', h.s - 22, -1); }
    for (const a of d.arms) { make('arm', a.s - 60, 1, true); make('arm', a.s - 22, -1); }
    for (const b of d.boulders) { make('boulder', b.s - 55, 1, true); make('boulder', b.s - 22, -1); }
    for (const p of d.presses) { make('press', p.s - 60, 1, true); make('press', p.s - 22, -1); }
    for (const z of d.signs) { make(z.kind, z.s, 1, true); if (z.kind !== 'hoop') make(z.kind, z.s + 28, -1); }
  }

  _finish() {                                          // the finish: giant apples either side of the start/finish arch (the arch itself is drawn with the track)
    const T = this.track, g = this._at(0), hw = g.userData.hw;
    for (const sg of [-1, 1]) {
      const apple = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 18), new THREE.MeshStandardMaterial({ color: RED, roughness: 0.35, metalness: 0.1 }));
      apple.scale.y = 0.92; apple.position.set(sg * (hw + 5.5), 2.4, 4); apple.castShadow = true; apple.frustumCulled = false;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), this.mat.green); leaf.scale.set(1.5, 0.3, 0.8); leaf.position.set(0.9, 2.5, 0); leaf.rotation.z = 0.4; apple.add(leaf);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 6), this.mat.dark); stem.position.y = 2.5; apple.add(stem);
      g.add(apple);
    }
    this.finishGroup = g; void T;
  }

  /** The flaming hoop that hangs over the finale jump: a steel ring wreathed in flame, with a banner, and the fireworks that go up when you finish. */
  _hoop(H) {
    const g = this._at(H.s); this.hoopG = g;
    const ring = new THREE.Group(); ring.position.set(0, H.h, 0); g.add(ring);
    const R = H.r + 0.55;
    const tube = new THREE.Mesh(new THREE.TorusGeometry(R, 0.5, 14, 48), new THREE.MeshStandardMaterial({ color: 0xff7a18, emissive: 0xff4a0a, emissiveIntensity: 1.1, roughness: 0.5 }));
    tube.castShadow = false; tube.frustumCulled = false; ring.add(tube); this.hoopTube = tube;
    const n = 36;
    for (let i = 0; i < n; i++) {                                        // tongues of flame all round the ring
      const a = (i / n) * Math.PI * 2, big = i % 2 === 0;
      const fl = new THREE.Group(); fl.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); fl.rotation.z = a - Math.PI / 2;
      for (const [k, col, op] of [[1, 0xff4a0a, 0.8], [0.62, 0xffa31a, 0.9], [0.32, 0xffe98a, 0.95]]) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55 * k, (big ? 2.6 : 1.7) * k, 8, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        cone.position.y = (big ? 1.3 : 0.85) * k; cone.frustumCulled = false; fl.add(cone);
      }
      ring.add(fl); this.flames.push({ fl, ph: i * 1.9, base: big ? 1 : 0.8 });
    }
    const glow = new THREE.Mesh(new THREE.CircleGeometry(H.r, 32), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.frustumCulled = false; ring.add(glow);
    for (const sg of [1, -1]) {                                          // the finish banner, both ways round, above the ring
      const bn = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.2), new THREE.MeshBasicMaterial({ map: gateTex('FINISH!'), side: THREE.FrontSide }));
      bn.position.set(0, H.h + R + 3.4, 0.05 * sg); bn.rotation.y = sg > 0 ? 0 : Math.PI; bn.frustumCulled = false; g.add(bn);
    }
  }

  /** Fireworks over the finish: bursts of coloured sparks, launched one after another for a few seconds after the finish. */
  _fireworks(a) {
    const g = this.hoopG; if (!g) return;
    const B = 34, N = 80, total = B * N, t0 = a.finishT;
    if (!this.fw) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(total * 3), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
      pts.frustumCulled = false; g.add(pts);
      const bursts = [], palette = [[1, 0.25, 0.2], [1, 0.8, 0.2], [0.3, 0.9, 0.4], [0.3, 0.6, 1], [1, 0.4, 0.9], [1, 1, 1]];
      let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let k = 0; k < B; k++) {
        const col = palette[Math.floor(rnd() * palette.length)], col2 = palette[Math.floor(rnd() * palette.length)];
        const parts = []; const sp = 13 + rnd() * 9;
        for (let i = 0; i < N; i++) {                                    // a sphere of sparks (some in a second colour)
          const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u), v = sp * (0.55 + 0.45 * rnd());
          parts.push({ vx: r * Math.cos(th) * v, vy: u * v, vz: r * Math.sin(th) * v, c: i % 3 === 0 ? col2 : col });
        }
        bursts.push({ at: 0.25 + k * 0.38 + rnd() * 0.2, x: (rnd() - 0.5) * 70, y: 16 + rnd() * 26, z: 8 + rnd() * 55, life: 2.2 + rnd() * 0.8, parts });
      }
      this.fw = { pts, bursts, total };
    }
    const { pts, bursts } = this.fw, pa = pts.geometry.attributes.position, ca = pts.geometry.attributes.color, age0 = a.t - t0;
    pts.visible = true;
    for (let k = 0; k < bursts.length; k++) {
      const b = bursts[k], age = age0 - b.at;
      for (let i = 0; i < N; i++) {
        const o = (k * N + i), p = b.parts[i];
        if (age < 0 || age > b.life) { pa.setXYZ(o, 0, -999, 0); continue; }
        const drag = 1 - Math.exp(-2.2 * age), d = drag / 2.2;           // sparks slow down as they fly out, then fall
        pa.setXYZ(o, b.x + p.vx * d, b.y + p.vy * d - 4.5 * age * age, b.z + p.vz * d);
        const f = Math.max(0, 1 - age / b.life) * (0.65 + 0.35 * Math.sin(age * 40 + i));
        ca.setXYZ(o, p.c[0] * f, p.c[1] * f, p.c[2] * f);
      }
    }
    pa.needsUpdate = true; ca.needsUpdate = true;
  }

  /** Put every hazard where the clock says it is. `a` is the Assault run. */
  update(a) {
    const t = a.t;
    for (const o of this.hammers) {
      const C = COURSE.hammer, q = hammerHead(o.h, t), sx = o.g.userData.sx, x = sx * q.off, px = 0, py = C.pivot;
      o.head.position.set(x, q.y, 0);
      const dx = x - px, dy = q.y - py, len = Math.hypot(dx, dy);
      o.rod.position.set((x + px) / 2, (q.y + py) / 2, 0); o.rod.scale.set(1, len, 1); o.rod.rotation.z = Math.atan2(-dx, dy);
      o.head.rotation.z = Math.atan2(-dx, dy) + Math.PI;
    }
    for (const o of this.arms) o.bar.rotation.y = Math.atan2(-Math.cos(armAngle(o.a, t)), o.g.userData.sx * Math.sin(armAngle(o.a, t)));
    for (const o of this.boulders) {
      const f = o.g.userData.f, bo = boulderAt(o.b, f.hw, t), x = o.g.userData.sx * bo.lat;
      o.rock.position.set(x, COURSE.boulder.r, 0); o.rock.rotation.z = -x / COURSE.boulder.r;
    }
    for (const o of this.presses) {
      const st = pressAt(o.p, t), C = COURSE.press;
      o.block.position.y = st.y + C.thick / 2;
      const col = st.light === 'green' ? 0x00cc33 : st.light === 'amber' ? 0xffaa00 : 0xff2200;
      for (const l of o.lights) { l.material.color.setHex(col); l.material.emissive.setHex(col); }
    }
    for (const o of this.fires) {
      const st = fireAt(o.p, t), F = COURSE.fire;
      o.glow.material.color.setHex(st.state === 'warn' ? (Math.sin(t * 40) > 0 ? 0xff6a10 : 0xaa2200) : st.state === 'burst' ? 0xffd060 : 0x551100);
      o.flame.visible = st.state !== 'idle';
      if (st.state === 'warn') { const h = 0.8 + st.k * 1.6; o.layers.forEach((m, i) => { m.scale.y = h * (1 - i * 0.2); m.scale.x = m.scale.z = 0.6 + 0.25 * Math.sin(t * 30 + i); m.position.y = m.scale.y / 2; }); }
      else if (st.state === 'burst') {
        const rise = Math.min(1, st.k * 4), fall = st.k > 0.7 ? 1 - (st.k - 0.7) / 0.3 : 1, h = F.height * rise * (0.3 + 0.7 * fall);
        o.layers.forEach((m, i) => { m.scale.y = Math.max(0.1, h * (1 - i * 0.15)); m.scale.x = m.scale.z = (0.85 + 0.15 * Math.sin(t * 25 + i * 2)) * (1 - i * 0.05); m.position.y = m.scale.y / 2; });
      }
    }
    if (this.hoopG) {
      for (const o of this.flames) { const k = o.base * (0.75 + 0.35 * Math.sin(t * 17 + o.ph) + 0.15 * Math.sin(t * 31 + o.ph * 2)); o.fl.scale.set(1 + 0.15 * Math.sin(t * 23 + o.ph), Math.max(0.4, k), 1); }
      if (this.hoopTube) this.hoopTube.material.emissiveIntensity = 0.9 + 0.3 * Math.sin(t * 12);
    }
    if (a.state === 'finished' && a.finishT != null) this._fireworks(a); else if (this.fw) this.fw.pts.visible = false;
    for (const gt of this.gates) {
      const done = a.next >= gt.n, nextOne = a.next === gt.n - 1, col = done ? 0x32d74b : nextOne ? 0xffb31f : 0x6f6f86;
      if (gt._col !== col) { gt._col = col; gt.mat.color.setHex(col); gt.mat.emissive.setHex(done || nextOne ? col : 0); gt.mat.emissiveIntensity = 0.45; gt.strip.material.color.setHex(col); gt.strip.visible = true; }
    }
  }
}
