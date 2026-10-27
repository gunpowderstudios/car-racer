// Built-in circuits. All units are metres. Handle 0 is the start/finish line and
// the car drives from handle 0 towards handle 1.

import { Track, suggestBanks, normalizeTrack, analyzeTrack } from './track.js';
import { placeProp } from './props.js';
import { arenaInfo, arenaPlayerStart } from './arena.js';
import { placeOnRoad } from './derby.js';
import { Vehicle } from './vehicle.js';
import { Driver } from './ai.js';

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const RANDOM_DT = 1 / 60;
const RANDOM_TEMPLATE_SEED = 20260926;   // arbitrary, fixed - makes makeTemplate('random') reproducible

/** Drives a short window approaching and clearing one jump, with the real rival AI (jump-aware). */
function jumpOkWithAI(track, s) {
  const car = new Vehicle();
  placeOnRoad(car, track, ((s - 55) % track.length + track.length) % track.length, 0, 18);
  const drv = new Driver(mulberry(7), 0.4), ctx = { player: null, cars: [car], barrels: null };
  for (let i = 0, steps = 9 / RANDOM_DT; i < steps; i++) {
    car.step(RANDOM_DT, i % 4 === 0 ? drv.drive(car, track, ctx, RANDOM_DT * 4) : drv.input, track);
    if (car.ay.y < 0.15 || car.pos.y < -20) return false;               // flipped, or fell off the world
  }
  return true;
}

/** The same short window, but with a much simpler fixed-speed-budget controller with no jump smarts at all -
 *  a jump has to be gentle enough to clear even without special handling, not just survivable for a smart AI. */
function jumpOkWithBot(track, s) {
  const car = new Vehicle();
  placeOnRoad(car, track, ((s - 55) % track.length + track.length) % track.length, 0, 20);
  const speed = 36, aLat = 8, look = 0.6;
  let walls = 0;
  for (let i = 0, steps = 9 / RANDOM_DT; i < steps; i++) {
    const cs = track.progressAt(car.pos.x, car.pos.y, car.pos.z);
    const la = Math.max(12, car.speed * look);
    const f = track.frameAt(cs + la);
    const dx = f.x - car.pos.x, dz = f.z - car.pos.z;
    const fx = car.az.x, fz = car.az.z;
    const ang = Math.atan2(-(fx * dz - fz * dx), fx * dx + fz * dz);
    const steer = Math.max(-1, Math.min(1, ang * 2.2));
    let maxK = 0;
    for (let o = 0; o < 60; o += 6) { const idx = Math.floor(((cs + o * 2) % track.length) / track.ds) % track.n; maxK = Math.max(maxK, Math.abs(track.curv[idx])); }
    const vT = Math.min(speed, Math.sqrt(aLat / Math.max(maxK, 1e-4))), err = vT - car.speed;
    car.step(RANDOM_DT, { steer, throttle: err > 0 ? Math.min(1, err / 4) : 0, brake: err < -2 && car.fwdSpeed > 3 ? Math.min(1, -err / 6) : 0, handbrake: false, boost: false }, track);
    for (const e of car.events) if (e.type === 'wall') walls++;
    car.events.length = 0;
    if (car.ay.y < 0.15 || car.pos.y < -20) return false;
  }
  return walls === 0;
}

/** Non-jump sections are already proven safe by the tight-corner/crossing check alone (stress-tested across
 *  thousands of seeds), so the expensive physics pass only runs when there's an actual jump to worry about. */
export function drivable(def) {
  const track = new Track(def);
  for (let hi = 0; hi < def.handles.length; hi++) {
    if (!def.handles[hi].gap) continue;
    const s = track.handleS[hi];
    if (!jumpOkWithAI(track, s) || !jumpOkWithBot(track, s)) return false;
  }
  return true;
}

function ellipse(a, b, n, y = 0.65) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    out.push({ x: a * Math.cos(t), y, z: b * Math.sin(t) });
  }
  return out;
}

const scale = (pts, s) => pts.map((p) => ({ ...p, x: p.x * s, z: p.z * s }));

function figureEight() {
  const a = 340, b = 230, n = 20, h = 9;
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    // First pass through the middle is the bridge, the second passes underneath.
    const rise = Math.pow(0.5 + 0.5 * Math.cos(t), 2);
    out.push({ x: a * Math.sin(t), y: 0.65 + h * rise, z: b * Math.sin(2 * t) });
  }
  return out;
}

/** The Oval's centreline: a short, fat ellipse. With the wide 'road' round it (see arena.js) it is the middle of a big dirt bowl. */
const OVAL_A = 36, OVAL_B = 36, OVAL_FLOOR = 118;       // metres: centreline half-length / half-width (equal: a small circle), and full floor width (59 m each side of it, so the floor is one solid round pizza 190 m across, with no hole in the middle)

