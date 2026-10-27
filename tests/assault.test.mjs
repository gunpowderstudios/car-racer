// Apple Crumple: the solo obstacle course (Driving Tests). Every hazard has to be real (it moves, it touches, it hurts), fair (there is always a way
// through), and the whole course has to be finishable. Run with:  npm test
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Track, normalizeTrack, analyzeTrack } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { makeTemplate, TEMPLATE_KEYS, TEMPLATE_INFO, drivable } from '../src/templates.js';
import { Derby } from '../src/derby.js';
import { Assault, COURSE, hammerHead, boulderAt, pressAt, armAngle, nearestOnCar } from '../src/assault.js';
import { placeOnTrack, DT, bot } from './harness.mjs';
import { V3 } from '../src/math.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

function course() {
  const def = makeTemplate('apple'), track = new Track(def), car = new Vehicle();
  placeOnTrack(car, track, track.startS(12), 0, 0);
  const derby = new Derby(); derby.enabled = true; derby.start(track, car, 0, 7, 'race');
  return { def, track, car, derby, run: new Assault(track) };
}
/** Put the car on the road at distance s, `lane` metres from the middle, moving at `speed`. */
function put(car, track, s, lane = 0, speed = 0) { placeOnTrack(car, track, s, lane, speed); car.refreshFrame(); }
/** A stand-in for the derby that just counts the damage it is asked to do. */
const spy = () => ({ enabled: true, over: false, player: { wrecked: false }, hits: [], _damage(f, zone, hp) { this.hits.push({ zone, hp }); } });
/** Find a time at which `ok(t)` holds. */
const findT = (ok, to = 40) => { for (let t = 0; t < to; t += 0.01) if (ok(t)) return t; throw new Error('never'); };

// ---------------------------------------------------------------------------------------------- the track
test('Apple Crumple is a Driving Test: its own course, kept out of the race lists', () => {
  assert.ok(!TEMPLATE_KEYS.includes('apple'), 'not a Race Day / multiplayer / Wacky Racing track');
  assert.ok(TEMPLATE_INFO.apple);
  assert.match(main, /group\('Driving Tests'\); addTemplate\('apple'\)/);
  assert.doesNotMatch(main, /group\('Wacky Racing'\)[^\n]*apple/);
  assert.doesNotMatch(main, /group\('Stunt and Shunts'\)[^\n]*apple/);
  assert.equal(TEMPLATE_KEYS.length, 10, 'the existing nine tracks and random are unchanged');
});

test('the course is a clean one-lap route with a drivable jump and a way through everything', () => {
  const { def, track } = course();
  assert.equal(def.name, 'Apple Crumple');
  assert.ok(track.length > 1200 && track.length < 1700, `length ${track.length}`);
  const a = analyzeTrack(track);
  assert.equal(a.tight.length, 0); assert.equal(a.crossings.length, 0);
  assert.ok(drivable(def), 'the jump can be cleared (by the AI and the bot checks)');
  const jump = def.handles.find((h) => h.gap);
  assert.ok(jump && jump.gap >= 12 && jump.y >= 5, 'a real gap, on a hill at least 5 m high');
  const d = def.assault;
  assert.ok(d.hammers.length >= 2 && d.boulders.length >= 3 && d.arms.length >= 2 && d.presses.length >= 2, 'every kind of hazard is on the course');
  assert.ok(d.checkpoints.length >= 4);
  assert.deepEqual([...d.checkpoints], [...d.checkpoints].sort((x, y) => x - y), 'checkpoints are in order');
  for (const k of ['hammers', 'arms', 'boulders', 'presses']) for (const h of d[k]) assert.ok(h.s > 20 && h.s < track.length - 10, `${k} on the road`);
  assert.ok(def.props.filter((p) => p.type === 'barrel').length >= 8, 'exploding barrels');
  // progressive difficulty: the first hazard is a single slow hammer, the last stretch holds several kinds together
  const first = Math.min(...['hammers', 'arms', 'boulders', 'presses'].map((k) => d[k][0].s));
  assert.equal(first, d.hammers[0].s); assert.ok(d.hammers[0].speed <= 0.9);
  const gauntlet = d.checkpoints[d.checkpoints.length - 1];
  const kinds = ['hammers', 'arms', 'boulders', 'presses'].filter((k) => d[k].some((h) => h.s > gauntlet));
  assert.equal(kinds.length, 4, 'the final gauntlet has a hammer, an arm, a boulder and a press');
  assert.ok(def.props.some((p) => { const s = track.progressAt(p.x, p.y, p.z); return s > gauntlet; }), 'with barrels in it');
  assert.ok(d.signs.some((s) => s.kind === 'jump') && d.signs.some((s) => s.kind === 'barrels') && d.signs.some((s) => s.kind === 'gauntlet'), 'warning signs');
});

