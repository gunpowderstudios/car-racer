import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { Vehicle, CAR, HILL_CRAWL } from '../src/vehicle.js';
import { vehiclePhysicsProfile } from '../src/vehiclePhysicsProfiles.js';
import { Caravan, HITCH } from '../src/caravan.js';
import { placeOnTrack, DT } from './harness.mjs';

const spec = (id) => { const p = vehiclePhysicsProfile(id); return { ...CAR, ...p, inertia: { ...CAR.inertia, ...p.inertia }, susp: { ...CAR.susp, ...p.susp }, tyre: { ...CAR.tyre, ...p.tyre }, engine: { ...CAR.engine, ...p.engine }, aero: { ...CAR.aero, ...p.aero }, steer: { ...CAR.steer, ...p.steer }, boost: { ...CAR.boost, ...p.boost } }; };
// a straight road that climbs 110 m in about 110 m of road (the steepest part is about 36 degrees), then runs level along the top
const RISE = 110, LEN = 110;
const DEF = { name: 'Steep', width: 26, handles: [
  { x: 0, y: .65, z: -700 }, { x: 0, y: .65, z: -300 }, { x: 0, y: .65, z: -LEN / 2 - 40 }, { x: 0, y: .65 + RISE * .5, z: 0 }, { x: 0, y: .65 + RISE, z: LEN / 2 + 40 }, { x: 0, y: .65 + RISE, z: 400 }, { x: 0, y: .65 + RISE, z: 700 },
  { x: 250, y: .65 + RISE, z: 800 }, { x: 250, y: .65, z: -800 } ] };

test('about 20 mph on the speedometer is HILL_CRAWL, allowing for the game speed', () => {
  assert.ok(Math.abs(HILL_CRAWL * 1.1 * 2.237 - 20) < 0.5);
});

for (const id of ['escort', 'mini', 'volvo', 'mobility-car']) for (const tow of [false, true]) {
  test(`${id}${tow ? ' towing the caravan' : ''}: pulling away from a standstill on a ~36 degree hill, it gets up it and reaches 20 mph`, () => {
    const track = new Track(DEF);
    const car = new Vehicle(spec(id)); car.opts.stability = 1; car.opts.assist = 0.7;
    if (tow) { const van = new Caravan(HITCH[id]); van.track = track; car.tow = van; }
    placeOnTrack(car, track, track.progressAt(0, 0.65, -40), 0, 0); if (car.tow) car.tow.reset(car);
    let vmax = 0, top = false;
    for (let i = 0; i < 30 / DT; i++) {
      car.step(DT, { throttle: 1, brake: 0, steer: 0, handbrake: false, boost: false }, track); car.events.length = 0; if (car.tow) car.tow.events.length = 0;
      if (car.pos.z > -LEN / 2 - 30 && car.pos.z < LEN / 2 + 30) vmax = Math.max(vmax, car.speed);
      if (car.pos.z > LEN / 2 + 60) { top = true; break; }
    }
    assert.ok(top, `it only got to z = ${car.pos.z.toFixed(0)}`);
    assert.ok(vmax * 1.1 * 2.237 >= 20, `the best it did on the hill was ${(vmax * 1.1 * 2.237).toFixed(0)} mph`);
  });
}
