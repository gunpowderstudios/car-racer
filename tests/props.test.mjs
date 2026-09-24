// Barrels: placement, resting, being hit, exploding, chain reactions, walls.
// Run with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeTrack, TRACK_VERSION } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { makeTemplate, TEMPLATE_KEYS } from '../src/templates.js';
import { Props, placeProp, BARREL, BLAST } from '../src/props.js';
import { DRAG_DEF, placeOnTrack, DT } from './harness.mjs';

/** Drag strip with barrels at the given (x, z); the straight part runs along x = 0 between z = -550 and 550. */
function setup(points, base = DRAG_DEF) {
  const def = { ...base, props: [] };
  let track = new Track(def);
  def.props = points.map(([x, z]) => { const p = placeProp(track, x, z); return { type: 'barrel', x: p.x, z: p.z, y: p.y }; });
  track = new Track(def);
  const props = new Props(); props.load(track, track.def.props);
  return { track, props };
}

/** Drive straight at `speed` (holding it), stepping the barrels too. Returns what happened. */
function drive(track, props, speed, seconds, z0 = -385) {
  const car = new Vehicle(); placeOnTrack(car, track, track.progressAt(0, 0.65, z0), 0, speed);
  const log = { blasts: [], clangs: 0, clangTimes: [], slowest: speed, minUp: 1 };
  for (let i = 0; i < seconds / DT; i++) {
    const err = speed - car.speed;
    car.step(DT, { throttle: Math.max(0, Math.min(1, err / 3 + 0.15)), brake: 0, steer: 0, handbrake: false }, track);
    props.step(DT, car);
    for (const e of props.events) { if (e.type === 'blast') log.blasts.push({ t: i * DT, dist: e.dist }); else if (e.type === 'clang') { log.clangs++; log.clangTimes.push(i * DT); } }
    props.events.length = 0;
    if (!log.blasts.length) log.slowest = Math.min(log.slowest, car.speed);          // before any blast: what the drum itself cost
    log.minUp = Math.min(log.minUp, props.barrels[0].axis.y);
  }
  return { car, log };
}

// ---------------------------------------------------------------- data

test('props are part of the track format: kept, cleaned and defaulted', () => {
  assert.equal(TRACK_VERSION, 6);
  const def = normalizeTrack({ handles: makeTemplate('kidney').handles, props: [
    { type: 'barrel', x: 10.123, z: -4, y: 0.65 }, { type: 'sofa', x: 0, z: 0 }, { type: 'barrel', x: 'nope', z: 1 }, null,
  ] });
  assert.equal(def.props.length, 1, 'only the valid barrel survives');
  assert.deepEqual(def.props[0], { type: 'barrel', x: 10.12, z: -4, y: 0.65 });
  assert.deepEqual(normalizeTrack({ handles: makeTemplate('kidney').handles }).props, [], 'old files load with no props');
  const again = normalizeTrack(JSON.parse(JSON.stringify(def)));
  assert.deepEqual(again.props, def.props, 'survives an export / import round trip');
  assert.ok(normalizeTrack({ props: Array.from({ length: 900 }, () => ({ type: 'barrel', x: 1, z: 1 })) }).props.length <= 400);
});

test('placeProp puts a barrel on the road, and never inside a barrier', () => {
  const track = new Track(DRAG_DEF);
  const mid = placeProp(track, 0, 0);
  assert.ok(Math.abs(mid.y - 0.65) < 0.02, 'road surface height ' + mid.y);
  const hw = track.hw[track.progressAt(0, 0.65, 0) / track.ds | 0], face = hw + 0.6;
  for (const x of [face - 0.1, face + 0.1, face + 0.3, -(face + 0.2)]) {
    const p = placeProp(track, x, 0);
    const reach = Math.abs(p.x) + BARREL.radius;
    const clear = reach <= face + 1e-6 || Math.abs(p.x) - BARREL.radius >= face + 0.5 - 1e-6;
    assert.ok(clear, `x=${x} ended at ${p.x} which overlaps the wall (face ${face})`);
  }
});

// ------------------------------------------------------------- resting

