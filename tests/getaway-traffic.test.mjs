// The Getaway's other cars drive like a town: traffic and the police on patrol keep to the streets, stop for each other and wait their turn at junctions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { V3 } from '../src/math.js';
import { makeTemplate } from '../src/templates.js';
import { Derby } from '../src/derby.js';
import { townLayout, GetawayGame, rescuePose } from '../src/getaway.js';
import { GetawayDriver, TrafficDriver } from '../src/getawayAI.js';

const DT = 1 / 120;
function rngOf(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function town(seed) {
  const L = townLayout(), track = new Track(makeTemplate('getaway')), game = new GetawayGame(L, { rng: rngOf(seed) });
  const car = new Vehicle(); car.reset(new V3(0, track.py[0] + car.restHeight + 0.08, 150), new V3(1, 0, 0), new V3(0, 1, 0), 0);      // (the robber waits out of the way)
  const derby = new Derby(); derby.enabled = true; derby.damageEnabled = false;
  derby.getawaySetup = { L, role: 'police', extraPolice: 6, kind: null, traffic: 11, makeTraffic: (r) => new TrafficDriver(r, game), makeDriver: (r) => new GetawayDriver(r, game, 'police', 0.7, 0), rescue: (c, o) => { const p = rescuePose(L, c.pos.x, c.pos.z, o); c.reset(new V3(p.x, track.py[0] + c.restHeight + 0.08, p.z), new V3(p.fx, 0, p.fz), new V3(0, 1, 0), 0); } };
  derby.start(track, car, 1, 5);
  return { L, track, game, car, derby };
}

test('traffic and police on patrol: no walls, hardly any bumps, nobody inside a building, and they stop at junctions', () => {
  const { L, track, car, derby } = town(1);
  let walls = 0, bumps = 0, inside = 0, stops = 0;
  const wasStopped = new Set();
  for (let i = 0; i < 90 / DT; i++) {
    car.step(DT, { throttle: 0, brake: 1, steer: 0, handbrake: true, boost: false }, track);
    derby.step(DT);
    for (const e of derby.events) if (e.type === 'hit' && e.speed > 2) { if (e.kind === 'car') bumps++; else walls++; }
    derby.events.length = 0;
    if (i % 6 === 0) for (const f of derby.rivals) {
      if (i % 60 === 0 && L.boxes.some((b) => f.car.pos.x > b.x0 + 0.5 && f.car.pos.x < b.x1 - 0.5 && f.car.pos.z > b.z0 + 0.5 && f.car.pos.z < b.z1 - 0.5)) inside++;
      const d = f.driver; if (d.jxWait > 0.3 && !wasStopped.has(f.id + ':' + d.to)) { wasStopped.add(f.id + ':' + d.to); stops++; }
    }
  }
  assert.equal(inside, 0, 'a car ended up inside a building');
  assert.ok(walls <= 3, 'cars scraped the buildings ' + walls + ' times');
  assert.ok(bumps <= 4, 'cars bumped each other ' + bumps + ' times');
  assert.ok(stops >= 3, 'cars wait at the junction line (' + stops + ')');
});

test('police with nothing to chase spread out over the town instead of waiting at the banks', () => {
  const { track, car, derby } = town(2);
  for (let i = 0; i < 60 / DT; i++) { car.step(DT, { throttle: 0, brake: 1, steer: 0, handbrake: true, boost: false }, track); derby.step(DT); derby.events.length = 0; }
  const cops = derby.rivals.filter((f) => f.cop); assert.equal(cops.length, 7);
  let sum = 0, n = 0; for (let a = 0; a < cops.length; a++) for (let b = a + 1; b < cops.length; b++) { sum += Math.hypot(cops[a].car.pos.x - cops[b].car.pos.x, cops[a].car.pos.z - cops[b].car.pos.z); n++; }
  assert.ok(sum / n > 120, 'the police cars are bunched up (average gap ' + (sum / n).toFixed(0) + ' m)');
  assert.ok(cops.every((f) => f.driver.goalKind === 'drive'), 'patrolling police wander the streets');
  assert.ok(cops.filter((f) => f.car.speed > 3).length >= 3, 'most of them are moving');
});
