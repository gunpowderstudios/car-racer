import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { Vehicle, CAR } from '../src/vehicle.js';
import { vehiclePhysicsProfile } from '../src/vehiclePhysicsProfiles.js';
import { Caravan, HITCH } from '../src/caravan.js';
import { placeOnTrack, DRAG_DEF, DT } from './harness.mjs';

// the 70s Saloon, as the game builds it
const p = vehiclePhysicsProfile('escort');
const ESCORT = { ...CAR, ...p, inertia: { ...CAR.inertia, ...p.inertia }, susp: { ...CAR.susp, ...p.susp }, tyre: { ...CAR.tyre, ...p.tyre }, engine: { ...CAR.engine, ...p.engine }, aero: { ...CAR.aero, ...p.aero }, steer: { ...CAR.steer, ...p.steer }, boost: { ...CAR.boost, ...p.boost } };

function setup(tow = true, speed = 0) {
  const track = new Track(DRAG_DEF), car = new Vehicle(ESCORT); car.opts.stability = 1; car.opts.assist = 0.7;
  const van = new Caravan(HITCH.escort); van.track = track;
  if (tow) car.tow = van;
  placeOnTrack(car, track, track.progressAt(0, 0.65, -900), 0, speed);
  if (tow) van.reset(car);
  return { track, car, van };
}
function drive(s, seconds, inputFn) {
  const out = { maxDist: 0, maxFold: 0, bad: false };
  for (let i = 0; i < seconds / DT; i++) {
    const t = i * DT, inp = inputFn(t, s.car);
    s.car.step(DT, { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, ...inp }, s.track); s.car.events.length = 0;
    if (s.car.tow) {
      const v = s.van; out.maxDist = Math.max(out.maxDist, v.dist); out.maxFold = Math.max(out.maxFold, Math.abs(v.jackknife));
      if (![v.pos.x, v.pos.y, v.pos.z, v.yaw].every(Number.isFinite) || ![s.car.pos.x, s.car.pos.z].every(Number.isFinite)) out.bad = true;
    }
  }
  return out;
}
const cruise = (target) => (t, c) => ({ throttle: c.speed < target ? 0.8 : 0.1, steer: 0 });

test('a caravan starts straight behind the car and stays straight and attached on a straight road', () => {
  const s = setup(true, 20);
  const r = drive(s, 12, cruise(25));
  assert.equal(r.bad, false);
  assert.ok(r.maxDist < 0.25, `drawbar stretched ${r.maxDist.toFixed(2)} m`);
  assert.ok(Math.abs(s.van.jackknife) < 0.05, `fold ${s.van.jackknife.toFixed(3)}`);
  assert.ok(s.van.onGround);
  const behind = (s.car.pos.x - s.van.pos.x) * s.car.az.x + (s.car.pos.z - s.van.pos.z) * s.car.az.z;
  assert.ok(behind > 2.9 && behind < 6.5, `caravan axle is ${behind.toFixed(2)} m behind the car's centre`);
});

test('towing a caravan makes the car slower to pick up speed', () => {
  const a = setup(false), b = setup(true);
  drive(a, 8, () => ({ throttle: 1 })); drive(b, 8, () => ({ throttle: 1 }));
  assert.ok(b.car.speed < a.car.speed - 0.8, `with ${b.car.speed.toFixed(1)} m/s, without ${a.car.speed.toFixed(1)} m/s`);
});

test('a swing set off by a quick steer dies away again', () => {
  const s = setup(true, 22);
  let worst = 0;
  const r = drive(s, 14, (t, c) => { if (t > 1 && t < 2) { worst = Math.max(worst, Math.abs(s.van.jackknife)); return { throttle: 0.5, steer: 0.6 }; } return cruise(22)(t, c); });
  assert.equal(r.bad, false);
  assert.ok(r.maxFold > 0.03, 'the steer should swing the caravan at least a little');
  assert.ok(Math.abs(s.van.jackknife) < 0.08, `still folded ${s.van.jackknife.toFixed(3)} rad after 12 s`);
});

test('weaving at speed with a caravan never blows up or folds right round', () => {
  const s = setup(true, 25);
  const r = drive(s, 25, (t, c) => ({ throttle: c.speed < 32 ? 0.9 : 0.2, steer: 0.35 * Math.sin(t * 1.6) }));
  assert.equal(r.bad, false);
  assert.ok(r.maxDist < 1.0, `drawbar stretched ${r.maxDist.toFixed(2)} m`);
  assert.ok(r.maxFold < 1.6, `folded ${r.maxFold.toFixed(2)} rad`);
  assert.ok(Math.abs(Math.atan2(s.car.az.x, s.car.az.z)) < 2.2, 'the car should not be spun right round by the caravan');
});

test('a caravan goes back behind the car when the car is put back on the road', () => {
  const s = setup(true, 20);
  drive(s, 4, cruise(25));
  placeOnTrack(s.car, s.track, s.track.progressAt(0, 0.65, 100), 0, 0);
  assert.ok(Math.hypot(s.van.pos.x - s.car.pos.x, s.van.pos.z - s.car.pos.z) < 7);
  assert.ok(Math.abs(s.van.jackknife) < 0.01);
});

test('the Tow a caravan option is on the home screen, saved, for the saloon cars (70s Saloon, Volvo, Saab, BMW), and not used in multiplayer', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(html, /id="opt-caravan" type="checkbox"/);
  assert.match(main, /TOW_CARS\.includes\(selectedVehicle\(\)\.id\) && !net/);
  assert.deepEqual(Object.keys(HITCH).sort(), ['bmw', 'escort', 'saab', 'volvo']);
});
