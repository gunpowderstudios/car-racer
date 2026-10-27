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
/** Every vehicle's tyres grip this much more than its profile says (one place to turn all the grip up or down). */
export const GRIP_BOOST = 1.15;
export const GRIP_BOOST_REAR = 1.25;   // the back tyres get a little more of it than the front ones, so the extra grip makes the cars steadier rather than spinnier
/** While a drift is held, the slide bends the car's path into the corner by this much (m/s², about 0.6 g at full effect) and gives back this share of the speed the slide would scrub off. */
export const DRIFT_PULL = 6, DRIFT_KEEP = 0.5;
export const ROLL_K = 140, ROLL_C = 20, ROLL_GUARD_TOW = 0.5;      // the drift roll guard (see Vehicle._rollGuard)
export const HILL_CRAWL = 8.2;     // m/s of game speed = 20 mph on the speedometer (20 / 2.237 / GAME_SPEED): the slowest a car may be made to climb a hill

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
    muFront: 1.15, muRear: 1.2, B: 11, C: 1.25, E: 0,
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
  // Nitro: a push along the nose while held. The tank drains in `burn` seconds and refills in
  // `refill` seconds; once empty it has to refill to `restart` before it fires again.
  boost: { accel: 4.8, airShare: 0.35, burn: 3.2, refill: 9, restart: 0.2 },
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

/** A body zone with more than this share of its armour gone is wrecked enough to disable what it carries (rear: nitro, front: drift). */
export const HURT_LOCKOUT = 0.75;

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

const WATER_DRAG = 0.35;      // 1/s: deceleration per m/s of speed while a wheel is in standing water
export class Vehicle {
  constructor(spec = CAR) {
    this.spec = spec;
    this.boostFuel = 1;           // 0..1 nitro tank (kept across respawns)
    this.pos = new V3(); this.vel = new V3(); this.angVel = new V3();
    this.rot = new Q();
    this.ax = new V3(1, 0, 0); this.ay = new V3(0, 1, 0); this.az = new V3(0, 0, 1);
    this.F = new V3(); this.T = new V3();
    this.q = Track.newQuery();
    this.events = [];
    this.hurt = { front: 0, back: 0, left: 0, right: 0, roof: 0 };   // 0..1 share of each body zone's armour lost; derby.js keeps it up to date. Damaged cars drive worse (see _steer, _tyre, the engine force)
    this.lockMul = 1;                                        // front-wheel lock multiplier: main.js gives the player's car 1.15 (tighter turns); rivals and bots keep 1
    this.engineOff = false; this.crank = 0;                  // stalled by a big hit: throttle and boost are dead until the driver restarts it (restartEngine)
    this._in = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
    this.opts = { assist: 0.7, stability: 0 };   // stability 0..1: the Arcade handling layer (yaw limiter, traction control), see _stability
    this.respec();
    this.reset(new V3(0, this.restHeight, 0), new V3(0, 0, 1), new V3(0, 1, 0));
  }

