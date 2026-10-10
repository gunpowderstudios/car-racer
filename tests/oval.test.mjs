// The Oval: a free-for-all banger derby arena. Barrels, an open dirt floor, no laps, the last car running wins.
// Run with:  npm test
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Track, normalizeTrack } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { makeTemplate, TEMPLATE_KEYS, TEMPLATE_INFO } from '../src/templates.js';
import { Derby, DERBY, POINTS } from '../src/derby.js';
import { arenaInfo, arenaOutline, arenaPlayerStart } from '../src/arena.js';
import { TOUGHNESS, roofDentHp } from '../src/damage.js';
import { DENT } from '../src/dentMath.js';
import { placeOnTrack } from './harness.mjs';

const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };

function arena(rivals = 6) {
  const def = makeTemplate('oval'), track = new Track(def), car = new Vehicle();
  placeOnTrack(car, track, track.startS(12), 0, 0);
  const derby = new Derby(); derby.enabled = true; derby.damageEnabled = true;
  derby.start(track, car, rivals, 11);
  return { def, track, car, derby };
}

test('The Oval is a preloaded track, replacing Bed Pan', () => {
  assert.ok(TEMPLATE_KEYS.includes('oval') && !TEMPLATE_KEYS.includes('kidney'));
  assert.equal(makeTemplate('oval').name, 'The Oval');
  assert.match(TEMPLATE_INFO.oval, /last one standing/i);
  assert.equal(TEMPLATE_KEYS.length, 6, 'still five tracks and the random one');
});

test('it is marked as a last-one-standing arena, and other tracks are not', () => {
  assert.equal(makeTemplate('oval').mode, 'lastStanding');
  for (const k of TEMPLATE_KEYS) if (k !== 'oval') assert.equal(makeTemplate(k).mode, undefined, k);
  assert.equal(normalizeTrack(makeTemplate('oval')).mode, 'lastStanding', 'the mode survives loading');
  assert.equal(normalizeTrack({ handles: makeTemplate('oval').handles, mode: 'nonsense' }).mode, undefined);
});

test('full of drums, some in clusters, all on the floor, none where the player starts, and the same every time', () => {
  const def = makeTemplate('oval'), track = new Track(def), A = arenaInfo(track);
  const barrels = def.props.filter((p) => p.type === 'barrel');
  assert.ok(barrels.length >= 60 && barrels.length <= 100, String(barrels.length));
  assert.deepEqual(makeTemplate('oval').props, def.props, 'always the same drums');
  const q = Track.newQuery(), ps = arenaPlayerStart(A);
  for (const b of barrels) {
    track.query(b.x, b.y + 0.5, b.z, q, 2);
    assert.ok(q.idx >= 0 && Math.abs(q.d) < q.hw - 1, 'every drum is on the floor');
    assert.ok(Math.hypot(b.x - ps.x, b.z - ps.z) > 12, 'clear of the player start');
  }
  let close = 0;
  for (let i = 0; i < barrels.length; i++) for (let j = i + 1; j < barrels.length; j++) if (Math.hypot(barrels[i].x - barrels[j].x, barrels[i].z - barrels[j].z) < 3.2) close++;
  assert.ok(close >= 12, 'clusters of drums that set each other off: ' + close);
});

test('it is a big open, walled, flat dirt floor, and its outline matches the physics wall', () => {
  const def = makeTemplate('oval'), track = new Track(def), A = arenaInfo(track), q = Track.newQuery();
  assert.equal(def.walls, true);
  assert.ok(A.ax > 90 && A.az > 55, 'a proper stadium floor');
  for (const p of arenaOutline(A, A.hw - 1.5, 72)) {
    track.query(p.x, A.y + 0.5, p.z, q, 2);
    assert.ok(q.idx >= 0 && q.hw - Math.abs(q.d) > 0.5, 'just inside the edge is floor');
  }
  for (const p of arenaOutline(A, A.hw + 1.4, 72)) {
    track.query(p.x, A.y + 1, p.z, q, 2);
    assert.ok(q.idx >= 0 && track.wallPenetration(q, q.y + 0.5) > 0, 'just past the edge is wall');
  }
});

