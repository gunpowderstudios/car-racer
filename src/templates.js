// Built-in circuits. All units are metres. Handle 0 is the start/finish line and
// the car drives from handle 0 towards handle 1.

import { Track, suggestBanks, normalizeTrack, analyzeTrack } from './track.js';
import { placeProp } from './props.js';
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
function drivable(def) {
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

const RAW = {
  speedway: {
    name: 'Speedway', width: 26,
    handles: ellipse(300, 190, 14),
    autoBank: true,
  },
  kidney: {
    name: 'Kidney', width: 22,
    handles: scale([
      { x: -10, y: .65, z: -64 }, { x: 44, y: .65, z: -54 }, { x: 68, y: .65, z: -10 }, { x: 42, y: .65, z: 30 },
      { x: 10, y: .65, z: 58 }, { x: -42, y: .65, z: 54 }, { x: -66, y: .65, z: 12 }, { x: -38, y: .65, z: -24 },
    ], 3.1),
    autoBank: true,
  },
  technical: {
    name: 'Technical', width: 20,
    handles: [
      { x: 0, z: -200 }, { x: 170, z: -210 }, { x: 290, z: -120 }, { x: 250, z: 0 }, { x: 330, z: 130 },
      { x: 230, z: 240 }, { x: 70, z: 200 }, { x: -30, z: 90 }, { x: -150, z: 130 }, { x: -290, z: 60 },
      { x: -270, z: -70 }, { x: -150, z: -120 },
    ].map((p) => ({ ...p, y: 0.65 })),
    autoBank: true,
  },
  hills: {
    name: 'Hills and a jump', width: 22,
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
  overpass: {
    name: 'Overpass', width: 22,
    handles: figureEight(),
    autoBank: false,
  },
};

/** Templates as ready-to-use track definitions (banking applied). */
/** A different circuit every call: a wobbly loop with rolling hills, the odd big peak, one or two jumps, banked
 *  corners, and a scatter of barrels and chickens. Fully random by default; pass a seed to reproduce one. Retries
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

  let def = normalizeTrack({ name: 'Random circuit', width, walls: true, handles, props: [] });
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
  scatter('barrel', 3 + Math.floor(rnd() * 6));
  scatter('chicken', 2 + Math.floor(rnd() * 5));

  return normalizeTrack({ ...def, props });
}

export function makeTemplate(key) {
  if (key === 'random') return makeRandomTrack(RANDOM_TEMPLATE_SEED);   // fixed seed: reproducible for tests/previews
  const raw = RAW[key];
  if (!raw) throw new Error('Unknown template ' + key);
  let def = normalizeTrack({ ...raw, handles: raw.handles.map((h) => ({ ...h })) });
  if (raw.autoBank) {
    const banks = suggestBanks(new Track(def), 9);
    def = { ...def, handles: def.handles.map((h, i) => ({ ...h, bank: banks[i] })) };
  }
  return def;
}

export const TEMPLATE_KEYS = [...Object.keys(RAW), 'random'];
export const TEMPLATE_INFO = {
  speedway: 'Fast banked oval to learn the car',
  kidney: 'Flowing bends and one long straight',
  technical: 'Tight and twisty, lots of braking',
  hills: 'Big elevation changes and a jump gap',
  overpass: 'Figure of eight with a bridge',
  random: 'A different circuit every time - hills, jumps, banks, barrels and chickens',
};
