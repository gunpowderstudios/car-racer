// Track model: a closed 3D spline defined by "handles" is resampled by arc length
// into a dense list of road samples. Everything the game needs (ground height,
// surface normal, distance to the road edge, walls, lap progress) is answered
// analytically from those samples, so the road is never a triangle mesh that
// the car has to "collide" with and walls have no seams.
//
// Conventions (same as three.js):  +Y up, car faces +Z, "left" = +X when facing +Z.
//   bank  > 0  lifts the LEFT edge of the road (banked for right-hand turns)
//   d     > 0  means a point lies to the LEFT of the centreline

import { clamp, lerp, smoothstep, wrapPi } from './math.js';

export const TRACK_VERSION = 6;
export const SURF = { ROAD: 0, VERGE: 1, BASE: 2 };
export const GROUND_Y = 0;          // flat terrain height far from the road
export const WALL_GAP = 0.6;        // wall face sits this far outside the road edge
export const WALL_HEIGHT = 1.25;
export const TANK_H = 6;           // the glass of a flooded dip (a fish tank) stands this high
export const WALL_T = 0.5;          // wall thickness
// With walls, the strip between the road edge and the back of the wall is a flat kerb at
// road height; the embankment only starts falling away behind the wall. (If the ground
// sloped down into the wall face, cars dropped into a gutter and leaned on the wall.)
export const APRON = WALL_GAP + WALL_T;
export const SAMPLE_SPACING = 1.0;  // metres between road samples
export const ARENA_SPACING = 4.0;   // an arena's floor is far wider than a road, so it is sampled coarsely to keep ground lookups cheap
export const EMBANKMENT = 0.8;             // verge falls away this many metres per metre
const CELL = 8;
const MAX_OVERSHOOT = 1.0;          // metres a segment may claim beyond its ends
const ARENA_OVERSHOOT = 8.0;        // an arena's floor is wide, so the wedge outside each bend of its centreline is too
const QUERY_MARGIN = 4.5;
const BERM_MARGIN = 14;             // a dirt-banked stage's embankments reach this far past the road edge
const TAKEOFF_LEN = 12, TAKEOFF_RISE = 0.5;   // ramp up to a gap (the default, flat-lipped ramp)
export const LIP = { minH: 0.3, maxH: 3, maxDeg: 30, minLen: 5, maxLen: 30 };
const LANDING_LEN = 10, LANDING_DROP = 0.4;   // far side sits a little lower           // how far outside the road edge a query still "sees" it

const DEG = Math.PI / 180;
let candI = new Int32Array(256), candY = new Float64Array(256), candD = new Float64Array(256);   // query scratch

// ---------------------------------------------------------------- jumps

/**
 * Takeoff ramp profile for a jump handle. `at(x)` is the lift x metres into the ramp.
 * kick 0: the classic gentle ramp that flattens out at the edge.
 * kick > 0: a curved kicker, flat where it starts and rising to exactly `kick` degrees at
 * the lip (y = H u^p, with the ramp length and exponent chosen so the end slope matches).
 */
export function takeoffRamp(h) {
  const H = h.lip ?? TAKEOFF_RISE, kick = h.kick || 0;
  if (kick <= 0) return { len: TAKEOFF_LEN, rise: H, angle: 0, at: (x) => H * smoothstep(x / TAKEOFF_LEN) };
  const tanK = Math.tan(kick * DEG);
  const len = clamp((2 * H) / tanK, LIP.minLen, LIP.maxLen);
  const p = Math.max(1.2, (len * tanK) / H);
  return { len, rise: H, angle: kick, at: (x) => H * Math.pow(clamp(x / len, 0, 1), p) };
}

// ---------------------------------------------------------------- props

/** Things the editor can drop on the track. Each one is { type, x, z, y } in world metres:
 *  y is the ground height where it was placed and is only a hint for picking the right level
 *  on a bridge; the game re-reads the real ground when the track loads. */
export const PROP_TYPES = ['barrel'];      // (an old saved track or link that still has chickens in it just loses them)
export const MAX_PROPS = 400;

/** Apple Crumple's obstacle course (see assault.js): keep only well-formed hazards, with sensible limits. */
export function normalizeAssault(a) {
  if (!a || typeof a !== 'object') return null;
  const num = (v, d, lo, hi) => (Number.isFinite(+v) && v !== null && v !== '' ? clamp(+v, lo, hi) : d);
  const list = (arr, max, f) => (Array.isArray(arr) ? arr.slice(0, max).filter((x) => x && Number.isFinite(+x.s)).map(f) : []);
  const out = {
    stage: { time: num(a.stage && a.stage.time, 20, 5, 120), step: num(a.stage && a.stage.step, 2, 0, 10), min: 6 },
    checkpoints: (Array.isArray(a.checkpoints) ? a.checkpoints : []).map(Number).filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => x - y).slice(0, 12),
    hammers: list(a.hammers, 12, (h) => ({ s: +h.s, phase: num(h.phase, 0, -100, 100), speed: num(h.speed, 1, 0.4, 2.2), reach: num(h.reach, 7.2, 3, 9) })),
    arms: list(a.arms, 12, (h) => ({ s: +h.s, phase: num(h.phase, 0, -100, 100), speed: num(h.speed, 0.85, 0.3, 2), dir: h.dir < 0 ? -1 : 1, len: num(h.len, 6.4, 3, 9) })),
    presses: list(a.presses, 12, (h) => ({ s: +h.s, phase: num(h.phase, 0, -100, 100), width: num(h.width, 14, 6, 30) })),
    boulders: list(a.boulders, 12, (h) => ({ s: +h.s, phase: num(h.phase, 0, -100, 100), side: h.side < 0 ? -1 : 1 })),
    fires: list(a.fires, 16, (h) => ({ s: +h.s, lat: num(h.lat, 0, -12, 12), seed: num(h.seed, 0, 0, 1000), period: num(h.period, 5.5, 3, 12), phase: num(h.phase, 0, 0, 100) })),
    signs: list(a.signs, 24, (h) => ({ s: +h.s, kind: ['barrels', 'jump', 'gauntlet', 'fire', 'hoop'].includes(h.kind) ? h.kind : 'barrels' })),
  };
  if (a.hoop && Number.isFinite(+a.hoop.s)) out.hoop = { s: +a.hoop.s, h: num(a.hoop.h, 3.2, 0, 12), r: num(a.hoop.r, 4.2, 2, 8) };      // the flaming hoop at the finish
  return out;
}