test('the field starts spread round the floor, standing still, every rival spoiling for a fight', () => {
  const { track, derby } = arena(8);
  const rivals = derby.rivals, q = Track.newQuery();
  assert.equal(rivals.length, 8);
  for (const f of rivals) {
    assert.ok(f.car.speed < 0.5); assert.ok(f.driver.aggr >= 0.7);
    track.query(f.car.pos.x, f.car.pos.y, f.car.pos.z, q, 2);
    assert.ok(q.idx >= 0 && q.hw - Math.abs(q.d) > 5, 'on the floor');
  }
  let nearest = 1e9;
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) nearest = Math.min(nearest, Math.hypot(rivals[i].car.pos.x - rivals[j].car.pos.x, rivals[i].car.pos.z - rivals[j].car.pos.z));
  assert.ok(nearest > 20, 'not stacked on top of each other: ' + nearest.toFixed(1));
  const normal = new Derby(); const t2 = new Track(makeTemplate('speedway')), c2 = new Vehicle();
  placeOnTrack(c2, t2, t2.startS(12), 0, 0); normal.enabled = true; normal.start(t2, c2, 6, 11);
  assert.equal(normal.lastStanding, false);
});

test('vehicles are 20% weaker than the original, and each type has its own toughness', () => {
  assert.equal(TOUGHNESS, 0.8);
  assert.equal(DENT.fullHp, 56);
});

test('rivals pick the nearest running car as their target, not just you', () => {
  const { derby } = arena(6);
  const [a, b] = derby.rivals;
  a.car.pos.set(0, 0, 0); b.car.pos.set(5, 0, 0);
  for (const f of derby.rivals.slice(2)) f.car.pos.set(500, 0, 500);
  derby.player.car.pos.set(300, 0, 300);
  assert.equal(derby._nearestFoe(a), b.car);
  b.wrecked = true;
  assert.notEqual(derby._nearestFoe(a), b.car, 'wrecks are not targets');
});

test('wrecked rivals are not replaced', () => {
  const { derby } = arena(5);
  derby.time = DERBY.grace + 1;
  const first = derby.rivals[0]; first.age = 99;
  derby._damage(first, 'back', 999, null);
  for (let i = 0; i < 600; i++) derby.step(1 / 120, null);        // five seconds
  assert.ok(derby.rivals.filter((f) => !f.wrecked).length <= 4, 'at most four running (weak cars may wreck each other too)');
  assert.equal(derby.fighters.filter((f) => !f.isPlayer).length, 5, 'and no new ones came on');
});

test('wreck every rival and you win: 500 points, the game ends, and you are not wrecked', () => {
  const { derby } = arena(4);
  derby.time = DERBY.grace + 1;
  derby.events.length = 0;
  const all = derby.rivals;
  for (const f of all.slice(0, 3)) { f.age = 99; derby._damage(f, 'back', 999, derby.player); }
  derby.step(1 / 120, null);
  assert.equal(derby.over, false, 'one left: still going');
  assert.equal(derby.alive, 1);
  all[3].age = 99; derby._damage(all[3], 'back', 999, derby.player);
  const before = derby.score;
  derby.step(1 / 120, null);
  const over = derby.events.find((e) => e.type === 'over');
  assert.ok(over && over.won === true, JSON.stringify(derby.events.map((e) => e.type)));
  assert.equal(derby.over, true); assert.equal(derby.won, true);
  assert.equal(derby.score - before, POINTS.winner);
  assert.equal(derby.player.wrecked, false);
  derby.events.length = 0; derby.step(1 / 120, null);
  assert.equal(derby.events.filter((e) => e.type === 'over').length, 0, 'you only win once');
});

