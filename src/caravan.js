// A caravan on a tow hitch. The car and the caravan are two separate bodies joined at the tow ball:
//  * the caravan is a flat (ground-plane) body: its position, its heading, how fast it is moving and turning;
//  * a stiff spring-and-damper joins the ball on the car to the drawbar on the caravan, and the same force goes back on the car
//    (so a heavy caravan drags the car back and a swinging one tugs the tail around: it can snake, and it can jack-knife);
//  * the caravan's tyres grip sideways, so it wants to trail straight behind;
//  * height comes from the road under its axle, and its nose is held up by the ball, so it pitches over crests and flies off jumps.
// Nothing here imports three.js: see caravanView.js for how it looks.

import { V3, clamp } from './math.js';
import { wallDamage } from './damage.js';

const G = 9.81;

export const CARAVAN = {
  mass: 450,              // kg: a small 1960s caravan, about half the Escort's weight
  dAxle: 2.4,             // m from the axle to the tow ball (as measured from the model; main.js also sets it once the model has loaded)
  rear: -1.63, front: 2.0,  // m from the axle to the back and the front of the caravan's body (the drawbar sticks out past `front`)
  hp: 60,                 // how much battering the caravan takes before it is wrecked: its wheels fly off and the car has to drag it around
  wallMul: 14, carMul: 5,  // a caravan's thin skin takes more from the same knock than a car does
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
  // every other car except the bus, campervan and motor home: ball about 0.1 m behind the rear bumper (body length / 2 + 0.1)
  car: { x: 0, y: -0.02, z: -2.55 },
  'v8-pilot': { x: 0, y: -0.02, z: -2.32 },
  mini: { x: 0, y: -0.02, z: -1.63 },
  'french-cheese': { x: 0, y: -0.02, z: -2.02 },
  panda: { x: 0, y: -0.02, z: -1.87 },
  'mobility-car': { x: 0, y: -0.02, z: -1.55 },
  'tuk-tuk': { x: 0, y: -0.02, z: -1.5 },
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
    this.health = this.spec.hp; this.wrecked = false;   // knocked about; once it is wrecked its wheels come off and the car drags it along, scraping
    this.events = [];         // knocks this step ({type:'van', kind, speed, x, y, z}, or {type:'van-lost'}), for sound and sparks
    this.sway = 0; this.swayRate = 0;   // top-heavy rocking from side to side, radians (just for looks)
    this._wq = null; this._I = 600;
    this.dist = 0;            // m: how far the ball is from the drawbar (should be about zero)
  }

  /** The axle's position, where the wheels are. */
  get axle() { const f = this.spec.cog; return tmpAx.set(this.pos.x - Math.sin(this.yaw) * f, this.pos.y, this.pos.z - Math.cos(this.yaw) * f); }

  /** The ball on the car, in the world. */
  ballOn(car, out = this._ball) { return car.toWorld(tmpH.set(this.hitch.x, this.hitch.y, this.hitch.z), out); }

  /** Put the caravan straight behind `car`, moving with it, and hold it there for a moment while the car settles on its springs. */
  reset(car) { this._place(car); this.settleT = 0.6; this.health = this.spec.hp; this.wrecked = false; this.scrapeT = 0; this.sway = this.swayRate = 0; this.events.length = 0; }

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
    const m = s.mass, I = this._I = m * (s.length * s.length + s.width * s.width) / 12 * 0.6 + m * 0.1;
    const vLong = this.vel.x * fx + this.vel.z * fz, vLat = this.vel.x * lx + this.vel.z * lz;
    const wr = this.wrecked;                            // wheels gone: it is dragged along on its belly, scraping, and grips and drags a lot less smoothly
    const grip = (wr ? 0.6 : s.tyreMu) * m * G * (this.onGround ? 1 : 0);
    const vLatAxle = vLat - this.yawRate * s.cog;       // the tyres feel the sideways speed at the axle, which swings as the caravan turns
    const fLat = clamp(-m * s.tyreStiff * vLatAxle, -grip, grip);
    const fLong = this.onGround ? -Math.sign(vLong) * Math.min(Math.abs(vLong) * m / dt * 0.5, (wr ? 0.55 : s.rolling) * m * G) : 0;
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
    // top-heavy: the body rocks out the way the sideways push does, and rolls back and forth on its springs
    const aLat = ax * lx + az * lz;
    const swayT = clamp(aLat / G * 0.1, -0.1, 0.1);
    this.swayRate += (38 * (swayT - this.sway) - 4 * this.swayRate) * dt;
    this.sway = clamp(this.sway + this.swayRate * dt, -0.14, 0.14);
    this._walls();
    this.spin += this.wrecked ? 0 : (this.vel.x * fx + this.vel.z * fz) * dt / s.wheelR;
    if (this.wrecked && this.onGround) { this.scrapeT -= dt; const sp = Math.hypot(this.vel.x, this.vel.z); if (this.scrapeT <= 0 && sp > 3) { this.scrapeT = 0.06; if (this.events.length < 12) this.events.push({ type: 'van-scrape', speed: sp, x: this.pos.x - fx * 0.8, y: this.pos.y - s.wheelR * 0.6, z: this.pos.z - fz * 0.8 }); } }

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
    if (this.auto && !this.wrecked) { this.foldT = Math.abs(rel) > 0.9 ? (this.foldT || 0) + dt : 0; if (this.foldT > 1.2) { this.foldT = 0; this._place(car); this.settleT = 0.25; return; } }

    // and the same pull the other way on the car, at the ball: force -J, torque r x (-J)
    car.F.x -= jx; car.F.z -= jz;
    car.T.x += cr.y * -jz; car.T.y += cr.z * -jx - cr.x * -jz; car.T.z += cr.y * jx;
  }
  // ------------------------------------------------------------ knocks
  /** The caravan takes `hp` of damage. When it runs out the hitch gives way. */
  hurt(hp) {
    if (!(hp > 0) || this.health <= 0) return;
    this.health = Math.max(0, this.health - hp);
    if (this.health <= 0 && !this.wrecked) { this.wrecked = true; if (this.events.length < 12) this.events.push({ type: 'van-wrecked', x: this.pos.x, y: this.pos.y, z: this.pos.z }); }
  }
  /** A knock of `speed` m/s at a point (for sound, sparks and shaking the camera) and what it cost, in hit points. */
  struck(kind, speed, x, y, z, hp) {
    if (this.events.length < 12) this.events.push({ type: 'van', kind, speed, x, y, z, hp });
    this.hurt(hp);
  }
  /** Where the caravan's three round "bumpers" are (world x, z), and how big they are. They stand in for the box of the body. */
  bumpers(out) {
    const s = this.spec, sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw), ax = this.pos.x - sinY * s.cog, az = this.pos.z - cosY * s.cog;
    const r = Math.max(0.5, s.width * 0.47), a = s.rear + r, b = s.front - r;
    for (let k = 0; k < 3; k++) { const zr = a + (b - a) * k * 0.5; out[k * 2] = ax + sinY * zr; out[k * 2 + 1] = az + cosY * zr; }
    return r;
  }
  /** Sideways-and-along speed of the caravan's body at a world point, written to `out` (x, z). */
  velAt(px, pz, out) { const rx = px - this.pos.x, rz = pz - this.pos.z; out.x = this.vel.x + this.yawRate * rz; out.z = this.vel.z - this.yawRate * rx; return out; }
  /** How easily a push along (nx, nz) at (px, pz) moves it: 1 / effective mass. */
  invMassAt(nx, nz, px, pz) { const rx = px - this.pos.x, rz = pz - this.pos.z, arm = rz * nx - rx * nz; return 1 / this.spec.mass + arm * arm / this._I; }
  /** An impulse j along (nx, nz) at (px, pz). */
  impulse(nx, nz, j, px, pz) {
    const rx = px - this.pos.x, rz = pz - this.pos.z;
    this.vel.x += nx * j / this.spec.mass; this.vel.z += nz * j / this.spec.mass;
    this.yawRate = clamp(this.yawRate + (rz * nx - rx * nz) * j / this._I, -5, 5);
  }

  /** Walls: six points round the body against the road's barriers, with impulses. */
  _walls() {
    const T = this.track;
    if (!T) return;
    if (!this._wq) this._wq = T.constructor.newQuery();
    const s = this.spec, sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw), m = s.mass, I = this._I, y = this.pos.y + 0.4;
    const ax = this.pos.x - sinY * s.cog, az = this.pos.z - cosY * s.cog, hw = s.width * 0.47;
    let corrPen = 0, cnx = 0, cnz = 0, worst = 0, wx = 0, wz = 0;
    for (let k = 0; k < 6; k++) {
      const zr = k < 2 ? s.rear : k < 4 ? (s.rear + s.front) * 0.5 : s.front, side = k & 1 ? 1 : -1;
      const px = ax + sinY * zr + cosY * hw * side, pz = az + cosY * zr - sinY * hw * side;
      T.query(px, y, pz, this._wq, 0.8);
      const q = this._wq, pen = T.wallPenetration(q, y);
      if (pen <= 0) continue;
      const sg = q.d < 0 ? -1 : 1, nx = -q.lx * sg, nz = -q.lz * sg;
      const rx = px - this.pos.x, rz = pz - this.pos.z;
      const vx = this.vel.x + this.yawRate * rz, vz = this.vel.z - this.yawRate * rx, vn = vx * nx + vz * nz;
      if (pen > corrPen) { corrPen = pen; cnx = nx; cnz = nz; }
      if (vn >= 0) continue;
      const arm = rz * nx - rx * nz, e = 0.25 * clamp((-vn - 0.5) / 2.5, 0, 1);
      const j = -(1 + e) * vn / (1 / m + arm * arm / I);
      this.vel.x += nx * j / m; this.vel.z += nz * j / m; this.yawRate = clamp(this.yawRate + arm * j / I, -5, 5);
      if (-vn > worst) { worst = -vn; wx = px; wz = pz; }
    }
    if (corrPen > 0) { const c = Math.min(corrPen, 0.5) * 0.7; this.pos.x += cnx * c; this.pos.z += cnz * c; }
    if (worst > 1.5) this.struck('wall', worst, wx, y, wz, wallDamage(m, worst) * s.wallMul);
  }
}

const tmpH = new V3(), tmpR = new V3(), tmpAx = new V3();
