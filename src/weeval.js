// Weeval Keneval: a solo stunt. Race down a very high, dead-straight ramp, fly over a row of parked buses and land on the far ramp, as close to the
// bullseye painted on it as you can. Ten stages: each adds a bus and a longer gap. Three tries a stage; land without wrecking and you are through.
//
// No three.js in here, so the rules and the layout run (and are tested) in Node. weevalView.js draws it; main.js turns the events into banners and sound.
//   stageLayout(n)  where everything is for stage n (the road runs along +x, so a position is just an x and a z)
//   weevalDef(n)    the track definition for stage n (a normal closed-loop track: the "loop" is a return road that is never driven)
//   Weeval          the rules: tries, scoring, what counts as a clean landing

import { normalizeTrack, GROUND_Y } from './track.js';

export const WEEVAL = {
  stages: 10, tries: 3,
  width: 18,                         // the road is this wide
  bus: { w: 2.6, len: 11, h: 3.2 },  // a bus parked side-on across the pit: w along the run, len across the road
  top: 60, ramp: 400,                // the start platform's height and the length of the long descent
  lipY: 12,                          // the takeoff road's height above the ground (so the buses go by well below the car)
  lipKick: 20, lipRise: 2.2,         // the takeoff kicker: its angle (degrees) and height
  landLen: 95, runOut: 70, drop: 8.5,   // the landing ramp's length and how far it falls, then the flat run-out to the barrier
  rings: [2.4, 4.8, 7, 9],         // the painted bullseye's ring radii (m), centre outwards
  points: [1000, 600, 300, 150], ramp_pts: 50,    // what each ring is worth (and landing anywhere else on the ramp)
  flatBonus: 200, cleanBonus: 100,   // a level touchdown, and no damage at all
  aim: [18.7, 19.9, 20.9, 22.8, 24.0, 24.8, 25.7, 27.3, 27.8, 28.7],      // the speed (m/s) that lands the middle of the bullseye at the end of the ramp, stage by stage (measured: see tests/weeval.test.mjs)
  flatDeg: 12,                       // "level" = the car within this many degrees of the ramp's slope
};

export const TAKEOFF_X = 440;        // where the gap is centred along the road (x)

/** Everything's position for stage n (1-10): the gap, the buses, the landing zone, the barrier. */
export function stageLayout(n) {
  const W = WEEVAL, stage = Math.max(1, Math.min(W.stages, Math.round(n) || 1));
  const buses = stage + 2, gap = Math.round(buses * W.bus.w + 5);        // stage 1: three buses, a 13 m gap
  const cx = TAKEOFF_X, lipX = cx - gap / 2, gapEnd = cx + gap / 2;
  const zoneDist = 15 + (stage - 1) * 1.6;                              // the bullseye's centre, past the far lip
  const zoneX = gapEnd + zoneDist;
  const busList = [], bx0 = cx - buses * W.bus.w / 2;
  for (let i = 0; i < buses; i++) busList.push({ x0: bx0 + i * W.bus.w, x1: bx0 + (i + 1) * W.bus.w, z0: -W.bus.len / 2, z1: W.bus.len / 2, i });
  const landEnd = gapEnd + W.landLen, endX = landEnd + W.runOut;
  return { stage, buses, busList, gap, cx, lipX, gapEnd, zoneX, zoneZ: 0, landEnd, endX, startX: -28, lipY: W.lipY, width: W.width };
}

