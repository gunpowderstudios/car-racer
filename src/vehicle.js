// Vehicle dynamics for a heavy 70s muscle car.
//
//  * Full 3D rigid body (mass, inertia tensor, quaternion) - so it pitches under
//    braking, rolls in corners, jumps, lands and can flip.
//  * Four wheels, each a spring / damper / anti-roll-bar with its own ground probe
//    against the analytic track surface (no triangle-mesh collision).
//  * Tyres use a slip-angle model (Pacejka-style curve) with load sensitivity and a
//    friction ellipse: braking or driving hard steals lateral grip. That single rule
//    gives power-oversteer, lock-up understeer and handbrake turns without scripts.
//  * The handbrake locks the rear wheels. A locked tyre only has sliding friction
//    along its direction of travel, so the tail steps out and the car rotates.
//  * Walls are analytic (distance to the road edge) with proper impulses.
//
// Axes in the body frame: +Z forward, +Y up, +X left. Positive steer = left.

import { V3, Q, clamp, lerp, wrapPi } from './math.js';
import { Track, SURF } from './track.js';

const G = 9.81;

export const CAR = {
  mass: 1450,
  wheelbase: 2.77,
  frontWeight: 0.52,            // share of weight on the front axle
  track: 1.52,
  wheelRadius: 0.30,
  mountY: 0.08,                 // suspension mount height above the centre of mass
  inertia: { x: 3000, y: 3200, z: 850 },   // pitch, yaw, roll
  susp: {
    free: 0.44, travel: 0.24,
    kFront: 33500, kRear: 30900,
    cCompFront: 2400, cCompRear: 2250, cRebFront: 3400, cRebRear: 3200,
    arbFront: 18000, arbRear: 12000, bump: 200000, bumpDamp: 9000,
  },
  tyre: {
    muFront: 1.04, muRear: 1.08, B: 9.5, C: 1.45, E: 0,
    loadSens: 0.07, nominalLoad: 3700, maxTyreLoad: 8500, slideMu: 0.8, rolling: 0.014,
  },
  engine: {
    idle: 900, limiter: 6900, stall: 2600, peakTorque: 430, efficiency: 0.88,
    curve: [[900, 0.55], [2000, 0.82], [3200, 0.95], [4400, 1.0], [5600, 0.95], [6500, 0.82], [6900, 0.62]],
    gears: [2.9, 1.85, 1.3, 1.0], reverse: 2.5, finalDrive: 3.55,
    engineBrake: 22,
  },
  brakeTotal: 1.4 * 1450 * G,   // N, before tyre limits
  brakeBias: 0.62,              // front share
  wallBounce: 0.3,              // restitution against barriers on a solid hit
  aero: { drag: 0.55, down: 0.33 },   // 0.5*rho*CdA and 0.5*rho*ClA
  steer: { max: 0.55, rate: 4.2, returnRate: 6.5 },
  // Body outline used for ground and wall contact (local coords: x left, y up, z forward)
  hull: (() => {
    const p = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      p.push([0.93 * sx, -0.30, 2.35 * sz]);   // belly corners
      p.push([0.93 * sx, 0.25, 2.35 * sz]);    // bumper / hood corners
      p.push([0.76 * sx, 0.68, 0.9 * sz]);     // roof corners
    }
    p.push([0.93, 0.25, 0], [-0.93, 0.25, 0]);
    return p.map((a) => new V3(...a));
  })(),
};

const tmpA = new V3(), tmpB = new V3(), tmpC = new V3(), tmpD = new V3(), tmpE = new V3();

class Wheel {
  constructor(i, spec) {
    this.i = i;
    this.front = i < 2;
    this.left = i % 2 === 0;
    this.driven = !this.front;
    const a = (1 - spec.frontWeight) * spec.wheelbase, b = spec.frontWeight * spec.wheelbase;
    this.local = new V3((this.left ? 1 : -1) * spec.track / 2, spec.mountY, this.front ? a : -b);
    this.mount = new V3(); this.contactPoint = new V3(); this.normal = new V3(0, 1, 0);
    this.q = Track.newQuery();
    this.contact = false; this.compress = 0; this.load = 0; this.surface = SURF.ROAD;
    this.slipAngle = 0; this.skid = 0; this.locked = false; this.longSpeed = 0;
    this.spin = 0;   // visual roll angle
  }
}