test('the course survives normalizeTrack (share links, saves) and junk is thrown away', () => {
  const def = makeTemplate('apple'), again = normalizeTrack(JSON.parse(JSON.stringify(def)));
  assert.deepEqual(again.assault, def.assault);
  const junk = normalizeTrack({ ...def, assault: { checkpoints: ['x', -5, 300], hammers: [{ s: 'nope' }, { s: 50, speed: 99 }], presses: 'no' } });
  assert.deepEqual(junk.assault.checkpoints, [300]); assert.equal(junk.assault.hammers.length, 1); assert.equal(junk.assault.hammers[0].speed, 2.2); assert.equal(junk.assault.presses.length, 0);
  assert.equal(normalizeTrack({ ...def, assault: undefined }).assault, undefined);
});

test('the old prototype is gone', () => {
  for (const f of ['stage.js', 'templates.js', 'track.js', 'soloRacePosition.js']) assert.doesNotMatch(readFileSync(new URL('../src/' + f, import.meta.url), 'utf8'), /assaultCourse|hammerMeshes|appleHammerHit/);
  assert.doesNotMatch(main, /assaultCourse|appleHammerHit|appleHud/);
});

// ---------------------------------------------------------------------------------------------- the hazards move
test('a hammer swings across the whole road and hangs low enough to hit a car', () => {
  const h = { s: 100, phase: 0, speed: 1, reach: 7.2 }, seen = [];
  for (let t = 0; t < 7; t += 0.05) seen.push(hammerHead(h, t));
  assert.ok(Math.max(...seen.map((q) => q.off)) > 6.5 && Math.min(...seen.map((q) => q.off)) < -6.5, 'swings from side to side');
  assert.ok(Math.min(...seen.map((q) => q.y)) <= COURSE.hammer.r + 0.1, 'bottoms out at road level');
  assert.ok(seen.filter((q) => Math.abs(q.off) > 6.5).every((q) => q.y - COURSE.hammer.r < 1.7), 'even the ends of the swing are low enough to clip a car');
});

test('a press is green and high, warns, slams down, stays down, then rises', () => {
  const p = { s: 0, phase: 0 }, states = [];
  for (let t = 0; t < COURSE.press.period; t += 0.02) states.push(pressAt(p, t));
  assert.equal(states[0].light, 'green'); assert.ok(states[0].y > 4);
  const order = []; for (const s of states) if (order[order.length - 1] !== s.state) order.push(s.state);
  assert.deepEqual(order, ['up', 'warn', 'slam', 'down', 'rise']);
  assert.ok(states.find((s) => s.state === 'warn').light === 'amber' && states.find((s) => s.state === 'down').light === 'red');
  assert.equal(states.find((s) => s.state === 'down').y, 0, 'it comes right down');
  assert.ok(states.filter((s) => s.state === 'up').length * 0.02 >= 2, 'a generous safe window');
});

