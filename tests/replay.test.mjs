import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplayRecorder, ReplayPlayer, ReplayCams, HZ, STRIDE } from '../src/replay.js';
import { Track } from '../src/track.js';
import { DRAG_DEF } from './harness.mjs';

const car = (id, x, extra = {}) => ({ rpm: 3000, thr: 0.5, skid: 0.2, boost: false, id, hue: 1, isPlayer: id === 'p', x, y: 0.5, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, steer: 0, spin: [0, 0, 0, 0], health: 1, wrecked: false, van: null, ...extra });

test('the recorder keeps about HZ notes a second and ignores the ones that come too soon', () => {
  const r = new ReplayRecorder();
  let kept = 0;
  for (let i = 0; i < 600; i++) if (r.record(i / 120, [car('p', i)])) kept++;      // 5 s of game time at 120 Hz
  assert.ok(Math.abs(kept - 5 * HZ) <= 2, 'kept ' + kept);
  assert.equal(r.empty, false);
});

test('the player blends position, steering, wheel spin, the caravan and the facing between two notes', () => {
  const r = new ReplayRecorder();
  const van0 = [0, 0, -5, 0.1, 0, 0, 10, 0, 1], van1 = [2, 0, -5, 0.3, 0, 0, 20, 0, 0.5];
  r.record(0, [car('p', 0, { steer: -0.2, spin: [0, 1, 2, 3], van: van0 })]);
  r.record(0.05, [car('p', 2, { steer: 0.2, spin: [2, 3, 4, 5], van: van1, qz: 0.3826834, qw: 0.9238795 })]);
  const p = new ReplayPlayer(r), e = p.sample(0.025)[0];
  assert.ok(Math.abs(e.x - 1) < 1e-9 && Math.abs(e.steer) < 1e-9 && Math.abs(e.spin[2] - 3) < 1e-9);
  assert.ok(Math.abs(e.van[0] - 1) < 1e-9 && Math.abs(e.van[6] - 15) < 1e-9 && Math.abs(e.van[8] - 0.75) < 1e-9);
  assert.ok(Math.abs(Math.hypot(e.qx, e.qy, e.qz, e.qw) - 1) < 1e-9, 'a unit quaternion');
  assert.ok(e.qz > 0.19 && e.qz < 0.2, 'half way round: ' + e.qz);
  // before the first note and after the last: held at the ends
  assert.equal(p.sample(-5)[0].x, 0); assert.equal(p.sample(99)[0].x, 2);
});

test('the caravan yaw takes the short way round the circle', () => {
  const r = new ReplayRecorder();
  r.record(0, [car('p', 0, { van: [0, 0, 0, 3.0, 0, 0, 0, 0, 1] })]);
  r.record(0.05, [car('p', 0, { van: [0, 0, 0, -3.0, 0, 0, 0, 0, 1] })]);
  const y = new ReplayPlayer(r).sample(0.025)[0].van[3];
  assert.ok(Math.abs(Math.abs(y) - Math.PI) < 0.2, 'went through pi, not through 0: ' + y);
});

test('a car that appears late, or is gone, comes and goes in the replay', () => {
  const r = new ReplayRecorder();
  r.record(0, [car('p', 0)]);
  r.record(0.05, [car('p', 1), car(7, 10)]);
  r.record(0.10, [car('p', 2)]);                                      // rival 7 has gone
  const p = new ReplayPlayer(r);
  assert.deepEqual(p.sample(0).map((e) => e.id), ['p']);
  assert.deepEqual(p.sample(0.05).map((e) => e.id), ['p', 7]);
  assert.deepEqual(p.sample(0.10).map((e) => e.id), ['p']);
});

test('it only keeps a rolling window, but a log of events survives and can be read between two times', () => {
  const r = new ReplayRecorder({ maxSeconds: 10 });
  for (let i = 0; i < 40 * HZ; i++) r.record(i / HZ, [car('p', i)]);     // 40 s
  assert.ok(r.duration <= 10.1 && r.duration >= 9.9, 'window ' + r.duration);
  assert.ok(r.frames.length < 40 * HZ + 5);
  for (const t of [1, 2, 3, 30]) r.event(t, { type: 'dent', id: 'p' });
  const p = new ReplayPlayer(r);
  assert.deepEqual(p.between(1, 3).map((e) => e.t), [2, 3]);
  assert.equal(p.between(-1, 100).length, 4);
  assert.ok(p.sample(35)[0].x > 0, 'plays from inside the window');
});

test('the clock going backwards (a restart) starts a fresh recording', () => {
  const r = new ReplayRecorder();
  for (let i = 0; i < 100; i++) r.record(i / HZ, [car('p', i)]);
  r.event(2, { type: 'wreck', id: 'p' });
  r.record(0.01, [car('p', 0)]);
  assert.equal(r.frames.length, 1); assert.equal(r.events.length, 0);
});

