// Car Racer - main entry. Wires physics, rendering, HUD, audio, menu and editor together.
import * as THREE from 'three';
import { Track, SURF, normalizeTrack, analyzeTrack } from './track.js';
import { Vehicle } from './vehicle.js';
import { Derby, DERBY } from './derby.js';
import { IDLE } from './ai.js';
import { ZONE_LABEL } from './damage.js';
import { V3, lerp } from './math.js';
import { makeTemplate, makeRandomTrack, TEMPLATE_KEYS, TEMPLATE_INFO } from './templates.js';
import { Stage } from './stage.js';
import { CarVisual, ChaseCamera, RIVAL_LOOKS } from './carVisual.js';
import { SkidMarks, Particles, Scorch } from './effects.js';
import { Props } from './props.js';
import { PropsView } from './propsView.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Hud, fmtTime } from './hud.js';
import { Editor } from './editor.js';
import { EditorPreview } from './editorPreview.js';

const $ = (id) => document.getElementById(id);
const DT = 1 / 120;
const PAINTS = [['Tail-light red', 0xd9482b], ['Sodium yellow', 0xe8b02a], ['Racing green', 0x2f6b4a], ['Police white', 0xe4e1d8], ['Midnight', 0x2a2f5c]];

// ------------------------------------------------------------------ storage
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } },
};
const opts = Object.assign({ assist: true, kmh: false, shadow: true, paint: 0, derby: true, rivals: DERBY.rivals }, store.get('cr.opts', {}));
const userTracks = () => store.get('cr.tracks', {});
const bestKey = (t) => `${t.def.name}|${Math.round(t.length)}`;

// ------------------------------------------------------------------- set-up
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = opts.shadow; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 7000);
const stage = new Stage(renderer);
stage.setShadows(opts.shadow);
const car = new Vehicle();
const visual = new CarVisual(stage.scene, car.restHeight);
visual.setPaint(PAINTS[opts.paint][1]);
visual.onLoad = (v) => { $('swatches').hidden = v.textured; };   // a textured car brings its own paint
visual.load();
const chase = new ChaseCamera(camera);
const skid = new SkidMarks(stage.scene);
const particles = new Particles(stage.scene);
const scorch = new Scorch(stage.scene);
const splats = new Scorch(stage.scene, 40, 0xb5502e);   // a warmer tint than the black burn marks
const props = new Props();
const propsView = new PropsView(stage.scene);
const hud = new Hud(); hud.setUnits(opts.kmh);
const sound = new Sound();
const derby = new Derby();
const views = new Map();            // rival id -> CarVisual
const viewPool = [];                // visuals of rivals that have gone, ready to be reused
const derbyBest = () => store.get('cr.derby', {});
let overAt = 0, overInfo = null;    // when to pop up the game-over card, and what it says

let mode = 'menu', track = null, def = null, hasPlayed = false;
let paused = false;
const prevPos = new THREE.Vector3(), curPos = new THREE.Vector3(), prevQ = new THREE.Quaternion(), curQ = new THREE.Quaternion();
const drawPos = new THREE.Vector3(), drawQ = new THREE.Quaternion(), velV = new THREE.Vector3();
let acc = 0, last = performance.now(), simTime = 0, fps = 60, orbit = 0;
let throttleNow = 0, wallSpot = null;
const race = { unwrapped: 0, max: 0, lastS: null, index: -1, lapStart: null, laps: 0, best: null, reverseT: 0, lastTime: null };
const safe = { s: 0, off: 0, t: 0 };
const mapDots = [];
const trouble = { flipped: 0, lost: 0 };

const input = new Input({
  onReset: () => mode === 'drive' && respawn(),
  onRestart: () => mode === 'drive' && restartRace(),
  onCamera: () => mode === 'drive' && hud.banner(chase.cycle() + ' camera', 900),
  onMenu: () => (mode === 'drive' ? showMenu() : null),
  onEditor: () => mode === 'drive' && openEditor(def),
  onDebug: () => { const d = $('debug'); d.hidden = !d.hidden; },
  onMusic: () => { sound.setEnabled('music', !sound.musicOn); syncSoundUI(); },
  onMirror: () => mode === 'drive' && toggleMirror(),
});

