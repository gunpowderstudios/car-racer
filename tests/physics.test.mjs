// Run with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, SURF, analyzeTrack, normalizeTrack, suggestBanks, takeoffRamp } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { makeTemplate, TEMPLATE_KEYS } from '../src/templates.js';
import { makeSim, run, bot, placeOnTrack, DRAG_DEF } from './harness.mjs';

const heading = (c) => Math.atan2(c.az.x, c.az.z) * 57.29578;
const wrap180 = (d) => { while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

// ------------------------------------------------------------------- track

test('every template builds, closes its loop and has no tight corners', () => {
  for (const key of TEMPLATE_KEYS) {
    if (makeTemplate(key).mode === 'lastStanding') continue;      // an open arena is one wide floor, not a road to lap
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
  const track = new Track(makeTemplate('speedway'));
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
  assert.equal(def.version, 6);
  assert.deepEqual(def.props, []);
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
  assert.ok(car.fwdSpeed < -9 && car.fwdSpeed > -24, 'reverse speed ' + car.fwdSpeed);      // twice as fast as it was (it used to stop below 12 m/s)
});

test('powered drift rotates the car without requiring endless extra spin', () => {
  const track = new Track({ ...DRAG_DEF, width: 60, walls: false });
  const turn = (hb) => {
    const car = new Vehicle(); placeOnTrack(car, track, 1150, 0, 25);
    const h0 = heading(car);
    run(car, track, 4, (t) => (t < hb ? { steer: 1, handbrake: true, throttle: 1 } : { steer: 0.4, throttle: 0.4 }));
    return Math.abs(wrap180(heading(car) - h0));
  };
  const short = turn(0.3), long = turn(0.7);
  assert.ok(short > 25, 'short drift rotates: ' + short);
  assert.ok(long > 80, 'held drift produces a substantial slide: ' + long);
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
    if (track.rocks) track.rocks = track.rocks.filter((r) => !r.roller && Math.abs(track.query(r.x, r.y + 1, r.z).d) > track.hw[0] + r.r + 1.5);   // (this driver just follows the line: boulders in the road are for the rivals' dodging test)
    if (track.bumps && key === 'oval') track.bumps = null;   // (same for the pizza's olives and cheese: this driver cannot steer round them - 'the pizza toppings are safe to drive over' below covers them)
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
  const { track, car } = makeSim('speedway');
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

test('boost adds speed, drains the tank, then refills it', () => {
  const trial = (boost) => {
    const { track, car } = makeSim(DRAG_DEF, 40, 15);
    run(car, track, 2.5, () => ({ throttle: 1, boost }));
    return car;
  };
  const plain = trial(false), boosted = trial(true);
  assert.ok(boosted.fwdSpeed > plain.fwdSpeed + 6, `boost should be clearly faster (${plain.fwdSpeed.toFixed(1)} vs ${boosted.fwdSpeed.toFixed(1)} m/s)`);
  assert.ok(boosted.ay.y > 0.95, 'boost should not flip the car');
  const { track, car } = makeSim(DRAG_DEF, 40, 15);
  run(car, track, 3.4, () => ({ throttle: 1, boost: true }));
  assert.ok(car.boostFuel < 0.05 && !car.boosting, `tank should run dry (${car.boostFuel.toFixed(2)})`);
  run(car, track, 2, () => ({ throttle: 0.4 }));
  assert.ok(car.boostFuel > 0.15 && car.boostFuel < 0.4, `tank refills slowly (${car.boostFuel.toFixed(2)})`);
});

test('a jump lip rises to its height and launches at its angle', () => {
  for (const [lip, kick] of [[0.5, 0], [1, 12], [2, 22], [3, 30]]) {
    const r = takeoffRamp({ lip, kick });
    assert.ok(Math.abs(r.at(r.len) - lip) < 1e-6, 'ramp reaches its height');
    assert.ok(r.at(0) === 0 && r.at(r.len * 0.5) < lip * 0.5 + 1e-9, 'ramp starts flat and curves up');
    const slope = (r.at(r.len) - r.at(r.len - 0.01)) / 0.01;
    assert.ok(Math.abs(Math.atan(slope) * 57.2958 - kick) < 1, `lip angle ${kick}: got ${(Math.atan(slope) * 57.2958).toFixed(1)}`);
  }
  // the track surface follows it, and the frame at the lip points up the ramp (not down into the gap)
  const d = makeTemplate('hills'), k = d.handles.findIndex((h) => h.gap);
  Object.assign(d.handles[k], { lip: 2, kick: 20 });
  const t = new Track(d);
  let lipI = -1; for (let i = 1; i < t.n; i++) if (t.gap[i] && !t.gap[i - 1]) { lipI = i - 1; break; }
  assert.ok(Math.atan(t.ty[lipI] / Math.hypot(t.tx[lipI], t.tz[lipI])) * 57.2958 > 14, 'road tilts up at the lip');
  assert.deepEqual(normalizeTrack({ handles: [{ x: 0, z: 0, gap: 10 }] }).handles[0].kick, 0, 'old tracks keep the flat ramp');
});

test('a kicked lip throws the car higher and it still lands upright', () => {
  const air = (lip, kick) => {
    const d = makeTemplate('hills'), k = d.handles.findIndex((h) => h.gap);
    Object.assign(d.handles[k], { lip, kick });
    const track = new Track(d), car = new Vehicle(), drive = bot({ speed: 30 });
    placeOnTrack(car, track, track.handleS[k] - d.handles[k].gap / 2 - takeoffRamp(d.handles[k]).len - 50, 0, 30);
    let a = 0, best = 0, minUp = 1;
    run(car, track, 6, (t, c, tr) => { a = c.onGround ? 0 : a + 1 / 120; best = Math.max(best, a); minUp = Math.min(minUp, c.ay.y); return drive(t, c, tr); });
    return { best, minUp };
  };
  const flat = air(0.5, 0), kicked = air(1.5, 20);
  assert.ok(kicked.best > flat.best + 0.8, `kicker should add airtime (${flat.best.toFixed(2)}s -> ${kicked.best.toFixed(2)}s)`);
  assert.ok(kicked.minUp > 0.8, `should land upright (${kicked.minUp.toFixed(2)})`);
});

// ------------------------------------------------- Arcade handling (opts.stability)

test('Arcade handling: harsh inputs that spin a car with raw tyre physics no longer do, and grip and drifting are kept', async () => {
  const { VEHICLE_PHYSICS_PROFILES: P } = await import('../src/vehiclePhysicsProfiles.js');
  const { CAR } = await import('../src/vehicle.js');
  const N = 24, track = new Track(normalizeTrack({ mode: 'lastStanding', width: 120,
    handles: Array.from({ length: N }, (_, i) => ({ x: 400 * Math.cos(i / N * 6.2832), z: 400 * Math.sin(i / N * 6.2832), y: 0.65 })) }));   // a huge flat floor
  const specFor = (id) => { const p = P[id]; return { ...CAR, ...p, inertia: { ...CAR.inertia, ...p.inertia }, susp: { ...CAR.susp, ...p.susp }, tyre: { ...CAR.tyre, ...p.tyre },
    engine: { ...CAR.engine, ...p.engine }, aero: { ...CAR.aero, ...p.aero }, steer: { ...CAR.steer, ...p.steer }, boost: { ...CAR.boost, ...p.boost }, brakeTotal: (p.brakeG ?? 1.35) * p.mass * 9.81, brakeBias: p.brakeBias ?? CAR.brakeBias }; };
  const hold = (v) => (c) => Math.max(0, Math.min(1, 0.25 + (v - c.speed) * 0.2));
  const scenarios = [
    ['flickFast', 42, (t, c) => ({ throttle: hold(42)(c), steer: t < 0.5 ? 0 : t < 0.7 ? 1 : t < 0.9 ? -1 : t < 1.1 ? 1 : 0 })],
    ['throttle stab mid-corner', 36, (t, c) => ({ throttle: t < 1 ? hold(36)(c) : 1, steer: t < 0.5 ? 0 : 1 })],
    ['lift and brake mid-corner', 40, (t, c) => ({ throttle: t < 1.5 ? hold(40)(c) : 0, brake: t > 1.8 ? 1 : 0, steer: t < 0.5 ? 0 : 1 })],
    ['brake stab mid-corner', 36, (t, c) => ({ throttle: t < 1 ? hold(36)(c) : 0, brake: t > 1 ? 1 : 0, steer: t < 0.5 ? 0 : 1 })],
  ];
  const worst = (id, stability, [, v, fn]) => {
    const car = new Vehicle(specFor(id)); car.opts.stability = stability; placeOnTrack(car, track, 100, 0, v);
    let slip = 0;
    for (let i = 0; i < 3.4 / DT_; i++) { car.step(DT_, { throttle: 0, brake: 0, steer: 0, handbrake: false, ...fn(i * DT_, car) }, track); car.events.length = 0; if (car.speed > 8) slip = Math.max(slip, Math.abs(car.sideSlip)); }
    return slip;
  };
  let rawSpins = 0;
  for (const id of ['car', 'mini', 'bmw']) for (const s of scenarios) {
    if (worst(id, 0, s) > 1.0) rawSpins++; 
    assert.ok(worst(id, 1, s) < 0.75, `${id}: ${s[0]} should not spin with Arcade handling`);
  }
  assert.ok(rawSpins >= 1, 'the test scenarios really do spin the cars without it: ' + rawSpins);
  // it stands aside for a deliberate drift
  const d = new Vehicle(specFor('car')); d.opts.stability = 1; placeOnTrack(d, track, 100, 0, 22);
  let drift = 0;
  for (let i = 0; i < 4 / DT_; i++) { const t = i * DT_; d.step(DT_, { throttle: 1, brake: 0, steer: t < 0.5 ? 0 : 0.6, handbrake: t > 0.7 && t < 1.7 }, track); d.events.length = 0; if (d.speed > 8) drift = Math.max(drift, Math.abs(d.sideSlip)); }
  assert.ok(drift > 0.45, 'Drift still slides the car: ' + drift.toFixed(2));
});
const DT_ = 1 / 120;

test('puddles are irregular (stretched and lumpy), the same for everyone, and the water follows the outline', async () => {
  const { puddleShape, puddleEdge } = await import('../src/track.js');
  const { track } = makeSim('bluebell');
  const ps = track.puddles;
  assert.ok(ps.length >= 5);
  const stretch = ps.map((p) => puddleShape(p).a / puddleShape(p).b);
  assert.ok(Math.max(...stretch) > 1.6 && Math.min(...stretch) < 1.5, 'some long, some nearly round');
  const again = puddleShape({ x: ps[0].x, z: ps[0].z, r: ps[0].r });
  assert.equal(again.rot, puddleShape(ps[0]).rot, 'the same spot always gives the same shape');
  for (const p of ps) {
    const sh = puddleShape(p);
    assert.ok(track.puddleAt(p.x, p.z) > 0.9, 'deep in the middle');
    for (let k = 0; k < 24; k++) {                                                         // just inside and just outside the edge, all the way round
      const th = k / 24 * Math.PI * 2, e = puddleEdge(sh, th), u = Math.cos(th) * sh.a * e, v = Math.sin(th) * sh.b * e;
      const at = (f) => track.puddleAt(p.x + (u * sh.cos - v * sh.sin) * f, p.z + (u * sh.sin + v * sh.cos) * f);
      assert.ok(at(0.9) > 0 && at(1.1) === 0 || at(1.1) > 0, 'edge at angle ' + k);
    }
  }
});

test('a rolling boulder is set off so that it crosses the middle of the road just as the car gets there', () => {
  const { track } = makeSim('bluebell');
  assert.ok(track.rollers.length >= 3);
  for (const b of track.rollers) {
    assert.ok(b.tC > 1.5 && b.tC < 4 && b.reach > 8, 'time to the road centre ' + b.tC);
    const px = b.x0 + b.dx * b.reach, pz = b.z0 + b.dz * b.reach, q = track.query(px, 40, pz, undefined, 3);
    assert.ok(Math.abs(q.d) < 2.5, 'it is aimed at the middle of the road: ' + q.d);
  }
});

test('the pizza toppings are safe to drive over: straight across every olive and cheese dip, at any speed, the car stays on its wheels', () => {
  const lumps = makeSim('oval').track.def.bumps;
  assert.ok(lumps.some((b) => b.h > 0) && lumps.some((b) => b.h < 0));
  assert.ok(Math.max(...lumps.map((b) => Math.abs(b.h))) > 0.9 && Math.max(...lumps.filter((b) => b.h < 0).map((b) => -b.h)) > 0.9, 'olives and cheese are 50% bigger than before');
  for (const b of lumps) for (const sp of [12, 38]) {
    const { track, car } = makeSim('oval');
    car.pos.x = b.x - 40; car.pos.z = b.z; car.pos.y = 3;
    let minUp = 1;
    run(car, track, 4, (t, c) => { minUp = Math.min(minUp, c.ay.y); return { steer: 0, throttle: Math.hypot(c.vel.x, c.vel.z) < sp ? 1 : 0, brake: 0 }; });
    assert.ok(minUp > 0.8, `rolled over a ${b.h > 0 ? 'olive' : 'cheese dip'} (${b.h}) at ${sp}: ${minUp}`);
  }
});

test('Drift held at walking pace while steering is a tight turn, not a handbrake slide', () => {
  const turn = (hand) => {
    const track = new Track(DRAG_DEF); const car = new Vehicle();
    placeOnTrack(car, track, 1130, 0, 4);
    run(car, track, 1.0, () => ({ throttle: 0.3, steer: 1, handbrake: hand }));
    const yaw = Math.abs(car.angVel.dot(car.ay));
    return { yaw, slip: Math.abs(car.sideSlip), speed: car.speed };
  };
  const plain = turn(false), tight = turn(true);
  assert.ok(tight.yaw > plain.yaw * 1.15, `a tighter turn: yaw ${tight.yaw.toFixed(2)} vs ${plain.yaw.toFixed(2)}`);
  assert.ok(tight.slip < 0.5, `and no big slide: slip ${tight.slip.toFixed(2)}`);
  assert.ok(tight.speed > 1.5, 'and it keeps moving, not locked up');
});
