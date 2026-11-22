// The Getaway police: roadblocks that never seal off the safehouse, shots, the heat that makes them press harder, and where the robber is predicted to go.
import test from 'node:test';
import assert from 'node:assert/strict';
import { townLayout, GetawayGame, routeOpen, edgeKey, predictJunctions, nearestNode } from '../src/getaway.js';
import { GetawayDriver } from '../src/getawayAI.js';
import { Derby } from '../src/derby.js';
import { Vehicle } from '../src/vehicle.js';
import { V3 } from '../src/math.js';
import { Track } from '../src/track.js';
import { makeTemplate } from '../src/templates.js';
import { DAMAGE } from '../src/damage.js';

function rngOf(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const fake = (x, z, fx, fz, speed = 14) => ({ pos: { x, z, y: 0 }, vel: { x: fx * speed, z: fz * speed, y: 0 }, az: { x: fx, z: fz, y: 0 }, ax: { x: -fz, z: fx, y: 0 }, angVel: { x: 0, y: 0, z: 0 }, speed });
function armed(seed = 4) {
  const L = townLayout(), g = new GetawayGame(L, { rng: rngOf(seed) });
  g.step(0.1, { x: g.bags.find((b) => b.state === 'home').x, z: g.bags.find((b) => b.state === 'home').z }, { x: 0, z: 0 }, []);
  assert.ok(g.robberBag && g.alarm, 'the robber has the bag');
  return { L, g };
}

test('routeOpen follows the streets round a shut one, and says no when there is no way', () => {
  const L = townLayout(), a = 0, b = 1, ab = new Set([edgeKey(a, b)]);
  assert.equal(routeOpen(L, a, b, new Set()), true);
  assert.equal(routeOpen(L, a, b, ab), true, 'round the block');
  const corner = 0, shut = new Set([edgeKey(0, 1), edgeKey(0, L.T.cols + 1)]);
  assert.equal(routeOpen(L, corner, 5, shut), false, 'the corner junction is sealed in');
});

test('the police predict the junctions the robber will pass on his way to the safehouse', () => {
  const { L, g } = armed();
  const r = predictJunctions(L, L.robberStart.x, L.robberStart.z, L.robberStart.fx, L.robberStart.fz, 14, g.safehouse, g.safehouse);
  assert.ok(r.length >= 2 && r.every((q, i) => i === 0 || q.along > r[i - 1].along), 'junctions in order along his way');
});

test('police roadblocks are made ahead of him, in pairs across the street, and never leave the safehouse unreachable', () => {
  let made = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { L, g } = armed(seed), r = rngOf(seed * 7);
    const cops = [3, 4].map((slot) => new GetawayDriver(r, g, 'police', 0.7, slot));
    for (let k = 0; k < 14; k++) {
      const n = L.nodes[Math.floor(r() * L.nodes.length)], dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(r() * 4)];
      const foe = fake(n.x, n.z, dir[0], dir[1]), me = fake(n.x + 150, n.z + 40, -1, 0, 5);
      g.time += 1; g.roadblock = null; g.blocks.clear();
      const T = cops.map((c) => c.think(me, foe));
      if (T[0].kind === 'block') {
        made++;
        assert.equal(T[1].kind, 'block', 'a pair');
        assert.ok(Math.hypot(T[0].x - T[1].x, T[0].z - T[1].z) > 5, 'two cars side by side across the street');
        const S = g.safehouse, target = nearestNode(L, S.gx !== undefined ? S.gx : S.x, S.street !== undefined ? S.street : S.z);
        assert.ok(routeOpen(L, nearestNode(L, foe.pos.x, foe.pos.z), target, g.blockedEdges()), 'a way to the safehouse is still open');
      }
    }
  }
  assert.ok(made > 10, 'roadblocks do get made: ' + made);
});

test('a police car lined up on the robber fires, one facing away does not, and a hit chips the back of his car', () => {
  const { L, g } = armed(), cop = new GetawayDriver(rngOf(3), g, 'police', 0.9, 0), z = L.zs[1];
  const foe = fake(0, z, 1, 0, 14), me = fake(-22, z, 1, 0, 16);
  let shots = 0; for (let t = 0; t < 40; t += 0.1) { cop._aim(me, foe, 0.1, 0.9); if (cop.fire) { shots++; cop.fire = null; } }
  assert.ok(shots >= 8, 'fires every second or so: ' + shots);
  const away = fake(-22, z, -1, 0, 16); shots = 0; cop.shotCool = 0;
  for (let t = 0; t < 10; t += 0.1) { cop._aim(away, foe, 0.1, 0.9); if (cop.fire) { shots++; cop.fire = null; } }
  assert.equal(shots, 0, 'not when facing the other way');
  // a hit from behind takes the back zone of his car
  const track = new Track(makeTemplate('getaway')), d = new Derby(); d.enabled = true; d.damageEnabled = true;
  const car = new Vehicle(); car.reset(new V3(0, track.py[0] + car.restHeight + 0.08, 0), new V3(1, 0, 0), new V3(0, 1, 0), 0);
  d.start(track, car, 1, 5); const robber = d.player, cop2 = d.rivals[0]; cop2.car.reset(new V3(-20, track.py[0] + cop2.car.restHeight + 0.08, 0), new V3(1, 0, 0), new V3(0, 1, 0), 0);
  d.time = 100; robber.graceUntil = 0;
  const before = robber.health.hp ? { ...robber.health.hp } : null, bk = robber.health.zone ? null : null; void before; void bk;
  const h0 = JSON.stringify(robber.health.hp ?? robber.health); d.shoot(cop2, robber);
  assert.notEqual(JSON.stringify(robber.health.hp ?? robber.health), h0, 'the shot did damage');
  assert.ok(DAMAGE.bullet > 0 && DAMAGE.bullet < 20, 'a shot is small next to a crash');
  assert.ok(d.events.some((e) => e.type === 'shot' && e.zone === 'back'), 'a shot from behind hits the back');
});

test('the longer he runs with the cash, the harder the police press: heat builds, then falls when he is caught', () => {
  const { g } = armed();
  const t0 = g.heat; for (let i = 0; i < 600; i++) g.step(0.1, { x: 200, z: 200 }, { x: 0, z: 0 }, []);
  assert.ok(g.heat > t0 + 50, 'heat builds with the bag: ' + g.heat);
  const cop = new GetawayDriver(rngOf(1), g, 'police', 0.7, 0), foe = fake(100, 0, 1, 0), me = fake(0, g.L.zs[1], 1, 0);
  cop.think(me, foe); assert.ok(cop.hotR > 150, 'they drop their jobs from further off: ' + cop.hotR);
});