test('barrels settle upright, fall asleep, and do not creep on banks and hills', () => {
  for (const key of TEMPLATE_KEYS) {
    const def = makeTemplate(key); let track = new Track(def);
    const pts = [];
    for (let s = 30; s < track.length; s += track.length / 12) for (const off of [-0.7, 0, 0.7]) {
      const f = track.frameAt(s), d = off * f.hw;
      pts.push(placeProp(track, f.x + track.lx[f.idx] * d, f.z + track.lz[f.idx] * d, f.y + 5));
    }
    def.props = pts.map((p) => ({ type: 'barrel', x: p.x, z: p.z, y: p.y })); track = new Track(def);
    const props = new Props(); props.load(track, track.def.props);
    props.barrels.forEach((b) => { b.asleep = false; });                       // make them prove it
    const start = props.barrels.map((b) => b.pos.clone());
    for (let i = 0; i < 360; i++) props.step(DT, null);
    props.barrels.forEach((b, k) => {
      assert.ok(b.asleep, `${key} barrel ${k} never fell asleep`);
      assert.ok(Math.hypot(b.pos.x - start[k].x, b.pos.z - start[k].z) < 0.05, `${key} barrel ${k} crept`);
      assert.ok(b.axis.y > 0.93, `${key} barrel ${k} tipped over (axis.y ${b.axis.y})`);
    });
  }
});

// ------------------------------------------------------------ hitting

test('a soft nudge does not light a barrel; a proper hit does, and it goes off a moment later', () => {
  {
    const { track, props } = setup([[0, -350]]);
    const { log } = drive(track, props, 2, 45 / 2 + 5);
    assert.equal(log.blasts.length, 0, 'a 2 m/s nudge should not set it off');
    assert.ok(props.barrels[0].alive);
  }
  for (const v of [5, 9, 20, 45]) {
    const { track, props } = setup([[0, -350]]);
    const { log } = drive(track, props, v, 45 / v + 5);
    assert.equal(log.blasts.length, 1, `one blast at ${v} m/s`);
    assert.ok(log.clangs > 0, 'the hit clangs');
    const delay = log.blasts[0].t - log.clangTimes[0];
    assert.ok(delay > BARREL.fuse - 0.15 && delay < BARREL.fuse + 0.15, `blast came ${delay.toFixed(2)} s after the hit, fuse is ${BARREL.fuse}`);
    assert.ok(props.bits.some((p) => p.life > 0), 'scrap was thrown');
  }
});

test('a lit barrel keeps flying and bouncing during the delay, and the fuse counts down on it', () => {
  const { track, props } = setup([[0, -350]]);
  const car = new Vehicle(); placeOnTrack(car, track, track.progressAt(0, 0.65, -385), 0, 15);
  let lit = null, moved = 0;
  for (let i = 0; i < 4 / DT; i++) {
    car.step(DT, { throttle: 0.4, brake: 0, steer: 0, handbrake: false }, track); props.step(DT, car); props.events.length = 0;
    const b = props.barrels[0];
    if (lit === null && b.fuse >= 0) lit = { z: b.pos.z, fuse: b.fuse };
    if (lit && b.alive) moved = Math.max(moved, b.pos.z - lit.z);
  }
  assert.ok(lit && lit.fuse <= BARREL.fuse + 1e-9, 'fuse was lit');
  assert.ok(moved > 3, `it travelled ${moved.toFixed(1)} m with the fuse burning`);
});

test('barrels are 20% bigger than the first version', () => {
  assert.ok(Math.abs(BARREL.height / 0.9 - 1.2) < 1e-9 && Math.abs(BARREL.radius / 0.3 - 1.2) < 1e-9);
});

test('a dropped barrel bounces, and clangs when it lands', () => {
  const { props } = setup([[0, 0]]);
  const b = props.barrels[0]; b.asleep = false; b.pos.y += 3;
  const impacts = []; let vLand = 0, vUp = 0, landed = false;
  for (let i = 0; i < 300; i++) {
    const vBefore = b.vel.y;
    props.step(DT, null);
    for (const e of props.events) if (e.type === 'clang') impacts.push(e.speed);
    props.events.length = 0;
    if (!landed && b.vel.y > 0 && vBefore < 0) { landed = true; vLand = -vBefore; vUp = b.vel.y; }
  }
  assert.ok(landed && vLand > 6, 'it fell fast enough to matter: ' + vLand.toFixed(1));
  assert.ok(vUp > 0.25 * vLand, `it rebounded at ${vUp.toFixed(1)} m/s after landing at ${vLand.toFixed(1)}`);
  assert.ok(impacts.length >= 2 && impacts[0] > 5, 'clang on landing, and again on the bounce: ' + impacts.map((v) => v.toFixed(1)));
  for (let i = 0; i < 480; i++) props.step(DT, null);
  assert.ok(b.asleep, 'and it comes to rest');
});

test('a hit at 9 m/s costs the car very little, and a drum tumbles rather than sliding along upright', () => {
  for (const v of [9, 11]) {
    const { track, props } = setup([[0, -350]]);
    const { log } = drive(track, props, v, 45 / v + 3);
    assert.ok(v - log.slowest < 2, `lost ${(v - log.slowest).toFixed(1)} m/s to one drum at ${v}`);
    assert.ok(log.minUp < 0.5, `at ${v} m/s it went over (min axis.y ${log.minUp.toFixed(2)})`);
  }
});

