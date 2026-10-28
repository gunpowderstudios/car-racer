import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { Vehicle, CAR } from '../src/vehicle.js';
import { run, placeOnTrack, DRAG_DEF } from './harness.mjs';

// Multiplayer equaliser: whatever the engine, a car in a multiplayer race pulls the same as every other.
function drag(tweak) {
  const track = new Track(DRAG_DEF);
  const car = new Vehicle(); car.mpEqual = true;
  tweak?.(car);
  placeOnTrack(car, track, 1130, 0, 0);
  let t60 = null, top = 0;
  run(car, track, 22, (t, c) => { if (t60 === null && c.speed > 26.82) t60 = t; top = Math.max(top, c.speed); return { throttle: 1 }; });
  return { t60, top };
}
test('multiplayer cars all accelerate and top out the same, even with a feeble engine', () => {
  const a = drag();
  const b = drag((c) => { c.spec = { ...c.spec, engine: { ...c.spec.engine, peakTorque: 60 } }; });
  assert.ok(a.t60 > 3 && a.t60 < 6, `0-60 ${a.t60}`);
  assert.ok(a.top > 44 && a.top < 56, `top ${a.top}`);
  assert.ok(Math.abs(a.t60 - b.t60) < 0.5, `weak engine 0-60 ${b.t60} vs ${a.t60}`);
  assert.ok(Math.abs(a.top - b.top) < 3, `weak engine top ${b.top} vs ${a.top}`);
});
test('without the equaliser the weak engine is much slower', () => {
  const track = new Track(DRAG_DEF);
  const car = new Vehicle(); car.spec = { ...car.spec, engine: { ...car.spec.engine, peakTorque: 60 } };
  placeOnTrack(car, track, 1130, 0, 0);
  let top = 0; run(car, track, 12, (t, c) => { top = Math.max(top, c.speed); return { throttle: 1 }; });
  assert.ok(top < 40, `top ${top}`);
});