/** The Deep Pan Pizza's floor, a plain margherita: dough crust round the edge (the outer fifth of the radius), red sauce inside it, black olive HUMPS and yellow cheese DIPS.
 *  Cheese dips are 30% broader than the olive humps, with the same depth profile. Always the same, and kept off the crust, the player's start, the respawn spots and the ring where the rivals line up. */
function ovalLumps(def) {
  const track = new Track(def), A = arenaInfo(track), rnd = mulberry(20261024), r2 = (v) => Math.round(v * 100) / 100;
  const sauce = A.ax * 0.8;                                                                   // the sauce ends here; the crust is the rest
  const keep = [arenaPlayerStart(A), ...[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([i, j]) => ({ x: A.cx + i * (A.ax - 26), z: A.cz + j * (A.az - 26) }))];
  const onRing = (x, z, m) => { const th = Math.atan2((z - A.cz) / (A.az * 0.6), (x - A.cx) / (A.ax * 0.62)); return Math.hypot(x - (A.cx + A.ax * 0.62 * Math.cos(th)), z - (A.cz + A.az * 0.6 * Math.sin(th))) < m; };
  const bumps = [], shapes = [];
  for (let k = 0; k < 8; k++) shapes.push({ r: 5.5 + rnd() * 2.5, h: 0.45 + rnd() * 0.5 });
  for (const gap of [16, 14, 12, 10, 8, 6]) {                                                  // roomier topping layout: only tighten if the full set will not fit
    bumps.length = 0; let all = true;
    for (const sg of [1, -1]) {                                                               // first the olives (humps), then the cheese (dips) with the very same sizes
      for (const sh of shapes) {
        const rr = sh.r * (sg < 0 ? 1.3 : 1);                                                  // cheese dips are 30% broader; olives keep their old size
        let ok = false;
        for (let guard = 0; guard < 4000 && !ok; guard++) {
          const x = A.cx + (rnd() * 2 - 1) * sauce, z = A.cz + (rnd() * 2 - 1) * sauce;
          if (Math.hypot(x - A.cx, z - A.cz) > sauce - rr - 2 || keep.some((k) => Math.hypot(x - k.x, z - k.z) < rr + 9) || onRing(x, z, rr + 1.5)) continue;
          if (bumps.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + rr + gap)) continue;
          bumps.push({ x: r2(x), z: r2(z), r: r2(rr), h: r2(sg * sh.h) }); ok = true;
        }
        if (!ok) all = false;
      }
    }
    if (all) break;
  }
  return { bumps };
}

/** Drums for The Oval: about forty - a scatter across the floor plus a few tight clusters - well spread out, none where you start and none on the ring where the rivals line up (so nobody blows up at the start). Always the same ones. */
function arenaProps(def) {
  const track = new Track(def), A = arenaInfo(track), count = 20 + Math.floor(Math.random() * 11), rnd = mulberry(20261010 + count * 7919), props = [], q = Track.newQuery();
  const start = arenaPlayerStart(A), r2 = (v) => Math.round(v * 100) / 100;
  const spots = [];
  const spot = () => {                                                   // a random place on the floor: clear of the walls, your start, the rivals' starting ring, and other drums
    for (let tries = 0; tries < 600; tries++) {
      const gap = Math.max(5.5, 9 - Math.floor(tries / 80));                // 9 m from the nearest other drum or cluster, relaxed if the floor is getting full
      const a = rnd() * Math.PI * 2, rr = rnd() ** (tries % 2 ? 1 : 0.7), x = A.cx + Math.cos(a) * rr * A.ax, z = A.cz + Math.sin(a) * rr * A.az;      // evenly over the whole disc, leaning towards the middle, because the olive humps fill most of it
      track.query(x, A.y + 0.5, z, q, 1.5);
      if (q.idx < 0 || Math.abs(q.d) > q.hw - 6) continue;
      if (Math.hypot(x - start.x, z - start.z) < 24) continue;
      const th = Math.atan2((z - A.cz) / (A.az * 0.6), (x - A.cx) / (A.ax * 0.62));      // the rivals line up on this ring (arena.js arenaSpawn): keep well off it
      if (Math.hypot(x - (A.cx + A.ax * 0.62 * Math.cos(th)), z - (A.cz + A.az * 0.6 * Math.sin(th))) < 9) continue;
      if ((def.bumps || []).some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 3) || (def.puddles || []).some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 1.5 + 3)) continue;           // not on a hump or in a puddle
      if (spots.some((o) => Math.hypot(x - o.x, z - o.z) < gap)) continue;
      spots.push({ x, z });
      return { x, z };
    }
    return { x: A.cx, z: A.cz };
  };
  const drum = (x, z) => { const p = placeProp(track, x, z); props.push({ type: 'barrel', x: r2(p.x), z: r2(p.z), y: r2(p.y) }); };
  for (let i = 0; i < count; i++) { const p = spot(); drum(p.x, p.z); }          // 20 to 30 giant (3x) peppers, a different number each time: far too big to cluster
  return props.filter((p) => !(def.bumps || []).some((b) => Math.hypot(p.x - b.x, p.z - b.z) < b.r + 3) && !(def.puddles || []).some((b) => Math.hypot(p.x - b.x, p.z - b.z) < b.r * 1.5 + 3));      // (a drum in a cluster can land a little off its spot)
}

