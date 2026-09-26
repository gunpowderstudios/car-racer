// Props: things scattered on the track that the car can hit. Right now that is oil drums.
//
//  * Each barrel is a small rigid body (mass, spin, quaternion). It touches the ground through
//    a ring of points on each rim, using the same analytic ground the car drives on, so barrels
//    sit, tip, roll and slide correctly on banked roads and embankments.
//  * The car pushes barrels with a sphere-vs-box test against a two-box model of its hull, and
//    the barrel pushes back with a proper impulse (a drum weighs 65 kg, the car 1450 kg).
//  * Hit one hard enough and it explodes. The blast throws other barrels, sets off the ones close
//    by a moment later (chain reaction), shoves every car nearby, and scatters scrap metal.
//  * step() takes one car or a list of them (the player first): rival cars knock drums about too.
//  * Nothing here imports three.js, so the whole thing runs (and is tested) in Node.
//    propsView.js draws it, and main.js turns the events it emits into sound and smoke.

import { V3, Q, clamp } from './math.js';
import { Track, WALL_GAP, WALL_T, WALL_HEIGHT } from './track.js';

const G = 9.81;
const UP = new V3(0, 1, 0);

export const BARREL = {
  radius: 0.36, height: 1.08, mass: 100,
  reach: 0.396, step: 0.324,     // three spheres this far apart along the axis stand in for the cylinder
  mu: 0.7,                       // tyre-on-tarmac-ish friction of a steel rim
  bounce: 0.5,                   // how lively it is: 0 = dead thud, 1 = perfect rubber ball
  bounceAbove: 1.5,              // impacts softer than this (m/s) don't bounce, so resting barrels stay put
  lightSpeed: 3,                 // a hit from the car at this closing speed (m/s) lights the fuse
  chainSpeed: 8,                 // barrel-on-barrel or barrel-on-wall, same idea
  fuse: 0.7,                     // seconds between being lit and going off
  clangSpeed: 1.5,               // impacts at least this hard make the clang sound
};
export const CHICKEN = {
  radius: 0.22,                  // roughly how big a chicken is, for placement and hit-testing
};
export const BLAST = {
  radius: 10,                    // barrels and the car feel it this far away
  chainRadius: 4.5,              // barrels this close go off too, a moment later
  throwSpeed: 12, lift: 5,       // what the centre of the blast does to a neighbouring barrel (m/s)
  carPush: 5.5,                  // and to the car (m/s at point blank, falling off linearly)
  bits: 6,                       // scrap pieces per barrel
};
const MAX_BITS = 128;
const INERTIA = BARREL.mass * (3 * BARREL.radius ** 2 + BARREL.height ** 2) / 12;   // one number for all axes: good enough for a drum

// Car hull as two boxes (car-local: x left, y up, z forward): the body and the cabin on top.
const CAR_BOXES = [
  { cx: 0, cy: -0.025, cz: 0, hx: 0.93, hy: 0.275, hz: 2.35 },
  { cx: 0, cy: 0.465, cz: 0, hx: 0.76, hy: 0.215, hz: 0.9 },
];

