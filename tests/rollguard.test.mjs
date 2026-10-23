// A drift never rolls the car, and a caravan no longer tips it over (Vehicle._rollGuard).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { Vehicle, CAR } from '../src/vehicle.js';
import { vehiclePhysicsProfile } from '../src/vehiclePhysicsProfiles.js';
import { Caravan, HITCH } from '../src/caravan.js';
import { placeOnTrack, DRAG_DEF, DT } from './harness.mjs';

const m = (a, b) => ({ ...a, ...b });
function spec(id) { const p = vehiclePhysicsProfile(id); return { ...CAR, ...p, inertia: m(CAR.inertia, p.inertia), susp: m(CAR.susp, p.susp), tyre: m(CAR.tyre, p.tyre), engine: m(CAR.engine, p.engine), aero: m(CAR.aero, p.aero), steer: m(CAR.steer, p.steer), boost: m(CAR.boost, p.boost) }; }
function run(id, tow, speed, kind) {
  const track = new Track(DRAG_DEF), car = new Vehicle(spec(id)); car.opts.stability = 1; car.opts.assist = 0.7;
  const van = new Caravan(HITCH[id] || HITCH.car); van.track = track; if (tow) car.tow = van;
  placeOnTrack(car, track, track.progressAt(0, 0.65, -900), 0, speed); if (tow) van.reset(car);
  let minUp = 1;
  for (let i = 0; i < 10 / DT; i++) {
    const t = i * DT; let steer = 0, hand = false;
    if (kind === 'weave') steer = t > 2 ? Math.sin((t - 2) * 2.6) : 0;
    if (kind === 'drift') { steer = t > 2 ? 0.8 : 0; hand = t > 2 && t < 5; }
    car.step(DT, { throttle: car.speed < speed ? 0.8 : 0.1, brake: 0, steer, handbrake: hand, boost: false }, track); car.events.length = 0;
    minUp = Math.min(minUp, car.ay.y);
  }
  return minUp;
}

test('a drift never rolls the car, whatever the car', () => {
  for (const id of ['escort', 'car', 'mini']) for (const speed of [22, 30]) {
    const up = run(id, false, speed, 'drift');
    assert.ok(up > 0.9, `${id} at ${speed} leaned over to ${up.toFixed(2)} in a drift`);
  }
});

test('a caravan does not roll the car over in a weave (it used to far more than the car alone)', () => {
  for (const id of ['escort', 'car', 'mini']) {
    const up = run(id, true, 22, 'weave');
    assert.ok(up > 0.8, `${id} towing leaned over to ${up.toFixed(2)}`);
  }
});

test('without a drift or a caravan a hard weave can still roll a car (the guard is not on all the time)', () => {
  const worst = Math.min(...[22, 24, 26].map((v) => run('escort', false, v, 'weave')));      // (a gentler engine than it once had, so a touch more speed to get it rolling)
  assert.ok(worst < 0.5, `the escort only leaned to ${worst.toFixed(2)}`);
});
