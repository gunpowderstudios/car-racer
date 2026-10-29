// What The Getaway looks like: a small town of shops and banks, painted roads, the bags of money and the safehouse.
// The solid parts (the blocks and the wall) are the boxes in getaway.js that the physics uses, so what you see is what you hit.
import * as THREE from 'three';
import { townLayout, TOWN } from './getaway.js';
import { arenaInfo } from './arena.js';

const rnd = (seed) => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  return t;
}

const WALLS = ['#b9674a', '#9aa3ad', '#c8b58a', '#7d8fa5', '#a8584f', '#8e9a7e', '#c49a6c', '#7a7f99'];
const AWN = [['#d8352a', '#f4f0e6'], ['#2a6fb5', '#f4f0e6'], ['#2f8f4a', '#f4f0e6'], ['#e0a21a', '#2b2b2b'], ['#7a3fa0', '#f4f0e6']];

/** Windows: a repeating tile 12 m wide and 8 m tall. */
const upperTex = (wall, seed) => canvasTex(128, 128, (g, w, h) => {
  const r = rnd(seed);
  g.fillStyle = wall; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, h - 6, w, 6);
  for (let i = 0; i < 3; i++) {
    const lit = r() < 0.3;
    g.fillStyle = lit ? '#ffe79a' : '#2c3a4a'; g.fillRect(10 + i * 40, 22, 26, 62);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(10 + i * 40, 22, 26, 8);
    g.strokeStyle = '#e9e4da'; g.lineWidth = 3; g.strokeRect(10 + i * 40, 22, 26, 62);
  }
});
/** Shop fronts: glass, a door and a striped awning. Tile 14 m wide, 5 m tall. */
const shopTex = (wall, awn, seed) => canvasTex(224, 80, (g, w, h) => {
  g.fillStyle = wall; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2; i++) {
    const x = i * 112 + 8;
    g.fillStyle = '#243746'; g.fillRect(x, 26, 96, 54);
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x + 6, 32, 30, 40);
    g.fillStyle = '#ffdca0'; g.fillRect(x + 56, 40, 30, 36);
    for (let s = 0; s < 8; s++) { g.fillStyle = s % 2 ? awn[1] : awn[0]; g.fillRect(x - 4 + s * 13, 8, 13, 18); }
  }
});
const bankTex = () => canvasTex(512, 160, (g, w, h) => {
  g.fillStyle = '#16402a'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e7c04a'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = '#f2cd5a'; g.font = '900 104px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BANK', w / 2, h / 2 + 6);
});
const roofSignTex = () => canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = '#16402a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e7c04a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#f2cd5a'; g.font = '900 70px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$ BANK $', w / 2, h / 2 + 4);
});
const safeTex = () => canvasTex(512, 128, (g, w, h) => {
  g.fillStyle = '#12351c'; g.fillRect(0, 0, w, h); g.strokeStyle = '#7dff9a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = '#7dff9a'; g.font = '900 78px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SAFEHOUSE', w / 2, h / 2 + 4);
});
const sackTex = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#9b7a3c'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#e9d27a'; g.font = '900 96px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', w / 2, h / 2 + 6);
});
/** The painted streets: asphalt with a dashed centre line along every street and a zebra crossing at each end of each block's street. */
function roadTex(L) {
  const S = 4, W = Math.ceil(L.W * S), D = Math.ceil(L.D * S);        // 4 pixels to the metre
  return canvasTex(W, D, (g) => {
    g.fillStyle = '#c9c5bb'; g.fillRect(0, 0, W, D);              // pavement everywhere; the streets go over it
    const X = (x) => (x + L.W / 2) * S, Z = (z) => (z + L.D / 2) * S, ast = (L.T.street - 5) * S, k = 0.35 * S;     // the road is 2.5 m narrower each side than the street: that is the pavement
    g.fillStyle = '#50535b';
    for (const z of L.zs) g.fillRect(0, Z(z) - ast / 2, W, ast);
    for (const x of L.xs) g.fillRect(X(x) - ast / 2, 0, ast, D);
    g.fillStyle = '#e9e6da';                                      // a white kerb line along both edges of every street
    for (const z of L.zs) for (const sgn of [-1, 1]) g.fillRect(0, Z(z) + sgn * ast / 2 - (sgn > 0 ? k : 0), W, k);
    for (const x of L.xs) for (const sgn of [-1, 1]) g.fillRect(X(x) + sgn * ast / 2 - (sgn > 0 ? k : 0), 0, k, D);
    g.fillStyle = '#50535b';                                      // (the junctions are open road: no kerb across them)
    for (const x of L.xs) for (const z of L.zs) g.fillRect(X(x) - ast / 2 - 1, Z(z) - ast / 2 - 1, ast + 2, ast + 2);
    g.fillStyle = '#e9d36a';
    for (const z of L.zs) for (let x = 0; x < L.W; x += 8) { const near = L.xs.some((xx) => Math.abs(xx - (x - L.W / 2 + 2)) < L.T.street / 2 + 1); if (!near) g.fillRect(X(x - L.W / 2), Z(z) - 1, 4 * S, 2); }
    for (const x of L.xs) for (let z = 0; z < L.D; z += 8) { const near = L.zs.some((zz) => Math.abs(zz - (z - L.D / 2 + 2)) < L.T.street / 2 + 1); if (!near) g.fillRect(X(x) - 1, Z(z - L.D / 2), 2, 4 * S); }
    g.fillStyle = '#e8e8e8';                                      // zebra crossings
    for (const x of L.xs) for (const z of L.zs) {
      for (let q = -2; q <= 2; q++) {
        g.fillRect(X(x) + q * 2.2 * S - 0.5 * S, Z(z) - ast / 2 - 3.0 * S, 1.1 * S, 2.4 * S);
        g.fillRect(X(x) + q * 2.2 * S - 0.5 * S, Z(z) + ast / 2 + 0.6 * S, 1.1 * S, 2.4 * S);
      }
    }
  });
}

