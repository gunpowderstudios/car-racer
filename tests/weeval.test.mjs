// Weeval Knievel: the layout grows each stage, the aim speeds really land the bullseye, a landing scores by ring and a miss costs a try.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Track } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { V3 } from '../src/math.js';
import { WEEVAL, stageLayout, weevalDef, Weeval, newRun, ringOf } from '../src/weeval.js';

const DT = 1 / 120;
function fly(stage, v, run = newRun(), input = () => ({})) {
  const track = new Track(weevalDef(stage)), car = new Vehicle(), f = track.frameAt(12);
  car.reset(new V3(f.x + f.nx * (car.restHeight + .05), f.y + f.ny * (car.restHeight + .05), f.z), new V3(f.fx, f.fy, f.fz), new V3(f.nx, f.ny, f.nz), 0);
  const w = new Weeval(track, run); w.go(); const ev = [];
  for (let i = 0; i < 120 * 70 && w.active; i++) {
    const e = v - car.fwdSpeed, air = !car.onGround && car.airTime > 0.1;
    car.step(DT, { throttle: air ? 0 : e > 0 ? Math.min(1, e / 3) : 0, brake: air ? 0 : e < -1 ? Math.min(1, -e / 5) : 0, steer: 0, handbrake: false, ...input(car, i) }, track);
    w.step(DT, car, null); ev.push(...w.events.splice(0));
  }
  return { w, ev, car };
}

test('every stage adds a bus and a longer gap, and the bullseye moves out', () => {
  let prev = null;
  for (let n = 1; n <= WEEVAL.stages; n++) {
    const L = stageLayout(n);
    assert.equal(L.buses, n + 2);
    assert.equal(L.busList.length, WEEVAL.showBuses ? n + 2 : 0);
    if (prev) { assert.equal(L.lipY - prev.lipY, WEEVAL.riseStep); assert.equal(L.lipX - prev.lipX, WEEVAL.runStep); }
    if (L.busList.length) assert.ok(L.busList[0].x0 > L.lipX && L.busList[L.busList.length - 1].x1 < L.gapEnd, 'the buses fit in the gap');
    if (prev) { assert.ok(L.gap > prev.gap, 'gap grows'); assert.ok(L.zoneX > prev.zoneX, 'zone moves out'); }
    prev = L;
  }
  assert.equal(stageLayout(1).buses, 3);
  assert.equal(stageLayout(1).gap, 70); assert.equal(stageLayout(2).gap, 100);
});

test('the track builds for every stage: a gap, solid buses and a barrier', () => {
  for (let n = 1; n <= WEEVAL.stages; n++) {
    const t = new Track(weevalDef(n));
    assert.equal(t.def.weeval.stage, n);
    assert.equal(t.blocks.filter((b) => b.kind === 'bus').length, WEEVAL.showBuses ? n + 2 : 0);
    assert.ok(t.blocks.some((b) => b.kind === 'wall'));
    if (WEEVAL.showBuses) for (const b of t.blocks.filter((k) => k.kind === 'bus')) assert.ok(b.y < t.def.handles[0].y, 'buses stand on a platform below the lip');
    assert.ok(t.gap.some((g) => g), 'there is a gap');
  }
});

test('rings: the middle is worth most, outside the rings the ramp is worth a little', () => {
  const L = stageLayout(3);
  assert.equal(ringOf(L, L.zoneX, 0).points, WEEVAL.points[0]);
  assert.equal(ringOf(L, L.zoneX + WEEVAL.rings[1] - 0.1, 0).ring, 1);
  assert.equal(ringOf(L, L.zoneX, WEEVAL.rings[3] - 0.1).ring, 3);
  assert.equal(ringOf(L, L.zoneX + 30, 0).points, WEEVAL.ramp_pts);
});

test('the aim speed for each stage lands on the bullseye and clears the stage', () => {
  for (const n of [1, 2]) {
    const { w, ev } = fly(n, WEEVAL.aim[n - 1]);
    const touch = ev.find((e) => e.type === 'touch');
    assert.ok(touch, `stage ${n} touched down`);
    assert.ok(touch.d < 6, `stage ${n} landed ${touch.d.toFixed(1)} m from the middle`);
  }
});