// ------------------------------------------------------------ rear-view mirror
// A second camera looking back from just behind the car renders into a texture, which is drawn
// left-right flipped (like a real mirror) into the #mirror frame at the top of the screen.
const mirror = {
  on: false, el: $('mirror'),
  cam: new THREE.PerspectiveCamera(48, 4, 0.3, 1800),
  rt: new THREE.WebGLRenderTarget(1, 1, { samples: 4 }),
  scene: new THREE.Scene(), ortho: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2),
  off: new THREE.Vector3(), tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, 0, 0)),
};
{
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: mirror.rt.texture, depthTest: false, depthWrite: false }));
  quad.scale.x = -1;   // the mirror flip
  mirror.scene.add(quad); mirror.ortho.position.z = 1;
}
function toggleMirror() { mirror.on = !mirror.on; mirror.el.hidden = !mirror.on; hud.banner('Mirror ' + (mirror.on ? 'on' : 'off'), 900); }
function renderMirror() {
  const r = mirror.el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  // in the derby the mirror sits under the score card, and the kill feed under the mirror
  const score = $('derby-score'), feed = $('feed');
  if (!score.hidden) { mirror.el.style.top = score.getBoundingClientRect().bottom + 6 + 'px'; feed.style.top = r.bottom + 6 + 'px'; }
  else if (mirror.el.style.top) { mirror.el.style.top = ''; feed.style.top = ''; }
  const pr = renderer.getPixelRatio(), bw = 3, w = r.width - bw * 2, h = r.height - bw * 2;
  const tw = Math.round(w * pr), th = Math.round(h * pr);
  if (mirror.rt.width !== tw || mirror.rt.height !== th) mirror.rt.setSize(tw, th);
  mirror.cam.aspect = w / h; mirror.cam.updateProjectionMatrix();
  mirror.cam.position.copy(drawPos).add(mirror.off.set(0, 1.35, -2.7).applyQuaternion(drawQ));
  mirror.cam.quaternion.copy(drawQ).multiply(mirror.tilt);   // camera looks down -Z, which is the car's rear
  const shadows = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;                     // reuse the shadow map from the main view
  renderer.setRenderTarget(mirror.rt); renderer.render(stage.scene, mirror.cam); renderer.setRenderTarget(null);
  renderer.shadowMap.autoUpdate = shadows;
  const x = r.left + bw, y = innerHeight - r.bottom + bw;
  renderer.setScissorTest(true); renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h);
  renderer.autoClear = false; renderer.render(mirror.scene, mirror.ortho); renderer.autoClear = true;
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
}

// ------------------------------------------------------------ in-game sound cog
function syncSoundUI() {
  $('opt-sfx').checked = $('hud-sfx').checked = sound.sfxOn;
  $('opt-music').checked = $('hud-music').checked = sound.musicOn;
  $('cog').classList.toggle('off', !sound.sfxOn && !sound.musicOn);
}
function setSoundPop(open) { $('sound-pop').hidden = !open; $('cog').setAttribute('aria-expanded', String(open)); }
$('cog').addEventListener('click', (e) => { e.stopPropagation(); setSoundPop($('sound-pop').hidden); e.currentTarget.blur(); });
for (const [id, kind] of [['hud-sfx', 'sfx'], ['hud-music', 'music']]) {
  $(id).addEventListener('change', (e) => { sound.setEnabled(kind, e.target.checked); syncSoundUI(); e.target.blur(); });   // blur so Space stays the handbrake
}
addEventListener('pointerdown', (e) => { if (!$('sound-ctl').contains(e.target)) setSoundPop(false); });
syncSoundUI();

// ------------------------------------------------------- on-screen controls bar
const controlActions = {
  restart: () => restartRace(), reset: () => respawn(),
  camera: () => hud.banner(chase.cycle() + ' camera', 900),
  mirror: () => toggleMirror(),
  edit: () => openEditor(def), menu: () => showMenu(),
};
for (const b of document.querySelectorAll('#controls button[data-act]')) {
  b.addEventListener('pointerdown', (e) => e.preventDefault());   // never take focus, so Space stays the boost
  b.addEventListener('click', () => { if (mode === 'drive') controlActions[b.dataset.act](); b.blur(); });
}

