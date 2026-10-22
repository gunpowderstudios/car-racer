// The Oval: a free-for-all banger derby arena. Barrels, an open dirt floor, no laps, the last car running wins.
// Run with:  npm test
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Track, normalizeTrack } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { makeTemplate, TEMPLATE_KEYS, TEMPLATE_INFO } from '../src/templates.js';
import { Derby, DERBY, POINTS } from '../src/derby.js';
import { arenaInfo, arenaOutline, arenaPlayerStart, arenaSpawn } from '../src/arena.js';
import { TOUGHNESS, roofDentHp } from '../src/damage.js';
import { DENT } from '../src/dentMath.js';
import { placeOnTrack } from './harness.mjs';

const IDLE = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };

function arena(rivals = 6) {
  const def = makeTemplate('oval'), track = new Track(def), car = new Vehicle();
  placeOnTrack(car, track, track.startS(12), 0, 0);
  const derby = new Derby(); derby.enabled = true; derby.damageEnabled = true;
  derby.start(track, car, rivals, 11);
  return { def, track, car, derby };
}

test('The Oval track is a preloaded track, now called Bed Pan', () => {
  assert.ok(TEMPLATE_KEYS.includes('oval') && !TEMPLATE_KEYS.includes('kidney'));
  assert.equal(makeTemplate('oval').name, 'Bed Pan (Demolition Derby)');
  assert.match(TEMPLATE_INFO.oval, /last one standing/i);
  assert.equal(TEMPLATE_KEYS.length, 9, 'eight tracks and the random one');
});

test('it is marked as a last-one-standing arena, and other tracks are not', () => {
  assert.equal(makeTemplate('oval').mode, 'lastStanding');
  for (const k of TEMPLATE_KEYS) if (k !== 'oval') assert.equal(makeTemplate(k).mode, undefined, k);
  assert.equal(normalizeTrack(makeTemplate('oval')).mode, 'lastStanding', 'the mode survives loading');
  assert.equal(normalizeTrack({ handles: makeTemplate('oval').handles, mode: 'nonsense' }).mode, undefined);
});

test('full of drums, some in clusters, all on the floor, none where the player starts, and the same every time', () => {
  const def = makeTemplate('oval'), track = new Track(def), A = arenaInfo(track);
  const barrels = def.props.filter((p) => p.type === 'barrel');
  assert.ok(barrels.length >= 30 && barrels.length <= 45, String(barrels.length));
  assert.deepEqual(makeTemplate('oval').props, def.props, 'always the same drums');
  const q = Track.newQuery(), ps = arenaPlayerStart(A);
  for (const b of barrels) {
    track.query(b.x, b.y + 0.5, b.z, q, 2);
    assert.ok(q.idx >= 0 && Math.abs(q.d) < q.hw - 1, 'every drum is on the floor');
    assert.ok(Math.hypot(b.x - ps.x, b.z - ps.z) > 12, 'clear of the player start');
    for (let k = 0; k < 10; k++) { const sp = arenaSpawn(A, k, 10); assert.ok(Math.hypot(b.x - sp.x, b.z - sp.z) > 8, 'no drum beside a rival\'s starting spot'); }
  }
  let close = 0;
  for (let i = 0; i < barrels.length; i++) for (let j = i + 1; j < barrels.length; j++) if (Math.hypot(barrels[i].x - barrels[j].x, barrels[i].z - barrels[j].z) < 3.2) close++;
  assert.ok(close >= 8, 'clusters of drums that set each other off: ' + close);
});

test('it is a big open, walled, flat dirt floor, and its outline matches the physics wall', () => {
  const def = makeTemplate('oval'), track = new Track(def), A = arenaInfo(track), q = Track.newQuery();
  assert.equal(def.walls, true);
  assert.ok(A.ax > 90 && A.az > 55, 'a proper stadium floor');
  for (const p of arenaOutline(A, A.hw - 1.5, 72)) {
    track.query(p.x, A.y + 0.5, p.z, q, 2);
    assert.ok(q.idx >= 0 && q.hw - Math.abs(q.d) > 0.5, 'just inside the edge is floor');
  }
  for (const p of arenaOutline(A, A.hw + 1.4, 72)) {
    track.query(p.x, A.y + 1, p.z, q, 2);
    assert.ok(q.idx >= 0 && track.wallPenetration(q, q.y + 0.5) > 0, 'just past the edge is wall');
  }
});

test('the field starts spread round the floor, standing still, every rival spoiling for a fight', () => {
  const { track, derby } = arena(8);
  const rivals = derby.rivals, q = Track.newQuery();
  assert.equal(rivals.length, 8);
  for (const f of rivals) {
    assert.ok(f.car.speed < 0.5); assert.ok(f.driver.aggr >= 0.7);
    track.query(f.car.pos.x, f.car.pos.y, f.car.pos.z, q, 2);
    assert.ok(q.idx >= 0 && q.hw - Math.abs(q.d) > 5, 'on the floor');
  }
  let nearest = 1e9;
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) nearest = Math.min(nearest, Math.hypot(rivals[i].car.pos.x - rivals[j].car.pos.x, rivals[i].car.pos.z - rivals[j].car.pos.z));
  assert.ok(nearest > 20, 'not stacked on top of each other: ' + nearest.toFixed(1));
  const normal = new Derby(); const t2 = new Track(makeTemplate('speedway')), c2 = new Vehicle();
  placeOnTrack(c2, t2, t2.startS(12), 0, 0); normal.enabled = true; normal.start(t2, c2, 6, 11);
  assert.equal(normal.lastStanding, false);
});

