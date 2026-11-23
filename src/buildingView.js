// Draws the buildings (and tunnels) placed in the editor. The parts come from buildings.js, the same ones the solid blocks are made from,
// so what you see is what you hit. Eight looks: brick, concrete, glass, sandstone and so on, each with its own rows of windows.
import * as THREE from 'three';

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