test('no win before the grace period is up, and no win once you are wrecked yourself', () => {
  const { derby } = arena(2);
  for (const f of derby.rivals) { f.age = 99; derby._damage(f, 'back', 999, null); }
  derby.time = 0.5;
  derby.step(1 / 120, null);
  assert.equal(derby.won, false);
  const { derby: d2 } = arena(3);
  d2.time = DERBY.grace + 1;
  d2._damage(d2.player, 'front', 9999, null);                     // you are the one wrecked
  for (const f of d2.rivals) { f.age = 99; d2._damage(f, 'back', 999, null); }
  d2.step(1 / 120, null);
  assert.equal(d2.won, false);
  assert.equal(d2.over, true);
});

test('left alone, the field tears itself apart: rivals wreck each other', () => {
  const { track, car, derby } = arena(8);
  derby.time = DERBY.grace + 1;
  for (let i = 0; i < 60 * 150; i++) {                              // two and a half minutes at 60 Hz
    car.step(1 / 60, IDLE, track);
    derby.step(1 / 60, null);
    car.events.length = 0; derby.events.length = 0;
  }
  const wrecked = derby.rivals.filter((f) => f.wrecked).length + derby.fighters.filter((f) => f.gone && !f.isPlayer).length;
  assert.ok(wrecked >= 1, `at least one rival was wrecked by the others (got ${wrecked})`);
  assert.equal(derby.rivals.length <= 8, true);
});

test('a roof scraping the ground in a roll leaves a roof dent; a hard landing on the wheels does not', () => {
  const { car, derby } = arena(3);
  derby.time = DERBY.grace + 1;
  car.refreshFrame();
  const roofPt = { x: car.pos.x + car.ay.x * 0.9, y: car.pos.y + car.ay.y * 0.9, z: car.pos.z + car.ay.z * 0.9 };
  derby.events.length = 0;
  car.events.push({ type: 'ground', speed: 9, ...roofPt });
  derby.step(1 / 120, null);
  const roof = derby.events.find((e) => e.type === 'damage' && e.isPlayer);
  assert.ok(roof, 'roof damage event');
  assert.equal(roof.zone, 'roof');
  assert.ok(roof.ly > 0.5, 'dent point is on the roof, local y ' + roof.ly);
  assert.ok(roof.dentHp >= 10 && roof.dentHp <= 60, 'dent sized from the impact speed: ' + roof.dentHp);
  assert.equal(roofDentHp(2), 0);
  assert.ok(roofDentHp(15) > roofDentHp(6));
  derby.events.length = 0; car.events.length = 0;      // the player's own events stay queued for main.js
  car.events.push({ type: 'ground', speed: 9, x: car.pos.x, y: car.pos.y - 0.4, z: car.pos.z + 1.5 });
  derby.step(1 / 120, null);
  const low = derby.events.find((e) => e.type === 'damage' && e.isPlayer);
  assert.ok(!low || (low.lx === undefined && low.dentHp === undefined), 'wheels and underside get no dent');
});

test('vehicle types differ in toughness: the V8 bruiser and the motorhome outlast the saloon and the camper', () => {
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  const mul = {};
  for (const id of ['car', 'escort', 'bmw', 'v8-pilot', 'campervan', 'motor-home']) {
    const at = src.indexOf(`id: '${id}'`), end = src.indexOf('physicsProfile', at);
    const m = /damageMul:\s*([0-9.]+)/.exec(src.slice(at, end));
    mul[id] = m ? Number(m[1]) : 1;
  }
  assert.ok(mul['v8-pilot'] < mul.car && mul.car < mul.bmw && mul.bmw < mul.escort, JSON.stringify(mul));
  assert.ok(mul['motor-home'] < 1 && mul.campervan > 1, JSON.stringify(mul));
  for (const v of Object.values(mul)) assert.ok(v >= 0.5 && v <= 1.5);
});
