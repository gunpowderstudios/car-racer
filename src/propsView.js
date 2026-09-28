// Draws the barrels, chickens and scrap metal that props.js simulates.
import * as THREE from 'three';
import { BARREL, CHICKEN, barrelNeedsDraw } from './props.js';
import './chickenBehavior.js';

const PAINT = [new THREE.Color(0xb8351f), new THREE.Color(0xd39b1c)];
const HOT = new THREE.Color(3, 2.1, 1.4);
const POP_V0 = 5.5, POP_G = 24, POP_DURATION = 0.22;
const MAX_SMEARS = 2048;

function drumGeometry() {
  const r = BARREL.radius, h = BARREL.height / 2, k = BARREL.height / 0.9;
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

function chickenGeometry() {
  const r = CHICKEN.radius;
  const white = new THREE.Color(0xf7f1e6), orange = new THREE.Color(0xe8912e), red = new THREE.Color(0xc23524), dark = new THREE.Color(0x241f1c);
  const parts = [];
  const egg = (x, y, z, sx, sy, sz, color = white, tilt = 0) => {
    const geo = new THREE.SphereGeometry(r, 12, 8);
    geo.scale(sx, sy, sz); geo.rotateX(tilt); geo.translate(x*r, y*r, z*r);
    parts.push({ geo, color });
  };
  egg(0, 1.35, -0.12, 0.95, 1, 1.24);
  for (const side of [-1, 1]) egg(side*0.83, 1.4, -0.18, 0.22, 0.59, 0.8, new THREE.Color(0xe8ddc6), -0.2);
  for (const [x, y, tilt] of [[-0.3,1.9,-0.65],[0,2.1,-0.8],[0.3,1.85,-0.55]]) egg(x, y, -1.18, 0.22, 0.72, 0.16, white, tilt);
  egg(0, 2.55, 0.64, 0.66, 0.73, 0.66);
  for (const side of [-1, 1]) {
    egg(side*0.43, 2.68, 1.12, 0.115, 0.13, 0.095, dark);
    egg(side*0.44, 2.72, 1.195, 0.03, 0.035, 0.02);
  }
  const beak = new THREE.ConeGeometry(r*0.32, r*0.58, 4);
  beak.rotateY(Math.PI/4); beak.scale(1,1,0.7); beak.rotateX(Math.PI/2);
  beak.translate(0,r*2.43,r*1.43); parts.push({geo:beak,color:orange});
  for (const [z,y] of [[0.26,3.2],[0.57,3.28],[0.88,3.19]]) egg(0,y,z,0.14,0.34,0.23,red);
  egg(0,2.03,1.18,0.18,0.36,0.14,red);
  for (const side of [-1,1]) {
    const leg = new THREE.CylinderGeometry(r*0.095,r*0.12,r*0.65,6);
    leg.rotateX(0.15); leg.translate(side*r*0.43,r*0.38,0);
    parts.push({geo:leg,color:orange});
    egg(side*0.43,0.1,0.15,0.21,0.11,0.32,orange);
    for (const toe of [-1,0,1]) egg(side*0.43+toe*0.14,0.075,0.38-Math.abs(toe)*0.05,0.085,0.075,0.26,orange);
  }
  return mergeParts(parts);
}

/** BOD3D-style floor blood: one irregular pool with pointed lobes and detached flat splatter drops. */
function smearGeometry() {
  const shapes = [];
  const pool = new THREE.Shape();
  const radii = [1.00,0.72,1.17,0.79,1.08,0.67,1.25,0.76,1.05,0.64,1.14,0.81,1.03,0.69,1.20,0.75,1.07,0.66,1.12,0.80];
  for (let i = 0; i < radii.length; i++) {
    const a = i / radii.length * Math.PI * 2;
    const stretch = 1 + 0.18 * Math.sin(a * 3 + 0.7);
    const x = Math.cos(a) * radii[i] * stretch;
    const y = Math.sin(a) * radii[i];
    if (i === 0) pool.moveTo(x, y); else pool.lineTo(x, y);
  }
  pool.closePath(); shapes.push(pool);
  const drop = (cx, cy, rx, ry, points = 8) => {
    const s = new THREE.Shape();
    for (let i = 0; i < points; i++) {
      const a = i / points * Math.PI * 2;
      const wobble = 0.82 + 0.18 * Math.sin(i * 2.71 + cx * 5.3 + cy * 7.1);
      const x = cx + Math.cos(a) * rx * wobble;
      const y = cy + Math.sin(a) * ry * wobble;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath(); shapes.push(s);
  };
  drop( 1.38,  0.28, 0.20, 0.13, 7);
  drop(-1.22, -0.38, 0.16, 0.11, 7);
  drop( 0.72, -0.94, 0.12, 0.085, 7);
  drop(-0.45,  1.05, 0.10, 0.07, 7);
  drop( 1.62, -0.55, 0.075, 0.055, 6);
  drop(-1.48,  0.57, 0.065, 0.05, 6);
  return new THREE.ShapeGeometry(shapes);
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
      color: 0x7d1714, roughness: 1, metalness: 0, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    this.smearMesh = new THREE.InstancedMesh(this.smearGeo, this.smearMat, MAX_SMEARS);
    this.smearMesh.count = 0; this.smearMesh.receiveShadow = true; this.smearMesh.frustumCulled = false;
    this.scene.add(this.smearMesh);
    this.smears = []; this._smearsDirty = false; this._lastPropsTime = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._normal = new THREE.Vector3(); this._upZ = new THREE.Vector3(0, 0, 1);
    this._upY = new THREE.Vector3(0, 1, 0); this._dir = new THREE.Vector3();

    this.featherBurst = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 5, 3),
      new THREE.MeshStandardMaterial({color:0xfff2d8, flatShading:true}),
      1536
    );
    this.featherBurst.count = 0; this.featherBurst.frustumCulled = false; this.scene.add(this.featherBurst);

    // Tapered blood streaks rather than red balls: very short-lived, fast fan-shaped spray.
    this.bloodSpurt = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.12, 1, 4),
      new THREE.MeshStandardMaterial({color:0x8c1613, roughness:0.75, flatShading:true}),
      768
    );
    this.bloodSpurt.count = 0; this.bloodSpurt.frustumCulled = false; this.scene.add(this.bloodSpurt);

    this._e = new THREE.Euler();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  clearSmears(props = null) {
    this.smears.length = 0; this.smearMesh.count = 0; this._smearsDirty = true;
    if (props) for (const c of props.chickens) c._smearRecordedView = false;
  }

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
        sx: 0.42 + rand(2) * 0.24,
        sy: 0.27 + rand(3) * 0.18,
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
    let featherCount = 0, bloodCount = 0;
    const feathers = this.featherBurst, blood = this.bloodSpurt;

    for (let i = 0; i < props.chickens.length; i++) {
      const c = props.chickens[i], t = c.deadT;
      if (t < 0 || t > 3.2) continue;

      // Feathers: keep Claude's broad, readable burst.
      for (let j = 0; j < 40 && featherCount < feathers.instanceMatrix.count; j++) {
        const seed = (i+1)*73.17 + j*19.31;
        const rand = n => { const v = Math.sin(seed+n*31.7)*43758.5453; return v-Math.floor(v); };
        const angle = rand(1)*Math.PI*2, speed = 1.5+rand(2)*4;
        const up = 6+rand(3)*5;
        const flight = (1-Math.exp(-t*1.4))/1.4;
        const height = 0.65+up*t-0.5*7*t*t;
        const fade = Math.min(1,(3.2-t)/0.65);
        this._p.set(c.pos.x+Math.cos(angle)*speed*flight,
          c.pos.y+Math.max(0.04,height),
          c.pos.z+Math.sin(angle)*speed*flight);
        this._p.x += Math.sin(t*9+seed)*0.16*t;
        this._e.set(seed+t*7,seed+t*3,Math.sin(t*10+seed));
        this._s.set(0.055*fade, (0.16+rand(4)*0.14)*fade,0.018*fade);
        this._q.setFromEuler(this._e); this._m.compose(this._p,this._q,this._s);
        feathers.setMatrixAt(featherCount++,this._m);
      }

      // Blood spray: a fast tapered fan for the first fraction of a second, never spherical.
      if (t <= 0.75) {
        const baseSeed = (i+1)*117.31;
        const baseRand = n => { const v = Math.sin(baseSeed+n*41.9)*43758.5453; return v-Math.floor(v); };
        const baseAngle = baseRand(1) * Math.PI * 2;
        for (let j = 0; j < 20 && bloodCount < blood.instanceMatrix.count; j++) {
          const seed = baseSeed + j*23.71;
          const rand = n => { const v = Math.sin(seed+n*17.3)*43758.5453; return v-Math.floor(v); };
          const angle = baseAngle + (rand(1)-0.5)*2.15;
          const speed = 4.5 + rand(2)*6.5;
          const up0 = 2.2 + rand(3)*4.4;
          const vx = Math.cos(angle)*speed;
          const vz = Math.sin(angle)*speed;
          const vy = up0 - 16*t;
          const x = c.pos.x + vx*t;
          const y = c.pos.y + 0.52 + up0*t - 0.5*16*t*t;
          const z = c.pos.z + vz*t;
          if (y < c.pos.y + 0.025) continue;

          this._p.set(x,y,z);
          this._dir.set(vx,vy,vz).normalize();
          this._q.setFromUnitVectors(this._upY,this._dir);
          const fade = Math.max(0,1-t/0.75);
          const length = (0.26 + rand(4)*0.42) * (0.55 + fade*0.65);
          const width = (0.035 + rand(5)*0.028) * Math.max(0.35,fade);
          this._s.set(width,length,width);
          this._m.compose(this._p,this._q,this._s);
          blood.setMatrixAt(bloodCount++,this._m);
        }
      }
    }

    feathers.count=featherCount; feathers.instanceMatrix.needsUpdate=true;
    blood.count=bloodCount; blood.instanceMatrix.needsUpdate=true;
    this._s.set(1,1,1);
  }

  update(props, force = false) {
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
        const want = b.alive && b.fuse >= 0 && Math.floor(b.fuse * 12) % 2 === 0 ? 1 : 0;
        if (b._col !== want) { im.setColorAt(i, want ? HOT : PAINT[b.paint]); b._col = want; paint = true; }
        const settled = (!b.alive || b.asleep) && b.fuse < 0;
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
          const h = POP_V0 * t - 0.5 * POP_G * t * t;
          this._p.set(c.pos.x, c.pos.y + Math.max(0, h), c.pos.z);
          this._e.set(t * 24, t * 16, t * 10);
          this._q.setFromEuler(this._e);
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
          pitch = 0.18 + peck * 0.72;
        } else if (c.state === 'look') {
          yaw += Math.sin(props.time * 4.5 + c.bob) * 0.42;
        } else if (c.state === 'freeze') pitch = -0.06;

        this._p.set(c.pos.x, c.pos.y + bob, c.pos.z);
        // Heading first, then local pitch/roll. This keeps pecking aimed down/forward relative to the chicken,
        // rather than turning into a left/right lean when the chicken is facing across the road.
        this._q.setFromAxisAngle(this._upY, yaw);
        this._e.set(pitch, 0, roll, 'XYZ');
        this._q2.setFromEuler(this._e);
        this._q.multiply(this._q2);
        this._m.compose(this._p, this._q, this._s); cm.setMatrixAt(i, this._m);
      });
      cm.instanceMatrix.needsUpdate = true;
    }
    const bm = this.bits;
    if (bm) {
      let n = 0;
      for (const p of props.bits) {
        if (p.life <= 0) continue;
        const k = Math.min(1, p.life);
        this._p.set(p.pos.x, p.pos.y, p.pos.z); this._q.set(p.q.x, p.q.y, p.q.z, p.q.w); this._s.set(p.sx * k, p.sy * k, p.sz * k);
        this._m.compose(this._p, this._q, this._s); bm.setMatrixAt(n++, this._m);
      }
      this._s.set(1, 1, 1);
      bm.count = n; bm.instanceMatrix.needsUpdate = true;
    }
  }
}
