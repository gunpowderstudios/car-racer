import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, EMBANKMENT } from '../src/track.js';
import { buildTrackGeometry } from '../src/trackGeometry.js';
import { makeTemplate, TEMPLATE_KEYS } from '../src/templates.js';

for (const key of TEMPLATE_KEYS) {
  test(`geometry for "${key}" is finite and well-formed`, () => {
    const track = new Track(makeTemplate(key));
    const g = buildTrackGeometry(track);
    for (const part of ['road', 'kerb', 'bank', 'slab', 'wall']) {
      const a = g[part];
      assert.ok(a.position.length > 0, part + ' empty');
      assert.equal(a.position.length / 3, a.normal.length / 3);
      assert.equal(a.position.length / 3, a.uv.length / 2);
      for (const v of a.position) assert.ok(Number.isFinite(v), part + ' has NaN');
      const max = a.position.length / 3;
      for (const i of a.index) assert.ok(i < max, part + ' index out of range');
    }
    assert.ok(g.start.hw > 5);
  });
}

test('road mesh edges lie exactly on the physics surface', () => {
  const track = new Track(makeTemplate('hills'));
  const g = buildTrackGeometry(track);
  const P = g.road.position, q = Track.newQuery();
  let worst = 0;
  for (let i = 0; i < track.n; i += 17) {
    for (const c of [0, 1]) {
      const k = (i * 2 + c) * 3;
      const x = P[k], y = P[k + 1], z = P[k + 2];
      // nudge inwards so the probe is safely on the road, from above
      const cx = track.px[i], cz = track.pz[i];
      track.query(x + (cx - x) * 0.02, y + 3, z + (cz - z) * 0.02, q);
      worst = Math.max(worst, Math.abs(q.y - y));
    }
  }
  assert.ok(worst < 0.25, 'mesh/physics mismatch ' + worst);
});

test('wall face in the mesh sits where the physics wall is', () => {
  const track = new Track(makeTemplate('kidney'));
  const g = buildTrackGeometry(track);
  // 6 columns per section, columns 0 and 1 are the inner face at lateral offset hw + WALL_GAP
  const P = g.wall.position, i = 100, sg = 1;
  const base = (i * 6 + 0) * 3;
  const x = P[base], z = P[base + 2];
  const d = (x - track.px[i]) * track.lx[i] + (z - track.pz[i]) * track.lz[i];
  assert.ok(Math.abs(Math.abs(d) - (track.hw[i] + 0.6)) < 0.02, 'inner face at ' + d);
  void EMBANKMENT; void sg;
});

test('gaps leave no road triangles', () => {
  const track = new Track(makeTemplate('hills'));
  const g = buildTrackGeometry(track);
  const centre = track.frameAt(track.handleS[track.def.handles.findIndex((h) => h.gap)]);
  const P = g.road.position;
  for (let t = 0; t < g.road.index.length; t += 3) {
    const a = g.road.index[t];
    const x = P[a * 3], z = P[a * 3 + 2];
    assert.ok(Math.hypot(x - centre.x, z - centre.z) > 5.5, 'road triangle inside the gap');
  }
});

test('a pillar under a tall, steeply banked stretch of road never pokes through either edge', () => {
  // a single high, hard-banked peak between low points - the extreme case a user can build with the sliders
  const N = 14, R = 300;
  const handles = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const peak = k === 1;
    handles.push({ x: Math.round(Math.cos(a) * R), z: Math.round(Math.sin(a) * R),
      y: peak ? 40 : 0.65, w: 0, bank: peak ? 20 : 2, gap: 0 });
  }
  const track = new Track({ name: 'peak-test', width: 26, walls: true, handles });
  const g = buildTrackGeometry(track);
  const SLAB = 0.7;
  const edgeY = (i, sg) => track.py[i] - (track.nx[i] * track.lx[i] * track.hw[i] * sg + track.nz[i] * track.lz[i] * track.hw[i] * sg) / track.ny[i];
  assert.ok(g.pillars.length > 0, 'this track should need pillars');
  let worst = Infinity;
  for (const p of g.pillars) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < track.n; i++) { const d = (track.px[i] - p.x) ** 2 + (track.pz[i] - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }
    const hL = edgeY(bi, 1) - SLAB, hR = edgeY(bi, -1) - SLAB, halfW = p.w / 2;
    const clearL = hL - (p.h + Math.sin(p.bank) * halfW), clearR = hR - (p.h - Math.sin(p.bank) * halfW);
    worst = Math.min(worst, clearL, clearR);
  }
  assert.ok(worst >= -0.01, `a pillar pokes through by ${(-worst).toFixed(2)}m`);
});
