// Fire pits placed from the editor: they flare on a cycle and throw a car that is above them into the air.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeProps } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { makeTemplate } from '../src/templates.js';
import { FirePits } from '../src/firePits.js';
import { placeOnRoad } from '../src/derby.js';
import { DT } from './harness.mjs';

test('a fire pit survives normalizeProps', () => {
  assert.equal(normalizeProps([{ type: 'fire', x: 1, z: 2, y: 0 }]).length, 1);
});

test('a pit flares, makes a sound cue, and launches a car sitting on it', () => {
  const track = new Track(makeTemplate('speedway')), car = new Vehicle(), f = track.frameAt(130);
  const pits = new FirePits(); track.def.props = [{ type: 'fire', x: f.x, z: f.z, y: f.y }]; pits.load(track);
  assert.equal(pits.pits.length, 1);
  placeOnRoad(car, track, 130, 0, 0);
  let cues = 0, maxY = -1e9;
  for (let i = 0; i < 14 / DT; i++) {
    car.step(DT, { throttle: 0, brake: 0, steer: 0, handbrake: true }, track); pits.step(DT, car, null);
    for (const e of pits.events) if (e.type === 'sfx') cues++; pits.events.length = 0; car.events.length = 0;
    maxY = Math.max(maxY, car.pos.y - f.y);
  }
  assert.ok(cues >= 2, 'burst cues ' + cues);
  assert.ok(maxY > 3, 'launched ' + maxY.toFixed(2));
});
