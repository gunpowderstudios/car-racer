import test from 'node:test';
import assert from 'node:assert/strict';
import { signalState, signalLayout, carState, walkFraction, signalClock, SIGNAL } from '../src/signals.js';
import { makeTemplate } from '../src/templates.js';
import { Track, normalizeTrack } from '../src/track.js';
import { Derby } from '../src/derby.js';
import { Vehicle } from '../src/vehicle.js';
import { Driver } from '../src/ai.js';

test('lights cycle green, amber, red on a fixed timetable', () => {
  const c = SIGNAL.lights;
  assert.equal(signalState('lights', 0), 'green');
  assert.equal(signalState('lights', c.green + 0.1), 'amber');
  assert.equal(signalState('lights', c.green + c.amber + 0.1), 'red');
  assert.equal(signalState('lights', c.green + c.amber + c.red + 0.1), 'green');
});

function withSignals(props) {
  const base = makeTemplate('oval' === 'x' ? 'oval' : 'speedway');
  return new Track(normalizeTrack({ ...base, props }));
}

test('props of type lights and crossing are kept, with the way the road runs, and a crossing next to lights shares them', () => {
  const t0 = withSignals([]);
  const i = 40, a = { type: 'lights', x: t0.px[i], z: t0.pz[i], y: t0.py[i], rot: Math.round(Math.atan2(t0.tx[i], t0.tz[i]) * 180 / Math.PI + 360) % 360 };
  const b = { type: 'crossing', x: t0.px[i + 8], z: t0.pz[i + 8], y: t0.py[i + 8], rot: a.rot };
  const t = withSignals([a, b]);
  assert.deepEqual(t.def.props.map((p) => p.type), ['lights', 'crossing']);
  const L = signalLayout(t);
  assert.equal(L.length, 2); assert.equal(L[1].partner, 0);
  // while the lights are red people walk, and the traffic is told to stop at both
  const red = SIGNAL.lights.green + SIGNAL.lights.amber + 1 - L[0].phase;
  assert.equal(carState(L, L[0], red), 'red'); assert.equal(carState(L, L[1], red), 'red');
  assert.ok(walkFraction(L, L[1], red) >= 0);
  assert.equal(walkFraction(L, L[1], red - 20 + 0), walkFraction(L, L[1], red - 20));
});

test('vehicle modes survive normalising: parked, regular, race, and the old driving', () => {
  const t = withSignals([]);
  const d = normalizeTrack({ ...t.def, props: ['static', 'regular', 'race', 'driving', 'nonsense'].map((mode, k) => ({ type: 'vehicle', mode, x: k * 10, z: 0, y: 0, yaw: 0 })) });
  assert.deepEqual(d.props.map((p) => p.mode), ['static', 'regular', 'race', 'driving', 'static']);
});

test('a regular car stops at a red light and sets off again when it is green', () => {
  const t0 = withSignals([]);
  const i = 60, rot = Math.round(Math.atan2(t0.tx[i + 40], t0.tz[i + 40]) * 180 / Math.PI + 360) % 360;
  const lx = t0.px[i + 40], lz = t0.pz[i + 40];
  const track = withSignals([{ type: 'lights', x: lx, z: lz, y: t0.py[i + 40], rot }]);
  const sg = signalLayout(track)[0];
  const redAt = SIGNAL.lights.green + SIGNAL.lights.amber + 0.5 - sg.phase;
  const derby = new Derby(); derby.enabled = true; const player = new Vehicle(); derby.start(track, player, 0, 5, 'race');
  derby.addPlaced([{ type: 'vehicle', mode: 'regular', x: t0.px[i], z: t0.pz[i], y: t0.py[i], yaw: 0 }]);
  const f = derby.fighters.find((q) => q.placed);
  const dist = (c) => (lx - c.pos.x) * sg.fx + (lz - c.pos.z) * sg.fz;
  signalClock.fixed = redAt;
  let min = 1e9;
  for (let k = 0; k < 60 * 14; k++) { derby.step(1 / 60, null); min = Math.min(min, dist(f.car)); if (k > 60 * 9) break; }
  assert.ok(f.car.speed < 1.5, `it should be standing at the red light (speed ${f.car.speed.toFixed(1)})`);
  assert.ok(dist(f.car) > 2.5, `it must stop before the light (${dist(f.car).toFixed(1)} m short)`);
  assert.ok(!f.gone && !f.wrecked);
  signalClock.fixed = redAt + SIGNAL.lights.red + 1;                           // green again
  for (let k = 0; k < 60 * 6; k++) derby.step(1 / 60, null);
  assert.ok(f.car.speed > 5 || dist(f.car) < 0, `it should set off on green (speed ${f.car.speed.toFixed(1)})`);
  signalClock.fixed = null;
});
