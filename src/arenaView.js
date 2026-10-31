// Draws the Deep Pan Pizza's open arena (a round floor): a dirt floor, a crash wall and floodlights.
// The shape comes from arena.js, the same numbers the physics uses, so the wall you see is the wall you hit.
import * as THREE from 'three';
import { arenaInfo, arenaOutline } from './arena.js';
import { WALL_GAP, WALL_T, WALL_HEIGHT, bumpAt } from './track.js';
import { barrierTexture } from './textures.js';

const N = 96;              // points round the outline
const SEG = 128;           // points round the floor
const APRON_W = 2.4;

export function buildArena(track, aniso = 8) {
  const A = arenaInfo(track), g = new THREE.Group(), y0 = A.y;
  const cache = new Map();
  const outline = (r) => { let o = cache.get(r); if (!o) cache.set(r, o = arenaOutline(A, r, N)); return o; };

  /** A strip of surface between the outline at radius r0 (height h0) and the one at r1 (height h1). u runs round the arena in `uMeters` units. */
  const ribbon = (r0, h0, r1, h1, mat, uMeters, { cast = false, receive = false } = {}) => {
    const P0 = outline(r0), P1 = outline(r1), pos = [], uv = [], idx = [];
    let u = 0;
    for (let i = 0; i <= N; i++) {
      if (i) u += Math.hypot(P0[i].x - P0[i - 1].x, P0[i].z - P0[i - 1].z) / uMeters;
      pos.push(P0[i].x, h0, P0[i].z, P1[i].x, h1, P1[i].z); uv.push(u, 0, u, 1);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    bg.setIndex(idx); bg.computeVertexNormals();
    const m = new THREE.Mesh(bg, mat); m.castShadow = cast; m.receiveShadow = receive; m.frustumCulled = false;
    g.add(m); return m;
  };
  const std = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: THREE.DoubleSide, ...opts });
  const cheap = (opts) => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, ...opts });      // plain shading is plenty for the apron

  // ---- the floor: ONE mesh. A round grid of points whose heights come from the same function the physics uses (humps up, dips down), painted from ONE small picture:
  // dough crust round the edge, red sauce inside it, black olives where the humps are and yellow cheese where the dips are. (One mesh and one picture,
  // instead of a mesh per hump, is what keeps this arena quick on slow computers.)
  const rFloor = A.hw + WALL_GAP + WALL_T;
  const bumps = track.bumps || [];
  const edge = arenaOutline(A, rFloor, SEG), cx = A.cx, cz = A.cz;
  let R = 0; for (const p of edge) R = Math.max(R, Math.hypot(p.x - cx, p.z - cz));
  const playR = (A.ax + A.az) / 2, SIZE = 1024, k = SIZE / (2 * R);
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
  const c = cv.getContext('2d'), disc = (x, z, r, fill) => { c.fillStyle = fill; c.beginPath(); c.arc((x - cx + R) * k, (z - cz + R) * k, r * k, 0, Math.PI * 2); c.fill(); };
  // painted like the cartoon pizza: flat tan dough, wobbly-edged red sauce with a few red splashes on the crust, olives with a shine, cheese with shine marks and a pale patch
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const px = (x, z) => [(x - cx + R) * k, (z - cz + R) * k];
  c.fillStyle = '#d5b97f'; c.fillRect(0, 0, SIZE, SIZE);                                      // dough
  c.fillStyle = '#7f2424'; c.beginPath();                                                      // sauce: the edge wanders in and out, never closer in than 0.8 of the way out (the lumps stay on it)
  for (let i = 0; i <= 180; i++) {
    const th = i / 180 * Math.PI * 2, rr = playR * (0.87 + 0.03 * Math.sin(3 * th + 1) + 0.025 * Math.sin(5 * th + 2) + 0.015 * Math.sin(8 * th)), [X, Z] = px(cx + Math.cos(th) * rr, cz + Math.sin(th) * rr);
    i ? c.lineTo(X, Z) : c.moveTo(X, Z);
  }
  c.fill();
  for (let i = 0; i < 16; i++) {                                                               // splashes of sauce on the crust
    const th = rnd() * Math.PI * 2, rr = playR * (0.9 + rnd() * 0.07), sz = (0.9 + rnd() * 1.8) * k, [X, Z] = px(cx + Math.cos(th) * rr, cz + Math.sin(th) * rr);
    c.beginPath(); c.ellipse(X, Z, sz * 1.3, sz, rnd() * Math.PI, 0, Math.PI * 2); c.fill();
  }
  for (const b of bumps) {
    const [X, Z] = px(b.x, b.z), r = b.r * k;
    const halo = c.createRadialGradient(X, Z, r * 0.8, X, Z, r * 1.35);                        // a soft shadow in the sauce round every olive and dip, so the ground looks like it rises and falls
    halo.addColorStop(0, 'rgba(40,0,0,0.55)'); halo.addColorStop(1, 'rgba(40,0,0,0)');
    c.fillStyle = halo; c.beginPath(); c.arc(X, Z, r * 1.35, 0, Math.PI * 2); c.fill();
    if (b.h > 0) {                                                                             // olive: black ring, dark grey middle, white shine
      c.fillStyle = '#1f1e1c'; c.beginPath(); c.arc(X, Z, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#403c35'; c.beginPath(); c.arc(X, Z, r * 0.7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(X + r * 0.32, Z - r * 0.36, r * 0.17, r * 0.12, -0.5, 0, Math.PI * 2); c.fill();
    } else {                                                                                   // cheese: yellow, a pale patch low on the left, shine marks on the left and upper right
      const deep = c.createRadialGradient(X, Z, 0, X, Z, r);                                 // cheese: pale at the lip, getting darker and more orange to the bottom of the dip
      deep.addColorStop(0, '#8a5612'); deep.addColorStop(0.45, '#b9822a'); deep.addColorStop(0.8, '#e2b844'); deep.addColorStop(1, '#f8d762');
      c.fillStyle = deep; c.beginPath(); c.arc(X, Z, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(70,35,0,0.5)'; c.lineWidth = Math.max(2, r * 0.1); c.beginPath(); c.arc(X, Z, r * 0.96, 0, Math.PI * 2); c.stroke();      // dark lip where the wall of the dip casts shade
      c.fillStyle = '#e7d07c'; c.beginPath(); c.ellipse(X - r * 0.1, Z + r * 0.62, r * 0.28, r * 0.17, -0.2, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff6d0'; c.lineWidth = Math.max(1.5, r * 0.07); c.lineCap = 'round';
      c.beginPath(); c.arc(X, Z, r * 0.82, Math.PI * 0.82, Math.PI * 1.12); c.stroke();
      c.beginPath(); c.arc(X, Z, r * 0.82, -Math.PI * 0.42, -Math.PI * 0.1); c.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = aniso; tex.generateMipmaps = true;
  const RINGS = 56, pos = [0, y0, 0], uv = [0.5, 0.5], idx = [], tmp = { h: 0, gx: 0, gz: 0 };
  for (let ri = 1; ri <= RINGS; ri++) for (let j = 0; j < SEG; j++) {
    const t = ri / RINGS, x = cx + (edge[j].x - cx) * t, z = cz + (edge[j].z - cz) * t;
    bumpAt(bumps, x, z, tmp); pos.push(x, y0 + tmp.h, z); uv.push((x - cx + R) / (2 * R), (z - cz + R) / (2 * R));
  }
  pos[1] = y0 + bumpAt(bumps, cx, cz, tmp).h;
  for (let j = 0; j < SEG; j++) idx.push(0, 1 + (j + 1) % SEG, 1 + j);
  for (let ri = 1; ri < RINGS; ri++) for (let j = 0; j < SEG; j++) {
    const a0 = 1 + (ri - 1) * SEG + j, a1 = 1 + (ri - 1) * SEG + (j + 1) % SEG, b0 = 1 + ri * SEG + j, b1 = 1 + ri * SEG + (j + 1) % SEG;
    idx.push(a0, a1, b0, a1, b1, b0);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); fg.setIndex(idx); fg.computeVertexNormals();
  const floor = new THREE.Mesh(fg, std({ map: tex, roughness: 1 }));
  floor.receiveShadow = true; floor.frustumCulled = false; g.add(floor);

  // ---- the crash wall: inner face, top, outer face
  const barrier = barrierTexture(aniso), concrete = cheap({ color: 0xb9b4aa });
  const rIn = A.hw + WALL_GAP, rOut = rIn + WALL_T, top = y0 + WALL_HEIGHT;
  ribbon(rIn, y0, rIn, top, std({ map: barrier, roughness: 0.8 }), 8, { cast: true, receive: true });
  ribbon(rIn, top, rOut, top, concrete, 8, { receive: true });
  ribbon(rOut, top, rOut, y0, concrete, 8);

  // ---- apron, then straight down to the grass (no stands)
  const grey = cheap({ color: 0x77727c });
  ribbon(rOut, y0, rOut + APRON_W, y0, grey, 8);
  const r = rOut + APRON_W;
  ribbon(r, y0, r, -0.4, grey, 8);
  const rBack = r;

  // ---- floodlights on tall pylons round the outside of the wall
  const POLES = 12, poleH = 34;
  const pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, poleH, 0.9), new THREE.MeshStandardMaterial({ color: 0x2e2c38, roughness: 0.6 }), POLES);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(7, 1.4, 1.6), new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd9a0, emissiveIntensity: 2.4 }), POLES);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), ring = outline(rBack + 1.2);
  for (let i = 0; i < POLES; i++) {
    const a = ring[Math.floor(i / POLES * N)], b = ring[(Math.floor(i / POLES * N) + 1) % N];
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(b.x - a.x, b.z - a.z));
    p.set(a.x, poleH / 2 - 0.4, a.z); m4.compose(p, q, one); pole.setMatrixAt(i, m4);
    p.set(a.x, poleH - 0.4, a.z); m4.compose(p, q, one); head.setMatrixAt(i, m4);
  }
  pole.frustumCulled = head.frustumCulled = false;
  g.add(pole, head);

  g.userData.bounds = { minX: A.cx - rBack, maxX: A.cx + rBack, minZ: A.cz - A.az - (rBack - A.hw), maxZ: A.cz + A.az + (rBack - A.hw) };
  g.userData.clear = A.hw + (rBack - A.hw) + 14;       // trees and so on keep this far from the centreline
  return g;
}
