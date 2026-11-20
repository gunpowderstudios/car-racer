// Draws the fire pits (see firePits.js): a scorched ring with glowing embers, a warning flicker, then a column of flame. The same look as Apple Crumple's.
import * as THREE from 'three';
import { COURSE, fireAt } from './assault.js';

export class FirePitView {
  constructor(scene) { this.scene = scene; this.group = new THREE.Group(); this.group.frustumCulled = false; scene.add(this.group); this.items = []; }

  load(pits) {
    for (const it of this.items) this.group.remove(it.g);
    this.items = []; const F = COURSE.fire;
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1816, roughness: 0.95 });
    for (const p of pits.pits) {
      const g = new THREE.Group(); g.position.set(p.x, p.y, p.z);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(F.r * 0.85, F.r * 0.95, 0.35, 20), dark); rim.position.y = 0.12; rim.receiveShadow = true; rim.frustumCulled = false;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(F.r * 0.72, 20), new THREE.MeshBasicMaterial({ color: 0x551100 })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.32; glow.frustumCulled = false;
      const flame = new THREE.Group(); flame.position.y = 0.3; flame.visible = false;
      const layers = [[1.0, 0xff4a0a, 0.85], [0.68, 0xff9d1a, 0.9], [0.38, 0xffe27a, 0.95]].map(([k, c, o]) => {
        const m = new THREE.Mesh(new THREE.ConeGeometry(F.r * k, 1, 14, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        m.position.y = 0.5; m.frustumCulled = false; flame.add(m); return m;
      });
      g.add(rim, glow, flame); this.group.add(g); this.items.push({ p, g, glow, flame, layers });
    }
  }

  update(pits) {
    const t = pits.t, F = COURSE.fire;
    for (const o of this.items) {
      const st = fireAt(o.p, t, F);
      o.glow.material.color.setHex(st.state === 'warn' ? (Math.sin(t * 40) > 0 ? 0xff6a10 : 0xaa2200) : st.state === 'burst' ? 0xffd060 : 0x551100);
      o.flame.visible = st.state !== 'idle';
      if (st.state === 'warn') { const h = 0.8 + st.k * 1.6; o.layers.forEach((m, i) => { m.scale.y = h * (1 - i * 0.2); m.scale.x = m.scale.z = 0.6 + 0.25 * Math.sin(t * 30 + i); m.position.y = m.scale.y / 2; }); }
      else if (st.state === 'burst') {
        const rise = Math.min(1, st.k * 4), fall = st.k > 0.7 ? 1 - (st.k - 0.7) / 0.3 : 1, h = F.height * rise * (0.3 + 0.7 * fall);
        o.layers.forEach((m, i) => { m.scale.y = Math.max(0.1, h * (1 - i * 0.15)); m.scale.x = m.scale.z = (0.85 + 0.15 * Math.sin(t * 25 + i * 2)) * (1 - i * 0.05); m.position.y = m.scale.y / 2; });
      }
    }
  }
}
