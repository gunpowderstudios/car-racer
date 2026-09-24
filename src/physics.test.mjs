// Run with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, SURF, analyzeTrack, normalizeTrack, suggestBanks } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { makeTemplate, TEMPLATE_KEYS } from '../src/templates.js';
import { makeSim, run, bot, placeOnTrack, DRAG_DEF } from './harness.mjs';

const heading = (c) => Math.atan2(c.az.x, c.az.z) * 57.29578;
const wrap180 = (d) => { while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

// ------------------------------------------------------------------- track

test('every template builds, closes its loop and has no tight corners', () => {
  test('a car pinned against a wall can steer off it (no gutter at the wall foot)', () => {
  const track = new Track(DRAG_DEF);
  const hw = track.hw[0];
  for (const v of [8, 20, 35]) {
    // run along the right-hand wall, drifting into it
    const car = new Vehicle(); placeOnTrack(car, track, 1150, -(hw - 1.5), v);
    let hitAt = null, clearAt = null, minUp = 1;
    run(car, track, 5, (t, c) => {
      const d = track.query(c.pos.x, c.pos.y, c.pos.z).d;
      if (hitAt === null && c.events.some((e) => e.type === 'wall')) hitAt = t;
      c.events.length = 0;
      if (hitAt !== null && t - hitAt < 1) minUp = Math.min(minUp, c.ay.y);
      if (hitAt !== null && t - hitAt > 1 && clearAt === null && -d < hw - 2) clearAt = t;
      if (hitAt === null || t - hitAt < 1) return { steer: -0.25, throttle: 0.5 };   // lean on the wall for a second
      return { steer: 0.6, throttle: 0.6 };                                            // then steer away
    });
    assert.ok(hitAt !== null, `v${v}: should reach the wall`);
    assert.ok(minUp > 0.97, `v${v}: car should not lean into the wall (up ${minUp.toFixed(3)})`);
    assert.ok(clearAt !== null && clearAt - hitAt - 1 < 1.2, `v${v}: should get clear of the wall quickly (${clearAt === null ? 'never' : (clearAt - hitAt - 1).toFixed(2) + 's'})`);
  }
});

for (const key of TEMPLATE_KEYS) {
    const track = new Track(makeTemplate(key));
    assert.ok(track.length > 800, `${key} too short`);
    const dx = track.px[0] - track.px[track.n - 1], dz = track.pz[0] - track.pz[track.n - 1];
    assert.ok(Math.hypot(dx, dz) < track.ds * 1.5, `${key} loop does not close`);
    const a = analyzeTrack(track);
    assert.equal(a.tight.length, 0, `${key} has tight corners`);
    assert.equal(a.crossings.length, 0, `${key} crosses itself at road level`);
  }
});

test('centreline queries return road surface at the right height, edges and walls behave', () => {
  const track = new Track(makeTemplate('kidney'));
  const q = Track.newQuery();
  for (let i = 0; i < track.n; i += 37) {
    track.query(track.px[i], track.py[i] + 4, track.pz[i], q);
    assert.equal(q.surface, SURF.ROAD);
    assert.ok(Math.abs(q.d) < 0.1, 'centre should have d ~ 0');
    assert.ok(Math.abs(q.y - track.py[i]) < 0.05);
    assert.equal(track.wallPenetration(q, q.y + 0.5), 0);
    // a point just past the wall face is inside the wall
    const sg = 1, off = track.hw[i] + 0.6 + 1.2;
    track.query(track.px[i] + track.lx[i] * off * sg, track.py[i] + 6, track.pz[i] + track.lz[i] * off * sg, q);
    assert.ok(track.wallPenetration(q, q.y + 0.5) > 0.4, 'expected wall penetration at sample ' + i);
  }
});

test('bridge and underpass resolve to different surfaces depending on height', () => {
  const track = new Track(makeTemplate('overpass'));
  // the crossing is at the world origin
  const low = track.query(0, 1.5, 0), high = track.query(0, 12, 0);
  assert.ok(high.y - low.y > 7, `expected ~9 m separation, got ${high.y - low.y}`);
  assert.equal(low.surface, SURF.ROAD);
  assert.equal(high.surface, SURF.ROAD);
});

test('legacy editor data is migrated', () => {
  const def = normalizeTrack({ name: 'old', width: 22, handles: [
    { x: 0, y: 1, z: 0 }, { x: 100, y: 1, z: 0, gapAfter: true }, { x: 100, y: 1, z: 100 }, { x: 0, y: 1, z: 100 }] });
  assert.equal(def.handles[1].gap, 14);
  assert.equal(def.version, 5);
});

test('analysis flags self-crossings at the same height but not bridges', () => {
  const eight = (h) => {
    const out = [];
    for (let k = 0; k < 16; k++) { const t = k / 16 * Math.PI * 2; out.push({ x: 200 * Math.sin(t), y: 0.65 + h * Math.pow(0.5 + 0.5 * Math.cos(t), 2), z: 130 * Math.sin(2 * t) }); }
    return out;
  };
  assert.ok(analyzeTrack(new Track({ width: 20, handles: eight(0) })).crossings.length >= 1);
  assert.equal(analyzeTrack(new Track({ width: 20, handles: eight(9) })).crossings.length, 0);
});

test('auto-bank leans into corners only', () => {
  const track = new Track(makeTemplate('speedway'));
  const banks = suggestBanks(track, 12);
  assert.ok(banks.some((b) => Math.abs(b) > 3));
  assert.ok(banks.every((b) => Math.abs(b) <= 12));
});

// ----------------------------------------------------------------- vehicle

test('car settles at its designed ride height and stays still', () => {
  const { track, car } = makeSim(DRAG_DEF);
  run(car, track, 4, () => ({}));
  const g = track.query(car.pos.x, car.pos.y, car.pos.z);
  assert.ok(Math.abs(car.pos.y - g.y - car.restHeight) < 0.03, 'ride height');
  assert.ok(car.speed < 0.1, 'should not creep: ' + car.speed);
  assert.ok(car.ay.y > 0.999, 'level on flat ground');
});

test('acceleration, top speed and braking are muscle-car plausible', () => {
  const track = new Track(DRAG_DEF);
  const car = new Vehicle();
  placeOnTrack(car, track, 1130, 0, 0);
  let t60 = null, top = 0, xdrift = 0;
  run(car, track, 18, (t, c) => {
    if (t60 === null && c.speed > 26.82) t60 = t;
    top = Math.max(top, c.speed); xdrift = Math.max(xdrift, Math.abs(c.pos.x));
    return { throttle: 1 };
  });
  assert.ok(t60 > 3.5 && t60 < 6.0, `0-60 mph took ${t60}`);
  assert.ok(top > 50 && top < 65, `top speed ${top} m/s`);
  assert.ok(xdrift < 0.2, 'should track straight with no steering');

  const c2 = new Vehicle(); placeOnTrack(c2, track, 1130, 0, 40);
  const log = run(c2, track, 8, () => ({ brake: 1 }));
  const stop = log.find((l) => l.speed < 0.5).t;
  const decel = 40 / stop;
  assert.ok(decel > 8 && decel < 12, `braking decel ${decel}`);
});

test('reverse is speed limited', () => {
  const track = new Track(DRAG_DEF); const car = new Vehicle();
  placeOnTrack(car, track, 1130, 0, 0);
  run(car, track, 8, () => ({ brake: 1 }));
  assert.ok(car.fwdSpeed < -3 && car.fwdSpeed > -12, 'reverse speed ' + car.fwdSpeed);
});

test('handbrake turn rotates the car; longer pull rotates it further', () => {
  const track = new Track({ ...DRAG_DEF, width: 60, walls: false });
  const turn = (hb) => {
    const car = new Vehicle(); placeOnTrack(car, track, 1150, 0, 25);
    const h0 = heading(car);
    run(car, track, 4, (t) => (t < hb ? { steer: 1, handbrake: true } : { steer: 0.4, throttle: 0.4 }));
    return Math.abs(wrap180(heading(car) - h0));
  };
  const short = turn(0.3), long = turn(0.7);
  assert.ok(short > 25, 'short pull rotates: ' + short);
  assert.ok(long > 90, 'long pull is a big rotation: ' + long);
  assert.ok(long > short);
});

test('coasting or part-throttle at full lock understeers instead of spinning', () => {
  const track = new Track({ ...DRAG_DEF, width: 60, walls: false });
  for (const v of [20, 30, 40]) {
    const car = new Vehicle(); placeOnTrack(car, track, 1150, 0, v);
    let maxSlip = 0;
    run(car, track, 3, (t, c) => { maxSlip = Math.max(maxSlip, Math.abs(c.sideSlip)); return { steer: 1, throttle: 0.4 }; });
    assert.ok(maxSlip < 0.45, `${v} m/s slip ${maxSlip}`);
  }
});

test('walls contain the car without launching it or flipping it', () => {
  const track = new Track(DRAG_DEF);
  for (const [v, steer] of [[35, 0.2], [45, 0.3], [30, 1]]) {
    const car = new Vehicle(); placeOnTrack(car, track, 1150, 0, v);
    let maxD = 0, minUp = 1, impacts = 0;
    run(car, track, 4, (t, c) => {
      impacts += c.events.filter((e) => e.type === 'wall').length; c.events.length = 0;
      maxD = Math.max(maxD, Math.abs(track.query(c.pos.x, c.pos.y, c.pos.z).d)); minUp = Math.min(minUp, c.ay.y);
      return { steer: t < 0.3 ? steer : 0, throttle: 0.4 };
    });
    assert.ok(impacts > 0, 'should register impacts');
    assert.ok(maxD < track.hw[0] + 0.7, 'stayed inside the walls: ' + maxD);
    assert.ok(minUp > 0.8, 'did not roll: ' + minUp);
  }
});

for (const key of TEMPLATE_KEYS) {
  test(`bot completes a lap of "${key}" cleanly`, () => {
    const { track, car } = makeSim(key);
    const b = bot({ speed: key === 'speedway' ? 45 : 36, aLat: 8 });
    let prog = 0, last = null, walls = 0, minUp = 1, done = null;
    run(car, track, 200, (t, c, tr) => {
      walls += c.events.filter((e) => e.type === 'wall').length; c.events.length = 0;
      minUp = Math.min(minUp, c.ay.y);
      const s = tr.progressAt(c.pos.x, c.pos.y, c.pos.z);
      if (last !== null) { let d = s - last; if (d < -tr.length / 2) d += tr.length; if (d > tr.length / 2) d -= tr.length; prog += d; }
      last = s;
      if (done === null && prog > tr.length) done = t;
      return b(t, c, tr);
    });
    assert.ok(done !== null, 'lap not completed');
    assert.equal(walls, 0, 'hit walls');
    assert.ok(minUp > 0.85);
  });
}

test('jump: a fast approach clears the gap, a slow one falls into it', () => {
  const attempt = (speed) => {
    const { track, car } = makeSim('hills');
    const gi = track.def.handles.findIndex((h) => h.gap);
    const gs = track.handleS[gi];
    placeOnTrack(car, track, gs - 110, 0, speed);
    const drive = bot({ speed, aLat: 30 });
    const centre = track.frameAt(gs);
    let lowest = 99;
    run(car, track, 110 / speed + 3, (t, c, tr) => {
      if (Math.hypot(c.pos.x - centre.x, c.pos.z - centre.z) < 25) lowest = Math.min(lowest, c.pos.y);
      return drive(t, c, tr);
    });
    return { lowest, crest: track.def.handles[gi].y };
  };
  const slow = attempt(12), fast = attempt(38);
  assert.ok(slow.lowest < slow.crest - 5, `slow car should drop into the gap (lowest ${slow.lowest.toFixed(1)})`);
  assert.ok(fast.lowest > fast.crest - 4.5, `fast car should clear it (lowest ${fast.lowest.toFixed(1)})`);
});

test('simulation is fast enough for real time', () => {
  const { track, car } = makeSim('kidney');
  const b = bot({ speed: 36 });
  const t0 = process.hrtime.bigint();
  run(car, track, 30, b);            // 3600 physics steps
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const perStep = ms / 3600;
  assert.ok(perStep < 0.5, `physics step took ${perStep.toFixed(3)} ms (budget 8.3 ms per 120 Hz step)`);
});

test('banked roads never dip below the ground', () => {
  for (const key of TEMPLATE_KEYS) {
    const track = new Track(makeTemplate(key));
    for (let i = 0; i < track.n; i += 5) {
      for (const sg of [1, -1]) {
        const y = track.py[i] - (track.nx[i] * track.lx[i] * track.hw[i] * sg + track.nz[i] * track.lz[i] * track.hw[i] * sg) / track.ny[i];
        assert.ok(y > -0.01, `${key} sample ${i} edge y=${y}`);
      }
    }
  }
});
