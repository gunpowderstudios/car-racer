// Changing vehicle on the menu swaps the player's Vehicle in place (no page reload), so the menu music carries on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vehicle, CAR } from '../src/vehicle.js';

test('respec() rebuilds everything derived from the spec, exactly as a new Vehicle would', () => {
  const car = new Vehicle(CAR);
  const first = { mass: car.mass, rest: car.restHeight };
  const saved = structuredClone(CAR);
  Object.assign(CAR, { mass: 2800, wheelbase: 3.4, track: 1.9, frontWeight: 0.46, inertia: { x: 4000, y: 4800, z: 1500 }, mountY: CAR.mountY - 0.1 });
  car.respec();
  const fresh = new Vehicle(CAR);
  assert.equal(car.mass, 2800);
  assert.notEqual(car.mass, first.mass);
  assert.equal(car.restHeight, fresh.restHeight);
  assert.deepEqual(car.invI, fresh.invI);
  assert.deepEqual(car.wheels.map((w) => w.local), fresh.wheels.map((w) => w.local));
  assert.equal(car.hullWorld.length, fresh.hullWorld.length);
  Object.assign(CAR, saved);
});

test('the menu swaps the car in place and keeps the page (and its music) running', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const choice = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  assert.match(main, /function swapVehicle\(/);
  assert.match(main, /car\.respec\(\)/);
  assert.match(main, /onVehicleSwap\(swapVehicle\)/);
  assert.match(choice, /export function pickVehicle/);
  assert.match(choice, /window\.__swapVehicle/);
});

test('the player\'s wheels turn 15% further at low speed; a plain Vehicle (rivals, bots) keeps the old lock', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const veh = readFileSync(new URL('../src/vehicle.js', import.meta.url), 'utf8');
  assert.match(main, /const car = new Vehicle\(\); car\.lockMul = 1\.15;/);
  assert.match(veh, /this\.lockMul = 1;/);
  assert.match(veh, /Math\.min\(st\.max \* this\.lockMul, 0\.17/);
});
