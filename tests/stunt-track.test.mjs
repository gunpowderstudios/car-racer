// Stunt tracks made in the editor: the buses, boxes and bullseye are props, the jump is the gap, and it plays like Weeval Knievel (one stage).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeTrack, stuntBlocks } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { V3 } from '../src/math.js';
import { makeTemplate, TEMPLATE_INFO } from '../src/templates.js';
import { WEEVAL, Weeval, newRun, customLayout, layoutFor, stageLayout } from '../src/weeval.js';
import { packTrack, unpackTrack } from '../src/trackLink.js';

const DT = 1 / 120;
function fly(def, v) {
  const track = new Track(def), car = new Vehicle(), f = track.frameAt(12);
  car.reset(new V3(f.x + f.nx * (car.restHeight + .05), f.y + f.ny * (car.restHeight + .05), f.z), new V3(f.fx, f.fy, f.fz), new V3(f.nx, f.ny, f.nz), 0);
  const w = new Weeval(track, newRun()); w.go(); const ev = [];
  for (let i = 0; i < 120 * 70 && w.active; i++) {
    const e = v - car.fwdSpeed, air = !car.onGround && car.airTime > 0.1;
    car.step(DT, { throttle: air ? 0 : e > 0 ? Math.min(1, e / 3) : 0, brake: air ? 0 : e < -1 ? Math.min(1, -e / 5) : 0, steer: 0, handbrake: false }, track);
    w.step(DT, car, null); ev.push(...w.events.splice(0));
  }
  return { w, ev };
}

test('the Stunt Jump template is stage 1 of Weeval Knievel made of props', () => {
  const d = makeTemplate('stunt'), L = customLayout(d), S = stageLayout(1);
  assert.ok(TEMPLATE_INFO.stunt);
  assert.deepEqual(d.weeval, { stage: 1, custom: true });
  assert.equal(L.buses, 3); assert.equal(L.stacks.length, 1);
  assert.equal(L.gap, S.gap); assert.equal(L.lipX, S.lipX); assert.equal(L.zoneX, S.zoneX);
  assert.ok(d.props.some((p) => p.type === 'barrel' && p.lethal), 'the skull barrels are props too');
  const t = new Track(d);
  assert.equal(t.blocks.filter((b) => b.kind === 'bus').length, 3);
  assert.ok(t.blocks.some((b) => b.kind === 'wall'), 'a platform under the buses');
  assert.equal(layoutFor(t.def).buses, 3);
});

test('the blocks always come from the props: moving or removing a bus changes them, and normalising twice changes nothing', () => {
  const d = makeTemplate('stunt');
  assert.deepEqual(normalizeTrack(d).blocks, d.blocks);
  const moved = normalizeTrack({ ...d, blocks: [{ x0: 0, x1: 5, z0: 0, z1: 5 }], props: d.props.map((p) => (p.type === 'bus' ? { ...p, z: p.z + 20 } : p)) });
  assert.ok(moved.blocks.filter((b) => b.kind === 'bus').every((b) => b.z0 > 10), 'the buses moved');
  assert.ok(!moved.blocks.some((b) => b.x1 === 5 && b.z1 === 5), 'a stale block is not kept');
  assert.equal(normalizeTrack({ ...d, props: d.props.filter((p) => p.type !== 'bus') }).blocks.length, 0);
  const rot = stuntBlocks([{ type: 'bus', x: 0, z: 0, y: 0, rot: 90 }])[0];
  assert.ok(rot.x1 - rot.x0 > rot.z1 - rot.z0, 'a quarter turn makes it long across the run');
});

test('the aim speed clears the stunt and lands on the bullseye; too slow lands in the buses', () => {
  const d = makeTemplate('stunt');
  const a = fly(d, WEEVAL.aim[0]); assert.equal(a.w.state, 'clear'); assert.equal(a.ev.find((e) => e.type === 'clear').done, true, 'a stunt track is one stage');
  assert.ok(a.ev.find((e) => e.type === 'touch').ring >= 1, 'on the bullseye');
  const b = fly(d, 20); assert.ok(b.ev.some((e) => e.type === 'fail' && e.why === 'short'));
});

test('the bullseye is wherever the target prop is', () => {
  const d = makeTemplate('stunt'), t = d.props.find((p) => p.type === 'target');
  const d2 = normalizeTrack({ ...d, props: d.props.map((p) => (p === t ? { ...p, x: p.x + 15, z: 3 } : p)) });
  const L = customLayout(d2); assert.equal(L.zoneX, t.x + 15); assert.equal(L.zoneZ, 3);
});

test('a stunt track survives a share link', async () => {
  const d = makeTemplate('stunt'); d.props.find((p) => p.type === 'bus').rot = 90; d.props.find((p) => p.type === 'bus').up = 12.5;
  const back = await unpackTrack(await packTrack(normalizeTrack(d)));
  assert.deepEqual(back.weeval, { stage: 1, custom: true });
  for (const type of ['bus', 'boxes', 'target', 'barrel']) assert.equal(back.props.filter((p) => p.type === type).length, d.props.filter((p) => p.type === type).length, type);
  const bus = back.props.find((p) => p.type === 'bus'); assert.equal(bus.rot, 90); assert.equal(bus.up, 12.5);
  assert.equal(back.blocks.length, normalizeTrack(d).blocks.length);
});