/** Bluebell Woods: a windy dirt rally stage. The radius wanders in and out with two overlapping waves, with gentle rises and dips, and three jumps. */
const BB = { jumps: [5, 13, 21], gap: 8, kick: [3, 5, 7], lip: 0.8 };
function bluebell() {
  const n = 26, out = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2, r = 240 + 52 * Math.sin(3 * t + 0.4) + 24 * Math.sin(5 * t + 1.3);
    const h = { x: r * Math.cos(t) * 1.25, y: 0.65 + 1.2 * (1 + Math.sin(2 * t + 0.8)), z: r * Math.sin(t) };
    if (BB.jumps.includes(k)) Object.assign(h, { y: Math.max(h.y, 3), gap: BB.gap, kick: BB.kick[k % 3], lip: BB.lip });
    out.push(h);
  }
  const HILLS = { 2: 7, 9: 9, 17: 8 };                                        // three big hills, each rising and falling over three handles (about 130 m up, 130 m down)
  for (const [k, peak] of Object.entries(HILLS)) { out[k].y += peak; out[k - 1].y += peak * 0.5; out[(+k + 1) % n].y += peak * 0.5; }
  return out;
}

/** The few tightest corners of a dirt stage get steep banks (up to about 17 degrees). */
function steepBanks(def) {
  const banks = suggestBanks(new Track(def), 17), n = def.handles.length;
  const nearJump = (i) => [-1, 0, 1].some((o) => def.handles[(i + o + n) % n].gap);
  const order = banks.map((b, i) => [Math.abs(b), i]).filter(([, i]) => i > 1 && !nearJump(i)).sort((a, b) => b[0] - a[0]).slice(0, 7).map(([, i]) => i);
  return { ...def, handles: def.handles.map((h, i) => ({ ...h, bank: order.includes(i) ? banks[i] : 0 })) };
}