// --------------------------------------------------------------------- track
function loadTrack(newDef) {
  def = normalizeTrack(newDef);
  track = new Track(def);
  stage.setTrack(track);
  hud.buildMap(track);
  skid.clear(); particles.clear(); scorch.clear();
  props.load(track, def.props); propsView.build(props);
  race.best = store.get('cr.best', {})[bestKey(track)] ?? null;
  race.laps = 0; race.lapStart = null; race.lastTime = null;
  placeCar(track.startS(12), 0, 0);
  derbyStart();
  window.__game = { car, camera, visual, get track() { return track; }, race, opts, renderer, stage, sim, respawn, props, derby, views };
}

function placeCar(s, offset = 0, speed = 0, keepRace = false) {
  const L = track.length, f = track.frameAt(s);
  const h = car.restHeight + 0.08;
  car.reset(new V3(f.x + f.lx * offset + f.nx * h, f.y + f.ly * offset + f.ny * h, f.z + f.lz * offset + f.nz * h),
    new V3(f.fx, f.fy, f.fz), new V3(f.nx, f.ny, f.nz), speed);
  car.opts.assist = opts.assist ? 0.7 : 0;
  syncPose(); prevPos.copy(curPos); prevQ.copy(curQ);
  race.lastS = track.progressAt(car.pos.x, car.pos.y, car.pos.z);
  if (keepRace) {
    // stay in the same lap: move `unwrapped` to the nearest equivalent of the new position
    let u = Math.floor(race.unwrapped / L) * L + s;
    while (u - race.unwrapped > L / 2) u -= L;
    while (race.unwrapped - u > L / 2) u += L;
    race.unwrapped = u;
  } else {
    race.unwrapped = race.max = s > L / 2 ? s - L : s;
    race.index = Math.floor(race.max / L);
  }
  safe.s = s; safe.off = offset; safe.t = 0;
  chase.snap(); trouble.flipped = trouble.lost = 0; acc = 0;
}

/** Back to the start line with a fresh lap and a full boost tank. */
function restartRace() {
  race.laps = 0; race.lapStart = null; race.lastTime = null; race.reverseT = 0;
  skid.clear(); particles.clear(); scorch.clear(); props.reset();
  placeCar(track.startS(12), 0, 0);
  car.boostFuel = 1;
  derbyStart();
  hud.banner(derby.enabled ? 'Wreck them all' : 'Get to the start line', 1400);
}

function respawn() {
  if (derby.over) return;
  const hw = track.hw[Math.floor(safe.s / track.ds) % track.n];
  placeCar((safe.s - 6 + track.length) % track.length, Math.max(-hw + 4, Math.min(hw - 4, safe.off)), 0, true);
  race.reverseT = 0;
  hud.banner('Back on the road', 1000);
}

/** Advance the simulation by `seconds` without rendering (used by automated tests). */
function sim(seconds, inp) {
  const full = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, ...inp };
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    car.step(DT, typeof inp === 'function' ? inp(i * DT) : full, track);
    if (derby.enabled) derby.step(DT, props.barrels);
    props.step(DT, derby.enabled ? derby.cars : car); simTime += DT; car.events.length = 0; props.events.length = 0; derby.events.length = 0;
    if (i % 2 === 0) updateRace(2 * DT);
  }
  syncPose(); prevPos.copy(curPos); prevQ.copy(curQ); chase.snap(); acc = 0;
}

function syncPose() {
  curPos.set(car.pos.x, car.pos.y, car.pos.z); curQ.set(car.rot.x, car.rot.y, car.rot.z, car.rot.w);
}

