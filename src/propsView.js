// Draws the barrels, chickens and scrap metal that props.js simulates.
import * as THREE from 'three';
import { BARREL, CHICKEN, barrelNeedsDraw } from './props.js';
import './chickenBehavior.js';

const PAINT = [new THREE.Color(0xb8351f), new THREE.Color(0xd39b1c)];    // red drums, with the odd yellow one
const HOT = new THREE.Color(3, 2.1, 1.4);                               // over-bright, so a lit drum glows white-hot
const POP_V0 = 5.5, POP_G = 24, POP_DURATION = 0.22;                    // short knocked-up tumble, not a cartoon rocket
const MAX_SMEARS = 2048;                                                // safety cap: far beyond a normal race

/** An oil drum: a lathe profile with two pressed rings and a rolled rim, darker at the ends. */
function drumGeometry() {
  const r = BARREL.radius, h = BARREL.height / 2, k = BARREL.height / 0.9;       // details scale with the drum
  const prof = [[0, -h], [r * 0.9, -h], [r, -h + 0.03 * k], [r, -0.17 * k], [r * 0.95, -0.15 * k], [r, -0.13 * k], [r, 0.13 * k], [r * 0.95, 0.15 * k], [r, 0.17 * k], [r, h - 0.03 * k], [r * 0.9, h], [0, h]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 18);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = Math.abs(pos.getY(i)), end = y > h - 0.06 * k ? 0.55 : 1, ring = Math.abs(y - 0.15 * k) < 0.025 * k ? 0.82 : 1;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = end * ring;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Concatenate a few small geometries (each tinted a solid colour) into one vertex-coloured mesh. No addons needed. */
function mergeParts(parts) {
  let vN = 0, iN = 0;
  for (const { geo } of parts) { vN += geo.attributes.position.count; iN += geo.index ? geo.index.count : geo.attributes.position.count; }
  const pos = new Float32Array(vN * 3), nrm = new Float32Array(vN * 3), col = new Float32Array(vN * 3), idx = new Uint32Array(iN);
  let vOff = 0, iOff = 0;
  for (const { geo, color } of parts) {
    const pa = geo.attributes.position, na = geo.attributes.normal;
    pos.set(pa.array, vOff * 3); nrm.set(na.array, vOff * 3);
    for (let i = 0; i < pa.count; i++) { col[(vOff + i) * 3] = color.r; col[(vOff + i) * 3 + 1] = color.g; col[(vOff + i) * 3 + 2] = color.b; }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) idx[iOff + i] = geo.index.array[i] + vOff;
    else for (let i = 0; i < pa.count; i++) idx[iOff + i] = vOff + i;
    iOff += geo.index ? geo.index.count : pa.count; vOff += pa.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** A proper cartoon chicken: plump body, fanned tail, head with eyes/beak/comb/wattle, and legs. Purely cosmetic. */
function chickenGeometry() {
  const r = CHICKEN.radius;
  const white = new THREE.Color(0xf7f1e6), orange = new THREE.Color(0xe8912e), red = new THREE.Color(0xc23524), dark = new THREE.Color(0x241f1c);
  const parts = [];

  // Broad, faceted shapes remain readable from the driving camera.
  const egg = (x, y, z, sx, sy, sz, color = white, tilt = 0) => {
    const geo = new THREE.SphereGeometry(r, 12, 8);
    geo.scale(sx, sy, sz); geo.rotateX(tilt); geo.translate(x*r, y*r, z*r);
    parts.push({ geo, color });
  };
  egg(0, 1.35, -0.12, 0.95, 1, 1.24);
  for (const side of [-1, 1]) {
    egg(side*0.83, 1.4, -0.18, 0.22, 0.59, 0.8, new THREE.Color(0xe8ddc6), -0.2);
  }
  for (const [x, y, tilt] of [[-0.3,1.9,-0.65],[0,2.1,-0.8],[0.3,1.85,-0.55]]) {
    egg(x, y, -1.18, 0.22, 0.72, 0.16, white, tilt);
  }
  egg(0, 2.55, 0.64, 0.66, 0.73, 0.66);
  for (const side of [-1, 1]) {
    egg(side*0.43, 2.68, 1.12, 0.115, 0.13, 0.095, dark);
    egg(side*0.44, 2.72, 1.195, 0.03, 0.035, 0.02);
  }
  const beak = new THREE.ConeGeometry(r*0.32, r*0.58, 4);
  beak.rotateY(Math.PI/4); beak.scale(1,1,0.7); beak.rotateX(Math.PI/2);
  beak.translate(0,r*2.43,r*1.43); parts.push({geo:beak,color:orange});
  for (const [z,y] of [[0.26,3.2],[0.57,3.28],[0.88,3.19]]) {
    egg(0,y,z,0.14,0.34,0.23,red);
  }
  egg(0,2.03,1.18,0.18,0.36,0.14,red);
  for (const side of [-1,1]) {
    const leg = new THREE.CylinderGeometry(r*0.095,r*0.12,r*0.65,6);
    leg.rotateX(0.15); leg.translate(side*r*0.43,r*0.38,0);
    parts.push({geo:leg,color:orange});
    egg(side*0.43,0.1,0.15,0.21,0.11,0.32,orange);
    for (const toe of [-1,0,1]) {
      egg(side*0.43+toe*0.14,0.075,0.38-Math.abs(toe)*0.05,0.085,0.075,0.26,orange);
    }
  }

  return mergeParts(parts);
}

/** Low-poly irregular patch for a chicken impact. It lies in XY and is rotated onto the road normal per instance. */
function smearGeometry() {
  const radii = [1.00,0.78,1.10,0.83,1.04,0.72,1.08,0.80,1.02,0.76,1.12,0.82,1.00,0.74,1.06,0.79];
  const shape = new THREE.Shape();
  for (let i = 0; i < radii.length; i++) {
    const a = i / radii.length * Math.PI * 2, r = radii[i];
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export class PropsView {
  constructor(scene) {
    this.scene = scene;
    this.drums = null; this.chickens = null; this.bits = null;
    this.drumGeo = drumGeometry();
    this.drumMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
    this.chickenGeo = chickenGeometry();
    this.chickenMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
    this.bitGeo = new THREE.BoxGeometry(1, 1, 1);
    this.bitMat = new THREE.MeshStandardMaterial({ color: 0x3b3a40, roughness: 0.6, metalness: 0.6 });
    this.smearGeo = smearGeometry();
    this.smearMat = new THREE.MeshStandardMaterial({
      color: 0x5b0909, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    this.smearMesh = new THREE.InstancedMesh(this.smearGeo, this.smearMat, MAX_SMEARS);
    this.smearMesh.count = 0; this.smearMesh.receiveShadow = true; this.smearMesh.frustumCulled = false;
    this.scene.add(this.smearMesh);
    this.smears = []; this._smearsDirty = false; this._lastPropsTime = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._normal = new THREE.Vector3(); this._upZ = new THREE.Vector3(0, 0, 1);
    // A bounded pool keeps large chicken groups inexpensive.
    this.burstMeshes = [
      new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 3), new THREE.MeshStandardMaterial({color:0xfff2d8, flatShading:true}), 1536),
      new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshStandardMaterial({color:0xb71918, roughness:0.65}), 1024)
    ];
    for (const mesh of this.burstMeshes) { mesh.count = 0; mesh.frustumCulled = false; this.scene.add(mesh); }
    this._e = new THREE.Euler();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  clearSmears(props = null) {
    this.smears.length = 0; this.smearMesh.count = 0; this._smearsDirty = true;
    if (props) for (const c of props.chickens) c._smearRecordedView = false;
  }

  /** Capture each impact once. Marks persist until the race/track resets, independently of chicken respawns. */
  recordChickenSmears(props) {
    for (let i = 0; i < props.chickens.length; i++) {
      const c = props.chickens[i];
      if (c.deadT < 0) { c._smearRecordedView = false; continue; }
      if (c._smearRecordedView) continue;
      c._smearRecordedView = true;

      const seed = (i + 1) * 91.73 + this.smears.length * 37.19 + props.time * 11.7;
      const rand = n => { const v = Math.sin(seed + n * 29.13) * 43758.5453; return v - Math.floor(v); };
      const ny = Number.isFinite(c.ny) ? c.ny : 1;
      const len = Math.hypot(c.nx || 0, ny, c.nz || 0) || 1;
      this.smears.push({
        x: c.pos.x, y: c.pos.y, z: c.pos.z,
        nx: (c.nx || 0) / len, ny: ny / len, nz: (c.nz || 0) / len,
        angle: rand(1) * Math.PI * 2,
        sx: 0.48 + rand(2) * 0.28,
        sy: 0.24 + rand(3) * 0.18,
      });
      if (this.smears.length > MAX_SMEARS) this.smears.shift();
      this._smearsDirty = true;
    }
  }

  updateSmears(force = false) {
    if (!force && !this._smearsDirty) return;
    let n = 0;
    for (const s of this.smears) {
      this._normal.set(s.nx, s.ny, s.nz).normalize();
      this._p.set(s.x + s.nx * 0.012, s.y + s.ny * 0.012, s.z + s.nz * 0.012);
      this._q.setFromUnitVectors(this._upZ, this._normal);
      this._q2.setFromAxisAngle(this._upZ, s.angle);
      this._q.multiply(this._q2);
      this._s.set(s.sx, s.sy, 1);
      this._m.compose(this._p, this._q, this._s);
      this.smearMesh.setMatrixAt(n++, this._m);
    }
    this.smearMesh.count = n;
    this.smearMesh.instanceMatrix.needsUpdate = true;
    this._s.set(1, 1, 1);
    this._smearsDirty = false;
  }

  /** (Re)build the instanced meshes for the barrels and chickens a Props currently holds. */
  build(props) {
    if (this.drums) { this.scene.remove(this.drums); this.drums.dispose(); this.drums = null; }
    if (this.chickens) { this.scene.remove(this.chickens); this.chickens.dispose(); this.chickens = null; }
    this.clearSmears(props);
    this._lastPropsTime = props.time;
    const n = props.barrels.length;
    if (n) {
      const im = this.drums = new THREE.InstancedMesh(this.drumGeo, this.drumMat, n);
      props.barrels.forEach((b, i) => im.setColorAt(i, PAINT[b.paint]));
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      this.scene.add(im);
    }
    const nc = props.chickens.length;
    if (nc) {
      const cm = this.chickens = new THREE.InstancedMesh(this.chickenGeo, this.chickenMat, nc);
      cm.castShadow = true; cm.receiveShadow = true; cm.frustumCulled = false;
      this.scene.add(cm);
    }
    if (!this.bits) {
      const bm = this.bits = new THREE.InstancedMesh(this.bitGeo, this.bitMat, props.bits.length);
      bm.castShadow = true; bm.frustumCulled = false; bm.count = 0; this.scene.add(bm);
    }
    this.update(props, true);
  }

  updateChickenBursts(props) {
    const counts = [0, 0];
    for (let i = 0; i < props.chickens.length; i++) {
      const c = props.chickens[i], t = c.deadT;
      if (t < 0 || t > 3.2) continue;
      for (let kind = 0; kind < 2; kind++) {
        const mesh = this.burstMeshes[kind], amount = kind === 0 ? 36 : 24;
        for (let j = 0; j < amount && counts[kind] < mesh.instanceMatrix.count; j++) {
          // Stable per-chicken variation: no frame-dependent random jitter.
          const seed = (i+1)*73.17 + j*19.31 + kind*8.7;
          const rand = n => { const v = Math.sin(seed+n*31.7)*43758.5453; return v-Math.floor(v); };
          const angle = rand(1)*Math.PI*2, speed = 1.5+rand(2)*4;
          const up = 6+rand(3)*5, gravity = kind === 0 ? 7 : 17;
          const flight = kind === 0 ? (1-Math.exp(-t*1.4))/1.4 : t;
          const height = 0.65+up*t-0.5*gravity*t*t;
          const fade = Math.min(1,(3.2-t)/0.65);
          this._p.set(c.pos.x+Math.cos(angle)*speed*flight,
            c.pos.y+Math.max(kind === 0 ? 0.04 : 0.015,height),
            c.pos.z+Math.sin(angle)*speed*flight);
          if (kind === 0) {
            this._p.x += Math.sin(t*9+seed)*0.16*t;
            this._e.set(seed+t*7,seed+t*3,Math.sin(t*10+seed));
            this._s.set(0.055*fade, (0.16+rand(4)*0.14)*fade,0.018*fade);
          } else {
            this._e.set(0,angle,0);
            const size = (0.055+rand(4)*0.09)*fade;
            this._s.set(size*(height<0?2.7:1),size*(height<0?0.12:1.6),size*(height<0?2:1));
          }
          this._q.setFromEuler(this._e); this._m.compose(this._p,this._q,this._s);
          mesh.setMatrixAt(counts[kind]++,this._m);
        }
      }
    }
    this.burstMeshes.forEach((mesh,k) => {mesh.count=counts[k]; mesh.instanceMatrix.needsUpdate=true;});
    this._s.set(1,1,1);
  }

  update(props, force = false) {
    // Props.time restarts from zero with a race reset. Clear old road marks only then, never on chicken respawn.
    if (props.time + 0.001 < this._lastPropsTime) this.clearSmears(props);
    this._lastPropsTime = props.time;
    this.recordChickenSmears(props);
    this.updateSmears(force);
    this.updateChickenBursts(props);
    const im = this.drums;
    if (im) {
      let dirty = force;
      let paint = false;
      props.barrels.forEach((b, i) => {
        // a lit drum blinks white-hot, faster and faster is not needed: the fuse is short
        const want = b.alive && b.fuse >= 0 && Math.floor(b.fuse * 12) % 2 === 0 ? 1 : 0;
        if (b._col !== want) { im.setColorAt(i, want ? HOT : PAINT[b.paint]); b._col = want; paint = true; }
        const settled = (!b.alive || b.asleep) && b.fuse < 0;                  // hasn't moved since it was last drawn
        if (!barrelNeedsDraw(b, force)) return;
        if (b.alive) { this._p.set(b.pos.x, b.pos.y, b.pos.z); this._q.set(b.q.x, b.q.y, b.q.z, b.q.w); this._m.compose(this._p, this._q, this._s); im.setMatrixAt(i, this._m); }
        else im.setMatrixAt(i, this._zero);
        b._drawn = settled; b._shown = b.alive; dirty = true;
      });
      if (dirty) im.instanceMatrix.needsUpdate = true;
      if (paint && im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    const cm = this.chickens;
    if (cm) {
      props.chickens.forEach((c, i) => {
        if (c.deadT >= 0) {
          const t = c.deadT;
          if (t > POP_DURATION) { cm.setMatrixAt(i, this._zero); return; }
          const h = POP_V0 * t - 0.5 * POP_G * t * t;                      // a short impact tumble, then gone
          this._p.set(c.pos.x, c.pos.y + Math.max(0, h), c.pos.z);
          this._e.set(t * 24, t * 16, t * 10);
          this._q.setFromEuler(this._e);                                  // tumbling
          this._m.compose(this._p, this._q, this._s); cm.setMatrixAt(i, this._m);
          return;
        }
        if (!c.alive) { cm.setMatrixAt(i, this._zero); return; }

        const moving = c.state === 'walk' || c.state === 'flee';
        const pace = c.state === 'flee' ? 13 : 7;
        const phase = props.time * pace + c.bob;
        const bob = moving ? Math.abs(Math.sin(phase)) * (c.state === 'flee' ? 0.045 : 0.025) : 0;
        const roll = moving ? Math.sin(phase) * (c.state === 'flee' ? 0.18 : 0.11) : 0;
        let pitch = 0, yaw = c.heading || 0;

        if (c.state === 'peck') {
          const peck = 0.5 + 0.5 * Math.sin(props.time * 12 + c.bob);
          pitch = 0.2 + peck * 0.5;
        } else if (c.state === 'look') {
          yaw += Math.sin(props.time * 4.5 + c.bob) * 0.42;
        } else if (c.state === 'freeze') {
          pitch = -0.06;
        }

        this._p.set(c.pos.x, c.pos.y + bob, c.pos.z);
        this._e.set(pitch, yaw, roll, 'XYZ');
        this._q.setFromEuler(this._e);
        this._m.compose(this._p, this._q, this._s); cm.setMatrixAt(i, this._m);
      });
      cm.instanceMatrix.needsUpdate = true;
    }
    const bm = this.bits;
    if (bm) {
      let n = 0;
      for (const p of props.bits) {
        if (p.life <= 0) continue;
        const k = Math.min(1, p.life);                                         // shrink away over the last second
        this._p.set(p.pos.x, p.pos.y, p.pos.z); this._q.set(p.q.x, p.q.y, p.q.z, p.q.w); this._s.set(p.sx * k, p.sy * k, p.sz * k);
        this._m.compose(this._p, this._q, this._s); bm.setMatrixAt(n++, this._m);
      }
      this._s.set(1, 1, 1);
      bm.count = n; bm.instanceMatrix.needsUpdate = true;
    }
  }
}
