// A caravan on a tow hitch. The car and the caravan are two separate bodies joined at the tow ball:
//  * the caravan is a flat (ground-plane) body: its position, its heading, how fast it is moving and turning;
//  * a stiff spring-and-damper joins the ball on the car to the drawbar on the caravan, and the same force goes back on the car
//    (so a heavy caravan drags the car back and a swinging one tugs the tail around: it can snake, and it can jack-knife);
//  * the caravan's tyres grip sideways, so it wants to trail straight behind;
//  * height comes from the road under its axle, and its nose is held up by the ball, so it pitches over crests and flies off jumps.
// Nothing here imports three.js: see caravanView.js for how it looks.

import { V3, clamp } from './math.js';

const G = 9.81;

export const CARAVAN = {
  mass: 450,              // kg: a small 1960s caravan, about half the Escort's weight
  dAxle: 2.2,             // m from the axle to the tow ball (as measured from the model; main.js also sets it once the model has loaded)
  cog: 0.5,               // m: the weight sits this far ahead of the axle, as on a real caravan: it keeps the tail from wagging the car
  wheelR: 0.294,          // m (the model's wheels)
  width: 2.03, length: 4.4,
  hitchH: 0.14,           // m: ball height above the axle centre line (a car's tow ball is only ~0.45 m off the road, so the caravan sits nearly level)
  tyreMu: 0.85,           // sideways grip
  tyreStiff: 25,          // 1/s: how hard the tyres resist sliding sideways (force = mass * this * sideways speed, up to the grip limit)
  rolling: 0.016,         // rolling resistance
  jointK: 380000,         // N/m the drawbar joint
  jointC: 11000,          // N.s/m its damping
  jointMax: 38000,        // N: the most it can pull (stops a glitch becoming an explosion)
  yawDamp: 0.9,           // 1/s extra damping of the swing (air drag and tyre scrub)
};

/** Where the tow ball sits on each car, in the car's own space (x left, y up, z forward, metres from its centre of mass). */
export const HITCH = {
  escort: { x: 0, y: -0.02, z: -2.12 },
  bmw: { x: 0, y: -0.02, z: -2.27 },
  volvo: { x: 0, y: -0.02, z: -2.5 },
  saab: { x: 0, y: -0.02, z: -2.43 },
};

/** The cars that can tow the caravan, and the caravan's name and blurb for the menu. */
export const TOW_CARS = Object.keys(HITCH);
export const CARAVAN_INFO = { name: 'The Hastings 2000', blurb: "It's holiday time folks! and time to block up the roads!" };

export class Caravan {
  constructor(hitch, spec = {}) {
    this.spec = { ...CARAVAN, ...spec };
    this.hitch = { ...hitch };
    this.pos = new V3();      // centre of mass (a little ahead of the axle; see `axle`)
    this.vel = new V3();      // m/s, ground plane (y is the fall speed in the air)
    this.yaw = 0; this.yawRate = 0;
    this.pitch = 0; this.roll = 0;
    this.spin = 0;            // wheel angle, radians
    this.onGround = true;
    this.track = null;
    this._ball = new V3(); this._q = null;
    this.jackknife = 0;       // how far the caravan is folded round, radians (for the HUD or a sound)
    this.dist = 0;            // m: how far the ball is from the drawbar (should be about zero)
  }

  /** The axle's position, where the wheels are. */
  get axle() { const f = this.spec.cog; return tmpAx.set(this.pos.x - Math.sin(this.yaw) * f, this.pos.y, this.pos.z - Math.cos(this.yaw) * f); }

  /** The ball on the car, in the world. */
  ballOn(car, out = this._ball) { return car.toWorld(tmpH.set(this.hitch.x, this.hitch.y, this.hitch.z), out); }

  /** Put the caravan straight behind `car`, moving with it, and hold it there for a moment while the car settles on its springs. */
  reset(car) { this._place(car); this.settleT = 0.6; }

  _place(car) {
    const s = this.spec, b = this.ballOn(car, new V3());
    const fx = car.az.x, fz = car.az.z, fl = Math.hypot(fx, fz) || 1;
    this.yaw = Math.atan2(fx / fl, fz / fl); this.yawRate = 0;
    const dc = s.dAxle - s.cog;
    this.pos.set(b.x - Math.sin(this.yaw) * dc, 0, b.z - Math.cos(this.yaw) * dc);
    this.vel.set(car.vel.x, 0, car.vel.z);
    this.pos.y = this._groundY(this.pos.x, b.y, this.pos.z) + s.wheelR;
    this.onGround = true; this.pitch = 0; this.roll = 0; this.jackknife = 0;
  }

  _groundY(x, y, z) {
    if (!this.track) return Math.min(y, 0.0);
    if (!this._q) this._q = this.track.constructor.newQuery();
    this.track.query(x, y + 0.6, z, this._q, 1.2);
    return this._q.y;
  }