// ---------------------------------------------------------------- lap logic
function updateRace(dt) {
  const L = track.length, s = track.progressAt(car.pos.x, car.pos.y, car.pos.z);
  if (race.lastS != null) {
    let d = s - race.lastS; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
    if (Math.abs(d) < 60) {
      race.unwrapped += d;
      race.reverseT = d < -0.02 && car.speed > 6 ? race.reverseT + dt : Math.max(0, race.reverseT - dt * 2);
    }
  }
  race.lastS = s;
  if (race.unwrapped > race.max) race.max = race.unwrapped;
  const idx = Math.floor(race.max / L);
  if (idx > race.index) {
    race.index = idx;
    if (idx === 0) { race.lapStart = simTime; race.laps = 1; hud.banner('Go!', 900); }
    else if (idx > 0 && race.lapStart != null) {
      const t = simTime - race.lapStart; race.lastTime = t;
      const improved = race.best == null || t < race.best;
      if (improved) { race.best = t; const b = store.get('cr.best', {}); b[bestKey(track)] = t; store.set('cr.best', b); }
      hud.banner(improved ? `Best lap ${fmtTime(t)}` : `Lap ${fmtTime(t)}`, 2200);
      race.lapStart = simTime; race.laps = idx + 1;
    }
  }
  if (race.reverseT > 1.6) { hud.banner('Wrong way', 700); }

  // remember a safe spot to come back to
  safe.t += dt;
  if (safe.t > 0.4 && car.onGround && car.ay.y > 0.8 && car.speed > 0.5) {
    const q = track.query(car.pos.x, car.pos.y, car.pos.z, undefined, 1);
    if (q.surface === SURF.ROAD && Math.abs(q.d) < q.hw - 1.5) { safe.s = q.s; safe.off = q.d; safe.t = 0; }
  }
  // stuck on the roof, or fell off the world?
  trouble.flipped = car.ay.y < 0.15 && car.speed < 5 ? trouble.flipped + dt : 0;
  const q2 = track.query(car.pos.x, car.pos.y + 0.5, car.pos.z, undefined, 1.2);
  trouble.lost = q2.surface === SURF.BASE && car.pos.y < 2 ? trouble.lost + dt : 0;
  if (trouble.flipped > 2.5) respawn();
  else if (trouble.lost > 1.4 || car.pos.y < -30) respawn();
}

// ------------------------------------------------------------------ physics
function stepPhysics(dt) {
  const raw = input.read();
  const inp = derby.over ? IDLE : raw;          // once you are wrecked, nobody is driving
  throttleNow = inp.throttle;
  acc += dt; let n = 0;
  while (acc >= DT && n < 6) {
    prevPos.copy(curPos); prevQ.copy(curQ);
    car.step(DT, inp, track);
    if (derby.enabled) derby.step(DT, props.barrels);          // rivals, crashes, damage (reads this step's wall hits before they are cleared below)
    props.step(DT, derby.enabled ? derby.cars : car);
    syncPose(); acc -= DT; n++; simTime += DT;
    if (props.events.length) { propEvents(); }
    if (derby.events.length) { derbyEvents(); }
    if (car.events.length) {
      for (const e of car.events) {
        sound.hit(e.speed, e.type); chase.impact(e.speed);
        if (e.type === 'wall') { wallSpot = { x: e.x, y: e.y, z: e.z, t: simTime }; for (let i = 0; i < Math.min(10, 2 + e.speed); i++) particles.spark(e.x, e.y, e.z, car.vel.x * 0.3, 2, car.vel.z * 0.3); }
      }
      car.events.length = 0;
    }
  }
  if (n === 6) acc = 0;
  updateRace(dt);
}

/** Turn what the props did this step into noise, fire and shaking. */
function propEvents() {
  for (const e of props.events) {
    if (e.type === 'blast') {
      particles.blast(e.x, e.y, e.z);
      if (e.y - e.gy < 1.5) scorch.add(e.x, e.gy, e.z, e.nx, e.ny, e.nz, 2.6);     // not for one that went off in mid-air
      sound.explode(e.dist);
      chase.impact(Math.max(0, 1 - e.dist / e.radius) * 24);
      if (derby.enabled) derby.blast(e.x, e.y, e.z);
    } else if (e.type === 'clang') sound.clang(e.speed, e.dist);
    else if (e.type === 'splat') {
      for (let k = 0; k < 7; k++) {
        const a = Math.random() * Math.PI * 2, h = 0.6 + Math.random() * 1.6;
        particles.puff(e.x + Math.cos(a) * 0.15, e.y + 0.2 + Math.random() * 0.2, e.z + Math.sin(a) * 0.15, Math.cos(a) * h, Math.sin(a) * h, 0.7 + Math.random() * 0.5, 0.7 + Math.random() * 0.5, 0xf2ede0);
      }
      splats.add(e.x, e.y, e.z, e.nx, e.ny, e.nz, 0.9 + Math.random() * 0.3);
      sound.splat(e.dist);
      if (derby.enabled && e.dist < DERBY.creditNear) derby.award('chicken', 1, 'Splat!');
    }
  }
  props.events.length = 0;
}

// ------------------------------------------------------- destruction derby
function derbyStart() {
  derby.enabled = !!opts.derby;
  if (derby.enabled) derby.start(track, car, opts.rivals, (Math.random() * 1e9) | 0); else derby.stop();
  clearViews(); overAt = 0; overInfo = null;
  visual.setLook(1, 0);
  hud.derbyMode(derby.enabled);
  if (derby.enabled) { hud.setScore(0, 0, derby.alive); hud.setDamage(derby.player.health); }
}

