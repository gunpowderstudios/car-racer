// Weeval Knievel: a solo stunt. Race down a very high, dead-straight ramp, fly over a row of parked buses and land on the far ramp, as close to the
// bullseye painted on it as you can. Five stages for now: each adds a bus and a longer gap. Three tries a stage; land without wrecking and you are through.
//
// No three.js in here, so the rules and the layout run (and are tested) in Node. weevalView.js draws it; main.js turns the events into banners and sound.
//   stageLayout(n)  where everything is for stage n (the road runs along +x, so a position is just an x and a z)
//   weevalDef(n)    the track definition for stage n (a normal closed-loop track: the "loop" is a return road that is never driven)
//   Weeval          the rules: tries, scoring, what counts as a clean landing

import { normalizeTrack, GROUND_Y, STUNT_BUS } from './track.js';

export const WEEVAL = {
  stages: 5, tries: 3,                 // (five for now, more to come)
  showBuses: true,                   // the row of parked buses in the gap (one more each stage)
  runStep: 10, riseStep: 5,          // each stage the long ramp is this much longer and the whole thing this much higher
  deckRaise: 1.4,                    // ... and then the whole platform is this much taller (so the buses are right in the way of the jump)
  deckBelow: 4,                      // the buses stand on a platform this far below the takeoff lip: their roofs are about level with it, so a low jump hits them
  gapStart: 70, gapStep: 30,         // the gap (m, lip to lip) on stage 1, and how much longer it gets each stage
  zoneStart: 30, zoneStep: 0,        // how far past the far lip the bullseye is on stage 1, and how much further each stage
  width: 18,                         // the road is this wide
  bus: { ...STUNT_BUS, flip: false }, // a double-decker parked side-on to the ramp, nose to the left: w along the run, len across the road
  topStep: 15,                       // the start platform climbs this much MORE than the rest each stage (on top of riseStep): a taller drop-in each time, for the vertigo
  top: 80,                           // the start platform's height on stage 1
  lipY: 20,                          // the takeoff lip's height on stage 1
  lowY: 6,                           // the landing ramp's low end and the run-out: this height whatever the stage
  lipKick: 25, lipRise: 2.6,         // the takeoff kicker: its angle (degrees) and height
  boomStep: 10,                     // the skull barrels move this much nearer the jump each stage, so you have to stop sooner (the cardboard stack stays at the back)
  landLen: 170, landStep: 20, runOut: 80,   // the landing ramp's length (it grows each stage) then the flat run-out to the barrier
  rings: [2.4, 4.8, 7, 9],         // the painted bullseye's ring radii (m), centre outwards
  points: [1000, 600, 300, 150], ramp_pts: 50,    // what each ring is worth (and landing anywhere else on the ramp)
  flatBonus: 200, cleanBonus: 100,   // a level touchdown, and no damage at all
  aim: [36.5, 42.8, 49.5, 53, 57, 60, 62, 64, 66, 68],      // (stages 1-3 measured, 4-5 rough, 6 and up need more than the car's top speed without boost) the speed (m/s) that lands the middle of the bullseye at the end of the ramp, stage by stage (measured: see tests/weeval.test.mjs)
  flatDeg: 12,                       // "level" = the car within this many degrees of the ramp's slope
};

export const LIP_X = 420;            // where the takeoff lip is along the road (x) on stage 1: the gap starts here, whatever its length

/** Everything's position for stage n (1-10): the gap, the buses, the landing zone, the barrier. */
export function stageLayout(n) {
  const W = WEEVAL, stage = Math.max(1, Math.min(W.stages, Math.round(n) || 1));
  const buses = stage + 2, gap = W.gapStart + (stage - 1) * W.gapStep;          // stage 1: a 70 m gap, 30 m longer each stage
  const k = stage - 1, lipX = LIP_X + k * W.runStep, lipY = W.lipY + k * W.riseStep, top = W.top + k * (W.riseStep + W.topStep), landLen = W.landLen + k * W.landStep;
  const cx = lipX + gap / 2, gapEnd = lipX + gap, deckTop = (lipY - W.deckBelow) * W.deckRaise;
  const zoneDist = W.zoneStart + (stage - 1) * W.zoneStep;                              // the bullseye's centre, past the far lip
  const zoneX = gapEnd + zoneDist;
  const busList = [], bx0 = cx - buses * W.bus.w / 2;
  for (let i = 0; i < (W.showBuses ? buses : 0); i++) busList.push({ x0: bx0 + i * W.bus.w, x1: bx0 + (i + 1) * W.bus.w, z0: -W.bus.len / 2, z1: W.bus.len / 2, i, y: deckTop });
  const landEnd = gapEnd + landLen, endX = landEnd + W.runOut;
  const stackX = endX - 12;      // the cardboard stack: at the back, just in front of the wall, the same every stage
  const boomX = Math.max(landEnd + 14, endX - 26 - W.boomStep * (stage - 1));      // the skull barrels: in front of the boxes on stage 1, then 10 m nearer the jump every stage (never on the landing ramp)
  return { stage, buses, busList, gap, cx, lipX, gapEnd, zoneX, zoneZ: 0, landEnd, endX, stackX, boomX, startX: -28, lipY, top, deckTop, landLen, low: W.lowY, width: W.width };
}

