// Traffic lights, zebra crossings and the people on them, drawn from signals.js's layout (track.def.props of type 'lights' and 'crossing').
import * as THREE from 'three';
import { signalLayout, signalState, carState, walkFraction, signalClock } from './signals.js';

const POLE = new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.7 });
const HEAD = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.8 });
const WHITE = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const lamp = (c) => new THREE.MeshBasicMaterial({ color: c });
const OFF = { red: 0x3a1210, amber: 0x3a2a08, green: 0x0e2e17 }, ON = { red: 0xff3b2e, amber: 0xffb81f, green: 0x35e07a };
const SHIRTS = [0xd94f4f, 0x3f7fd9, 0xe0b53a, 0x4aa86b, 0x9a5fc8];

/** Returns { group, update() } for a track, or null when it has no signals. update() sets every lamp and walks the people for the current time. */
export function buildSignals(track) {
  const list = signalLayout(track); if (!list.length) return null;
  const group = new THREE.Group(), lamps = [], walkers = [];
  const box = (w, h, d, mat, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.frustumCulled = false; parent.add(m); return m; };
  list.forEach((sg, idx) => {
    const g = new THREE.Group(); g.position.set(sg.x, sg.y, sg.z); g.rotation.y = Math.atan2(sg.fx, sg.fz); group.add(g);          // (local +z is the way the road runs, +x is the road's left... see below)
    const left = new THREE.Vector3(sg.lx, 0, sg.lz), fwd = new THREE.Vector3(sg.fx, 0, sg.fz);
    const sgn = Math.sign(left.x * fwd.z - left.z * fwd.x) || 1;                 // which way local +x lies compared with the road's left
    const side = (hwOff) => hwOff * sgn;                                         // local x for a spot hwOff metres to the road's left
    if (sg.kind === 'lights') {
      box(sg.hw * 2, 0.05, 0.5, WHITE, 0, 0.04, 0, g);                            // the stop line
      for (const sd of [1, -1]) {                                                 // a pole at each kerb with its lights facing the oncoming traffic
        const x = side(sd * (sg.hw + 1.2)), pole = box(0.18, 4.2, 0.18, POLE, x, 2.1, 1.5, g);
        const head = box(0.7, 1.9, 0.5, HEAD, x, 4.1, 1.5, g), set = {};
        for (const [k, dy] of [['red', 0.62], ['amber', 0], ['green', -0.62]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), lamp(OFF[k])); m.position.set(0, dy, -0.28); m.frustumCulled = false; head.add(m); set[k] = m; }
        lamps.push({ idx, set });
      }
    } else {
      const n = Math.max(6, Math.round(sg.hw * 2 / 1.0)); const w = sg.hw * 2 / n;
      for (let i = 0; i < n; i += 2) box(w, 0.05, 4, WHITE, -sg.hw + (i + 0.5) * w, 0.04, 0, g);          // zebra stripes along the way the cars drive
      for (const sd of [1, -1]) {                                                 // a striped beacon pole with an amber globe at each kerb
        const x = side(sd * (sg.hw + 1.0)), pole = box(0.16, 2.6, 0.16, new THREE.MeshStandardMaterial({ color: 0xeeeeee }), x, 1.3, -2.6, g);
        for (let k = 0; k < 4; k++) box(0.18, 0.2, 0.18, new THREE.MeshStandardMaterial({ color: 0x15161a }), x, 0.35 + k * 0.55, -2.6, g);
        const gl = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), lamp(0xffb81f)); gl.position.set(x, 2.8, -2.6); gl.frustumCulled = false; g.add(gl); lamps.push({ idx, globe: gl });
      }
      for (let k = 0; k < 3; k++) {                                               // three people who walk across while the traffic waits
        const p = new THREE.Group(), shirt = new THREE.MeshStandardMaterial({ color: SHIRTS[(idx * 3 + k) % SHIRTS.length] });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.0, 10), shirt); body.position.y = 0.95; p.add(body);
        const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0x2a2d3a })); legs.position.y = 0.3; p.add(legs);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe0b896 })); head.position.y = 1.6; p.add(head);
        for (const m of [body, legs, head]) { m.castShadow = true; m.frustumCulled = false; }
        p.visible = false; g.add(p); walkers.push({ idx, p, k, dir: k % 2 ? 1 : -1, lane: -1.2 + k * 1.2, sg });
      }
    }
  });
  const update = () => {
    const t = signalClock.t;
    for (const l of lamps) {
      const sg = list[l.idx];
      if (l.set) { const st = carState(list, sg, t); for (const k of ['red', 'amber', 'green']) l.set[k].material.color.setHex(st === k ? ON[k] : OFF[k]); }
      else if (l.globe) { const w = walkFraction(list, sg, t) >= 0; l.globe.material.color.setHex(w && Math.floor(t * 2) % 2 ? 0xffe9a0 : w ? 0xffb81f : 0x6a4a10); }
    }
    for (const w of walkers) {
      const f = walkFraction(list, w.sg, t); w.p.visible = f >= 0 && f < 1;
      if (!w.p.visible) continue;
      const span = w.sg.hw + 1.4, u = w.dir > 0 ? f : 1 - f;
      const sgn = Math.sign(w.sg.lx * w.sg.fz - w.sg.lz * w.sg.fx) || 1;
      w.p.position.set(sgn * (-span + 2 * span * u), Math.abs(Math.sin(t * 7 + w.k)) * 0.06, w.lane);
      w.p.rotation.y = w.dir > 0 ? -Math.PI / 2 * sgn : Math.PI / 2 * sgn;
    }
  };
  update();
  return { group, update };
}