test('the TV camera stands beside the road ahead of the car, then cuts to a new one once the car has passed', () => {
  const track = new Track(DRAG_DEF), cams = new ReplayCams(track);
  const s0 = 200, f = track.frameAt(s0), shots = new Set();
  let cuts = 0, prev = null;
  for (let i = 0; i < 40 * 60; i++) {
    const s = s0 + i / 60 * 30, g = track.frameAt(s % track.length);
    const o = cams.update('TV', 1 / 60, { x: g.x, y: g.y, z: g.z, vx: g.fx * 30, vz: g.fz * 30, fx: g.fx, fz: g.fz });
    const key = o.px.toFixed(1) + ',' + o.pz.toFixed(1);
    if (key !== prev) { cuts++; prev = key; shots.add(key); }
    assert.ok(Number.isFinite(o.px + o.py + o.pz + o.tx + o.ty + o.tz + o.fov));
    assert.ok(o.fov >= 12 && o.fov <= 58);
    const d = Math.hypot(o.px - g.x, o.pz - g.z);
    assert.ok(d < 200, 'never far from the car: ' + d);
  }
  assert.ok(cuts >= 5 && cuts <= 40, 'cut ' + cuts + ' times in 40 s');
  assert.ok(shots.size >= 5);
});

test('the Top view follows from above and behind', () => {
  const cams = new ReplayCams(new Track(DRAG_DEF));
  let o;
  for (let i = 0; i < 300; i++) o = cams.update('Top', 1 / 60, { x: 0, y: 1, z: i * 0.5, vx: 0, vz: 30, fx: 0, fz: 1 });
  assert.ok(o.py > 25 && o.pz < 150 - 10, `above and behind: y ${o.py} z ${o.pz}`);
});

test('STRIDE matches the layout the player reads', () => { assert.equal(STRIDE, 29); });