/** Turn what the derby did this step into noise, fire, shaking and messages. */
const groundQ = Track.newQuery();
function derbyEvents() {
  for (const e of derby.events) {
    if (e.type === 'hit') {
      sound.hit(e.speed, e.kind === 'wall' ? 'wall' : 'car', e.dist);
      if (e.player) chase.impact(e.speed);
      const n = Math.min(10, 2 + e.speed * 0.5);
      for (let i = 0; i < n; i++) particles.spark(e.x, e.y, e.z, (Math.random() - 0.5) * 6, 2 + Math.random() * 3, (Math.random() - 0.5) * 6);
    } else if (e.type === 'damage') {
      if (e.isPlayer) hud.setDamage(derby.player.health, e.zone);
    } else if (e.type === 'wreck') {
      particles.blast(e.x, e.y, e.z, e.isPlayer ? 2 : 1.6);
      const g = track.groundAt(e.x, e.z, e.y + 0.6, groundQ);
      if (e.y - g.y < 2.5) scorch.add(e.x, g.y, e.z, g.nx, g.ny, g.nz, 3.4);
      sound.explode(e.dist);
      if (e.dist < 45) chase.impact(Math.max(0, 1 - e.dist / 45) * 22);
      props.shock(e.x, e.y, e.z, 8);                  // a burning car sets off drums beside it
      if (e.isPlayer) hud.setDamage(derby.player.health, e.zone);
    } else if (e.type === 'award') {
      hud.feed(`+${e.points} ${e.label}`);
    } else if (e.type === 'over') {
      const key = bestKey(track), all = derbyBest(), prev = all[key] || 0, isBest = e.score > prev;
      if (isBest) { all[key] = e.score; store.set('cr.derby', all); }
      overInfo = { score: e.score, takedowns: e.takedowns, best: Math.max(prev, e.score), isBest, zone: `${ZONE_LABEL[e.zone]} destroyed` };
      overAt = performance.now() + 1800;
      hud.banner('Wrecked', 1700);
    }
  }
  derby.events.length = 0;
}

// ----- how the rivals look
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
function makeView(f) {
  let v = (viewPool[f.hue] || (viewPool[f.hue] = [])).pop();
  if (!v) { v = new CarVisual(stage.scene, car.restHeight); v.setPaint(RIVAL_LOOKS[f.hue].tint); v.hue = f.hue; }
  v.root.visible = true; v.root.scale.setScalar(0.001);
  views.set(f.id, v);
  return v;
}
function releaseView(id) {
  const v = views.get(id); if (!v) return;
  v.root.visible = false; (viewPool[v.hue] || (viewPool[v.hue] = [])).push(v); views.delete(id);
}
function clearViews() { for (const id of [...views.keys()]) releaseView(id); }

/** Place each rival's visual at its (interpolated) physics pose. At most two new ones are built per frame. */
function syncViews(a) {
  let made = 0;
  for (const f of derby.fighters) {
    if (f.isPlayer) continue;
    let v = views.get(f.id);
    if (f.gone) { if (v) releaseView(f.id); continue; }
    if (!v) { if (made >= 2) continue; v = makeView(f); made++; }
    if (!v.loaded && visual.loaded) v.adopt(visual, RIVAL_LOOKS[f.hue]);
    const p = f.prev, c = f.cur;
    v.root.position.set(lerp(p.x, c.x, a), lerp(p.y, c.y, a), lerp(p.z, c.z, a));
    qa.set(p.qx, p.qy, p.qz, p.qw); qb.set(c.qx, c.qy, c.qz, c.qw);
    v.root.quaternion.slerpQuaternions(qa, qb, a);
    let k = Math.min(1, f.age / 0.5);                                          // fade a new rival in
    if (f.expire) k = 1 - f.expireT / DERBY.wreckFade;                         // making room: shrink this one away
    v.root.scale.setScalar(Math.max(k, 0.001));
    const dx = v.root.position.x - camera.position.x, dz = v.root.position.z - camera.position.z;
    v.root.visible = dx * dx + dz * dz < 300 * 300;                            // 200,000 triangles each: skip the far ones
    v.setLook(f.wrecked ? 0.1 : 1 - 0.55 * (1 - f.health.worst), f.flash);
  }
}

