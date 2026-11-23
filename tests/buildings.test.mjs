import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeTrack } from '../src/track.js';
import { makeTemplate } from '../src/templates.js';
import { buildingLayout, buildingBlocks } from '../src/buildings.js';
import { packTrack, unpackTrack } from '../src/trackLink.js';

const base = () => makeTemplate('speedway');
function at(T, f) { const i = Math.round(T.n * f); return { x: T.px[i], z: T.pz[i], i }; }

test('a building off the road is one solid block; over the road it is a tunnel', () => {
  const d = base(), T0 = new Track(normalizeTrack(d)), on = at(T0, 0.1);
  const def = normalizeTrack({ ...d, props: [{ type: 'building', x: on.x, z: on.z, y: 0.65, w: 30, d: 20, h: 20 }, { type: 'building', x: on.x + 300, z: on.z + 300, y: 0, w: 10, d: 10, h: 12 }] });
  const T = new Track(def), [tun, plain] = T.buildings;
  assert.ok(tun.tunnel && tun.parts.length === 3, 'over the road: walls and a roof');
  assert.ok(!plain.tunnel && plain.parts.length === 1);
  const roof = tun.parts[2], wallL = tun.parts[0];
  assert.ok(roof.y > T.py[on.i] + 5, 'the roof is well above the road'); assert.ok(wallL.u1 < -T.hw[on.i], 'the walls stand off the road edge');
  assert.ok(T.blocks.length > 3, 'solid blocks were made');
});

test('a tunnel leaves the road clear for a car: no block between the walls under the roof', () => {
  const d = base(), T0 = new Track(normalizeTrack(d)), on = at(T0, 0.1);
  const T = new Track(normalizeTrack({ ...d, props: [{ type: 'building', x: on.x, z: on.z, y: 0.65, w: 30, d: 20, h: 20 }] }));
  const y = T.py[on.i] + 0.5;
  for (const bk of T.blocks) {
    const inside = on.x > bk.x0 && on.x < bk.x1 && on.z > bk.z0 && on.z < bk.z1;
    if (inside) assert.ok(bk.y > y + 3, `a block at the middle of the road starts at ${bk.y}, road ${y}`);
  }
});

test('building sizes are clamped and a square-on one is a single box', () => {
  const def = normalizeTrack({ ...base(), props: [{ type: 'building', x: 500, z: 500, y: 0, w: 999, d: 1, h: 1, style: 11 }] });
  const p = def.props[0]; assert.equal(p.w, 120); assert.equal(p.d, 4); assert.equal(p.h, 3); assert.equal(p.style, 3);
  const L = [{ x: 0, z: 0, th: 0, parts: [{ u0: -5, u1: 5, v0: -5, v1: 5, y: 0, h: 10 }] }];
  assert.equal(buildingBlocks(L).length, 1);
  assert.ok(buildingBlocks([{ ...L[0], th: 0.5 }]).length > 1);
});

test('buildings survive a share link', async () => {
  const def = normalizeTrack({ ...base(), props: [{ type: 'building', x: 400, z: 300, y: 0, w: 33, d: 14.5, h: 60, style: 5, rot: 40 }, { type: 'barrel', x: 410, z: 300, y: 0 }] });
  const back = normalizeTrack(await unpackTrack(await packTrack(def)));
  const b = back.props.find((p) => p.type === 'building');
  assert.deepEqual([b.w, b.d, b.h, b.style, b.rot], [33, 14.5, 60, 5, 40]);
  assert.ok(back.props.some((p) => p.type === 'barrel'));
});