/** The track definition for stage n. A straight run with a jump in it; the loop closes by a hairpin and a return road that nobody drives. */
export function weevalDef(n) {
  const W = WEEVAL, L = stageLayout(n), { top, lipY } = W, R = 30, X0 = -40, XE = L.endX + 60, zr = R * 2, low = lipY - W.drop;
  const H = [];
  const P = (x, y, z, extra) => H.push({ x: Math.round(x), y: Math.round(y * 100) / 100, z: Math.round(z), ...(extra || {}) });
  P(X0, top, 0); P(0, top, 0);                                              // the start platform
  P(190, top - (top - lipY) * 0.52, 0); P(TAKEOFF_X - 70, lipY + 0.6, 0);      // the long descent, easing out so the car arrives flat and fast
  P(TAKEOFF_X, lipY, 0, { gap: L.gap, kick: W.lipKick, lip: W.lipRise });      // the jump
  P(L.gapEnd + W.landLen, low, 0); P(L.endX, low, 0); P(XE, low, 0);                              // the landing ramp falls away, then the run-out
  for (const a of [-45, 0, 45, 90]) P(XE + Math.cos(a * Math.PI / 180) * R, low, R + Math.sin(a * Math.PI / 180) * R);    // the hairpin round to the return road
  const back = [XE - 140, 330, 150, 20];
  back.forEach((x) => P(x, low + (top - low) * (XE - x) / (XE - X0), zr));
  for (const a of [135, 180, 225]) P(X0 + Math.cos(a * Math.PI / 180) * R, top, R + Math.sin(a * Math.PI / 180) * R);      // and the hairpin back to the top
  const blocks = L.busList.map((b) => ({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'bus', y: GROUND_Y, h: W.bus.h }));
  blocks.push({ x0: L.endX - 4, x1: L.endX, z0: -W.width / 2 - 4, z1: W.width / 2 + 4, kind: 'wall', y: GROUND_Y, h: 7 });   // the barrier that ends the run-out
  return normalizeTrack({ name: 'Weeval Keneval', width: W.width, walls: true, defaultLaps: 1, handles: H, weeval: { stage: L.stage }, blocks });
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** The persistent part of a run (it outlives each stage's track): which stage, tries left, the points so far. */
export function newRun() { return { stage: 1, tries: WEEVAL.tries, total: 0, scores: [], over: false }; }

/** Points for touching down at (x, z): the ring it is in. */
export function ringOf(L, x, z) {
  const d = Math.hypot(x - L.zoneX, z - L.zoneZ), r = WEEVAL.rings;
  for (let i = 0; i < r.length; i++) if (d <= r[i]) return { ring: i, d, points: WEEVAL.points[i] };
  return { ring: -1, d, points: WEEVAL.ramp_pts };
}

export class Weeval {
  /** `track` is the stage's Track; `run` is the persistent run object (newRun()). */
  constructor(track, run) {
    this.track = track; this.run = run; this.L = stageLayout(track.def.weeval.stage); this.events = [];
    this.reset();
  }
  get stage() { return this.run.stage; }
  get tries() { return this.run.tries; }

  /** A fresh attempt at this stage (the car is back on the platform). */
  reset() { this.state = 'ready'; this.t = 0; this.land = null; this.settle = 0; this.sinceLand = 0; this.air = 0; this.slow = 0; this.last = null; }
  go() { if (this.state === 'ready') this.state = 'run'; }
  get active() { return this.state === 'run' || this.state === 'air' || this.state === 'landed'; }

  _fail(why) {
    if (!this.active) return;
    this.state = 'failed'; this.run.tries--;
    this.last = { fail: why, tries: this.run.tries };
    if (this.run.tries <= 0) { this.run.over = true; this.state = 'over'; }
    this.events.push({ type: 'fail', why, tries: this.run.tries, over: this.run.over, stage: this.run.stage });
  }
  /** The car blew up. */
  wreck() { this._fail('wrecked'); }
  /** The player asked to be put back (a reset): it counts as a try. */
  abort() { if (this.state === 'run') this._fail('reset'); }

  /** One physics step. `car` is the player's vehicle, `health` (optional) its damage (derby.player.health). */
  step(dt, car, health) {
    if (!this.active) return;
    this.t += dt;
    const L = this.L, x = car.pos.x;
    if (this.state === 'run') {
      if (!car.onGround && car.airTime > 0.25 && x > L.lipX - 6) { this.state = 'air'; this.events.push({ type: 'launch', speed: car.speed }); }
      else if (x > L.gapEnd + 2 && car.onGround) { this.state = 'landed'; this._touch(car, health); }     // (drove through without leaving the ground: a lucky landing, or a bug)
      return;
    }
    if (this.state === 'air') {
      this.air += dt;
      if (car.onGround) {
        if (x >= L.gapEnd - 2) { this.state = 'landed'; this._touch(car, health); }
        else if (x > L.lipX + 2) this._fail('short');                          // down on the buses or in the pit
        return;
      }
      this.slow = car.speed < 3 ? this.slow + dt : 0;
      if (this.slow > 1.2 && x >= L.gapEnd - 2) { this.state = 'landed'; this._touch(car, health); return; }      // (down on the ramp but wheels-up: it counts as landed, and then as flipped)
      if (this.air > 14) { this._fail('short'); return; }
      if (car.pos.y < GROUND_Y + 5.5 && x < L.gapEnd + 1) this._fail('short');
      else if (car.pos.y < L.lipY - 14 - WEEVAL.drop) this._fail('short');
      return;
    }
    // landed: wait for the car to settle, then judge it
    this.sinceLand += dt;
    this.settle = car.speed < 1.2 ? this.settle + dt : 0;
    if (x > L.endX - 1.5) { this._judge(car, health, true); return; }
    if (this.settle > 0.7 || this.sinceLand > 9) this._judge(car, health, false);
  }

  _touch(car, health) {
    const L = this.L, q = this.track.query(car.pos.x, car.pos.y + 2, car.pos.z), ring = ringOf(L, car.pos.x, car.pos.z);
    const dot = clamp(car.ay.x * q.nx + car.ay.y * q.ny + car.ay.z * q.nz, -1, 1), tilt = Math.acos(dot) * 180 / Math.PI;
    this.land = { x: car.pos.x, z: car.pos.z, ...ring, tilt, speed: car.speed, air: this.air, flat: tilt <= WEEVAL.flatDeg && car.ay.y > 0.5 };
    this.events.push({ type: 'touch', ...this.land });
  }

  _judge(car, health, hitEnd) {
    if (this.state !== 'landed') return;
    const l = this.land;
    if (car.ay.y < 0.3) { this._fail('flipped'); return; }
    if (health && (health.wrecked || health.worst <= 0)) { this._fail('wrecked'); return; }
    const clean = !health || health.worst >= 0.9, flat = l.flat;
    const pts = l.points + (flat ? WEEVAL.flatBonus : 0) + (clean ? WEEVAL.cleanBonus : 0);
    this.state = 'clear'; this.run.total += pts; this.run.scores.push(pts);
    const done = this.run.stage >= WEEVAL.stages;
    this.last = { points: pts, ring: l.ring, d: l.d, flat, clean, ringPoints: l.points, tilt: l.tilt, total: this.run.total, stage: this.run.stage, done, hitEnd };
    this.events.push({ type: 'clear', ...this.last });
    if (done) this.run.over = true;
  }

  /** Carry on to the next stage (call after a 'clear'). Returns true if there is one. */
  advance() {
    if (this.run.over) return false;
    this.run.stage++; this.run.tries = WEEVAL.tries; return true;
  }
}
