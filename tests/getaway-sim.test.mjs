// The Getaway played by two computer drivers on the real physics: neither gets stuck in a building and the rules play out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { V3 } from '../src/math.js';
import { makeTemplate } from '../src/templates.js';
import { Derby } from '../src/derby.js';
import { townLayout, GetawayGame, rescuePose } from '../src/getaway.js';
import { GetawayDriver } from '../src/getawayAI.js';

const DT = 1 / 120;
function rngOf(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let S_rescue = null;
function setup(aiRole, seed = 3) {
  const L = townLayout(), track = new Track(makeTemplate('getaway')), game = new GetawayGame(L, { rng: rngOf(seed) });
  const mine = aiRole === 'robber' ? 'police' : 'robber', st = mine === 'robber' ? L.robberStart : L.policeStart;
  const car = new Vehicle(); car.reset(new V3(st.x, track.py[0] + car.restHeight + 0.08, st.z), new V3(st.fx, 0, st.fz), new V3(0, 1, 0), 0);
  const derby = new Derby(); derby.enabled = true; derby.damageEnabled = false;
  derby.getawaySetup = { L, role: aiRole, makeDriver: (r) => new GetawayDriver(r, game, aiRole), rescue: (c) => { const p = rescuePose(L, c.pos.x, c.pos.z); c.reset(new V3(p.x, track.py[0] + c.restHeight + 0.08, p.z), new V3(p.fx, 0, p.fz), new V3(0, 1, 0), 0); } };
  derby.start(track, car, 1, 5);
  const me = new GetawayDriver(rngOf(9), game, mine); car.aiRollGuard = 0.48;
  S_rescue = derby.getawaySetup.rescue;
  return { L, track, game, car, derby, me, mine };
}

function play(S, seconds) {
  const { L, game, car, derby, me, track } = S, ctx = { player: null, cars: [], skill: 0.7 };
  const inside = (c) => L.boxes.some((b) => c.pos.x > b.x0 + 0.5 && c.pos.x < b.x1 - 0.5 && c.pos.z > b.z0 + 0.5 && c.pos.z < b.z1 - 0.5);
  let inp = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false }, bad = 0, picks = 0, lastEv = null;
  const foe = derby.rivals[0];
  for (let i = 0; i < seconds / DT; i++) {
    if (i % 4 === 0) { ctx.player = foe.car; inp = me.drive(car, track, ctx, DT * 4); }
    car.step(DT, inp, track);
    derby.step(DT);
    const rams = []; for (const e of derby.events) if (e.type === 'hit' && e.kind === 'car') rams.push(e.speed); derby.events.length = 0;
    const robber = S.mine === 'robber' ? car : foe.car, police = S.mine === 'robber' ? foe.car : car;
    game.step(DT, { x: robber.pos.x, z: robber.pos.z }, { x: police.pos.x, z: police.pos.z }, rams);
    for (const e of game.events) { lastEv = e; if (e.type === 'pickup') picks++; if (e.type === 'drop') S.drops = (S.drops || 0) + 1; } game.events.length = 0;
    if (car.ay.y < 0.15 && car.speed < 3) { car._flip = (car._flip || 0) + DT; if (car._flip > 2.5) { S_rescue(car); car._flip = 0; } } else car._flip = 0;
    if (inside(car) || inside(foe.car)) bad++;
    if (process.env.GT_TRACE && i % 3600 === 0) console.log('#t', (i*DT).toFixed(0), 'me', car.pos.x.toFixed(0), car.pos.z.toFixed(0), car.speed.toFixed(1), me.goalKind, 'up', car.ay.y.toFixed(2), 'foe', foe.car.pos.x.toFixed(0), foe.car.pos.z.toFixed(0), foe.car.speed.toFixed(1), foe.driver.goalKind, 'bag', game.robberBag?.id, game.policeBag?.id);
    if (game.over) break;
  }
  return { bad, picks, lastEv, time: game.time };
}

test('computer robber against a computer police car: both stay in the streets and bags change hands', () => {
  const S = setup('robber'); const r = play(S, 200);
  assert.equal(r.bad, 0, 'a car ended up inside a building');
  assert.ok(r.picks >= 1, 'the robber picked up a bag');
  assert.ok(S.game.robbed + S.game.returned >= 1 || S.game.robberBag, 'something was delivered');
  for (const c of [S.car, S.derby.rivals[0].car]) assert.ok(Number.isFinite(c.pos.x) && c.pos.y > -2, 'cars stay in the world');
});

test('computer police against a computer robber: the same', () => {
  const S = setup('police', 4); const r = play(S, 200);
  assert.equal(r.bad, 0); assert.ok(r.picks >= 1);
});

if (process.env.GT_REPORT) test('report', () => {
  for (const [role, seed] of [['robber', 3], ['police', 4], ['robber', 8], ['police', 9]]) {
    const S = setup(role, seed), r = play(S, 600);
    console.log(role, seed, 'time', r.time.toFixed(0), 'robbed', S.game.robbed, 'returned', S.game.returned, 'winner', S.game.winner, 'bad', r.bad, 'picks', r.picks, 'drops', S.drops || 0);
  }
});
