// Draws the buildings (and tunnels) placed in the editor. The parts come from buildings.js, the same ones the solid blocks are made from,
// so what you see is what you hit. Eight looks: brick, concrete, glass, sandstone and so on, each with its own rows of windows.
import * as THREE from 'three';
import { Track, rampAt } from './track.js';

// The same look as the skyline behind the track: dark, muted blocks with warm lit windows. Eight muted body colours.
export const BODY = ['#3a3550', '#4a4540', '#35465a', '#5a4a42', '#2f4a4a', '#553c48', '#4d5260', '#403a30'];
const cache = new Map();
/** A tile of windows 16 across and 16 down: `map` darkens the window slots, `lit` glows in a third or so of them (emissive, like the skyline). */
function facade(style) {
  let t = cache.get(style); if (t) return t;
  let seed = 7919 + style * 104729; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mk = (draw) => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; draw(c.getContext('2d')); const x = new THREE.CanvasTexture(c); x.colorSpace = THREE.SRGBColorSpace; x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 4; return x; };
  const cells = []; for (let r = 0; r < 16; r++) for (let k = 0; k < 16; k++) cells.push([k * 8 + 2, r * 8 + 1, rnd() < 0.3, rnd() < 0.8 ? '#ffc866' : '#ff8a5c']);
  const map = mk((g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#22202c'; for (const [x, y] of cells) g.fillRect(x, y, 4, 5); });
  const lit = mk((g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128); for (const [x, y, on, col] of cells) if (on) { g.fillStyle = col; g.fillRect(x, y, 4, 5); } });
  t = { map, lit }; cache.set(style, t); return t;
}

/** A group with every building of the track. `track.buildings` is the layout (buildings.js). */
export function buildBuildings(track) {
  const grp = new THREE.Group(), list = track.buildings || [];
  if (track.ramps) grp.add(buildRamps(track));
  for (const b of list) {
    const body = new THREE.Color(BODY[b.style % BODY.length]), base = facade(b.style), roofMat = new THREE.MeshStandardMaterial({ color: body.clone().multiplyScalar(0.55), roughness: 0.95 }), dark = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 1 });
    const holder = new THREE.Group(); holder.position.set(b.x, 0, b.z); holder.rotation.y = b.th; grp.add(holder);      // (the layout's frame: u across (+x), v along (+z), turned by th)
    for (const q of b.parts) {
      const W = q.u1 - q.u0, D = q.v1 - q.v0, H = q.h, face = (across, tall) => {
        const m = new THREE.MeshStandardMaterial({ color: body, map: base.map.clone(), emissive: 0xffffff, emissiveMap: base.lit.clone(), emissiveIntensity: 0.8, roughness: 1 });
        const rx = Math.max(1, across / 16), ry = Math.max(1, tall / 16);            // (a tile 16 m across and tall: a window about 1 m wide)
        for (const k of ['map', 'emissiveMap']) { m[k].needsUpdate = true; m[k].repeat.set(rx, ry); }
        return m;
      };
      const mats = [face(D, H), face(D, H), roofMat, dark, face(W, H), face(W, H)];            // +x, -x, roof, underside, +z, -z
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), mats);
      mesh.position.set((q.u0 + q.u1) / 2, q.y + H / 2, (q.v0 + q.v1) / 2); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; holder.add(mesh);
    }
    if (b.tunnel) {                                                                               // a dark strip of ceiling lamps down the middle of the tunnel
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, b.d - 2), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
      lamp.position.set(0, b.parts[2].y - 0.12, 0); lamp.frustumCulled = false; holder.add(lamp);
    }
  }
  return grp;
}

/** The ramps dropped on the road: a wedge following the road under it, hazard-striped along its sides and lip. The car's own height comes from track.query (track.js rampAt), the same numbers. */
function buildRamps(track) {
  const grp = new THREE.Group(), q = Track.newQuery(), tmp = { h: 0, gx: 0, gz: 0 };
  const tex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#6f6d68'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#ffc21a'; for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 16, 64); g.lineTo(i * 16 + 8, 64); g.lineTo(i * 16 + 40, 0); g.lineTo(i * 16 + 32, 0); g.closePath(); g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const top = new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 0.9 }), side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
  const base = (x, z, y0) => { track.query(x, y0 + 14, z, q, 3); const y = q.idx >= 0 ? q.y : y0; rampAt(track.ramps, x, z, tmp); return y - tmp.h; };      // (the road's own height: the car's query already includes the ramp)
  for (const r of track.ramps) {
    const n = Math.max(4, Math.round(r.half * 2 / 2)), L = r.half * 2, pos = [], idx = [], uv = [];
    const pt = (u, v) => [r.x + (u - r.half) * r.sn + v * r.cs, r.z + (u - r.half) * r.cs - v * r.sn];
    const y0 = base(r.x, r.z, 0);
    for (let i = 0; i <= n; i++) for (const v of [-r.hw, r.hw]) { const u = L * i / n, [x, z] = pt(u, v), b = base(x, z, y0); pos.push(x, b + r.h * u / L + 0.04, z, x, b - 0.05, z); uv.push(v < 0 ? 0 : 1, u / 4, v < 0 ? 0 : 1, u / 4); }
    const A = (i, s2, k) => (i * 2 + s2) * 2 + k;           // vertex: segment i, side s2 (0 left, 1 right), k (0 top, 1 bottom)
    const T = [], S = idx;
    for (let i = 0; i < n; i++) {
      T.push(A(i, 0, 0), A(i + 1, 0, 0), A(i, 1, 0), A(i, 1, 0), A(i + 1, 0, 0), A(i + 1, 1, 0));                                     // the top
      for (const s2 of [0, 1]) S.push(A(i, s2, 0), A(i, s2, 1), A(i + 1, s2, 0), A(i + 1, s2, 0), A(i, s2, 1), A(i + 1, s2, 1));      // the two sides
    }
    S.push(A(n, 0, 0), A(n, 0, 1), A(n, 1, 0), A(n, 1, 0), A(n, 0, 1), A(n, 1, 1));                                                    // the sheer lip at the high end
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); const all = [...T, ...S]; geo.setIndex(all);
    geo.addGroup(0, T.length, 0); geo.addGroup(T.length, S.length, 1); geo.computeVertexNormals();                // (group 0 is the grey top, group 1 the striped sides and lip)
    const m = new THREE.Mesh(geo, [top, side]); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; grp.add(m);
  }
  return grp;
}
