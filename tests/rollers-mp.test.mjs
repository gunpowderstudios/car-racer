import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { makeTemplate } from '../src/templates.js';

test('a boulder set off by one player is reported once, and another player\'s copy rolls the same one', () => {
  const t = new Track(makeTemplate('bluebell')), b = t.rollers && t.rollers[0];
  assert.ok(b, 'Bluebell Woods has boulders');
  const px = b.x0 + b.dx * b.reach, pz = b.z0 + b.dz * b.reach, sent = [];
  const car = { pos: { x: px - b.dx * 0 - 30, y: 0, z: pz - 30 }, vel: { x: 0, z: 0 } };
  const dx = px - car.pos.x, dz = pz - car.pos.z, d = Math.hypot(dx, dz);
  car.vel.x = dx / d * 40; car.vel.z = dz / d * 40;
  t.stepRollers(1 / 60, [car], (i) => sent.push(i));
  assert.ok(sent.length >= 1 && sent.every((i) => Number.isInteger(i)), 'the car coming fast sets one off and says which');
  assert.equal(new Set(sent).size, sent.length, 'each reported once');
  const t2 = new Track(makeTemplate('bluebell'));
  t2.rollerGo(0);
  assert.equal(t2.rollers[0].state, 'roll');
  t2.rollerGo(999); t2.rollerGo(-1);                                   // nonsense is ignored
  const state = t2.rollers[0].state; t2.rollerGo(0); assert.equal(t2.rollers[0].state, state, 'not restarted');
});