export function normalizeProps(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const p of list) {
    if (out.length >= MAX_PROPS) break;
    if (!p || !PROP_TYPES.includes(p.type)) continue;
    const x = Number(p.x), z = Number(p.z);
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 1e5 || Math.abs(z) > 1e5) continue;
    const o = { type: p.type, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, y: Number.isFinite(+p.y) ? Math.round(+p.y * 100) / 100 : 0 };
    if (p.lethal) o.lethal = true;                    // a black-and-yellow barrel: it goes off the moment anything touches it, and wrecks whatever is near
    out.push(o);
  }
  return out;
}

// ---------------------------------------------------------------- bumps

/** Humps in an arena floor: round mounds, { x, z, r (radius, m), h (height, m) }, smooth all over and flat at the edge. A negative h is a dip. */
export const MAX_BUMPS = 80;
export function normalizeBumps(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const b of list) {
    if (out.length >= MAX_BUMPS || !b) continue;
    const x = Number(b.x), z = Number(b.z), r = Number(b.r), h = Number(b.h);
    if (![x, z, r, h].every(Number.isFinite) || Math.abs(x) > 1e5 || Math.abs(z) > 1e5) continue;
    out.push({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r: clamp(r, 4, 20), h: h < 0 ? clamp(h, -3, -0.2) : clamp(h, 0.2, 3) });      // (a negative h is a dip, the same shape upside down)
  }
  return out;
}
/** Height of the humps at (x, z), and its slope (gx, gz) - written into `out`. */
export function bumpAt(bumps, x, z, out) {
  let h = 0, gx = 0, gz = 0;
  for (const b of bumps) {
    const dx = x - b.x, dz = z - b.z, d2 = dx * dx + dz * dz;
    if (d2 >= b.r * b.r) continue;                                   // (most humps are nowhere near: skip them without a square root, this runs for every wheel of every car)
    const d = Math.sqrt(d2), u = Math.PI * d / b.r;
    h += b.h * 0.5 * (1 + Math.cos(u));
    if (d > 1e-6) { const k = -b.h * 0.5 * Math.PI / b.r * Math.sin(u) / d; gx += k * dx; gz += k * dz; }
  }
  out.h = h; out.gx = gx; out.gz = gz;
  return out;
}
const _bump = { h: 0, gx: 0, gz: 0 };

// ---------------------------------------------------------------- rocks and boulders (rally stages)

/** Grey boulders beside (and a little onto) a rally stage: { x, z, r (radius on the ground, m), h (height, m) }. Solid: cars bounce off them. */
export const MAX_ROCKS = 130;
export function normalizeRocks(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const b of list) {
    if (out.length >= MAX_ROCKS || !b) continue;
    const x = Number(b.x), z = Number(b.z), r = Number(b.r), h = Number(b.h);
    if (![x, z, r, h].every(Number.isFinite) || Math.abs(x) > 1e5 || Math.abs(z) > 1e5) continue;
    out.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, r: clamp(r, 0.3, 3.5), h: clamp(h, 0.3, 3.5) });
  }
  return out;
}

/** Rough patches: stretches of the road with deep, regular ridges and grooves (washboard) that rattle a car: { s (where it starts, m along the road), len (m), amp (m) }. */
export const MAX_ROUGH = 14, ROUGH_WAVE = 4.5;
export function normalizeRough(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const b of list) {
    if (out.length >= MAX_ROUGH || !b) continue;
    const s = Number(b.s), len = Number(b.len), amp = Number(b.amp);
    if (![s, len, amp].every(Number.isFinite) || s < 0 || s > 1e5) continue;
    out.push({ s: Math.round(s), len: clamp(Math.round(len), 10, 150), amp: clamp(Math.round(amp * 100) / 100, 0.03, 0.22) });
  }
  return out;
}

/** Boulders that start by the side of a rally stage and roll across the road when a car gets near: { x, z (where it waits), r (m), dx, dz (the way it rolls, unit) }. */
export const MAX_ROLLERS = 12;
export function normalizeRollers(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const b of list) {
    if (out.length >= MAX_ROLLERS || !b) continue;
    const x = Number(b.x), z = Number(b.z), r = Number(b.r); let dx = Number(b.dx), dz = Number(b.dz);
    const m = Math.hypot(dx, dz);
    if (![x, z, r, dx, dz].every(Number.isFinite) || m < 1e-6 || Math.abs(x) > 1e5 || Math.abs(z) > 1e5) continue;
    out.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, r: clamp(r, 0.8, 2.6), dx: Math.round(dx / m * 1000) / 1000, dz: Math.round(dz / m * 1000) / 1000 });
  }
  return out;
}

// ---------------------------------------------------------------- dirt banks and puddles (rally stages)