/** Humps and puddles scattered along a dirt stage at fixed random spots (never near the start or a jump, nor on top of each other). */
function rallyScatter(def) {
  const track = new Track(def), rnd = mulberry(20261016), bumps = [], puddles = [], taken = [], rough = [];
  const jumpS = track.handleS.filter((_, hi) => def.handles[hi].gap);
  const free = (s, clear = 55, gap = 32) => {
    const dist = (a, b) => { let d = Math.abs(a - b); return Math.min(d, track.length - d); };
    const straight = [-12, 0, 12].every((o) => Math.abs(track.curv[Math.round((((s + o) % track.length) + track.length) % track.length / track.ds) % track.n]) < 0.005);     // only where the road is fairly straight
    return straight && dist(s, 0) > 70 && jumpS.every((j) => dist(s, j) > clear) && taken.every((t) => dist(s, t) > gap) && !rough.some((p) => s > p.s - 20 && s < p.s + p.len + 20);
  };
  const place = (count, make, clear, gap) => {
    for (let guard = 0; guard < 400 && count > 0; guard++) {
      const s = rnd() * track.length; if (!free(s, clear, gap)) continue;
      const f = track.frameAt(s), off = (rnd() - 0.5) * f.hw * 0.9;
      make(f.x + f.lx * off, f.z + f.lz * off, f); taken.push(s); count--;
    }
  };
  // rough patches: washboard stretches (deep ridges and grooves) on the straighter parts, clear of the start and the jumps
  const curvAt = (u) => Math.abs(track.curv[Math.round((((u % track.length) + track.length) % track.length) / track.ds) % track.n]);
  for (let guard = 0; guard < 3000 && rough.length < 8; guard++) {
    const s = Math.floor(rnd() * track.length), len = 28 + Math.floor(rnd() * 34), amp = 0.07 + rnd() * 0.05;
    if (s + len > track.length - 40 || s < 90 || jumpS.some((j) => j > s - 60 && j < s + len + 60) || rough.some((p) => s < p.s + p.len + 90 && s + len > p.s - 90)) continue;
    if ([0, 0.25, 0.5, 0.75, 1].some((u) => curvAt(s + u * len) > 0.0045)) continue;
    rough.push({ s, len, amp: Math.round(amp * 100) / 100 });
  }
  place(9, (x, z) => puddles.push({ x, z, r: 3.5 + rnd() * 2.2 }), 120, 105);       // (well clear of where a jump lands)
  // lots of bumps of all sizes and heights, scattered along the whole stage (gentler on bends), clear of the jumps, puddles and the start line
  const dist = (a, b) => { let d = Math.abs(a - b); return Math.min(d, track.length - d); };
  const mounds = [];
  for (let guard = 0; guard < 6000 && bumps.length < 56; guard++) {
    const s = rnd() * track.length;
    if (dist(s, 0) < 60 || jumpS.some((j) => dist(s, j) < 45) || mounds.some((m) => dist(s, m) < 9) || rough.some((p) => s > p.s - 10 && s < p.s + p.len + 10)) continue;
    const k = Math.abs(track.curv[Math.round(s / track.ds) % track.n]);
    if (k > 0.0045 || Math.abs(track.curv[Math.round((s + 14) / track.ds) % track.n]) > 0.0045) continue;      // bends stay clean: only on the straighter stretches
    const f = track.frameAt(s), off = (rnd() - 0.5) * f.hw * 0.95, x = f.x + f.lx * off, z = f.z + f.lz * off;
    if (puddles.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 5)) continue;
    const r = 2.6 + Math.pow(rnd(), 1.5) * 7;                                  // mostly small and sharp, a few long ones
    const h = Math.min(0.58, 0.15 + rnd() * r * 0.07);           // proper humps: up to about 0.6 m, some of them steep
    bumps.push({ x, z, r, h }); mounds.push(s);
  }
  // grey boulders, mostly along the edges (some a little way onto the road), in loose groups, never near the start or a jump
  const rocks = [];
  for (let guard = 0; guard < 9000 && rocks.length < 80; guard++) {
    const s = rnd() * track.length;
    if (dist(s, 0) < 50 || jumpS.some((j) => dist(s, j) < 30)) continue;
    const f = track.frameAt(s), sg = rnd() < 0.5 ? 1 : -1, inside = rnd() < 0.14;
    const group = rnd() < 0.4 ? 2 + Math.floor(rnd() * 3) : 1;
    for (let g = 0; g < group && rocks.length < 80; g++) {
      const r = 0.5 + Math.pow(rnd(), 2.2) * (inside ? 0.8 : 2.2), h = r * (0.65 + rnd() * 0.5);
      const along = (g ? (rnd() - 0.5) * 7 : 0), lat = inside ? f.hw - 0.2 - rnd() * 0.9 : f.hw + 0.5 + rnd() * 5 + (g ? (rnd() - 0.5) * 3 : 0);
      const cs = s + along, cf = track.frameAt(((cs % track.length) + track.length) % track.length);
      const x = cf.x + cf.lx * sg * lat, z = cf.z + cf.lz * sg * lat;
      if (puddles.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 1.5) || rocks.some((q) => Math.hypot(q.x - x, q.z - z) < (q.r + r) * 0.9)) continue;
      rocks.push({ x, z, r, h });
    }
  }
  // (a driver heading for a jump looks only at the jump, so nothing in the road within 145 m before one or 40 m after it)
  const beforeJump = (u) => jumpS.some((j) => { let d = j - u; if (d < -track.length / 2) d += track.length; if (d > track.length / 2) d -= track.length; return d > -40 && d < 145; });
  // a few boulders right out in the road, to dodge (single or in pairs, never across the whole width, well spaced, never on a bend or near a jump)
  const inRoad = [];
  for (let guard = 0; guard < 6000 && inRoad.length < 15; guard++) {
    const s = rnd() * track.length;
    if (dist(s, 0) < 90 || beforeJump(s) || beforeJump(s + 12) || inRoad.some((m) => dist(s, m) < 55) || rough.some((p) => s > p.s - 15 && s < p.s + p.len + 15)) continue;
    if ([-14, 0, 14].some((o) => curvAt(s + o) > 0.0045)) continue;
    const f = track.frameAt(s), pair = rnd() < 0.3, lat = (rnd() * 2 - 1) * (f.hw - 3);
    for (let k = 0; k < (pair ? 2 : 1); k++) {
      const r = 0.7 + rnd() * 0.8, o = lat + (k ? (rnd() < 0.5 ? -1 : 1) * (2.2 + rnd()) : 0);
      if (Math.abs(o) > f.hw - 1.5) continue;
      rocks.push({ x: f.x + f.lx * o, z: f.z + f.lz * o, r, h: r * (0.85 + rnd() * 0.4) });
    }
    inRoad.push(s);
  }
  // boulders that wait on the bank and roll across the road when a car comes near (always at the same places, but when they go depends on you)
  const rollers = [], rolled = [];
  for (let guard = 0; guard < 20000 && rollers.length < 12; guard++) {
    const s = rnd() * track.length;
    if (dist(s, 0) < 100 || beforeJump(s) || beforeJump(s + 40) || rolled.some((m) => dist(s, m) < 85) || rough.some((p) => s > p.s - 15 && s < p.s + p.len + 15)) continue;
    if ([-14, 0, 14].some((o) => curvAt(s + o) > 0.0075)) continue;
    const f = track.frameAt(s), sg = rnd() < 0.5 ? 1 : -1, r = 1 + rnd() * 1.2;
    rollers.push({ x: f.x + f.lx * sg * (f.hw + 5.5), z: f.z + f.lz * sg * (f.hw + 5.5), r, dx: -sg * f.lx, dz: -sg * f.lz }); rolled.push(s);
  }
  return { bumps, puddles, rocks, rough, rollers };
}

