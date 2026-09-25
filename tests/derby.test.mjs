// Destruction derby: damage zones, crashes between cars, wrecks, scoring, the rival drivers, blasts.
// Run with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { V3 } from '../src/math.js';
import { makeTemplate, TEMPLATE_KEYS } from '../src/templates.js';
import { Props, placeProp } from '../src/props.js';
import { Derby, DERBY, POINTS, collideCars, placeOnRoad } from '../src/derby.js';
import { Driver } from '../src/ai.js';
import { ZONES, ARMOUR, DAMAGE, Health, zoneAt, crashDamage, wallDamage, blastDamage } from '../src/damage.js';
import { DRAG_DEF, placeOnTrack, bot, DT } from './harness.mjs';

const dragTrack = () => new Track(DRAG_DEF);
const IN = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A drag-strip derby with no rivals yet and the start-of-game grace period already over. */
function arena(playerZ = -300, speed = 0) {
  const track = dragTrack(), car = new Vehicle();
  placeOnTrack(car, track, track.progressAt(0, 0.65, playerZ), 0, speed);
  const derby = new Derby(); derby.enabled = true; derby.start(track, car, 0);
  derby.time = DERBY.grace + 1;
  return { track, car, derby };
}
/** A coasting rival `dz` metres ahead of z = -300 and `dx` to the left, moving at `speed` along the road (or turned `turn` degrees). */
function rival(a, dz, speed, { dx = 0, turn = 0 } = {}) {
  const c = new Vehicle();
  const s = a.track.progressAt(0, 0.65, -300 + dz), f = placeOnTrack(c, a.track, s, dx, speed);
  if (turn) {
    const r = turn * Math.PI / 180, fx = f.fx * Math.cos(r) + f.lx * Math.sin(r), fz = f.fz * Math.cos(r) + f.lz * Math.sin(r);
    c.reset(c.pos.clone(), new V3(fx, 0, fz), new V3(0, 1, 0), speed);
  }
  const fighter = a.derby.add(c); fighter.age = 9;
  return fighter;
}
function play(a, seconds, input = () => IN) {
  const log = { events: [] };
  for (let i = 0; i < seconds / DT; i++) {
    a.car.step(DT, input(i * DT), a.track);
    a.derby.step(DT);
    for (const e of a.derby.events) log.events.push(e);
    a.derby.events.length = 0; a.car.events.length = 0;
  }
  return log;
}

// ------------------------------------------------------------------ damage model

test('a hit is filed under the part of the car that was touched', () => {
  const track = dragTrack(), car = new Vehicle(); placeOnTrack(car, track, 100, 0, 0); car.refreshFrame();
  const at = (lx, lz) => zoneAt(car, car.pos.x + car.ax.x * lx + car.az.x * lz, car.pos.y, car.pos.z + car.ax.z * lx + car.az.z * lz);
  assert.equal(at(0, 2.3), 'front');
  assert.equal(at(0.5, 2.0), 'front');
  assert.equal(at(0, -2.3), 'back');
  assert.equal(at(0.93, 0.3), 'left', 'x is the left of the car');
  assert.equal(at(-0.93, -0.3), 'right');
  assert.equal(at(0.9, 1.0), 'left', 'a wide-of-centre hit on the flank is a side hit, not a front one');
});

test('crash, wall and blast damage grow with speed, and small bumps are shrugged off', () => {
  assert.equal(crashDamage(700, 2), 0);
  assert.equal(crashDamage(700, DAMAGE.minSpeed), 0);
  const a = crashDamage(700, 10), b = crashDamage(700, 20), c = crashDamage(700, 30);
  assert.ok(a > 0 && b > 2 * a && c > b, `${a} ${b} ${c}`);
  assert.equal(crashDamage(700, 200), DAMAGE.maxHit, 'one crash is capped');
  assert.ok(wallDamage(1450, 20) < crashDamage(700, 20) / 2, 'a barrier is softer than a car');
  assert.equal(blastDamage(DAMAGE.barrel, 0), DAMAGE.barrel.point);
  assert.equal(blastDamage(DAMAGE.barrel, DAMAGE.barrel.radius), 0);
  assert.ok(blastDamage(DAMAGE.barrel, 6) < DAMAGE.barrel.point && blastDamage(DAMAGE.barrel, 6) > 0);
});

