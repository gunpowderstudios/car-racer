// Crash dents: sizes, merging, which face gets hit, and that the derby reports where a hit landed.
// Run with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { DENT, dentSize, faceOf, DentStore } from '../src/dentMath.js';
import { TIERS } from '../src/quality.js';
import { Track } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { Derby, DERBY } from '../src/derby.js';
import { DRAG_DEF, placeOnTrack } from './harness.mjs';

const at = (x, z, r = 0.5, d = 0.1) => ({ x, y: 0, z, dx: 0, dy: 0, dz: -1, radius: r, depth: d });

test('a gentle bump leaves no dent; harder hits make bigger, deeper ones, up to a limit', () => {
  assert.equal(dentSize(DENT.minHp - 0.1), null);
  assert.equal(dentSize(0), null);
  const small = dentSize(10), mid = dentSize(35), big = dentSize(70), huge = dentSize(500);
  assert.ok(small.depth < mid.depth && mid.depth < big.depth);
  assert.ok(small.radius < mid.radius && mid.radius < big.radius);
  assert.deepEqual(big, huge, 'past the top of the scale a hit is no bigger');
  assert.ok(big.depth <= DENT.depthMax && big.radius <= DENT.radiusMax);
});

test('the nearest face of the car decides where a dent goes; the underside gets none', () => {
  const H = [0.93, 0.7, 2.4];
  assert.deepEqual(faceOf(0, 0.2, 2.4, ...H), { axis: 2, sign: 1 }, 'nose');
  assert.deepEqual(faceOf(0, 0.2, -2.3, ...H), { axis: 2, sign: -1 }, 'tail');
  assert.deepEqual(faceOf(0.9, 0, 0.5, ...H), { axis: 0, sign: 1 }, 'a side');
  assert.deepEqual(faceOf(-0.9, 0, 0.5, ...H), { axis: 0, sign: -1 }, 'the other side');
  assert.deepEqual(faceOf(0, 0.7, 0, ...H), { axis: 1, sign: 1 }, 'roof');
  assert.equal(faceOf(0, -0.7, 0, ...H), null);
});

test('hits on the same spot deepen one dent instead of piling up new ones, and never pass the depth limit', () => {
  const s = new DentStore(6);
  s.add(at(0, 2, 0.5, 0.1), 1, 0);
  s.add(at(0.1, 2.05, 0.5, 0.1), 1, 1);                    // 1 s later, right beside it
  assert.equal(s.length, 1);
  assert.ok(s.list[0].depth > 0.1 && s.list[0].depth < 0.2);
  for (let t = 2; t < 40; t += 1) s.add(at(0, 2, 0.5, 0.2), 1, t);
  assert.equal(s.length, 1);
  assert.equal(s.list[0].depth, DENT.depthMax);
  s.add(at(1, -2), 1, 50);                                  // somewhere else is a new dent
  assert.equal(s.length, 2);
});

test('one crash felt over many physics steps counts once, not once per step', () => {
  const s = new DentStore(6);
  for (let i = 0; i < 20; i++) s.add(at(0, 2, 0.5, 0.1), 1, i * 0.008);   // 20 steps at 120 Hz
  assert.equal(s.length, 1);
  assert.ok(Math.abs(s.list[0].depth - 0.1) < 1e-9);
});

test('a full store drops its shallowest dent for a new one', () => {
  const s = new DentStore(3);
  s.add(at(0, 0, 0.3, 0.12), 1, 0); s.add(at(5, 0, 0.3, 0.05), 1, 0); s.add(at(10, 0, 0.3, 0.2), 1, 0);
  s.add(at(20, 0, 0.3, 0.1), 1, 0);
  assert.equal(s.length, 3);
  assert.ok(!s.list.some((e) => e.x === 5), 'the 0.05 dent went');
  assert.ok(s.list.some((e) => e.x === 20));
});

test('metres per model unit: dents are merged by real distance, not model units', () => {
  const s = new DentStore(6);
  s.add(at(0, 0, 0.5, 0.1), 0.01, 0);                      // model units are 1 cm
  s.add(at(20, 0, 0.5, 0.1), 0.01, 1);                      // 0.2 m away: same dent
  assert.equal(s.length, 1);
  s.add(at(200, 0, 0.5, 0.1), 0.01, 2);                     // 2 m away: a new one
  assert.equal(s.length, 2);
});

test('only the low tier goes without dents, and they get no more numerous on the lower tiers', () => {
  const { low, medium, high } = TIERS;
  assert.equal(low.dentMax, 0);
  assert.ok(medium.dentMax > 0 && medium.dentMax <= high.dentMax);
});

function arena() {
  const track = new Track(DRAG_DEF), car = new Vehicle();
  placeOnTrack(car, track, track.progressAt(0, 0.65, -300), 0, 0);
  const derby = new Derby(); derby.enabled = true; derby.start(track, car, 0);
  derby.time = DERBY.grace + 1;
  return { track, car, derby };
}

test('a damage event says where on the car it landed, in the car\'s own space', () => {
  const { derby } = arena();
  const P = derby.player, c = P.car;
  c.refreshFrame();
  const w = c.toWorld({ x: 0.9, y: 0.3, z: 1.2 }, { set(x, y, z) { return { x, y, z }; } });
  derby.events.length = 0;
  derby._damage(P, 'left', 30, null, w.x, w.y, w.z);
  const e = derby.events.find((v) => v.type === 'damage');
  assert.ok(Math.abs(e.lx - 0.9) < 1e-6 && Math.abs(e.ly - 0.3) < 1e-6 && Math.abs(e.lz - 1.2) < 1e-6, JSON.stringify(e));
  assert.equal(e.hp, 30);
  derby.events.length = 0;
  derby._damage(P, 'front', 30, null);                      // callers with no contact point still work
  assert.equal(derby.events.find((v) => v.type === 'damage').lx, undefined);
});

test('ramming a rival from behind reports a hit on my nose and on their tail', () => {
  const { track, car, derby } = arena();
  const r = derby.add(new Vehicle());
  placeOnTrack(r.car, track, track.progressAt(0, 0.65, -290), 0, 0);
  placeOnTrack(car, track, track.progressAt(0, 0.65, -297), 0, 22);
  car.vel.set(0, 0, 22);
  const seen = [];
  for (let i = 0; i < 360 && seen.length < 2; i++) {
    car.step(1 / 120, { throttle: 1, brake: 0, steer: 0, handbrake: false, boost: false }, track);
    derby.step(1 / 120, null);
    for (const e of derby.events) if (e.type === 'damage' && e.lx !== undefined) seen.push(e);
    derby.events.length = 0; car.events.length = 0;
  }
  assert.ok(seen.length >= 2, 'both cars were dented');
  const mine = seen.find((e) => e.isPlayer), theirs = seen.find((e) => !e.isPlayer);
  assert.ok(mine.lz > 1, 'my nose took it: ' + JSON.stringify(mine));
  assert.ok(theirs.lz < -1, 'their tail took it: ' + JSON.stringify(theirs));
});