/** The Twister: a corkscrew. A ground straight runs into a banked spiral that climbs two and a half turns round a tower (each turn passes over the one below), then
 *  comes off the top and runs back down a long descending straight and a U-turn to the start. (The road is a surface with a height, so there is no upside-down
 *  loop: the corkscrew is a rising spiral, as on a multi-storey car park ramp.) */
function twister() {
  const R = 70, cx = 220, rise = 13, turns = 2.5, g = 0.65, out = [];
  const rad = (d) => d * Math.PI / 180, top = g + rise * turns;
  for (let x = -120; x <= 190; x += 62) out.push({ x, y: g, z: -R });                          // ground straight, heading east, into the spiral
  const steps = turns * 12;
  for (let k = 0; k <= steps; k++) {                                                          // the spiral, counter-clockwise, from its south point up to its north point
    const a = rad(-90 + 30 * k);
    out.push({ x: cx + R * Math.cos(a), y: g + (top - g) * k / steps, z: R * Math.sin(a), open: k < steps });       // (open: no barriers on the spiral)
  }
  const run = 440 + Math.PI * R, desc = (d) => top - (top - g) * Math.min(1, d / run);       // the way down: 440 m straight west, then a half-circle U-turn
  for (let d = 85; d <= 440; d += 85) out.push({ x: cx - d, y: desc(d), z: R });
  for (let a = 120; a <= 270; a += 30) { const ar = rad(a); out.push({ x: cx - 440 + R * Math.cos(ar) + 0, y: desc(440 + R * (rad(a - 90))), z: R * Math.sin(ar) }); }
  return out;
}


/** Thin and Crispy: a narrow road high up in the air with no walls. Two jumps, banked bends, and one huge dip down to a flooded valley floor and back up. */
const TC_Y = [24, 28, 31, 30, 27, 21, 11, 1.4, 1.4, 11, 20, 27, 32, 31, 28, 25];       // road height at each of the 16 handles (the dip is handles 5 to 10)
function thinAndCrispy() {
  const n = TC_Y.length, out = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2, wob = 1 + 0.07 * Math.sin(3 * t + 0.5);
    const h = { x: 330 * wob * Math.cos(t), y: TC_Y[k], z: 170 * wob * Math.sin(t) };
    if (k === 2 || k === 12) Object.assign(h, { gap: 14, kick: 4, lip: 0.8 });
    out.push(h);
  }
  return out;
}
/** The pools on the valley floor of Thin and Crispy (overlapping, side by side, so the whole road is under water), and barrels along the high road. */
function thinScatter(def) {
  const track = new Track(def), rnd = mulberry(20261020), puddles = [], props = [];
  const lo = def.handles.map((h, i) => [h.y, i]).sort((a, b) => a[0] - b[0]).slice(0, 2).map((e) => e[1]);
  const a = track.handleS[Math.min(...lo)], b = track.handleS[Math.max(...lo)];
  for (let s = a - 14; s <= b + 14; s += 20) {                                  // a big pond lying across the whole dip: a chain of wide, overlapping pools, so it is easy to see from the high road
    const f = track.frameAt(s);
    puddles.push({ x: f.x, z: f.z, r: 22 });
  }
  const jumpS = track.handleS.filter((_, i) => def.handles[i].gap);
  const dist = (p, q) => { const d = Math.abs(p - q); return Math.min(d, track.length - d); };
  for (let guard = 0; guard < 600 && props.length < 14; guard++) {
    const s = rnd() * track.length;
    if (dist(s, 0) < 60 || jumpS.some((j) => dist(s, j) < 70) || s > a - 25 && s < b + 25) continue;
    const f = track.frameAt(s), off = (rnd() - 0.5) * (f.hw - 2.5);
    const p = placeProp(track, f.x + f.lx * off, f.z + f.lz * off);
    props.push({ type: 'barrel', x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, y: Math.round(p.y * 100) / 100 });
  }
  return { puddles: puddles.slice(0, 24), props };
}