// ----- smoke and fire
const zoneLocal = { front: new V3(0, 0.45, 1.8), back: new V3(0, 0.4, -1.9), left: new V3(0.8, 0.4, 0.2), right: new V3(-0.8, 0.4, 0.2) };
const fxPos = new V3();
function derbyFx(dt) {
  for (const f of derby.fighters) {
    if (f.gone) continue;
    const c = f.car;
    if (!f.isPlayer) {
      const dx = c.pos.x - camera.position.x, dz = c.pos.z - camera.position.z;
      if (dx * dx + dz * dz > 160 * 160) continue;
    }
    if (f.wrecked) {
      if (f.isPlayer || f.wreckT < DERBY.wreckLife) particles.burn(c.pos.x, c.pos.y, c.pos.z, c.vel.x, c.vel.z, dt, f.isPlayer ? 1 : Math.max(0.3, 1 - f.wreckT / DERBY.wreckLife));
      // the fire's died down, but a burnt-out hulk still smoulders - a thin trail rising up, for good
      else if (Math.random() < 1.4 * dt) particles.puff(c.pos.x + (Math.random() - 0.5) * 1.0, c.pos.y + 0.5, c.pos.z + (Math.random() - 0.5) * 1.0, 0, 0, 2.2 + Math.random() * 1.4, 3.4 + Math.random() * 2.0, 0x49454a);
      continue;
    }
    const w = f.health.worst;
    if (w >= 0.55) continue;
    // hurt: smoke (and, when nearly dead, flames) from the weakest part
    c.toWorld(zoneLocal[f.health.worstZone], fxPos);
    const heavy = w < 0.25;
    if (Math.random() < (heavy ? 18 : 8) * dt) particles.puff(fxPos.x, fxPos.y, fxPos.z, c.vel.x, c.vel.z, heavy ? 1.9 : 1.4, 0.8 + Math.random() * 0.5, heavy ? 0x1d1b1d : 0x9d9893);
    if (heavy && Math.random() < 6 * dt) particles.flame(fxPos.x, fxPos.y, fxPos.z, c.vel.x * 0.5, 1.5, c.vel.z * 0.5);
  }
}

const boostLocal = new V3(), boostPos = new THREE.Vector3();
function effects(dt) {
  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i];
    if (w.contact && w.skid > 0.3) {
      skid.add(i, w.contactPoint, w.normal, car.vel);
      if (w.skid > 0.55 && Math.random() < 14 * dt) particles.puff(w.contactPoint.x, w.contactPoint.y, w.contactPoint.z, car.vel.x, car.vel.z, 1.2 + w.skid);
    } else skid.lift(i);
  }
  if (car.boosting) {
    // flames from twin exhausts under the rear bumper
    const n = Math.random() < 0.5 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 0.45 : -0.45;
      car.toWorld(boostLocal.set(side, -0.32, -2.5 - Math.random() * 0.15), boostPos);
      particles.flame(boostPos.x, boostPos.y, boostPos.z, car.vel.x - car.az.x * 9, car.vel.y - car.az.y * 9, car.vel.z - car.az.z * 9);
    }
  }
  if (car.scraping && wallSpot && simTime - wallSpot.t < 0.4 && Math.random() < 40 * dt) particles.spark(wallSpot.x, wallSpot.y, wallSpot.z, car.vel.x * 0.2, 1.5, car.vel.z * 0.2);
  particles.update(dt);
}