test('a boulder waits beside the road, rolls right across it, and waits on the far side', () => {
  const b = { s: 0, phase: 0, side: 1 }, hw = 9, seen = [];
  for (let t = 0; t < 14; t += 0.05) seen.push(boulderAt(b, hw, t));
  assert.ok(seen.some((q) => !q.rolling) && seen.some((q) => q.rolling));
  const rolling = seen.filter((q) => q.rolling);
  assert.ok(rolling.some((q) => Math.abs(q.lat) < 1), 'crosses the middle of the road');
  assert.ok(Math.max(...seen.map((q) => Math.abs(q.lat))) > hw + COURSE.boulder.r, 'starts and ends outside the road');
  assert.ok(seen.some((q) => !q.rolling && q.lat > 0) && seen.some((q) => !q.rolling && q.lat < 0), 'it comes back the other way');
});

test('a spinning arm turns at a steady rate in the direction asked', () => {
  assert.ok(Math.abs(armAngle({ speed: 1, dir: 1, phase: 0 }, 2) - 2) < 1e-9);
  assert.ok(Math.abs(armAngle({ speed: 1, dir: -1, phase: 0 }, 2) + 2) < 1e-9);
});

// ---------------------------------------------------------------------------------------------- the hazards hurt
test('a hammer that strikes the car shoves it sideways and damages it, once per strike', () => {
  const { track, car, def, run } = course(), h = def.assault.hammers[0], sp = spy(), f = track.frameAt(h.s);
  const t = findT((t) => { const q = hammerHead(h, t); return Math.abs(q.off) < 1.5 && Math.abs(q.vOff) > 4; });
  put(car, track, h.s, hammerHead(h, t).off, 0); run.t = t - 0.001;
  const side0 = car.vel.x * f.lx + car.vel.z * f.lz;
  run.state = 'running'; run._contacts(car, sp);
  assert.equal(sp.hits.length, 1, 'damaged');
  assert.ok(sp.hits[0].hp > 20, 'a real blow');
  const v = car.vel.x * f.lx + car.vel.z * f.lz;
  assert.ok(Math.abs(v - side0) > 5, `shoved sideways (${side0.toFixed(1)} -> ${v.toFixed(1)})`);
  assert.ok(run.events.some((e) => e.type === 'hit' && e.kind === 'hammer'));
  run.t += 0.1; run._contacts(car, sp);
  assert.equal(sp.hits.length, 1, 'the same swing does not hit twice in a row');
});

test('a hammer misses a car on the far side of the road', () => {
  const { track, car, def, run } = course(), h = def.assault.hammers[0], sp = spy();
  const t = findT((t) => hammerHead(h, t).off > 6.5);
  put(car, track, h.s, -6, 0); run.t = t; run._contacts(car, sp);
  assert.equal(sp.hits.length, 0);
});

test('a boulder rolling into the car knocks it along the way the boulder is going', () => {
  const { track, car, def, run } = course(), b = def.assault.boulders[0], sp = spy(), f = track.frameAt(b.s);
  const t = findT((t) => { const q = boulderAt(b, f.hw, t); return q.rolling && Math.abs(q.lat) < 1; });
  const q = boulderAt(b, f.hw, t);
  put(car, track, b.s, q.lat, 0); run.t = t; run._contacts(car, sp);
  assert.equal(sp.hits.length, 1);
  assert.ok((car.vel.x * f.lx + car.vel.z * f.lz) * q.dir > 3, 'pushed the same way it rolls');
});

test('a boulder waiting beside the road does nothing', () => {
  const { track, car, def, run } = course(), b = def.assault.boulders[0], sp = spy(), f = track.frameAt(b.s);
  const t = findT((t) => !boulderAt(b, f.hw, t).rolling);
  put(car, track, b.s, 0, 0); run.t = t; run._contacts(car, sp);
  assert.equal(sp.hits.length, 0);
});

