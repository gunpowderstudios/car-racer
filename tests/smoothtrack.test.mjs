import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothHandles } from '../src/smoothTrack.js';
import { Track, normalizeTrack } from '../src/track.js';

const jaggy = () => Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2, r = 100 + (i % 2 ? 14 : -14); return { x: Math.cos(a) * r * 1.5, z: Math.sin(a) * r, y: 0.65, w: 0, bank: 0, gap: 0 }; });
const turn = (H) => { let worst = 0; const n = H.length; for (let i = 0; i < n; i++) { const p = H[(i + n - 1) % n], h = H[i], q = H[(i + 1) % n]; const a1 = Math.atan2(h.z - p.z, h.x - p.x), a2 = Math.atan2(q.z - h.z, q.x - h.x); let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d; worst = Math.max(worst, d); } return worst; };

test('auto-smooth takes the jaggedness out and keeps the circuit its size', () => {
  const H = jaggy(), r = smoothHandles(H);
  assert.ok(turn(r.handles) < turn(H) * 0.6, `${turn(r.handles)} vs ${turn(H)}`);
  const size = (A) => Math.max(...A.map((h) => h.x)) - Math.min(...A.map((h) => h.x));
  assert.ok(Math.abs(size(r.handles) - size(H)) / size(H) < 0.1);
  new Track(normalizeTrack({ width: 16, handles: r.handles }));
});

test('auto-smooth leaves a jump-gap point exactly where it is and merges crowded points', () => {
  const H = jaggy(); H[3].gap = 20; H.splice(9, 0, { ...H[9], x: H[9].x + 2, z: H[9].z + 1 });
  const r = smoothHandles(H);
  assert.equal(r.merged, 1);
  const g = r.handles.find((h) => h.gap); assert.equal(g.x, Math.round(H[3].x * 10) / 10);
});
