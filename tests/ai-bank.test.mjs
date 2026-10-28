// Rival cars lean with a banked road (their anti-roll guard used to hold them level with the flat ground).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { makeTemplate } from '../src/templates.js';
import { Derby, placeOnRoad } from '../src/derby.js';
import { DT } from './harness.mjs';

test('a rival on a banked road leans with the road instead of standing level', () => {
  const track = new Track(makeTemplate('twister')), car = new Vehicle();
  placeOnRoad(car, track, track.startS(12), 0, 0);
  const derby = new Derby(); derby.enabled = true; derby.start(track, car, 1, 5);
  const idle = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false }, q = Track.newQuery(), ratios = [];
  for (let i = 0; i < 50 / DT; i++) {
    car.step(DT, idle, track); derby.step(DT); car.events.length = 0; derby.events.length = 0;
    if (i % 12 || i < 15 / DT) continue;
    const c = derby.rivals[0].car; track.query(c.pos.x, c.pos.y, c.pos.z, q);
    const rb = Math.asin(q.nx * q.lx + q.nz * q.lz) * 57.3, cb = Math.asin(c.ay.x * q.lx + c.ay.z * q.lz) * 57.3;
    if (Math.abs(rb) > 6) ratios.push(cb / rb);
  }
  ratios.sort((a, b) => a - b);
  assert.ok(ratios.length > 50, 'it drove over banked road');
  assert.ok(ratios[ratios.length >> 1] > 0.7, `the rival leaned only ${ratios[ratios.length >> 1].toFixed(2)} of the road's bank`);
});
