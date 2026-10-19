import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { Vehicle, CAR } from '../src/vehicle.js';
import { Caravan, HITCH } from '../src/caravan.js';
import { placeOnTrack, DRAG_DEF, DT } from './harness.mjs';

test('a caravan stays locked to the car through a jump: it rides with the tail and never flies up on its own', () => {
  const track = new Track(DRAG_DEF), car = new Vehicle(CAR), van = new Caravan(HITCH.escort); van.track = track; car.tow = van;
  placeOnTrack(car, track, track.progressAt(0, 0.65, -900), 0, 25); van.reset(car);
  let maxPitch = 0, maxGap = 0, aloft = 0;
  for (let i = 0; i < 6 / DT; i++) {
    const t = i * DT; if (Math.abs(t - 2) < DT / 2) { car.vel.y = 9; car.pos.y += 0.1; }       // a jump
    car.step(DT, { throttle: 0.5, brake: 0, steer: 0, handbrake: false, boost: false }, track); car.events.length = 0;
    if (t > 2.2 && t < 3.6) {
      const ball = van.ballOn(car), drawY = van.pos.y + van.spec.hitchH + Math.sin(van.pitch) * van.spec.dAxle;
      maxPitch = Math.max(maxPitch, Math.abs(van.pitch)); maxGap = Math.max(maxGap, Math.abs(drawY - ball.y)); if (!van.onGround) aloft++;
    }
  }
  assert.ok(aloft > 50, 'the caravan was in the air with the car');
  assert.ok(maxGap < 0.15, 'drawbar stays on the ball (gap ' + maxGap.toFixed(2) + ' m)');
  assert.ok(maxPitch < 0.3, 'the nose does not swing up (pitch ' + maxPitch.toFixed(2) + ' rad)');
});