/**
 * The layout of a stunt jump made in the editor (def.weeval.custom), with the same fields as stageLayout: the jump is the handle that has a gap,
 * the buses and cardboard stacks are props, the bullseye is the target prop (or 30 m past the far lip). The run goes along +x.
 */
export function customLayout(def) {
  const W = WEEVAL, H = def.handles || [], j = Math.max(0, H.findIndex((h) => h.gap > 0)), h = H[j] || { x: 0, z: 0, y: 0, gap: 40 }, gap = h.gap || 40;
  const props = def.props || [], target = props.find((p) => p.type === 'target');
  const lipX = h.x - gap / 2, gapEnd = h.x + gap / 2, lipY = h.y;
  const busList = props.filter((p) => p.type === 'bus').map((p, i) => {
    const th = (p.rot || 0) * Math.PI / 180, ex = Math.abs(Math.cos(th)) * W.bus.w / 2 + Math.abs(Math.sin(th)) * W.bus.len / 2, ez = Math.abs(Math.sin(th)) * W.bus.w / 2 + Math.abs(Math.cos(th)) * W.bus.len / 2;
    return { x0: p.x - ex, x1: p.x + ex, z0: p.z - ez, z1: p.z + ez, cx: p.x, cz: p.z, rot: p.rot || 0, i, y: p.y + (p.up || 0), ground: p.y };
  });
  const stacks = props.filter((p) => p.type === 'boxes').map((p) => ({ x: p.x, z: p.z, rot: p.rot || 0 }));
  const e = def.weeval && def.weeval.oneRoad ? H[(def.weeval.roadN || H.length) - 1] : null;      // (a one-road track ends at its last point, at a barrier)
  return { stage: 1, custom: true, buses: busList.length, busList, stacks, gap, cx: h.x, cz: h.z, lipX, gapEnd, zoneX: target ? target.x : gapEnd + 30, zoneZ: target ? target.z : h.z, landEnd: gapEnd + 100,
    endX: e ? e.x : Infinity, endZ: e ? e.z : 0, stackX: gapEnd + 60, boomX: gapEnd + 80, startX: H[0] ? H[0].x : 0, lipY, top: H[0] ? H[0].y : lipY, deckTop: lipY, landLen: 100, low: GROUND_Y, width: def.width || W.width };
}
/** The layout of whichever jump this track is: one of the five stages, or a stunt track from the editor. */
export const layoutFor = (def) => (!def.weeval ? piecesLayout(def) : def.weeval.custom ? customLayout(def) : stageLayout(def.weeval.stage));

/** Stunt pieces on an ordinary track (no jump, no run): the buses, cardboard stacks and the bullseye wherever their props are. */
export function piecesLayout(def) {
  const L = customLayout({ ...def, weeval: { custom: true }, handles: [] });
  return { ...L, pieces: true, hasTarget: (def.props || []).some((p) => p.type === 'target'), lipX: Infinity, gapEnd: Infinity, lipY: 200, endX: Infinity };
}

