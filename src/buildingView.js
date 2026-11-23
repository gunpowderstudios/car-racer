// Draws the buildings (and tunnels) placed in the editor. The parts come from buildings.js, the same ones the solid blocks are made from,
// so what you see is what you hit. Eight looks: brick, concrete, glass, sandstone and so on, each with its own rows of windows.
import * as THREE from 'three';

const LOOKS = [
  { wall: '#a2543a', win: '#2c3a4a', lit: '#ffd98a', roof: '#4b4b50', trim: '#7e3d2a' },     // brick
  { wall: '#9a9a96', win: '#25303a', lit: '#cfe8ff', roof: '#55555a', trim: '#7a7a76' },     // concrete
  { wall: '#3e6a86', win: '#16232d', lit: '#9fd8ff', roof: '#2e3a44', trim: '#2c4a5e' },     // glass tower
  { wall: '#c9b48a', win: '#41372a', lit: '#ffe2a0', roof: '#6a5f4a', trim: '#a8946a' },     // sandstone
  { wall: '#8e4a58', win: '#2a2030', lit: '#ffc1d0', roof: '#4a3540', trim: '#6e3441' },     // plum
  { wall: '#5f7a58', win: '#1f2a20', lit: '#d6ffb8', roof: '#3a4a36', trim: '#46603f' },     // green
  { wall: '#d7d3c4', win: '#303a44', lit: '#fff0b8', roof: '#807c70', trim: '#b4b09e' },     // cream
  { wall: '#394352', win: '#10151c', lit: '#ffcf70', roof: '#262d38', trim: '#2a323e' },     // dark office
];

const cache = new Map();
function facade(style) {
  const look = LOOKS[style % LOOKS.length]; let t = cache.get(style); if (t) return t;
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = look.wall; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(0,0,0,${0.02 + (i % 4) * 0.01})`; g.fillRect((i * 37) % 128, (i * 53) % 128, 14, 2); }
  const lit = (r, k) => ((r * 7 + k * 13 + style * 5) % 5) < 2;            // (a scatter of lit windows)
  for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) { g.fillStyle = look.trim; g.fillRect(k * 64 + 10, r * 64 + 10, 44, 44); g.fillStyle = lit(r, k) ? look.lit : look.win; g.fillRect(k * 64 + 13, r * 64 + 13, 38, 38); g.fillStyle = look.trim; g.fillRect(k * 64 + 31, r * 64 + 13, 3, 38); }
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; cache.set(style, t); return t;
}

/** A group with every building of the track. `track.buildings` is the layout (buildings.js). */
export function buildBuildings(track) {
  const grp = new THREE.Group(), list = track.buildings || [];
  for (const b of list) {
    const look = LOOKS[b.style % LOOKS.length], base = facade(b.style), roofMat = new THREE.MeshStandardMaterial({ color: look.roof, roughness: 0.95 }), dark = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 1 });
    const holder = new THREE.Group(); holder.position.set(b.x, 0, b.z); holder.rotation.y = b.th; grp.add(holder);      // (the layout's frame: u across (+x), v along (+z), turned by th)
    for (const q of b.parts) {
      const W = q.u1 - q.u0, D = q.v1 - q.v0, H = q.h, face = (across, tall) => {
        const m = new THREE.MeshStandardMaterial({ map: base.clone(), roughness: 0.85 });
        m.map.needsUpdate = true; m.map.repeat.set(Math.max(1, Math.round(across / 6)), Math.max(1, Math.round(tall / 4)));
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
