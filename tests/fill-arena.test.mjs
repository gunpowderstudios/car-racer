import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, normalizeTrack, SURF } from '../src/track.js';
import { arenaInfo } from '../src/arena.js';
import { packTrack, unpackTrack } from '../src/trackLink.js';

// What the editor's "Fill" tickbox builds: a short ring of points with a very wide road, mode lastStanding.
function filled(Rx, Rz) {
  const hw = Math.min(230, Math.max(8, Math.min(Rx, Rz) * 0.5));
  const a = Rx - hw, b = Rz - hw;
  const handles = Array.from({ length: 12 }, (_, k) => { const u = (k / 12) * Math.PI * 2; return { x: a * Math.cos(u), y: 0.65, z: b * Math.sin(u) }; });
  return normalizeTrack({ name: 'Filled', width: Math.round(hw * 2), mode: 'lastStanding', handles });
}

test('a filled shape is a solid floor out to the drawn outline', () => {
  const t = new Track(filled(150, 90)), A = arenaInfo(t), q = Track.newQuery();
  assert.ok(Math.abs(A.ax - 150) < 2 && Math.abs(A.az - 90) < 2, `${A.ax} ${A.az}`);
  for (const [x, z, on] of [[0, 0, true], [100, 0, true], [-120, 20, true], [0, 70, true], [0, 140, false], [190, 0, false]]) {
    t.query(x, 3, z, q); assert.equal(q.surface !== SURF.BASE, on, `${x},${z}`);
  }
});

test('a big filled circle has no hole in the middle and survives a share link', async () => {
  const def = filled(400, 400), t = new Track(def), q = Track.newQuery();
  t.query(0, 3, 0, q); assert.notEqual(q.surface, SURF.BASE);
  const back = normalizeTrack(await unpackTrack(await packTrack(def)));
  assert.equal(back.mode, 'lastStanding'); assert.equal(back.width, def.width);
});
