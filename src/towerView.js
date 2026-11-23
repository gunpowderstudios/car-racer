// The Crystal Palace transmitting tower (props of type 'tower'): a tall tapering lattice mast with platforms, a slim upper shaft, and the white aerial on top.
// Proportions follow the real tower; `h` is the height of its tip in metres. It is scenery, so it is not solid.
import * as THREE from 'three';

const STEEL = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.75, metalness: 0.25, flatShading: true });
const WHITE = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.6 });

/** Appends a square-section beam from a to b (half thickness r) to the vertex and index lists. */
function beam(pos, idx, a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a); if (d.lengthSq() < 1e-6) return;
  const dir = d.clone().normalize(), up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(dir, up).normalize().multiplyScalar(r), v = new THREE.Vector3().crossVectors(dir, u).normalize().multiplyScalar(r);
  const base = pos.length / 3;
  for (const p of [a, b]) for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pos.push(p.x + u.x * su + v.x * sv, p.y + u.y * su + v.y * sv, p.z + u.z * su + v.z * sv);
  for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; idx.push(base + k, base + k2, base + 4 + k2, base + k, base + 4 + k2, base + 4 + k); }
}

/** One tower, with its foot at the origin and its tip `h` metres up. */
export function towerMesh(h) {
  const pos = [], idx = [], S = h / 328, V = (x, y, z) => new THREE.Vector3(x, y, z);
  const b0 = 0.11 * h, b1 = 0.017 * h, topLat = 0.62 * h;
  const half = (y) => b1 + (b0 - b1) * Math.pow(Math.max(0, 1 - y / topLat), 1.6);       // the legs lean in more and more steeply as they climb
  const levels = [0, 0.05, 0.12, 0.2, 0.29, 0.36, 0.45, 0.54, 0.62].map((f) => f * h);
  const corner = (y, k) => { const w = half(y), sx = k === 0 || k === 3 ? -1 : 1, sz = k < 2 ? -1 : 1; return V(sx * w, y, sz * w); };
  for (let i = 0; i < levels.length; i++) {
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4, a = corner(levels[i], k), b = corner(levels[i], k2);
      beam(pos, idx, a, b, 0.7 * S);                                                         // the ring round this level
      if (i + 1 < levels.length) {
        const c = corner(levels[i + 1], k), d = corner(levels[i + 1], k2);
        beam(pos, idx, a, c, 1.1 * S);                                                       // the leg
        beam(pos, idx, a, d, 0.45 * S); beam(pos, idx, b, c, 0.45 * S);                      // the cross bracing on this face
      }
    }
  }
  for (const f of [0.2, 0.29, 0.36, 0.62]) {                                                // the big platforms, a little wider than the tower at that height
    const y = f * h, w = half(y) * 1.25;
    for (let k = 0; k < 4; k++) { const a = V(k === 0 || k === 3 ? -w : w, y, k < 2 ? -w : w), k2 = (k + 1) % 4, b = V(k2 === 0 || k2 === 3 ? -w : w, y, k2 < 2 ? -w : w); beam(pos, idx, a, b, 1.6 * S); }
  }
  beam(pos, idx, V(0, 0, 0), V(0, 0.9 * h, 0), 0.9 * S);                                    // the mast up the middle
  const shaft = [0.62, 0.7, 0.78, 0.86].map((f) => f * h), sw = (y) => 0.0085 * h - 0.0035 * h * ((y - topLat) / (0.24 * h));
  for (let i = 0; i < shaft.length; i++) for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4, w = sw(shaft[i]), cr = (y, kk) => V(kk === 0 || kk === 3 ? -sw(y) : sw(y), y, kk < 2 ? -sw(y) : sw(y));
    beam(pos, idx, cr(shaft[i], k), cr(shaft[i], k2), 0.35 * S);
    if (i + 1 < shaft.length) { beam(pos, idx, cr(shaft[i], k), cr(shaft[i + 1], k), 0.5 * S); beam(pos, idx, cr(shaft[i], k), cr(shaft[i + 1], k2), 0.25 * S); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); geo.computeBoundingSphere();
  const g = new THREE.Group(), steel = new THREE.Mesh(geo, STEEL); steel.frustumCulled = false; g.add(steel);
  const aerial = new THREE.Mesh(new THREE.CylinderGeometry(0.0062 * h, 0.0062 * h, 0.07 * h, 14), WHITE); aerial.position.y = 0.9 * h + 0.035 * h; aerial.frustumCulled = false; g.add(aerial);
  const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.0006 * h, 0.0022 * h, 0.07 * h, 8), WHITE); spike.position.y = 0.97 * h + 0.03 * h; spike.frustumCulled = false; g.add(spike);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.004 * h, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); lamp.position.y = h; lamp.frustumCulled = false; g.add(lamp);
  return g;
}

/** All the towers of a track, or null if it has none. */
export function buildTowers(track) {
  const list = (track?.def?.props || []).filter((p) => p.type === 'tower'); if (!list.length) return null;
  const grp = new THREE.Group();
  for (const p of list) { const t = towerMesh(p.h || 328); t.position.set(p.x, p.y || 0, p.z); grp.add(t); }
  return grp;
}
