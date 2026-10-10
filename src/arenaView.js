// Draws The Oval's open arena: a dirt floor, a crash wall, banked stands full of spectators and floodlights.
// The shape comes from arena.js, the same numbers the physics uses, so the wall you see is the wall you hit.
import * as THREE from 'three';
import { arenaInfo, arenaOutline } from './arena.js';
import { WALL_GAP, WALL_T, WALL_HEIGHT } from './track.js';
import { dirtTexture, crowdTexture, barrierTexture, kerbTexture } from './textures.js';

const N = 96;              // points round the outline
const TIERS = 7, RISE = 1.5, TREAD = 2.6, APRON_W = 2.4;

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
  const cheap = (opts) => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, ...opts });      // the stands are far away: no need for full PBR shading

  // ---- the floor
  const rFloor = A.hw + WALL_GAP + WALL_T;
  const shape = new THREE.Shape(outline(rFloor).map((p) => new THREE.Vector2(p.x, -p.z)));
  const dirt = dirtTexture(aniso); dirt.repeat.set(1 / 24, 1 / 24);
  const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), std({ map: dirt, roughness: 1 }));
  floor.position.y = y0; floor.receiveShadow = true; floor.frustumCulled = false;
  g.add(floor);

  // ---- the standard red and white kerb stripe along the foot of the wall, as on the other roads
  const kerb = kerbTexture(aniso);
  ribbon(A.hw - 1.6, y0 + 0.03, A.hw, y0 + 0.03, std({ map: kerb, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 4, { receive: true });

  // ---- the crash wall: inner face, top, outer face
  const barrier = barrierTexture(aniso), concrete = cheap({ color: 0xb9b4aa });
  const rIn = A.hw + WALL_GAP, rOut = rIn + WALL_T, top = y0 + Math.min(WALL_HEIGHT - 0.2, 1.05);
  ribbon(rIn, y0, rIn, top, std({ map: barrier, roughness: 0.8 }), 8, { cast: true, receive: true });
  ribbon(rIn, top, rOut, top, concrete, 8, { receive: true });
  ribbon(rOut, top, rOut, y0, concrete, 8);

  // ---- apron, then the stands
  const grey = cheap({ color: 0x77727c }), crowd = cheap({ map: crowdTexture(aniso), emissive: 0x2a2a3a });
  crowd.map.repeat.set(1, 1);
  ribbon(rOut, y0, rOut + APRON_W, y0, grey, 8);
  let r = rOut + APRON_W;
  for (let t = 0; t < TIERS; t++) {
    const h0 = y0 + t * RISE, h1 = h0 + RISE;
    ribbon(r, h0, r, h1, crowd, 6);                    // the riser faces the arena and carries the spectators
    ribbon(r, h1, r + TREAD, h1, grey, 8);             // the tread behind it
    r += TREAD;
  }
  ribbon(r, y0 + TIERS * RISE, r, -0.4, grey, 8);      // the back of the stand, down to the grass
  const rBack = r;

  // ---- floodlights on tall pylons round the back of the stands
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