export class Vehicle {
  constructor(spec = CAR) {
    this.spec = spec;
    this.mass = spec.mass;
    this.invI = new V3(1 / spec.inertia.x, 1 / spec.inertia.y, 1 / spec.inertia.z);
    this.pos = new V3(); this.vel = new V3(); this.angVel = new V3();
    this.rot = new Q();
    this.ax = new V3(1, 0, 0); this.ay = new V3(0, 1, 0); this.az = new V3(0, 0, 1);
    this.wheels = [0, 1, 2, 3].map((i) => new Wheel(i, spec));
    this.F = new V3(); this.T = new V3();
    this.q = Track.newQuery();
    this.events = [];
    this.opts = { assist: 0.7 };
    this.hullWorld = spec.hull.map(() => new V3());
    // Static ride height: wheel centre at R above ground, suspension length = free - static compression
    const sprungFront = spec.mass * spec.frontWeight / 2;
    const xs = sprungFront * G / spec.susp.kFront;
    this.restHeight = spec.wheelRadius + (spec.susp.free - xs) - spec.mountY;
    this.reset(new V3(0, this.restHeight, 0), new V3(0, 0, 1), new V3(0, 1, 0));
  }

  /** Place the car with its centre of mass at `pos`, facing `fwd`, with `up` as roof direction. */
  reset(pos, fwd, up, speed = 0) {
    this.pos.copy(pos);
    this.az.copy(fwd).normalize();
    this.ay.copy(up).normalize();
    this.ax.cross(this.ay, this.az).normalize();
    this.ay.cross(this.az, this.ax).normalize();
    this.rot.setFromAxes(this.ax, this.ay, this.az);
    this.vel.copy(this.az).scale(speed);
    this.angVel.set(0, 0, 0);
    this.thr = 0; this.brk = 0; this.steerState = 0; this.steerAngle = 0; this.assistAngle = 0;
    this.gear = 1; this.rpm = this.spec.engine.idle; this.shiftTimer = 0; this.spinFactor = 0;
    this.fwdSpeed = speed; this.speed = speed; this.latSpeed = 0; this.sideSlip = 0;
    this.onGround = false; this.airTime = 0; this.scraping = false; this.handbrake = false;
    this.events.length = 0;
    for (const w of this.wheels) { w.contact = false; w.load = 0; w.skid = 0; w.compress = 0; }
  }

  _axes() {
    this.rot.rotate(tmpA.set(1, 0, 0), this.ax);
    this.rot.rotate(tmpA.set(0, 1, 0), this.ay);
    this.rot.rotate(tmpA.set(0, 0, 1), this.az);
  }
  toWorld(l, out) {
    return out.set(
      this.pos.x + this.ax.x * l.x + this.ay.x * l.y + this.az.x * l.z,
      this.pos.y + this.ax.y * l.x + this.ay.y * l.y + this.az.y * l.z,
      this.pos.z + this.ax.z * l.x + this.ay.z * l.y + this.az.z * l.z);
  }
  _invIMul(v, out) {
    const a = v.dot(this.ax) * this.invI.x, b = v.dot(this.ay) * this.invI.y, c = v.dot(this.az) * this.invI.z;
    return out.set(
      this.ax.x * a + this.ay.x * b + this.az.x * c,
      this.ax.y * a + this.ay.y * b + this.az.y * c,
      this.ax.z * a + this.ay.z * b + this.az.z * c);
  }
  /** Effective inverse mass at offset r along unit direction u. */
  _kAt(r, u) {
    tmpD.cross(r, u); this._invIMul(tmpD, tmpE); tmpD.cross(tmpE, r);
    return 1 / this.mass + tmpD.dot(u);
  }
  _applyForce(f, p) {
    this.F.add(f);
    tmpD.copy(p).sub(this.pos); tmpE.cross(tmpD, f); this.T.add(tmpE);
  }
  _velAt(r, out) {
    out.cross(this.angVel, r); return out.add(this.vel);
  }