test('vehicles are 20% weaker than the original, and each type has its own toughness', () => {
  assert.equal(TOUGHNESS, 0.8);
  assert.equal(DENT.fullHp, 56);
});

test('rivals pick the nearest running car as their target, not just you', () => {
  const { derby } = arena(6);
  const [a, b] = derby.rivals;
  a.car.pos.set(0, 0, 0); b.car.pos.set(5, 0, 0);
  for (const f of derby.rivals.slice(2)) f.car.pos.set(500, 0, 500);
  derby.player.car.pos.set(300, 0, 300);
  assert.equal(derby._nearestFoe(a), b.car);
  b.wrecked = true;
  assert.notEqual(derby._nearestFoe(a), b.car, 'wrecks are not targets');
});

test('wrecked rivals are not replaced', () => {
  const { derby } = arena(5);
  derby.time = DERBY.grace + 1;
  const first = derby.rivals[0]; first.age = 99;
  derby._damage(first, 'back', 999, null);
  for (let i = 0; i < 600; i++) derby.step(1 / 120, null);        // five seconds
  assert.ok(derby.rivals.filter((f) => !f.wrecked).length <= 4, 'at most four running (weak cars may wreck each other too)');
  assert.equal(derby.fighters.filter((f) => !f.isPlayer).length, 5, 'and no new ones came on');
});

test('wreck every rival and you win: 500 points, the game ends, and you are not wrecked', () => {
  const { derby } = arena(4);
  derby.time = DERBY.grace + 1;
  derby.events.length = 0;
  const all = derby.rivals;
  for (const f of all.slice(0, 3)) { f.age = 99; derby._damage(f, 'back', 999, derby.player); }
  derby.step(1 / 120, null);
  assert.equal(derby.over, false, 'one left: still going');
  assert.equal(derby.alive, 1);
  all[3].age = 99; derby._damage(all[3], 'back', 999, derby.player);
  const before = derby.score;
  derby.step(1 / 120, null);
  const over = derby.events.find((e) => e.type === 'over');
  assert.ok(over && over.won === true, JSON.stringify(derby.events.map((e) => e.type)));
  assert.equal(derby.over, true); assert.equal(derby.won, true);
  assert.equal(derby.score - before, POINTS.winner);
  assert.equal(derby.player.wrecked, false);
  derby.events.length = 0; derby.step(1 / 120, null);
  assert.equal(derby.events.filter((e) => e.type === 'over').length, 0, 'you only win once');
});

test('no win before the grace period is up, and no win once you are wrecked yourself', () => {
  const { derby } = arena(2);
  for (const f of derby.rivals) { f.age = 99; derby._damage(f, 'back', 999, null); }
  derby.time = 0.5;
  derby.step(1 / 120, null);
  assert.equal(derby.won, false);
  const { derby: d2 } = arena(3);
  d2.time = DERBY.grace + 1;
  d2._damage(d2.player, 'front', 9999, null);                     // you are the one wrecked
  for (const f of d2.rivals) { f.age = 99; d2._damage(f, 'back', 999, null); }
  d2.step(1 / 120, null);
  assert.equal(d2.won, false);
  assert.equal(d2.over, true);
});

test('left alone, the field tears itself apart: rivals wreck each other', () => {
  const { track, car, derby } = arena(8);
  derby.time = DERBY.grace + 1;
  for (let i = 0; i < 60 * 150; i++) {                              // two and a half minutes at 60 Hz
    car.step(1 / 60, IDLE, track);
    derby.step(1 / 60, null);
    car.events.length = 0; derby.events.length = 0;
  }
  const wrecked = derby.rivals.filter((f) => f.wrecked).length + derby.fighters.filter((f) => f.gone && !f.isPlayer).length;
  assert.ok(wrecked >= 1, `at least one rival was wrecked by the others (got ${wrecked})`);
  assert.equal(derby.rivals.length <= 8, true);
});

test('a roof scraping the ground in a roll leaves a roof dent; a hard landing on the wheels does not', () => {
  const { car, derby } = arena(3);
  derby.time = DERBY.grace + 1;
  car.refreshFrame();
  const roofPt = { x: car.pos.x + car.ay.x * 0.9, y: car.pos.y + car.ay.y * 0.9, z: car.pos.z + car.ay.z * 0.9 };
  derby.events.length = 0;
  car.events.push({ type: 'ground', speed: 9, ...roofPt });
  derby.step(1 / 120, null);
  const roof = derby.events.find((e) => e.type === 'damage' && e.isPlayer);
  assert.ok(roof, 'roof damage event');
  assert.equal(roof.zone, 'roof');
  assert.ok(roof.ly > 0.5, 'dent point is on the roof, local y ' + roof.ly);
  assert.ok(roof.dentHp >= 10 && roof.dentHp <= 60, 'dent sized from the impact speed: ' + roof.dentHp);
  assert.equal(roofDentHp(2), 0);
  assert.ok(roofDentHp(15) > roofDentHp(6));
  derby.events.length = 0; car.events.length = 0;      // the player's own events stay queued for main.js
  car.events.push({ type: 'ground', speed: 9, x: car.pos.x, y: car.pos.y - 0.4, z: car.pos.z + 1.5 });
  derby.step(1 / 120, null);
  const low = derby.events.find((e) => e.type === 'damage' && e.isPlayer);
  assert.ok(!low || (low.lx === undefined && low.dentHp === undefined), 'wheels and underside get no dent');
});