test('an explosion sets off the barrels beside it, one after another, and throws the far ones', () => {
  const { track, props } = setup([[0, -350], [1, -348], [-1, -345], [0, -340], [0, -300]]);
  const { log } = drive(track, props, 30, 5);
  assert.ok(log.blasts.length >= 4, `chain gave ${log.blasts.length} blasts`);
  const times = log.blasts.map((b) => b.t);
  assert.ok(times[times.length - 1] - times[0] > 0.1, 'the chain takes a moment, it is not instant');
  const far = props.barrels[4];
  assert.ok(far.alive, 'a barrel 50 m away is untouched');
  assert.ok(Math.hypot(far.pos.x, far.pos.z + 300) < 6, 'and has hardly moved');
});

test('a barrel next to one that goes off is thrown clear and set off in turn', () => {
  const { props } = setup([[0, 0], [2.5, 0], [30, 0]]);
  props._light(props.barrels[0], 0.1);
  let thrown = 0, blasts = 0;
  for (let i = 0; i < 3 / DT; i++) {
    props.step(DT, null);
    blasts += props.events.filter((e) => e.type === 'blast').length; props.events.length = 0;
    thrown = Math.max(thrown, props.barrels[1].vel.length());
  }
  assert.ok(thrown > 4, 'flung at ' + thrown.toFixed(1) + ' m/s');
  assert.equal(blasts, 2, 'the neighbour went off too');
  assert.ok(props.barrels[2].alive, 'the one 30 m away did not');
});

// -------------------------------------------------------------- walls

test('barrels bounce off the barrier from either side and never end up inside it', () => {
  const { track, props } = setup([[8, 0]]);
  const b = props.barrels[0]; b.asleep = false; b.vel.set(9, 2, 0);
  const hw = track.hw[track.progressAt(0, 0.65, 0) / track.ds | 0], face = hw + 0.6;
  let edge = 0;
  for (let i = 0; i < 480; i++) { props.step(DT, null); edge = Math.max(edge, b.pos.x + BARREL.radius * 0.9); props.events.length = 0; }
  assert.ok(edge <= face + 0.15, `reached ${edge.toFixed(2)}, the wall face is at ${face}`);

  const out = setup([[hw + 3, 0]]);
  const o = out.props.barrels[0]; o.asleep = false; o.vel.set(-9, 2, 0);
  let inner = 1e9;
  for (let i = 0; i < 480; i++) { out.props.step(DT, null); inner = Math.min(inner, o.pos.x - BARREL.radius * 0.9); out.props.events.length = 0; }
  assert.ok(inner >= face + 0.5 - 0.15, `outside barrel reached ${inner.toFixed(2)}, wall back is at ${face + 0.5}`);
});

// ---------------------------------------------------------- housekeeping

test('reset puts every barrel back where the editor left it', () => {
  const { track, props } = setup([[0, -350], [1, -348], [3, -340]]);
  const home = props.barrels.map((b) => b.pos.clone());
  drive(track, props, 30, 4);
  assert.ok(props.alive < 3);
  props.reset();
  assert.equal(props.alive, 3);
  props.barrels.forEach((b, i) => { assert.ok(b.asleep); assert.ok(Math.hypot(b.pos.x - home[i].x, b.pos.z - home[i].z) < 1e-9); });
  assert.ok(props.bits.every((p) => p.life <= 0));
});

test('a pile of 60 barrels hit at 40 m/s stays finite, quick and leaves the car alone afterwards', () => {
  const pts = []; for (let r = 0; r < 10; r++) for (let c = 0; c < 6; c++) pts.push([-6 + c * 2.4 + (r % 2) * 1.2, -340 + r * 2.2]);
  const { track, props } = setup(pts);
  const t0 = performance.now();
  const { car, log } = drive(track, props, 40, 6);
  const ms = performance.now() - t0;
  assert.ok(props.barrels.every((b) => Number.isFinite(b.pos.x + b.pos.y + b.pos.z + b.q.w)));
  assert.ok(Number.isFinite(car.pos.x + car.pos.y + car.pos.z));
  assert.ok(log.blasts.length > 20, `only ${log.blasts.length} went off`);
  assert.ok(car.ay.y > 0.8, 'car upright');
  assert.ok(ms < 3000, `took ${ms.toFixed(0)} ms`);
});

test('constants stay sane', () => {
  assert.ok(BARREL.lightSpeed < BARREL.chainSpeed && BARREL.fuse > 0.2 && BARREL.fuse < 2);
  assert.ok(BLAST.chainRadius < BLAST.radius);
});
