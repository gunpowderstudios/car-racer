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

export const TRACK_VERSION = 5;
export const SURF = { ROAD: 0, VERGE: 1, BASE: 2 };
export const GROUND_Y = 0;          // flat terrain height far from the road
export const WALL_GAP = 0.6;        // wall face sits this far outside the road edge
export const WALL_HEIGHT = 1.25;
export const WALL_T = 0.5;          // wall thickness
// With walls, the strip between the road edge and the back of the wall is a flat kerb at
// road height; the embankment only starts falling away behind the wall. (If the ground
// sloped down into the wall face, cars dropped into a gutter and leaned on the wall.)
export const APRON = WALL_GAP + WALL_T;
export const SAMPLE_SPACING = 1.0;  // metres between road samples
export const EMBANKMENT = 0.8;             // verge falls away this many metres per metre
const CELL = 8;
const MAX_OVERSHOOT = 1.0;          // metres a segment may claim beyond its ends
const QUERY_MARGIN = 4.5;
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

// ---------------------------------------------------------------- definition

/** Fill defaults, migrate legacy (v4) editor data, and clamp values. */
export function normalizeTrack(input) {
  const src = input || {};
  const width = clamp(Number(src.width) || 22, 12, 40);
  const handles = (Array.isArray(src.handles) ? src.handles : []).map((h) => ({
    x: Number(h.x) || 0,
    y: Math.max(0, Number.isFinite(+h.y) ? +h.y : 0.65),
    z: Number(h.z) || 0,
    w: h.w ? clamp(Number(h.w), 12, 40) : 0,           // 0 = use track default
    bank: clamp(Number(h.bank) || 0, -20, 20),          // degrees
    gap: h.gap ? clamp(Number(h.gap), 6, 40) : (h.gapAfter ? 14 : 0), // metres of missing road
    lip: clamp(Number.isFinite(+h.lip) && h.lip !== null && h.lip !== '' ? +h.lip : TAKEOFF_RISE, LIP.minH, LIP.maxH),   // takeoff ramp height (m)
    kick: clamp(Number(h.kick) || 0, 0, LIP.maxDeg),    // launch angle at the lip (degrees); 0 = ramp flattens out
  }));
  return {
    version: TRACK_VERSION,
    name: String(src.name || 'Untitled circuit').slice(0, 40),
    closed: true,
    width,
    walls: src.walls !== false,
    handles,
  };
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
    if (this.def.handles.length < 4) throw new Error('A track needs at least 4 handles');
    this._build();
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
    const n = Math.max(16, Math.round(total / SAMPLE_SPACING));
    const ds = total / n;
    this.n = n; this.ds = ds; this.length = total;
    this.handleS = handleDense.map((k) => cum[k]);

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
      const R = this.hw[i] + QUERY_MARGIN + 1.5;
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
      if (over > 0 && over * len2 > MAX_OVERSHOOT * Math.sqrt(len2)) continue;
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
    if (ad > hw + QUERY_MARGIN) return null;
    const Cy = py[i] + (py[j] - py[i]) * t;
    let Nx = nx[i] + (nx[j] - nx[i]) * t, Ny = ny[i] + (ny[j] - ny[i]) * t, Nz = nz[i] + (nz[j] - nz[i]) * t;
    let yc, yEdge;
    if (ad <= hw) {
      yc = Cy - (Nx * (x - cx) + Nz * (z - cz)) / Ny; yEdge = yc;
    } else {
      const sg = d < 0 ? -1 : 1;
      yEdge = Cy - (Nx * Lx * hw * sg + Nz * Lz * hw * sg) / Ny;
      yc = Math.max(GROUND_Y, yEdge - Math.max(0, ad - hw - this.apron) * EMBANKMENT);
    }
    if (out) {
      out.d = d; out.hw = hw; out.lx = Lx; out.lz = Lz; out.edgeY = yEdge; out.y = yc;
      if (ad <= hw) {
        out.surface = SURF.ROAD;
      } else {
        out.surface = SURF.VERGE;
        if (ad - hw <= this.apron) {          // flat kerb in front of / under the wall
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

  /** Penetration (m) into the wall at a query result for a point at height y; 0 if none. */
  wallPenetration(q, y) {
    if (!this.def.walls || q.idx < 0) return 0;
    const ad = Math.abs(q.d), face = q.hw + WALL_GAP;
    if (ad <= face || ad > face + 2.4) return 0;
    if (y > q.edgeY + WALL_HEIGHT) return 0;
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
export function suggestBanks(track, maxDeg = 12) {
  return track.def.handles.map((_, hi) => {
    const i = Math.round(track.handleS[hi] / track.ds) % track.n;
    let k = 0;
    for (let o = -6; o <= 6; o++) k += track.curv[(i + o + track.n) % track.n];
    k /= 13;
    return Math.round(clamp(-k * 700, -maxDeg, maxDeg) * 2) / 2;
  });
}
