// Flyovers and tunnels at a gap crossing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeTrack } from '../src/track.js';
import { buildTrackGeometry } from '../src/trackGeometry.js';
import { pendingJunctions, makeGap, setStructure, structureAt, TUNNEL_HEIGHT } from '../src/junctions.js';
import { packTrack, unpackTrack } from '../src/trackLink.js';

const eight = () => {
  const H = [], N = 12;
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; H.push({ x: 120 * Math.sin(a), z: 60 * Math.sin(2 * a), y: 0.65 }); }
  return normalizeTrack({ name: 'eight', width: 16, walls: true, handles: H });
};
const build = (type) => {
  const def = eight(), c = pendingJunctions(new Track(def), def)[0];
  makeGap(def, c, type === 'tunnel' ? TUNNEL_HEIGHT : undefined); setStructure(def, c, type);
  return { def, c, t: new Track(def) };
};

test('a plain gap has no structure; a flyover and a tunnel are found at their crossing', () => {
  const g = build(''); assert.equal(g.t.structures.length, 0); assert.equal(structureAt(g.def, g.c), '');
  for (const type of ['flyover', 'tunnel']) {
    const { def, c, t } = build(type);
    assert.equal(structureAt(def, c), type);
    assert.equal(t.structures.length, 1, type);
    assert.equal(t.structures[0].type, type);
    assert.ok(t.structures[0].up.y - t.structures[0].low.y >= 5, 'upper road well over the lower');
  }
});

test('a flyover has four solid pillars and the geometry has more concrete than a plain gap', () => {
  const f = build('flyover'), g = build('');
  const pillars = f.t.drums.filter((d) => d.pillar);
  assert.equal(pillars.length, 4);
  const d = pillars[0], low = f.t.structures[0].low.y;
  const hit = f.t.drumHit(d.x + 0.2, low + 1, d.z);
  assert.ok(hit && hit.pen > 0.5, 'a car at ground level hits the pillar');
  assert.equal(f.t.drumHit(d.x + 3, low + 1, d.z), null);
  assert.ok(buildTrackGeometry(f.t).signs.index.length > buildTrackGeometry(g.t).signs.index.length + 200);
});

test('a tunnel adds a roof and portals; the roof clears the road and stays under the upper road', () => {
  const t = build('tunnel').t, st = t.structures[0], g = buildTrackGeometry(t).signs;
  assert.equal(t.drums.filter((d) => d.pillar).length, 0);
  assert.ok(g.index.length > 100);
  let hi = -Infinity; for (let i = 1; i < g.position.length; i += 3) hi = Math.max(hi, g.position[i]);
  assert.ok(hi < st.up.y, 'nothing pokes up through the road above');
});

test('flyovers and tunnels survive a share link and normalize', async () => {
  const { def } = build('tunnel');
  const back = await unpackTrack(await packTrack(normalizeTrack(def)));
  assert.equal(back.structures?.length, 1); assert.equal(back.structures[0].type, 'tunnel');
  assert.equal(normalizeTrack({ ...def, structures: [{ x: 1, z: 2, type: 'nonsense' }] }).structures.length, 0);
});

test('the plain support boxes are left out under a flyover or tunnel crossing, which has its own', () => {
  const near = (t) => buildTrackGeometry(t).pillars.filter((p) => Math.hypot(p.x - t.structures[0]?.x, p.z - t.structures[0]?.z) < 24).length;
  const f = build('flyover').t, g = build('').t;
  assert.equal(near(f), 0);
  assert.ok(buildTrackGeometry(g).pillars.length >= 0);
});

test('nothing stands up through a road above it: no lamp post under a bridge, and flyover pillars stop under the deck', () => {
  for (const type of ['', 'flyover', 'tunnel']) {
    const { t } = build(type), g = buildTrackGeometry(t);
    for (const l of g.lamps) {
      let own = 0, bd = 1e9; for (let k = 0; k < t.n; k++) { const d = Math.hypot(t.px[k] - l.x, t.pz[k] - l.z); if (d < bd) { bd = d; own = k; } }
      for (let k = 0; k < t.n; k++) {
        let ds = Math.abs(t.s[k] - t.s[own]); if (ds > t.length / 2) ds = t.length - ds;
        if (ds < 40 || t.py[k] - 0.7 < l.y + 0.5 || t.py[k] - l.y > 11) continue;
        assert.ok(Math.hypot(t.px[k] - l.x, t.pz[k] - l.z) >= t.hw[k] + 2.5, `${type || 'gap'}: a lamp at ${l.x.toFixed(0)},${l.z.toFixed(0)} stands up through the road ${(t.py[k] - l.y).toFixed(1)} m above it`);
      }
    }
  }
  const { t } = build('flyover');
  for (const d of t.drums.filter((q) => q.pillar)) for (let k = 0; k < t.n; k++) if (Math.hypot(t.px[k] - d.x, t.pz[k] - d.z) < t.hw[k] + 1.2 && t.py[k] > d.y + 3) assert.ok(d.top <= t.py[k] - 0.9, 'a pillar pokes above the deck');
});

test('a raised road stands on a solid wall to the ground, but not where a flyover crosses over the road below', () => {
  const atGround = (g, st) => { let c = 0; for (let k = 0; k < g.slab.position.length; k += 3) if (Math.abs(g.slab.position[k + 1]) < 1e-6 && Math.hypot(g.slab.position[k] - st.x, g.slab.position[k + 2] - st.z) < 20) c++; return c; };
  const f = build('flyover').t, geo = buildTrackGeometry(f);
  assert.equal(atGround(geo, f.structures[0]), 0, 'the wall stops short of the crossing, so the road below runs clear');
  assert.equal(geo.pillars.length, 0);
});
