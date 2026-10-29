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
test('the safehouse is on a street, never on a bag, and far from both starts', () => {
  for (const p of safehouseSpots(L)) { assert.ok(streetAt(L, p.x, p.z)); for (const b of L.banks) assert.ok(Math.hypot(p.x - b.bag.x, p.z - b.bag.z) > 8, 'not on a bag'); }
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
test('the robber picks up one bag at a time and takes it to the safehouse', () => {
  const g = fresh(), a = g.bags[0], b = g.bags[1];
  g.step(0.1, { x: a.x, z: a.z }, far);
  assert.equal(g.robberBag, a); assert.equal(g.alarm, true); assert.equal(a.state, 'robber');
  g.step(0.1, { x: b.x, z: b.z }, far); assert.equal(b.state, 'home', 'a second bag cannot be taken while carrying one');
  g.step(0.1, { x: g.safehouse.x, z: g.safehouse.z }, far);
  assert.equal(g.robbed, 1); assert.equal(a.state, 'safe'); assert.equal(g.robberBag, null); assert.equal(g.alarm, false);
  assert.deepEqual(g.events.map((e) => e.type), ['pickup', 'deliver']);
});
test('three bags in the safehouse and the robbers win', () => {
  const g = fresh();
  for (let k = 0; k < 3; k++) { g.step(0.1, { x: g.bags[k].x, z: g.bags[k].z }, far); g.step(0.1, { x: g.safehouse.x, z: g.safehouse.z }, far); }
  assert.equal(g.over, true); assert.equal(g.winner, 'robber'); assert.equal(g.robbed, 3);
  const n = g.events.length; g.step(0.1, { x: g.bags[5].x, z: g.bags[5].z }, far); assert.equal(g.events.length, n, 'nothing happens once it is over');
});
test('a hard ram drops the bag, a soft one does not; the police can take it only from the road', () => {
  const g = fresh(), a = g.bags[0];
  g.step(0.1, { x: a.x, z: a.z }, far);
  g.step(0.1, { x: a.x + 5, z: a.z }, far, [TOWN.ramSpeed - 1]); assert.equal(g.robberBag, a, 'a nudge is nothing');
  g.step(0.1, { x: a.x + 5, z: a.z }, { x: a.x + 3, z: a.z }, [TOWN.ramSpeed + 2]);
  assert.equal(a.state === 'ground' || a.state === 'police', true); assert.equal(g.robberBag, null); assert.equal(g.alarm, false);
  assert.ok(g.events.some((e) => e.type === 'drop'));
  assert.equal(g.policeBag, a, 'the police were right there and scooped it up');
});
test('the robber cannot take a dropped bag straight back, then can', () => {
  const g = fresh(), a = g.bags[0], at = { x: a.x, z: a.z };
  g.step(0.1, at, far); g.step(0.1, at, far, [12]);
  assert.equal(a.state, 'ground'); g.step(0.1, at, far); assert.equal(a.state, 'ground', 'grace');
  for (let t = 0; t < 3; t += 0.1) g.step(0.1, at, far);
  assert.equal(g.robberBag, a, 'picked up again after the grace');
});
test('the police bring a bag back to its own bank, not just any bank, and three wins', () => {
  const g = fresh();
  for (let k = 0; k < 3; k++) {
    const b = g.bags[k]; g.step(0.1, { x: b.x, z: b.z }, far); g.step(0.1, { x: b.x + 44, z: b.z }, { x: b.x + 43, z: b.z }, [15]);          // robbed, driven off, then rammed: the police take it
    g.step(0.1, far, { x: g.bags[(k + 5) % 12].x, z: g.bags[(k + 5) % 12].z });
    assert.equal(g.policeBag, b, 'still carrying: that is the wrong bank'); assert.equal(g.returned, k);
    g.time += 5;
    g.step(0.1, far, { x: b.home.x, z: b.home.z });
    assert.equal(b.state, 'home'); assert.equal(g.returned, k + 1);
    g.time += 5;
  }
  assert.equal(g.winner, 'police');
});
test('police cannot pick up a bag that is still at its bank', () => {
  const g = fresh(), a = g.bags[4];
  g.step(0.1, far, { x: a.x, z: a.z }); assert.equal(g.policeBag, null); assert.equal(a.state, 'home');
});

import { makeTemplate as _mk } from '../src/templates.js';
import { Track as _Track } from '../src/track.js';
test('the town streets sit on solid arena floor', () => {
  const tr = new _Track(_mk('getaway'));
  const L = townLayout(); const q = _Track.newQuery(); let bad = 0, n = 0;
  for (let x = -L.W / 2 + 8; x <= L.W / 2 - 8; x += 4) for (let z = -L.D / 2 + 8; z <= L.D / 2 - 8; z += 4) { tr.query(x, 3, z, q, 2); n++; if (q.idx < 0) bad++; }
  assert.equal(bad, 0, bad + ' of ' + n + ' points off floor');
  assert.equal(tr.blocks.length, 16);
});