/** A dirt bank along each side of a rally stage: rises BERM_H over BERM_RISE m from the road edge (smoothly), a flat crest, then falls away.
 *  `off` is the distance past the road edge; the height above the edge goes in `out.h` and its slope (up = positive) in `out.g`. */
export const BERM_H = 1.5, BERM_RISE = 3.2, BERM_CREST = 1.2;
export function bermProfile(off, out) {
  if (off <= 0) { out.h = 0; out.g = 0; return out; }
  if (off < BERM_RISE) { const u = off / BERM_RISE; out.h = BERM_H * u * u * (3 - 2 * u); out.g = BERM_H * 6 * u * (1 - u) / BERM_RISE; return out; }
  if (off < BERM_RISE + BERM_CREST) { out.h = BERM_H; out.g = 0; return out; }
  out.h = BERM_H - (off - BERM_RISE - BERM_CREST) * 1.0; out.g = -1.0; return out;
}
const _berm = { h: 0, g: 0 };
const Cy_open = (py, i, j, t) => py[i] + (py[j] - py[i]) * t;

/** Puddles on a rally stage: round pools of water on the road, { x, z, r (radius, m) }. */
export const MAX_PUDDLES = 24;
export function normalizePuddles(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const b of list) {
    if (out.length >= MAX_PUDDLES || !b) continue;
    const x = Number(b.x), z = Number(b.z), r = Number(b.r);
    if (![x, z, r].every(Number.isFinite) || Math.abs(x) > 1e5 || Math.abs(z) > 1e5) continue;
    out.push({ x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, r: clamp(r, 1.5, 30) });
  }
  return out;
}

/** Seconds for a boulder starting from rest to roll `dist` metres (it speeds up at 6 m/s² to 9.5 m/s, see stepRollers). */
const rollTime = (dist) => (dist <= 7.52 ? Math.sqrt(2 * dist / 6) : 1.583 + (dist - 7.52) / 9.5);
const shapeOf = new WeakMap();
/** An irregular outline for a puddle, worked out from where it is (so every player sees and drives through the same one): stretched and turned a different way each, with lumpy edges.
 *  `a`, `b` are the long and short half-widths, `rot` the turn, and `k` the lumps: the edge is at 1 + sum(amp * cos(n * angle + phase)) of the way out. */
export function puddleShape(p) {
  let sh = shapeOf.get(p);
  if (sh) return sh;
  let st = (Math.imul(Math.round(p.x) | 0, 73856093) ^ Math.imul(Math.round(p.z) | 0, 19349663)) >>> 0 || 1;
  const rnd = () => { st = (Math.imul(st ^ (st >>> 15), 2246822519) + 0x9e3779b9) >>> 0; st ^= st >>> 13; return (st >>> 0) / 4294967296; };
  const el = 1 + rnd() * 1.1, rot = rnd() * Math.PI;                       // long and thin or nearly round
  const k = [[2, 0.10 + rnd() * 0.14], [3, 0.06 + rnd() * 0.10], [5, 0.03 + rnd() * 0.07], [7, 0.02 + rnd() * 0.04]].map(([n, amp]) => ({ n, amp, ph: rnd() * Math.PI * 2 }));
  sh = { a: p.r * Math.sqrt(el), b: p.r / Math.sqrt(el), cos: Math.cos(rot), sin: Math.sin(rot), k, rot };
  sh.bound = sh.a * (1 + k.reduce((t, l) => t + l.amp, 0)) + 0.1;
  shapeOf.set(p, sh);
  return sh;
}
/** How far out the edge is (as a share of the half-widths) at `angle` round the puddle. */
export function puddleEdge(sh, angle) {
  let e = 1; for (const l of sh.k) e += l.amp * Math.cos(l.n * angle + l.ph);
  return e < 0.55 ? 0.55 : e;
}

// ---------------------------------------------------------------- definition

/** Fill defaults, migrate legacy (v4, v5) editor data, and clamp values. */
export function normalizeTrack(input) {
  const src = input || {};
  const arena = src.mode === 'lastStanding';
  const width = clamp(Number(src.width) || 22, 12, arena ? 120 : 40);          // an arena's 'road' is a whole dirt floor
  const handles = (Array.isArray(src.handles) ? src.handles : []).map((h) => ({
    x: Number(h.x) || 0,
    y: Math.max(0, Number.isFinite(+h.y) ? +h.y : 0.65),
    z: Number(h.z) || 0,
    w: h.w ? clamp(Number(h.w), 12, 40) : 0,           // 0 = use track default
    bank: clamp(Number(h.bank) || 0, -20, 20),          // degrees
    gap: h.gap ? clamp(Number(h.gap), 6, 70) : (h.gapAfter ? 14 : 0), // metres of missing road
    lip: clamp(Number.isFinite(+h.lip) && h.lip !== null && h.lip !== '' ? +h.lip : TAKEOFF_RISE, LIP.minH, LIP.maxH),   // takeoff ramp height (m)
    open: h.open ? true : undefined,                    // no barriers on the stretch from here to the next point (a spiral ramp)
    kick: clamp(Number(h.kick) || 0, 0, LIP.maxDeg),    // launch angle at the lip (degrees); 0 = ramp flattens out
  }));
  const out = {
    version: TRACK_VERSION,
    name: String(src.name || 'Untitled circuit').slice(0, 40),
    closed: true,
    width,
    walls: src.walls !== false,
    handles,
    props: normalizeProps(src.props),
  };
  if (src.assault) { const as = normalizeAssault(src.assault); if (as) out.assault = as; }       // Apple Crumple: a solo timed obstacle course
  if (src.defaultLaps) out.defaultLaps = clamp(Math.round(Number(src.defaultLaps)) || 1, 1, 3);      // how many laps this track starts with, until the player picks a number of laps themselves
  if (src.quickRace) out.quickRace = true;                      // Buckle up!: always a fast one-lap race
  if (src.lowCam) out.lowCam = true;             // roads stacked above each other: the game uses a low tail camera so the road above cannot hide the car
  if (src.dirt) {                                // a loose-surface rally stage: dirt road, no kerbs, less grip
    out.dirt = true;
    if (src.berm) out.berm = true;               // dirt banks along both sides instead of walls
    const bumps = normalizeBumps(src.bumps); if (bumps.length) out.bumps = bumps;       // humps in the road
    const rocks = normalizeRocks(src.rocks); if (rocks.length) out.rocks = rocks;
    const rough = normalizeRough(src.rough); if (rough.length) out.rough = rough;
    const rollers = normalizeRollers(src.rollers); if (rollers.length) out.rollers = rollers;
  }
  const puddles = normalizePuddles(src.puddles); if (puddles.length) out.puddles = puddles;          // pools of water (a rally stage, or a flooded dip)
  if (src.mode === 'lastStanding') {
    out.mode = 'lastStanding';    // a free-for-all arena: no laps, the last car running wins
    const bumps = normalizeBumps(src.bumps); if (bumps.length) out.bumps = bumps;     // humps in the dirt floor
  }
  return out;
}