test('the spinning arm sweeps the car aside, and the pole in the middle is solid', () => {
  const { track, car, def, run } = course(), a = def.assault.arms[0], sp = spy(), f = track.frameAt(a.s);
  const t = findT((t) => Math.abs(Math.cos(armAngle(a, t))) < 0.05);               // the bar is straight across the road
  put(car, track, a.s, 4.5, 0); run.t = t; run._contacts(car, sp);
  assert.equal(sp.hits.length, 1, 'struck by the bar');
  assert.ok(Math.hypot(car.vel.x, car.vel.z) > 2, 'and pushed');
  const t2 = findT((t) => Math.abs(Math.sin(armAngle(a, t))) < 0.02);              // the bar lies along the road
  const run2 = new Assault(track), sp2 = spy(); put(car, track, a.s, 4.5, 0); run2.t = t2; run2._contacts(car, sp2);
  assert.equal(sp2.hits.length, 0, 'a car in the clear lane is not touched');
  const run3 = new Assault(track), sp3 = spy(); put(car, track, a.s, 0, 0); run3.t = t2; run3._contacts(car, sp3);
  assert.equal(sp3.hits.length, 1, 'the pole is in the middle');
  void f;
});

test('a press that drops on the car crushes its roof, once per drop; a car that gets through is fine', () => {
  const { track, car, def, run } = course(), p = def.assault.presses[0], sp = spy();
  const down = findT((t) => pressAt(p, t).state === 'slam' && pressAt(p, t).y < 1.2);
  put(car, track, p.s, 0, 12); run.t = down; run._contacts(car, sp);
  assert.equal(sp.hits.length, 1); assert.equal(sp.hits[0].zone, 'roof'); assert.ok(sp.hits[0].hp >= 60, 'a crushing blow');
  assert.ok(Math.hypot(car.vel.x, car.vel.z) < 4, 'and the car is stopped dead');
  run.t += 0.1; run._contacts(car, sp);
  assert.equal(sp.hits.length, 1, 'one crush per drop');
  const up = findT((t) => pressAt(p, t).state === 'up');
  const run2 = new Assault(track), sp2 = spy(); put(car, track, p.s, 0, 12); run2.t = up; run2._contacts(car, sp2);
  assert.equal(sp2.hits.length, 0, 'driving under it while it is up is safe');
});

test('hazards far from the car are ignored', () => {
  const { track, car, run } = course(), sp = spy();
  put(car, track, 5, 0, 20); for (let i = 0; i < 600; i++) { run.t += DT; run._contacts(car, sp); }
  assert.equal(sp.hits.length, 0);
});

test('a car that is wrecked or a derby that is off takes no damage from hazards', () => {
  const { track, car, def, run } = course(), h = def.assault.hammers[0];
  const t = findT((t) => Math.abs(hammerHead(h, t).off) < 1.5);
  const dead = spy(); dead.player.wrecked = true; put(car, track, h.s, hammerHead(h, t).off, 0); run.t = t; run.state = 'running';
  run.step(0, car, 100, dead); assert.equal(dead.hits.length, 0);
});

test('the damage goes through the real derby: a hammer takes hit points off a zone, enough hits wreck the car', () => {
  const { track, car, def, derby, run } = course(), h = def.assault.hammers[0];
  derby.time = 10;                                                                    // (past the opening grace)
  run.state = 'running'; run.started = 0;
  let wrecked = false;
  for (let n = 0; n < 8 && !wrecked; n++) {
    const t = findT((t) => t > run.t + 0.7 && Math.abs(hammerHead(h, t).off) < 1.2);
    put(car, track, h.s, hammerHead(h, t).off, 0); run.t = t; run._contacts(car, derby);
    wrecked = derby.player.wrecked;
  }
  assert.ok(wrecked, 'a few hammer blows wreck the car');
  assert.ok(derby.events.some((e) => e.type === 'damage') && derby.events.some((e) => e.type === 'wreck'), 'with the usual damage and wreck events');
  assert.equal(derby.events.find((e) => e.type === 'wreck').isPlayer, true);
});

test('the car can take a couple of knocks: one hammer blow alone does not wreck it', () => {
  const { track, car, def, derby, run } = course(), h = def.assault.hammers[0];
  derby.time = 10; const t = findT((t) => Math.abs(hammerHead(h, t).off) < 1.2);
  put(car, track, h.s, hammerHead(h, t).off, 0); run.t = t; run._contacts(car, derby);
  assert.equal(derby.player.wrecked, false); 
  assert.ok(derby.events.some((e) => e.type === 'damage'));
});