test('vehicle types differ in toughness: the V8 bruiser and the motorhome outlast the saloon and the camper', () => {
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  const mul = {};
  for (const id of ['car', 'escort', 'bmw', 'v8-pilot', 'campervan', 'motor-home']) {
    const at = src.indexOf(`id: '${id}'`), end = src.indexOf('physicsProfile', at);
    const m = /damageMul:\s*([0-9.]+)/.exec(src.slice(at, end));
    mul[id] = m ? Number(m[1]) : 1;
  }
  assert.ok(mul['v8-pilot'] < mul.car && mul.car < mul.bmw && mul.bmw < mul.escort, JSON.stringify(mul));
  assert.ok(mul['motor-home'] < 1 && mul.campervan > 1, JSON.stringify(mul));
  for (const v of Object.values(mul)) assert.ok(v >= 0.5 && v <= 1.5);
});

test('the arena is kept light: each quality tier caps the field and uses a close LOD distance', async () => {
  const src = readFileSync(new URL('../src/quality.js', import.meta.url), 'utf8');
  for (const tier of ['low', 'medium', 'high']) {
    const line = src.split('\n').find((l) => l.trim().startsWith(tier + ':'));
    const field = Number(/arenaField:\s*(\d+)/.exec(line)?.[1]), lod = Number(/arenaLod:\s*(\d+)/.exec(line)?.[1]);
    assert.ok(field >= 4 && field <= 10, tier + ' arenaField ' + field);
    assert.ok(lod >= 30 && lod <= 120, tier + ' arenaLod ' + lod);
    assert.ok(Number(/arenaNear:\s*(\d+)/.exec(line)?.[1]) >= 3, tier + ' arenaNear');
  }
});

test('car loading: a progress bar exists, rival paint is prepared ahead, and rivals are fitted a couple per frame', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const cv = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(html, /id="car-load"[^>]*hidden/);
  assert.match(cv, /export async function warmRivalLooks/);
  assert.match(cv, /RIVAL_TEX_MAX = 1024/);
  assert.match(main, /warmRivalLooks\(v, tier\.arenaField/);
  assert.match(main, /adopted < 2/);
});

test('crash debris: tiered pool, hooked into hits, walls, wrecks and multiplayer rams', async () => {
  const { readFileSync } = await import('node:fs');
  const { TIERS } = await import('../src/quality.js');
  assert.equal(TIERS.low.debris, 0, 'phones on Low get none');
  assert.ok(TIERS.medium.debris > 0 && TIERS.high.debris > TIERS.medium.debris);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /new Debris\(stage\.scene, tier\.debris\)/);
  assert.match(main, /debris\.update\(dt, debrisGround\)/);
  assert.match(main, /debris\.clear\(\)/);
  assert.ok((main.match(/crashDebris\(/g) || []).length >= 5, 'derby hit, wreck, player wall, mp ram and mp wreck');
});

test('the Mini Roundabout is a listed vehicle with its own light, grippy profile', async () => {
  const { vehiclePhysicsProfile } = await import('../src/vehiclePhysicsProfiles.js');
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'mini',\s*name: 'Mini Roundabout'/);
  assert.match(src, /url: 'cars\/mini-SHRINK\.glb'/);
  assert.match(src, /pot-noodle your way around corners/);
  assert.ok(existsSync(new URL('../cars/mini-SHRINK.glb', import.meta.url)), 'model file is in the repo');
  const mini = vehiclePhysicsProfile('mini'), esc = vehiclePhysicsProfile('escort');
  assert.ok(mini.mass < esc.mass && mini.wheelbase < esc.wheelbase && mini.steer.rate > esc.steer.rate);
  assert.ok(mini.body.length < 3.3 && mini.reference.includes('Mini'));
});

test('off-white models (the Mini) opt in to body-panel recolouring for rivals', () => {
  const choice = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  const visual = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(choice, /physicsProfile: 'mini',\s*neutralBody: true/);
  assert.match(choice, /m\.map\.userData\.neutralBody = true/);
  assert.match(visual, /tex\.userData\?\.neutralBody/);
});