/** Roll out the barrels: a flat stadium oval (long straights, round ends) with one massive jump in the middle of each straight. */
function barrelRunHandles() {
  const L = 270, Rr = 125, out = [], P = (x, z, y = 0.65, extra) => out.push({ x, y, z, ...(extra || {}) });
  const JUMP = { gap: 38, kick: 8, lip: 1.5 }, TOP = 20, SHOULDER = 14;                  // each jump is the crest of a long hill: 20 m up at the lip
  P(-L, -Rr); P(-L / 2, -Rr, SHOULDER); P(0, -Rr, TOP, JUMP); P(L / 2, -Rr, SHOULDER); P(L, -Rr);
  for (const a of [-45, 0, 45]) P(L + Math.cos(a * Math.PI / 180) * Rr, Math.sin(a * Math.PI / 180) * Rr);     // the round end
  P(L, Rr); P(L / 2, Rr, SHOULDER); P(0, Rr, TOP, JUMP); P(-L / 2, Rr, SHOULDER); P(-L, Rr);
  for (const a of [135, 180, 225]) P(-L + Math.cos(a * Math.PI / 180) * Rr, Math.sin(a * Math.PI / 180) * Rr);
  return out;
}
/** Red barrels strewn at random all the way round the lap (a different scatter each time), never on a ramp, a landing or the start line: swerve or smash. */
function barrelRunProps(def) {
  const track = new Track(def), rnd = mulberry((Math.random() * 1e9) | 0), props = [], jumps = track.handleS.filter((_, i) => def.handles[i].gap);
  const dist = (a, b) => { const d = Math.abs(a - b); return Math.min(d, track.length - d); };
  const spots = [], want = 110;
  for (let guard = 0; guard < 6000 && spots.length < want; guard++) {
    const s = rnd() * track.length;
    if (dist(s, 0) < 45 || jumps.some((j) => dist(s, j) < 48)) continue;
    const f = track.frameAt(s), o = (rnd() * 2 - 1) * (f.hw - 2.5);
    const x = f.x + f.lx * o, z = f.z + f.lz * o;
    if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 5.5)) continue;                 // not touching: there is always a way through
    spots.push({ x, z });
  }
  for (const sp of spots) { const p = placeProp(track, sp.x, sp.z); props.push({ type: 'barrel', x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, y: Math.round(p.y * 100) / 100 }); }
  return props;
}

const RAW = {
  speedway: {
    name: 'Speedway Gonzales', width: 26, defaultLaps: 3,
    handles: ellipse(300, 190, 14),
    autoBank: true,
  },
  oval: {
    name: 'Deep Pan Pizza', width: OVAL_FLOOR,
    handles: ellipse(OVAL_A, OVAL_B, 20),
    autoBank: false,
    arena: true,       // an open dirt bowl for a free-for-all banger derby: barrels everywhere, last one standing wins
  },
  technical: {
    name: 'Curly Wurly', width: 20,
    handles: [
      { x: 0, z: -200 }, { x: 170, z: -210 }, { x: 290, z: -120 }, { x: 250, z: 0 }, { x: 330, z: 130 },
      { x: 230, z: 240 }, { x: 70, z: 200 }, { x: -30, z: 90 }, { x: -150, z: 130 }, { x: -290, z: 60 },
      { x: -270, z: -70 }, { x: -150, z: -120 },
    ].map((p) => ({ ...p, y: 0.65 })),
    autoBank: true,
  },
  hills: {
    name: 'The hills have highs', width: 22,
    handles: [
      { x: 0, y: 0.65, z: -170 },
      { x: 150, y: 0.65, z: -190 },
      { x: 300, y: 5, z: -120 },
      { x: 330, y: 14, z: 20, gap: 13 },
      { x: 250, y: 6, z: 170 },
      { x: 90, y: 0.65, z: 230 },
      { x: -90, y: 0.65, z: 200 },
      { x: -260, y: 4, z: 120 },
      { x: -310, y: 9, z: -30 },
      { x: -220, y: 3, z: -150 },
    ],
    autoBank: true,
  },
  bluebell: {
    name: 'Bluebell Woods', width: 20,
    handles: bluebell(),
    autoBank: false,
    dirt: true, berm: true, walls: false,      // loose surface, dirt banks instead of barriers
    props: [],
  },
  twister: {
    name: 'The Twister', width: 22,
    handles: twister(),
    autoBank: true, bankMax: 16, lowCam: true,
  },
  thin: {
    name: 'Big Dipper', width: 12,
    handles: thinAndCrispy(),
    autoBank: true, bankMax: 14, lowCam: true, walls: false, sky: true,
  },
  barrels: {
    name: 'Roll out the barrels', width: 30, defaultLaps: 3,
    handles: barrelRunHandles(),
    autoBank: false, barrelRun: true,
  },
  overpass: {
    name: 'Croydon Overpass', width: 22,
    handles: figureEight(),
    autoBank: false,
  },
};

