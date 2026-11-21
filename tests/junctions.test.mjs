// The "crossroad or gap?" choice for a flat crossing in the editor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeTrack } from '../src/track.js';
import { pendingJunctions, keepCrossroad, makeGap, roadHeightsAt, GAP_HEIGHT } from '../src/junctions.js';

const eight = () => {
  const H = [], N = 12;
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; H.push({ x: 120 * Math.sin(a), z: 60 * Math.sin(2 * a), y: 0.65 }); }
  return normalizeTrack({ name: 'eight', width: 16, walls: true, handles: H });
};

test('a new flat crossing is pending until it is answered, and a crossroad answer is remembered', () => {
  const def = eight(), t = new Track(def);
  const p = pendingJunctions(t, def);
  assert.equal(p.length, 1);
  keepCrossroad(def, p[0]);
  assert.equal(pendingJunctions(new Track(def), normalizeTrack(def)).length, 0);
  assert.equal(normalizeTrack(JSON.parse(JSON.stringify(def))).junctions.length, 1);          // survives a save
});

test('"gap" lifts one road at least 5 m over the other, and the crossing is no longer a crossroad', () => {
  const def = eight(), c = pendingJunctions(new Track(def), def)[0];
  const lifted = makeGap(def, c);
  assert.ok(lifted > 0);
  const t = new Track(def), hs = roadHeightsAt(t, c.x, c.z);
  assert.ok(hs[hs.length - 1] - hs[0] >= GAP_HEIGHT - 0.01, 'clearance ' + (hs[hs.length - 1] - hs[0]).toFixed(2));
  assert.equal(t.crossroads.length, 0);
});

const eightAt = (dy) => { const d = eight(); d.handles[6].y = 0.65 + dy; return normalizeTrack(d); };

test('roads 3 m apart are not a crossroad yet; flattening raises the lower road to the higher one and joins them', async () => {
  const { flattenCrossing } = await import('../src/junctions.js');
  const { analyzeTrack } = await import('../src/track.js');
  const def = eightAt(3), a = analyzeTrack(new Track(def));
  assert.equal(a.crossroads.length, 0);
  assert.equal(a.crossings.length + a.bridges.length, 1, 'one uneven crossing is reported');
  const c = a.crossings[0] || a.bridges[0];
  const before = Math.max(...def.handles.map((h) => h.y));
  const r = flattenCrossing(def, c);
  assert.ok(r > 0, 'raised ' + r);
  assert.ok(Math.max(...def.handles.map((h) => h.y)) <= before + 0.01, 'nothing is lifted above the highest point that already existed');
  assert.ok(new Track(def).crossroads.length >= 1, 'now a crossroad');
});

test('a crossing that is already a gap is left exactly as it is, and shows up as a bridge', async () => {
  const { analyzeTrack } = await import('../src/track.js');
  const def = eightAt(7), a = analyzeTrack(new Track(def));
  assert.equal(a.bridges.length, 1);
  const c = a.bridges[0], ys = def.handles.map((h) => h.y);
  assert.equal(makeGap(def, c), 0);
  assert.deepEqual(def.handles.map((h) => h.y), ys);
});