test('the first zone to run out is what wrecks a car', () => {
  const h = new Health(ARMOUR.rival);
  assert.equal(h.wrecked, null);
  h.hit('left', 30); h.hit('back', 30);
  assert.equal(h.wrecked, null);
  assert.equal(h.worstZone === 'left' || h.worstZone === 'back', true);
  h.hit('left', 500);
  assert.equal(h.wrecked, 'left');
  assert.equal(h.hp.left, 0);
  assert.equal(h.hit('front', 10), 0, 'a wreck takes no more damage');
});

test('your car is tougher than a rival, and the front is by far the toughest part', () => {
  for (const z of ZONES) assert.ok(ARMOUR.player[z] > ARMOUR.rival[z], z);
  for (const z of ['back', 'left', 'right']) assert.ok(ARMOUR.player.front > 1.6 * ARMOUR.player[z], `front vs ${z}`);
  const a = arena(); rival(a, 200, 0);
  const P = a.derby.player, before = { ...P.health.hp };
  a.derby._damage(P, 'front', 60, null);
  a.derby._damage(P, 'back', 60, null);
  const lostFront = before.front - P.health.hp.front, lostBack = before.back - P.health.hp.back;
  assert.ok(lostFront < lostBack * 0.6, `the welded plate soaks the hit: front lost ${lostFront}, rear lost ${lostBack}`);
  // and a hit crumples the neighbours a little too
  assert.ok(P.health.hp.left < before.left && P.health.hp.right < before.right);
});

// ------------------------------------------------------------------ crashes

test('two cars driven into each other collide, push apart and spin from an off-centre hit', () => {
  const track = dragTrack(), A = new Vehicle(), B = new Vehicle();
  placeOnTrack(A, track, track.progressAt(0, 0.65, -300), 0, 0);
  placeOnTrack(B, track, track.progressAt(0, 0.65, -297.5), 0.7, 0);      // nose to tail, half a car off to one side
  A.refreshFrame(); B.refreshFrame();
  A.vel.set(0, 0, 15); A.vel.set(0, 0, 15);
  const out = {}; let hit = false;
  for (let i = 0; i < 60; i++) {
    A.step(DT, IN, track); B.step(DT, IN, track); A.refreshFrame(); B.refreshFrame();
    if (collideCars(A, B, out)) hit = true;
  }
  assert.ok(hit, 'they touched');
  assert.ok(Math.abs(B.vel.z) > 3, 'the car that was hit is thrown forward: ' + B.vel.z);
  assert.ok(A.vel.z < 15 - 2, 'and the one that hit it slowed');
  assert.ok(Math.abs(B.angVel.y) > 0.1, 'an off-centre hit makes it spin: ' + B.angVel.y);
  const gap = Math.hypot(B.pos.x - A.pos.x, B.pos.z - A.pos.z);
  assert.ok(gap > 1.2, 'never left overlapping');
});

test('ramming a rival from behind wrecks it, scores a takedown once, and costs your front end little', () => {
  const a = arena(-300, 50), r = rival(a, 40, 20);
  const log = play(a, 3, () => ({ ...IN, throttle: 0.6 }));
  assert.equal(r.wrecked, true, 'the rival is wrecked');
  assert.equal(a.derby.takedowns, 1);
  assert.equal(a.derby.score, POINTS.takedown);
  assert.equal(log.events.filter((e) => e.type === 'award').length, 1, 'awarded exactly once');
  assert.equal(log.events.find((e) => e.type === 'award').points, POINTS.takedown);
  const wreck = log.events.find((e) => e.type === 'wreck' && !e.isPlayer);
  assert.ok(wreck && wreck.zone === 'back', 'its rear gave out');
  assert.equal(a.derby.over, false);
  const P = a.derby.player.health;
  assert.ok(P.frac('front') > 0.55, 'the armoured front took it: ' + P.frac('front'));
});

test('a gentle nudge does no damage at all', () => {
  const a = arena(-300, 24), r = rival(a, 30, 20);          // closing at 4 m/s: barely above the shrug-off speed
  play(a, 2, () => ({ ...IN, throttle: 0.2 }));
  assert.ok(r.health.worst > 0.9, 'rival barely marked: ' + r.health.worst);
});