// ----- Apple Crumple: the solo obstacle course (rules and hazards in assault.js)
const CRUMPLE = { L: 230, R: 80, width: 18 };
function crumpleHandles() {
  const { L, R } = CRUMPLE, out = [], P = (x, z, y = 0.65, extra) => out.push({ x, y, z, ...(extra || {}) });
  const JUMP = { gap: 20, kick: 8, lip: 1.5 }, TOP = 9, SHOULDER = 5;                      // the jump is the crest of a hill
  P(0, -R); P(L / 2, -R); P(L, -R);
  for (const a of [-45, 0, 45]) P(L + Math.cos(a * Math.PI / 180) * R, Math.sin(a * Math.PI / 180) * R);
  P(L, R); P(L / 2, R, SHOULDER); P(0, R, TOP, JUMP); P(-L / 2, R, SHOULDER); P(-L, R);
  for (const a of [135, 180, 225]) P(-L + Math.cos(a * Math.PI / 180) * R, Math.sin(a * Math.PI / 180) * R);
  P(-L, -R); P(-L / 2, -R);
  return out;
}
/** The hazards, laid along the road by distance from the start line (the road is about 1.4 km). Easy first, a gauntlet last. */
function crumpleCourse(def) {
  const t = new Track(def), jumpS = t.handleS[def.handles.findIndex((h) => h.gap)], at = (s) => Math.min(s, t.length - 20);
  const assault = {
    limit: 160,
    checkpoints: [205, jumpS - 140, jumpS + 170, t.length - 232].map(Math.round),
    hammers: [{ s: 100, phase: 0, speed: 0.8 }, { s: t.length - 160, phase: 1.7, speed: 1.0 }],
    boulders: [{ s: 300, phase: 0, side: 1 }, { s: jumpS + 285, phase: 0, side: 1 }, { s: jumpS + 345, phase: 2.4, side: -1 }, { s: t.length - 70, phase: 1.1, side: -1 }],
    arms: [{ s: jumpS - 175, speed: 0.8, dir: 1 }, { s: t.length - 110, speed: 0.95, dir: -1 }],
    presses: [{ s: jumpS + 420, phase: 0 }, { s: t.length - 200, phase: 0.9 }],
    signs: [{ s: jumpS - 100, kind: 'jump' }, { s: jumpS + 60, kind: 'barrels' }, { s: t.length - 255, kind: 'gauntlet' }],
  };
  const r2 = (v) => Math.round(v * 100) / 100, props = [];
  const patch = (s0, n, gap) => {                              // a staggered field of barrels across the road, always with a way through
    const lanes = [-0.55, 0.1, 0.6, -0.15, 0.45, -0.6, 0.0, 0.55];
    for (let i = 0; i < n; i++) {
      const f = t.frameAt(at(s0 + i * gap)), off = lanes[i % lanes.length] * (f.hw - 3), p = placeProp(t, f.x + f.lx * off, f.z + f.lz * off);
      props.push({ type: 'barrel', x: r2(p.x), z: r2(p.z), y: r2(p.y) });
    }
  };
  patch(jumpS + 70, 8, 7); patch(t.length - 38, 4, 6);
  return { ...def, assault, props };
}

/** Templates as ready-to-use track definitions (banking applied). */
/** A different circuit every call: a wobbly loop with rolling hills, the odd big peak, one or two jumps, banked
 *  corners, and a scatter of barrels. Fully random by default; pass a seed to reproduce one. Retries
 *  with a new seed (rare, checked against thousands of samples) if a layout would come out too tight or a jump
 *  too rough to clear cleanly. */
export function makeRandomTrack(seed = (Math.random() * 1e9) | 0) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const def = buildRandomTrack(seed + attempt * 104729);
    const a = analyzeTrack(new Track(def));
    if (a.tight.length || a.crossings.length) continue;
    if (drivable(def)) return def;
  }
  return buildRandomTrack(1);   // practically unreachable, but never leave the player with a broken track
}

