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
