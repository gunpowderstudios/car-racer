// A wheel can come off on its own, where the car was hit, and the body then sits down on that corner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Track } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { Derby, DERBY } from '../src/derby.js';
import { makeRandomTrack } from '../src/templates.js';
import { placeOnTrack, DT } from './harness.mjs';

const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
function settle(lost) {
  const track = new Track(makeRandomTrack(5)), car = new Vehicle();
  placeOnTrack(car, track, 40, 0, 0);
  for (const i of lost) car.wheels[i].lost = true;
  for (let k = 0; k < 4 / DT; k++) car.step(DT, IDLE, track);
  return { y: car.pos.y, roll: car.ax.y, pitch: car.az.y };
}

test('with all four wheels off the body sits lower on the road', () => {
  const on = settle([]), off = settle([0, 1, 2, 3]);
  assert.ok(on.y - off.y > 0.12, `dropped ${(on.y - off.y).toFixed(3)} m`);
});

test('losing one wheel drops that corner: the car leans towards it', () => {
  const rr = settle([3]), on = settle([]);
  assert.ok(rr.y < on.y, 'it sits lower');
  assert.ok(rr.roll - on.roll > 0.004 || rr.pitch - on.pitch < -0.004, 'and tilts');
});

test('a big hit on the rear right can knock the rear right wheel off, and only that one', () => {
  const track = new Track(makeRandomTrack(5)), car = new Vehicle();
  placeOnTrack(car, track, 40, 0, 0);
  const d = new Derby(); d.enabled = true; d.repairsMax = 0; d.start(track, car, 0, 7, 'race'); d.time = DERBY.grace + 1;
  for (let k = 0; k < 40; k++) car.step(DT, IDLE, track);
  const f = d.player, w3 = car.wheels[3];
  d._damage(f, 'back', f.health.max.back, null, w3.mount.x, w3.mount.y, w3.mount.z);   // the zone's whole armour in one blow, right at that wheel
  const lost = car.wheels.map((w) => w.lost);
  assert.deepEqual(lost, [false, false, false, true]);
  assert.ok(d.events.some((e) => e.type === 'wheelOff' && e.i === 3));
  assert.equal(f.health.wrecked, null, 'the car is not wrecked');
  d._wheelsOn(f);
  assert.ok(!car.wheelsLost);
});

test('the wheels have a way off one at a time, and the safety nets leave a car with a lost wheel alone', () => {
  const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
  assert.match(src('carVisual.js'), /detachWheel\(i\)/);
  assert.match(src('wheelDebris.js'), /launchOne\(/);
  assert.match(src('main.js'), /!f\.car\.wheelsLost\) v\.restoreWheels/);
  assert.match(src('replayMode.js'), /e\.type === 'wheelOff'/);
});
