// Built-in circuits. All units are metres. Handle 0 is the start/finish line and
// the car drives from handle 0 towards handle 1.

import { Track, suggestBanks, normalizeTrack } from './track.js';

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
export function makeTemplate(key) {
  const raw = RAW[key];
  if (!raw) throw new Error('Unknown template ' + key);
  let def = normalizeTrack({ ...raw, handles: raw.handles.map((h) => ({ ...h })) });
  if (raw.autoBank) {
    const banks = suggestBanks(new Track(def), 9);
    def = { ...def, handles: def.handles.map((h, i) => ({ ...h, bank: banks[i] })) };
  }
  return def;
}

export const TEMPLATE_KEYS = Object.keys(RAW);
export const TEMPLATE_INFO = {
  speedway: 'Fast banked oval to learn the car',
  kidney: 'Flowing bends and one long straight',
  technical: 'Tight and twisty, lots of braking',
  hills: 'Big elevation changes and a jump gap',
  overpass: 'Figure of eight with a bridge',
};
