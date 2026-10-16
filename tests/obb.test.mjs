import test from 'node:test';
import assert from 'node:assert/strict';
import { obbOverlap } from '../src/obbOverlap.js';
import { vehiclePhysicsProfile } from '../src/vehiclePhysicsProfiles.js';

const fwd = (deg) => [Math.sin(deg * Math.PI / 180), Math.cos(deg * Math.PI / 180)];

test('a long van and a short car cannot merge nose-to-tail or side-on', () => {
  const van = { hl: 4.5 * 0.48, hw: 1.95 * 0.48 }, car = { hl: 2.9 * 0.48, hw: 1.5 * 0.48 };
  // car directly behind the van, both facing the same way: touching at van.hl + car.hl apart along z
  assert.equal(obbOverlap(0, -(van.hl + car.hl) - 0.01, fwd(0), fwd(0), car.hl, car.hw, van.hl, van.hw), null, 'just apart');
  const hit = obbOverlap(0, -(van.hl + car.hl) + 0.3, fwd(0), fwd(0), car.hl, car.hw, van.hl, van.hw);
  assert.ok(hit && Math.abs(hit.overlap - 0.3) < 1e-9 && hit.nz < 0, 'overlapping by 0.3 m, pushed back out the way it came');
  // the old width-only circles let the car sit 2.2 m from the van's centre; the van's own half length is 2.16, so that is inside the van
  assert.ok(obbOverlap(0, -2.2, fwd(0), fwd(0), car.hl, car.hw, van.hl, van.hw), 'a car whose centre is 2.2 m behind the van centre is inside it');
});

test('a car T-boned side-on pushes out sideways, not along the van', () => {
  const hit = obbOverlap(1.6, 0, fwd(90), fwd(0), 1.4, 0.7, 2.1, 0.95);   // car pointing sideways, 1.6 m to the van's side
  assert.ok(hit && Math.abs(hit.nx) > 0.99, 'normal is across the van');
});

test('every car has a believable footprint: wider than a bike, narrower than it is long', () => {
  for (const id of ['escort', 'bmw', 'mini', 'french-cheese', 'panda', 'volvo', 'saab', 'mobility-car', 'v8-pilot', 'campervan', 'bus', 'motor-home']) {
    const b = vehiclePhysicsProfile(id).body;
    assert.ok(b && b.width > 1.3 && b.width / b.length > 0.34 && b.width / b.length < 0.6, `${id}: ${b && b.width}x${b && b.length}`);
  }
});