  /** (Re)build everything that is worked out from the spec: mass, inertia, wheel positions, hull and ride height. The player's car calls this
   *  when a different vehicle is picked on the menu (CAR is rewritten in place first), so the game does not need to reload. */
  respec() {
    const spec = this.spec;
    this.mass = spec.mass;
    this.invI = new V3(1 / spec.inertia.x, 1 / spec.inertia.y, 1 / spec.inertia.z);
    this.wheels = [0, 1, 2, 3].map((i) => new Wheel(i, spec));
    this.hullWorld = spec.hull.map(() => new V3());
    // Static ride height: wheel centre at R above ground, suspension length = free - static compression
    const sprungFront = spec.mass * spec.frontWeight / 2;
    const xs = sprungFront * G / spec.susp.kFront;
    this.restHeight = spec.wheelRadius + (spec.susp.free - xs) - spec.mountY;
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
    this.driftActive = false; this.driftBlend = 0; this.driftTarget = 0; this.driftBase = 0; this._handPrev = false;
    this.boosting = false; this.engineOff = false; this.crank = 0;
    this.events.length = 0;
    if (this.tow) this.tow.reset(this);                       // a caravan goes back behind the car
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
    this.roadMu = track && track.def && track.def.dirt ? 0.9 : 1;       // loose dirt grips less than asphalt
    const sp = this.spec;
    this._axes();
    this.F.set(0, -this.mass * G, 0);
    this.T.set(0, 0, 0);
    if (this.tow) this.tow.applyTo(this, dt);                 // a caravan on the hitch (see caravan.js): its pull goes on F and T

    // --- damage takes things away: a stalled engine ignores the throttle and nitro; a wrecked rear end loses the nitro; a wrecked front end loses the drift
    {
      const i = this._in, hu = this.hurt, dead = this.engineOff || this.crank > 0;
      if (this.crank > 0) { this.crank -= dt; if (this.crank <= 0) { this.crank = 0; this.engineOff = false; } }
      i.throttle = dead ? 0 : input.throttle; i.brake = input.brake; i.steer = input.steer;
      i.handbrake = !!input.handbrake && hu.front <= HURT_LOCKOUT && !dead;
      i.boost = !!input.boost && hu.back <= HURT_LOCKOUT && !dead;
      input = i;
    }
    // --- driver inputs -> smoothed pedals, steering
    this.thr += clamp(input.throttle - this.thr, -8 * dt, 5 * dt);
    this.brk += clamp(input.brake - this.brk, -10 * dt, 7 * dt);
    const handNow = !!input.handbrake;
    this.handbrake = handNow;
    this._boost(dt, !!input.boost);
    const flatF = tmpA.set(this.az.x, 0, this.az.z);
    const fl = flatF.length() || 1; flatF.scale(1 / fl);
    this.fwdSpeed = this.vel.dot(flatF);
    const flatL = tmpB.set(flatF.z, 0, -flatF.x);      // up x forward = left
    this.latSpeed = this.vel.dot(flatL);
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.sideSlip = this.speed > 2 ? Math.atan2(this.latSpeed, Math.abs(this.fwdSpeed)) * (this.fwdSpeed >= 0 ? 1 : -1) : 0;
    this._updateDriftAssist(dt, input, handNow);
    this._steer(dt, input);

    // --- suspension and ground probes
    let contacts = 0;
    for (const w of this.wheels) this._probeWheel(w, track);
    for (const w of this.wheels) if (w.contact) contacts++;
    // anti-roll bars share load across an axle
    this._arb(0, 1, sp.susp.arbFront); this._arb(2, 3, sp.susp.arbRear);
    this.onGround = contacts > 0;
    this.airTime = this.onGround ? 0 : this.airTime + dt;
    if (this.boosting) this.F.addScaled(this.az, this.mass * sp.boost.accel * (contacts >= 2 ? 1 : sp.boost.airShare));

    // --- drivetrain
    const drv = this._drivetrain(dt, input);

    // --- tyres
    this.scraping = false;
    for (const w of this.wheels) {
      if (!w.contact) { w.skid = 0; w.slipAngle = 0; w.spin += this.fwdSpeed / this.spec.wheelRadius * dt; continue; }   // in the air a wheel keeps turning (it used to freeze)
      this._tyre(w, drv, dt);
    }
    this._applyDriftYawAssist();
    this._rollGuard(dt);
    this._stability(dt);

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
    if (track.rocks) this._rocks(track);

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

  // ----------------------------------------------------------- drift assist
  _updateDriftAssist(dt, input, handNow) {
    const steer = clamp(input.steer, -1, 1);
    const atDriftSpeed = this.onGround && this.fwdSpeed > 5 && this.speed > 7;
    const wantsCorner = Math.abs(steer) > 0.08 || Math.abs(this.sideSlip) > 0.06;

    // Holding Drift at speed is a "ready" state, not a handbrake. If the driver presses
    // Shift before turning, wait for steering input and then initiate the slide.
    if (handNow && !this.driftActive && atDriftSpeed && wantsCorner) {
      // Drift is a deliberate powered slide, not merely an assist for a slide that already exists.
      // Positive steer is left; sideSlip has the opposite sign in this body coordinate system.
      const sign = Math.abs(steer) > 0.08
        ? -Math.sign(steer)
        : (Math.sign(this.sideSlip) || 1);
      this.driftBase = clamp(0.30 + Math.abs(steer) * 0.16, 0.30, 0.52);
      this.driftTarget = sign * this.driftBase;
      this.driftActive = true;

      // Give the rear a controlled initial rotation into the chosen corner so pressing Drift
      // is immediately visible. The sustained yaw spring below catches it before it spins out.
      const yawKick = 0.65 + Math.abs(steer) * 0.45;
      this.angVel.addScaled(this.ay, -sign * yawKick);
    }

    // Once a drift has started, keep it latched until Shift/Drift is released or speed falls away.
    if (!handNow || !atDriftSpeed) {
      this.driftActive = false;
    }

    if (this.driftActive) {
      // Steering can trim the captured angle without turning the assist into an arcade rail.
      const sign = Math.sign(this.driftTarget) || 1;
      const intoCorner = clamp(-sign * steer, -1, 1);
      const mag = clamp(this.driftBase + intoCorner * 0.14, 0.24, 0.58);
      this.driftTarget = sign * mag;
      this.driftBlend += (1 - this.driftBlend) * (1 - Math.exp(-dt / 0.10));
    } else {
      // Restore normal rear grip smoothly on release instead of snapping straight.
      this.driftBlend *= Math.exp(-dt / 0.32);
      if (this.driftBlend < 0.01) this.driftBlend = 0;
    }

    this._handPrev = handNow;
  }

  /**
   * A drift never rolls the car: while it is on, a strong spring-and-damper about the car's long axis holds it from tipping over (a drift is a
   * controlled slide, and a tip-over in the middle of one only ever felt like a bug). It fades out over most of a second after the drift ends, so
   * the car is not dropped into a roll the moment you let go. Towing a caravan gets a lighter version: the van yanks the tail sideways and the
   * grip then tips the car over far more easily than it would roll on its own.
   */
  _rollGuard(dt) {
    // The guard eases IN over about a third of a second when a drift starts (switching it on at full strength used to slam a leaning car down onto the road
    // the instant Shift was pressed) and fades out over most of a second afterwards.
    this.rollGuard = this.driftActive || this.driftBlend > 0.05 ? (this.rollGuard || 0) + (1 - (this.rollGuard || 0)) * (1 - Math.exp(-dt / 0.3)) : (this.rollGuard || 0) * Math.exp(-dt / 0.7);
    const g = Math.max(this.rollGuard < 0.02 ? 0 : this.rollGuard, this.tow && !this.tow.wrecked ? ROLL_GUARD_TOW : 0, this.spec.rollGuard || 0, this.aiRollGuard || 0);      // AI rivals can get extra stability without changing the player's vehicle
    if (g <= 0 || !this.onGround) return;
    const roll = -this.ay.z * this.az.x + this.ay.x * this.az.z;                       // (ay x up) along the car's long axis: the sine of how far it has rolled, signed so a torque of +roll rights it
    const rate = this.angVel.dot(this.az);
    const acc = (ROLL_K * roll - ROLL_C * rate) * g;
    this.T.addScaled(this.az, acc * this.spec.inertia.z);
  }

  _applyDriftYawAssist() {
    if (this.driftBlend <= 0 || !this.onGround || this.fwdSpeed <= 4) return;
    const yawRate = this.angVel.dot(this.ay);
    const error = this.driftTarget - this.sideSlip;
    // Positive local yaw makes sideSlip more negative, hence the minus sign.
    // Think of this as a soft spring/damper around the chosen drift angle, not an angle lock.
    const yawAccel = clamp(-error * 9.5 - yawRate * 2.5, -6.2, 6.2) * this.driftBlend;
    this.T.addScaled(this.ay, yawAccel * this.spec.inertia.y);
    // the tuck: a drift is how you take a corner faster than the grip line, so the path bends in with the slide
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 6 && Math.abs(this.sideSlip) > 0.15) {
      const turn = -Math.sign(this.driftTarget), ramp = clamp(sp / 15, 0, 1) * clamp((Math.abs(this.sideSlip) - 0.15) / 0.2, 0, 1) * this.driftBlend;
      this.F.x += turn * (this.vel.z / sp) * this.mass * DRIFT_PULL * ramp;
      this.F.z -= turn * (this.vel.x / sp) * this.mass * DRIFT_PULL * ramp;
      // keep the speed: the tuck pulls sideways on a moving car, which would otherwise shed speed; hold that share of it
      this.F.x += (this.vel.x / sp) * this.mass * DRIFT_PULL * DRIFT_KEEP * 0.25 * ramp;
      this.F.z += (this.vel.z / sp) * this.mass * DRIFT_PULL * DRIFT_KEEP * 0.25 * ramp;
    }
  }