test('every vehicle has a gallery picture and a model file, and the pickers are galleries not dropdowns', async () => {
  const { VEHICLES_SOURCE } = { VEHICLES_SOURCE: readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8') };
  const ids = [...VEHICLES_SOURCE.matchAll(/^\s*(?:\{\s*)?id: '([^']+)'/gm)].map((m) => m[1]);
  const urls = [...VEHICLES_SOURCE.matchAll(/url: 'cars\/([^']+\.glb)'/g)].map((m) => m[1]);
  assert.ok(ids.length >= 7 && urls.length === ids.length, `${ids.length} ids / ${urls.length} urls`);
  for (const id of ids) assert.ok(existsSync(new URL(`../cars/thumbs/${id}.webp`, import.meta.url)), `cars/thumbs/${id}.webp (run tools/make-vehicle-thumbs.py)`);
  for (const f of urls) assert.ok(existsSync(new URL(`../cars/${f}`, import.meta.url)), `cars/${f} is in the repo`);
  assert.match(VEHICLES_SOURCE, /function buildVehicleGallery/);
  assert.doesNotMatch(VEHICLES_SOURCE, /fillVehicleSelect/);
});

test('The Oval has four humps, one in each corner, that the physics ground follows', () => {
  const def = makeTemplate('oval'), track = new Track(def), A = arenaInfo(track), q = Track.newQuery();
  assert.equal(def.bumps.length, 4);
  assert.deepEqual(new Set(def.bumps.map((b) => Math.sign(b.x) + ',' + Math.sign(b.z))).size, 4, 'one in each corner');
  assert.deepEqual(makeTemplate('oval').bumps, def.bumps, 'always the same humps');
  for (const b of def.bumps) {
    track.query(b.x, A.y + 5, b.z, q, 7);
    assert.ok(Math.abs(q.y - (A.y + b.h)) < 0.01, 'the top of the hump is h above the floor: ' + q.y);
    assert.ok(q.ny > 0.99, 'level at the very top');
    track.query(b.x + b.r * 0.5, A.y + 5, b.z, q, 7);
    assert.ok(q.y > A.y + 0.2 && q.y < A.y + b.h && q.nx > 0.05, 'on the slope the ground is lower and tilts away from the top (nx ' + q.nx.toFixed(2) + ')');
    track.query(b.x + b.r + 0.5, A.y + 5, b.z, q, 7);
    assert.ok(Math.abs(q.y - A.y) < 0.01, 'flat floor again outside it');
  }
  const ps = arenaPlayerStart(A);
  for (const b of def.bumps) assert.ok(Math.hypot(b.x - ps.x, b.z - ps.z) > b.r + 20, 'not at the player start');
  for (const b of def.props.filter((p) => p.type === 'barrel')) for (const k of def.bumps) assert.ok(Math.hypot(b.x - k.x, b.z - k.z) >= k.r + 3 - 0.01, 'no drum on a hump');
  assert.equal(new Track(normalizeTrack({ handles: def.handles, mode: 'lastStanding', width: def.width, bumps: [{ x: 0, z: 0, r: 999, h: -5 }, 'junk'] })).bumps[0].r, 20, 'clamped');
  assert.equal(new Track(makeTemplate('speedway')).bumps, null, 'ordinary tracks have none');
});

test('rivals in The Oval steer round the humps instead of launching off them', () => {
  const { track, car, derby } = arena(8);
  const DT = 1 / 120; let near = 0, air = 0;
  for (let i = 0; i < 40 / DT; i++) {
    car.step(DT, { ...IDLE, brake: 1 }, track); derby.step(DT, null);
    for (const f of derby.fighters) {
      if (f.isPlayer || f.wrecked) continue;
      for (const b of track.bumps) if (Math.hypot(f.car.pos.x - b.x, f.car.pos.z - b.z) < b.r + 1) { near++; if (!f.car.onGround) air++; }
    }
    car.events.length = 0; derby.events.length = 0;
  }
  assert.ok(air <= near * 0.02, `${air} airborne frames of ${near} on or beside a hump`);
});

test('French Cheese (the 2CV) is a listed vehicle with a soft, bouncy profile and a menu picture', async () => {
  const { vehiclePhysicsProfile } = await import('../src/vehiclePhysicsProfiles.js');
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'french-cheese',\s*name: 'French Cheese'/);
  assert.match(src, /24 eggs across a field/);
  assert.match(src, /url: 'cars\/french-cheese-SHRINK\.glb'/);
  assert.ok(existsSync(new URL('../cars/french-cheese-SHRINK.glb', import.meta.url)), 'model file is in the repo');
  assert.ok(existsSync(new URL('../cars/thumbs/french-cheese.webp', import.meta.url)), 'gallery picture');
  const fc = vehiclePhysicsProfile('french-cheese'), mini = vehiclePhysicsProfile('mini'), esc = vehiclePhysicsProfile('escort');
  assert.ok(fc.reference.includes('2CV') && fc.susp.kFront / fc.mass < mini.susp.kFront / mini.mass, 'softer sprung than the Mini');
  assert.ok(fc.susp.travel > mini.susp.travel && fc.mass < esc.mass && fc.body.length > mini.body.length);
});

test('story mode: four circuits, one lap each, rising skill, five of nine go through', async () => {
  const { STORY, pointsFor, newTable, addStage, standings, survivors } = await import('../src/storyData.js');
  assert.equal(STORY.stages.length, 4);
  assert.deepEqual(STORY.stages.map((s) => s.laps), [1, 1, 1, 1], 'one lap each by default; the Laps option raises it');
  for (let i = 1; i < 4; i++) assert.ok(STORY.stages[i].skill >= STORY.stages[i - 1].skill, 'never gets easier');
  assert.ok(STORY.stages.every((s) => TEMPLATE_KEYS.includes(s.key) && s.key !== 'oval'), 'real circuits, not the arena');
  assert.equal(STORY.rivals + 1, 9);
  assert.deepEqual([1, 2, 3, 4, 5].map(pointsFor), [5, 3, 2, 1, 0], '5/3/2/1 then nothing');
  assert.deepEqual(STORY.keep, [5, 4, 3]);
  assert.equal(STORY.roster.length, STORY.rivals);
  const ids = ['you', ...STORY.roster.map((r) => r.id)], t = newTable(ids);
  addStage(t, ['rusty', 'you', 'nigel', 'tel', 'gaz']);
  assert.equal(t.rusty.pts, 5); assert.equal(t.you.pts, 3); assert.equal(t.baron.pts, 0);
  addStage(t, ['you', 'rusty', 'nigel']);
  assert.equal(standings(t)[0].id, 'you', '8 pts beats 8 pts on wins');
  assert.equal(survivors(t, 0).length, 5); assert.equal(survivors(t, 3).length, 9, 'the final cuts nobody');
  assert.ok(survivors(t, 0).includes('you'));
});

test('Cuddly Panda is a listed vehicle with its own profile, model and menu picture', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'panda',\s*name: 'Cuddly Panda',\s*description: 'Eats, shoots and leaves!'/);
  assert.match(src, /url: 'cars\/panda-SHRINK\.glb'/);
  assert.ok(existsSync(new URL('../cars/panda-SHRINK.glb', import.meta.url)));
  assert.ok(existsSync(new URL('../cars/thumbs/panda.webp', import.meta.url)));
  const { vehiclePhysicsProfile } = await import('../src/vehiclePhysicsProfiles.js');
  const pa = vehiclePhysicsProfile('panda');
  assert.ok(pa && pa.mass > 700 && pa.mass < 1000 && pa.wheelbase < 2.6);
});