// -------------------------------------------------------------------- frame
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;
  const w = innerWidth, h = innerHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  if (!track) { renderer.render(stage.scene, camera); return; }

  if (mode === 'drive') {
    stepPhysics(dt);
    const a = acc / DT;
    drawPos.copy(prevPos).lerp(curPos, a); drawQ.copy(prevQ).slerp(curQ, a);
    velV.set(car.vel.x, car.vel.y, car.vel.z);
    chase.boosting = car.boosting;
    chase.update(dt, drawPos, drawQ, velV, track);
    effects(dt);
    hud.update(car, { lap: race.laps, time: race.lapStart != null ? simTime - race.lapStart : null, best: race.best });
    if (derby.enabled) {
      hud.setScore(derby.score, derby.takedowns, derby.alive);
      hud.setDamage(derby.player.health);
      derbyFx(dt);
      visual.setLook(derby.over ? 0.12 : 1 - 0.5 * (1 - derby.player.health.worst), derby.player.flash);
      mapDots.length = 0;
      for (const f of derby.fighters) if (!f.isPlayer && !f.gone) mapDots.push({ x: f.car.pos.x, z: f.car.pos.z, wreck: f.wrecked });
      if (overAt && performance.now() > overAt) { overAt = 0; hud.showGameOver(overInfo); }
    }
    hud.drawMap(car, derby.enabled ? mapDots : null);
    sound.update(car, throttleNow, !derby.over);
    if (!$('debug').hidden) debugText();
  } else {
    drawPos.copy(curPos); drawQ.copy(curQ);
    if (mode === 'menu') {
      orbit += dt * 0.07;
      const f = track.frameAt(0), R = 46;
      camera.position.set(f.x + Math.cos(orbit) * R, f.y + 16 + Math.sin(orbit * 0.7) * 3, f.z + Math.sin(orbit) * R);
      camera.lookAt(f.x, f.y + 1.2, f.z); camera.fov = 52; camera.updateProjectionMatrix();
      chase.snap();
    }
    sound.update(car, 0, false);
  }
  visual.root.position.copy(drawPos); visual.root.quaternion.copy(drawQ);
  if (derby.enabled || views.size) syncViews(mode === 'drive' ? acc / DT : 1);
  propsView.update(props);
  stage.update(drawPos, camera.position);
  renderer.render(stage.scene, camera);
  if (mode === 'drive' && mirror.on && !$('hud').hidden) renderMirror();
}

function debugText() {
  const w = car.wheels;
  $('debug').textContent =
    `fps ${fps.toFixed(0)}  speed ${(car.speed * 3.6).toFixed(0)} km/h  gear ${car.gear}  rpm ${car.rpm.toFixed(0)}\n` +
    `slip body ${(car.sideSlip * 57.3).toFixed(1)} deg  steer ${(car.steerAngle * 57.3).toFixed(1)} deg  assist ${(car.assistAngle * 57.3).toFixed(1)}\n` +
    `wheel load  ${w.map((x) => x.load.toFixed(0).padStart(5)).join(' ')}\n` +
    `wheel slip  ${w.map((x) => (x.slipAngle * 57.3).toFixed(0).padStart(5)).join(' ')}\n` +
    `lap ${race.laps} progress ${race.unwrapped.toFixed(0)} / ${track.length.toFixed(0)} m`;
}

// --------------------------------------------------------------------- modes
function setMode(m) {
  if (m !== 'drive') setSoundPop(false);
  mode = m; document.body.className = 'mode-' + m;
  $('hud').hidden = m !== 'drive';
  $('touch').hidden = !(m === 'drive' && matchMedia('(pointer: coarse)').matches);
  input.enabled = m === 'drive';
}
function showMenu() { setMode('menu'); renderMenu(); }
function startDriving(newDef) {
  sound.init();
  if (newDef) loadTrack(newDef);
  hasPlayed = true; setMode('drive'); last = performance.now();
  hud.banner(derby.enabled ? 'Wreck them all' : 'Get to the start line', 1600);
}
function openEditor(d) {
  setMode('edit'); editor.open(d || def || makeTemplate('kidney'));
}

const editor = window.__editor = new Editor({
  toast,
  preview: new EditorPreview($('ed-3d-canvas')),
  onDrive: (d) => {
    editor.close(); store.set('cr.draft', d);
    const a = analyzeTrack(new Track(d));
    startDriving(d);
    if (a.tight.length || a.crossings.length) toast('Heads up: this track has problems the editor flagged.');
  },
  onClose: (d) => { editor.close(); store.set('cr.draft', d); if (!track) loadTrack(makeTemplate('speedway')); showMenu(); },
  onSave: (d) => { saveUserTrack(d); toast(`Saved "${d.name}". It is in the track list.`); },
});