  /**
   * Arcade handling layer (opts.stability 0..1; 0 is the raw tyre physics). Like the stability control on a modern car, or the
   * arcade layer on top of the physics in most racing games: if the car is turning faster than the steering (and the grip) can
   * explain - the rear has let go - a yaw torque pulls it back into line, so a lift-off, a brake or a stab of throttle
   * mid-corner swings the tail but does not spin the car. It stands aside whenever you are deliberately drifting.
   */
  _stability(dt) {
    const k = this.opts.stability;
    if (!(k > 0)) { this.stabTorque = 0; return; }
    const sp = this.spec, drifting = Math.max(this.driftBlend, this.handbrake ? 1 : 0);
    if (!this.onGround || this.fwdSpeed < 5 || drifting > 0.05) { this.stabTorque = 0; return; }
    const yaw = this.angVel.dot(this.ay);
    // What the front wheels are asking for (a bicycle model with a little built-in understeer), never more than the tyres can give
    const v = this.fwdSpeed;
    const ref = v * Math.tan(this.steerAngle) / sp.wheelbase / (1 + (v / 32) ** 2);
    const lim = 1.05 * sp.tyre.muRear * GRIP_BOOST_REAR * 9.81 / Math.max(v, 4);
    const want = clamp(ref, -lim, lim);
    // how much faster than wanted it is turning, in the direction it is already turning (turning the wrong way counts in full)
    const over = Math.sign(yaw) === Math.sign(want) || Math.abs(want) < 0.05 ? Math.abs(yaw) - Math.abs(want) : Math.abs(yaw) + Math.abs(want);
    const tol = 0.18;                                              // rad/s of slack before it steps in
    const alpha = over > tol ? clamp((over - tol) * 7 * k, 0, 5.5 * k) : 0;    // rad/s^2 of correcting yaw acceleration
    this.stabTorque = alpha;
    if (alpha > 0) this.T.addScaled(this.ay, -Math.sign(yaw) * alpha * sp.inertia.y * (1 - drifting));
  }

