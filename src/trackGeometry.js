// Turns a Track into plain typed arrays (no three.js needed, so it can be tested in Node).
// Everything here follows the exact same surface the physics uses: a flat banked road
// plane, a verge that falls away at EMBANKMENT m/m, and walls with their face WALL_GAP
// outside the road edge.

import { SURF, WALL_GAP, WALL_HEIGHT, WALL_T, EMBANKMENT, Track, takeoffRamp } from './track.js';

const KERB_W = 0.6;
const SLAB = 0.7;                 // visible thickness of the road slab (matters on bridges)
const C_ROAD_SIDE = [0.42, 0.41, 0.4];
const C_KERB_A = [0.86, 0.2, 0.16], C_KERB_B = [0.93, 0.9, 0.84];
const C_WALL_A = [0.9, 0.88, 0.82], C_WALL_B = [0.8, 0.22, 0.18];
const C_GRASS = [0.28, 0.33, 0.2];

class Buf {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.uv = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  vert(x, y, z, nx, ny, nz, c = [1, 1, 1], u = 0, v = 0) {
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.col.push(c[0], c[1], c[2]); this.uv.push(u, v);
    return this.count - 1;
  }
  arrays() {
    return {
      position: new Float32Array(this.pos), normal: new Float32Array(this.nrm), color: new Float32Array(this.col),
      uv: new Float32Array(this.uv), index: new Uint32Array(this.idx),
    };
  }
}