test('a rival that hits your side punishes the side, and your rear is the weak spot', () => {
  let a = arena(-300, 0), r = rival(a, 0, 22, { dx: -9, turn: 90 });   // parked, T-boned from the right at 22 m/s
  play(a, 2.5);
  let P = a.derby.player.health;
  assert.ok(P.frac('right') < 0.85 && P.frac('right') < P.frac('left'), `right ${P.frac('right')} left ${P.frac('left')}`);
  a = arena(-300, 0); r = rival(a, -25, 20);                  // parked, hit from behind at 20 m/s
  play(a, 2.5);
  P = a.derby.player.health;
  assert.ok(P.frac('back') < 0.7, 'rear ' + P.frac('back'));
  assert.ok(P.frac('front') > 0.99);
});

test('nothing hurts you during the grace period at the start', () => {
  const a = arena(-300, 0); a.derby.time = 0;
  const r = rival(a, -25, 25);
  play(a, 1.5);
  assert.equal(a.derby.player.health.worst, 1, 'untouched');
  assert.ok(r.health.worst < 1, 'but rivals can still be hurt');
});

// ------------------------------------------------------------------ wrecks and scoring

test('only wrecks you caused score: hit within the window counts, old or unrelated ones do not', () => {
  const a = arena(-300, 0), P = a.derby.player;
  const r1 = rival(a, 100, 0), r2 = rival(a, 200, 0), r3 = rival(a, 300, 0);
  a.derby._damage(r1, 'back', 500, P);                                      // you hit it, and it goes
  assert.equal(a.derby.score, POINTS.takedown);
  a.derby._damage(r2, 'back', 500, null);                                   // it just wrecked itself
  assert.equal(a.derby.score, POINTS.takedown);
  r3.lastHit = { by: P.id, t: a.derby.time - DERBY.credit - 1 };            // you touched it too long ago
  a.derby._damage(r3, 'back', 500, null);
  assert.equal(a.derby.score, POINTS.takedown);
  assert.equal(a.derby.takedowns, 1);
});

test('a wreck goes off like a bomb: it throws the car up and hurts a neighbour, credited to you', () => {
  const a = arena(-300, 0), P = a.derby.player;
  const r1 = rival(a, 100, 0), r2 = rival(a, 104, 0);
  const y0 = r1.car.vel.y;
  a.derby._damage(r1, 'back', 500, P);
  assert.ok(r1.car.vel.y > y0 + 3, 'thrown into the air');
  assert.ok(r2.health.worst < 1, 'the neighbour is hurt by the blast');
  assert.ok(r2.car.vel.length() > 1, 'and shoved');
  assert.equal(r2.lastHit.by, P.id, 'the blast counts as your hit');
});

test('when your own car is wrecked it is game over: no more damage, no more points', () => {
  const a = arena(-300, 0), P = a.derby.player;
  const r = rival(a, 100, 0);
  a.derby._damage(r, 'back', 500, P);
  const score = a.derby.score;
  a.derby._damage(P, 'back', 9999, r);
  assert.equal(a.derby.over, true);
  assert.equal(P.wrecked, true);
  const over = a.derby.events.find((e) => e.type === 'over');
  assert.ok(over && over.zone === 'back' && over.score === score && over.takedowns === 1);
  assert.equal(a.derby.award('takedown'), 0, 'nothing scores once you are dead');
  const r2 = rival(a, 200, 0);
  a.derby._damage(r2, 'back', 500, P);
  assert.equal(a.derby.score, score);
});

test('every kind of points goes through award(), so a new one is a single line', () => {
  const a = arena();
  assert.equal(a.derby.award('nonsense'), 0);
  POINTS.landing = 50;
  try {
    assert.equal(a.derby.award('landing'), 50);
    assert.equal(a.derby.award('landing', 2, 'Big air'), 100);
    assert.equal(a.derby.score, 150);
    const e = a.derby.events.filter((x) => x.type === 'award');
    assert.equal(e.length, 2);
    assert.equal(e[1].label, 'Big air');
    assert.equal(e[1].score, 150);
  } finally { delete POINTS.landing; }
});