test('too slow drops you in the buses and costs a try; three fails end the run', () => {
  const run = newRun();
  const a = fly(3, 12, run);
  assert.equal(a.w.state, 'failed'); assert.equal(run.tries, 2);
  assert.equal(a.ev.find((e) => e.type === 'fail').why, 'short');
  fly(3, 12, run); const c = fly(3, 12, run);
  assert.equal(c.w.state, 'over'); assert.ok(run.over);
});

test('advancing resets the tries and moves to the next stage', () => {
  const run = newRun(); const track = new Track(weevalDef(1)); const w = new Weeval(track, run);
  run.tries = 1; assert.ok(w.advance()); assert.equal(run.stage, 2); assert.equal(run.tries, WEEVAL.tries);
});

test('W and S tip the car in mid-air (Weeval Knievel only), and the code says so', () => {
  const src = readFileSync(new URL('../src/vehicle.js', import.meta.url), 'utf8');
  assert.match(src, /def\.weeval && this\.airTime > 0\.1/);
  const run = (key) => fly(5, WEEVAL.aim[4], newRun(), (car) => (!car.onGround && car.airTime > 0.1 ? { [key]: 1 } : {}));
  const noseDown = run('throttle'), noseUp = run('brake');
  assert.notEqual(noseDown.car.az.y.toFixed(2), noseUp.car.az.y.toFixed(2));
});

test('go again after a clear costs a try, keeps the better jump, and a failed go-again leaves the first clear standing', () => {
  const run = newRun(); run.stage = 2;
  const w = new Weeval(new Track(weevalDef(2)), run);
  w.state = 'clear'; w.last = { points: 1000, stage: 2, done: false }; run.total = 1000; run.scores = [1000];
  assert.ok(w.goAgain()); assert.equal(run.tries, WEEVAL.tries - 1);
  w.state = 'landed'; w.land = { x: 0, z: 0, ring: 1, d: 3, points: 600, tilt: 0, flat: true }; w.sinceLand = 0;
  w._judge({ ay: { y: 1 } }, null, false);                        // 600 + 200 + 100 = 900: worse than the first jump
  assert.equal(run.total, 1000); assert.equal(w.state, 'clear');
  w.state = 'clear'; assert.ok(w.goAgain());                      // second go-again, then it goes wrong
  w.state = 'run'; w.wreck();
  assert.equal(w.state, 'clear'); assert.equal(run.total, 1000); assert.equal(run.tries, WEEVAL.tries - 2);
  assert.ok(!w.goAgain(), 'the last try cannot be spent on a go-again');
});

test('the cardboard stack sits at the end of the run-out and comes 10 m nearer each stage (no skull barrels)', () => {
  for (let n = 1; n <= WEEVAL.stages; n++) {
    const L = stageLayout(n), d = weevalDef(n);
    assert.equal(d.props.length, 0, 'no barrels on the track');
    assert.ok(L.stackX > L.landEnd + 10 && L.stackX < L.endX - 6, 'on the flat run-out, before the wall');
    assert.equal(L.endX - L.stackX, Math.min(12 + 10 * (n - 1), WEEVAL.runOut - 14), 'ten metres nearer every stage until it reaches its limit');
  }
});

test('a lethal barrel still ends the whole run if a track has one', () => {
  const t = new Track(weevalDef(3)), w = new Weeval(t, newRun()); w.go(); w.explode();
  assert.equal(w.state, 'over'); assert.equal(w.run.over, true);
  assert.equal(w.events.at(-1).why, 'exploded'); assert.equal(w.events.at(-1).over, true);
});

test('landing upside down still clears the stage (no level bonus)', () => {
  const t = new Track(weevalDef(2)), w = new Weeval(t, newRun()), L = w.L;
  const car = { pos: { x: L.zoneX, y: L.low + 1, z: 0 }, speed: 0, ay: { x: 0, y: -1, z: 0 }, ax: { x: 1, y: 0, z: 0 }, az: { x: 0, y: 0, z: 1 }, onGround: true };
  w.go(); w.state = 'landed'; w.land = { x: L.zoneX, z: 0, ring: 0, d: 0, points: 1000, tilt: 180, speed: 0, air: 2, flat: false };
  for (let i = 0; i < 120; i++) w.step(1 / 60, car, null);
  assert.equal(w.state, 'clear'); assert.equal(w.run.tries, WEEVAL.tries); assert.equal(w.last.flat, false);
  assert.equal(w.last.points, 1000 + WEEVAL.cleanBonus);
  assert.equal(w.advance(), true);
});