function saveUserTrack(d) {
  const all = userTracks(); all[d.name] = normalizeTrack(d); store.set('cr.tracks', all);
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------------- menu
function renderMenu() {
  const ul = $('track-list'); ul.innerHTML = '';
  const row = (name, meta, cls, buttons) => {
    const li = document.createElement('li'); if (cls) li.className = cls;
    li.innerHTML = `<div class="t-name"></div><div class="t-meta"></div><div class="t-btns"></div>`;
    li.querySelector('.t-name').textContent = name; li.querySelector('.t-meta').textContent = meta;
    const bx = li.querySelector('.t-btns');
    for (const [label, fn, c] of buttons) { const b = document.createElement('button'); b.textContent = label; if (c) b.className = c; b.onclick = fn; bx.appendChild(b); }
    ul.appendChild(li);
  };
  if (track && hasPlayed) row(`Resume ${def.name}`, 'Carry on where you left off', '', [['Resume', () => startDriving(null)]]);
  for (const k of TEMPLATE_KEYS) {
    const d = k === 'random' ? makeRandomTrack() : makeTemplate(k), t = new Track(d);
    row(d.name, `${(t.length / 1000).toFixed(1)} km. ${TEMPLATE_INFO[k]}`, '', [['Drive', () => startDriving(d)], ['Edit', () => openEditor(d)]]);
  }
  for (const [name, d] of Object.entries(userTracks())) {
    let km = '?'; try { km = (new Track(d).length / 1000).toFixed(1); } catch { /* broken file */ }
    row(name, `${km} km. Made in the editor`, 'mine', [
      ['Drive', () => startDriving(d)], ['Edit', () => openEditor(d)],
      ['Delete', () => { const a = userTracks(); delete a[name]; store.set('cr.tracks', a); renderMenu(); }, 'danger'],
    ]);
  }
}

function bindMenu() {
  const bindOpt = (id, key, fn) => { const el = $(id); el.checked = key === 'sfx' ? sound.sfxOn : key === 'music' ? sound.musicOn : opts[key]; el.onchange = () => { fn(el.checked); store.set('cr.opts', opts); }; };
  bindOpt('opt-assist', 'assist', (v) => { opts.assist = v; car.opts.assist = v ? 0.7 : 0; });
  bindOpt('opt-derby', 'derby', (v) => { opts.derby = v; if (track) derbyStart(); });
  const rv = $('opt-rivals'); rv.value = String(opts.rivals);
  rv.onchange = () => { opts.rivals = +rv.value; store.set('cr.opts', opts); if (track) derbyStart(); };
  $('go-again').onclick = () => { hud.hideGameOver(); restartRace(); };
  $('go-menu').onclick = () => showMenu();
  bindOpt('opt-kmh', 'kmh', (v) => { opts.kmh = v; hud.setUnits(v); });
  bindOpt('opt-shadow', 'shadow', (v) => { opts.shadow = v; stage.setShadows(v); });
  bindOpt('opt-sfx', 'sfx', (v) => { sound.setEnabled('sfx', v); syncSoundUI(); });
  bindOpt('opt-music', 'music', (v) => { if (v) sound.init(); sound.setEnabled('music', v); syncSoundUI(); });
  const sw = $('swatches');
  PAINTS.forEach(([name, hex], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.title = name; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name);
    b.style.background = '#' + hex.toString(16).padStart(6, '0'); b.setAttribute('aria-checked', String(i === opts.paint));
    b.onclick = () => { opts.paint = i; visual.setPaint(hex); store.set('cr.opts', opts); [...sw.children].forEach((c, j) => c.setAttribute('aria-checked', String(j === i))); };
    sw.appendChild(b);
  });
  $('btn-new').onclick = () => { const d = makeTemplate('kidney'); d.name = 'My track'; openEditor(d); };
  $('import-file').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const d = normalizeTrack(JSON.parse(await f.text())); new Track(d);
      saveUserTrack(d); renderMenu(); toast(`Imported "${d.name}".`);
    } catch { toast('That file is not a valid track.'); }
  };
}

// ---------------------------------------------------------------------- boot
addEventListener('error', (e) => { const f = $('fatal'); f.hidden = false; f.textContent = 'Something broke:\n' + (e.error?.stack || e.message); });
addEventListener('unhandledrejection', (e) => { console.error(e.reason); });
document.addEventListener('visibilitychange', () => { last = performance.now(); });

bindMenu();
loadTrack(makeTemplate('speedway'));
renderMenu();
setMode('menu');
requestAnimationFrame(frame);

const params = new URLSearchParams(location.search);
if (params.get('track') && TEMPLATE_KEYS.includes(params.get('track'))) {
  const key = params.get('track'), d = key === 'random' ? makeRandomTrack() : makeTemplate(key);
  if (params.get('edit')) openEditor(d); else if (params.get('drive') !== '0') startDriving(d);
}