test('Swedish Massage (the Volvo estate) is a listed vehicle with its own profile, model and menu picture', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'volvo',\s*name: 'Swedish Massage',\s*description: 'Handy for shifting junk up hills!'/);
  assert.ok(existsSync(new URL('../cars/volvo-SHRINK.glb', import.meta.url)));
  assert.ok(existsSync(new URL('../cars/thumbs/volvo.webp', import.meta.url)));
  const { vehiclePhysicsProfile } = await import('../src/vehiclePhysicsProfiles.js');
  const v = vehiclePhysicsProfile('volvo');
  assert.ok(v && v.mass > 1300 && v.wheelbase > 2.5);
});

test('Rootmaster (the London bus) is a listed vehicle with its own heavy profile, model and menu picture', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'bus',\s*name: 'Rootmaster'/);
  assert.ok(existsSync(new URL('../cars/bus-SHRINK.glb', import.meta.url)));
  assert.ok(existsSync(new URL('../cars/thumbs/bus.webp', import.meta.url)));
  const { vehiclePhysicsProfile } = await import('../src/vehiclePhysicsProfiles.js');
  const b = vehiclePhysicsProfile('bus'), mh = vehiclePhysicsProfile('motor-home');
  assert.ok(b && b.mass > mh.mass && b.steer.max < mh.steer.max, 'heavier and slower to turn than the motorhome');
});

test('heavy car models have light copies for phones, and every listed light copy exists', async () => {
  const { readFileSync, existsSync, statSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  const list = /LITE_MODELS = \[([^\]]+)\]/.exec(src)[1].match(/cars\/[^']+/g);
  assert.ok(list.length >= 6);
  for (const u of list) {
    const lite = new URL('../' + u.replace('cars/', 'cars/lite/'), import.meta.url), full = new URL('../' + u, import.meta.url);
    assert.ok(existsSync(lite), `${u} has a light copy`);
    assert.ok(statSync(lite).size < statSync(full).size, 'and it is smaller');
  }
  assert.match(readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8'), /out\.offset\.copy\(tex\.offset\)/, 'rival paint keeps the light models\' UV transform');
});

test('every race starts on the Chase camera on a computer and the High camera on a touch screen', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /function startDriving\(newDef\) \{\s*sound\.init\(\); pickStartCamera\(\);/);
  assert.match(main, /chase\.mode = phone \|\| big \? 1 : 0/, "mode 0 is Chase, 1 is High");
});

test('Race Day stages start with the three-light Red, Red, Green sequence', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  assert.ok(existsSync(new URL('../src/raceLights.js', import.meta.url)));
  const rl = readFileSync(new URL('../src/raceLights.js', import.meta.url), 'utf8');
  assert.match(rl, /'<div class="rl-col">.*\.repeat\(3\)/, 'three lights');
  const sm = readFileSync(new URL('../src/storyMode.js', import.meta.url), 'utf8');
  assert.match(sm, /startRaceLights\(\(\) => app\.freeze\(false\)/, 'the race is held until the lights go out');
  assert.match(sm, /cancelRaceLights\(\)/);
});

test('wheels: the visual finds Wheel_* nodes, turns them from the physics, and can throw them off', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const cv = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(cv, /Wheel_\(FL\|FR\|RL\|RR\|F\)/);
  assert.match(cv, /setWheels\(car\)/); assert.match(cv, /detachWheels\(\)/); assert.match(cv, /restoreWheels\(\)/);
  assert.ok(existsSync(new URL('../src/wheelDebris.js', import.meta.url)));
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /visual\.setWheels\(car\)/); assert.match(main, /wheelFlyers\.launch/);
  // the light copy of the Mini keeps its named wheels
  const buf = readFileSync(new URL('../cars/lite/mini-SHRINK.glb', import.meta.url));
  const json = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const names = json.nodes.map((n) => n.name).filter(Boolean);
  for (const n of ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']) assert.ok(names.includes(n), n);
});

test('wheels turn about their real axle, not the bounding-box centre (no up-and-down wobble)', async () => {
  const { readFileSync } = await import('node:fs');
  const cv = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(cv, /export function wheelAxle\(geo\)/);
  assert.match(cv, /_axle/, 'each wheel gets a pivot group on its axle');
});

test('Mobile Chariot (the three-wheeled mobility car) is listed, has its own profile, and a single front wheel is handled', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'mobility-car',\s*name: 'Mobile Chariot',\s*description: 'A fiberglass deathtrap which rolled with the times\.\.\. literally!'/);
  assert.match(src, /url: 'cars\/mobility-car-SHRINK\.glb'/);
  assert.ok(existsSync(new URL('../cars/mobility-car-SHRINK.glb', import.meta.url)));
  assert.ok(existsSync(new URL('../cars/lite/mobility-car-SHRINK.glb', import.meta.url)));
  assert.ok(existsSync(new URL('../cars/thumbs/mobility-car.webp', import.meta.url)));
  const { vehiclePhysicsProfile } = await import('../src/vehiclePhysicsProfiles.js');
  const m = vehiclePhysicsProfile('mobility-car');
  assert.ok(m && m.mass < 500 && m.body.length < 3.2);
  const cv = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(cv, /Wheel_\(FL\|FR\|RL\|RR\|F\)/, 'a three-wheeler names its one front wheel Wheel_F');
});