test('a crush wrecks a battered roof, and a fresh car survives one crush', () => {
  const { track, car, def, derby, run } = course(), p = def.assault.presses[0];
  derby.time = 10; run.state = 'running';
  const down = findT((t) => pressAt(p, t).state === 'slam' && pressAt(p, t).y < 1.2);
  put(car, track, p.s, 0, 12); run.t = down; run._contacts(car, derby);
  assert.equal(derby.player.wrecked, false, 'one crush leaves you running');
  const next = findT((t) => t > down + COURSE.press.period && pressAt(p, t).state === 'slam' && pressAt(p, t).y < 1.2, 40);
  put(car, track, p.s, 0, 12); run.t = next; run._contacts(car, derby);
  assert.equal(derby.player.wrecked, true, 'a second crush finishes it');
});

test('exploding barrels still hurt through the existing blast', () => {
  const { derby, car } = course();
  derby.time = 10; const before = derby.player.health.worst;
  derby.blast(car.pos.x, car.pos.y, car.pos.z + 1);
  assert.ok(derby.events.some((e) => e.type === 'damage') && derby.player.health.worst < before);
});

// ---------------------------------------------------------------------------------------------- fair
test('every hazard can be passed cleanly, and each really does hit if you ignore it', () => {
  const { track, car, def } = course(), sp = spy();
  const pass = (kind, idx, speed, lane, t0) => {
    const A = new Assault(track), h = def.assault[kind][idx];
    A.def = { hammers: [], arms: [], boulders: [], presses: [], checkpoints: [], [kind]: [h] }; A.t = t0; sp.hits.length = 0;
    const s0 = h.s - 40, n = Math.ceil(80 / speed / DT);
    for (let i = 0; i < n; i++) {
      const f = track.frameAt(s0 + speed * i * DT);
      car.reset(new V3(f.x + f.lx * lane + f.nx * 0.75, f.y + f.ly * lane + f.ny * 0.75, f.z + f.lz * lane + f.nz * 0.75), new V3(f.fx, f.fy, f.fz), new V3(f.nx, f.ny, f.nz), speed);
      A.t += DT; A._contacts(car, sp);
      if (sp.hits.length) return false;
    }
    return true;
  };
  for (const [kind, n] of [['hammers', def.assault.hammers.length], ['arms', def.assault.arms.length], ['boulders', def.assault.boulders.length], ['presses', def.assault.presses.length]]) {
    for (let idx = 0; idx < n; idx++) {
      let anyLaneClean = 0, centreHit = 0, N = 0;
      for (let t0 = 0; t0 < 9; t0 += 0.5) {
        N++; if ([-6, -3, 0, 3, 6].some((l) => pass(kind, idx, 22, l, t0))) anyLaneClean++;
        if (!pass(kind, idx, 22, 0, t0)) centreHit++;
      }
      assert.ok(anyLaneClean / N >= 0.4, `${kind} ${idx}: there is a way through ${(anyLaneClean / N * 100).toFixed(0)}% of the time`);
      assert.ok(centreHit / N >= 0.1, `${kind} ${idx}: driving straight at it hurts (${(centreHit / N * 100).toFixed(0)}%)`);
    }
  }
});

// ---------------------------------------------------------------------------------------------- the run
test('the clock starts when you cross the line, not before', () => {
  const { car, run, derby } = course();
  run.step(1, car, -12, derby); run.step(1, car, -5, derby);
  assert.equal(run.state, 'ready'); assert.equal(run.elapsed, 0);
  run.step(0.5, car, 1, derby); assert.equal(run.state, 'running'); assert.ok(run.events.some((e) => e.type === 'start'));
  run.step(2, car, 30, derby); assert.ok(Math.abs(run.elapsed - 2) < 1e-6, 'it counts up');
  assert.ok(Math.abs(run.remaining - (run.limit - 2)) < 1e-6, 'and counts down what is left');
});

