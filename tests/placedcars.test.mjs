// Cars placed on the track in the editor: parked ones stay put, driving ones race round, and neither is a rival.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeProps } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { makeTemplate } from '../src/templates.js';
import { Derby, placeOnRoad } from '../src/derby.js';
import { packTrack, unpackTrack } from '../src/trackLink.js';
import { normalizeTrack } from '../src/track.js';
import { DT } from './harness.mjs';
import '../src/derbyOffTrackRecovery.js';

test('a vehicle prop keeps its mode, facing and car through normalizeProps and a share link', async () => {
  const d = normalizeTrack(makeTemplate('speedway'));
  d.props = [{ type: 'vehicle', x: 10, z: 5, y: 0.6, mode: 'driving', yaw: 1.57, car: 'bus' }, { type: 'vehicle', x: 20, z: 5, y: 0.6, yaw: -3.0 }, { type: 'vehicle', x: 30, z: 5, mode: 'static', car: 'bad id!' }];
  d.props = normalizeProps(d.props);
  assert.deepEqual(d.props.map((p) => p.mode), ['driving', 'static', 'static']);
  assert.equal(d.props[0].car, 'bus'); assert.equal(d.props[2].car, undefined);
  const back = await unpackTrack(await packTrack(d));
  assert.deepEqual(back.props.map((p) => [p.type, p.mode, p.car || null]), [['vehicle', 'driving', 'bus'], ['vehicle', 'static', null], ['vehicle', 'static', null]]);
  assert.ok(Math.abs(back.props[0].yaw - 1.57) < 0.02 && Math.abs(back.props[1].yaw + 3.0) < 0.02);
});

test('placed cars: parked stays still, driving drives, and neither counts as a rival', () => {
  const track = new Track(makeTemplate('speedway')), me = new Vehicle(), derby = new Derby();
  derby.enabled = true; derby.damageEnabled = true; derby.start(track, me, 0, 7, 'race');
  placeOnRoad(me, track, 10, 0, 0);
  const a = track.frameAt(300), b = track.frameAt(500);
  const n = derby.addPlaced([{ type: 'vehicle', x: a.x, z: a.z, y: a.y, mode: 'static', yaw: 0.5 }, { type: 'vehicle', x: b.x, z: b.z, y: b.y, mode: 'driving', yaw: 0 }]);
  assert.equal(n, 2);
  assert.equal(derby.rivals.length, 0); assert.equal(derby.alive, 0); assert.equal(derby.fighters.length, 3);
  const [park, drive] = derby.fighters.filter((f) => f.placed);
  const p0 = { x: park.car.pos.x, z: park.car.pos.z }, d0 = { x: drive.car.pos.x, z: drive.car.pos.z };
  for (let i = 0; i < 8 / DT; i++) { me.step(DT, { throttle: 0, brake: 0, steer: 0, handbrake: true }, track); derby.step(DT); me.events.length = 0; }
  assert.ok(Math.hypot(park.car.pos.x - p0.x, park.car.pos.z - p0.z) < 0.5, 'parked car moved');
  assert.ok(Math.hypot(drive.car.pos.x - d0.x, drive.car.pos.z - d0.z) > 30, 'driving car did not drive');
  assert.equal(derby.rivals.length, 0);
});

test('a placed car with no car chosen asks for the player\'s own ("same as your car"), a chosen one for its own', () => {
  const track = new Track(makeTemplate('speedway')), me = new Vehicle(), derby = new Derby(), asked = [];
  derby.enabled = true; derby.start(track, me, 0, 7, 'race'); placeOnRoad(me, track, 10, 0, 0);
  const a = track.frameAt(300), b = track.frameAt(400);
  derby.addPlaced([{ type: 'vehicle', x: a.x, z: a.z, y: a.y, mode: 'static' }, { type: 'vehicle', x: b.x, z: b.z, y: b.y, mode: 'static', car: 'bus' }], (id) => { asked.push(id); return null; });
  assert.deepEqual(asked, ['', 'bus']);
});
