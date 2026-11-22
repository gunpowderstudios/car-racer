// Turns a Track into plain typed arrays (no three.js needed, so it can be tested in Node).
// Everything here follows the exact same surface the physics uses: a flat banked road
// plane, a verge that falls away at EMBANKMENT m/m, and walls with their face WALL_GAP
// outside the road edge.

import { SURF, WALL_GAP, WALL_HEIGHT, WALL_T, EMBANKMENT, Track, takeoffRamp, bumpAt, bermProfile, GROUND_Y } from './track.js';

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
  const strip = (buf, cols, C, vOf, skip, flip) => {
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
        if (flip) buf.idx.push(a, d, b, b, d, e); else buf.idx.push(a, b, d, b, e, d);
      }
    }
  };
  const sv = (i) => (i === n ? L : track.s[i]) / vgrid;

  // ---- road surface (u across, v along). A road with humps in it gets several columns across, so the humps can be seen.
  if (track.bumps) {
    const COLS = 9, tmp = { h: 0, gx: 0, gz: 0 };
    strip(road, (i) => {
      const l = edge(i, 1), r = edge(i, -1), nn = [track.nx[i], track.ny[i], track.nz[i]], cols = [];
      for (let c = 0; c < COLS; c++) {
        const t = c / (COLS - 1), x = l[0] + (r[0] - l[0]) * t, y = l[1] + (r[1] - l[1]) * t, z = l[2] + (r[2] - l[2]) * t;
        bumpAt(track.bumps, x, z, tmp);
        const nx = nn[0] - tmp.gx * nn[1], nz = nn[2] - tmp.gz * nn[1], m = Math.hypot(nx, nn[1], nz) || 1;
        cols.push({ p: [x, y + tmp.h, z], n: [nx / m, nn[1] / m, nz / m], u: t });
      }
      return cols;
    }, COLS, sv);
  } else {
    strip(road, (i) => {
      const l = edge(i, 1), r = edge(i, -1), nn = [track.nx[i], track.ny[i], track.nz[i]];
      return [{ p: l, n: nn, u: 0 }, { p: r, n: nn, u: 1 }];
    }, 2, sv);
  }

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
  // A raised road stands on a solid wall the full width of the road, all the way down to the ground (no pillars to poke through the surface). Not where it crosses over
  // another road, or by a flyover or tunnel (they have their own supports and the lower road must run clear beneath).
  {
    const blocked = new Uint8Array(n), cut = Math.max(2, Math.round(30 / track.ds));
    for (let i = 0; i < n; i++) {
      if (track.gap[i] || track.py[i] < 3.2) continue;
      if ((track.structures || []).some((st) => Math.hypot(track.px[i] - st.x, track.pz[i] - st.z) < 24)) { blocked[i] = 1; continue; }
      for (let k = 0; k < n; k += 2) {
        let d = Math.abs(i - k); d = Math.min(d, n - d); if (d < cut || track.py[k] + 0.5 >= track.py[i] - SLAB) continue;
        if (Math.hypot(track.px[k] - track.px[i], track.pz[k] - track.pz[i]) < track.hw[i] + track.hw[k] - 1) { blocked[i] = 1; break; }
      }
    }
    const wide = Math.max(1, Math.round(4 / track.ds));
    for (let i = 0; i < n; i++) {
      if (track.gap[i] || track.py[i] < 3.2) continue;
      let ok = true; for (let d = -wide; d <= wide && ok; d++) if (blocked[(i + d + n) % n]) ok = false;
      if (ok) solid[i] = 1;
    }
  }
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
      for (let i = 0; i < n; i++) if (track.py[i] > 3.5) noBank[sg][i] = 1;       // a high road (a spiral ramp) stands on pillars: no grass hill under it
      const src = noBank[sg].slice();                       // widen the opening a little either side
      for (let i = 0; i < n; i++) if (src[i]) for (let d = -14; d <= 14; d++) noBank[sg][(i + d + n) % n] = 1;
    }
  }

  // ---- dirt banks (rally stages): a smooth rise from the road edge, a crest, then down to the ground
  if (track.berm) {
    const OFFS = [0, 0.5, 1.2, 2.0, 2.7, 3.2, 4.4], tb = { h: 0, g: 0 };
    for (const sg of [1, -1]) {
      strip(bank, (i) => {
        const e = edge(i, sg), cols = [], shade = 0.9 + 0.1 * Math.sin(i * 0.41 + sg);
        const col = (k) => { const f = k < 0.5 ? 0 : Math.min(1, (k - 0.5) / 4); return [(0.2 - 0.1 * f) * shade, (0.115 - 0.02 * f) * shade, (0.06 - 0.02 * f) * shade]; };
        for (const k of OFFS) {
          bermProfile(k, tb);
          const nrm = [-track.lx[i] * sg * tb.g, 1, -track.lz[i] * sg * tb.g];
          cols.push({ p: [e[0] + track.lx[i] * sg * k, Math.max(GROUND_Y, e[1] + tb.h), e[2] + track.lz[i] * sg * k], n: nrm, c: col(k) });
        }
        const kEnd = 4.4 + Math.max(0, (e[1] + 1.5 - GROUND_Y)) / 1.0 + 0.2;       // the far foot: where the falling bank meets the ground
        cols.push({ p: [e[0] + track.lx[i] * sg * kEnd, GROUND_Y, e[2] + track.lz[i] * sg * kEnd], n: [track.lx[i] * sg, 1, track.lz[i] * sg], c: col(5) });
        return cols;
      }, OFFS.length + 1, sv, undefined, sg === 1);      // (the left bank is built running the other way from the road, so its triangles are turned over to face up - otherwise it is lit from underneath and looks dark)
    }
  }

  // ---- kerbs and embankments (both sides), painted in alternating blocks
  for (const sg of (track.berm ? [] : [1, -1])) {
    const blockCol = (i, a, b) => (Math.floor(i / 5) % 2 ? a : b);
    strip(kerb, (i) => {
      const p0 = out(i, sg, 0), p1 = out(i, sg, KERB_W);
      const nn = walls ? [0, 1, 0] : [track.lx[i] * sg * EMBANKMENT * 0.5, 1, track.lz[i] * sg * EMBANKMENT * 0.5];
      const c = blockCol(i, C_KERB_A, C_KERB_B);
      return [{ p: p0, n: nn, c }, { p: p1, n: nn, c }];
    }, 2, sv, (i) => track.junc[i] & (sg > 0 ? 1 : 2));                 // (no kerb across a crossroad: it is open, like a real junction)
    strip(bank, (i) => {
      const k0 = Math.max(KERB_W, apron);                   // with walls the bank starts behind them
      const e = out(i, sg, k0);
      const yEnd = e[1];
      const kEnd = yEnd > 0.02 ? 0 : 0.05;                   // solid straight down to the ground, not a sloped hillside
      const q = out(i, sg, k0 + kEnd);
      const nn = [track.lx[i] * sg, 0, track.lz[i] * sg];
      const shade = 0.85 + 0.15 * Math.sin(i * 0.37);
      const c = [C_GRASS[0] * shade, C_GRASS[1] * shade, C_GRASS[2] * shade];
      return [{ p: e, n: nn, c }, { p: [q[0], 0, q[2]], n: nn, c }];
    }, 2, sv, (i) => noBank[sg][i] || (track.junc[i] & (sg > 0 ? 1 : 2)));
  }

  // ---- walls (barrier blocks, red and white)
  if (walls) {
    for (const sg of [1, -1]) {
      strip(wall, (i) => {
        const top = WALL_HEIGHT;
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
      }, 6, sv, (i) => track.wallOff[i] || (track.junc[i] & (sg > 0 ? 1 : 2)));
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
        const kEnd = e[1] > 0.02 ? 0 : 0.05, q = out(i, sg, k0 + kEnd);
        const shade = 0.85 + 0.15 * Math.sin(i * 0.37);
        const gc = [C_GRASS[0] * shade * 0.8, C_GRASS[1] * shade * 0.8, C_GRASS[2] * shade * 0.8];
        if (e[1] > 0.02) { const i0 = bank.vert(e[0], e[1], e[2], nn[0], nn[1], nn[2], gc), i1 = bank.vert(q[0], 0, q[2], nn[0], nn[1], nn[2], gc), i2 = bank.vert(e[0], 0, e[2], nn[0], nn[1], nn[2], gc); bank.idx.push(i0, i1, i2); }
        // barrier end
        if (walls) {
          const top = WALL_HEIGHT, ee = edge(i, sg);
          const ib = out(i, sg, WALL_GAP), ob = out(i, sg, WALL_GAP + WALL_T), yt = ee[1] + top;
          const c = Math.floor(i / 7) % 2 ? C_WALL_A : C_WALL_B;
          quad(wall, [ib[0], ib[1] - 0.1, ib[2]], [ib[0], yt, ib[2]], [ob[0], yt, ob[2]], [ob[0], ob[1] - 0.1, ob[2]], nn, c);
        }
      }
    }
  }

  // ---- pillars under raised road, lamp posts, start gantry data
  const pillars = [], lamps = [];
  /** Is another stretch of road (not the one at arc position `s0`) passing over the point (x, y, z) within `h` metres above it? */
  const roadAbove = (x, y, z, s0, h) => {
    for (let k = 0; k < n; k++) {
      if (track.py[k] - SLAB < y + 0.3 || track.py[k] - y > h + 1) continue;
      let ds2 = Math.abs(track.s[k] - s0); if (ds2 > L / 2) ds2 = L - ds2; if (ds2 < 30) continue;
      if (Math.hypot(track.px[k] - x, track.pz[k] - z) < track.hw[k] + 2.5) return true;
    }
    return false;
  };
  for (let i = 0; i < n; i += 24) {
    if (track.gap[i] || track.py[i] < 3.2) continue;
    if ((track.structures || []).some((st) => Math.hypot(track.px[i] - st.x, track.pz[i] - st.z) < 24)) continue;       // (a flyover or tunnel has its own supports)
    let clear = true;
    const q = Track.newQuery();
    track.query(track.px[i], track.py[i] - 1.5, track.pz[i], q, 0.5);
    if (q.surface === SURF.ROAD && q.idx >= 0 && Math.abs(track.s[i] - q.s) > 40 && Math.abs(track.s[i] - q.s) < L - 40) clear = false;
    if (!clear) continue;
    const w = Math.min(track.hw[i] * 2 - 4, 8), halfW = w / 2, bank = track.bank[i];
    // pick the tallest the (rolled) box can be while its top still clears the true underside at both edges, and at the front and back of the pillar too:
    // on a steep hill (or over a crest) the road is lower than at the middle a little way along it, and a flat-topped pillar would show through there
    const kk = Math.max(1, Math.round(0.9 / track.ds));
    let h = Infinity;
    for (const j of [i - kk, i - kk / 2 | 0, i, i + kk / 2 | 0, i + kk]) {
      const jj = ((j % n) + n) % n, hL = edge(jj, 1)[1] - SLAB, hR = edge(jj, -1)[1] - SLAB;
      h = Math.min(h, hL - halfW * Math.sin(bank), hR + halfW * Math.sin(bank));
    }
    h -= 0.1;
    // (no pillars any more: a raised road stands on a solid side wall, see `solid` above. The sums are kept in case a free-standing support is ever wanted again.)
  }
  for (let i = 12, k = 0; i < n; i += 52, k++) {
    if (track.gap[i]) continue;
    const sg = k % 2 ? 1 : -1;
    const o = out(i, sg, WALL_GAP + WALL_T + 0.9);
    if (o[1] > track.py[i] + 3 || o[1] < 0.05) { /* fine either way */ }
    if ((track.crossroads || []).some((c) => Math.hypot(o[0] - c.x, o[2] - c.z) < Math.max(c.hwA, c.hwB) / c.sin + 4)) continue;      // (no lamp posts in the middle of a crossroad)
    if (roadAbove(o[0], o[1], o[2], track.s[i], 10)) continue;      // (a post from the road below must not stand up through a bridge or flyover over it)
    lamps.push({ x: o[0], y: Math.max(o[1], 0), z: o[2], dx: -track.lx[i] * sg, dz: -track.lz[i] * sg });
  }

  const f0 = track.frameAt(0);
  const start = {
    x: f0.x, y: f0.y, z: f0.z, fx: f0.fx, fy: f0.fy, fz: f0.fz,        // tangent
    nx: f0.nx, ny: f0.ny, nz: f0.nz,                                  // surface normal
    bx: f0.lx, by: f0.ly, bz: f0.lz,                                  // banked left
    lx: track.lx[0], lz: track.lz[0], hw: track.hw[0],                // horizontal left, half width
  };


  // ---- crossroads: a plain asphalt patch over the junction (the painted edge and centre lines of the two roads stop at its edge, so
  // they join up), a dashed white give-way line across every approach, and a give-way sign beside each one
  const junction = new Buf(), marks = new Buf(), signs = new Buf();
  {
    const WHITE = [0.82, 0.8, 0.74], RED = [0.78, 0.07, 0.07], PALE = [0.95, 0.95, 0.93], POLE = [0.45, 0.46, 0.48];
    const tri = (buf, a, b, c, nn, col) => quad(buf, a, b, c, c, nn, col);
    const UP = [0, 1, 0], q = Track.newQuery();
    const surf = (x, z, yHint) => { track.groundAt(x, z, yHint, q, true); return q.idx >= 0 ? q.y : yHint; };
    for (const c of track.crossroads || []) {
      const nax = -c.taz, naz = c.tax, nbx = -c.tbz, nbz = c.tbx, det = nax * nbz - naz * nbx;
      const at = (u, v) => {                                                    // the point u*hwA across road A and v*hwB across road B, measured from the crossing
        const a = u * c.hwA, b = v * c.hwB;
        const x = c.x + (a * nbz - naz * b) / det, z = c.z + (nax * b - nbx * a) / det;
        return [x, surf(x, z, c.y + 0.3) + 0.045, z];
      };
      const G = 6, pts = [];
      for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) pts.push(at(-1 + (2 * i) / G, -1 + (2 * j) / G));
      for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
        const a = pts[i * (G + 1) + j], b = pts[i * (G + 1) + j + 1], d = pts[(i + 1) * (G + 1) + j], e = pts[(i + 1) * (G + 1) + j + 1];
        const k = Math.min(1, Math.hypot(e[0] - a[0], e[2] - a[2]) / vgrid) || 0.1, W = [1, 1, 1];     // (the road's own texture: its plain asphalt strip, with no painted lines)
        const v0 = junction.vert(a[0], a[1], a[2], 0, 1, 0, W, 0.1, 0), v1 = junction.vert(b[0], b[1], b[2], 0, 1, 0, W, 0.26, 0), v2 = junction.vert(e[0], e[1], e[2], 0, 1, 0, W, 0.26, k), v3 = junction.vert(d[0], d[1], d[2], 0, 1, 0, W, 0.1, k);
        const up = (b[2] - a[2]) * (e[0] - a[0]) - (b[0] - a[0]) * (e[2] - a[2]) > 0;                      // wind every cell so it faces up whichever way the two roads run (a face the wrong way round is lit from below: black)
        if (up) junction.idx.push(v0, v1, v2, v0, v2, v3); else junction.idx.push(v0, v2, v1, v0, v3, v2);
      }

      // the corner drums (they are solid, see Track.drumHit)
      for (const d of track.drums || []) {
        if (d.c !== c) continue;
        const px = d.x, pz = d.z, cy0 = c.y - 0.1, top = c.y + WALL_HEIGHT + 0.25, R = d.r, N = 10, YEL = [1, 0.8, 0.08], BAND = [0.15, 0.13, 0.1];
        for (let k = 0; k < N; k++) {
          const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
          const p0 = [px + Math.cos(a0) * R, 0, pz + Math.sin(a0) * R], p1 = [px + Math.cos(a1) * R, 0, pz + Math.sin(a1) * R], nrm = [Math.cos(am), 0, Math.sin(am)];
          const at = (q, y) => [q[0], y, q[2]], mid = (top + cy0) / 2, bh = 0.09;
          quad(signs, at(p0, cy0), at(p1, cy0), at(p1, mid - bh), at(p0, mid - bh), nrm, YEL);
          quad(signs, at(p0, mid - bh), at(p1, mid - bh), at(p1, mid + bh), at(p0, mid + bh), nrm, BAND);
          quad(signs, at(p0, mid + bh), at(p1, mid + bh), at(p1, top), at(p0, top), nrm, YEL);
          tri(signs, [px, top, pz], at(p1, top), at(p0, top), UP, [0.9, 0.7, 0.05]);
        }
      }
      // approaches: [road, direction of travel (+1 = the way the road runs), tangent, left normal, half width, how far the other road reaches]
      const cosA = Math.abs(c.tax * c.tbx + c.taz * c.tbz);
      for (const [t, hw, hwO, dir, i0] of [[[c.tax, c.taz], c.hwA, c.hwB, 1, c.ia], [[c.tax, c.taz], c.hwA, c.hwB, -1, c.ia], [[c.tbx, c.tbz], c.hwB, c.hwA, 1, c.ib], [[c.tbx, c.tbz], c.hwB, c.hwA, -1, c.ib]]) {
        const reach = (hwO + hw * cosA) / c.sin + 0.7;                           // from the middle of the junction back to where the other road's edge line is clear
        const fx = t[0] * dir, fz = t[1] * dir, lx = -fz, lz = fx;                // the way the car is heading, and its left (the sign goes on the left kerb)
        const bx = c.x - fx * reach, bz = c.z - fz * reach, by = surf(bx, bz, c.y + 0.3) + 0.05;
        const lineY = (x, z) => surf(x, z, by) + 0.045;
        // dashed give-way line: from the yellow drum on one side to the yellow drum on the other (the two corners on this approach), dashes 0.9 m wide and 0.45 m long, with gaps
        const behind = (track.drums || []).filter((d) => d.c === c && (d.x - c.x) * fx + (d.z - c.z) * fz < 0);
        let ax, az, ex, ez;                                                       // the line's two ends
        if (behind.length === 2) {
          const [d0, d1] = behind, gx = d1.x - d0.x, gz = d1.z - d0.z, gl = Math.hypot(gx, gz) || 1, inset = d0.r + 0.2;
          ax = d0.x + (gx / gl) * inset; az = d0.z + (gz / gl) * inset; ex = d1.x - (gx / gl) * inset; ez = d1.z - (gz / gl) * inset;
        } else { ax = bx - lx * hw * 0.93; az = bz - lz * hw * 0.93; ex = bx + lx * hw * 0.93; ez = bz + lz * hw * 0.93; }
        const sx0 = ex - ax, sz0 = ez - az, segL = Math.hypot(sx0, sz0) || 1, ux = sx0 / segL, uz = sz0 / segL, vx = -uz, vz = ux;      // along the line, and across it
        const vf = vx * fx + vz * fz < 0 ? -1 : 1;                                // (across-line direction pointing the way the car travels)
        const DASH = 0.9, nDash = Math.max(3, Math.floor(segL / (DASH * 1.6)));
        for (let k = 0; k < nDash; k++) {
          const o = (k + 0.5) * (segL / nDash), w2 = (segL / nDash) * 0.3;
          const cx = ax + ux * o, cz = az + uz * o;
          const p = (du, dv) => { const x = cx + ux * du + vx * vf * dv, z = cz + uz * du + vz * vf * dv; return [x, lineY(x, z), z]; };
          quad(marks, p(-w2, -0.22), p(w2, -0.22), p(w2, 0.22), p(-w2, 0.22), UP, WHITE);
        }
        // give-way sign: a pole on the left kerb, outside the wall, with the red-and-white downward triangle facing the oncoming car
        const sx = bx - fx * 2.2 + lx * (hw + WALL_GAP + WALL_T + 1.1), sz = bz - fz * 2.2 + lz * (hw + WALL_GAP + WALL_T + 1.1);
        const sy = Math.max(by - 0.2, surf(sx, sz, by) ), top = by + 2.4, side = [lx, 0, lz], face = [-fx, 0, -fz];
        const box = (hx, hz, y0, y1, col) => {                                  // a thin square post
          const a = [sx - hx, y0, sz - hz], b = [sx + hx, y0, sz - hz], c2 = [sx + hx, y0, sz + hz], d = [sx - hx, y0, sz + hz];
          const a2 = [a[0], y1, a[2]], b2 = [b[0], y1, b[2]], c3 = [c2[0], y1, c2[2]], d2 = [d[0], y1, d[2]];
          quad(signs, a, b, b2, a2, [0, 0, -1], col); quad(signs, b, c2, c3, b2, [1, 0, 0], col); quad(signs, c2, d, d2, c3, [0, 0, 1], col); quad(signs, d, a, a2, d2, [-1, 0, 0], col);
        };
        box(0.05, 0.05, Math.min(sy, by) - 0.3, top, POLE);
        const W = 1.5, cy = top - 0.25, face3 = (u, v, off) => [sx + side[0] * u + face[0] * off, cy + v, sz + side[2] * u + face[2] * off];
        const triPts = (w, off) => { const h = 0.866 * w; return [face3(-w / 2, h / 3, off), face3(w / 2, h / 3, off), face3(0, -2 * h / 3, off)]; };
        const [o0, o1, o2] = triPts(W, 0.06), [i0p, i1p, i2p] = triPts(W * 0.56, 0.075);
        for (const sgn of [1, -1]) {                                            // both faces (the back is plain red)
          const off = (v, extra) => [v[0] + face[0] * extra * sgn, v[1], v[2] + face[2] * extra * sgn];
          if (sgn > 0) { tri(signs, o0, o1, o2, face, RED); tri(signs, i0p, i1p, i2p, face, PALE); }
          else { tri(signs, off(o0, 0.0), off(o2, 0.0), off(o1, 0.0), [-face[0], 0, -face[2]], RED); }
        }
      }
    }
  }

  // flyovers and tunnels (a bridge crossing the editor marked): concrete girder and pillars under the upper road, or a roofed tunnel round the lower one
  for (const st of track.structures || []) {
    const CONC = [0.66, 0.64, 0.6], CONC_D = [0.5, 0.49, 0.46], DARK = [0.22, 0.21, 0.2], sn = Math.max(st.sin, 0.3);
    const pt = (i, off, y) => { const k = ((i % n) + n) % n; return [track.px[k] + track.lx[k] * off, y, track.pz[k] + track.lz[k] * off]; };
    const qn = (a, b, c, d, nn, col) => {                                      // a quad whose winding faces the way its normal points (the lighting flips on a face the wrong way round)
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const dot = (uy * vz - uz * vy) * nn[0] + (uz * vx - ux * vz) * nn[1] + (ux * vy - uy * vx) * nn[2];
      if (dot >= 0) quad(signs, a, b, c, d, nn, col); else quad(signs, d, c, b, a, nn, col);
    };
    if (st.type === 'flyover') {
      const K = Math.ceil(((st.low.hw + WALL_GAP + WALL_T + 3.2) / sn + 1.5) / track.ds), u = st.up.i, GW = Math.max(2, st.up.hw * 0.55);
      for (let k = -K; k < K; k++) {                                            // a girder under the deck, the length of the flyover
        const i = u + k, j = i + 1, yi = track.py[((i % n) + n) % n] - SLAB, yj = track.py[((j % n) + n) % n] - SLAB, g = 0.85;
        const li = pt(i, GW, yi), lj = pt(j, GW, yj), ri = pt(i, -GW, yi), rj = pt(j, -GW, yj);
        const down = (p) => [p[0], p[1] - g, p[2]];
        const nl = [track.lx[((i % n) + n) % n], 0, track.lz[((i % n) + n) % n]];
        qn(li, lj, down(lj), down(li), nl, CONC); qn(ri, rj, down(rj), down(ri), [-nl[0], 0, -nl[2]], CONC);
        qn(down(li), down(lj), down(rj), down(ri), [0, -1, 0], CONC_D);
      }
      for (const d of track.drums) {                                            // the pillars (solid: see Track.drumHit)
        if (!d.pillar || d.st !== st) continue;
        const N = 12, y0 = d.y, y1 = d.top + 0.05;
        for (let k = 0; k < N; k++) {
          const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
          const p0 = [d.x + Math.cos(a0) * d.r, 0, d.z + Math.sin(a0) * d.r], p1 = [d.x + Math.cos(a1) * d.r, 0, d.z + Math.sin(a1) * d.r];
          quad(signs, [p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], y1, p1[2]], [p0[0], y1, p0[2]], [Math.cos(am), 0, Math.sin(am)], CONC);
        }
        const fo = d.r + 0.25;                                                  // a flared cap where it meets the girder
        for (let k = 0; k < 4; k++) { const a0 = (k / 4) * Math.PI * 2 + Math.PI / 4, a1 = a0 + Math.PI / 2, am = a0 + Math.PI / 4; quad(signs, [d.x + Math.cos(a0) * fo, y1 - 0.45, d.z + Math.sin(a0) * fo], [d.x + Math.cos(a1) * fo, y1 - 0.45, d.z + Math.sin(a1) * fo], [d.x + Math.cos(a1) * fo, y1, d.z + Math.sin(a1) * fo], [d.x + Math.cos(a0) * fo, y1, d.z + Math.sin(a0) * fo], [Math.cos(am), 0, Math.sin(am)], CONC_D); }
      }
    } else {
      const l = st.low, u = st.up, K = Math.ceil(((u.hw + WALL_GAP + WALL_T + 2.2) / sn) / track.ds);
      const Wi = l.hw + WALL_GAP + WALL_T + 0.15, Wt = Wi + 1.5;
      let roofTop = Infinity;
      const KU = Math.ceil(((Wt + 1) / sn) / track.ds);
      for (let k = -KU; k <= KU; k++) roofTop = Math.min(roofTop, track.py[(((u.i + k) % n) + n) % n] - SLAB - 0.15);
      const roofBot = roofTop - 0.5;
      for (let k = -K; k < K; k++) {
        const i = l.i + k, j = i + 1, fi = track.py[((i % n) + n) % n], fj = track.py[((j % n) + n) % n], bi = fi - 0.8, bj = fj - 0.8;
        const nl = [track.lx[((i % n) + n) % n], 0, track.lz[((i % n) + n) % n]];
        qn(pt(i, -Wt, roofBot), pt(j, -Wt, roofBot), pt(j, Wt, roofBot), pt(i, Wt, roofBot), [0, -1, 0], CONC_D);                    // under the roof
        qn(pt(i, -Wi, roofBot), pt(j, -Wi, roofBot), pt(j, -Wi, fj), pt(i, -Wi, fi), nl, DARK);                                       // inside, right
        qn(pt(i, Wi, roofBot), pt(j, Wi, roofBot), pt(j, Wi, fj), pt(i, Wi, fi), [-nl[0], 0, -nl[2]], DARK);                          // inside, left
        qn(pt(i, Wt, roofTop), pt(j, Wt, roofTop), pt(j, Wt, bj), pt(i, Wt, bi), nl, CONC);                                           // outside, left
        qn(pt(i, -Wt, roofTop), pt(j, -Wt, roofTop), pt(j, -Wt, bj), pt(i, -Wt, bi), [-nl[0], 0, -nl[2]], CONC);                      // outside, right
        qn(pt(i, -Wt, roofTop), pt(j, -Wt, roofTop), pt(j, Wt, roofTop), pt(i, Wt, roofTop), [0, 1, 0], CONC_D);                      // the top (under the upper road)
      }
      for (const [i, sgn] of [[l.i - K, -1], [l.i + K, 1]]) {                      // the two portals: a pier each side and a lintel over the opening
        const k = ((i % n) + n) % n, f = track.py[k], b = f - 0.8, tn = [sgn * track.tx[k] / (Math.hypot(track.tx[k], track.tz[k]) || 1), 0, sgn * track.tz[k] / (Math.hypot(track.tx[k], track.tz[k]) || 1)];
        qn(pt(i, Wi, b), pt(i, Wt, b), pt(i, Wt, roofTop), pt(i, Wi, roofTop), tn, CONC);
        qn(pt(i, -Wt, b), pt(i, -Wi, b), pt(i, -Wi, roofTop), pt(i, -Wt, roofTop), tn, CONC);
        qn(pt(i, -Wi, roofBot), pt(i, Wi, roofBot), pt(i, Wi, roofTop), pt(i, -Wi, roofTop), tn, CONC);
      }
    }
  }

  // bounds for scenery
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, track.px[i]); maxX = Math.max(maxX, track.px[i]);
    minZ = Math.min(minZ, track.pz[i]); maxZ = Math.max(maxZ, track.pz[i]);
  }

  return {
    road: road.arrays(), junction: junction.arrays(), marks: marks.arrays(), signs: signs.arrays(), kerb: kerb.arrays(), bank: bank.arrays(), slab: slab.arrays(), wall: wall.arrays(),
    pillars, lamps, start, bounds: { minX, maxX, minZ, maxZ },
  };
}