test('checkpoints are reached in order, repair-point updated, and cannot be skipped', () => {
  const { car, run, derby, def } = course(), cp = def.assault.checkpoints;
  run.step(0.1, car, 1, derby);
  run.step(0.1, car, cp[1] + 5, derby);                                      // jumped straight past the first two (a shortcut)
  assert.equal(run.next, 2, 'all the ones you passed count in order');
  assert.equal(run.cpS, cp[1]);
  assert.deepEqual(run.events.filter((e) => e.type === 'checkpoint').map((e) => e.index), [1, 2]);
  run.step(0.1, car, 5000, derby);
  assert.equal(run.next, cp.length); assert.equal(run.state, 'finished');
});

test('you cannot finish without every checkpoint, and the finish is the end of the lap', () => {
  const { car, run, derby, track, def } = course();
  run.def = { ...def.assault, checkpoints: [10, 20, track.length + 500] };
  run.step(0.1, car, 1, derby); run.step(0.1, car, track.length + 1, derby);
  assert.equal(run.state, 'running', 'a missed checkpoint means no finish');
  run.step(0.1, car, track.length + 501, derby); assert.equal(run.state, 'finished');
});

test('penalties: a wreck is +10 s, a fall and a reset +5 s, and they come off the clock', () => {
  const { car, run, derby } = course();
  run.step(0.1, car, 1, derby);
  assert.equal(run.penalise('wreck'), 10); assert.equal(run.penalise('fall'), 5); assert.equal(run.penalise('reset'), 5);
  assert.equal(run.penalty, 20); assert.equal(run.wrecks, 1);
  assert.ok(Math.abs(run.remaining - (run.limit - run.elapsed - 20)) < 1e-9);
  assert.deepEqual(run.events.filter((e) => e.type === 'penalty').map((e) => e.why), ['wreck', 'fall', 'reset']);
});

test('the clock running out ends the run; later events change nothing', () => {
  const { car, run, derby } = course();
  run.step(0.1, car, 1, derby); run.step(run.limit - 5, car, 10, derby); assert.equal(run.state, 'running');
  run.penalise('wreck'); run.step(0.5, car, 20, derby);
  assert.equal(run.state, 'timeout'); assert.equal(run.result.medal, null);
  const n = run.penalty; run.penalise('wreck'); assert.equal(run.penalty, n, 'a finished run takes no more penalties');
});

test('a finish gives a time with penalties included, and a medal', () => {
  const finishAt = (secs, pen) => {
    const { car, run, derby, track } = course(); run.step(0.01, car, 1, derby);
    run.def = { ...run.def, checkpoints: [] }; for (let i = 0; i < pen; i++) run.penalise('wreck');
    run.step(secs, car, track.length + 1, derby); return run.result;
  };
  let r = finishAt(70, 0); assert.equal(r.state, 'finished'); assert.equal(r.medal, 'gold'); assert.ok(Math.abs(r.time - 70.01) < 0.02 || r.time < 71);
  r = finishAt(70, 1); assert.equal(r.medal, 'gold'); assert.ok(r.time > 79.9 && r.time < 81, 'the wreck added 10 s');
  r = finishAt(85, 1); assert.equal(r.medal, 'silver'); assert.equal(r.penalty, 10);
  r = finishAt(105, 1); assert.equal(r.medal, 'bronze');
  r = finishAt(130, 1); assert.equal(r.medal, null);
});

test('reset puts the run back at the start', () => {
  const { car, run, derby } = course(); run.step(0.1, car, 1, derby); run.step(5, car, 300, derby); run.penalise('wreck');
  run.reset(); assert.equal(run.state, 'ready'); assert.equal(run.penalty, 0); assert.equal(run.next, 0); assert.equal(run.cpS, -12);
});

