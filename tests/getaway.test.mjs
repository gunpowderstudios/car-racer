import test from 'node:test';
import assert from 'node:assert/strict';
import { TOWN, townLayout, pickSafehouse, safehouseSpots, streetAt, nearestNode, route, GetawayGame } from '../src/getaway.js';

const L = townLayout();
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

test('the town is 4 x 3 blocks with a bank and a bag of money on every one', () => {
  assert.equal(L.blocks.length, 12); assert.equal(L.banks.length, 12); assert.equal(L.nodes.length, 20);
  assert.equal(new Set(L.banks.map((b) => b.id)).size, 12);
  for (const b of L.banks) {
    const s = streetAt(L, b.bag.x, b.bag.z);
    assert.ok(s, `bag ${b.id} lies on a street`);
    for (const box of L.boxes) assert.ok(!(b.bag.x > box.x0 && b.bag.x < box.x1 && b.bag.z > box.z0 && b.bag.z < box.z1), `bag ${b.id} is not inside a building`);
  }
});
test('the streets are clear: blocks never overlap each other or the border wall', () => {
  for (let a = 0; a < L.boxes.length; a++) for (let b = a + 1; b < L.boxes.length; b++) {
    const p = L.boxes[a], q = L.boxes[b];
    assert.ok(p.x1 <= q.x0 + 1e-6 || q.x1 <= p.x0 + 1e-6 || p.z1 <= q.z0 + 1e-6 || q.z1 <= p.z0 + 1e-6, `boxes ${a} and ${b} overlap`);
  }
  for (const n of L.nodes) for (const box of L.boxes) assert.ok(!(n.x > box.x0 && n.x < box.x1 && n.z > box.z0 && n.z < box.z1), 'a junction is clear');
  assert.ok(Math.abs(L.xs[1] - L.xs[0] - (TOWN.bx + TOWN.street)) < 1e-9);
});
test('the two sides start at opposite ends of the town, in the street', () => {
  assert.ok(streetAt(L, L.robberStart.x, L.robberStart.z)); assert.ok(streetAt(L, L.policeStart.x, L.policeStart.z));
  assert.ok(Math.hypot(L.robberStart.x - L.policeStart.x, L.robberStart.z - L.policeStart.z) > 0.8 * Math.hypot(L.W, L.D));
});
test('the safehouse is a garage bay open to a street, never on a bag, and far from both starts', () => {
  for (const p of safehouseSpots(L)) { assert.ok(!L.boxes.some((q) => p.x > q.x0 && p.x < q.x1 && p.z > q.z0 && p.z < q.z1), 'the bay is empty'); assert.ok(streetAt(L, p.gx, p.street)); for (const b of L.banks) assert.ok(Math.hypot(p.x - b.bag.x, p.z - b.bag.z) > 8, 'not on a bag'); }
  const seen = new Set();
  for (let k = 0; k < 60; k++) {
    const s = pickSafehouse(L, mulberry(k + 1)); seen.add(s.x + ',' + s.z);
    assert.ok(Math.hypot(s.x - L.robberStart.x, s.z - L.robberStart.z) >= 110 && Math.hypot(s.x - L.policeStart.x, s.z - L.policeStart.z) >= 110);
  }
  assert.ok(seen.size > 3, 'it is random');
});
test('routes go along the streets through junctions, and never through a building', () => {
  const rnd = mulberry(5);
  for (let k = 0; k < 200; k++) {
    const a = L.nodes[Math.floor(rnd() * 20)], b = L.banks[Math.floor(rnd() * 12)].bag;
    const pts = route(L, a.x, a.z, 1, 0, b.x, b.z, 0), all = [{ x: a.x, z: a.z }, ...pts];
    assert.deepEqual(pts[pts.length - 1], { x: b.x, z: b.z });
    for (let i = 1; i < all.length; i++) {                                        // every leg is along a street, so sample it
      for (let t = 0; t <= 1; t += 0.05) { const x = all[i - 1].x + (all[i].x - all[i - 1].x) * t, z = all[i - 1].z + (all[i].z - all[i - 1].z) * t; assert.ok(streetAt(L, x, z), `leg ${i} leaves the street at ${x.toFixed(1)}, ${z.toFixed(1)}`); }
    }
  }
});
test('a moving car carries on rather than turning round at once', () => {
  const n = L.nodes[nearestNode(L, 0, 0)], s = L.xs[2];
  const pts = route(L, s - 30, L.zs[1], 1, 0, s - 100, L.zs[1], 20);          // heading east, the target is behind it
  assert.ok(pts.length >= 2 && pts[0].x > s - 30, 'goes on to the next junction first');
  void n;
});

