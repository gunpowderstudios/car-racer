// Rivals steer round explosive drums instead of ploughing into them (they were getting blown up far too easily).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { makeTemplate } from '../src/templates.js';
import { Driver } from '../src/ai.js';
import { ArenaDriver } from '../src/arena.js';
import { Props } from '../src/props.js';
import { placeOnRoad } from '../src/derby.js';
import { DT } from './harness.mjs';

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** One road rival at full chat down 'speedway' with a single drum `lat` metres off the centre line, 90 m ahead. */
function roadPass(lat, cruise = 42, v0 = 38) {
  const track = new Track(makeTemplate('speedway')), car = new Vehicle(); car.opts.assist = 0.7;
  const s0 = 100, f = track.frameAt(s0 + 70), bx = f.x + f.lx * lat, bz = f.z + f.lz * lat;
  const props = new Props(); props.load(track, [{ type: 'barrel', x: bx, z: bz, y: f.y }], 1, 1, 1);
  placeOnRoad(car, track, s0, 0, v0);
  const drv = new Driver(mulberry(5), 0.5); drv.cruise = cruise;
  let closest = 99, blasts = 0, vAt = 99;
  for (let i = 0; i < 8 / DT; i++) {
    if (i % 4 === 0) drv.drive(car, track, { player: null, cars: [car], barrels: props.barrels, skill: 0.6 }, DT * 4);
    car.step(DT, drv.input, track); props.step(DT, car);
    const d = Math.hypot(car.pos.x - bx, car.pos.z - bz);
    if (d < closest) { closest = d; vAt = Math.hypot(car.vel.x, car.vel.z); }
    blasts += props.events.filter((e) => e.type === 'blast').length; props.events.length = 0; car.events.length = 0;
  }
  return { closest, blasts, vAt };
}

test('a road rival swerves round a drum sitting in its way - whichever side of the road it is on - and does not set it off', () => {
  for (const lat of [0, 0.5, -0.5, 1.5, -1.5]) {
    const r = roadPass(lat);
    assert.equal(r.blasts, 0, `drum at ${lat} went off`);
    assert.ok(r.closest > 1.3, `drum at ${lat}: passed within ${r.closest.toFixed(2)} m`);
  }
});

test('an arena rival that is charging at a target steers round a drum that is in the way', () => {
  for (const side of [0, 0.7, -0.7]) {
    const def = makeTemplate('oval'), track = new Track(def), car = new Vehicle();
    car.reset(car.pos.set(-50, 0.7, 0), { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0);
    const props = new Props(); props.load(track, [{ type: 'barrel', x: -20, z: side, y: 0 }], 3, 1.5, 1.5);
    const target = new Vehicle(); target.pos.set(40, 0.7, 0);
    const drv = new ArenaDriver(mulberry(3), 0.9);
    let blasts = 0, closest = 99;
    for (let i = 0; i < 5 / DT; i++) {
      if (i % 4 === 0) drv.drive(car, track, { player: target, cars: [car, target], barrels: props.barrels, skill: 0.6 }, DT * 4);
      car.step(DT, drv.input, track); props.step(DT, car);
      closest = Math.min(closest, Math.hypot(car.pos.x + 20, car.pos.z - side));
      blasts += props.events.filter((e) => e.type === 'blast').length; props.events.length = 0; car.events.length = 0;
    }
    assert.equal(blasts, 0, `drum ${side} m off the line went off`);
    assert.ok(closest > 1.5, 'passed within ' + closest.toFixed(2));
  }
});
