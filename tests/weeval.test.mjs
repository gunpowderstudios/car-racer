// Weeval Keneval: the layout grows each stage, the aim speeds really land the bullseye, a landing scores by ring and a miss costs a try.
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

test('W and S tip the car in mid-air (Weeval Keneval only), and the code says so', () => {
  const src = readFileSync(new URL('../src/vehicle.js', import.meta.url), 'utf8');
  assert.match(src, /def\.weeval && this\.airTime > 0\.1/);
  const run = (key) => fly(5, WEEVAL.aim[4], newRun(), (car) => (!car.onGround && car.airTime > 0.1 ? { [key]: 1 } : {}));
  const noseDown = run('throttle'), noseUp = run('brake');
  assert.notEqual(noseDown.car.az.y.toFixed(2), noseUp.car.az.y.toFixed(2));
});