test('a wrecked rival lies about, is replaced by a fresh one, and never disappears on its own', () => {
  const track = new Track(makeTemplate('speedway')), car = new Vehicle();
  placeOnRoad(car, track, track.startS(12), 0, 0);
  const derby = new Derby(); derby.enabled = true; derby.start(track, car, 4, 5);
  assert.equal(derby.alive, 4);
  const victim = derby.rivals[0]; victim.age = 9;          // past its spawn protection
  derby._damage(victim, 'back', 999, null);
  assert.equal(derby.alive, 3);
  for (let i = 0; i < 4 / DT; i++) { car.step(DT, IN, track); derby.step(DT); car.events.length = 0; derby.events.length = 0; }
  assert.equal(derby.alive, 4, 'a replacement arrived');
  assert.equal(victim.gone, false, 'the hulk is still there');
  for (let i = 0; i < (DERBY.wreckLife + DERBY.wreckFade + 1) / DT; i++) { car.step(DT, IN, track); derby.step(DT); car.events.length = 0; derby.events.length = 0; }
  assert.equal(victim.gone, false, 'still there long after it would once have burnt out');
  assert.ok(derby.cars.includes(victim.car), 'still a solid obstacle');
  assert.equal(derby.alive, 4);
});

test('once too many hulks pile up, the oldest one fades away to make room', () => {
  const track = new Track(makeTemplate('speedway')), car = new Vehicle();
  placeOnRoad(car, track, track.startS(12), 0, 0);
  const derby = new Derby(); derby.enabled = true; derby.start(track, car, DERBY.maxWrecks + 2, 5);
  const first = derby.rivals[0]; first.age = 9;
  derby._damage(first, 'back', 999, null);                 // the oldest wreck
  for (let i = 0; i < 0.5 / DT; i++) { car.step(DT, IN, track); derby.step(DT); car.events.length = 0; derby.events.length = 0; }
  for (const f of derby.rivals) { f.age = 9; derby._damage(f, 'back', 999, null); }   // wreck everything else too
  for (let i = 0; i < 3 / DT; i++) { car.step(DT, IN, track); derby.step(DT); car.events.length = 0; derby.events.length = 0; }
  assert.equal(first.gone, true, 'the oldest hulk made way once the cap was hit');
});

// ------------------------------------------------------------------ explosions

test('a barrel going off hurts the cars around it, more the closer they are, and yours takes far less', () => {
  const a = arena(-300, 0);
  const near = rival(a, 4, 0), far = rival(a, 200, 0);
  const before = a.derby.player.health.worst;
  const x = near.car.pos.x + 1.5, y = near.car.pos.y, z = near.car.pos.z;
  a.derby.blast(x, y, z);
  assert.ok(near.health.worst < 0.5, 'point blank: ' + near.health.worst);
  assert.equal(far.health.worst, 1, 'out of range');
  const rivalLost = 1 - near.health.frac(near.health.worstZone);
  a.derby.blast(a.car.pos.x + 1.5, a.car.pos.y, a.car.pos.z);
  const youLost = before - a.derby.player.health.worst;
  assert.ok(youLost > 0 && youLost < rivalLost / 2, `you ${youLost} rival ${rivalLost}`);
});

test('rival cars knock barrels about too, and an explosion pushes every car nearby', () => {
  const track = dragTrack();
  const pt = placeProp(track, 0, -200);
  const def = { ...DRAG_DEF, props: [{ type: 'barrel', x: pt.x, z: pt.z, y: pt.y }] };
  const t2 = new Track(def);
  const props = new Props(); props.load(t2, t2.def.props);
  const mine = new Vehicle(), theirs = new Vehicle();
  placeOnTrack(mine, t2, t2.progressAt(0, 0.65, -340), 0, 0);
  placeOnTrack(theirs, t2, t2.progressAt(0, 0.65, -215), 0, 14);
  for (let i = 0; i < 2.5 / DT; i++) {
    mine.step(DT, IN, t2); theirs.step(DT, { ...IN, throttle: 0.4 }, t2);
    props.step(DT, [mine, theirs]);
    props.events.length = 0;
  }
  assert.equal(props.barrels[0].alive, false, 'the rival set it off');
  // now a blast with both cars close: both are shoved
  const p2 = new Props(); p2.load(t2, t2.def.props);
  const c1 = new Vehicle(), c2 = new Vehicle();
  placeOnTrack(c1, t2, t2.progressAt(0, 0.65, -203), 0, 0); placeOnTrack(c2, t2, t2.progressAt(0, 0.65, -197), 0, 0);
  p2.barrels[0].boom = true;
  c1.step(DT, IN, t2); c2.step(DT, IN, t2);
  p2.step(DT, [c1, c2]);
  assert.ok(c1.vel.length() > 1.5 && c2.vel.length() > 1.5, `${c1.vel.length()} ${c2.vel.length()}`);
  p2.shock(pt.x, pt.y, pt.z);                       // and the wreck shock does not throw
});

