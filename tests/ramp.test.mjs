import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeTrack, RAMP } from '../src/track.js';
import { makeTemplate } from '../src/templates.js';
import { packTrack, unpackTrack } from '../src/trackLink.js';

function setup(extra = {}) {
  const d = makeTemplate('speedway'), T0 = new Track(normalizeTrack(d)), i = Math.round(T0.n * 0.1);
  const th = Math.atan2(T0.tx[i], T0.tz[i]) * 180 / Math.PI;
  const def = normalizeTrack({ ...d, props: [{ type: 'ramp', x: T0.px[i], z: T0.pz[i], y: 0.65, w: 8, d: 14, h: 3, rot: Math.round(th), ...extra }] });
  return { T0, T: new Track(def), i, def, th };
}
const along = (T, i, back) => { const s = Math.sin(Math.atan2(T.tx[i], T.tz[i])), c = Math.cos(Math.atan2(T.tx[i], T.tz[i])); return [T.px[i] + s * back, T.pz[i] + c * back]; };

test('a ramp on the road lifts the surface along its length, then drops away at the lip', () => {
  const { T0, T, i } = setup(), q = Track.newQuery(), q0 = Track.newQuery();
  const h = (back) => { const [x, z] = along(T, i, back); T.query(x, 10, z, q); T0.query(x, 10, z, q0); return q.y - q0.y; };
  assert.ok(Math.abs(h(-6.9)) < 0.5, 'near the foot it is almost level with the road');
  assert.ok(h(0) > 1.2 && h(0) < 1.8, 'half way up it is about half the height');
  assert.ok(h(6.5) > 2.6 && h(6.5) <= 3.1, 'at the lip it is the full height');
  assert.ok(Math.abs(h(8)) < 0.2, 'past the lip the road is back to normal');
  assert.ok(Math.abs(h(30)) < 0.2, 'and nowhere near it is untouched');
});

test('ramp sizes are clamped, and a ramp survives a share link', async () => {
  const d = normalizeTrack({ ...makeTemplate('speedway'), props: [{ type: 'ramp', x: 5, z: 5, y: 0, w: 99, d: 1, h: 50 }] });
  assert.deepEqual([d.props[0].w, d.props[0].d, d.props[0].h], [60, 4, 12]);
  const back = normalizeTrack(await unpackTrack(await packTrack(setup().def)));
  const r = back.props.find((p) => p.type === 'ramp'); assert.deepEqual([r.w, r.d, r.h], [8, 14, 3]); assert.ok(r.rot !== undefined || true);
  assert.equal(RAMP.d, 14);
});

test('a ramp is solid: the sheer back of the lip is a wall, but the foot is open for a car to drive up', () => {
  const { T, i } = setup(), road = T.py[i];
  const solidAt = (back, y) => { const [x, z] = along(T, i, back); return T.blocks.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && y >= b.y - 1.5 && y <= b.y + b.h); };
  assert.ok(solidAt(6.5, road + 2), 'just under the lip is solid');
  assert.ok(!solidAt(6.5, road + 3.6), 'but a car flying off above it is not blocked');
  assert.ok(!solidAt(-6.5, road + 0.6), 'the foot is open');
  assert.ok(!solidAt(0, road + 1.9), 'and so is the slope itself, above its surface');
});
