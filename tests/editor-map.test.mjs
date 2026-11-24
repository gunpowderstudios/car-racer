import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rescale, startWidth, drawParams } from '../src/editorMap.js';

test('Set scale: two points 50 m apart that should be 100 m double the picture about the first point', () => {
  const m = { x: 10, z: 20, w: 300 };
  const r = rescale(m, [0, 0], [30, 40], 100);                 // clicked 50 m apart, really 100 m
  assert.equal(r.f, 2); assert.equal(r.w, 600); assert.equal(r.x, 20); assert.equal(r.z, 40);
  // the first clicked point stays exactly where it was on the picture
  assert.deepEqual([0 + (m.x - 0) * 2 - r.x, 0 + (m.z - 0) * 2 - r.z], [0, 0]);
});
test('Set scale: bad input is refused', () => {
  const m = { x: 0, z: 0, w: 100 };
  assert.equal(rescale(m, [5, 5], [5, 5], 100), null);
  assert.equal(rescale(m, [0, 0], [3, 4], 0), null);
  assert.equal(rescale(m, [0, 0], [3, 4], NaN), null);
});
test('a new picture starts at about 80% of the screen width, never tiny', () => {
  assert.equal(startWidth(1000, 0.5), 1600);
  assert.equal(startWidth(10, 5), 40);
});
test('drawing scale: one image pixel covers width*zoom/imagewidth screen pixels, turn is in radians', () => {
  const p = drawParams({ w: 600, rot: 90 }, 1200, 2);
  assert.equal(p.k, 1); assert.ok(Math.abs(p.rot - Math.PI / 2) < 1e-9);
});

import { makeTemplate, TEMPLATE_KEYS, EDITOR_TEMPLATE_KEYS } from '../src/templates.js';
import { Track, analyzeTrack, normalizeTrack } from '../src/track.js';
test('Crystal Palace: editor-only, flat, about 0.6 miles, clean, and says where its picture goes', () => {
  assert.ok(!TEMPLATE_KEYS.includes('crystalpalace') && EDITOR_TEMPLATE_KEYS.includes('crystalpalace'));
  assert.match(readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'), /addTemplate\('crystalpalace'\)/);        // listed under Driving Tests
  const def = makeTemplate('crystalpalace'), t = new Track(def), a = analyzeTrack(t);
  assert.equal(def.name, 'Crystal Palace');
  assert.ok(t.length > 900 && t.length < 1150, `length ${t.length}`);
  assert.deepEqual(a.tight, []); assert.equal(a.crossings.length, 0);
  assert.ok(def.handles.every((h) => h.y === 0));
  assert.deepEqual(def.mapFit, { x: 0, z: 0, w: 502, rot: 0 });
});

test('Crystal Palace has its buildings, and the three pubs are named on their fronts', () => {
  const def = makeTemplate('crystalpalace'), t = new Track(def);
  const blds = def.props.filter((p) => p.type === 'building');
  assert.ok(blds.length > 40);
  const names = def.props.filter((p) => p.name).map((p) => p.name).sort();
  for (const n of ['The Sparrowhawk', 'The Westow House', 'The White Hart']) assert.ok(names.includes(n), n);        // (Tim has named more since)
  assert.equal(t.buildings.length, blds.length);
  assert.ok(t.buildings.every((b) => !b.tunnel), 'no building may sit over the road');
  assert.deepEqual(t.buildings.filter((b) => b.name).map((b) => b.name).sort(), names);
  // a building's name is kept (trimmed, at most 24 characters) and a blank one is dropped
  const d2 = normalizeTrack({ ...def, props: [{ type: 'building', x: 0, z: 0, y: 0, name: '  The   Very Long Pub Name That Goes On And On  ' }, { type: 'building', x: 50, z: 0, y: 0, name: '   ' }] });
  assert.equal(d2.props[0].name, 'The Very Long Pub Name T');             // spaces tidied, cut at 24 characters
  assert.equal(d2.props[1].name, undefined);
});

test('Crystal Palace has its one transmitter tower, 328 m tall, set back from the town', () => {
  const def = makeTemplate('crystalpalace'), tw = def.props.filter((p) => p.type === 'tower');
  assert.equal(tw.length, 1, 'only one tower'); assert.equal(tw[0].h, 328);
  const near = Math.min(...def.handles.map((h) => Math.hypot(tw[0].x - h.x, tw[0].z - h.z)));
  assert.ok(near > 50, `well clear of the road (${near} m)`);
  assert.equal(normalizeTrack({ ...def, props: [{ type: 'tower', x: 0, z: 0 }] }).props[0].h, 328);        // the default height
  assert.equal(normalizeTrack({ ...def, props: [{ type: 'tower', x: 0, z: 0, h: 5000 }] }).props[0].h, 600);
});

test('Sky and background buildings: Crystal Palace is a sunny day; the settings survive normalising; default stays dusk with a skyline', () => {
  const def = makeTemplate('crystalpalace');
  assert.equal(def.sky, 'day');
  const base = { name: 'x', width: 20, handles: def.handles };
  assert.equal(normalizeTrack({ ...base, sky: 'day', city: false }).sky, 'day');
  assert.equal(normalizeTrack({ ...base, sky: 'day', city: false }).city, false);
  const plain = normalizeTrack(base);
  assert.equal(plain.sky, undefined); assert.equal(plain.city, undefined);
  assert.equal(normalizeTrack({ ...base, sky: 'purple' }).sky, undefined);
});

test('Sharp corner: the road turns in a small neat arc, keeps its length and point order, and the setting survives normalising', () => {
  const sq = [[-120, -120], [120, -120], [120, 120], [-120, 120]].map(([x, z]) => ({ x, y: 0, z }));
  const plain = new Track(normalizeTrack({ name: 's', width: 14, handles: sq }));
  const sharp = new Track(normalizeTrack({ name: 's', width: 14, handles: sq.map((h, i) => (i === 1 ? { ...h, sharp: true } : h)) }));
  const minR = (t) => { let m = 0; for (let i = 0; i < t.n; i++) m = Math.max(m, Math.abs(t.curv[i])); return 1 / m; };
  assert.ok(minR(sharp) < minR(plain), `tighter: ${minR(sharp)} < ${minR(plain)}`);
  assert.ok(minR(sharp) >= 7, 'but not so tight the inner edge folds over (half the road is 7 m)');
  assert.ok(sharp.handleS.every((v, i, a) => i === 0 || v > a[i - 1]), 'points stay in order along the road');
  assert.equal(normalizeTrack({ name: 's', handles: sq.map((h) => ({ ...h, sharp: true })) }).handles[0].sharp, true);
  assert.equal(normalizeTrack({ name: 's', handles: sq }).handles[0].sharp, undefined);
  const first = new Track(normalizeTrack({ name: 's', width: 14, handles: sq.map((h, i) => (i === 0 ? { ...h, sharp: true } : h)) }));        // the first point too (the loop wraps round it)
  assert.ok(minR(first) >= 7 && first.handleS[0] === 0 && first.length > 900);
});

test('Editor Import button is wired to a file input and reads track files', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), ed = fs.readFileSync(new URL('../src/editor.js', import.meta.url), 'utf8');
  assert.match(html, /id="ed-import-btn"/); assert.match(html, /id="ed-import" type="file"/);
  assert.match(ed, /\$\('ed-import'\)\.onchange/); assert.match(ed, /normalizeTrack\(JSON\.parse\(await f\.text\(\)\)\)/);
});

