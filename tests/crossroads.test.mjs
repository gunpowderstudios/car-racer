// A road that crosses itself flat becomes a crossroad: no warning, open barriers, and progress stays on the road you drive.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeTrack, analyzeTrack } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { placeOnRoad } from '../src/derby.js';
import { DT } from './harness.mjs';
import { makeTemplate } from '../src/templates.js';

// a figure of eight at one height: the middle crosses itself
const eight = (dy = 0) => {
  const H = [], N = 12, A = 120, B = 60;
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; H.push({ x: A * Math.sin(a), z: B * Math.sin(2 * a), y: 0.65 + (i >= 4 && i <= 8 ? dy : 0) }); }
  return { name: 'eight', width: 16, walls: true, handles: H };
};

test('a flat crossing is a crossroad, not a problem', () => {
  const t = new Track(eight()), a = analyzeTrack(t);
  assert.ok(t.crossroads.length >= 1, 'crossroads ' + t.crossroads.length);
  assert.equal(a.crossings.length, 0);
  assert.ok(t.junc.some((v) => v));
  const c = t.crossroads[0], A = Math.round(c.sA / t.ds), B = Math.round(c.sB / t.ds);
  assert.ok(Math.abs(t.py[A] - t.py[B]) < 0.1, 'levelled');
});

test('a bridge (one road well above the other) is still a bridge', () => {
  const t = new Track(eight(8));
  assert.equal(t.crossroads.length, 0);
  assert.equal(analyzeTrack(t).crossings.length, 0);          // more than 4.5 m apart: nothing to report
});

test('the barriers open at a crossroad and stay shut elsewhere', () => {
  const t = new Track(eight()), c = t.crossroads[0];
  const iA = Math.round(c.sA / t.ds), q = Track.newQuery();
  const f = t.frameAt(c.sA);
  t.query(f.x + f.lx * (f.hw + 1.2), f.y, f.z + f.lz * (f.hw + 1.2), q);
  assert.equal(t.wallPenetration(q, f.y + 0.3), 0, 'open at the junction');
  const far = t.frameAt(c.sA + 80); t.query(far.x + far.lx * (far.hw + 1.2), far.y, far.z + far.lz * (far.hw + 1.2), q);
  assert.ok(t.wallPenetration(q, far.y + 0.3) > 0, 'shut away from it');
  assert.ok(iA >= 0);
});

test('progress stays on your own road straight through a crossroad', () => {
  const t = new Track(eight()), c = t.crossroads[0];
  for (const start of [c.sA, c.sB]) {
    let last = start - 40, bad = 0;
    for (let s = start - 40; s < start + 40; s += 0.5) {
      const f = t.frameAt(s), p = t.progressNear(f.x, f.y, f.z, last);
      let d = p - s; if (d > t.length / 2) d -= t.length; if (d < -t.length / 2) d += t.length;
      if (Math.abs(d) > 1.5) bad++;
      last = p;
    }
    assert.equal(bad, 0, 'jumped to the other road ' + bad + ' times');
  }
});

test('a car drives through a crossroad without being stopped or turned', () => {
  const t = new Track(eight()), c = t.crossroads[0], car = new Vehicle();
  placeOnRoad(car, t, c.sA - 30, 0, 12);
  let minSpeed = 99, last = c.sA - 30, jumped = 0;
  for (let i = 0; i < 6 / DT; i++) {
    car.step(DT, { throttle: 0.6, brake: 0, steer: 0, handbrake: false }, t); car.events.length = 0;
    const p = t.progressNear(car.pos.x, car.pos.y, car.pos.z, last); if (Math.abs(p - last) > 5 && Math.abs(Math.abs(p - last) - t.length) > 5) jumped++; last = p;
    if (i * DT > 1) minSpeed = Math.min(minSpeed, car.speed);
  }
  assert.equal(jumped, 0);
  assert.ok(minSpeed > 6, 'kept moving ' + minSpeed.toFixed(1));
});

test('a crossroad gets an asphalt patch, give-way lines and four give-way signs, and joined barrier ends', async () => {
  const { buildTrackGeometry } = await import('../src/trackGeometry.js');
  const t = new Track(eight()), g = buildTrackGeometry(t);
  assert.ok(g.junction.index.length > 0, 'asphalt patch');
  assert.ok(g.signs.index.length > 0, 'signs');
  const g0 = buildTrackGeometry(new Track(makeTemplate('speedway')));
  assert.equal(g0.signs.index.length, 0, 'no signs on a track with no crossroad');
  // each wall is open only where it runs through the other road: both sides open somewhere, shut far away
  const open = [0, 0]; for (let i = 0; i < t.n; i++) { if (t.junc[i] & 1) open[0]++; if (t.junc[i] & 2) open[1]++; }
  assert.ok(open[0] > 0 && open[1] > 0 && open[0] + open[1] < t.n / 3, 'openings ' + open);
});

test('crossroad corner drums are solid: a point inside one is pushed out, and far away is not', () => {
  const t = new Track(eight());
  assert.equal(t.drums.length, 4 * t.crossroads.length);
  const d = t.drums[0];
  const hit = t.drumHit(d.x + 0.1, d.y + 0.5, d.z);
  assert.ok(hit && hit.pen > 0.4 && hit.nx > 0.9, JSON.stringify(hit));
  assert.equal(t.drumHit(d.x + 3, d.y + 0.5, d.z), null);
});
