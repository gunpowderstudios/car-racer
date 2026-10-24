// Draws the Deep Pan Pizza's open arena (a round floor): a dirt floor, a crash wall and floodlights.
// The shape comes from arena.js, the same numbers the physics uses, so the wall you see is the wall you hit.
import * as THREE from 'three';
import { arenaInfo, arenaOutline } from './arena.js';
import { WALL_GAP, WALL_T, WALL_HEIGHT, bumpAt, puddleShape, puddleEdge } from './track.js';
import { dirtTexture, barrierTexture } from './textures.js';

const N = 96;              // points round the outline
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

  // ---- the floor
  const rFloor = A.hw + WALL_GAP + WALL_T;
  const shape = new THREE.Shape(outline(rFloor).map((p) => new THREE.Vector2(p.x, -p.z)));
  const dirt = dirtTexture(aniso); dirt.repeat.set(1 / 24, 1 / 24);
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), std({ map: dirt, color: 0xd2704c, roughness: 1 }));      // (tomato and sausage: the low ground is a red-brown)
  floor.position.y = y0; floor.receiveShadow = true; floor.frustumCulled = false;
  g.add(floor);

  // ---- humps: a round mound of the same dirt laid over the floor (rings of points, heights from the same function the physics uses)
  const bumps = track.bumps || [];
  if (bumps.length) {
    const bd = dirtTexture(aniso); bd.repeat.set(1 / 24, 1 / 24);
    const bumpMat = std({ map: bd, color: 0x62c24a, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const RINGS = 14, SEG = 36, tmp = { h: 0, gx: 0, gz: 0 };
    for (const b of bumps) {
      const pos = [0, y0 + b.h, 0], idx = [];
      for (let ri = 1; ri <= RINGS; ri++) for (let k = 0; k < SEG; k++) {
        const r = b.r * ri / RINGS, a = k / SEG * Math.PI * 2, x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
        bumpAt([b], x, z, tmp); pos.push(x - b.x, y0 + tmp.h + 0.01, z - b.z);
      }
      for (let k = 0; k < SEG; k++) idx.push(0, 1 + k, 1 + (k + 1) % SEG);
      for (let ri = 1; ri < RINGS; ri++) for (let k = 0; k < SEG; k++) {
        const a0 = 1 + (ri - 1) * SEG + k, a1 = 1 + (ri - 1) * SEG + (k + 1) % SEG, b0 = 1 + ri * SEG + k, b1 = 1 + ri * SEG + (k + 1) % SEG;
        idx.push(a0, b0, a1, a1, b0, b1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      // texture coordinates in world space, so the mound's dirt lines up with the floor around it
      const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] + b.x, -(pos[i + 2] + b.z));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const mound = new THREE.Mesh(geo, bumpMat); mound.position.set(b.x, 0, b.z); mound.receiveShadow = true; mound.castShadow = false; mound.frustumCulled = false;
      g.add(mound);
    }
  }

  // ---- puddles: glossy pools lying on the floor, the same lumpy outlines the physics uses
  if (track.puddles && track.puddles.length) {
    const wm = new THREE.MeshStandardMaterial({ color: 0x2f5c78, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    for (const p of track.puddles) {
      const sh = puddleShape(p), pts = [];
      for (let i = 0; i < 48; i++) {
        const th = i / 48 * Math.PI * 2, e = puddleEdge(sh, th), u = Math.cos(th) * sh.a * e, v = Math.sin(th) * sh.b * e;
        pts.push(new THREE.Vector2(u * sh.cos - v * sh.sin, -(u * sh.sin + v * sh.cos)));
      }
      const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), wm);
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, y0 + 0.05, p.z); m.receiveShadow = false; m.frustumCulled = false; g.add(m);
    }
  }

  // ---- the crust: a golden-brown rim round the pizza, along the foot of the wall (where the other roads have their red and white kerb)
  ribbon(A.hw - 4.5, y0 + 0.03, A.hw, y0 + 0.03, std({ map: dirt, color: 0xe0a640, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 6, { receive: true });

  // ---- the crash wall: inner face, top, outer face
  const barrier = barrierTexture(aniso), concrete = cheap({ color: 0xb9b4aa });
  const rIn = A.hw + WALL_GAP, rOut = rIn + WALL_T, top = y0 + Math.min(WALL_HEIGHT - 0.2, 1.05);
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