test('Replay camera: a building between the camera and the car is hidden; one that is clear is not', async () => {
  const { lineHitsBuilding } = await import('../src/viewBlock.js');
  const B = { x: 0, z: 0, c: 1, s: 0, parts: [[-5, 0, -5, 5, 12, 5]] };                  // a 10 m block, 12 m tall, at the origin
  assert.ok(lineHitsBuilding(B, { x: -30, y: 3, z: 0 }, { x: 30, y: 1, z: 0 }), 'camera and car on opposite sides');
  assert.ok(lineHitsBuilding(B, { x: 0, y: 3, z: 0 }, { x: 30, y: 1, z: 0 }), 'camera inside the building');
  assert.ok(!lineHitsBuilding(B, { x: -30, y: 3, z: 20 }, { x: 30, y: 1, z: 20 }), 'a line passing well beside it');
  assert.ok(!lineHitsBuilding(B, { x: -30, y: 40, z: 0 }, { x: 30, y: 30, z: 0 }), 'a camera high above the roof');
  const turned = { x: 0, z: 0, c: Math.cos(Math.PI / 2), s: Math.sin(Math.PI / 2), parts: [[-20, 0, -2, 20, 10, 2]] };       // a long block turned a quarter turn: long along z, not x
  assert.ok(lineHitsBuilding(turned, { x: 0, y: 3, z: -30 }, { x: 0, y: 1, z: 30 }), 'through the long way');
  const fs = await import('node:fs');
  assert.match(fs.readFileSync(new URL('../src/replayMode.js', import.meta.url), 'utf8'), /d\.clearView\?\.\(cam\.position, f\)/);
});

test('A knocked parked car is held by the handbrake, never the foot brake (which would reverse it)', async () => {
  const fs = await import('node:fs'), src = fs.readFileSync(new URL('../src/derby.js', import.meta.url), 'utf8');
  assert.match(src, /const SETTLING = Object\.freeze\(\{ \.\.\.IDLE, handbrake: true \}\)/);
});