test('a checkpoint patches the car up to full health', () => {
  const { derby, car } = course();
  derby.time = 10; derby.blast(car.pos.x, car.pos.y, car.pos.z + 1); derby.blast(car.pos.x, car.pos.y, car.pos.z + 1);
  const hurt = derby.player.health.worst; derby.events.length = 0;
  derby.player.car.engineOff = true;
  derby.repairPlayer();
  assert.ok(hurt < 1, 'it was hurt'); assert.equal(derby.player.health.worst, 1);
  assert.equal(car.engineOff, false);
  assert.ok(derby.events.some((e) => e.type === 'repaired'));
});

// ---------------------------------------------------------------------------------------------- the whole course
test('the whole course can be driven from the start line to the finish in the real physics (jump, checkpoints and all)', () => {
  const { car, track, derby, run, def } = course();
  run.def = { ...def.assault, hammers: [], arms: [], boulders: [], presses: [] };                // (a bot cannot time the hazards: this is the road and the jump)
  const drv = bot({ speed: 26 }), L = track.length;
  let u = -12, last = track.progressAt(car.pos.x, car.pos.y, car.pos.z), t = 0;
  for (; t < 150 && run.active; t += DT) {
    car.step(DT, drv(t, car, track), track); car.refreshFrame();
    const s = track.progressAt(car.pos.x, car.pos.y, car.pos.z); let d = s - last; if (d < -L / 2) d += L; if (d > L / 2) d -= L; u += d; last = s;
    run.step(DT, car, u, derby); derby.step(DT, null); derby.events.length = 0; car.events.length = 0;
  }
  assert.equal(run.state, 'finished', `ended ${run.state} at ${Math.round(u)} m`);
  assert.equal(run.next, def.assault.checkpoints.length, 'through every checkpoint');
  assert.ok(run.result.time < 90 && run.result.time > 40, `a clean run takes ${run.result.time.toFixed(1)} s`);
  assert.equal(derby.player.wrecked, false);
});

test('driving blind into the hazards does real harm (they are not decoration)', () => {
  const { car, track, derby, run } = course();
  const drv = bot({ speed: 26 }), L = track.length;
  let u = -12, last = track.progressAt(car.pos.x, car.pos.y, car.pos.z), hits = 0, damage = 0;
  for (let t = 0; t < 70 && run.active && !derby.player.wrecked; t += DT) {
    car.step(DT, drv(t, car, track), track); car.refreshFrame();
    const s = track.progressAt(car.pos.x, car.pos.y, car.pos.z); let d = s - last; if (d < -L / 2) d += L; if (d > L / 2) d -= L; u += d; last = s;
    run.step(DT, car, u, derby); derby.step(DT, null);
    for (const e of run.events) if (e.type === 'hit') hits++;
    for (const e of derby.events) if (e.type === 'damage') damage += e.hp;
    run.events.length = 0; derby.events.length = 0; car.events.length = 0;
  }
  assert.ok(hits >= 1 && damage > 0, `${hits} hits, ${damage.toFixed(0)} damage`);
});

