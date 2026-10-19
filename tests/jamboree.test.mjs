// Jamboree: every rival a different vehicle (own handling, size and toughness).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Track } from '../src/track.js';
import { Vehicle, CAR } from '../src/vehicle.js';
import { makeTemplate } from '../src/templates.js';
import { Derby, DERBY, placeOnRoad } from '../src/derby.js';
import { Driver } from '../src/ai.js';
import { VEHICLE_PHYSICS_PROFILES } from '../src/vehiclePhysicsProfiles.js';
import { placeOnTrack, DT } from './harness.mjs';

const merge = (a, b) => ({ ...a, ...b });
/** The same merge vehicleChoice.specForVehicle does, without its browser-only imports. */
function specOf(profile) {
  const p = VEHICLE_PHYSICS_PROFILES[profile];
  const s = { ...CAR, mass: p.mass ?? CAR.mass, frontWeight: p.frontWeight ?? CAR.frontWeight, wheelbase: p.wheelbase ?? CAR.wheelbase, track: p.track ?? CAR.track, wheelRadius: p.wheelRadius ?? CAR.wheelRadius, mountY: p.mountY ?? CAR.mountY };
  for (const k of ['inertia', 'susp', 'tyre', 'engine', 'aero', 'steer', 'boost']) s[k] = merge(CAR[k], p[k]);
  s.brakeBias = p.brakeBias ?? CAR.brakeBias; s.wallBounce = p.wallBounce ?? CAR.wallBounce; s.brakeTotal = (p.brakeG ?? 1.35) * s.mass * 9.81;
  return s;
}
const mulberry = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

test('jamboree: each rival is a different kind, and the bag does not repeat until it is used up', () => {
  const track = new Track(makeTemplate('speedway')), player = new Vehicle();
  placeOnTrack(player, track, 0, 0, 0);
  const derby = new Derby(); derby.enabled = true;
  derby.pool = ['car', 'escort', 'bmw', 'mini'].map((id) => ({ id, spec: specOf(id), damageMul: 1 }));
  derby.start(track, player, 4, 3, 'race');
  const ids = derby.fighters.filter((f) => !f.isPlayer).map((f) => f.vehicleId);
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, 4, 'every rival a different vehicle: ' + ids);
  const mini = derby.fighters.find((f) => f.vehicleId === 'mini'), car = derby.fighters.find((f) => f.vehicleId === 'car');
  assert.ok(mini.car.mass < car.car.mass, 'the Mini really is the lighter car');
  assert.notEqual(mini.car.spec, car.car.spec);
});

test('jamboree: toughness scales the damage a rival takes; no pool means the old behaviour', () => {
  const track = new Track(makeTemplate('speedway')), player = new Vehicle();
  placeOnTrack(player, track, 0, 0, 0);
  const derby = new Derby(); derby.enabled = true;
  derby.pool = [{ id: 'mobility-car', spec: specOf('mobility-car'), damageMul: 1.4 }];
  derby.start(track, player, 1, 3, 'race');
  assert.equal(derby.fighters[1].spec.mul.front, 1.4);
  derby.pool = null; derby.start(track, player, 1, 3, 'race');
  assert.equal(derby.fighters[1].vehicleId, null);
  assert.equal(derby.fighters[1].car.spec, CAR);
});

test('jamboree: every vehicle profile can be a rival - it drives a lap section under the AI without going wrong', () => {
  const track = new Track(makeTemplate('speedway'));
  for (const id of Object.keys(VEHICLE_PHYSICS_PROFILES)) {
    const car = new Vehicle(specOf(id)), drv = new Driver(mulberry(5), 0.5);
    placeOnRoad(car, track, 20, 0, 0);
    const ctx = { player: null, cars: [car] }, p0 = car.pos.clone();
    for (let i = 0; i < 25 / DT; i++) car.step(DT, i % 4 === 0 ? drv.drive(car, track, ctx, DT * 4) : drv.input, track);
    assert.ok(Number.isFinite(car.pos.x + car.pos.y + car.pos.z), id + ' went to NaN');
    assert.ok(Math.hypot(car.pos.x - p0.x, car.pos.z - p0.z) > 60, id + ' hardly moved: ' + Math.hypot(car.pos.x - p0.x, car.pos.z - p0.z).toFixed(0) + ' m');
    assert.ok(car.ay.y > 0.5, id + ' ended up on its side');
  }
});

test('jamboree: menu option, cars-only pool and phone cap are wired', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const choice = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  assert.ok(html.includes('<option value="jamboree">'));
  assert.ok(/JAMBOREE_EXCLUDE = \['bus', 'campervan', 'motor-home'\]/.test(choice));
  assert.ok(main.includes('list.slice(0, 4)') && main.includes("opts.mode === 'jamboree'"));
});
