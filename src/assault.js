// Apple Crumple: the rules and the hazards of the solo obstacle course. No three.js in here, so it runs (and is tested) in Node.
//
// Every hazard is a pure function of one clock (`t`, seconds since the run was set up), so what you see (assaultView.js) is
// exactly what hits you. Contact is real: a hazard that touches the car's body shoves it with an impulse (car.impulseAt) and
// takes hit points off the zone it struck through the derby's damage model. Nothing here is decoration.
//
//   def.assault = { stage: { time, step }, hoop: { s, h, r }, checkpoints: [s], hammers: [{ s, phase, speed, reach }], arms: [{ s, speed, len }],
//                   presses: [{ s, phase }], boulders: [{ s, phase, side }], signs: [{ s, kind }] }
//
// `s` is metres along the road from the start line.  The run: the clock starts as you cross the line and each STAGE (the road between
// two checkpoints) has its own countdown - 20 s for the first, 2 s less for each one after. A checkpoint repairs the car, becomes your
// restart point and starts the next stage's clock; a wreck, a fall or a reset costs time; the finish is a flaming hoop you jump through.

import { zoneAt } from './damage.js';

export const COURSE = {
  stage: { time: 20, step: 2, min: 6 },     // the first stage's clock, how much shorter each later stage's is, and the shortest allowed
  penalty: { wreck: 5, fall: 3, reset: 3, hoop: 10 },     // seconds off the stage clock (the hoop one is added to your finishing time)
  medals: { gold: 58, silver: 68, bronze: 80 },     // finishing times (penalties included) that earn each medal
  // pendulum hammer: a gantry across the road, a rod, and a heavy head swinging side to side
  hammer: { pivot: 13.6, rod: 12.8, r: 1.55, reach: 7.2, speed: 1.0, hp: 9999, punch: 12 },      // (a hammer blow, a crush or a burst of fire is a wreck: hp 9999 is more than any zone has)
  // rolling boulder: waits beside the road, then rolls across it
  boulder: { r: 1.8, speed: 9.5, wait: 1.8, hp: 26, punch: 9 },
  // spinning arm: a pole in the middle of the road and a bar sweeping round it at knee height
  arm: { len: 6.4, speed: 0.85, r: 0.6, y: 0.9, hp: 11, punch: 4.5, pole: 0.8 },
  // crushing press: a block of concrete hanging over the road (green light: safe; amber: it is about to drop; it slams, stays down, rises)
  press: { period: 4.4, safe: 2.5, warn: 0.75, slam: 0.2, down: 0.55, up: 4.6, thick: 3, depth: 6.5, hp: 9999 },
  car: { hx: 0.95, hy: 0.55, hz: 2.4, cy: 0.18 },   // the car's body as a box about its centre of mass
  // fire pit: a pit in the road that, at random moments (a warning glow first), shoots a column of flame into the air and throws a car above it
  fire: { r: 2.3, height: 13, warn: 0.9, burst: 1.1, hp: 9999, launch: 10 },
  cooldown: 0.55,             // seconds before the same hazard can hurt you again
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ the hazards as functions of time

/** Where a hammer's head is at time t: lateral offset from the road centre, and height above the road. */
export function hammerHead(h, t, C = COURSE.hammer) {
  const off = Math.sin(t * h.speed + h.phase) * h.reach;
  const drop = Math.sqrt(Math.max(1, C.rod * C.rod - off * off));
  return { off, y: Math.max(C.r + 0.05, C.pivot - drop), vOff: Math.cos(t * h.speed + h.phase) * h.reach * h.speed };
}

/** A boulder's lateral position (across the road, from the centre) and whether it is rolling. It waits off the road, rolls across, waits on the other side, and so on. */
export function boulderAt(b, hw, t, C = COURSE.boulder) {
  const run = (hw * 2 + C.r * 4) / C.speed, period = run + C.wait;
  const u = (((t + b.phase) % (period * 2)) + period * 2) % (period * 2);
  const leg = u >= period ? 1 : 0, v = leg ? u - period : u, from = (b.side || 1) * (leg ? -1 : 1), edge = hw + C.r * 2;
  if (v >= run) return { lat: -from * edge, rolling: false, dir: 0, leg, v };
  return { lat: from * edge - from * (v / run) * edge * 2, rolling: true, dir: -from, leg, v };
}

/** Angle of a spinning arm. */
export const armAngle = (a, t) => t * a.speed * (a.dir || 1) + (a.phase || 0);

/** A press: the height of the block's underside above the road and what it is doing. */
export function pressAt(p, t, C = COURSE.press) {
  const u = (((t + (p.phase || 0)) % C.period) + C.period) % C.period, cycle = Math.floor((t + (p.phase || 0)) / C.period);
  const t1 = C.safe, t2 = t1 + C.warn, t3 = t2 + C.slam, t4 = t3 + C.down;
  if (u < t1) return { y: C.up, state: 'up', light: 'green', cycle };
  if (u < t2) return { y: C.up - 0.35 * Math.sin((u - t1) * 40) ** 2, state: 'warn', light: 'amber', cycle };
  if (u < t3) { const k = (u - t2) / C.slam; return { y: C.up * (1 - k * k), state: 'slam', light: 'red', cycle }; }
  if (u < t4) return { y: 0, state: 'down', light: 'red', cycle };
  const k = (u - t4) / (C.period - t4); return { y: C.up * k, state: 'rise', light: 'red', cycle };
}

/** A fire pit's state at time t. The moment it erupts is random in each cycle, but the same for the view and the collisions (it is a hash of the pit and the cycle). */
export function fireAt(p, t, C = COURSE.fire) {
  const period = p.period || 5.5, u = t + (p.phase || 0), cycle = Math.floor(u / period), x = Math.sin(cycle * 12.9898 + (p.seed || 0) * 78.233) * 43758.5453;
  const slack = Math.max(0.1, period - C.warn - C.burst - 0.4), start = 0.2 + (x - Math.floor(x)) * slack, v = u - cycle * period;
  if (v < start) return { state: 'idle', k: 0, cycle };
  if (v < start + C.warn) return { state: 'warn', k: (v - start) / C.warn, cycle };
  if (v < start + C.warn + C.burst) return { state: 'burst', k: (v - start - C.warn) / C.burst, cycle };
  return { state: 'idle', k: 0, cycle };
}

// ------------------------------------------------------------------ contact with the car

const P = { x: 0, y: 0, z: 0 };

/** Closest point of the car's body box to world point c, and how far c is from it (negative inside). Needs car.ax/ay/az current. */
export function nearestOnCar(car, cx, cy, cz, out = P) {
  const B = COURSE.car, dx = cx - car.pos.x, dy = cy - car.pos.y, dz = cz - car.pos.z;
  const lx = dx * car.ax.x + dy * car.ax.y + dz * car.ax.z, ly = dx * car.ay.x + dy * car.ay.y + dz * car.ay.z - B.cy, lz = dx * car.az.x + dy * car.az.y + dz * car.az.z;
  const px = clamp(lx, -B.hx, B.hx), py = clamp(ly, -B.hy, B.hy), pz = clamp(lz, -B.hz, B.hz), py2 = py + B.cy;
  out.x = car.pos.x + car.ax.x * px + car.ay.x * py2 + car.az.x * pz;
  out.y = car.pos.y + car.ax.y * px + car.ay.y * py2 + car.az.y * pz;
  out.z = car.pos.z + car.ax.z * px + car.ay.z * py2 + car.az.z * pz;
  const ex = lx - px, ey = ly - py, ez = lz - pz, d = Math.hypot(ex, ey, ez);
  if (d > 1e-6) return d;
  return -Math.min(B.hx - Math.abs(lx), B.hy - Math.abs(ly), B.hz - Math.abs(lz));
}

/** The corners and middles of the car's body, in world space (for a press to test against). */
export function carPoints(car, out = []) {
  const B = COURSE.car; let n = 0;
  for (const sx of [-1, 0, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 0, 1]) {
    const lx = sx * B.hx, ly = sy * B.hy + B.cy, lz = sz * B.hz, p = out[n] || (out[n] = { x: 0, y: 0, z: 0 }); n++;
    p.x = car.pos.x + car.ax.x * lx + car.ay.x * ly + car.az.x * lz;
    p.y = car.pos.y + car.ax.y * lx + car.ay.y * ly + car.az.y * lz;
    p.z = car.pos.z + car.ax.z * lx + car.ay.z * ly + car.az.z * lz;
  }
  out.length = n; return out;
}

// ------------------------------------------------------------------ the run

export class Assault {
  /** `track` is a Track whose def has an `assault` block. */
  constructor(track) {
    this.track = track; this.def = track.def.assault;
    this.events = []; this._pts = []; this._cool = new Map(); this._crushed = new Map();
    this.reset();
  }

  reset() {
    this.t = 0;                         // the hazard clock
    this.state = 'ready';               // ready (before the line), running, finished, timeout
    this.started = null; this.elapsed = 0; this.penalty = 0; this.penalties = []; this.stageBase = 0; this.finishT = null; this.hoop = null; this._prevU = null; this._prevAlong = null; this._seen = new Map();
    this.next = 0;                      // the checkpoint to reach next
    this.cpS = -12;                     // where you restart from (metres along the road; the start is just behind the line)
    this.result = null; this.hits = 0; this.wrecks = 0;
    this._cool.clear(); this._crushed.clear(); this.events.length = 0;
  }

  /** Seconds on the clock for stage `i` (0 = the road to the first checkpoint). */
  stageTime(i) { const S = this.def.stage || COURSE.stage; return Math.max(S.min ?? 6, S.time - S.step * i); }
  get limit() { return this.stageTime(Math.min(this.next, this.checkpoints.length)); }          // this stage's allowance
  get stages() { return this.checkpoints.length + 1; }
  get total() { return this.elapsed + this.penalty; }
  get remaining() { return this.limit - (this.total - this.stageBase); }
  get finishS() { return this.def.hoop ? this.def.hoop.s : this.track.length; }
  get checkpoints() { return this.def.checkpoints; }
  get active() { return this.state === 'ready' || this.state === 'running'; }

  /** Add a time penalty (seconds) for `why`: 'wreck', 'fall' or 'reset'. */
  penalise(why) {
    if (!this.active) return 0;
    const s = COURSE.penalty[why] ?? 5;
    this.penalty += s; this.penalties.push({ why, s, at: this.elapsed });
    this.events.push({ type: 'penalty', why, seconds: s });
    if (why === 'wreck') this.wrecks++;
    return s;
  }

  /** Advance the run by dt. `u` is how far along the road you are (metres from the start line, unwrapped); `derby` takes the damage. */
  step(dt, car, u, derby) {
    this.t += dt;
    if (!this.active) return;
    if (this.state === 'ready' && u >= 0) { this.state = 'running'; this.started = this.t; this.events.push({ type: 'start' }); }
    if (this.state === 'running') {
      this.elapsed = this.t - this.started;
      while (this.next < this.checkpoints.length && u >= this.checkpoints[this.next]) {
        this.cpS = this.checkpoints[this.next]; this.next++; this.stageBase = this.total;
        this.events.push({ type: 'checkpoint', index: this.next, of: this.checkpoints.length, s: this.cpS });
      }
      if (this.next >= this.checkpoints.length && this._crossedFinish(car, u)) { this._finish(car); return; }
      if (this.remaining <= 0) { this._end('timeout'); return; }
    }
    if (derby && derby.enabled && derby.player && !derby.player.wrecked && !derby.over) this._contacts(car, derby);
    if (this.state === 'running') this._sounds(car);
  }

  /** Has the car just gone across the finish? With a hoop: through the flat plane the ring hangs in (the road's `u` stands still in mid-air over a gap, so it is the car's own position that counts). */
  _crossedFinish(car, u) {
    const H = this.def.hoop;
    if (!H) { const was = this._prevU; this._prevU = u; return (was === null || was < this.track.length) && u >= this.track.length; }
    const f = this.track.frameAt(H.s), dx = car.pos.x - f.x, dz = car.pos.z - f.z;
    const along = dx * f.fx + dz * f.fz, was = this._prevAlong; this._prevAlong = along;
    if (was === undefined || was === null || !(was < 0 && along >= 0)) return false;
    return Math.hypot(dx * f.lx + dz * f.lz, car.pos.y - f.y) < 30;                   // (not some other road that happens to cross the same line)
  }

  /** The car crosses the finish. With a hoop, it must be inside the ring as it goes through (or it costs time). */
  _finish(car) {
    const H = this.def.hoop;
    if (H) {
      const f = this.track.frameAt(H.s), lat = (car.pos.x - f.x) * f.lx + (car.pos.z - f.z) * f.lz, h = car.pos.y - (f.y + H.h);
      const through = Math.hypot(lat, h) <= H.r;
      this.hoop = { through, lat, h };
      this.events.push({ type: 'hoop', through });
      if (!through) { this.penalty += COURSE.penalty.hoop; this.penalties.push({ why: 'hoop', s: COURSE.penalty.hoop, at: this.elapsed }); }
    }
    this._end('finished');
  }

  /** Sound cues from the hazards (hammer swing, crusher slam, flame burst): one event each time, with how far away the car is. */
  _sounds(car) {
    const d = this.def, t = this.t, seen = this._seen;
    const cue = (key, val, name, f, y = 0) => {                      // `val` changes (or turns true) when the thing happens; the first look only sets the baseline
      const was = seen.get(key); seen.set(key, val);
      if (was === undefined || was === val || val === false) return;
      this.events.push({ type: 'sfx', name, dist: Math.hypot(car.pos.x - f.x, car.pos.z - f.z, (car.pos.y - f.y - y) * 0.5) });
    };
    for (let i = 0; i < (d.hammers || []).length; i++) { const h = d.hammers[i]; cue('h' + i, Math.floor((t * h.speed + h.phase) / Math.PI), 'hammer', this.track.frameAt(h.s), COURSE.hammer.r); }
    for (let i = 0; i < (d.presses || []).length; i++) { const p = d.presses[i], st = pressAt(p, t); cue('p' + i, st.state === 'slam', 'crusher', this.track.frameAt(p.s)); }
    for (let i = 0; i < (d.boulders || []).length; i++) { const b = d.boulders[i], f = this.track.frameAt(b.s), bo = boulderAt(b, f.hw, t); cue('b' + i, bo.rolling, 'boulder', f, COURSE.boulder.r); }
    for (let i = 0; i < (d.fires || []).length; i++) { const p = d.fires[i], st = fireAt(p, t); cue('f' + i, st.state === 'burst', 'flame', this.track.frameAt(p.s)); }
  }

  /** The car is scrap (the spanners ran out): the run is over. */
  scrap() { if (this.active) this._end('scrapped'); }

  _end(state) {
    this.state = state; this.finishT = this.t;
    const total = this.total, m = COURSE.medals;
    this.result = { state, time: total, clean: this.elapsed, penalty: this.penalty, wrecks: this.wrecks, hoop: this.hoop, medal: state === 'finished' ? (total <= m.gold ? 'gold' : total <= m.silver ? 'silver' : total <= m.bronze ? 'bronze' : null) : null };
    this.events.push({ type: state, result: this.result });
  }

  _ready(key) { return this.t - (this._cool.get(key) ?? -99) > COURSE.cooldown; }

  /** Shove the car: change its velocity along unit (ux, uy, uz) by `dv` at world point p (an impulse, so it also spins it). */
  _shove(car, ux, uy, uz, dv, p) {
    const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    const u = { x: ux, y: uy, z: uz }, inv = car.invMassAt(u, p);
    if (inv > 0) car.impulseAt(u, dv / inv, p);
  }

  _hit(key, kind, car, derby, hp, p, ux, uy, uz, dv, closing) {
    if (!this._ready(key)) return;
    this._cool.set(key, this.t); this.hits++;
    car.refreshFrame();
    const zone = zoneAt(car, p.x, p.y, p.z);
    this._shove(car, ux, uy, uz, dv, p);
    derby._damage(derby.player, zone, hp, null, p.x, p.y, p.z);
    this.events.push({ type: 'hit', kind, x: p.x, y: p.y, z: p.z, speed: closing, zone });
  }

  _contacts(car, derby) {
    const T = this.track, t = this.t, d = this.def; car.refreshFrame();
    const H = COURSE.hammer;
    if (d.hammers) for (let i = 0; i < d.hammers.length; i++) {
      const h = d.hammers[i], f = T.frameAt(h.s), q = hammerHead(h, t);
      if (Math.abs(car.pos.x - f.x) + Math.abs(car.pos.z - f.z) > 40) continue;
      const cx = f.x + f.lx * q.off, cy = f.y + q.y, cz = f.z + f.lz * q.off;
      const dist = nearestOnCar(car, cx, cy, cz);
      if (dist < H.r) {
        const s = Math.sign(q.vOff) || 1, speed = Math.abs(q.vOff);
        this._hit('h' + i, 'hammer', car, derby, H.hp, P, f.lx * s, 0.3, f.lz * s, H.punch + speed * 1.2, speed + 6);
      }
    }
    const A = COURSE.arm;
    if (d.arms) for (let i = 0; i < d.arms.length; i++) {
      const a = d.arms[i], f = T.frameAt(a.s);
      if (Math.abs(car.pos.x - f.x) + Math.abs(car.pos.z - f.z) > 30) continue;
      const ang = armAngle(a, t), ca = Math.cos(ang), sa = Math.sin(ang), dir = a.dir || 1, w = a.speed * dir;
      // the arm is a line of spheres from the pole out to each tip (the second half of the line is the other end of the bar)
      for (let k = -9; k <= 9; k++) {
        const rr = (k / 9) * (a.len || A.len);
        const along = ca * rr, lat = sa * rr;     // angle 0 = along the road
        const cx = f.x + f.fx * along + f.lx * lat, cz = f.z + f.fz * along + f.lz * lat, cy = f.y + A.y;
        const dist = nearestOnCar(car, cx, cy, cz);
        if (dist < A.r + (k === 0 ? A.pole - A.r : 0)) {
          const vx = (-sa * f.fx + ca * f.lx) * w * (rr || 0.0001), vz = (-sa * f.fz + ca * f.lz) * w * (rr || 0.0001), sp = Math.hypot(vx, vz);
          const ux = sp > 0.3 ? vx : P.x - cx, uz = sp > 0.3 ? vz : P.z - cz;
          this._hit('a' + i, 'arm', car, derby, A.hp + sp * 1.4, P, ux, 0.12, uz, A.punch + sp * 0.9, sp + 3);
          break;
        }
      }
    }
    const B = COURSE.boulder;
    if (d.boulders) for (let i = 0; i < d.boulders.length; i++) {
      const b = d.boulders[i], f = T.frameAt(b.s);
      if (Math.abs(car.pos.x - f.x) + Math.abs(car.pos.z - f.z) > 40) continue;
      const bo = boulderAt(b, f.hw, t);
      if (!bo.rolling) continue;
      const cx = f.x + f.lx * bo.lat + f.nx * B.r, cy = f.y + f.ny * B.r, cz = f.z + f.lz * bo.lat + f.nz * B.r;
      const dist = nearestOnCar(car, cx, cy, cz);
      if (dist < B.r) this._hit('b' + i, 'boulder', car, derby, B.hp, P, f.lx * bo.dir, 0.18, f.lz * bo.dir, B.punch, B.speed + 4);
    }
    const FI = COURSE.fire;
    if (d.fires) for (let i = 0; i < d.fires.length; i++) {
      const p = d.fires[i], f = T.frameAt(p.s);
      if (Math.abs(car.pos.x - f.x) + Math.abs(car.pos.z - f.z) > 30) continue;
      const st = fireAt(p, t);
      if (st.state !== 'burst') continue;
      const cx = f.x + f.lx * (p.lat || 0), cz = f.z + f.lz * (p.lat || 0), top = FI.height * Math.min(1, st.k * 4);
      // the column of flame: a car whose body is inside the circle and below the top of the flames is caught
      const dist = nearestOnCar(car, cx, f.y + 0.5 + Math.min(top, 3) * 0.5, cz);
      if (dist < FI.r) this._hit('f' + i, 'fire', car, derby, FI.hp, P, 0, 1, 0, FI.launch, 12);
    }
    const C = COURSE.press;
    if (d.presses) for (let i = 0; i < d.presses.length; i++) {
      const p = d.presses[i], f = T.frameAt(p.s);
      if (Math.abs(car.pos.x - f.x) + Math.abs(car.pos.z - f.z) > 30) continue;
      const st = pressAt(p, t);
      if (st.y > 2.2 && st.state !== 'slam') continue;
      const width = Math.min(f.hw * 2 - 1, p.width || 14), pts = carPoints(car, this._pts);
      let inside = false;
      for (const q of pts) {
        const dx = q.x - f.x, dz = q.z - f.z, along = dx * f.fx + dz * f.fz, lat = dx * f.lx + dz * f.lz, h = q.y - f.y;
        if (Math.abs(along) < C.depth / 2 && Math.abs(lat) < width / 2 && h < st.y + C.thick && h > st.y - 0.2) { inside = true; break; }
      }
      if (!inside) continue;
      const key = 'p' + i + ':' + st.cycle;
      if (!this._crushed.has(key)) {                // flattened: once per drop
        this._crushed.set(key, true);
        this._cool.set('p' + i, this.t); this.hits++;
        const px = car.pos.x, py = car.pos.y + 0.9, pz = car.pos.z;
        derby._damage(derby.player, 'roof', C.hp, null, px, py + 0.4, pz, 70);
        car.vel.x *= 0.15; car.vel.z *= 0.15; car.vel.y = Math.min(car.vel.y, 0);
        this.events.push({ type: 'hit', kind: 'press', x: px, y: py, z: pz, speed: 16, zone: 'roof' });
      } else if (st.state === 'down') {             // trapped under it: it shoves you out the way you were going
        const s = (car.vel.x * f.fx + car.vel.z * f.fz) >= 0 ? 1 : -1;
        const vf = (car.vel.x * f.fx + car.vel.z * f.fz) * s;
        if (vf < 8) { car.vel.x += f.fx * s * (8 - vf); car.vel.z += f.fz * s * (8 - vf); }
      }
    }
  }
}