function buildRandomTrack(seed) {
  const rnd = mulberry(seed);
  const n = 14 + Math.floor(rnd() * 7);          // 14-20 handles - enough to keep the wobble smooth
  const baseR = 180 + rnd() * 140;               // 180-320 m base radius
  const lobes = 2 + Math.floor(rnd() * 2);       // 2-3 "bulges" around the loop
  const wobble = 0.1 + rnd() * 0.12;
  const width = Math.round(16 + rnd() * 10);     // 16-26 m wide

  // 0-2 jump gaps, never close together
  const gapCount = rnd() < 0.75 ? (rnd() < 0.35 ? 2 : 1) : 0;
  const gapAt = new Set();
  for (let guard = 0; gapAt.size < gapCount && guard < 50; guard++) {
    const idx = 1 + Math.floor(rnd() * (n - 2));                      // never right on the start/finish
    let ok = true;
    for (const g of gapAt) if (Math.min(Math.abs(g - idx), n - Math.abs(g - idx)) < 3) ok = false;
    if (ok) gapAt.add(idx);
  }

  const handles = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const r = baseR * (1 + Math.sin(t * lobes + rnd() * 2) * wobble);
    const bigHill = rnd() < 0.28;
    let y = k === 0 ? 0.65 : Math.round((bigHill ? 8 + rnd() * 28 : rnd() * 5) * 10) / 10;
    const h = { x: Math.round(Math.cos(t) * r), y, z: Math.round(Math.sin(t) * r) };
    if (gapAt.has(k)) {
      h.y = Math.max(h.y, 4);          // a jump wants a bit of air under it
      h.gap = 8 + Math.round(rnd() * 10);
      h.kick = Math.round(rnd() * 22);
      h.lip = Math.round((0.6 + rnd() * 1.6) * 10) / 10;
    }
    handles.push(h);
  }

  let def = normalizeTrack({ name: 'Got the hump', width, walls: true, handles, props: [] });
  const banks = suggestBanks(new Track(def), 8 + Math.floor(rnd() * 3));
  def = { ...def, handles: def.handles.map((h, i) => ({ ...h, bank: banks[i] })) };

  const track = new Track(def);
  const props = [];
  const scatter = (type, count) => {
    for (let i = 0; i < count; i++) {
      const f = track.frameAt(rnd() * track.length);
      const off = (rnd() - 0.5) * Math.max(2, f.hw - 3);
      const p = placeProp(track, f.x + f.lx * off, f.z + f.lz * off);
      props.push({ type, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, y: Math.round(p.y * 100) / 100 });
    }
  };
  scatter('barrel', 6 + Math.floor(rnd() * 7));   // 6-12 drums: enough to make random races lively

  return normalizeTrack({ ...def, props });
}

export function makeTemplate(key) {
  if (key === 'apple') {                                   // Apple Crumple: its own course, not one of the race tracks (so it is left out of TEMPLATE_KEYS)
    const base = normalizeTrack({ name: 'Apple Crumple', width: CRUMPLE.width, defaultLaps: 1, handles: crumpleHandles(), walls: true });
    return normalizeTrack(crumpleCourse(base));
  }
  if (key === 'random') return makeRandomTrack(RANDOM_TEMPLATE_SEED);   // fixed seed: reproducible for tests/previews
  const raw = RAW[key];
  if (!raw) throw new Error('Unknown template ' + key);
  let def = normalizeTrack({ ...raw, mode: raw.arena ? 'lastStanding' : undefined, handles: raw.handles.map((h) => ({ ...h })) });
  if (raw.autoBank) {
    const banks = suggestBanks(new Track(def), raw.bankMax || 9);
    def = { ...def, handles: def.handles.map((h, i) => ({ ...h, bank: banks[i] })) };
  }
  if (raw.sky) { def = normalizeTrack({ ...def, ...thinScatter(def) }); }
  if (raw.dirt) { def = normalizeTrack(steepBanks(def)); const sc = rallyScatter(def); def = normalizeTrack({ ...def, ...sc }); }
  if (raw.barrelRun) def = normalizeTrack({ ...def, props: barrelRunProps(def) });
  if (raw.arena) { def = normalizeTrack({ ...def, mode: 'lastStanding', ...ovalLumps(def) }); def = normalizeTrack({ ...def, props: arenaProps(def) }); }
  return def;
}

export const TEMPLATE_KEYS = [...Object.keys(RAW), 'random'];
export const TEMPLATE_INFO = {
  apple: 'A timed obstacle course: hammers, boulders, spinning arms, crushing presses, a jump and a final gauntlet. Beat the clock!',
  speedway: 'A fast 1.6 km banked Nascar-style paint-scraping, head rush',
  oval: 'A cheesy pizza-shaped pile up of olives and exploding peppers!',
  technical: 'Tight and twisty, lots of braking',
  hills: 'Big elevation changes and a jump gap',
  overpass: 'Figure of eight with a bridge',
  barrels: "We'll have a barrel of fun... or not. An exploding minefield of a ride.",
  twister: 'A corkscrew: a banked spiral that climbs round a tower, with a long run back down',
  thin: 'A thin road high in the sky: no walls, banks, jumps and barrels, then a huge dip down into the water and back up',
  bluebell: 'A windy dirt rally stage through the woods: loose surface, narrow and twisty',
  random: 'A different circuit every time - hills, jumps, banks and barrels',
};