export function buildTrackGeometry(track) {
  const n = track.n, L = track.length, hwAt = (i) => track.hw[i];
  const walls = track.def.walls;
  const apron = track.apron;                                // flat kerb width before the verge falls away
  const road = new Buf(), kerb = new Buf(), bank = new Buf(), slab = new Buf(), wall = new Buf();

  // Surface point on the road plane at the edge (sg = +1 left, -1 right)
  const edge = (i, sg) => {
    const hw = hwAt(i);
    const x = track.px[i] + track.lx[i] * hw * sg, z = track.pz[i] + track.lz[i] * hw * sg;
    const y = track.py[i] - (track.nx[i] * track.lx[i] * hw * sg + track.nz[i] * track.lz[i] * hw * sg) / track.ny[i];
    return [x, y, z];
  };
  // A point k metres outside the edge on the verge (flat for `apron` m, then falls away at EMBANKMENT)
  const out = (i, sg, k) => {
    const e = edge(i, sg);
    return [e[0] + track.lx[i] * sg * k, Math.max(0, e[1] - EMBANKMENT * Math.max(0, k - apron)), e[2] + track.lz[i] * sg * k];
  };
  const vgrid = L / Math.max(1, Math.round(L / 20));       // texture repeat length that divides the loop exactly

  // generic quad-strip builder: cols(i) -> array of {p:[x,y,z], n:[..], c:[..], u}
  const strip = (buf, cols, C, vOf, skip) => {
    const base = buf.count;
    for (let i = 0; i <= n; i++) {
      const k = i % n, cs = cols(k), v = vOf(i);
      for (const c of cs) buf.vert(c.p[0], c.p[1], c.p[2], c.n[0], c.n[1], c.n[2], c.c || [1, 1, 1], c.u || 0, v);
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (track.gap[i] || track.gap[j]) continue;
      if (skip && (skip(i) || skip(j))) continue;
      for (let c = 0; c < C - 1; c++) {
        const a = base + i * C + c, b = a + 1, d = base + (i + 1) * C + c, e = d + 1;
        buf.idx.push(a, b, d, b, e, d);
      }
    }
  };
  const sv = (i) => (i === n ? L : track.s[i]) / vgrid;

  // ---- road surface (u across, v along)
  strip(road, (i) => {
    const l = edge(i, 1), r = edge(i, -1), nn = [track.nx[i], track.ny[i], track.nz[i]];
    return [{ p: l, n: nn, u: 0 }, { p: r, n: nn, u: 1 }];
  }, 2, sv);

  // Ramps and landings beside a jump are built as solid earthworks: their sides drop to the ground.
  const solid = new Uint8Array(n), LANDING_SPAN = 10;
  track.def.handles.forEach((h, hi) => {
    if (!h.gap) return;
    const c = track.handleS[hi], half = h.gap / 2, ramp = takeoffRamp(h);
    for (let i = 0; i < n; i++) {
      let d = track.s[i] - c; if (d > L / 2) d -= L; if (d < -L / 2) d += L;
      if ((d < -half && d > -half - ramp.len - 1) || (d > half && d < half + LANDING_SPAN + 1)) solid[i] = 1;
    }
  });
  const depth = (i, e) => (solid[i] ? Math.max(SLAB, e[1]) : SLAB);

  // ---- slab sides + underside (dark concrete) so raised road has thickness
  for (const sg of [1, -1]) {
    strip(slab, (i) => {
      const e = edge(i, sg), nl = [track.lx[i] * sg, 0, track.lz[i] * sg];
      return [{ p: e, n: nl, c: C_ROAD_SIDE }, { p: [e[0], e[1] - depth(i, e), e[2]], n: nl, c: C_ROAD_SIDE }];
    }, 2, sv);
  }
  strip(slab, (i) => {
    const l = edge(i, 1), r = edge(i, -1), dn = [0, -1, 0];
    return [{ p: [l[0], l[1] - SLAB, l[2]], n: dn, c: C_ROAD_SIDE }, { p: [r[0], r[1] - SLAB, r[2]], n: dn, c: C_ROAD_SIDE }];
  }, 2, sv);

  // Where a raised road (bridge) passes over another part of the track, its grass embankment would
  // form a hill blocking the road underneath. Leave the embankment out there so the bridge stands
  // on its slab and pillars and the lower road runs clear beneath it.
  const noBank = { 1: new Uint8Array(n), '-1': new Uint8Array(n) };
  {
    const q = Track.newQuery(), k0 = Math.max(KERB_W, apron);
    for (const sg of [1, -1]) {
      for (let i = 0; i < n; i++) {
        if (track.gap[i] || track.py[i] < 1.5) continue;
        const reach = Math.max(2, track.py[i] / EMBANKMENT);
        for (let k = 0; k <= reach + 6; k += 1.5) {
          const o = out(i, sg, k0 + k);
          track.query(o[0], 1.0, o[2], q, 0.6);
          if (q.surface === SURF.ROAD && q.idx >= 0) {
            const ds = Math.abs(track.s[i] - q.s);
            if (ds > 40 && ds < L - 40) { noBank[sg][i] = 1; break; }
          }
        }
      }
      const src = noBank[sg].slice();                       // widen the opening a little either side
      for (let i = 0; i < n; i++) if (src[i]) for (let d = -14; d <= 14; d++) noBank[sg][(i + d + n) % n] = 1;
    }
  }

  // ---- kerbs and embankments (both sides), painted in alternating blocks
  for (const sg of [1, -1]) {
    const blockCol = (i, a, b) => (Math.floor(i / 5) % 2 ? a : b);
    strip(kerb, (i) => {
      const p0 = out(i, sg, 0), p1 = out(i, sg, KERB_W);
      const nn = walls ? [0, 1, 0] : [track.lx[i] * sg * EMBANKMENT * 0.5, 1, track.lz[i] * sg * EMBANKMENT * 0.5];
      const c = blockCol(i, C_KERB_A, C_KERB_B);
      return [{ p: p0, n: nn, c }, { p: p1, n: nn, c }];
    }, 2, sv);
    strip(bank, (i) => {
      const k0 = Math.max(KERB_W, apron);                   // with walls the bank starts behind them
      const e = out(i, sg, k0);
      const yEnd = e[1];
      const kEnd = solid[i] ? 0 : (yEnd > 0.02 ? yEnd / EMBANKMENT : 0.05);   // beside a jump: drop straight to the ground
      const q = out(i, sg, k0 + kEnd);
      const nn = [track.lx[i] * sg * EMBANKMENT, 1, track.lz[i] * sg * EMBANKMENT];
      const shade = 0.85 + 0.15 * Math.sin(i * 0.37);
      const c = [C_GRASS[0] * shade, C_GRASS[1] * shade, C_GRASS[2] * shade];
      return [{ p: e, n: nn, c }, { p: [q[0], 0, q[2]], n: nn, c }];
    }, 2, sv, (i) => noBank[sg][i]);
  }

  // ---- walls (barrier blocks, red and white)
  if (walls) {
    for (const sg of [1, -1]) {
      strip(wall, (i) => {
        const top = Math.min(WALL_HEIGHT - 0.2, 1.05);
        const e = edge(i, sg);
        const ib = out(i, sg, WALL_GAP), ob = out(i, sg, WALL_GAP + WALL_T);
        const yt = e[1] + top;
        const inward = [-track.lx[i] * sg, 0, -track.lz[i] * sg], outward = [track.lx[i] * sg, 0, track.lz[i] * sg];
        const c = Math.floor(i / 7) % 2 ? C_WALL_A : C_WALL_B;
        return [
          { p: [ib[0], ib[1] - 0.1, ib[2]], n: inward, c }, { p: [ib[0], yt, ib[2]], n: inward, c },
          { p: [ib[0], yt, ib[2]], n: [0, 1, 0], c }, { p: [ob[0], yt, ob[2]], n: [0, 1, 0], c },
          { p: [ob[0], yt, ob[2]], n: outward, c }, { p: [ob[0], ob[1] - 0.1, ob[2]], n: outward, c },
        ];
      }, 6, sv);
      // Columns 1->2 and 3->4 join faces at identical points, so those quads are zero-area.
    }
  }

  // ---- end caps: where the road stops at a jump, close the open ends so the slab, barriers and
  // embankment look as solid as the sides of the road (otherwise you see straight into a hollow shell).
  const quad = (buf, a, b, c, d, nn, col) => {
    const i0 = buf.vert(a[0], a[1], a[2], nn[0], nn[1], nn[2], col);
    const i1 = buf.vert(b[0], b[1], b[2], nn[0], nn[1], nn[2], col);
    const i2 = buf.vert(c[0], c[1], c[2], nn[0], nn[1], nn[2], col);
    const i3 = buf.vert(d[0], d[1], d[2], nn[0], nn[1], nn[2], col);
    buf.idx.push(i0, i1, i2, i0, i2, i3);
  };
  for (let i = 0; i < n; i++) {
    if (track.gap[i]) continue;
    const fwd = track.gap[(i + 1) % n], back = track.gap[(i - 1 + n) % n];
    if (!fwd && !back) continue;
    const tl = Math.hypot(track.tx[i], track.tz[i]) || 1;
    const dirs = [];
    if (fwd) dirs.push(1);
    if (back) dirs.push(-1);
    for (const d of dirs) {
      const nn = [track.tx[i] / tl * d, 0, track.tz[i] / tl * d];
      // slab end face
      const l = edge(i, 1), r = edge(i, -1);
      quad(slab, l, r, [r[0], r[1] - depth(i, r), r[2]], [l[0], l[1] - depth(i, l), l[2]], nn, C_ROAD_SIDE);   // solid down to the ground
      for (const sg of [1, -1]) {
        // embankment: fill the wedge between the verge slope and the ground
        const k0 = Math.max(KERB_W, apron), e = out(i, sg, k0);
        const kEnd = solid[i] ? 0 : (e[1] > 0.02 ? e[1] / EMBANKMENT : 0.05), q = out(i, sg, k0 + kEnd);
        const shade = 0.85 + 0.15 * Math.sin(i * 0.37);
        const gc = [C_GRASS[0] * shade * 0.8, C_GRASS[1] * shade * 0.8, C_GRASS[2] * shade * 0.8];
        if (e[1] > 0.02) { const i0 = bank.vert(e[0], e[1], e[2], nn[0], nn[1], nn[2], gc), i1 = bank.vert(q[0], 0, q[2], nn[0], nn[1], nn[2], gc), i2 = bank.vert(e[0], 0, e[2], nn[0], nn[1], nn[2], gc); bank.idx.push(i0, i1, i2); }
        // barrier end
        if (walls) {
          const top = Math.min(WALL_HEIGHT - 0.2, 1.05), ee = edge(i, sg);
          const ib = out(i, sg, WALL_GAP), ob = out(i, sg, WALL_GAP + WALL_T), yt = ee[1] + top;
          const c = Math.floor(i / 7) % 2 ? C_WALL_A : C_WALL_B;
          quad(wall, [ib[0], ib[1] - 0.1, ib[2]], [ib[0], yt, ib[2]], [ob[0], yt, ob[2]], [ob[0], ob[1] - 0.1, ob[2]], nn, c);
        }
      }
    }
  }

  // ---- pillars under raised road, lamp posts, start gantry data
  const pillars = [], lamps = [];
  for (let i = 0; i < n; i += 24) {
    if (track.gap[i] || track.py[i] < 3.2) continue;
    let clear = true;
    const q = Track.newQuery();
    track.query(track.px[i], track.py[i] - 1.5, track.pz[i], q, 0.5);
    if (q.surface === SURF.ROAD && q.idx >= 0 && Math.abs(track.s[i] - q.s) > 40 && Math.abs(track.s[i] - q.s) < L - 40) clear = false;
    if (!clear) continue;
    pillars.push({ x: track.px[i], z: track.pz[i], h: track.py[i] - SLAB, w: Math.min(track.hw[i] * 2 - 4, 8), yaw: Math.atan2(track.tx[i], track.tz[i]) });
  }
  for (let i = 12, k = 0; i < n; i += 52, k++) {
    if (track.gap[i]) continue;
    const sg = k % 2 ? 1 : -1;
    const o = out(i, sg, WALL_GAP + WALL_T + 0.9);
    if (o[1] > track.py[i] + 3 || o[1] < 0.05) { /* fine either way */ }
    lamps.push({ x: o[0], y: Math.max(o[1], 0), z: o[2], dx: -track.lx[i] * sg, dz: -track.lz[i] * sg });
  }

  const f0 = track.frameAt(0);
  const start = {
    x: f0.x, y: f0.y, z: f0.z, fx: f0.fx, fy: f0.fy, fz: f0.fz,        // tangent
    nx: f0.nx, ny: f0.ny, nz: f0.nz,                                  // surface normal
    bx: f0.lx, by: f0.ly, bz: f0.lz,                                  // banked left
    lx: track.lx[0], lz: track.lz[0], hw: track.hw[0],                // horizontal left, half width
  };

  // bounds for scenery
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]);
    minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]);
  }

  return {
    road: road.arrays(), kerb: kerb.arrays(), bank: bank.arrays(), slab: slab.arrays(), wall: wall.arrays(),
    pillars, lamps, start, bounds: { minX, maxX, minZ, maxZ },
  };
}