test('WASAABI (the Saab turbo) is a listed vehicle with its own profile, model, phone copy and menu picture', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'saab',\s*name: 'WASAABI',\s*description: 'I used to be a JET you know!'/);
  for (const f of ['cars/saab-SHRINK.glb', 'cars/lite/saab-SHRINK.glb', 'cars/thumbs/saab.webp']) assert.ok(existsSync(new URL('../' + f, import.meta.url)), f);
  const { vehiclePhysicsProfile } = await import('../src/vehiclePhysicsProfiles.js');
  const sa = vehiclePhysicsProfile('saab');
  assert.ok(sa && sa.mass > 1100 && sa.mass < 1400 && sa.boost.accel > 5);
});

test('wheels: bits of body cut out with a wheel are trimmed off it', async () => {
  const { readFileSync } = await import('node:fs');
  const cv = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(cv, /export function trimWheel\(geo, ax\)/);
  assert.match(cv, /trimWheel\(m\.geometry, ax\)/, 'applied to every wheel as it is re-pivoted');
});

test('home page: Play Now is Buckle up!, and Multiplayer sits beside it too', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="btn-play-now"[^>]*>Buckle up! <small>A random race<\/small>/);
  assert.match(html, /Race Day <small>What do points mean\?<\/small>/);
  assert.match(html, /Multiplayer <small>Destroy your friends online<\/small>/);
  assert.match(html, /id="btn-new-top"[^>]*>Design-a-track! <small>Test it and send it to a friend!<\/small>/);
  assert.doesNotMatch(html, />Play Now</);
  assert.match(html, /id="btn-multiplayer-top"/);
  assert.match(html, /id="btn-multiplayer"/, 'the lower Multiplayer button stays');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /btn-multiplayer-top'\)\.onclick = \(\) => \$\('btn-multiplayer'\)\.click\(\)/);
});

test('The Twister: the spiral has no barriers, coming back from it means starting at its foot, and the open flag survives sharing', async () => {
  const { Track, normalizeTrack } = await import('../src/track.js');
  const def = makeTemplate('twister'), track = new Track(def);
  assert.ok(track.openA > 0 && track.openB > track.openA + 500, 'there is an open spiral stretch');
  const mid = (track.openA + track.openB) / 2;
  assert.ok(track.inOpen(mid) && !track.inOpen(track.openA - 40) && !track.inOpen(track.openB + 40));
  assert.ok(Math.abs(track.restartS(mid) - (track.openA - 14)) < 1e-6);                                  // a car brought back from up the spiral starts at its foot
  assert.equal(track.restartS(track.openB + 40), track.openB + 40);                     // anywhere else it is put back where it was
  assert.equal(track.wallOff[Math.floor(mid / track.ds)], 1);
  const shared = new Track(normalizeTrack(JSON.parse(JSON.stringify(def))));            // as sent to a friend
  assert.equal(shared.openA, track.openA);
});

test('wheels saved from Shrink (extras.wheel) are never trimmed, only re-pivoted on the fitted hub', () => {
  const cv = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(cv, /userData\.wheel/);
  assert.match(cv, /if \(!exact\) trimWheel/);
});

test('the whole game runs GAME_SPEED times faster than the wall clock, and the speedometer and lap clock say so', () => {
  const gs = readFileSync(new URL('../src/gameSpeed.js', import.meta.url), 'utf8');
  assert.match(gs, /export const GAME_SPEED = 1\.1;/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /acc \+= dt \* GAME_SPEED/);
  assert.match(main, /simTime \+= DT \/ GAME_SPEED/);
  assert.match(readFileSync(new URL('../src/hud.js', import.meta.url), 'utf8'), /car\.speed \* GAME_SPEED/);
});