  // ------------------------------------------------------------ main step
  step(dt, input, track) {
    const sp = this.spec;
    this._axes();
    this.F.set(0, -this.mass * G, 0);
    this.T.set(0, 0, 0);

    // --- driver inputs -> smoothed pedals, steering
    this.thr += clamp(input.throttle - this.thr, -8 * dt, 5 * dt);
    this.brk += clamp(input.brake - this.brk, -10 * dt, 7 * dt);
    this.handbrake = !!input.handbrake;
    const flatF = tmpA.set(this.az.x, 0, this.az.z);
    const fl = flatF.length() || 1; flatF.scale(1 / fl);
    this.fwdSpeed = this.vel.dot(flatF);
    const flatL = tmpB.set(flatF.z, 0, -flatF.x);      // up x forward = left
    this.latSpeed = this.vel.dot(flatL);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.sideSlip = this.speed > 2 ? Math.atan2(this.latSpeed, Math.abs(this.fwdSpeed)) * (this.fwdSpeed >= 0 ? 1 : -1) : 0;
    this._steer(dt, input);

    // --- suspension and ground probes
    let contacts = 0;
    for (const w of this.wheels) this._probeWheel(w, track);
    for (const w of this.wheels) if (w.contact) contacts++;
    // anti-roll bars share load across an axle
    this._arb(0, 1, sp.susp.arbFront); this._arb(2, 3, sp.susp.arbRear);
    this.onGround = contacts > 0;
    this.airTime = this.onGround ? 0 : this.airTime + dt;

    // --- drivetrain
    const drv = this._drivetrain(dt, input);

    // --- tyres
    this.scraping = false;
    for (const w of this.wheels) {
      if (!w.contact) { w.skid = 0; w.slipAngle = 0; continue; }
      this._tyre(w, drv, dt);
    }

    // --- aerodynamics
    const v2 = this.vel.lengthSq();
    if (v2 > 1) {
      const v = Math.sqrt(v2);
      tmpA.copy(this.vel).scale(-sp.aero.drag * v);
      this.F.add(tmpA);
      if (contacts > 0) this.F.y -= sp.aero.down * v2;
    }

    // --- body against the ground (roof, bumpers, belly)
    this._bodyGround(track, dt);

    // --- integrate velocities
    this.vel.addScaled(this.F, dt / this.mass);
    this._invIMul(this.T, tmpA);
    this.angVel.addScaled(tmpA, dt);
    const damp = this.onGround ? 1 : 1 - 0.25 * dt;
    this.angVel.scale(damp);

    // --- walls
    this._walls(track, dt);

    // --- integrate pose
    const vl = this.vel.length();
    if (vl > 140) this.vel.scale(140 / vl);
    const wl = this.angVel.length();
    if (wl > 25) this.angVel.scale(25 / wl);
    this.pos.addScaled(this.vel, dt);
    this.rot.integrate(this.angVel, dt);
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z + this.rot.w)) {
      throw new Error('Vehicle simulation diverged');
    }
  }

  // -------------------------------------------------------------- steering
  _steer(dt, input) {
    const st = this.spec.steer;
    const target = clamp(input.steer, -1, 1);
    const rate = (Math.abs(target) > Math.abs(this.steerState) || target * this.steerState < 0 ? st.rate : st.returnRate)
      * (this.speed > 25 ? 0.65 : 1);
    this.steerState += clamp(target - this.steerState, -rate * dt, rate * dt);
    const v = Math.max(this.speed, 0.1);
    // Full lock at low speed, tapering to roughly the front tyres' peak slip angle at speed.
    const lock = Math.min(st.max, 0.17 + 36.6 / Math.max(v * v, 60));
    let angle = this.steerState * lock;
    // Counter-steer assist: when the REAR axle slides past its grip, point the front
    // wheels along the direction of travel. Normal cornering never triggers it.
    let assist = 0;
    if (this.opts.assist > 0 && this.speed > 4 && this.fwdSpeed > 2 && this.onGround) {
      const b = this.spec.frontWeight * this.spec.wheelbase;            // COM to rear axle
      const yawRate = this.angVel.dot(this.ay);
      const rearSlip = Math.atan2(this.latSpeed - yawRate * b, Math.max(this.fwdSpeed, 2));
      const over = Math.max(0, Math.abs(rearSlip) - 0.12);
      const gain = this.opts.assist * clamp((this.speed - 4) / 6, 0, 1);
      assist = Math.sign(rearSlip) * clamp(over * 1.0 * gain, 0, 0.28);
    }
    this.assistAngle += (assist - this.assistAngle) * (1 - Math.exp(-dt / 0.12));   // no snapping
    angle += this.assistAngle;
    this.steerAngle = clamp(angle, -st.max, st.max);
  }

  // ------------------------------------------------------ wheel probing
  _probeWheel(w, track) {
    const sp = this.spec.susp, R = this.spec.wheelRadius;
    this.toWorld(w.local, w.mount);
    w.contact = false; w.load = 0;
    if (this.ay.y < 0.15) return;                       // upside down: wheels can't carry the car
    const maxLen = sp.free + R;
    const dir = tmpA.set(-this.ay.x, -this.ay.y, -this.ay.z);
    let t = maxLen;
    const P = tmpB;
    P.set(w.mount.x + dir.x * t, w.mount.y + dir.y * t, w.mount.z + dir.z * t);
    track.query(P.x, P.y, P.z, w.q, 0.7);
    let h = P.y - w.q.y;
    if (h > 0.02) { w.compress = 0; return; }           // still above the ground at full droop
    for (let it = 0; it < 2; it++) {
      t += h / this.ay.y;
      P.set(w.mount.x + dir.x * t, w.mount.y + dir.y * t, w.mount.z + dir.z * t);
      track.query(P.x, P.y, P.z, w.q, 0.7);
      h = P.y - w.q.y;
    }
    const L = t - R;
    const compress = sp.free - L;
    if (compress < -0.02) { w.compress = 0; return; }
    if (compress > sp.travel + 0.22) { w.compress = 0; return; }   // wheel is inside a vertical face (lip), not on a surface
    w.contact = true; w.compress = Math.max(0, compress);
    w.contactPoint.copy(P);
    w.normal.set(w.q.nx, w.q.ny, w.q.nz);
    w.surface = w.q.surface;

    // spring + damper along the ground normal
    tmpC.copy(P).sub(this.pos);
    this._velAt(tmpC, tmpD);
    const vn = tmpD.dot(w.normal);
    const k = w.front ? sp.kFront : sp.kRear;
    const cC = w.front ? sp.cCompFront : sp.cCompRear, cR = w.front ? sp.cRebFront : sp.cRebRear;
    let F = k * w.compress - (vn < 0 ? cC : cR) * vn;
    if (w.compress > sp.travel) F += sp.bump * (w.compress - sp.travel) + (vn < 0 ? -sp.bumpDamp * vn : 0);
    w.load = clamp(F, 0, 32000);
  }

  _arb(iL, iR, k) {
    const L = this.wheels[iL], R = this.wheels[iR];
    const diff = k * (L.compress - R.compress);
    if (L.contact) L.load = Math.max(0, L.load + diff);
    if (R.contact) R.load = Math.max(0, R.load - diff);
  }

  // ----------------------------------------------------------- drivetrain
  _gearRatio(g) {
    const e = this.spec.engine;
    if (g === 0) return 0;
    return (g < 0 ? -e.reverse : e.gears[g - 1]) * e.finalDrive;
  }
  _rpmAt(g, speed) {
    const r = Math.abs(this._gearRatio(g));
    return Math.abs(speed) / this.spec.wheelRadius * r * 60 / (2 * Math.PI);
  }
  _torque(rpm) {
    const c = this.spec.engine.curve;
    if (rpm <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) {
      if (rpm <= c[i][0]) return lerp(c[i - 1][1], c[i][1], (rpm - c[i - 1][0]) / (c[i][0] - c[i - 1][0]));
    }
    return c[c.length - 1][1];
  }

  _drivetrain(dt, input) {
    const e = this.spec.engine, fwd = this.fwdSpeed;
    let drive, brakeCmd;
    if (this.gear === -1) {
      drive = this.brk; brakeCmd = this.thr;
      if (this.thr > 0.05 && fwd > -0.8) { this.gear = 1; drive = this.thr; brakeCmd = this.brk; }
    } else {
      drive = this.thr; brakeCmd = this.brk;
      if (this.brk > 0.05 && this.thr < 0.05 && fwd < 0.8) { this.gear = -1; drive = this.brk; brakeCmd = 0; }
    }
    if (this.handbrake) drive = 0;

    // automatic gearbox
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (this.gear > 0 && this.shiftTimer <= 0 && this.onGround) {
      const up = 5100 + 1200 * drive, down = 2300;
      const rpmNow = this._rpmAt(this.gear, fwd);
      if (this.gear < e.gears.length && rpmNow > up) { this.gear++; this.shiftTimer = 0.32; }
      else if (this.gear > 1 && (rpmNow < down || (drive > 0.9 && this._rpmAt(this.gear - 1, fwd) < 5200 && rpmNow < 3300))) {
        this.gear--; this.shiftTimer = 0.32;
      }
    }

    const ratio = this._gearRatio(this.gear);
    const wheelRpm = this._rpmAt(this.gear, fwd);
    let target = Math.max(wheelRpm * (1 + 0.4 * this.spinFactor), e.idle + (e.stall - e.idle) * drive);
    target = Math.min(target, e.limiter + 250);
    this.rpm += (target - this.rpm) * (1 - Math.exp(-(target > this.rpm ? 14 : 8) * dt));

    let torque = e.peakTorque * this._torque(this.rpm) * drive;
    if (this.rpm > e.limiter) torque = 0;
    if (this.shiftTimer > 0.14) torque *= 0.25;
    let force = torque * Math.abs(ratio) * e.efficiency / this.spec.wheelRadius * Math.sign(ratio);
    if (this.gear === -1 && fwd < -9) force = 0;          // reverse is slow
    // engine braking when off the throttle
    if (drive < 0.05 && this.gear > 0 && this.rpm > e.idle + 400) {
      force -= Math.sign(fwd) * e.engineBrake * Math.abs(ratio) / this.spec.wheelRadius * clamp(Math.abs(fwd) / 3, 0, 1);
    }
    const hold = drive < 0.02 && brakeCmd < 0.02 && Math.abs(fwd) < 0.5 && !this.handbrake ? 1 : 0;
    return { force, brake: brakeCmd, hold };
  }

  // ---------------------------------------------------------------- tyres
  _tyre(w, drv, dt) {
    const sp = this.spec, ty = sp.tyre;
    const n = w.normal;
    // wheel heading: body forward rotated by steer angle, projected on the ground plane
    const c = Math.cos(w.front ? this.steerAngle : 0), s = Math.sin(w.front ? this.steerAngle : 0);
    const f = tmpA.set(
      this.az.x * c + this.ax.x * s, this.az.y * c + this.ax.y * s, this.az.z * c + this.ax.z * s);
    f.addScaled(n, -f.dot(n)).normalize();
    const l = tmpB.cross(n, f);
    const r = tmpC.copy(w.contactPoint).sub(this.pos);
    const vc = this._velAt(r, tmpD);
    const vlong = vc.dot(f), vlat = vc.dot(l);
    w.longSpeed = vlong;
    const Fz = Math.min(w.load, ty.maxTyreLoad);      // tyres saturate under shock loads (landings)
    const rL = r.clone(), fL = f.clone(), lL = l.clone();     // keep copies; tmp vectors get reused below
    const mEffLong = 1 / this._kAt(rL, fL), mEffLat = 1 / this._kAt(rL, lL);

    const surfMu = w.surface === SURF.ROAD ? 1 : 0.6;
    const muBase = w.front ? ty.muFront : ty.muRear;
    const mu = muBase * surfMu * clamp(1 - ty.loadSens * (Fz / ty.nominalLoad - 1), 0.6, 1.25);
    const Fmax = mu * Fz;
    const capL = 0.25 * mEffLong / dt, capT = 0.25 * mEffLat / dt;
    const lockedHB = this.handbrake && !w.front;
    w.locked = lockedHB;

    let Fx = 0, Fy = 0, spinning = false;
    if (lockedHB) {
      // Locked wheel: sliding friction opposing the contact-point velocity.
      const vm = Math.hypot(vlong, vlat);
      const kin = ty.slideMu * surfMu * Fz;
      const fx = kin * vlong / Math.max(vm, 0.8), fy = kin * vlat / Math.max(vm, 0.8);
      Fx = -clamp(fx, -capL * Math.abs(vlong), capL * Math.abs(vlong));
      Fy = -clamp(fy, -capT * Math.abs(vlat), capT * Math.abs(vlat));
      w.skid = clamp(vm / 4, 0, 1);
      w.slipAngle = Math.atan2(vlat, Math.max(Math.abs(vlong), 1));
    } else {
      // longitudinal: drive, brake, rolling resistance
      if (w.driven) {
        const want = drv.force / 2;
        const lim = 0.97 * Fmax;
        if (Math.abs(want) > lim) { Fx += Math.sign(want) * lim; spinning = true; } else Fx += want;
      }
      let brakeF = drv.brake * sp.brakeTotal * (w.front ? sp.brakeBias : 1 - sp.brakeBias) / 2;
      if (drv.hold) brakeF = Math.max(brakeF, 2600);
      brakeF = Math.min(brakeF, 0.8 * Fmax);
      const sgn = vlong >= 0 ? 1 : -1;
      const mag = Math.abs(vlong);
      if (brakeF > 0) Fx -= sgn * Math.min(brakeF, capL * mag);
      const rr = ty.rolling * (w.surface === SURF.ROAD ? 1 : 8) * Fz;
      Fx -= sgn * Math.min(rr, capL * mag);
      Fx = clamp(Fx, -Fmax, Fmax);

      // lateral: slip angle curve, reduced by whatever grip the longitudinal force already uses
      const alpha = Math.atan2(vlat, Math.max(Math.abs(vlong), 1.5));
      const B = ty.B, C = ty.C;
      const curve = Math.sin(C * Math.atan(B * alpha - ty.E * (B * alpha - Math.atan(B * alpha))));
      const ell = Fmax > 1 ? Math.sqrt(Math.max(0, 1 - (Fx / Fmax) ** 2)) : 0;
      Fy = -curve * Fmax * ell;
      Fy = clamp(Fy, -capT * Math.abs(vlat), capT * Math.abs(vlat));
      w.slipAngle = alpha;
      const lat = clamp((Math.abs(alpha) - 0.14) / 0.22, 0, 1) * clamp(this.speed / 3, 0, 1);
      w.skid = Math.max(lat, spinning ? clamp(1 - this.speed / 14, 0.25, 1) : 0);
    }
    if (w.driven) this.spinFactor += ((spinning ? 1 : 0) - this.spinFactor) * Math.min(1, 8 * dt) / 2;

    // apply: suspension (along normal) + tyre forces in the ground plane
    const Fw = tmpE.set(
      n.x * w.load + fL.x * Fx + lL.x * Fy,
      n.y * w.load + fL.y * Fx + lL.y * Fy,
      n.z * w.load + fL.z * Fx + lL.z * Fy);
    const p = tmpC.copy(w.contactPoint);
    this.F.add(Fw);
    const arm = tmpD.copy(p).sub(this.pos);
    const tq = tmpA.cross(arm, Fw);
    this.T.add(tq);
    w.spin += vlong / this.spec.wheelRadius * dt;
  }

  // ------------------------------------------------ body vs. ground
  _bodyGround(track, dt) {
    const kB = 120000, cB = 7000;
    for (let i = 0; i < this.spec.hull.length; i++) {
      const p = this.toWorld(this.spec.hull[i], this.hullWorld[i]);
      const q = track.query(p.x, p.y, p.z, this.q, 0.3);
      const pen = q.y - p.y;
      if (pen <= 0) continue;
      const r = tmpC.copy(p).sub(this.pos);
      const v = this._velAt(r, tmpD);
      const n = tmpE.set(q.nx, q.ny, q.nz);
      const vn = v.dot(n);
      const Fn = Math.max(0, kB * Math.min(pen, 0.5) - (vn < 0 ? cB * vn : 0));
      const F = new V3(n.x * Fn, n.y * Fn, n.z * Fn);
      // scraping friction along the surface
      const vt = new V3(v.x - n.x * vn, v.y - n.y * vn, v.z - n.z * vn);
      const vtl = vt.length();
      if (vtl > 0.05) {
        const fr = Math.min(0.7 * Fn, 0.06 * this.mass * vtl / dt);
        F.addScaled(vt, -fr / vtl);
      }
      this._applyForce(F, p);
      if (Fn > 4000) {
        this.scraping = true;
        if (vn < -2.5) this.events.push({ type: 'ground', speed: -vn, x: p.x, y: p.y, z: p.z });
      }
    }
  }

  // ------------------------------------------------------------ walls
  _walls(track, dt) {
    const hull = this.spec.hull;
    let corrN = null, corrPen = 0, worstV = 0, wx = 0, wy = 0, wz = 0, touched = false;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < hull.length; i++) {
        const p = this.toWorld(hull[i], this.hullWorld[i]);
        const q = track.query(p.x, p.y, p.z, this.q, 0.8);
        const pen = track.wallPenetration(q, p.y);
        if (pen <= 0) continue;
        touched = true;
        const sg = q.d < 0 ? -1 : 1;
        const n = tmpE.set(-q.lx * sg, 0, -q.lz * sg);          // horizontal, towards the road
        const r = tmpC.copy(p).sub(this.pos);
        const v = this._velAt(r, tmpD);
        const vn = v.dot(n);
        if (pass === 0 && pen > corrPen) { corrPen = pen; corrN = n.clone(); }
        if (vn >= 0) continue;
        const rr = r.clone(), nn = n.clone();
        // restitution ramps in with impact speed: a resting nudge doesn't bounce, a real hit does
        const e = this.spec.wallBounce * clamp((-vn - 0.5) / 2.5, 0, 1);
        const j = -(1 + e) * vn / this._kAt(rr, nn);
        this._impulse(nn, j, rr);
        if (pass === 0 && -vn > worstV) { worstV = -vn; wx = p.x; wy = p.y; wz = p.z; }
        // friction against the wall
        const v2 = this._velAt(rr, tmpD);
        const vn2 = v2.dot(nn);
        const t = new V3(v2.x - nn.x * vn2, v2.y - nn.y * vn2, v2.z - nn.z * vn2);
        const tl = t.length();
        if (tl > 0.01) {
          t.scale(1 / tl);
          const jt = Math.min(0.28 * j, tl / this._kAt(rr, t));
          this._impulse(t, -jt, rr);
          if (tl > 3) this.scraping = true;
        }
      }
    }
    if (corrN) this.pos.addScaled(corrN, Math.min(corrPen, 0.5) * 0.7);
    if (touched) this.scraping = this.scraping || worstV > 0;
    if (worstV > 1.5) this.events.push({ type: 'wall', speed: worstV, x: wx, y: wy, z: wz });
  }
  _impulse(dir, j, r) {
    this.vel.addScaled(dir, j / this.mass);
    tmpD.cross(r, dir).scale(j);
    this._invIMul(tmpD, tmpA);
    this.angVel.add(tmpA);
  }

  // ----------------------------------------------------------- helpers
  /** World-space up vector y component: 1 = upright, -1 = on the roof. */
  get uprightness() { return this.ay.y; }
  get skidLevel() { return Math.max(...this.wheels.map((w) => w.skid)); }
  get loadedWheels() { return this.wheels.filter((w) => w.contact).length; }
}