// ------------------------------------------------------------------- spline

function crCentripetal(p0, p1, p2, p3, t, out) {
  const d = (a, b) => Math.max(Math.pow(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), 0.5), 1e-3);
  const t0 = 0, t1 = d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
  const T1 = t1, T2 = t2;
  const tt = T1 + (T2 - T1) * t;
  for (let k = 0; k < 3; k++) {
    const A1 = ((T1 - tt) * p0[k] + (tt - t0) * p1[k]) / (T1 - t0);
    const A2 = ((T2 - tt) * p1[k] + (tt - T1) * p2[k]) / (T2 - T1);
    const A3 = ((t3 - tt) * p2[k] + (tt - T2) * p3[k]) / (t3 - T2);
    const B1 = ((T2 - tt) * A1 + (tt - t0) * A2) / (T2 - t0);
    const B2 = ((t3 - tt) * A2 + (tt - T1) * A3) / (t3 - T1);
    out[k] = ((T2 - tt) * B1 + (tt - T1) * B2) / (T2 - T1);
  }
  return out;
}

/** Dense polyline through the handles (closed). Returns points + cumulative length per handle. */
function densePolyline(def) {
  const H = def.handles, n = H.length;
  const P = H.map((h) => [h.x, h.y, h.z]);
  const pts = [];               // {x,y,z,w,bank}
  const handleDense = [];       // index into pts where each handle starts
  const tmp = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    const steps = clamp(Math.ceil(chord / 0.6), 12, 260);
    const h1 = H[i], h2 = H[(i + 1) % n];
    const w1 = h1.w || def.width, w2 = h2.w || def.width;
    handleDense.push(pts.length);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      crCentripetal(p0, p1, p2, p3, t, tmp);
      const u = smoothstep(t);
      pts.push({ x: tmp[0], y: Math.max(0, tmp[1]), z: tmp[2], w: lerp(w1, w2, u), bank: lerp(h1.bank, h2.bank, u) });
    }
  }
  const first = pts[0];
  pts.push({ ...first });        // close the loop
  return { pts, handleDense };
}

// -------------------------------------------------------------------- Track

export class Track {
  constructor(input) {
    this.def = normalizeTrack(input);
    this.apron = this.def.walls ? APRON : 0;
    this.overshoot = this.def.mode === 'lastStanding' ? ARENA_OVERSHOOT : MAX_OVERSHOOT;
    this.bumps = this.def.bumps || null;
    this.berm = !!this.def.berm; this.margin = this.berm ? BERM_MARGIN : QUERY_MARGIN;
    this.puddles = this.def.puddles || null;
    if (this.def.handles.length < 4) throw new Error('A track needs at least 4 handles');
    this._build();
    // boulders: remember how high the ground is under each (the car's collision needs it)
    this.rocks = (this.def.rocks || []).map((b) => ({ ...b, y: this.query(b.x, 40, b.z, undefined, 2).y }));
    // boulders that roll across the road: they sit by the roadside (as rocks) until a car comes near
    this.rollers = (this.def.rollers || []).map((b, i) => {
      const q = this.query(b.x, 40, b.z, undefined, 3);
      return { x: b.x, z: b.z, y: q.y, r: b.r, h: b.r * 1.9, roller: true, vx: 0, vz: 0, x0: b.x, z0: b.z, dx: b.dx, dz: b.dz, state: 'wait', speed: 0, ang: 0, rest: 0,
        tArr: 2.5 + ((i * 37) % 11) * 0.1, travel: Math.abs(q.d) + q.hw + 8, reach: Math.abs(q.d), tC: rollTime(Math.abs(q.d)) };
    });
    for (const r of this.rollers) this.rocks.push(r);
    if (!this.rollers.length) this.rollers = null;
    if (!this.rocks.length) this.rocks = null;
    this._rq = Track.newQuery(); this._rollN = 0;
  }

  /** Another player's boulder has been set off (multiplayer): ours rolls too, if it is still waiting. */
  rollerGo(i) {
    const b = this.rollers && this.rollers[i];
    if (b && b.state === 'wait') { b.state = 'roll'; b.speed = 0; b.go = 0; }
  }