test('replay is wired into the game: a button, the T key, the game-over card, the recorder reset on a new race, and the replay frame', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'), html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const input = readFileSync(new URL('../src/input.js', import.meta.url), 'utf8'), css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(html, /data-act="replay"/); assert.match(html, /id="go-replay"/); assert.match(html, /id="replay-bar"/);
  for (const id of ['rp-play', 'rp-seek', 'rp-time', 'rp-speed', 'rp-view-btn', 'rp-next', 'rp-exit', 'rp-label']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(input, /KeyT: onReplay/);
  assert.match(main, /replayRec\.reset\(\)/);                          // a new race, a new replay
  assert.match(main, /if \(mode === 'replay'\)/);
  assert.match(main, /replay: \(\) => startReplay\(\)/);
  assert.match(main, /recordReplay\(\);/);
  assert.match(main, /type: 'dent'/); assert.match(main, /type: 'wreck'/); assert.match(main, /type: 'clear'/);
  assert.match(css, /#replay-bar/); assert.match(css, /body\.mode-replay #mp-labels/);
  // single player only: multiplayer has no replay
  assert.match(main, /function startReplay\(\) \{\s*if \(mode !== 'drive' \|\| net\) return;/);
  assert.match(main, /if \(net \|\| paused \|\| frozen/);
});

test('the engine sound data is recorded and blended: rpm, throttle, tyre skid and boost', () => {
  const r = new ReplayRecorder();
  r.record(0, [car('p', 0, { rpm: 2000, thr: 0, skid: 0, boost: false })]);
  r.record(0.05, [car('p', 1, { rpm: 4000, thr: 1, skid: 0.8, boost: true })]);
  const e = new ReplayPlayer(r).sample(0.025)[0];
  assert.ok(Math.abs(e.rpm - 3000) < 1e-9 && Math.abs(e.thr - 0.5) < 1e-9 && Math.abs(e.skid - 0.4) < 1e-9);
  assert.equal(new ReplayPlayer(r).sample(0.05)[0].boost, true);
});

test('a replay hears the car it follows: quieter far off, pitch shifted by the Doppler effect, and silent when it exits', async () => {
  const { readFileSync } = await import('node:fs');
  const rm = readFileSync(new URL('../src/replayMode.js', import.meta.url), 'utf8'), audio = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  assert.match(audio, /update\(car, throttle, active, level = 1, pitch = 1\)/);
  assert.match(rm, /343 \/ \(343 \+ away\)/);
  assert.match(rm, /d\.sound\.update\(hear, 0, false\);/);
});

test('the replay screen carries the Bangers and Smash TV logo, top right, and a car that is not wrecked always has its wheels on', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8'), rm = readFileSync(new URL('../src/replayMode.js', import.meta.url), 'utf8');
  assert.match(html, /<svg id="rp-logo"[^>]*aria-label="Bangers and Smash TV"/);
  assert.match(html, /BANGERS<\/text>/); assert.match(html, /AND SMASH!<\/text>/);
  assert.ok(html.indexOf('id="rp-logo"') > html.indexOf('id="replay-bar"'), 'the logo is part of the replay screen, so it only shows there');
  assert.match(css, /#rp-logo \{[^}]*position: fixed;[^}]*top:[^}]*right:/);
  assert.match(rm, /v\._wheelsOff && !ent\.wrecked/);
});

test('replay: Save video button is wired, and airborne wheels keep spinning', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const mode = fs.readFileSync(new URL('../src/replayMode.js', import.meta.url), 'utf8');
  const veh = fs.readFileSync(new URL('../src/vehicle.js', import.meta.url), 'utf8');
  assert.ok(html.includes('id="rp-save"'));
  assert.ok(mode.includes('createMp4Saver'));
  assert.ok(/!w\.contact\) \{[^}]*w\.spin \+=/.test(veh));
});

test('replay: depth of field is High-tier desktop only and freed outside the replay', async () => {
  const fs = await import('node:fs');
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.ok(/tierName === 'high' && !device\.touch/.test(main));
  assert.ok(main.includes('if (replayDof.on) replayDof.disable();'));
});

test('every source file parses (a broken file only shows up in a real browser)', async () => {
  const fs = await import('node:fs'), { execFileSync } = await import('node:child_process');
  const dir = new URL('../src/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) execFileSync(process.execPath, ['--check', new URL(f, dir).pathname]);
});


test('replay sounds: knocks, props and honks are recorded and played; scraping and braking squeal are kept in the samples', async () => {
  const fs = await import('node:fs');
  const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const mode = fs.readFileSync(new URL('../src/replayMode.js', import.meta.url), 'utf8');
  assert.ok(main.includes('recHit(e.x, e.y, e.z, e.speed, e.type)'), 'the player\'s own wall and ground knocks');
  assert.ok(main.includes("type: 'prop', kind: 'blast'") && main.includes("type: 'prop', kind: 'clang'") && main.includes("type: 'prop', kind: 'splat'"));
  assert.ok(main.includes("type: 'honk'"));
  assert.ok(mode.includes("e.type === 'prop'") && mode.includes("e.type === 'honk'"));
  const rec = new ReplayRecorder({ maxSeconds: 10 });
  const ent = { id: 'p', hue: 0, isPlayer: true, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, steer: 0, spin: [0, 0, 0, 0], health: 1, wrecked: false, van: null, rpm: 3000, thr: 1, skid: 0.4, boost: 3 };
  rec.record(0, [ent]); rec.record(0.05, [ent]);
  const f = new ReplayPlayer(rec).sample(0.02)[0];
  assert.equal(f.boost, true); assert.equal(f.scrape, true);
});

test('TV set option: asset ships, button exists, save uses the frame', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  assert.ok(existsSync(new URL('../tv/tv-frame.webp', import.meta.url)), 'tv/tv-frame.webp missing');
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /id="rp-save"/);
  const src = readFileSync(new URL('../src/replayMode.js', import.meta.url), 'utf8');
  assert.match(src, /tv\/tv-frame\.webp/);
  assert.match(src, /pickBestBit\(R\.player, 1e9\)[^]*?startSave\(tvImg, hl/);
});


test('Make my movie: one tap, TV set always, music only if it is on, fast, desktop only', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/replayMode.js', import.meta.url), 'utf8');
  const mp4 = readFileSync(new URL('../src/mp4Save.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!existsSync(new URL('../src/filmEditor.js', import.meta.url)), 'the film editor is gone');
  assert.ok(!html.includes('id="film"') && !html.includes('rp-film-edit'));
  assert.match(src, /el\.save\.onclick = \(\) => \{ if \(R\.saving\) stopSave\(false\); else makeFilm\(\); \}/);
  assert.match(src, /d\.sound\.musicOn && d\.sound\.buf && d\.sound\.buf\.music/);
  assert.match(src, /pickBestBit\(R\.player, 1e9\)[^]*?startSave\(tvImg, hl/); assert.match(src, /audio: realtime, music: clip/);
  assert.match(src, /if \(!desktop\) el\.save\.hidden = true/);
  assert.match(mp4, /lay the sound track/);
  assert.doesNotMatch(src, /Highlights|highlights|MediaRecorder/);
});

test('Make my movie is the whole race, real-time, record the game sound', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/replayMode.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!html.includes('rp-save-full') && !html.includes('Gone in 60'), 'one button: Make my movie');
  assert.match(src, /audio: realtime, music: clip/);
  assert.match(src, /pickBestBit\(R\.player, 1e9\)/);
  assert.match(src, /const turbo = \(\) => !!\(R\.saving && R\.saver && !R\.realtime\)/);
});
