import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeTrack } from '../src/track.js';
import { makeTemplate } from '../src/templates.js';
import { piecesLayout, layoutFor } from '../src/weeval.js';
import { TargetScore, targetRing } from '../src/targetScore.js';
import { packTrack, unpackTrack } from '../src/trackLink.js';

function withPieces() {
  const d = makeTemplate('speedway');
  const hs = d.handles; const h = hs[0];
  return normalizeTrack({ ...d, props: [
    { type: 'bus', x: h.x + 30, z: h.z + 4, y: 0.65 },
    { type: 'boxes', x: h.x + 60, z: h.z, y: 0.65 },
    { type: 'target', x: h.x + 100, z: h.z, y: 0.65 },
  ] });
}

test('stunt pieces on an ordinary track leave it an ordinary track', () => {
  const def = withPieces();
  assert.equal(def.weeval, undefined);
  assert.ok(!(def.blocks || []).some((b) => b.kind === 'bus'), 'the bus is a real parked vehicle now, not a fixed block');
  const t = new Track(def);
  const L = layoutFor(def); assert.ok(L.pieces && L.hasTarget && L.busList.length === 1 && L.stacks.length === 1);
  assert.equal(piecesLayout(def).endX, Infinity);
});

test('pieces survive a share link without turning into a stunt track', async () => {
  const def = withPieces(), back = normalizeTrack(await unpackTrack(await packTrack(def)));
  assert.equal(back.weeval, undefined);
  assert.deepEqual(back.props.map((p) => p.type).sort(), ['boxes', 'bus', 'target']);
});

test('landing on a bullseye scores by ring, with a bonus for a level touchdown', () => {
  const def = withPieces(), t = new Track(def), tg = def.props.find((p) => p.type === 'target');
  assert.equal(targetRing(tg, tg.x, tg.z).ring, 0); assert.equal(targetRing(tg, tg.x + 5, tg.z).ring, 2); assert.equal(targetRing(tg, tg.x + 30, tg.z), null);
  const S = new TargetScore(t), car = { pos: { x: tg.x, y: tg.y + 1, z: tg.z }, onGround: false, ay: { x: 0, y: 1, z: 0 }, speed: 30 };
  for (let i = 0; i < 60; i++) S.step(1 / 60, car);              // a second in the air
  car.onGround = true; S.step(1 / 60, car);
  assert.equal(S.events.length, 1);
  assert.equal(S.events[0].ring, 0); assert.ok(S.events[0].flat); assert.equal(S.events[0].points, 1000 + 200);
  S.events.length = 0; S.step(1 / 60, car); assert.equal(S.events.length, 0, 'driving on it again is not a new jump');
});

test('a bump is not a jump, and missing the target scores nothing', () => {
  const def = withPieces(), t = new Track(def), tg = def.props.find((p) => p.type === 'target'), S = new TargetScore(t);
  const car = { pos: { x: tg.x, y: tg.y + 1, z: tg.z }, onGround: false, ay: { x: 0, y: 1, z: 0 }, speed: 30 };
  for (let i = 0; i < 10; i++) S.step(1 / 60, car); car.onGround = true; S.step(1 / 60, car); assert.equal(S.events.length, 0);
  car.onGround = false; for (let i = 0; i < 60; i++) S.step(1 / 60, car); car.pos.x += 40; car.onGround = true; S.step(1 / 60, car); assert.equal(S.events.length, 0);
});