  /** Run the rolling boulders one step. `cars` are the things that set them off (anything with .pos and .vel); `onGo(i)` hears of each one set off here;
   *  `others` are other players' positions ({x, z}), who only count as watching. */
  stepRollers(dt, cars, onGo = null, others = null) {
    if (!this.rollers) return;
    for (let bi = 0; bi < this.rollers.length; bi++) {
      const b = this.rollers[bi];
      if (b.state === 'wait') {
        b.vx = b.vz = 0;
        const px = b.x0 + b.dx * b.reach, pz = b.z0 + b.dz * b.reach;                      // where it will cross the middle of the road
        for (const c of cars) {
          const rx = px - c.pos.x, rz = pz - c.pos.z, d = Math.hypot(rx, rz);
          const closing = (c.vel.x * rx + c.vel.z * rz) / Math.max(d, 1);
          if (d > 6 && closing > 8 && d / closing < b.tC + (b.tArr - 3) * 0.4) { b.state = 'roll'; b.speed = 0; b.go = 0; if (onGo) onGo(bi); break; }       // a car is coming this way at speed: the boulder is set off so it meets the road as the car does
        }
      } else if (b.state === 'roll') {
        b.speed = Math.min(9.5, b.speed + 6 * dt);
        b.x += b.dx * b.speed * dt; b.z += b.dz * b.speed * dt; b.go += b.speed * dt;
        b.vx = b.dx * b.speed; b.vz = b.dz * b.speed; b.ang += b.speed * dt / b.r;
        const q = this.query(b.x, b.y + 3, b.z, this._rq, 3);
        if (q.idx >= 0) b.y = q.y;
        if (b.go >= b.travel) { b.state = 'rest'; b.rest = 0; b.vx = b.vz = 0; }
      } else if (b.state === 'rest') {
        b.rest += dt;
        if (b.rest > 25) {                                         // go back to the start, but only when nobody can see it happen
          let seen = false;
          for (const c of cars) if (Math.hypot(c.pos.x - b.x, c.pos.z - b.z) < 80 || Math.hypot(c.pos.x - b.x0, c.pos.z - b.z0) < 80) seen = true;
          if (others) for (const c of others) if (Math.hypot(c.x - b.x, c.z - b.z) < 80 || Math.hypot(c.x - b.x0, c.z - b.z0) < 80) seen = true;      // (other players count as watching too)
          if (!seen) { b.x = b.x0; b.z = b.z0; b.state = 'wait'; b.ang = 0; const q = this.query(b.x, b.y + 3, b.z, this._rq, 3); if (q.idx >= 0) b.y = q.y; }
        }
      }
    }
  }

  _build() {
    const def = this.def;
    const { pts, handleDense } = densePolyline(def);

    // cumulative arc length along the dense polyline
    const cum = new Float64Array(pts.length);
    for (let i = 1; i < pts.length; i++) {
      cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    }
    const total = cum[pts.length - 1];
    const n = Math.max(16, Math.round(total / (def.mode === 'lastStanding' ? ARENA_SPACING : SAMPLE_SPACING)));
    const ds = total / n;
    this.n = n; this.ds = ds; this.length = total;
    this.handleS = handleDense.map((k) => cum[k]);
    // open stretches (no barriers, and a fall off the edge): the samples from an `open` point to the next point. Coming back from one means starting again at its foot.
    this.wallOff = new Uint8Array(n); this.openA = -1; this.openB = -1;
    def.handles.forEach((h, hi) => {
      if (!h.open) return;
      const a = this.handleS[hi], b = hi + 1 < def.handles.length ? this.handleS[hi + 1] : total;
      if (this.openA < 0 || a < this.openA) this.openA = a;
      if (b > this.openB) this.openB = b;
      for (let i = Math.floor(a / ds); i < Math.min(n, Math.ceil(b / ds)); i++) this.wallOff[i] = 1;
    });

    const px = (this.px = new Float64Array(n)), py = (this.py = new Float64Array(n)), pz = (this.pz = new Float64Array(n));
    const hw = (this.hw = new Float64Array(n)), bank = (this.bank = new Float64Array(n));
    const s = (this.s = new Float64Array(n));
    let k = 0;
    for (let i = 0; i < n; i++) {
      const target = i * ds;
      while (k < pts.length - 2 && cum[k + 1] < target) k++;
      const seg = cum[k + 1] - cum[k] || 1;
      const t = clamp((target - cum[k]) / seg, 0, 1);
      const a = pts[k], b = pts[k + 1];
      px[i] = lerp(a.x, b.x, t); py[i] = lerp(a.y, b.y, t); pz[i] = lerp(a.z, b.z, t);
      hw[i] = lerp(a.w, b.w, t) / 2; bank[i] = lerp(a.bank, b.bank, t) * DEG;
      s[i] = target;
    }

    // Banking pivots about the LOW edge, so the handle height is the lowest point of the road
    // and no part of a banked road ever dips below the ground.
    for (let i = 0; i < n; i++) py[i] += hw[i] * Math.abs(Math.tan(bank[i]));

    // rough patches: washboard ridges and grooves, fading in and out at each end
    for (const rp of def.rough || []) {
      for (let i = 0; i < n; i++) {
        const u = s[i] - rp.s; if (u < 0 || u > rp.len) continue;
        const taper = smoothstep(Math.min(u, rp.len - u) / 10);
        py[i] += rp.amp * taper * Math.sin(2 * Math.PI * u / ROUGH_WAVE);
      }
    }

    // gaps ("jumps"): stretches with no road surface at all. Each one gets a takeoff ramp
    // and a slightly lower landing so it is a real jump rather than a step.
    const gap = (this.gap = new Uint8Array(n));
    def.handles.forEach((h, hi) => {
      if (!h.gap) return;
      const c = this.handleS[hi], half = h.gap / 2, ramp = takeoffRamp(h);
      for (let i = 0; i < n; i++) {
        let d = s[i] - c; if (d > total / 2) d -= total; if (d < -total / 2) d += total;   // signed distance to gap centre
        if (Math.abs(d) <= half) gap[i] = 1;
        else if (d < 0 && d > -half - ramp.len) py[i] += ramp.at(d + half + ramp.len);
        else if (d > 0 && d < half + LANDING_LEN) py[i] -= LANDING_DROP * smoothstep((half + LANDING_LEN - d) / LANDING_LEN);
      }
    });

    // frames: tangent T, horizontal left L, banked surface normal N and banked left Lb
    const tx = (this.tx = new Float64Array(n)), ty = (this.ty = new Float64Array(n)), tz = (this.tz = new Float64Array(n));
    const lx = (this.lx = new Float64Array(n)), lz = (this.lz = new Float64Array(n));
    const nx = (this.nx = new Float64Array(n)), ny = (this.ny = new Float64Array(n)), nz = (this.nz = new Float64Array(n));
    const bx = (this.bx = new Float64Array(n)), by = (this.by = new Float64Array(n)), bz = (this.bz = new Float64Array(n));
    const curv = (this.curv = new Float64Array(n));
    const yaw = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // one-sided at the edges of a gap, so a ramp's lip keeps its own slope
      const p = gap[(i - 1 + n) % n] && !gap[i] ? i : (i - 1 + n) % n, q = gap[(i + 1) % n] && !gap[i] ? i : (i + 1) % n;
      let Tx = px[q] - px[p], Ty = py[q] - py[p], Tz = pz[q] - pz[p];
      const tl = Math.hypot(Tx, Ty, Tz) || 1; Tx /= tl; Ty /= tl; Tz /= tl;
      tx[i] = Tx; ty[i] = Ty; tz[i] = Tz;
      const th = Math.hypot(Tx, Tz) || 1;
      const Lx = Tz / th, Lz = -Tx / th;                 // up x T, normalised (horizontal left)
      lx[i] = Lx; lz[i] = Lz;
      // N0 = T x L
      const N0x = Ty * Lz, N0y = Tz * Lx - Tx * Lz, N0z = -Ty * Lx;
      const c = Math.cos(bank[i]), sn = Math.sin(bank[i]);
      nx[i] = N0x * c - Lx * sn; ny[i] = N0y * c; nz[i] = N0z * c - Lz * sn;
      bx[i] = Lx * c + N0x * sn; by[i] = N0y * sn; bz[i] = Lz * c + N0z * sn;
      yaw[i] = Math.atan2(Tx, Tz);
    }
    for (let i = 0; i < n; i++) {
      const p = (i - 2 + n) % n, q = (i + 2) % n;
      curv[i] = wrapPi(yaw[q] - yaw[p]) / (4 * ds);        // + = turning left
    }