test('the Rootmaster rings bus-bell.mp3 instead of honking', () => {
  const a = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  assert.match(a, /load\('busBell', 'sounds\/bus-bell\.mp3'\)/);
  assert.match(a, /vehicleId === 'bus' && this\.buf\.busBell/);
  assert.match(readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'), /sound\.hornStart\(selectedVehicle\(\)\.id\)/);
  assert.ok(existsSync(new URL('../sounds/bus-bell.mp3', import.meta.url)));
});

test('a wrecked caravan loses only its left wheel (the other stays on) and sags to that side', () => {
  const v = readFileSync(new URL('../src/caravanView.js', import.meta.url), 'utf8');
  assert.match(v, /_lostWheel/);
  assert.match(v, /out\.push\(\{ node: left/);
  assert.doesNotMatch(v, /for \(const w of this\.wheels\) \{ scene\.attach\(w\)/);
  assert.match(v, /this\._e\.z -= 0\.2 \* this\._sag/);
});

test('caravan dents skip wheel meshes even when a wheel has more vertices than the body', () => {
  const src = readFileSync(new URL('../src/caravanView.js', import.meta.url), 'utf8');
  assert.match(src, /isWheelish/);
  assert.match(src, /makeDentable\(this\.root, this\.holder, vanDentMax\(\), isWheelish\)/);
});

test('a weak touch screen never loads the caravan; computers and capable phones can', async () => {
  const { caravanBlocked } = await import('../src/caravanPhone.js');
  assert.equal(caravanBlocked(), false);                                // (node has no matchMedia: a computer)
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const as = (hints) => { globalThis.matchMedia = (q) => ({ matches: q.includes('coarse') }); Object.defineProperty(globalThis, 'navigator', { value: hints, configurable: true }); };
  as({ hardwareConcurrency: 6, deviceMemory: 4 });
  assert.equal(caravanBlocked(), false, 'a capable phone can tow');
  as({ hardwareConcurrency: 8, deviceMemory: 2 });
  assert.equal(caravanBlocked(), true, 'a phone with little memory cannot');
  as({ hardwareConcurrency: 2, deviceMemory: 4 });
  assert.equal(caravanBlocked(), true, 'a phone with few cores cannot');
  globalThis.location = { search: '?caravan=1' };
  assert.equal(caravanBlocked(), false, 'the test switch forces it on');
  globalThis.location = { search: '?caravan=0' };
  as({ hardwareConcurrency: 8, deviceMemory: 8 });
  assert.equal(caravanBlocked(), true, 'and ?caravan=0 forces it off');
  delete globalThis.location; delete globalThis.matchMedia;
  if (nav) Object.defineProperty(globalThis, 'navigator', nav);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const caravanWanted = \(\) => !caravanBlocked\(\)/);
  assert.match(main, /if \(caravanBlocked\(\)\) \{ mpDropVan\(p\); return; \}/);
  assert.match(readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8'), /caravan-desktop-only/);
  assert.match(readFileSync(new URL('../src/menuVehiclePreview.js', import.meta.url), 'utf8'), /caravanBlocked\(\)\) return false/);
});

test('Race Day stages start with the three-light Red, Red, Green sequence', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  assert.ok(existsSync(new URL('../src/raceLights.js', import.meta.url)));
  const rl = readFileSync(new URL('../src/raceLights.js', import.meta.url), 'utf8');
  assert.match(rl, /'<div class="rl-col">.*\.repeat\(3\)/, 'three lights');
  const sm = readFileSync(new URL('../src/storyMode.js', import.meta.url), 'utf8');
  assert.match(sm, /startRaceLights\(\(\) => app\.freeze\(false\)/, 'the race is held until the lights go out');
  assert.match(sm, /cancelRaceLights\(\)/);
});

test('wheels: the visual finds Wheel_* nodes, turns them from the physics, and can throw them off', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const cv = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(cv, /Wheel_\(FL\|FR\|RL\|RR\|F\)/);
  assert.match(cv, /setWheels\(car\)/); assert.match(cv, /detachWheels\(\)/); assert.match(cv, /restoreWheels\(\)/);
  assert.ok(existsSync(new URL('../src/wheelDebris.js', import.meta.url)));
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /visual\.setWheels\(car\)/); assert.match(main, /wheelFlyers\.launch/);
  // the light copy of the Mini keeps its named wheels
  const buf = readFileSync(new URL('../cars/lite/mini-SHRINK.glb', import.meta.url));
  const json = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const names = json.nodes.map((n) => n.name).filter(Boolean);
  for (const n of ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']) assert.ok(names.includes(n), n);
});

test('wheels turn about their real axle, not the bounding-box centre (no up-and-down wobble)', async () => {
  const { readFileSync } = await import('node:fs');
  const cv = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(cv, /export function wheelAxle\(geo\)/);
  assert.match(cv, /_axle/, 'each wheel gets a pivot group on its axle');
});

test('Mobile Chariot (the three-wheeled mobility car) is listed, has its own profile, and a single front wheel is handled', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'mobility-car',\s*name: 'Mobile Chariot',\s*description: 'A fiberglass deathtrap which rolled with the times\.\.\. literally!'/);
  assert.match(src, /url: 'cars\/mobility-car-SHRINK\.glb'/);
  assert.ok(existsSync(new URL('../cars/mobility-car-SHRINK.glb', import.meta.url)));
  assert.ok(existsSync(new URL('../cars/lite/mobility-car-SHRINK.glb', import.meta.url)));
  assert.ok(existsSync(new URL('../cars/thumbs/mobility-car.webp', import.meta.url)));
  const { vehiclePhysicsProfile } = await import('../src/vehiclePhysicsProfiles.js');
  const m = vehiclePhysicsProfile('mobility-car');
  assert.ok(m && m.mass < 500 && m.body.length < 3.2);
  const cv = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(cv, /Wheel_\(FL\|FR\|RL\|RR\|F\)/, 'a three-wheeler names its one front wheel Wheel_F');
});

test('WASAABI (the Saab turbo) is a listed vehicle with its own profile, model, phone copy and menu picture', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
  assert.match(src, /id: 'saab',\s*name: 'WASAABI',\s*description: 'I used to be a JET you know!'/);
  for (const f of ['cars/saab-SHRINK.glb', 'cars/lite/saab-SHRINK.glb', 'cars/thumbs/saab.webp']) assert.ok(existsSync(new URL('../' + f, import.meta.url)), f);
  const { vehiclePhysicsProfile } = await import('../src/vehiclePhysicsProfiles.js');
  const sa = vehiclePhysicsProfile('saab');
  assert.ok(sa && sa.mass > 1100 && sa.mass < 1400 && sa.boost.accel > 5);
});

test('wheels: bits of body cut out with a wheel are trimmed off it', async () => {
  const { readFileSync } = await import('node:fs');
  const cv = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(cv, /export function trimWheel\(geo, ax\)/);
  assert.match(cv, /trimWheel\(m\.geometry, ax\)/, 'applied to every wheel as it is re-pivoted');
});