// A ring of 12 points on each rim of the drum, in barrel-local coordinates.
const RIM = new Float64Array(24 * 3);
for (let k = 0; k < 12; k++) {
  const a = k / 12 * Math.PI * 2;
  for (let e = 0; e < 2; e++) {
    const i = (k * 2 + e) * 3;
    RIM[i] = Math.cos(a) * BARREL.radius; RIM[i + 1] = (e ? 1 : -1) * BARREL.height / 2; RIM[i + 2] = Math.sin(a) * BARREL.radius;
  }
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Rotation taking +Y to the unit vector n. */
export function qFromUp(nx, ny, nz, q) { q.x = nz; q.y = 0; q.z = -nx; q.w = 1 + ny; return q.normalize(); }

function qMul(a, b, out) {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  out.x = x; out.y = y; out.z = z; out.w = w; return out;
}

/**
 * Where a prop dropped at (x, z) ends up: on the top surface there (or the level given by yHint),
 * and never inside a barrier - if it would touch the wall it is nudged to whichever side is nearer.
 * Used by the editor, so what you place is what the game loads.
 */
export function placeProp(track, x, z, yHint = 1e4) {
  const q = Track.newQuery();
  track.groundAt(x, z, yHint, q, true);
  if (track.def.walls && q.idx >= 0) {
    const ad = Math.abs(q.d), face = q.hw + WALL_GAP, r = BARREL.radius + 0.02;
    if (ad + r > face && ad - r < face + WALL_T) {
      const sg = q.d < 0 ? -1 : 1, target = ad < face + WALL_T / 2 ? face - r : face + WALL_T + r;
      x += sg * (target - ad) * q.lx; z += sg * (target - ad) * q.lz;
      track.groundAt(x, z, yHint, q, true);
    }
  }
  return { x, y: q.y, z };
}

// scratch
const sV = new V3(), sR = new V3(), sN = new V3(), sP = new V3(), sVa = new V3(), sVb = new V3(), sX = new V3(), sT = new V3();
const sQa = new Q(), sQb = new Q();
const hit = { pen: 0, nx: 0, ny: 0, nz: 0, px: 0, py: 0, pz: 0 };

/** Sphere (centre c, radius R) against one of the car's boxes. Fills `hit` (normal points car -> sphere). */
function sphereBox(c, R, car, box) {
  const dx = c.x - car.pos.x, dy = c.y - car.pos.y, dz = c.z - car.pos.z;
  const lx = dx * car.ax.x + dy * car.ax.y + dz * car.ax.z - box.cx;
  const ly = dx * car.ay.x + dy * car.ay.y + dz * car.ay.z - box.cy;
  const lz = dx * car.az.x + dy * car.az.y + dz * car.az.z - box.cz;
  let qx = clamp(lx, -box.hx, box.hx), qy = clamp(ly, -box.hy, box.hy), qz = clamp(lz, -box.hz, box.hz);
  const ex = lx - qx, ey = ly - qy, ez = lz - qz, d2 = ex * ex + ey * ey + ez * ez;
  let nx, ny, nz, pen;
  if (d2 > 1e-10) {
    if (d2 >= R * R) return false;
    const d = Math.sqrt(d2); nx = ex / d; ny = ey / d; nz = ez / d; pen = R - d;
  } else {
    // centre is inside the box: leave through the nearest face
    const px = box.hx - Math.abs(lx), py = box.hy - Math.abs(ly), pz = box.hz - Math.abs(lz);
    nx = ny = nz = 0;
    if (px <= py && px <= pz) { nx = lx < 0 ? -1 : 1; qx = nx * box.hx; pen = R + px; }
    else if (py <= pz) { ny = ly < 0 ? -1 : 1; qy = ny * box.hy; pen = R + py; }
    else { nz = lz < 0 ? -1 : 1; qz = nz * box.hz; pen = R + pz; }
  }
  qx += box.cx; qy += box.cy; qz += box.cz;
  hit.pen = pen;
  hit.nx = car.ax.x * nx + car.ay.x * ny + car.az.x * nz;
  hit.ny = car.ax.y * nx + car.ay.y * ny + car.az.y * nz;
  hit.nz = car.ax.z * nx + car.ay.z * ny + car.az.z * nz;
  hit.px = car.pos.x + car.ax.x * qx + car.ay.x * qy + car.az.x * qz;
  hit.py = car.pos.y + car.ax.y * qx + car.ay.y * qy + car.az.y * qz;
  hit.pz = car.pos.z + car.ax.z * qx + car.ay.z * qy + car.az.z * qz;
  return true;
}

export class Props {
  constructor() {
    this.track = null; this.defs = [];
    this.barrels = []; this.chickens = []; this.bits = []; this.events = [];
    for (let i = 0; i < MAX_BITS; i++) {
      this.bits.push({ pos: new V3(), vel: new V3(), w: new V3(), q: new Q(), life: 0, rest: false, sx: 0.3, sy: 0.04, sz: 0.2 });
    }
    this.bi = 0; this.time = 0; this.rng = mulberry(1);
    this.gq = Track.newQuery();      // ground query for barrels
    this.bq = Track.newQuery();      // ground query for scrap
    this._car = null; this._cars = [];
  }

  /** Put the barrels of a track definition where the editor placed them. */
  load(track, defs) { this.track = track; this.defs = defs || []; this.reset(); }

  /** Every barrel and chicken back where it started; scrap and events cleared. */
  reset() {
    this.barrels.length = 0; this.chickens.length = 0; this.events.length = 0; this.time = 0; this.rng = mulberry(1);
    for (const p of this.bits) { p.life = 0; p.rest = true; }
    if (!this.track) return;
    this.defs.forEach((d, i) => {
      if (d.type === 'barrel') {
        const g = this.track.groundAt(d.x, d.z, d.y + 0.5, this.gq, true);
        const b = {
          i, alive: true, asleep: true, still: 0, fuse: -1, boom: false, clang: 0,
          pos: new V3(d.x + g.nx * (BARREL.height / 2 + 0.003), g.y + g.ny * (BARREL.height / 2 + 0.003), d.z + g.nz * (BARREL.height / 2 + 0.003)),
          vel: new V3(), w: new V3(), q: new Q(), axis: new V3(0, 1, 0),
          paint: (i * 2654435761 >>> 0) % 10 < 7 ? 0 : 1,
        };
        qFromUp(g.nx, g.ny, g.nz, b.q); b.q.rotate(UP, b.axis);
        this.barrels.push(b);
      } else if (d.type === 'chicken') {
        const g = this.track.groundAt(d.x, d.z, d.y + 0.5, this.gq, true);
        this.chickens.push({
          i, alive: true, pos: new V3(d.x, g.y, d.z), nx: g.nx, ny: g.ny, nz: g.nz,
          bob: this.rng() * Math.PI * 2, tint: this.rng(),
        });
      }
    });
  }

  get alive() { let n = 0; for (const b of this.barrels) if (b.alive) n++; return n; }
  get aliveChickens() { let n = 0; for (const c of this.chickens) if (c.alive) n++; return n; }

  // ---------------------------------------------------------------- step
  step(dt, car) {
    if (!this.track) return;
    const cars = Array.isArray(car) ? car : car ? [car] : [];
    this._cars = cars; this._car = cars[0] || null;         // the first is the player: sounds fade with distance from it
    this.time += dt;
    for (const c of cars) c.refreshFrame();
    const bs = this.barrels;
    if (bs.length) {
      for (const c of cars) this._carContacts(c);
      for (const b of bs) if (b.alive && !b.asleep) this._integrate(b, dt);
      this._pairs();
      for (const b of bs) {
        if (b.alive && b.fuse >= 0) { b.fuse -= dt; if (b.fuse <= 0) b.boom = true; }
        if (b.clang > 0) b.clang -= dt;
      }
      // Detonations can set off more (fuse) or flag more (boom) - loop until nothing new is flagged this step.
      for (let pass = 0; pass < 4; pass++) {
        let any = false;
        for (const b of bs) if (b.alive && b.boom) { this._detonate(b); any = true; }
        if (!any) break;
      }
    }
    if (this.chickens.length) for (const c of cars) this._chickenContacts(c);
    this._stepBits(dt);
  }

  _wake(b) { b.asleep = false; b.still = 0; }
  /** Light the fuse (or shorten it, never lengthen it): the barrel goes off after `delay` seconds. */
  _light(b, delay) { if (b.alive && (b.fuse < 0 || b.fuse > delay)) b.fuse = delay; }

  _emitClang(b, speed, x, y, z) {
    if (b.clang > 0 || speed < BARREL.clangSpeed) return;
    b.clang = 0.18;
    this.events.push({ type: 'clang', speed, x, y, z, dist: this._carDist(x, y, z) });
  }
  _carDist(x, y, z) { const c = this._car; return c ? Math.hypot(x - c.pos.x, y - c.pos.y, z - c.pos.z) : Infinity; }

  // ------------------------------------------------------ car <-> barrels
  _carContacts(car) {
    for (const b of this.barrels) {
      if (!b.alive) continue;
      const dx = b.pos.x - car.pos.x, dy = b.pos.y - car.pos.y, dz = b.pos.z - car.pos.z;
      if (dx * dx + dy * dy + dz * dz > 30) continue;            // 5.5 m: outside the car's reach
      b.q.rotate(UP, b.axis);
      let best = null, bp = 0, bnx = 0, bny = 0, bnz = 0, bx = 0, by = 0, bz = 0;
      for (let k = -1; k <= 1; k++) {
        sV.set(b.pos.x + b.axis.x * k * BARREL.step, b.pos.y + b.axis.y * k * BARREL.step, b.pos.z + b.axis.z * k * BARREL.step);
        for (const box of CAR_BOXES) {
          if (sphereBox(sV, BARREL.reach, car, box) && hit.pen > bp) {
            best = true; bp = hit.pen; bnx = hit.nx; bny = hit.ny; bnz = hit.nz; bx = hit.px; by = hit.py; bz = hit.pz;
          }
        }
      }
      if (!best) continue;
      this._wake(b);
      const n = sN.set(bnx, bny, bnz), p = sP.set(bx, by, bz);
      b.pos.addScaled(n, bp);                                        // a drum is light: it gives way
      const r = sR.copy(p).sub(b.pos);
      const vB = sVa.cross(b.w, r).add(b.vel);
      const vC = car.velocityAt(p, sVb);
      const rel = (vB.x - vC.x) * n.x + (vB.y - vC.y) * n.y + (vB.z - vC.z) * n.z;
      if (rel >= 0) continue;
      const rn = sX.cross(r, n), invB = 1 / BARREL.mass + rn.lengthSq() / INERTIA, invC = car.invMassAt(n, p);
      const e = -rel > BARREL.bounceAbove ? BARREL.bounce : 0;
      const j = -(1 + e) * rel / (invB + invC);
      b.vel.addScaled(n, j / BARREL.mass); b.w.addScaled(rn, j / INERTIA);
      car.impulseAt(n, -j, p);
      // a little friction so a glancing hit spins the drum
      const vt = sT.set(vB.x - vC.x - n.x * rel, vB.y - vC.y - n.y * rel, vB.z - vC.z - n.z * rel), vtl = vt.length();
      if (vtl > 0.05) {
        vt.scale(1 / vtl);
        const rt = sX.cross(r, vt), jt = Math.min(0.35 * j, vtl / (1 / BARREL.mass + rt.lengthSq() / INERTIA));
        b.vel.addScaled(vt, -jt / BARREL.mass); b.w.addScaled(rt, -jt / INERTIA);
      }
      if (-rel >= BARREL.lightSpeed) this._light(b, BARREL.fuse);
      this._emitClang(b, -rel, p.x, p.y, p.z);
    }
  }

  // ------------------------------------------------------- chickens
  /** A chicken has no physics of its own: any real touch from the car splats it on the spot. */
  _chickenContacts(car) {
    for (const c of this.chickens) {
      if (!c.alive) continue;
      const dx = c.pos.x - car.pos.x, dz = c.pos.z - car.pos.z;
      if (dx * dx + dz * dz > 9) continue;               // 3 m: outside the car's reach
      sV.set(c.pos.x, c.pos.y + CHICKEN.radius, c.pos.z);
      let hitIt = false;
      for (const box of CAR_BOXES) if (sphereBox(sV, CHICKEN.radius + 0.15, car, box)) { hitIt = true; break; }
      if (!hitIt) continue;
      c.alive = false;
      this.events.push({ type: 'splat', x: c.pos.x, y: c.pos.y, z: c.pos.z, nx: c.nx, ny: c.ny, nz: c.nz, dist: this._carDist(c.pos.x, c.pos.y, c.pos.z) });
    }
  }

  // ------------------------------------------------------- one barrel
  _integrate(b, dt) {
    const T = this.track, g = this.gq;
    b.vel.y -= G * dt;
    const sp = b.vel.length(); if (sp > 60) b.vel.scale(60 / sp);
    const sw = b.w.length(); if (sw > 40) b.w.scale(40 / sw);
    b.pos.addScaled(b.vel, dt);
    b.q.integrate(b.w, dt);
    b.q.rotate(UP, b.axis);
    if (!Number.isFinite(b.pos.x + b.pos.y + b.pos.z)) { b.alive = false; return; }
    if (b.pos.y < -60) { b.alive = false; return; }              // fell off the world

    // ground: a plane through the ground point under the drum, with the local surface normal
    T.groundAt(b.pos.x, b.pos.z, b.pos.y + 0.6, g);
    const gx = b.pos.x, gy = g.y, gz = b.pos.z, nx = g.nx, ny = g.ny, nz = g.nz;
    let contacts = 0, maxPen = 0, impact = 0;
    const rx = this._rx || (this._rx = new Float64Array(72)), dist = this._dist || (this._dist = new Float64Array(24));
    for (let k = 0; k < 24; k++) {
      sV.set(RIM[k * 3], RIM[k * 3 + 1], RIM[k * 3 + 2]); b.q.rotate(sV, sX);
      rx[k * 3] = sX.x; rx[k * 3 + 1] = sX.y; rx[k * 3 + 2] = sX.z;
      dist[k] = nx * (b.pos.x + sX.x - gx) + ny * (b.pos.y + sX.y - gy) + nz * (b.pos.z + sX.z - gz);
      if (dist[k] < 0 && -dist[k] > maxPen) maxPen = -dist[k];
    }
    if (maxPen > 0) {
      const n = sN.set(nx, ny, nz), tgt = this._tgt || (this._tgt = new Float64Array(24));
      // Bounce: decide how fast each touching point should leave from how fast it arrived (before any
      // impulse is applied), so a barrel that lands on several rim points still rebounds as one body.
      for (let k = 0; k < 24; k++) {
        tgt[k] = 0;
        if (dist[k] >= 0.004) continue;
        const r = sR.set(rx[k * 3], rx[k * 3 + 1], rx[k * 3 + 2]), vn0 = sVa.cross(b.w, r).add(b.vel).dot(n);
        if (-vn0 > BARREL.bounceAbove) { tgt[k] = -vn0 * BARREL.bounce; if (-vn0 > impact) impact = -vn0; }
      }
      for (let it = 0; it < 3; it++) {
        for (let k = 0; k < 24; k++) {
          if (dist[k] >= 0.004) continue;
          const r = sR.set(rx[k * 3], rx[k * 3 + 1], rx[k * 3 + 2]);
          const vp = sVa.cross(b.w, r).add(b.vel), vn = vp.dot(n);
          if (vn >= tgt[k]) continue;
          const rn = sX.cross(r, n), inv = 1 / BARREL.mass + rn.lengthSq() / INERTIA;
          const j = (tgt[k] - vn) / inv;
          b.vel.addScaled(n, j / BARREL.mass); b.w.addScaled(rn, j / INERTIA);
          const vp2 = sVa.cross(b.w, r).add(b.vel), vn2 = vp2.dot(n);
          const vt = sT.set(vp2.x - n.x * vn2, vp2.y - n.y * vn2, vp2.z - n.z * vn2), vtl = vt.length();
          if (vtl > 1e-4) {
            vt.scale(1 / vtl);
            const rt = sX.cross(r, vt), jt = Math.min(BARREL.mu * j, vtl / (1 / BARREL.mass + rt.lengthSq() / INERTIA));
            b.vel.addScaled(vt, -jt / BARREL.mass); b.w.addScaled(rt, -jt / INERTIA);
          }
          if (it === 0) contacts++;
        }
      }
      const push = Math.min(Math.max(0, maxPen - 0.002), 0.15) * 0.8;
      b.pos.x += nx * push; b.pos.y += ny * push; b.pos.z += nz * push;
    }
    if (impact >= BARREL.clangSpeed) this._emitClang(b, impact, b.pos.x, b.pos.y - BARREL.height / 2, b.pos.z);
    // rolling resistance on the ground, hardly any in the air
    if (contacts > 0) { b.vel.scale(Math.exp(-0.3 * dt)); b.w.scale(Math.exp(-1.0 * dt)); }
    else b.w.scale(Math.exp(-0.1 * dt));

    this._wallHit(b, g);

    if (contacts > 0 && b.vel.lengthSq() < 0.0144 && b.w.lengthSq() < 0.1225) {
      b.still += dt;
      if (b.still > 0.5) { b.asleep = true; b.vel.set(0, 0, 0); b.w.set(0, 0, 0); }
    } else b.still = 0;
  }

  /** The barrier at the road edge is a thin slab; a drum on either side of it stays there. */
  _wallHit(b, g) {
    if (!this.track.def.walls || g.idx < 0) return;
    const sg = g.d < 0 ? -1 : 1, ad = Math.abs(g.d), face = g.hw + WALL_GAP;
    if (b.pos.y - BARREL.height / 2 > g.edgeY + WALL_HEIGHT) return;       // sailed over the top
    const nx = -g.lx * sg, nz = -g.lz * sg;                                  // horizontal, towards the road
    const ca = Math.abs(b.axis.x * nx + b.axis.z * nz);
    const reach = BARREL.radius * Math.sqrt(Math.max(0, 1 - ca * ca)) + BARREL.height / 2 * ca;   // how far the drum sticks out sideways
    const inner = ad + reach - face, outer = face + WALL_T - (ad - reach);
    if (inner <= 0 || outer <= 0) return;
    const dir = ad < face + WALL_T / 2 ? 1 : -1, pen = dir > 0 ? inner : outer;
    const dx = nx * dir, dz = nz * dir;
    b.pos.x += dx * pen; b.pos.z += dz * pen;
    const vn = b.vel.x * dx + b.vel.z * dz;
    if (vn < 0) {
      const k = 1 + BARREL.bounce;
      b.vel.x -= k * vn * dx; b.vel.z -= k * vn * dz;
      if (-vn >= BARREL.chainSpeed) this._light(b, BARREL.fuse);
      this._emitClang(b, -vn, b.pos.x, b.pos.y, b.pos.z);
    }
  }

  // ------------------------------------------------- barrel <-> barrel
  _pairs() {
    const bs = this.barrels;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i]; if (!a.alive || a.asleep) continue;
      for (let j = 0; j < bs.length; j++) {
        if (j === i) continue;
        const c = bs[j]; if (!c.alive) continue;
        if (!c.asleep && j < i) continue;                                   // two awake ones: do the pair once
        const dx = c.pos.x - a.pos.x, dy = c.pos.y - a.pos.y, dz = c.pos.z - a.pos.z;
        if (dx * dx + dy * dy + dz * dz > 4.84) continue;
        this._pair(a, c);
      }
    }
  }

  _pair(a, c) {
    const R2 = BARREL.reach * 2;
    let bp = 0, bnx = 0, bny = 0, bnz = 0, bx = 0, by = 0, bz = 0;
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
      const ax = a.pos.x + a.axis.x * i * BARREL.step, ay = a.pos.y + a.axis.y * i * BARREL.step, az = a.pos.z + a.axis.z * i * BARREL.step;
      const cx = c.pos.x + c.axis.x * k * BARREL.step, cy = c.pos.y + c.axis.y * k * BARREL.step, cz = c.pos.z + c.axis.z * k * BARREL.step;
      const dx = cx - ax, dy = cy - ay, dz = cz - az, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R2 * R2) continue;
      const d = Math.sqrt(d2) || 1e-6, pen = R2 - d;
      if (pen > bp) { bp = pen; bnx = dx / d; bny = dy / d; bnz = dz / d; bx = ax + dx / d * BARREL.reach; by = ay + dy / d * BARREL.reach; bz = az + dz / d * BARREL.reach; }
    }
    if (bp <= 0) return;
    const n = sN.set(bnx, bny, bnz), p = sP.set(bx, by, bz);
    const share = c.asleep ? 1 : 0.5;
    a.pos.addScaled(n, -bp * share); if (!c.asleep) c.pos.addScaled(n, bp * 0.5);
    const ra = sR.copy(p).sub(a.pos), rc = sX.copy(p).sub(c.pos);
    const va = sVa.cross(a.w, ra).add(a.vel), vc = sVb.cross(c.w, rc).add(c.vel);
    const rel = (vc.x - va.x) * n.x + (vc.y - va.y) * n.y + (vc.z - va.z) * n.z;
    if (rel >= 0) return;
    const rna = sT.cross(ra, n), rnc = sV.cross(rc, n);
    const inv = 2 / BARREL.mass + (rna.lengthSq() + rnc.lengthSq()) / INERTIA;
    const e = -rel > BARREL.bounceAbove ? BARREL.bounce : 0, j = -(1 + e) * rel / inv;
    a.vel.addScaled(n, -j / BARREL.mass); a.w.addScaled(rna, -j / INERTIA);
    c.vel.addScaled(n, j / BARREL.mass); c.w.addScaled(rnc, j / INERTIA);
    if (-rel > 0.3) this._wake(c);
    if (-rel >= BARREL.chainSpeed) { this._light(a, BARREL.fuse); this._light(c, BARREL.fuse); }
    this._emitClang(a, -rel, p.x, p.y, p.z);
  }

  // ------------------------------------------------------- explosions
  _detonate(b) {
    b.alive = false; b.asleep = true; b.boom = false; b.fuse = -1;
    const T = this.track, rnd = this.rng;
    const g = T.groundAt(b.pos.x, b.pos.z, b.pos.y + 0.6, this.bq);
    this.events.push({
      type: 'blast', x: b.pos.x, y: b.pos.y, z: b.pos.z, gy: g.y, nx: g.nx, ny: g.ny, nz: g.nz,
      dist: this._carDist(b.pos.x, b.pos.y, b.pos.z), radius: BLAST.radius,
    });

    // scrap metal: rim and lid pieces flung out
    for (let i = 0; i < BLAST.bits; i++) {
      const p = this.bits[this.bi++ % MAX_BITS], a = rnd() * Math.PI * 2, s = 3 + rnd() * 7;
      p.pos.set(b.pos.x + (rnd() - 0.5) * 0.4, b.pos.y + (rnd() - 0.2) * 0.5, b.pos.z + (rnd() - 0.5) * 0.4);
      p.vel.set(Math.cos(a) * s, 4 + rnd() * 7, Math.sin(a) * s);
      p.w.set((rnd() - 0.5) * 30, (rnd() - 0.5) * 30, (rnd() - 0.5) * 30);
      p.q.x = rnd() - 0.5; p.q.y = rnd() - 0.5; p.q.z = rnd() - 0.5; p.q.w = rnd() - 0.49; p.q.normalize();
      p.life = 9 + rnd() * 3; p.rest = false;
      p.sx = 0.16 + rnd() * 0.3; p.sy = 0.03 + rnd() * 0.03; p.sz = 0.12 + rnd() * 0.22;
    }

    // other barrels: thrown clear, and the near ones go off after a short delay
    for (const o of this.barrels) {
      if (!o.alive) continue;
      const dx = o.pos.x - b.pos.x, dy = o.pos.y - b.pos.y, dz = o.pos.z - b.pos.z, d = Math.hypot(dx, dy, dz);
      if (d > BLAST.radius) continue;
      const k = 1 - d / BLAST.radius, inv = d > 0.05 ? 1 / d : 0;
      const hx = inv ? dx * inv : 0, hz = inv ? dz * inv : 0;
      o.vel.x += hx * BLAST.throwSpeed * k; o.vel.z += hz * BLAST.throwSpeed * k;
      o.vel.y += BLAST.lift * (0.4 + k);
      o.w.set((rnd() - 0.5) * 16 * k, (rnd() - 0.5) * 16 * k, (rnd() - 0.5) * 16 * k);
      this._wake(o);
      if (d <= BLAST.chainRadius) this._light(o, 0.07 + d * 0.045);
    }

    // every car nearby feels it too: pushed away from the blast and given a bump
    for (const car of this._cars) {
      const dx = car.pos.x - b.pos.x, dy = car.pos.y - b.pos.y, dz = car.pos.z - b.pos.z, d = Math.hypot(dx, dy, dz);
      if (d < BLAST.radius) {
        const k = 1 - d / BLAST.radius, inv = d > 0.05 ? 1 / d : 0;
        sN.set(dx * inv, dy * inv + 0.45, dz * inv);
        if (!inv) sN.set(0, 1, 0);
        sN.normalize();
        car.refreshFrame();
        sP.set(car.pos.x - car.ay.x * 0.25, car.pos.y - car.ay.y * 0.25, car.pos.z - car.ay.z * 0.25);   // a little below the centre of mass
        car.impulseAt(sN, car.mass * BLAST.carPush * k, sP);
      }
    }
  }

  /** Something else went up (a wrecked car): shove the drums nearby and light the closest ones. */
  shock(x, y, z, radius = 7) {
    for (const o of this.barrels) {
      if (!o.alive) continue;
      const dx = o.pos.x - x, dy = o.pos.y - y, dz = o.pos.z - z, d = Math.hypot(dx, dy, dz);
      if (d > radius) continue;
      const k = 1 - d / radius, inv = d > 0.05 ? 1 / d : 0;
      o.vel.x += dx * inv * BLAST.throwSpeed * 0.6 * k; o.vel.z += dz * inv * BLAST.throwSpeed * 0.6 * k;
      o.vel.y += BLAST.lift * (0.3 + k);
      this._wake(o);
      if (d <= radius * 0.6) this._light(o, 0.15 + d * 0.06);
    }
  }

  // --------------------------------------------------------- scrap metal
  _stepBits(dt) {
    const T = this.track;
    for (const p of this.bits) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.rest) continue;
      p.vel.y -= G * dt;
      p.pos.addScaled(p.vel, dt); p.q.integrate(p.w, dt);
      const g = T.groundAt(p.pos.x, p.pos.z, p.pos.y + 0.6, this.bq);
      const floor = g.y + 0.04;
      if (p.pos.y < floor) {
        p.pos.y = floor;
        if (p.vel.y < 0) p.vel.y *= -0.35;
        p.vel.x *= 0.75; p.vel.z *= 0.75; p.w.scale(0.55);
        if (p.vel.lengthSq() < 0.5 && Math.abs(p.vel.y) < 0.8) {
          // lie flat on the ground with a random heading
          const yaw = (p.pos.x * 12.9898 + p.pos.z * 78.233) % (Math.PI * 2);
          qFromUp(g.nx, g.ny, g.nz, sQa);
          sQb.x = 0; sQb.y = Math.sin(yaw / 2); sQb.z = 0; sQb.w = Math.cos(yaw / 2);
          qMul(sQa, sQb, p.q);
          p.vel.set(0, 0, 0); p.w.set(0, 0, 0); p.rest = true;
        }
      }
    }
  }
}