    this._buildGrid();
  }

  _buildGrid() {
    const n = this.n, cells = new Map();
    const key = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
    for (let i = 0; i < n; i++) {
      const R = this.hw[i] + this.margin + 1.5;
      const x0 = Math.floor((this.px[i] - R) / CELL), x1 = Math.floor((this.px[i] + R) / CELL);
      const z0 = Math.floor((this.pz[i] - R) / CELL), z1 = Math.floor((this.pz[i] + R) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const kk = key(cx, cz);
        let a = cells.get(kk); if (!a) { a = []; cells.set(kk, a); }
        a.push(i);
      }
    }
    for (const [kk, a] of cells) cells.set(kk, Int32Array.from(a));
    this.cells = cells;
    this._key = key;
  }

  // ------------------------------------------------------------- queries

  static newQuery() {
    return {
      surface: SURF.BASE, y: GROUND_Y, nx: 0, ny: 1, nz: 0,
      d: 0, hw: 0, lx: 1, lz: 0, tx: 0, tz: 1, s: 0, idx: -1, edgeY: 0, dist: Infinity,
    };
  }

  /**
   * Ground under (x, z) as seen from height y. Surfaces higher than y+tol are ignored, so
   * bridges and underpasses resolve correctly. Among road segments on the same level the
   * nearest one wins.
   */
  query(x, y, z, out = Track.newQuery(), tol = 0.6) {
    out.surface = SURF.BASE; out.y = GROUND_Y; out.nx = 0; out.ny = 1; out.nz = 0;
    out.idx = -1; out.dist = Infinity; out.d = 0; out.hw = 0; out.edgeY = 0;
    const list = this.cells.get(this._key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return out;
    const n = this.n, { px, pz, gap } = this;
    if (candI.length < list.length) { candI = new Int32Array(list.length * 2); candY = new Float64Array(list.length * 2); candD = new Float64Array(list.length * 2); }
    let m = 0, topY = -Infinity;
    for (let a = 0; a < list.length; a++) {
      const i = list[a], j = i + 1 === n ? 0 : i + 1;
      if (gap[i] || gap[j]) continue;
      const ax = px[i], az = pz[i], dx = px[j] - ax, dz = pz[j] - az;
      const len2 = dx * dx + dz * dz || 1e-9;
      const tRaw = ((x - ax) * dx + (z - az) * dz) / len2;
      // A segment only claims points just beyond its ends (covers the wedge outside a bend).
      // Anything further is not on this road - this is what makes gaps and lips hard edges.
      const over = tRaw < 0 ? -tRaw : tRaw > 1 ? tRaw - 1 : 0;
      if (over > 0 && over * len2 > this.overshoot * Math.sqrt(len2)) continue;
      const t = clamp(tRaw, 0, 1);
      const cx = ax + dx * t, cz = az + dz * t;
      const dd = (x - cx) * (x - cx) + (z - cz) * (z - cz);
      const c = this._eval(i, j, t, x, z, cx, cz);
      if (c === null || c > y + tol) continue;
      candI[m] = i; candY[m] = c; candD[m] = dd; m++;
      if (c > topY) topY = c;
    }
    if (m === 0) return out;
    let bi = -1, bd = Infinity;
    for (let a = 0; a < m; a++) if (candY[a] >= topY - 1.5 && candD[a] < bd) { bd = candD[a]; bi = a; }
    const i = candI[bi], j = i + 1 === n ? 0 : i + 1;
    const ax = px[i], az = pz[i], dx = px[j] - ax, dz = pz[j] - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1e-9), 0, 1);
    const cx = ax + dx * t, cz = az + dz * t;
    this._eval(i, j, t, x, z, cx, cz, out);
    out.idx = i; out.dist = Math.sqrt(bd);
    out.s = this.s[i] + t * this.ds;
    out.tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t; out.tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
    return out;
  }

  /** Ground height on segment i->j for point (x,z); optionally fills `out` with the full result. */
  _eval(i, j, t, x, z, cx, cz, out) {
    const { py, lx, lz, nx, ny, nz, hw: HW } = this;
    const Lx = lx[i] + (lx[j] - lx[i]) * t, Lz = lz[i] + (lz[j] - lz[i]) * t;
    const d = (x - cx) * Lx + (z - cz) * Lz;
    const hw = HW[i] + (HW[j] - HW[i]) * t;
    const ad = Math.abs(d);
    if (ad > hw + this.margin) return null;
    if (ad > hw + 0.6 && this.wallOff[i] && Cy_open(this.py, i, j, t) > 3) return null;       // open spiral road: nothing beside it, you fall
    const Cy = py[i] + (py[j] - py[i]) * t;
    let Nx = nx[i] + (nx[j] - nx[i]) * t, Ny = ny[i] + (ny[j] - ny[i]) * t, Nz = nz[i] + (nz[j] - nz[i]) * t;
    let yc, yEdge;
    if (ad <= hw) {
      yc = Cy - (Nx * (x - cx) + Nz * (z - cz)) / Ny; yEdge = yc;
      if (this.bumps) { bumpAt(this.bumps, x, z, _bump); yc += _bump.h; Nx -= _bump.gx * Ny; Nz -= _bump.gz * Ny; }
    } else {
      const sg = d < 0 ? -1 : 1;
      yEdge = Cy - (Nx * Lx * hw * sg + Nz * Lz * hw * sg) / Ny;
      yc = this.berm ? Math.max(GROUND_Y, yEdge + bermProfile(ad - hw, _berm).h) : Math.max(GROUND_Y, yEdge - Math.max(0, ad - hw - this.apron) * EMBANKMENT);
    }
    if (out) {
      out.d = d; out.hw = hw; out.lx = Lx; out.lz = Lz; out.edgeY = yEdge; out.y = yc;
      if (ad <= hw) {
        out.surface = SURF.ROAD;
      } else {
        out.surface = SURF.VERGE;
        if (this.berm) {                      // dirt bank: the normal leans with the bank's slope
          const sg = d < 0 ? -1 : 1;
          if (yc > GROUND_Y + 1e-6) { bermProfile(ad - hw, _berm); Nx = -Lx * sg * _berm.g; Ny = 1; Nz = -Lz * sg * _berm.g; } else { Nx = 0; Ny = 1; Nz = 0; }
        } else if (ad - hw <= this.apron) {   // flat kerb in front of / under the wall
          Nx = 0; Ny = 1; Nz = 0;
        } else if (yc > GROUND_Y + 1e-6) {    // sloping embankment: normal tilts away from the road
          const sg = d < 0 ? -1 : 1;
          Nx = Lx * sg * EMBANKMENT; Ny = 1; Nz = Lz * sg * EMBANKMENT;
        } else { Nx = 0; Ny = 1; Nz = 0; }
      }
      const l = Math.hypot(Nx, Ny, Nz) || 1;
      out.nx = Nx / l; out.ny = Ny / l; out.nz = Nz / l;
    }
    return yc;
  }

  /**
   * Ground under (x, z) for something that sits near height yHint (a prop or a barrel).
   * Same rules as query(). With `top` set, if nothing is found at that level it falls back to the
   * highest surface there, which is what you want when the road has been raised since yHint was saved.
   */
  groundAt(x, z, yHint, out = Track.newQuery(), top = false) {
    this.query(x, yHint, z, out, 0.9);
    if (top && out.idx < 0) this.query(x, 1e4, z, out, 1);
    return out;
  }

  /** Is road distance `s` on an open spiral stretch (no barriers)? */
  inOpen(s) {
    if (this.openA < 0) return false;
    const L = this.length, u = ((s % L) + L) % L;
    return u >= this.openA - 1 && u <= this.openB;
  }

  /** Where to put a car that is being brought back to the road from road distance `s`: the same place, unless that is on an open spiral stretch,
   *  in which case it starts again at the foot of the spiral. */
  restartS(s) {
    if (this.openA < 0) return s;
    const L = this.length;
    return this.inOpen(s) ? ((this.openA - 14) % L + L) % L : s;
  }

  /** How deep the water is at (x, z): 0 = dry, up to 1 in the middle of a puddle (eased towards the edge). */
  puddleAt(x, z) {
    if (!this.puddles) return 0;
    let w = 0;
    for (const p of this.puddles) {
      const dx = x - p.x, dz = z - p.z, sh = puddleShape(p);
      if (dx > sh.bound || dx < -sh.bound || dz > sh.bound || dz < -sh.bound) continue;
      const u = (dx * sh.cos + dz * sh.sin) / sh.a, v = (-dx * sh.sin + dz * sh.cos) / sh.b, rho = Math.hypot(u, v);
      const edge = puddleEdge(sh, Math.atan2(v, u));
      if (rho < edge) w = Math.max(w, Math.min(1, (1 - rho / edge) * 2.2));
    }
    return w;
  }

  /** The stretch of road that is a flooded fish tank (a chain of big pools, as on Big Dipper): { a, b } in metres along the road, or null. Glass walls stand along it even when the track has none. */
  floodRange() {
    if (this._flood !== undefined) return this._flood;
    let a = Infinity, b = -Infinity; const q = Track.newQuery();
    for (const p of this.puddles || []) if (p.r >= 15) { this.query(p.x, 1e4, p.z, q, 1); if (q.idx < 0) continue; const sp = this.s[q.idx]; if (sp < a) a = sp; if (sp > b) b = sp; }
    return (this._flood = a <= b ? { a: a - 6, b: b + 6 } : null);
  }
  inTank(idx) { const r = this.floodRange(); return !!r && this.s[idx] >= r.a && this.s[idx] <= r.b; }

  /** Penetration (m) into the wall at a query result for a point at height y; 0 if none. */
  wallPenetration(q, y) {
    if (q.idx < 0 || this.wallOff[q.idx] || !(this.def.walls || this.inTank(q.idx))) return 0;
    const ad = Math.abs(q.d), face = q.hw + WALL_GAP;
    if (ad <= face || ad > face + 2.4) return 0;
    if (y > q.edgeY + (this.def.walls ? WALL_HEIGHT : TANK_H)) return 0;
    return ad - face;
  }

  /** Interpolated frame at arc length s (wraps). */
  frameAt(sIn, out = {}) {
    const L = this.length;
    let sv = ((sIn % L) + L) % L;
    let i = Math.floor(sv / this.ds); if (i >= this.n) i = this.n - 1;
    const j = (i + 1) % this.n, t = clamp((sv - this.s[i]) / this.ds, 0, 1);
    const g = (A) => A[i] + (A[j] - A[i]) * t;
    out.x = g(this.px); out.y = g(this.py); out.z = g(this.pz);
    out.fx = g(this.tx); out.fy = g(this.ty); out.fz = g(this.tz);
    out.nx = g(this.nx); out.ny = g(this.ny); out.nz = g(this.nz);
    out.lx = g(this.bx); out.ly = g(this.by); out.lz = g(this.bz);
    out.hw = g(this.hw); out.idx = i;
    return out;
  }

  /** Nearest road progress (arc length) for a world position. Falls back to a full scan. */
  progressAt(x, y, z) {
    const q = this.query(x, y, z, this._pq || (this._pq = Track.newQuery()), 1.5);
    if (q.idx >= 0) return q.s;
    let best = Infinity, bi = 0;
    for (let i = 0; i < this.n; i += 2) {
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2 + ((this.py[i] - y) * 2) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    return this.s[bi];
  }

  /** Where the car should start: a little behind the start line, on the centreline. */
  startS(back = 10) { return this.length - back; }
}