  // -------------------------------------------------------------- steering
  /** Switch a stalled engine back on: it cranks for a moment, then the car is drivable again. */
  restartEngine() { if (this.engineOff && this.crank <= 0) { this.crank = 1.6; return true; } return false; }

  _steer(dt, input) {
    const st = this.spec.steer;
    const target = clamp(input.steer, -1, 1);
    const rate = (Math.abs(target) > Math.abs(this.steerState) || target * this.steerState < 0 ? st.rate : st.returnRate)
      * (this.speed > 25 ? 0.65 : 1);
    this.steerState += clamp(target - this.steerState, -rate * dt, rate * dt);
    const v = Math.max(this.speed, 0.1);
    // Full lock at low speed, tapering to roughly the front tyres' peak slip angle at speed.
    const lock = Math.min(st.max * this.lockMul, 0.17 + 36.6 / Math.max(v * v, 60));
    const hu = this.hurt;
    let angle = this.steerState * lock;
    angle *= angle > 0 ? 1 - 0.5 * hu.left : 1 - 0.5 * hu.right;                  // a crumpled left side turns left less, a crumpled right side turns right less...
    if (this.speed > 3) angle += 0.022 * (hu.left - hu.right);                      // ...and a hurt side drags the car towards it
    // Counter-steer assist: when the REAR axle slides past its grip, point the front
    // wheels along the direction of travel. Normal cornering never triggers it.
    let assist = 0;
    if (this.opts.assist > 0 && this.speed > 4 && this.fwdSpeed > 2 && this.onGround) {
      const b = this.spec.frontWeight * this.spec.wheelbase;            // COM to rear axle
      const yawRate = this.angVel.dot(this.ay);
      const rearSlip = Math.atan2(this.latSpeed - yawRate * b, Math.max(this.fwdSpeed, 2));
      const stab = this.opts.stability || 0;                              // Arcade handling: the helper steps in earlier, harder and quicker
      const over = Math.max(0, Math.abs(rearSlip) - (0.12 - 0.04 * stab));
      const gain = this.opts.assist * clamp((this.speed - 4) / 6, 0, 1);
      assist = Math.sign(rearSlip) * clamp(over * (1 + 0.5 * stab) * gain, 0, 0.28 + 0.06 * stab);
    }
    this.assistAngle += (assist - this.assistAngle) * (1 - Math.exp(-dt / (0.12 - 0.04 * (this.opts.stability || 0))));   // no snapping
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
    w.wet = track.puddles ? track.puddleAt(P.x, P.z) : 0;          // standing in a puddle?

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
  /** Nitro tank: drains while boosting, refills otherwise. Needs a forward gear. */
  _boost(dt, want) {
    const b = this.spec.boost;
    const can = this.gear > 0 && this.boostFuel > 0 && (this.boosting || this.boostFuel >= b.restart);
    this.boosting = want && can;
    this.boostFuel = this.boosting ? Math.max(0, this.boostFuel - dt / b.burn) : Math.min(1, this.boostFuel + dt / b.refill);
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
    // Assisted Drift keeps the engine pulling; only the old low-speed/straight handbrake cuts drive.
    if (this.handbrake && !this.driftActive && this.speed <= 7) drive = 0;

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
    force *= Math.max(0.1, this.aiEngineMul || 1);   // arcade race AI equaliser; players and demolition rivals stay at 1
    force *= 1 - 0.30 * this.hurt.roof - 0.12 * this.hurt.back - 0.06 * this.hurt.front;   // a crushed roof costs top speed; a hurt rear end or front costs a little power too
    if (this.gear === -1 && fwd < -9) force = 0;          // reverse is slow
    // hill assist: on a steep climb the engine (at stall revs) and the tyres could not quite hold the car, so it slid back. Any car can climb any hill, and keep moving:
    // with the pedal down and the nose up, the pull is enough to beat gravity along the slope (for the car AND the caravan it tows) until it is doing HILL_CRAWL, about
    // 20 mph on the speedometer, then it fades out so the engine takes over (the tyres' own grip still limits it, see _tyre). Rival cars drive on this same code.
    if (this.onGround && drive > 0.1 && this.gear !== 0) {
      const dir = this.gear === -1 ? -1 : 1, up = Math.max(0, this.az.y * dir);
      if (up > 0.05) {
        const m = this.mass + (this.tow && !this.tow.wrecked ? this.tow.spec.mass : 0), room = 1 - clamp((Math.abs(fwd) - HILL_CRAWL) / 1.6, 0, 1);
        force = dir * Math.max(Math.abs(force), m * 9.81 * up * 1.25 * drive * room);
      }
    }
    // engine braking when off the throttle
    if (drive < 0.05 && this.gear > 0 && this.rpm > e.idle + 400) {
      force -= Math.sign(fwd) * e.engineBrake * Math.abs(ratio) / this.spec.wheelRadius * clamp(Math.abs(fwd) / 3, 0, 1);
    }
    const hold = drive < 0.02 && brakeCmd < 0.02 && Math.abs(fwd) < 0.5 && !this.handbrake && !this.boosting ? 1 : 0;
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

    const surfMu = (w.surface === SURF.ROAD ? (this.roadMu || 1) : 0.6) * (1 - 0.28 * (w.wet || 0));
    const muBase = w.front ? ty.muFront * GRIP_BOOST : ty.muRear * GRIP_BOOST_REAR;
    const driftRearGrip = !w.front ? 1 - 0.34 * this.driftBlend : 1;
    const hurtGrip = 1 - 0.14 * (w.left ? this.hurt.left : this.hurt.right) - (w.front ? 0.06 * this.hurt.front : 0.10 * this.hurt.back);   // a bent corner grips less
    // climbing: the driven tyres bite harder the steeper it is (the weight shifts back and the tread digs in), so a car with its foot down does not slide back
    const climb = w.driven && drv.force !== 0 ? clamp(f.y * Math.sign(drv.force), 0, 0.8) : 0;
    const mu = muBase * surfMu * driftRearGrip * hurtGrip * (1 + 1.4 * climb) * clamp(1 - ty.loadSens * (Fz / ty.nominalLoad - 1), 0.6, 1.25);
    const Fmax = mu * Fz;
    const capL = 0.25 * mEffLong / dt, capT = 0.25 * mEffLat / dt;
    // At speed in a turn, Shift/Hand becomes a controlled drift rather than fully locking the rear.
    const lockedHB = this.handbrake && !this.driftActive && this.speed <= 7 && !w.front;
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
        // traction control (Arcade): in a corner, keep the driven tyres off the very edge of grip so the rear still has side grip
        const tc = this.opts.stability > 0 && !this.handbrake && this.driftBlend < 0.05 ? this.opts.stability * clamp(Math.abs(this.angVel.dot(this.ay)) / 0.25, 0, 1) : 0;
        const lim = (0.97 - 0.2 * tc) * Fmax;
        if (Math.abs(want) > lim) { Fx += Math.sign(want) * lim; spinning = true; } else Fx += want;
      }
      let brakeF = drv.brake * sp.brakeTotal * (w.front ? sp.brakeBias : 1 - sp.brakeBias) / 2;
      if (drv.hold) brakeF = Math.max(brakeF, 2600);
      brakeF = Math.min(brakeF, 0.8 * Fmax);
      const sgn = vlong >= 0 ? 1 : -1;
      const mag = Math.abs(vlong);
      if (brakeF > 0) Fx -= sgn * Math.min(brakeF, capL * mag);
      const rr = ty.rolling * (w.surface === SURF.ROAD ? 1 + 3 * (w.wet || 0) : 8) * Fz;
      Fx -= sgn * Math.min(rr, capL * mag);
      Fx = clamp(Fx, -Fmax, Fmax);
      if (w.wet > 0) Fx -= sgn * Math.min(WATER_DRAG * (this.mass / 4) * w.wet * mag, capL * mag);   // wading through a puddle slows the car (about 2-4 m/s per puddle at speed)

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
  /** Boulders: solid upright cylinders. A hull point inside one is pushed out and bounces off like a wall. */
  _rocks(track) {
    const hull = this.spec.hull;
    let worstV = 0, wx = 0, wy = 0, wz = 0, nx = 0, nz = 0, pen = 0;
    for (const rk of track.rocks) {
      const ddx = this.pos.x - rk.x, ddz = this.pos.z - rk.z, reach = rk.r + 4;
      if (ddx * ddx + ddz * ddz > reach * reach || this.pos.y > rk.y + rk.h + 3) continue;
      const R = rk.r * 0.9;
      for (let i = 0; i < hull.length; i++) {
        const p = this.toWorld(hull[i], this.hullWorld[i]);
        if (p.y > rk.y + rk.h * 0.85 || p.y < rk.y - 1.5) continue;
        const dx = p.x - rk.x, dz = p.z - rk.z, d = Math.hypot(dx, dz);
        if (d >= R) continue;
        const n = tmpE.set(d > 1e-4 ? dx / d : 1, 0, d > 1e-4 ? dz / d : 0);
        const r = tmpC.copy(p).sub(this.pos), v = this._velAt(r, tmpD), vn = v.dot(n) - (rk.vx ? rk.vx * n.x : 0) - (rk.vz ? rk.vz * n.z : 0);      // (a rolling boulder: speed relative to it)
        if (R - d > pen) { pen = R - d; nx = n.x; nz = n.z; }
        if (vn >= 0) continue;
        const rr = r.clone(), nn = n.clone();
        const e = this.spec.wallBounce * clamp((-vn - 0.5) / 2.5, 0, 1);
        this._impulse(nn, -(1 + e) * vn / this._kAt(rr, nn), rr);
        if (-vn > worstV) { worstV = -vn; wx = p.x; wy = p.y; wz = p.z; }
      }
    }
    if (pen > 0) { this.pos.x += nx * Math.min(pen, 0.5) * 0.7; this.pos.z += nz * Math.min(pen, 0.5) * 0.7; }
    if (worstV > 0) this.scraping = true;
    if (worstV > 1.5) this.events.push({ type: 'wall', speed: worstV, x: wx, y: wy, z: wz });
  }
  _impulse(dir, j, r) {
    this.vel.addScaled(dir, j / this.mass);
    tmpD.cross(r, dir).scale(j);
    this._invIMul(tmpD, tmpA);
    this.angVel.add(tmpA);
  }

  // ------------------------------------------- hooks for things the car can hit
  /** Recompute the body axes from the current rotation (they are otherwise one step stale after step()). */
  refreshFrame() { this._axes(); }
  /** Apply impulse j (N s) along unit vector u at world point p. */
  impulseAt(u, j, p) { this._impulse(u, j, tmpC.copy(p).sub(this.pos)); }
  /** 1 / effective mass for a push along unit vector u at world point p (translation and spin). */
  invMassAt(u, p) { return this._kAt(tmpC.copy(p).sub(this.pos), u); }
  /** Velocity of the body at world point p. */
  velocityAt(p, out) { return this._velAt(tmpC.copy(p).sub(this.pos), out); }

  // ----------------------------------------------------------- helpers
  /** World-space up vector y component: 1 = upright, -1 = on the roof. */
  get uprightness() { return this.ay.y; }
  get skidLevel() { return Math.max(...this.wheels.map((w) => w.skid)); }
  get loadedWheels() { return this.wheels.filter((w) => w.contact).length; }
}