export class GetawayView {
  /** `group` is the track's mesh group (it is disposed with the track). */
  constructor(track, group) {
    const L = this.L = townLayout(), A = arenaInfo(track), y0 = this.y0 = A.y;
    this.group = group; this.bags = []; this.t = 0;
    const g = new THREE.Group(); group.add(g); this.g = g;
    g.add(new THREE.HemisphereLight(0xfff1dc, 0x8a8fa8, 2.4));          // (the arena is lit for a dirt floor at dusk: the town needs daylight)
    const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-60, 120, 40); g.add(sun);

    // ---- the ground: one big sheet of pavement over the arena's dirt, with the streets painted on
    const far = 420;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(far, far), new THREE.MeshLambertMaterial({ color: 0x55575c }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, y0 + 0.02, 0); floor.receiveShadow = true; g.add(floor);
    const roads = new THREE.Mesh(new THREE.PlaneGeometry(L.W, L.D), new THREE.MeshLambertMaterial({ map: roadTex(L) }));
    roads.rotation.x = -Math.PI / 2; roads.position.set(0, y0 + 0.04, 0); roads.receiveShadow = true; g.add(roads);

    // ---- the blocks: shops along the ground floor, windows above, a roof; the south face of each is its bank
    const r = rnd(2024);
    const hs = L.T.height;
    L.blocks.forEach((b, n) => {
      const wall = WALLS[Math.floor(r() * WALLS.length)], awn = AWN[Math.floor(r() * AWN.length)], H = 17 + Math.floor(r() * 4) * 5;
      const w = b.hx * 2, d = b.hz * 2, shopH = 5, upH = H - shopH;
      const mk = (map, rx, ry) => { const t = map.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshLambertMaterial({ map: t }); };
      const roof = new THREE.MeshLambertMaterial({ color: 0x4b4e55 });
      const shop = shopTex(wall, awn, n), up = upperTex(wall, n + 99);
      const gx = b.cx - 8, gw = L.T.garageW / 2, gd = L.T.garageD, x0 = b.cx - b.hx, x1 = b.cx + b.hx, z0 = b.cz - b.hz, z1 = b.cz + b.hz;
      const piece = (ax, bx_, az, bz_) => {                      // the ground floor is three pieces round the garage bay; the floors above run right over it
        const pw = bx_ - ax, pd = bz_ - az;
        const m = new THREE.Mesh(new THREE.BoxGeometry(pw, shopH, pd), [mk(shop, pd / 14, 1), mk(shop, pd / 14, 1), roof, roof, mk(shop, pw / 14, 1), mk(shop, pw / 14, 1)]);
        m.position.set((ax + bx_) / 2, y0 + shopH / 2, (az + bz_) / 2); m.castShadow = m.receiveShadow = true; g.add(m);
      };
      piece(x0, gx - gw, z0, z1); piece(gx + gw, x1, z0, z1); piece(gx - gw, gx + gw, z0 + gd, z1);
      const bayFloor = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2, gd), new THREE.MeshLambertMaterial({ color: 0x3a3b40 })); bayFloor.rotation.x = -Math.PI / 2; bayFloor.position.set(gx, y0 + 0.06, z0 + gd / 2); g.add(bayFloor);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(gw * 2 + 1, 0.6, 0.5), new THREE.MeshLambertMaterial({ color: 0xe0a21a })); lintel.position.set(gx, y0 + shopH - 0.3, z0 - 0.1); g.add(lintel);
      const upBox = new THREE.Mesh(new THREE.BoxGeometry(w, upH, d), [mk(up, d / 12, upH / 8), mk(up, d / 12, upH / 8), roof, roof, mk(up, w / 12, upH / 8), mk(up, w / 12, upH / 8)]);
      upBox.position.set(b.cx, y0 + shopH + upH / 2, b.cz); upBox.castShadow = upBox.receiveShadow = true; g.add(upBox);
      // the bank's sign over the door (south face) and a bigger one on the roof
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), new THREE.MeshBasicMaterial({ map: bankTex() }));
      sign.position.set(b.cx, y0 + 6.6, b.cz + b.hz + 0.2); g.add(sign);
      const rs = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: roofSignTex(), side: THREE.DoubleSide }));
      rs.position.set(b.cx, y0 + H + 4.5, b.cz); g.add(rs);
      for (const sx of [-5, 5]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), roof); post.position.set(b.cx + sx, y0 + H + 2, b.cz); g.add(post); }
    });

    // ---- the wall of buildings round the town, carried on out to the edge of the arena so there is nothing to see beyond it
    const OUT = 190, WH = 36, wallBox = (x0, x1, z0, z1, ox, oz) => {
      const w = x1 - x0, d = z1 - z0, t = upperTex('#6f7684', 5);
      const mkm = (rx, ry) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); return new THREE.MeshLambertMaterial({ map: c }); };
      const top = new THREE.MeshLambertMaterial({ color: 0x3d4048 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, WH, d), [mkm(d / 12, WH / 8), mkm(d / 12, WH / 8), top, top, mkm(w / 12, WH / 8), mkm(w / 12, WH / 8)]);
      m.position.set((x0 + x1) / 2, y0 + WH / 2, (z0 + z1) / 2); g.add(m);
    };
    const hw = L.W / 2, hd = L.D / 2;
    wallBox(-OUT, OUT, -OUT, -hd); wallBox(-OUT, OUT, hd, OUT);
    wallBox(-OUT, -hw, -hd, hd); wallBox(hw, OUT, -hd, hd);

    // ---- the bags of money: a sack with a $ on it, a ring on the road and a tall beam when one is lying loose
    const sackMap = sackTex(), sackGeo = new THREE.SphereGeometry(0.6, 16, 12), neckGeo = new THREE.CylinderGeometry(0.14, 0.26, 0.3, 10);
    const sackMat = new THREE.MeshLambertMaterial({ map: sackMap }), tieMat = new THREE.MeshLambertMaterial({ color: 0xd9b84a });
    const ringGeo = new THREE.RingGeometry(2.4, 3.0, 40), beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 40, 10, 1, true);
    for (const bank of L.banks) {
      const grp = new THREE.Group();
      const sack = new THREE.Mesh(sackGeo, sackMat); sack.scale.set(1, 0.95, 1); sack.castShadow = true;
      const neck = new THREE.Mesh(neckGeo, tieMat); neck.position.y = 0.65;
      const spin = new THREE.Group(); spin.add(sack, neck); spin.position.y = 0.8; grp.add(spin);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; grp.add(ring);
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 20; beam.visible = false; grp.add(beam);
      g.add(grp); this.bags.push({ grp, spin, ring, beam, id: bank.id });
    }

    // ---- the safehouse: a green arch over the road, a ring on the ground and a tall beam you can see from anywhere in town
    const sh = this.safe = new THREE.Group();
    const green = new THREE.MeshLambertMaterial({ color: 0x1e7a3a });
    const vertical = false;       // (set in place(): the arch spans the street)
    for (const sx of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5, 0.7), green); post.position.set(sx * 5.2, 2.5, -0.2); sh.add(post); }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: safeTex(), side: THREE.DoubleSide })); banner.position.set(0, 7.2, -0.3); banner.rotation.y = Math.PI; sh.add(banner);
    const pad = new THREE.Mesh(new THREE.RingGeometry(L.T.safeR - 0.8, L.T.safeR, 48), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.14, L.T.garageD * 0 + 9); sh.add(pad);
    const sbeam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 120, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); sbeam.position.set(0, 60, 9); sh.add(sbeam);
    this.pad = pad; sh.visible = false; g.add(sh);
    const doorTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#9aa1a9'; c.fillRect(0, 0, w, h); c.fillStyle = '#6f757c'; for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 2); });
    this.door = new THREE.Mesh(new THREE.BoxGeometry(L.T.garageW, 5, 0.4), new THREE.MeshLambertMaterial({ map: doorTex })); this.door.visible = false; g.add(this.door);       // the garage door (a roller shutter that comes down after a drop)
    this.stash = [];
    for (let i = 0; i < TOWN.goal + 1; i++) { const s = new THREE.Mesh(sackGeo, sackMat); s.scale.setScalar(1); s.visible = false; g.add(s); this.stash.push(s); }
  }

  /** The red satnav line on the road: `pts` is a list of { x, z } from the car to where it is going (or null to hide it). */
  setRoute(pts) {
    if (!this.line) {
      const MAX = 240, geo = new THREE.BufferGeometry(), idx = [];
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(MAX * 2 * 2), 2).setUsage(THREE.DynamicDrawUsage));
      for (let i = 0; i < MAX - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx);
      const tex = canvasTex(64, 32, (g, w, h) => {
        g.fillStyle = 'rgba(255,40,30,0.32)'; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.moveTo(14, 5); g.lineTo(48, h / 2); g.lineTo(14, h - 5); g.lineTo(26, h / 2); g.closePath(); g.fill();
      });
      this.line = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      this.line.frustumCulled = false; this.line.renderOrder = 2; this.g.add(this.line); this.lineMax = MAX;
    }
    if (!pts || pts.length < 2) { this.line.visible = false; return; }
    let P = pts;
    for (let it = 0; it < 2; it++) { const Q = [P[0]]; for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; Q.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 }); } Q.push(P[P.length - 1]); P = Q; }
    const n = Math.min(P.length, this.lineMax), pos = this.line.geometry.attributes.position, uv = this.line.geometry.attributes.uv, y = this.y0 + 0.1, half = 0.4;
    let u = 0;
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
      if (i) u += Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z) / 3.2;
      pos.setXYZ(i * 2, P[i].x + nx * half, y, P[i].z + nz * half); pos.setXYZ(i * 2 + 1, P[i].x - nx * half, y, P[i].z - nz * half);
      uv.setXY(i * 2, u, 0); uv.setXY(i * 2 + 1, u, 1);
    }
    pos.needsUpdate = true; uv.needsUpdate = true; this.line.geometry.setDrawRange(0, (n - 1) * 6); this.line.visible = true;
  }

  /** Put the safehouse arch where the game says (it spans the street it is on). */
  place(game) {
    const S = game.safehouse;
    this.safe.position.set(S.gx ?? S.x, this.y0, S.mouth ?? S.z); this.safe.rotation.y = 0; this.safe.visible = true;
  }

  /** Bring every bag, ring and beam up to date with the game (`game` is a GetawayGame). */
  update(game, dt = 1 / 60) {
    this.t += dt;
    const dr = game.door, da = dr ? game.doorAmount() : 0;
    this.door.visible = !!dr && da > 0.01;
    if (this.door.visible) { this.door.position.set(dr.gx, this.y0 + 5 - 2.5 * da, dr.mouth - 0.1); this.door.scale.y = da; }
    if (!this._placed || this._placed !== game.safehouse) { this._placed = game.safehouse; this.place(game); }
    const pulse = 0.65 + 0.35 * Math.sin(this.t * 4);
    this.pad.material.opacity = 0.5 + 0.4 * pulse;
    let safeN = 0;
    for (const v of this.bags) {
      const b = game.bags[v.id];
      v.grp.visible = b.state !== 'hidden' && b.state !== 'safe';
      if (b.state === 'hidden') continue;
      if (b.state === 'safe') { const s = this.stash[safeN++]; if (s) { s.visible = true; s.position.set(game.safehouse.x + (safeN - 2) * 1.6, this.y0 + 0.8, game.safehouse.z + (safeN % 2 ? 1.4 : -1.4)); } continue; }
      v.spin.rotation.y = this.t * 1.6;
      v.ring.visible = b.state === 'home' || b.state === 'ground';
      v.ring.material.color.setHex(b.state === 'ground' ? 0xffd23a : 0x7dff9a);
      v.ring.scale.setScalar(0.92 + 0.12 * pulse);
      v.beam.visible = b.state === 'ground' || b.state === 'home';
      v.beam.material.color.setHex(b.state === 'ground' ? 0xffd23a : 0x7dff9a);
      const carried = b.state === 'robber' || b.state === 'police';
      v.spin.visible = !carried; v.spin.position.y = carried ? 2.6 : 0.8 + 0.1 * Math.sin(this.t * 3 + v.id);
      v.spin.scale.setScalar(carried ? 0.9 : 1);
      v.grp.position.set(b.x, this.y0, b.z);
    }
    for (let i = safeN; i < this.stash.length; i++) this.stash[i].visible = false;
  }
}