// ------------------------------------------------------------------ the rival drivers

test('rivals drive every track without flipping, getting lost or crashing about', () => {
  for (const key of TEMPLATE_KEYS) {
    const track = new Track(makeTemplate(key)), car = new Vehicle();
    placeOnRoad(car, track, 30, 0, 20);
    const drv = new Driver(mulberry(11), 0.5), ctx = { player: null, cars: [car] };
    let flips = 0, walls = 0, dist = 0, last = track.progressAt(car.pos.x, car.pos.y, car.pos.z);
    for (let i = 0; i < 60 / DT; i++) {
      car.step(DT, i % 4 === 0 ? drv.drive(car, track, ctx, DT * 4) : drv.input, track);
      for (const e of car.events) if (e.type === 'wall' && e.speed > 3) walls++;
      car.events.length = 0;
      if (car.ay.y < 0.15) flips++;
      assert.ok(car.pos.y > -20, key + ' fell off the world');
      if (i % 120 === 0) {
        const s = track.progressAt(car.pos.x, car.pos.y, car.pos.z);
        let d = s - last; if (d < -track.length / 2) d += track.length; if (d > track.length / 2) d -= track.length;
        dist += d; last = s;
      }
    }
    assert.equal(flips, 0, key + ' flipped');
    assert.ok(walls <= 2, `${key} hit the barriers ${walls} times`);
    assert.ok(dist > 700, `${key} only covered ${dist.toFixed(0)} m in a minute`);
  }
});

test('a hunting rival heads for you and hits you', () => {
  const track = new Track(makeTemplate('speedway')), me = new Vehicle(), them = new Vehicle();
  placeOnRoad(me, track, 700, 0, 0);                        // parked on the road
  placeOnRoad(them, track, 560, 0, 20);                     // 140 m behind, coming your way
  const drv = new Driver(mulberry(3), 1); drv.mood = 'hunt'; drv.moodT = 60;
  const derby = new Derby(); derby.enabled = true; derby.start(track, me, 0); derby.time = 10;
  const f = derby.add(them, drv); f.age = 9;
  let hit = false;
  for (let i = 0; i < 20 / DT && !hit; i++) {
    me.step(DT, IN, track); derby.step(DT);
    hit = derby.events.some((e) => e.type === 'hit' && e.player);
    derby.events.length = 0; me.events.length = 0;
  }
  assert.ok(hit, 'it found you');
});

// ------------------------------------------------------------------ the whole thing

test('a full derby with six rivals runs cleanly on the bendy tracks, and is repeatable from a seed', () => {
  const runOnce = (key, seed) => {
    const track = new Track(makeTemplate(key)), car = new Vehicle();
    placeOnRoad(car, track, track.startS(12), 0, 0);
    const derby = new Derby(); derby.enabled = true; derby.start(track, car, 6, seed);
    const drive = bot({ speed: 42 });
    let awards = 0;
    for (let i = 0; i < 40 / DT; i++) {
      car.step(DT, { ...IN, ...drive(i * DT, car, track) }, track);
      derby.step(DT);
      for (const e of derby.events) if (e.type === 'award') awards++;
      derby.events.length = 0; car.events.length = 0;
      if (i % 600 === 0) for (const c of derby.cars) assert.ok(Number.isFinite(c.pos.x + c.pos.y + c.pos.z), 'a car diverged');
    }
    assert.ok(derby.cars.length <= 1 + 6 + DERBY.maxWrecks + 1);
    return { score: derby.score, x: car.pos.x.toFixed(3), hp: JSON.stringify(derby.player.health.hp), rivals: derby.rivals.map((f) => f.car.pos.x.toFixed(2)).join() };
  };
  for (const key of ['technical', 'hills']) runOnce(key, 3);
  assert.deepEqual(runOnce('kidney', 9), runOnce('kidney', 9));
});