test('home page: Play Now is Buckle up!, and Multiplayer sits beside it too', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="btn-play-now"[^>]*>Buckle up! <small>A random race<\/small>/);
  assert.match(html, /Race Day <small>What do points mean\?<\/small>/);
  assert.match(html, /Multiplayer <small>Destroy your friends online<\/small>/);
  assert.match(html, /id="btn-new-top"[^>]*>Design-a-track! <small>Test it and send it to a friend!<\/small>/);
  assert.doesNotMatch(html, />Play Now</);
  assert.match(html, /id="btn-multiplayer-top"/);
  assert.match(html, /id="btn-multiplayer"/, 'the lower Multiplayer button stays');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /btn-multiplayer-top'\)\.onclick = \(\) => \$\('btn-multiplayer'\)\.click\(\)/);
});

test('The Twister: the spiral has no barriers, coming back from it means starting at its foot, and the open flag survives sharing', async () => {
  const { Track, normalizeTrack } = await import('../src/track.js');
  const def = makeTemplate('twister'), track = new Track(def);
  assert.ok(track.openA > 0 && track.openB > track.openA + 500, 'there is an open spiral stretch');
  const mid = (track.openA + track.openB) / 2;
  assert.ok(track.inOpen(mid) && !track.inOpen(track.openA - 40) && !track.inOpen(track.openB + 40));
  assert.ok(Math.abs(track.restartS(mid) - (track.openA - 14)) < 1e-6);                                  // a car brought back from up the spiral starts at its foot
  assert.equal(track.restartS(track.openB + 40), track.openB + 40);                     // anywhere else it is put back where it was
  assert.equal(track.wallOff[Math.floor(mid / track.ds)], 1);
  const shared = new Track(normalizeTrack(JSON.parse(JSON.stringify(def))));            // as sent to a friend
  assert.equal(shared.openA, track.openA);
});

test('wheels saved from Shrink (extras.wheel) are never trimmed, only re-pivoted on the fitted hub', () => {
  const cv = readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');
  assert.match(cv, /userData\.wheel/);
  assert.match(cv, /if \(!exact\) trimWheel/);
});

test('the whole game runs GAME_SPEED times faster than the wall clock, and the speedometer and lap clock say so', () => {
  const gs = readFileSync(new URL('../src/gameSpeed.js', import.meta.url), 'utf8');
  assert.match(gs, /export const GAME_SPEED = 1\.1;/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /acc \+= dt \* GAME_SPEED/);
  assert.match(main, /simTime \+= DT \/ GAME_SPEED/);
  assert.match(readFileSync(new URL('../src/hud.js', import.meta.url), 'utf8'), /car\.speed \* GAME_SPEED/);
});

test('the Rootmaster rings bus-bell.mp3 instead of honking', () => {
  const a = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  assert.match(a, /load\('busBell', 'sounds\/bus-bell\.mp3'\)/);
  assert.match(a, /vehicleId === 'bus' && this\.buf\.busBell/);
  assert.match(readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'), /sound\.hornStart\(selectedVehicle\(\)\.id\)/);
  assert.ok(existsSync(new URL('../sounds/bus-bell.mp3', import.meta.url)));
});

test('a wrecked caravan loses only its left wheel (the other stays on) and sags to that side', () => {
  const v = readFileSync(new URL('../src/caravanView.js', import.meta.url), 'utf8');
  assert.match(v, /_lostWheel/);
  assert.match(v, /out\.push\(\{ node: left/);
  assert.doesNotMatch(v, /for \(const w of this\.wheels\) \{ scene\.attach\(w\)/);
  assert.match(v, /this\._e\.z -= 0\.2 \* this\._sag/);
});

test('caravan dents skip wheel meshes even when a wheel has more vertices than the body', () => {
  const src = readFileSync(new URL('../src/caravanView.js', import.meta.url), 'utf8');
  assert.match(src, /isWheelish/);
  assert.match(src, /makeDentable\(this\.root, this\.holder, vanDentMax\(\), isWheelish\)/);
});

test('a touch screen never loads the caravan: it is blocked in the game, the menu card and the preview', async () => {
  const { caravanBlocked } = await import('../src/caravanPhone.js');
  assert.equal(caravanBlocked(), false);                                // (node has no matchMedia: desktop)
  globalThis.matchMedia = (q) => ({ matches: q.includes('coarse') });
  assert.equal(caravanBlocked(), true);
  globalThis.location = { search: '?perf&caravan=1' };                  // the test switch: a phone can try the caravan
  assert.equal(caravanBlocked(), false);
  delete globalThis.location; delete globalThis.matchMedia;
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const caravanWanted = \(\) => !caravanBlocked\(\)/);
  assert.match(main, /if \(caravanBlocked\(\)\) \{ mpDropVan\(p\); return; \}/);
  assert.match(readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8'), /caravan-desktop-only/);
  assert.match(readFileSync(new URL('../src/menuVehiclePreview.js', import.meta.url), 'utf8'), /caravanBlocked\(\)\) return false/);
});

test('The Bed Pan: a repaired player goes back on a clear patch of floor, away from the humps and from the rivals', async () => {
  const { arenaClearSpot, arenaInfo } = await import('../src/arena.js');
  const def = makeTemplate('oval'), A = arenaInfo(new Track(def));
  const alone = arenaClearSpot(A);
  for (const o of [[], [{ x: alone.x, z: alone.z }], [{ x: A.cx, z: A.cz - 48 }, { x: A.cx + 90, z: A.cz }]]) {
    const p = arenaClearSpot(A, o);
    assert.ok(def.bumps.every((b) => Math.hypot(p.x - b.x, p.z - b.z) > b.r + 6), 'not on a hump');
    if (o.length) assert.ok(o.every((c) => Math.hypot(p.x - c.x, p.z - c.z) > 20), 'not on a rival');
    assert.ok(Math.abs(Math.hypot(p.fx, p.fz) - 1) < 1e-9);
  }
});