function fresh(sh = { x: L.xs[2], z: L.zs[0] }) { return new GetawayGame(L, { safehouse: sh, rng: mulberry(3) }); }
const far = { x: 9999, z: 9999 };
const live = (g) => g.bags.find((b) => b.state === 'home' || b.state === 'ground');
const only = (g, k) => { for (const b of g.bags) { b.state = 'hidden'; } const b = g.bags[k]; b.state = 'home'; b.x = b.home.x; b.z = b.home.z; return b; };
test('only one small bag is out at a time, the rest are hidden', () => {
  const g = fresh();
  assert.equal(g.bags.filter((b) => b.state === 'home').length, 1); assert.equal(g.bags.filter((b) => b.state === 'hidden').length, 11);
});
test('the robber takes the bag to the safehouse; then a new bag turns up elsewhere and the safehouse moves', () => {
  const g = fresh(), a = live(g), old = g.safehouse;
  g.step(0.1, { x: a.x, z: a.z }, far);
  assert.equal(g.robberBag, a); assert.equal(g.alarm, true); assert.equal(a.state, 'robber');
  g.step(0.1, { x: g.safehouse.x, z: g.safehouse.z }, far);
  assert.equal(g.robbed, 1); assert.equal(a.state, 'safe'); assert.equal(g.robberBag, null); assert.equal(g.alarm, false);
  assert.deepEqual(g.events.map((e) => e.type), ['spawn', 'pickup', 'deliver', 'spawn']);
  const n = live(g); assert.ok(n && n !== a, 'a different bag is out now'); assert.equal(g.bags.filter((b) => b.state === 'home').length, 1);
  assert.ok(g.safehouse.x !== old.x || g.safehouse.z !== old.z, 'the safehouse moved');
});
test('three bags in the safehouse and the robbers win', () => {
  const g = fresh();
  for (let k = 0; k < 3; k++) { const a = live(g); g.step(0.1, { x: a.x, z: a.z }, far); g.step(0.1, { x: g.safehouse.x, z: g.safehouse.z }, far); }
  assert.equal(g.over, true); assert.equal(g.winner, 'robber'); assert.equal(g.robbed, 3);
  const n = g.events.length; g.step(0.1, { x: g.bags[5].x, z: g.bags[5].z }, far); assert.equal(g.events.length, n, 'nothing happens once it is over');
});
test('three hard rams stop the robbery: the bag goes back in its bank, a strike, and the next bag is put out', () => {
  const g = fresh(), a = only(g, 0), at = { x: a.x, z: a.z };
  g.step(0.1, at, far, [TOWN.ramSpeed + 5]); assert.equal(g.ramCount, 0, 'no bag yet, so a ram is nothing');
  g.step(0.1, at, far); assert.equal(g.robberBag, a);
  g.step(0.1, at, far, [TOWN.ramSpeed - 1]); assert.equal(g.ramCount, 0, 'a nudge is nothing');
  g.step(0.1, at, far, [TOWN.ramSpeed + 2]); assert.equal(g.ramCount, 1); assert.equal(g.robberBag, a, 'still has the bag');
  g.step(0.1, at, far, [TOWN.ramSpeed + 2]); assert.equal(g.ramCount, 1, 'rams too close together count once');
  g.time += 2; g.step(0.1, at, far, [TOWN.ramSpeed + 2]); assert.equal(g.ramCount, 2);
  g.time += 2; g.step(0.1, at, far, [TOWN.ramSpeed + 2]);
  assert.equal(g.robberBag, null); assert.equal(a.state, 'hidden'); assert.equal(g.strikes, 1); assert.equal(g.alarm, false); assert.equal(g.ramCount, 0);
  assert.ok(g.events.some((e) => e.type === 'stopped'));
  const n = live(g); assert.ok(n && n !== a, 'a different bag is out'); assert.equal(g.bags.filter((x) => x.state === 'home').length, 1);
  assert.equal(a.x, a.home.x);
});
test('three strikes and the robber is in jail: the police win', () => {
  const g = fresh();
  for (let k = 0; k < 3; k++) {
    const b = live(g), at = { x: b.x, z: b.z }; g.step(0.1, at, far);
    for (let r = 0; r < 3; r++) { g.time += 2; g.step(0.1, at, far, [15]); }
    assert.equal(g.strikes, k + 1);
  }
  assert.equal(g.over, true); assert.equal(g.winner, 'police');
  const n = g.events.length; g.step(0.1, far, far, [20]); assert.equal(g.events.length, n);
});
test('strikes and bags in the safehouse are counted separately and the ram count restarts with each bag', () => {
  const g = fresh(); let b = live(g), at = { x: b.x, z: b.z }; g.step(0.1, at, far); g.time += 2; g.step(0.1, at, far, [15]); assert.equal(g.ramCount, 1);
  g.step(0.1, { x: g.safehouse.x, z: g.safehouse.z }, far); assert.equal(g.ramCount, 0); assert.equal(g.robbed, 1); assert.equal(g.strikes, 0);
});

import { makeTemplate as _mk } from '../src/templates.js';
import { Track as _Track } from '../src/track.js';
test('the town streets sit on solid arena floor', () => {
  const tr = new _Track(_mk('getaway'));
  const L = townLayout(); const q = _Track.newQuery(); let bad = 0, n = 0;
  for (let x = -L.W / 2 + 8; x <= L.W / 2 - 8; x += 4) for (let z = -L.D / 2 + 8; z <= L.D / 2 - 8; z += 4) { tr.query(x, 3, z, q, 2); n++; if (q.idx < 0) bad++; }
  assert.equal(bad, 0, bad + ' of ' + n + ' points off floor');
  assert.equal(tr.blocks.length, 40);
});