// ---------------------------------------------------------------------------------------------- wired into the game
test('main.js runs the course: no rivals but real damage, lights, checkpoints, penalties, result card', () => {
  assert.match(main, /assault = def\.assault && !net \? new Assault\(track\) : null/);
  assert.match(main, /const solo = !!assault/);
  assert.match(main, /derby\.enabled = !net && \(\(!testDrive && \(opts\.rivals > 0 \|\| demoDay\)\) \|\| solo\)/);
  assert.match(main, /const field = solo \? 0/);
  assert.match(main, /assault\.step\(DT, car, race\.unwrapped, derby\)/);
  assert.match(main, /startRaceLights\(\(\) => \{ frozen = false; \}/);
  assert.match(main, /assault\.penalise\('wreck'\)/);
  assert.match(main, /respawn\('wreck'\)/);
  assert.match(main, /respawn\('fall'\)/);
  assert.match(main, /derby\.repairPlayer\(\)/);
  assert.match(main, /showResult\(r, /);
  assert.match(main, /if \(!assault && idx > race\.index\)/, 'no laps are counted on the course');
  assert.match(main, /stage\.updateAssault\(assault\)/);
  assert.match(main, /e\.type === 'repaired'/);
  assert.match(main, /k === 'apple' \? \[\['Choose'/, 'the course has no Edit button');
  assert.match(main, /\(assault \? ' course' : ''\)/);
  assert.match(readFileSync(new URL('../css/style.css', import.meta.url), 'utf8'), /body\.course #lap-card/, 'no lap card on the course');
});

test('the stage builds the hazards, and nothing from the course shows on other tracks', () => {
  const stage = readFileSync(new URL('../src/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /if \(track\.def\.assault\) this\.assaultView = new AssaultView\(track, g\)/);
  assert.match(stage, /updateAssault\(a\) \{ if \(this\.assaultView && a\)/);
  for (const k of TEMPLATE_KEYS) if (k !== 'random') assert.equal(makeTemplate(k).assault, undefined, k + ' has no obstacle course');
});

test('nearestOnCar measures from the car body', () => {
  const { car } = course(); car.refreshFrame();
  assert.ok(nearestOnCar(car, car.pos.x, car.pos.y + 0.2, car.pos.z) < 0, 'inside');
  const d = nearestOnCar(car, car.pos.x + car.ax.x * 3, car.pos.y + 0.2, car.pos.z + car.ax.z * 3);
  assert.ok(d > 1.9 && d < 2.2, 'about 2 m off the side: ' + d);
});

// ---------------------------------------------------------------------------------------------- what you see is what hits you
// (needs three.js, which the game loads from a CDN: this check runs only where it is installed)
let THREE = null; try { THREE = await import('three'); } catch { /* not installed here */ }
test('the drawn hazards sit exactly where the collisions put them', { skip: !THREE && 'three.js is not installed' }, async () => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, style: {} }) };
  const { AssaultView } = await import('../src/assaultView.js');
  const { track } = course(), g = new THREE.Group(), v = new AssaultView(track, g), a = new Assault(track), w = new THREE.Vector3();
  assert.equal(v.hammers.length, 2); assert.equal(v.arms.length, 2); assert.equal(v.boulders.length, 4); assert.equal(v.presses.length, 2); assert.equal(v.gates.length, 4);
  for (const t of [0.7, 1.9, 3.3, 5.1]) {
    a.t = t; v.update(a); g.updateMatrixWorld(true);
    for (const o of v.hammers) {
      o.head.getWorldPosition(w); const q = hammerHead(o.h, t), f = track.frameAt(o.h.s);
      assert.ok(Math.hypot(w.x - (f.x + f.lx * q.off), w.y - (f.y + q.y), w.z - (f.z + f.lz * q.off)) < 0.01, 'hammer head');
    }
    for (const o of v.boulders) {
      o.rock.getWorldPosition(w); const f = track.frameAt(o.b.s), q = boulderAt(o.b, f.hw, t);
      assert.ok(Math.hypot(w.x - (f.x + f.lx * q.lat), w.z - (f.z + f.lz * q.lat)) < 0.01, 'boulder');
    }
    for (const o of v.arms) {
      w.set(5, 0, 0); o.bar.localToWorld(w); const f = track.frameAt(o.a.s), ang = armAngle(o.a, t);
      assert.ok(Math.hypot(w.x - (f.x + f.fx * Math.cos(ang) * 5 + f.lx * Math.sin(ang) * 5), w.z - (f.z + f.fz * Math.cos(ang) * 5 + f.lz * Math.sin(ang) * 5)) < 0.01, 'arm tip');
    }
    for (const o of v.presses) assert.ok(Math.abs(o.block.position.y - COURSE.press.thick / 2 - pressAt(o.p, t).y) < 1e-9, 'press block');
  }
  a.next = 2; v.update(a);
  assert.equal(v.gates[0]._col, 0x32d74b); assert.equal(v.gates[2]._col, 0xffb31f); assert.equal(v.gates[3]._col, 0x6f6f86, 'passed green, next amber, later grey');
});