// --------------------------------------------------------------- validation

/**
 * Look for problems a designer should know about:
 *   tight   - sample indices where the corner is too sharp for the road width
 *   crossings - places where the road crosses itself at nearly the same height
 */
export function analyzeTrack(track) {
  const tight = [];
  for (let i = 0; i < track.n; i++) {
    const k = Math.abs(track.curv[i]);
    if (k > 1e-4 && 1 / k < track.hw[i] + 1.5) tight.push(i);
  }
  const crossings = [];
  const step = 3, m = Math.floor(track.n / step);
  const X = [], Z = [], Y = [];
  for (let a = 0; a < m; a++) { X.push(track.px[a * step]); Z.push(track.pz[a * step]); Y.push(track.py[a * step]); }
  for (let a = 0; a < m; a++) {
    const a2 = (a + 1) % m;
    for (let b = a + 6; b < m; b++) {
      const b2 = (b + 1) % m;
      if (a === 0 && b >= m - 6) continue;
      const hit = segIntersect(X[a], Z[a], X[a2], Z[a2], X[b], Z[b], X[b2], Z[b2]);
      if (!hit) continue;
      if (Math.abs(lerp(Y[a], Y[a2], hit.t) - lerp(Y[b], Y[b2], hit.u)) < 4.5) {
        crossings.push({ x: hit.x, z: hit.z });
      }
    }
  }
  return { tight, crossings };
}

function segIntersect(x1, z1, x2, z2, x3, z3, x4, z4) {
  const d = (x2 - x1) * (z4 - z3) - (z2 - z1) * (x4 - x3);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((x3 - x1) * (z4 - z3) - (z3 - z1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (z2 - z1) - (z3 - z1) * (x2 - x1)) / d;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, x: x1 + t * (x2 - x1), z: z1 + t * (z2 - z1) };
}

/** Bank angles (deg) that lean each handle into its corner. Positive lifts the left edge. */
export function suggestBanks(track, maxDeg = 12, gain = 700) {
  return track.def.handles.map((_, hi) => {
    const i = Math.round(track.handleS[hi] / track.ds) % track.n;
    let k = 0;
    for (let o = -6; o <= 6; o++) k += track.curv[(i + o + track.n) % track.n];
    k /= 13;
    return Math.round(clamp(-k * gain, -maxDeg, maxDeg) * 2) / 2;
  });
}