/** The track definition for stage n. A straight run with a jump in it; the loop closes by a hairpin and a return road that nobody drives. */
export function weevalDef(n) {
  const W = WEEVAL, L = stageLayout(n), { top, lipY, low } = L, R = 30, X0 = -40, XE = L.endX + 60, zr = R * 2;
  const H = [];
  const P = (x, y, z, extra) => H.push({ x: Math.round(x), y: Math.round(y * 100) / 100, z: Math.round(z), ...(extra || {}) });
  P(X0, top, 0); P(0, top, 0);                                              // the start platform
  P(Math.round(L.lipX * 0.45), top - (top - lipY) * 0.52, 0); P(L.lipX - 70, lipY + 0.6, 0); P(L.lipX, lipY, 0);      // the long descent, easing out so the car arrives flat and fast
  P(L.cx, lipY, 0, { gap: L.gap, kick: W.lipKick, lip: W.lipRise });      // the jump
  P(L.gapEnd, lipY - 0.4, 0); P(L.gapEnd + L.landLen, low, 0); P(L.endX, low, 0); P(XE, low, 0);                              // the landing ramp falls away, then the run-out
  for (const a of [-45, 0, 45, 90]) P(XE + Math.cos(a * Math.PI / 180) * R, low, R + Math.sin(a * Math.PI / 180) * R);    // the hairpin round to the return road
  const back = [XE - 140, 330, 150, 20];
  back.forEach((x) => P(x, low + (top - low) * (XE - x) / (XE - X0), zr));
  for (const a of [135, 180, 225]) P(X0 + Math.cos(a * Math.PI / 180) * R, top, R + Math.sin(a * Math.PI / 180) * R);      // and the hairpin back to the top
  const blocks = L.busList.map((b) => ({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, kind: 'bus', y: L.deckTop, h: W.bus.h }));
  if (L.busList.length) blocks.push({ x0: L.busList[0].x0 - 1, x1: L.busList[L.busList.length - 1].x1 + 1, z0: -W.bus.len / 2 - 1.5, z1: W.bus.len / 2 + 1.5, kind: 'wall', y: GROUND_Y, h: L.deckTop - GROUND_Y });   // the platform they stand on
  blocks.push({ x0: L.endX - 4, x1: L.endX, z0: -W.width / 2 - 4, z1: W.width / 2 + 4, kind: 'wall', y: GROUND_Y, h: low + 4 });   // the barrier that ends the run-out
  const props = [];                                                           // a staggered double row of black skull barrels right across the run-out: hit one and the car is gone (the cardboard stack behind them is weevalView.js)
  for (let r = 0; r < 2; r++) for (let z = -W.width / 2 + 1.5 + r * 0.75; z <= W.width / 2 - 1.2; z += 1.5) props.push({ type: 'barrel', lethal: true, x: L.boomX + r * 1.2, z: Math.round(z * 100) / 100, y: low });
  return normalizeTrack({ name: 'Weeval Knievel', width: W.width, walls: true, defaultLaps: 1, handles: H, weeval: { stage: L.stage }, blocks, props });
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
    this.track = track; this.run = run; this.L = layoutFor(track.def); this.custom = !!track.def.weeval.custom; this.events = [];
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
    if (this.run.prev) {                                       // a go-again that went wrong: the clear you already had stands (the try is spent)
      const p = this.run.prev; this.run.prev = null; this.state = 'clear'; this.last = p.last; if (p.last.done) this.run.over = true;
      this.events.push({ type: 'clear', ...p.last, kept: true }); return;
    }
    this.state = 'failed'; this.run.tries--;
    this.last = { fail: why, tries: this.run.tries };
    if (this.run.tries <= 0) { this.run.over = true; this.state = 'over'; }
    this.events.push({ type: 'fail', why, tries: this.run.tries, over: this.run.over, stage: this.run.stage });
  }
  /** The car hit an explosive barrel: that is the end of the whole run, whatever tries were left. */
  explode() { if (!this.active) return; this.run.prev = null; this.run.tries = 1; this._fail('exploded'); }
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
      if (car.pos.y < L.lipY - 6 && x > L.lipX + 2 && x < L.gapEnd + 1) this._fail('short');
      else if (car.pos.y < GROUND_Y - 5) this._fail('short');
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
    // (landing upside down is fine: you are through as long as you land, you just miss the level-landing bonus)
    if (health && (health.wrecked || health.worst <= 0)) { this._fail('wrecked'); return; }
    const clean = !health || health.worst >= 0.9, flat = l.flat;
    const pts = l.points + (flat ? WEEVAL.flatBonus : 0) + (clean ? WEEVAL.cleanBonus : 0);
    const prev = this.run.prev; this.run.prev = null;           // (after a go-again only the better of the two jumps counts)
    const kept = prev ? Math.max(pts, prev.last.points) : pts;
    this.state = 'clear'; this.run.total += prev ? kept - prev.last.points : pts;
    if (prev) this.run.scores[this.run.scores.length - 1] = kept; else this.run.scores.push(pts);
    const done = this.custom || this.run.stage >= WEEVAL.stages;
    this.last = { points: kept, attempt: pts, again: !!prev, ring: l.ring, d: l.d, flat, clean, ringPoints: l.points, tilt: l.tilt, total: this.run.total, stage: this.run.stage, done, hitEnd };
    this.events.push({ type: 'clear', ...this.last });
    if (done) this.run.over = true;
  }

  /** Carry on to the next stage (call after a 'clear'). Returns true if there is one. */
  /** After a clear: have another go at the same stage for a better score. It costs one of the stage's tries; only the better jump counts, and failing leaves the first one standing. */
  goAgain() {
    if (this.state !== 'clear' || this.run.tries <= 1) return false;
    this.run.tries--; this.run.prev = { last: this.last }; this.run.over = false; return true;
  }

  advance() {
    this.run.prev = null;
    if (this.run.over) return false;
    this.run.stage++; this.run.tries = WEEVAL.tries; return true;
  }
}