  /**
   * Called from the car's own step, after it has cleared its force and torque for the frame:
   * moves the caravan on by `dt` and adds the pull on the hitch to the car's `F` and `T`.
   */
  applyTo(car, dt) {
    // just after being put behind the car (a new race, a respawn) the car is still dropping onto its springs: keep the caravan tucked behind it and do not pull on it yet
    if (this.settleT > 0) { this.settleT -= dt; this._place(car); return; }
    const s = this.spec, sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const fx = sinY, fz = cosY;                         // caravan's forward
    const lx = cosY, lz = -sinY;                        // its sideways
    const ball = this.ballOn(car);
    const dc = s.dAxle - s.cog;
    const rx = fx * dc, rz = fz * dc;                   // centre of mass -> drawbar
    // where the drawbar is and how fast it is moving
    const tx = this.pos.x + rx, tz = this.pos.z + rz;
    const tvx = this.vel.x + this.yawRate * rz, tvz = this.vel.z - this.yawRate * rx;
    // the ball's velocity: the car's, plus its spin about its own centre
    const cr = tmpR.set(ball.x - car.pos.x, ball.y - car.pos.y, ball.z - car.pos.z);
    const cvx = car.vel.x + car.angVel.y * cr.z - car.angVel.z * cr.y, cvz = car.vel.z + car.angVel.x * cr.y - car.angVel.y * cr.x;
    // the joint
    let jx = s.jointK * (ball.x - tx) + s.jointC * (cvx - tvx);
    let jz = s.jointK * (ball.z - tz) + s.jointC * (cvz - tvz);
    const jl = Math.hypot(jx, jz);
    if (jl > s.jointMax) { jx *= s.jointMax / jl; jz *= s.jointMax / jl; }
    this.dist = Math.hypot(ball.x - tx, ball.z - tz);

    // the caravan: joint pull, tyres (sideways grip and rolling), swing damping
    const m = s.mass, I = m * (s.length * s.length + s.width * s.width) / 12 * 0.6 + m * 0.1;
    const vLong = this.vel.x * fx + this.vel.z * fz, vLat = this.vel.x * lx + this.vel.z * lz;
    const grip = s.tyreMu * m * G * (this.onGround ? 1 : 0);
    const vLatAxle = vLat - this.yawRate * s.cog;       // the tyres feel the sideways speed at the axle, which swings as the caravan turns
    const fLat = clamp(-m * s.tyreStiff * vLatAxle, -grip, grip);
    const fLong = this.onGround ? -Math.sign(vLong) * Math.min(Math.abs(vLong) * m / dt * 0.5, s.rolling * m * G) : 0;
    const ax = (jx + lx * fLat + fx * fLong) / m, az = (jz + lz * fLat + fz * fLong) / m;
    const torque = rz * jx - rx * jz - s.cog * fLat;     // the drawbar pulls the nose round; the tyres, behind the weight, pull it straight
    this.yawRate += (torque / I - this.yawRate * s.yawDamp) * dt;
    this.yawRate = clamp(this.yawRate, -4, 4);
    this.vel.x += ax * dt; this.vel.z += az * dt;
    // parked (the car is all but stopped): the caravan's brake is on, so it cannot creep or swing and drag the car about
    const park = 1 - clamp(Math.hypot(car.vel.x, car.vel.z) / 0.8, 0, 1);
    if (park > 0) { const k = Math.exp(-6 * park * dt); this.vel.x = car.vel.x + (this.vel.x - car.vel.x) * k; this.vel.z = car.vel.z + (this.vel.z - car.vel.z) * k; this.yawRate *= k; }
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.yaw += this.yawRate * dt;
    this.spin += (this.vel.x * fx + this.vel.z * fz) * dt / s.wheelR;

    // up and down: sit on the road, or fly
    const ax0 = this.pos.x - fx * s.cog, az0 = this.pos.z - fz * s.cog;
    const gy = this._groundY(ax0, Math.max(this.pos.y, ball.y), az0) + s.wheelR;
    // (it only counts as flying when the car is, or when it has really left the ground: running down a hill or over a crest it clings to the road)
    const flying = car.airTime > 0.12 || this.pos.y - gy > 0.7;
    if (flying) {
      this.vel.y -= G * dt; this.pos.y += this.vel.y * dt; this.onGround = false;
      if (this.pos.y <= gy) { this.pos.y = gy; this.vel.y = 0; this.onGround = true; }
    } else { this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 30); this.vel.y = 0; this.onGround = true; }
    // the ball holds the nose: pitch so that the drawbar meets it
    const want = clamp((ball.y - (this.pos.y + s.hitchH)) / s.dAxle, -0.6, 0.6);
    this.pitch += (Math.asin(want) - this.pitch) * Math.min(1, dt * 14);
    // lean with the road
    if (this._q && this.onGround) this.roll += (clamp(-(this._q.nx * lx + this._q.nz * lz), -0.5, 0.5) - this.roll) * Math.min(1, dt * 10);
    // folded round how far
    let rel = this.yaw - Math.atan2(car.az.x, car.az.z); rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    this.jackknife = rel;
    // a rival's caravan (auto): if it has been folded up for a while (reversing, a shunt), it is tucked straight again rather than left jammed
    if (this.auto) { this.foldT = Math.abs(rel) > 0.9 ? (this.foldT || 0) + dt : 0; if (this.foldT > 1.2) { this.foldT = 0; this._place(car); this.settleT = 0.25; return; } }

    // and the same pull the other way on the car, at the ball: force -J, torque r x (-J)
    car.F.x -= jx; car.F.z -= jz;
    car.T.x += cr.y * -jz; car.T.y += cr.z * -jx - cr.x * -jz; car.T.z += cr.y * jx;
  }
}

const tmpH = new V3(), tmpR = new V3(), tmpAx = new V3();
