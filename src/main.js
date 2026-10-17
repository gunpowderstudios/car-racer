// Car Racer - main entry. Wires physics, rendering, HUD, audio, menu and editor together.
import * as THREE from 'three';
import { Track, SURF, normalizeTrack, analyzeTrack } from './track.js';
import { Vehicle } from './vehicle.js';
import { Derby, DERBY, collideVanCar } from './derby.js';
import { IDLE } from './ai.js';
import { ZONE_LABEL, DAMAGE, TOUGHNESS, blastFraction, crashDamage, zoneAt, wallDamage, roofDentHp } from './damage.js';
import { DENT } from './dentMath.js';
import { arenaInfo, arenaPlayerStart } from './arena.js';
import { Life, LIFE } from './mplife.js';
import { V3, lerp } from './math.js';
import { makeTemplate, makeRandomTrack, TEMPLATE_KEYS, TEMPLATE_INFO } from './templates.js';
import { Stage } from './stage.js';
import { WheelFlyers } from './wheelDebris.js';
import { CarVisual, ChaseCamera, RIVAL_LOOKS, warmRivalLooks } from './carVisual.js';
import { SkidMarks, Particles, Scorch, Debris } from './effects.js';
import { Props } from './props.js';
import { PropsView } from './propsView.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Hud, fmtTime } from './hud.js';
import { Editor } from './editor.js';
import { EditorPreview } from './editorPreview.js';
import { packedFromHash, unpackTrack, trackLinkUrl } from './trackLink.js';
import { Multiplayer } from './multiplayer.js';
import { TIERS, TIER_NAMES, detectTier, probeDevice, AdaptiveRes } from './quality.js';
import { createChatUI } from './mpChat.js';
import { VERSION } from './version.js';
import { selectedVehicle, multiplayerVehicleSpec, vehicleById } from './vehicleChoice.js';
import { obbOverlap } from './obbOverlap.js';
import { Caravan, HITCH, TOW_CARS } from './caravan.js';
import { remoteCarHitsVan, carHitsRemoteVan } from './mpVanContacts.js';
import { CaravanView } from './caravanView.js';

const $ = (id) => document.getElementById(id);
let DT = 1 / 120;   // physics step; set from the quality tier below (60 Hz on low-end phones)
const PAINTS = [['Tail-light red', 0xd9482b], ['Sodium yellow', 0xe8b02a], ['Racing green', 0x2f6b4a], ['Police white', 0xe4e1d8], ['Midnight', 0x2a2f5c]];

// ------------------------------------------------------------------ storage
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } },
};
const savedOpts = store.get('cr.opts', {});
const qParam = new URLSearchParams(location.search).get('q');
const forcedQuality = TIER_NAMES.includes(qParam) ? qParam : TIER_NAMES.includes(savedOpts.quality) ? savedOpts.quality : null;   // ?q=low|medium|high beats the saved choice
const tierName = detectTier({ forced: forcedQuality, ...probeDevice() });
const tier = TIERS[tierName];
// Shadows and rival count default from the tier until the player picks their own.
const opts = Object.assign({ assist: true, kmh: false, shadow: tier.shadow, paint: 0, derby: true, mode: 'race', handling: 'arcade', skill: 'hard', caravan: false, rivals: tier.rivals, quality: 'auto', chat: 'all' }, savedOpts);
DT = 1 / tier.physicsHz;
CarVisual.aniso = tier.aniso;
CarVisual.dentMax = tier.dentMax;
CarVisual.texMax = tierName === 'high' ? 0 : 1024;          // phones: car textures at 1024px instead of 2048
const userTracks = () => store.get('cr.tracks', {});
const bestKey = (t) => `${t.def.name}|${Math.round(t.length)}`;

// ------------------------------------------------------------------- set-up
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier.aa, powerPreference: 'high-performance' });
const baseRatio = Math.min(devicePixelRatio || 1, tier.pixelRatio);
renderer.setPixelRatio(baseRatio);
renderer.shadowMap.enabled = opts.shadow; renderer.shadowMap.type = tier.shadowType === 'pcfsoft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 7000);
const stage = new Stage(renderer, tier);
stage.setShadows(opts.shadow);
const car = new Vehicle();
const visual = new CarVisual(stage.scene, car.restHeight);
const caravan = new Caravan(HITCH[selectedVehicle().id] || HITCH.escort), caravanView = new CaravanView(stage.scene);   // the 70s Saloon can tow a caravan (see caravan.js)
/** Should there be a caravan on the car right now? Only if asked for and on a car that can tow it (in multiplayer too: the others see it through the state reports). */
let vanHudShown = -1;
/** The caravan's health, under the car's damage card (0 = wrecked). */
function vanHud(van) {
  const box = document.getElementById('van-dmg'); if (!box) return;
  const pct = van ? Math.max(0, Math.round(100 * van.health / van.spec.hp)) : -1;
  if (pct === vanHudShown) return; vanHudShown = pct;
  box.hidden = pct < 0; if (pct < 0) return;
  const f = document.getElementById('van-dmg-fill'); f.style.width = pct + '%'; f.style.background = pct > 60 ? '#6fd36f' : pct > 25 ? '#ffb31f' : '#e8392c';
  document.getElementById('van-dmg-n').textContent = pct;
}
const caravanWanted = () => !!opts.caravan && TOW_CARS.includes(selectedVehicle().id) && !caravanView.failed;
function syncCaravan() {
  if (!caravanWanted()) { car.tow = null; caravanView.visible = false; caravanView.capture(null); return; }
  caravan.track = track; car.tow = caravan; caravan.reset(car);
  caravanView.visible = true;
  const ready = () => { Object.assign(caravan.spec, { dAxle: caravanView.dims.dAxle, wheelR: caravanView.dims.wheelR, length: caravanView.dims.length, width: caravanView.dims.width, rear: caravanView.dims.rear, front: caravanView.dims.front }); if (car.tow) { caravan.reset(car); caravanView.snap(caravan); } };
  if (caravanView.loaded) { ready(); return; }
  caravanView.snap(caravan);
  caravanView.load().then((d) => { if (d) ready(); else { opts.caravan = false; store.set('cr.opts', opts); const cb = $('opt-caravan'); if (cb) cb.checked = false; car.tow = null; toast('The caravan model could not be loaded.'); } });
}
visual.setPaint(PAINTS[opts.paint][1]);
visual.onLoad = (v) => {
  $('swatches').hidden = v.textured;            // a textured car brings its own paint
  loadBar(1);
  warmRivalLooks(v, tier.arenaField, (t) => renderer.initTexture(t));       // paint the rivals' colours now, in idle time, not mid-race
};
// A slim "Loading car" bar while the model downloads. It only appears if the download takes a moment (a cached car never shows it).
let loadBarT = 0;
function loadBar(frac) {
  const el = $('car-load'); if (!el) return;
  if (frac >= 1 || frac < 0) { clearTimeout(loadBarT); loadBarT = 0; el.hidden = true; return; }
  $('car-load-fill').style.width = Math.round(frac * 100) + '%';
  if (!loadBarT) loadBarT = setTimeout(() => { el.hidden = false; }, 350);
}
visual.onProgress = (done, total) => { if (done < 0) loadBar(-1); else loadBar(total > 0 ? Math.min(0.98, done / total) : 0.5); };
visual.load();
const chase = new ChaseCamera(camera);
const skid = new SkidMarks(stage.scene);
const particles = new Particles(stage.scene);
particles.setQuality(tier.fx, tier.smokeCap);
const debris = new Debris(stage.scene, tier.debris);
const debrisQ = Track.newQuery();
const wheelFlyers = new WheelFlyers();
const debrisGround = (x, z, y) => (track ? track.groundAt(x, z, y + 1, debrisQ).y : 0);
/** Spray crash debris. `speed` is the impact speed; small bumps throw nothing. */
function crashDebris(x, y, z, speed, paint, bx = 0, bz = 0, scale = 1) {
  if (scale === 1 && speed < 5) return;           // small bumps throw nothing (a wreck, scale > 1, always does)
  const power = Math.min(1, (speed - 4) / 16);
  debris.burst(x, y, z, bx, bz, power, paint, Math.round((2 + power * 9) * scale));
}
const rivalPaint = () => RIVAL_LOOKS[(Math.random() * RIVAL_LOOKS.length) | 0].tint;
const scorch = new Scorch(stage.scene);
const splats = new Scorch(stage.scene, 40, 0xb5502e);   // a warmer tint than the black burn marks
const props = new Props();
const propsView = new PropsView(stage.scene);
const hud = new Hud(); hud.setUnits(opts.kmh);
const sound = new Sound();
const derby = new Derby();
const views = new Map();            // rival id -> CarVisual
const towHit = { closing: 0, mu: 0, x: 0, y: 0, z: 0 };
const towViews = new Map();         // rivals' caravan pictures, by rival id
const viewPool = [];                // visuals of rivals that have gone, ready to be reused
const derbyBest = () => store.get('cr.derby', {});
let overAt = 0, overInfo = null;    // when to pop up the game-over card, and what it says

let mode = 'menu', track = null, def = null, hasPlayed = false;

// ------------------------------------------------------------------ multiplayer (see src/multiplayer.js)
let net = null;                     // active Multiplayer session, or null in single-player
const life = new Life();            // this player's health, being wrecked and respawning in multiplayer (see mplife.js)
const mpBoomSeen = new Set();       // barrels (by prop index) already announced or heard about, so nothing echoes
let mpFinished = false;             // multiplayer only: has this player completed the selected race distance
let mpRaceStart = null;             // sim time the current multiplayer race began (lap 1 crossing)
const remotePlayers = new Map();    // peer id -> {name, hue, view, prev, cur, recvAt, label}
const mpViewPool = [];              // spare CarVisuals for remote players, kept apart from the AI-rival pool
let paused = false;
const prevPos = new THREE.Vector3(), curPos = new THREE.Vector3(), prevQ = new THREE.Quaternion(), curQ = new THREE.Quaternion();
const drawPos = new THREE.Vector3(), drawQ = new THREE.Quaternion(), velV = new THREE.Vector3();
let acc = 0, last = performance.now(), simTime = 0, fps = 60, orbit = 0, frameNo = 0;
let hornVoice = null, frozen = false;
let throttleNow = 0, wallSpot = null;
const race = { unwrapped: 0, max: 0, lastS: null, index: -1, lapStart: null, laps: 0, best: null, reverseT: 0, lastTime: null };
const safe = { s: 0, off: 0, t: 0 };
const mapDots = [];
const trouble = { flipped: 0, lost: 0 };

// ------------------------------------------------------------------ adaptive resolution and the ?perf overlay
// While driving, a second of slow frames (twice running) lowers the render resolution a step; a long smooth
// run raises it again. At the floor it turns off shadows, then the mirror, rather than stay choppy.
const adapt = new AdaptiveRes({ min: tier.minScale });
function applyResolution() { renderer.setPixelRatio(baseRatio * adapt.scale); }
function adaptFeed(rawDt) {
  const r = adapt.feed(rawDt);
  if (!r) return;
  if (r === 'floor') {
    if (particles.density > 0.35) { particles.density = Math.max(0.3, particles.density * 0.6); return; }          // thin out the smoke first: it costs a draw call per puff and is the least missed
    if (opts.shadow) { opts.shadow = false; stage.setShadows(false); $('opt-shadow').checked = false; toast('Shadows turned off to keep the game smooth.'); }
    else if (mirror.on) { toggleMirror(); toast('Mirror turned off to keep the game smooth.'); }
    return;
  }
  applyResolution();
}
const perf = new URLSearchParams(location.search).has('perf') ? { el: null, nextAt: 0 } : null;
if (perf) renderer.info.autoReset = false;   // several render() calls per frame (main view + mirror): count them all
function perfUpdate(now) {
  if (!perf || now < perf.nextAt) return;
  perf.nextAt = now + 500;
  if (!perf.el) {
    perf.el = document.createElement('pre');
    perf.el.style.cssText = 'position:fixed;left:6px;bottom:6px;margin:0;padding:4px 6px;z-index:9999;pointer-events:none;font:11px/1.35 monospace;color:#9f9;background:rgba(0,0,0,.6);border-radius:4px;white-space:pre';
    document.body.appendChild(perf.el);
  }
  const i = renderer.info;
  perf.el.textContent = `${tierName}  ${fps.toFixed(0)} fps  res ${(baseRatio * adapt.scale).toFixed(2)}x  ${physicsLabel}\n` +
    `calls ${i.render.calls}  tris ${(i.render.triangles / 1000).toFixed(0)}k  geo ${i.memory.geometries}  tex ${i.memory.textures}`;
}
const physicsLabel = `${tier.physicsHz}Hz`;

const input = new Input({
  onReset: () => mode === 'drive' && respawn(),
  onRestart: () => mode === 'drive' && restartRace(),
  onPadConnect: () => mode === 'drive' && hud.banner('Controller connected', 1600),
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
  rt: new THREE.WebGLRenderTarget(1, 1, { samples: tier.aa ? 4 : 0 }),
  scene: new THREE.Scene(), ortho: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2),
  off: new THREE.Vector3(), tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, 0, 0)),
};
{
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: mirror.rt.texture, depthTest: false, depthWrite: false }));
  quad.scale.x = -1;   // the mirror flip
  mirror.scene.add(quad); mirror.ortho.position.z = 1;
}
function toggleMirror() { mirror.on = !mirror.on; mirror.drawn = false; mirror.el.hidden = !mirror.on; hud.banner('Mirror ' + (mirror.on ? 'on' : 'off'), 900); }
function renderMirror() {
  const r = mirror.el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  // in the derby the mirror sits under the score card, and the kill feed under the mirror
  const score = $('derby-score'), feed = $('feed');
  if (!score.hidden) { mirror.el.style.top = score.getBoundingClientRect().bottom + 6 + 'px'; feed.style.top = r.bottom + 6 + 'px'; }
  else if (mirror.el.style.top) { mirror.el.style.top = ''; feed.style.top = ''; }
  const pr = renderer.getPixelRatio(), bw = 3, w = r.width - bw * 2, h = r.height - bw * 2;
  const tw = Math.round(w * pr * tier.mirrorScale), th = Math.round(h * pr * tier.mirrorScale);
  if (mirror.rt.width !== tw || mirror.rt.height !== th) { mirror.rt.setSize(tw, th); mirror.drawn = false; }
  mirror.cam.aspect = w / h; mirror.cam.updateProjectionMatrix();
  mirror.cam.position.copy(drawPos).add(mirror.off.set(0, 1.35, -2.7).applyQuaternion(drawQ));
  mirror.cam.quaternion.copy(drawQ).multiply(mirror.tilt);   // camera looks down -Z, which is the car's rear
  if (!mirror.drawn || frameNo % tier.mirrorEvery === 0) {   // lower tiers redraw the mirror every 2nd/3rd frame and show the last picture in between
    const shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;                   // reuse the shadow map from the main view
    renderer.setRenderTarget(mirror.rt); renderer.render(stage.scene, mirror.cam); renderer.setRenderTarget(null);
    renderer.shadowMap.autoUpdate = shadows;
    mirror.drawn = true;
  }
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
  chase.low = !!def.lowCam;      // (see pickStartCamera)
  stage.setTrack(track);
  hud.buildMap(track);
  skid.clear(); particles.clear(); debris.clear(); scorch.clear();
  props.load(track, def.props); propsView.build(props);
  race.best = store.get('cr.best', {})[bestKey(track)] ?? null;
  race.laps = 0; race.lapStart = null; race.lastTime = null;
  placeCar(track.startS(12), 0, 0);
  derbyStart();
  window.__game = { caravan, caravanView, wheelFlyers, get chatUI() { return chatUI; }, get net() { return net; }, set net(v) { net = v; }, get remotePlayers() { return remotePlayers; }, get mpHandlers() { return mpHandlers; }, debris, tier, adaptFeed, car, camera, visual, get track() { return track; }, race, opts, renderer, stage, sim, respawn, props, derby, views };
}

function placeCar(s, offset = 0, speed = 0, keepRace = false) {
  s = track.restartS(s);                                      // (a spiral ramp with no barriers sends you back to its foot)
  const L = track.length, f = track.frameAt(s);
  const h = car.restHeight + 0.08;
  car.reset(new V3(f.x + f.lx * offset + f.nx * h, f.y + f.ly * offset + f.ny * h, f.z + f.lz * offset + f.nz * h),
    new V3(f.fx, f.fy, f.fz), new V3(f.nx, f.ny, f.nz), speed);
  car.opts.assist = opts.assist ? 0.7 : 0; car.opts.stability = opts.handling === 'standard' ? 0 : 1;
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
  syncCaravan();
}

/** The Oval has no start line: you begin near one end of the floor, facing the middle. */
function placeCarInArena() {
  const A = arenaInfo(track), p = arenaPlayerStart(A);
  car.reset(new V3(p.x, A.y + car.restHeight + 0.08, p.z), new V3(p.fx, 0, p.fz), new V3(0, 1, 0), 0);
  car.opts.assist = opts.assist ? 0.7 : 0; car.opts.stability = opts.handling === 'standard' ? 0 : 1;
  syncPose(); prevPos.copy(curPos); prevQ.copy(curQ);
  race.lastS = track.progressAt(car.pos.x, car.pos.y, car.pos.z);
  safe.s = race.lastS; safe.off = 0; safe.t = 0;
  chase.snap(); trouble.flipped = trouble.lost = 0; acc = 0;
}

/** Back to the start line with a fresh lap and a full boost tank. */
function restartRace() {
  race.laps = 0; race.lapStart = null; race.lastTime = null; race.reverseT = 0;
  skid.clear(); particles.clear(); debris.clear(); scorch.clear(); props.reset();
  placeCar(track.startS(12), 0, 0);
  car.boostFuel = 1;
  derbyStart();
  hud.banner(derby.demolition ? 'Last one standing wins!' : derby.enabled ? 'Race! Wrecked? You respawn' : 'Get to the start line', 1400);
}

function respawn() {
  if (derby.over || (derby.enabled && derby.player?.wrecked)) return;      // a wreck stays put until its respawn is due
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
    if (car.tow && !derby.enabled) { car.refreshFrame(); collideVanCar(car.tow, car, towHit); }   // (with rivals, derby.step does this)
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
  const lapped = !derby.lastStanding;                         // an arena has no laps and no wrong way
  if (lapped && race.lastS != null) {
    let d = s - race.lastS; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
    if (Math.abs(d) < 60) {
      race.unwrapped += d;
      race.reverseT = d < -0.02 && car.speed > 6 ? race.reverseT + dt : Math.max(0, race.reverseT - dt * 2);
    }
  }
  race.lastS = s;
  if (race.unwrapped > race.max) race.max = race.unwrapped;
  const idx = lapped ? Math.floor(race.max / L) : race.index;    // laps only count on a circuit; an arena stays at its start index
  if (idx > race.index) {
    race.index = idx;
    if (idx === 0) { race.lapStart = simTime; race.laps = 1; if (net) mpRaceStart = simTime; hud.banner('Go!', 900); }
    else if (idx > 0 && race.lapStart != null) {
      const t = simTime - race.lapStart; race.lastTime = t;
      const improved = race.best == null || t < race.best;
      if (improved) { race.best = t; const b = store.get('cr.best', {}); b[bestKey(track)] = t; store.set('cr.best', b); }
      race.lapStart = simTime; race.laps = idx + 1;
      if (net && !mpFinished && idx >= mpRaceLaps()) {
        mpFinished = true;
        hud.banner(`Finished! ${fmtTime(simTime - (mpRaceStart ?? simTime))}`, 3200);
      } else {
        hud.banner(improved ? `Best lap ${fmtTime(t)}` : `Lap ${fmtTime(t)}`, 2200);
      }
    }
  }
  if (lapped && race.reverseT > 1.6) { hud.banner('Wrong way', 700); }

  // remember a safe spot to come back to
  safe.t += dt;
  if (safe.t > 0.4 && car.onGround && car.ay.y > 0.8 && car.speed > 0.5) {
    const q = track.query(car.pos.x, car.pos.y, car.pos.z, undefined, 1);
    if (q.surface === SURF.ROAD && Math.abs(q.d) < q.hw - 1.5) { safe.s = q.s; safe.off = q.d; safe.t = 0; }
  }
  // stuck on the roof, or fell off the world?
  trouble.flipped = car.ay.y < 0.5 && car.speed < 4 ? trouble.flipped + dt : 0;   // on the roof OR propped up on its side
  const q2 = track.query(car.pos.x, car.pos.y + 0.5, car.pos.z, undefined, 1.2);
  trouble.lost = q2.surface === SURF.BASE && car.pos.y < 2 ? trouble.lost + dt : 0;
  if (trouble.flipped > 2) respawn();
  else if (trouble.lost > 1.4 || car.pos.y < -30) respawn();
}

// ------------------------------------------------------------------ physics
function stepPhysics(dt) {
  if (frozen) return;                                            // the story-mode results panel is up: hold the race still
  const raw = input.read();
  const inp = derby.over || (derby.enabled && derby.player?.wrecked) ? IDLE : net && life.dead ? MP_WRECKED_INPUT : raw;   // once you are wrecked, nobody is driving
  throttleNow = inp.throttle;
  if (raw.horn && !hornVoice) hornVoice = sound.hornStart() || {}; else if (!raw.horn && hornVoice) { hornVoice.stop?.(); hornVoice = null; }   // hold H to honk (stops by itself after a moment)
  acc += dt; let n = 0;
  while (acc >= DT && n < 6) {
    prevPos.copy(curPos); prevQ.copy(curQ);
    car.step(DT, inp, track);
    if (car.tow) {
      caravanView.capture(car.tow);
      for (const e of car.tow.events) caravanEvent(e);
      car.tow.events.length = 0;
    }
    if (net) { mpCollideLocal(); mpVanContacts(); }             // soft, local-only push out of remote cars (and caravans)
    if (track.rollers) track.stepRollers(DT, derby.enabled ? derby.cars : [car]);                  // boulders waiting by the road roll out when a car comes near
    if (derby.enabled) derby.step(DT, props.barrels);          // rivals, crashes, damage (reads this step's wall hits before they are cleared below)
    if (towViews.size) for (const f of derby.fighters) if (f.car.tow && !f.isPlayer) towViews.get(f.id)?.capture(f.car.tow);   // the rivals' caravans, now they have moved
    props.step(DT, derby.enabled ? derby.cars : car);
    syncPose(); acc -= DT; n++; simTime += DT;
    if (props.events.length) { propEvents(); }
    if (derby.events.length) { derbyEvents(); }
    if (car.events.length) {
      for (const e of car.events) {
        sound.hit(e.speed, e.type); chase.impact(e.speed);
        if (net) {                                          // multiplayer has no derby, so it dents the car itself: walls, and the roof when rolling
          if (e.type === 'wall') mpDentAt(e.x, e.y, e.z, wallDamage(car.mass, e.speed));
          else if (e.type === 'ground') { car.refreshFrame(); if (zoneAt(car, e.x, e.y, e.z) === 'roof') mpDentAt(e.x, e.y, e.z, roofDentHp(e.speed)); }
        }
        if (e.type === 'wall') { wallSpot = { x: e.x, y: e.y, z: e.z, t: simTime }; for (let i = 0; i < Math.min(10, 2 + e.speed); i++) particles.spark(e.x, e.y, e.z, car.vel.x * 0.3, 2, car.vel.z * 0.3); crashDebris(e.x, e.y, e.z, e.speed, PAINTS[opts.paint][1], -car.vel.x * 0.3, -car.vel.z * 0.3); }
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
      if (derby.damageEnabled) derby.blast(e.x, e.y, e.z);
      if (net) mpBarrelBlast(e);
    } else if (e.type === 'clang') sound.clang(e.speed, e.dist);
    else if (e.type === 'splat') {
      for (let k = 0; k < 7; k++) {
        const a = Math.random() * Math.PI * 2, h = 0.6 + Math.random() * 1.6;
        particles.puff(e.x + Math.cos(a) * 0.15, e.y + 0.2 + Math.random() * 0.2, e.z + Math.sin(a) * 0.15, Math.cos(a) * h, Math.sin(a) * h, 0.7 + Math.random() * 0.5, 0.7 + Math.random() * 0.5, 0xf2ede0);
      }
      splats.add(e.x, e.y, e.z, e.nx, e.ny, e.nz, 0.9 + Math.random() * 0.3);
      sound.splat(e.dist);
      if (derby.damageEnabled && e.dist < DERBY.creditNear) derby.award('chicken', 1, 'Splat!');
    }
  }
  props.events.length = 0;
}

/** Something happened to your caravan: a knock (sound, sparks, a shake) or the hitch giving way. */
function caravanEvent(e) {
  if (e.type === 'van-wrecked') {
    hud.banner('Caravan wrecked! Wheels off - drag it home', 2200);
    particles.blast(e.x, e.y + 0.4, e.z, 1.2);
    crashDebris(e.x, e.y + 0.6, e.z, 16, 0xdfe9e0, 0, 0, 1.6);
    wheelFlyers.launch(caravanView, car.vel, 0.7);
    return;
  }
  if (e.type === 'van-scrape') {                                    // dragging the wreck: a trail of sparks
    for (let i = 0; i < 2; i++) particles.spark(e.x, e.y, e.z, (Math.random() - 0.5) * 4, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 4);
    return;
  }
  if (e.type !== 'van') return;
  caravanView.dent(e);
  sound.hit(e.speed, e.kind === 'wall' ? 'wall' : 'car'); chase.impact(e.speed * 0.6);
  const n = Math.min(8, 2 + e.speed * 0.4);
  for (let i = 0; i < n; i++) particles.spark(e.x, e.y, e.z, (Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5);
}

// ------------------------------------------------------- destruction derby
function derbyStart() {
  // AI rivals run independently on each browser, so keep multiplayer human-only.
  // Rival count and Destruction are separate: 0 rivals is pure lap-time mode; with Destruction
  // off the same AI cars simply race and recover instead of taking damage.
  derby.enabled = !net && opts.rivals > 0;
  const arena = !!(track && track.def && track.def.mode === 'lastStanding');           // The Oval: twice the rivals, all fighting each other
  derby.towing = derby.enabled && caravanWanted();                                      // everyone tows a caravan, so the field is smaller: 4 at most
  const field = Math.min(arena ? Math.min(tier.arenaField, opts.rivals * 2) : opts.rivals, derby.towing ? 4 : 99);
  // Damage is always on when there are rivals. Race: wrecked means a respawn. Demolition: wrecked means out, last one standing wins.
  derby.damageEnabled = derby.enabled;
  if (derby.enabled) derby.start(track, car, field, (Math.random() * 1e9) | 0, opts.mode); else derby.stop();
  document.body.classList.toggle('arena', derby.demolition);                            // no laps in an arena or a demolition: the lap card goes
  if (arena) placeCarInArena();
  clearViews(); overAt = 0; overInfo = null;
  visual.setLook(1, 0); visual.clearDents();
  hud.derbyMode(derby.damageEnabled);
  if (derby.damageEnabled) { hud.setScore(0, 0, derby.alive); hud.setDamage(derby.player.health); }
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
      if (e.dist < 70 && !(e.player && e.kind === 'wall')) crashDebris(e.x, e.y, e.z, e.speed, e.player ? PAINTS[opts.paint][1] : rivalPaint());   // (the player's own wall hits are done above)
    } else if (e.type === 'damage') {
      if (e.isPlayer) hud.setDamage(derby.player.health, e.zone);
      if (e.lx !== undefined) { const v = e.isPlayer ? visual : views.get(e.id); if (v && v.loaded) v.addDent(e.lx, e.ly, e.lz, e.dentHp ?? e.hp); }   // a visible dent where it hit
    } else if (e.type === 'wreck') {
      particles.blast(e.x, e.y, e.z, e.isPlayer ? 2 : 1.6);
      crashDebris(e.x, e.y + 0.4, e.z, 20, e.isPlayer ? PAINTS[opts.paint][1] : rivalPaint(), 0, 0, 2.6);
      const g = track.groundAt(e.x, e.z, e.y + 0.6, groundQ);
      if (e.y - g.y < 2.5) scorch.add(e.x, g.y, e.z, g.nx, g.ny, g.nz, 3.4);
      sound.explode(e.dist);
      if (e.dist < 45) chase.impact(Math.max(0, 1 - e.dist / 45) * 22);
      { const wf = e.isPlayer ? derby.player : derby.fighters.find((x) => x.id === e.id), wv = e.isPlayer ? visual : views.get(e.id); if (wv) wheelFlyers.launch(wv, wf && wf.car.vel); }   // the wheels fly off
      props.shock(e.x, e.y, e.z, 8);                  // a burning car sets off drums beside it
      if (e.isPlayer) hud.setDamage(derby.player.health, e.zone);
    } else if (e.type === 'award') {
      hud.feed(`+${e.points} ${e.label}`);
    } else if (e.type === 'honk') {
      sound.honk(e.dist, e.pitch);
    } else if (e.type === 'respawn') {
      respawn(); visual.clearDents(); visual.setLook(1, 0); hud.setDamage(derby.player.health);
      hud.banner('Respawned - back in the race!', 1600);
    } else if (e.type === 'over') {
      const key = bestKey(track), all = derbyBest(), prev = all[key] || 0, isBest = e.score > prev;
      if (isBest) { all[key] = e.score; store.set('cr.derby', all); }
      overInfo = e.won
        ? { score: e.score, takedowns: e.takedowns, best: Math.max(prev, e.score), isBest, zone: 'Every rival wrecked', title: 'Last one standing!' }
        : { score: e.score, takedowns: e.takedowns, best: Math.max(prev, e.score), isBest, zone: `${ZONE_LABEL[e.zone]} destroyed` };
      overAt = performance.now() + 1800;
      hud.banner(e.won ? 'Last one standing!' : 'Wrecked', 1700);
    }
  }
  derby.events.length = 0;
}

// ----- how the rivals look
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const MP_DELAY = 110;      // ms: how far behind the latest report the other players' cars are drawn
function makeView(f) {
  let v = (viewPool[f.hue] || (viewPool[f.hue] = [])).pop();
  if (!v) { v = new CarVisual(stage.scene, car.restHeight); v.setPaint(RIVAL_LOOKS[f.hue].tint); v.hue = f.hue; }
  v.root.visible = true; v.root.scale.setScalar(1); v.clearDents();
  views.set(f.id, v);
  return v;
}
function releaseView(id) {
  const v = views.get(id); if (!v) return;
  const bar = rivalBars.get(id); if (bar) { bar.el.remove(); rivalBars.delete(id); }
  v.restoreWheels(); v.root.visible = false; (viewPool[v.hue] || (viewPool[v.hue] = [])).push(v); views.delete(id);
}
function clearViews() { for (const id of [...views.keys()]) releaseView(id); for (const id of [...towViews.keys()]) dropTowView(id); }

// ----- the rivals' caravans (each in its rival's colour)
function dropTowView(id) { const tv = towViews.get(id); if (!tv) return; stage.scene.remove(tv.root); towViews.delete(id); }
function syncTowViews(a) {
  for (const f of derby.fighters) {
    if (f.isPlayer) continue;
    const van = f.car.tow;
    if (!van || f.gone) { dropTowView(f.id); continue; }
    let tv = towViews.get(f.id);
    if (!tv) { if (!caravanView.loaded) continue; tv = caravanView.cloneFor(stage.scene, RIVAL_LOOKS[f.hue]); towViews.set(f.id, tv); tv.snap(van); }
    tv.update(a);
    if (tv.wrecked && !tv._wheelsOff) wheelFlyers.launch(tv, van.vel, 0.7);                                   // a rival's wrecked caravan loses its wheels too
    const dx = tv.root.position.x - camera.position.x, dz = tv.root.position.z - camera.position.z;
    tv.root.visible = dx * dx + dz * dz < 300 * 300;
  }
  for (const id of [...towViews.keys()]) if (!derby.fighters.some((f) => f.id === id && !f.gone)) dropTowView(id);
}

// ----- a small health bar floating over each rival, so you can see who is weak (same look as the multiplayer ones)
const rivalBars = new Map();                                      // rival id -> {el, fill}
const rivalBarV = new THREE.Vector3();
function syncRivalBar(f, v) {
  let b = rivalBars.get(f.id);
  const dist = v.root.position.distanceTo(camera.position);
  if (f.wrecked || !v.root.visible || dist > 150) { if (b) b.el.style.display = 'none'; return; }
  if (!b) {
    const el = document.createElement('div'); el.className = 'mp-label ai-bar';
    const bar = document.createElement('div'); bar.className = 'mp-health';
    const fill = document.createElement('div'); fill.className = 'mp-health-fill';
    bar.appendChild(fill); el.appendChild(bar); $('mp-labels').appendChild(el);
    b = { el, fill }; rivalBars.set(f.id, b);
  }
  camera.updateMatrixWorld();                                    // the camera has moved since the last render: project with its current matrix, or the bars lag behind the cars
  rivalBarV.set(v.root.position.x, v.root.position.y + 2.3, v.root.position.z).project(camera);
  if (rivalBarV.z > 1) { b.el.style.display = 'none'; return; }
  const h = Math.max(0, Math.min(1, f.health.worst));
  b.el.style.display = ''; b.el.style.opacity = String(Math.max(0.2, 1 - dist / 150));
  b.el.style.left = (rivalBarV.x * 0.5 + 0.5) * innerWidth + 'px';
  b.el.style.top = (-rivalBarV.y * 0.5 + 0.5) * innerHeight + 'px';
  b.fill.style.width = Math.round(h * 100) + '%';
  b.fill.style.background = h > 0.5 ? '#6bd66b' : h > 0.2 ? '#e8b13a' : '#d94b3a';
}

/** Place each rival's visual at its (interpolated) physics pose. At most two new ones are built per frame. */
function syncViews(a) {
  let made = 0, adopted = 0;
  for (const f of derby.fighters) {
    if (f.isPlayer) continue;
    let v = views.get(f.id);
    if (f.gone) { if (v) releaseView(f.id); continue; }
    if (!v) { if (made >= 2) continue; v = makeView(f); made++; }
    if (!v.loaded && visual.loaded && adopted < 2 && v.adopt(visual, RIVAL_LOOKS[f.hue])) adopted++;      // a couple a frame, so the game never freezes
    const p = f.prev, c = f.cur;
    v.root.position.set(lerp(p.x, c.x, a), lerp(p.y, c.y, a), lerp(p.z, c.z, a));
    qa.set(p.qx, p.qy, p.qz, p.qw); qb.set(c.qx, c.qy, c.qz, c.qw);
    v.root.quaternion.slerpQuaternions(qa, qb, a);
    // Rivals stay full-size. Wrecks remain believable hulks instead of shrinking like toys.
    v.root.scale.setScalar(1);
    const dx = v.root.position.x - camera.position.x, dz = v.root.position.z - camera.position.z;
    const d2 = dx * dx + dz * dz;
    v.root.visible = d2 < 300 * 300;                                           // 200,000 triangles each: skip the far ones
    if (v._wheelsOff && !f.wrecked) v.restoreWheels();                         // safety net: only a wreck goes without wheels
    if (d2 < 60 * 60) v.setWheels(f.car);                                      // wheels steer and spin on the cars near enough to see them
    const lod = derby.lastStanding ? tier.arenaLod : tier.lodDist;                          // the arena is all in view, so far cars go to boxes sooner
    if (lod) v.setFar(d2 > (v._far ? lod * 0.7 : lod) ** 2);   // wide hysteresis stops LOD flicker near the boundary
    v.setLook(f.wrecked ? 0.1 : 1 - 0.55 * (1 - f.health.worst), f.flash);
    syncRivalBar(f, v);
  }
}

// ----- smoke and fire
const zoneLocal = { front: new V3(0, 0.45, 1.8), back: new V3(0, 0.4, -1.9), left: new V3(0.8, 0.4, 0.2), right: new V3(-0.8, 0.4, 0.2) };
const fxPos = new V3();
const fxNear = [];                                                    // damaged rivals close enough to smoke this frame, nearest first
function derbyFx(dt) {
  // Smoke costs a draw call per puff, so only the few nearest damaged rivals smoke (tier.fxCars); the rest just darken.
  fxNear.length = 0;
  for (const f of derby.fighters) {
    if (f.gone || f.isPlayer || f.wrecked) continue;
    const dx = f.car.pos.x - camera.position.x, dz = f.car.pos.z - camera.position.z, d2 = dx * dx + dz * dz;
    if (d2 < 110 * 110 && f.health.worst < 0.55) { f._fxD = d2; fxNear.push(f); }
  }
  if (fxNear.length > tier.fxCars) { fxNear.sort((a, b) => a._fxD - b._fxD); fxNear.length = tier.fxCars; }
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
    if (!f.isPlayer && !fxNear.includes(f)) continue;                      // too far, or not among the nearest few smokers
    // hurt: smoke (and, when nearly dead, flames) from the weakest part
    c.toWorld(zoneLocal[f.health.worstZone], fxPos);
    const heavy = w < 0.25;
    if (Math.random() < (heavy ? 18 : 8) * dt) particles.puff(fxPos.x, fxPos.y, fxPos.z, c.vel.x, c.vel.z, heavy ? 1.9 : 1.4, 0.8 + Math.random() * 0.5, heavy ? 0x1d1b1d : 0x9d9893);
    if (heavy && Math.random() < 6 * dt) particles.flame(fxPos.x, fxPos.y, fxPos.z, c.vel.x * 0.5, 1.5, c.vel.z * 0.5);
  }
}

/** Spray off each wheel that is in a puddle (a bigger burst as it first hits the water). */
function waterSpray(c, dt) {
  if (!track.puddles || !track.puddles.length) return;
  for (let i = 0; i < 4; i++) {
    const w = c.wheels[i], wet = w.contact ? w.wet || 0 : 0, was = w._wasWet || 0;
    w._wasWet = wet;
    if (wet < 0.2 || c.speed < 2) continue;
    const p = w.contactPoint, power = Math.min(1.4, c.speed / 22);
    let ox = p.x - c.pos.x, oz = p.z - c.pos.z; const side = ox * c.ax.x + oz * c.ax.z; ox = c.ax.x * Math.sign(side || 1); oz = c.ax.z * Math.sign(side || 1);
    if (was < 0.2 && c.speed > 7) particles.splashBurst(p.x, p.y, p.z, c.vel.x, c.vel.z, power, ox, oz);
    if (Math.random() < Math.min(1, 55 * dt * (0.3 + power))) particles.splash(p.x, p.y, p.z, c.vel.x, c.vel.z, power * wet, ox, oz);
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
  waterSpray(car, dt);
  if (derby.enabled) for (const f of derby.fighters) { if (f.isPlayer || f.gone || f.wrecked) continue; const dx = f.car.pos.x - camera.position.x, dz = f.car.pos.z - camera.position.z; if (dx * dx + dz * dz < 80 * 80) waterSpray(f.car, dt); }
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
  particles.update(dt); debris.update(dt, debrisGround); wheelFlyers.update(dt, debrisGround);
}

// -------------------------------------------------------------------- frame
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.05, rawDt); last = now;
  fps += (1 / Math.max(dt, 1e-4) - fps) * 0.05;
  frameNo++;
  if (perf) renderer.info.reset();
  if (mode === 'drive' && !paused) adaptFeed(rawDt); else adapt.reset();
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
    chase.boosting = car.boosting; chase.towLen = car.tow ? car.tow.spec.length : 0;
    chase.update(dt, drawPos, drawQ, velV, track);
    effects(dt);
    hud.update(car, { lap: race.laps, time: race.lapStart != null ? simTime - race.lapStart : null, best: race.best,
      maxLap: net ? mpRaceLaps() : null, finished: mpFinished });
    if (derby.damageEnabled) {
      hud.setScore(derby.score, derby.takedowns, derby.alive);
      hud.setDamage(derby.player.health);
      derbyFx(dt);
      visual.setLook(derby.player.wrecked ? 0.3 : 1 - 0.5 * (1 - derby.player.health.worst), derby.player.flash);
      mapDots.length = 0;
      for (const f of derby.fighters) if (!f.isPlayer && !f.gone) mapDots.push({ x: f.car.pos.x, z: f.car.pos.z, wreck: f.wrecked });
      if (overAt && performance.now() > overAt) { overAt = 0; hud.showGameOver(overInfo); }
    }
    hud.drawMap(car, derby.enabled ? mapDots : null);
    sound.update(car, throttleNow, !derby.over && !car.engineOff);
    if (!$('debug').hidden) debugText();
    if (net) {
      if (life.respawnDue(simTime)) { respawn(); mpClearDents(); hud.banner('Respawned - back in the race!', 1600); }   // same lap, on the road, protected for a moment
      visual.setLook(life.dead ? 0.15 : 1, 0);                                                       // your own wreck goes dark, as it does on everyone else's screen
      net.sendState({ x: car.pos.x, y: car.pos.y, z: car.pos.z, qx: car.rot.x, qy: car.rot.y, qz: car.rot.z, qw: car.rot.w,
        vx: car.vel.x, vy: car.vel.y, vz: car.vel.z, steer: car.steerAngle, health: life.health, ts: performance.now(),
        van: car.tow ? mpVanState(car.tow) : null,
        alive: !(derby.enabled && derby.player && derby.player.wrecked) && !life.dead });
      mpSyncRemote();
    }
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
  if (visual._wheelsOff && !(derby.enabled && derby.player?.wrecked) && !(net && life.dead)) visual.restoreWheels();   // safety net: a car that is not wrecked always has its wheels on
  visual.setWheels(car);
  if (car.tow) { car.tow.track = track; caravanView.update(mode === 'drive' ? acc / DT : 1); }
  vanHud(car.tow);
  if (derby.enabled || views.size) { syncViews(mode === 'drive' ? acc / DT : 1); syncTowViews(mode === 'drive' ? acc / DT : 1); }
  propsView.update(props);
  stage.update(drawPos, camera.position); stage.updateRollers();
  renderer.render(stage.scene, camera);
  if (mode === 'drive' && mirror.on && !$('hud').hidden) renderMirror();
  perfUpdate(now);
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
  mode = m; document.body.className = 'mode-' + m + (derby.demolition ? ' arena' : '');
  $('hud').hidden = m !== 'drive';
  $('touch').hidden = !(m === 'drive' && matchMedia('(pointer: coarse)').matches);
  input.enabled = m === 'drive';
}
function showMenu() { mpTeardown(); setMode('menu'); renderMenu(); }
// The big vehicles (and anything towing a caravan) hide the road from the chase camera, so every race in one starts on the High camera (C still cycles as usual).
const HIGH_CAM_VEHICLES = ['bus', 'motor-home'];
let autoHighCam = false;
function pickStartCamera() {
  chase.low = !!track.def.lowCam;                 // The Twister (roads stacked above each other): the normal cameras, kept out from behind the road above
  const big = HIGH_CAM_VEHICLES.includes(selectedVehicle().id) || caravanWanted();   // a towed caravan hides the road too
  if (big) { chase.mode = 1; chase.ready = false; autoHighCam = true; }
  else if (autoHighCam) { chase.mode = 0; chase.ready = false; autoHighCam = false; }      // back to the normal chase camera after a big vehicle
}
function startDriving(newDef) {
  sound.init(); pickStartCamera();
  if (newDef) loadTrack(newDef);
  hasPlayed = true; setMode('drive'); last = performance.now();
  hud.banner(derby.demolition ? 'Last one standing wins!' : derby.enabled ? 'Race! Wrecked? You respawn' : 'Get to the start line', 1600);
}
function openEditor(d) {
  // the editor needs a mouse and a big screen - on touch devices just say so
  if (matchMedia('(pointer: coarse)').matches) { toast('The track editor only works on a desktop computer.'); return; }
  setMode('edit'); editor.open(d || def || makeTemplate('speedway'));
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
  onShare: async (d) => {                                     // a link that opens this track on a friend's screen
    try {
      const url = await trackLinkUrl(d);
      try { await navigator.clipboard.writeText(url); toast('Link copied. Send it to a friend and they can drive your track.'); }
      catch { window.prompt('Copy this link and send it to a friend:', url); }
    } catch { toast('Could not make a link for this track.'); }
  },
});

function saveUserTrack(d) {
  const all = userTracks(); all[d.name] = normalizeTrack(d); store.set('cr.tracks', all);
}
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------------- menu
/** Choose a track from the list: its 3D view comes up on the right (where the vehicle was) and Go! starts it. */
let trackPreview = null, chosenDef = null;
function hideTrackPreview() { chosenDef = null; document.body.classList.remove('track-chosen'); $('menu-track-preview').hidden = true; trackPreview?.stop(); }
function chooseTrack(d, blurb) {
  chosenDef = d;
  let t; try { t = new Track(d); } catch { toast('That track could not be read.'); return; }
  if (!trackPreview) { try { trackPreview = new EditorPreview($('menu-track-canvas')); } catch { startDriving(d); return; } }
  $('menu-track-name').textContent = d.name; $('menu-track-blurb').textContent = blurb;
  $('menu-track-preview').hidden = false; document.body.classList.add('track-chosen');
  trackPreview.setTrack(t); trackPreview.spin = true; trackPreview.play();
  $('menu-track-preview').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function renderMenu() {
  hideTrackPreview();
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
    row(d.name, `${(t.length / 1000).toFixed(1)} km. ${TEMPLATE_INFO[k]}`, '', [['Choose', () => chooseTrack(d, `${(t.length / 1000).toFixed(1)} km. ${TEMPLATE_INFO[k]}`)], ['Edit', () => openEditor(d)]]);
  }
  for (const [name, d] of Object.entries(userTracks())) {
    let km = '?'; try { km = (new Track(d).length / 1000).toFixed(1); } catch { /* broken file */ }
    row(name, `${km} km. Made in the editor`, 'mine', [
      ['Choose', () => chooseTrack(d, `${km} km. Made in the editor`)], ['Edit', () => openEditor(d)],
      ['Delete', () => { const a = userTracks(); delete a[name]; store.set('cr.tracks', a); renderMenu(); }, 'danger'],
    ]);
  }
}

function bindMenu() {
  $('menu-track-go').onclick = () => { if (chosenDef) { const d = chosenDef; hideTrackPreview(); startDriving(d); } };
  $('menu-track-back').onclick = hideTrackPreview;
  const bindOpt = (id, key, fn) => { const el = $(id); el.checked = key === 'sfx' ? sound.sfxOn : key === 'music' ? sound.musicOn : opts[key]; el.onchange = () => { fn(el.checked); store.set('cr.opts', opts); }; };
  { const co = $('caravan-opt'), cb = $('opt-caravan');          // The caravan option (a card in the vehicle gallery; the Saloon, Volvo, Saab and BMW can tow it)
    co.hidden = true; cb.checked = !!opts.caravan && TOW_CARS.includes(selectedVehicle().id);   // the checkbox just holds the state; the Hastings 2000 card in the vehicle gallery is the control
    cb.onchange = () => { opts.caravan = cb.checked; store.set('cr.opts', opts); syncCaravan(); if (track) derbyStart(); toast(cb.checked ? 'Caravan hitched up!' : 'Caravan unhitched.'); };
  }
  bindOpt('opt-assist', 'assist', (v) => { opts.assist = v; car.opts.assist = v ? 0.7 : 0; });
  const hd = $('opt-handling'); hd.value = opts.handling === 'standard' ? 'standard' : 'arcade';
  hd.onchange = () => { opts.handling = hd.value === 'standard' ? 'standard' : 'arcade'; car.opts.stability = opts.handling === 'standard' ? 0 : 1; store.set('cr.opts', opts); };
  const SKILL = { easy: 0.2, normal: 0.5, hard: 0.75, expert: 1 };
  const skillOf = (v) => (v in SKILL ? v : 'hard');
  const sk = $('opt-skill'); sk.value = skillOf(opts.skill); derby.skill = SKILL[sk.value];
  sk.onchange = () => { opts.skill = skillOf(sk.value); derby.skill = SKILL[opts.skill]; store.set('cr.opts', opts); toast('Rivals: ' + sk.options[sk.selectedIndex].text.split(' - ')[0]); sk.blur(); };
  const md = $('opt-mode'); md.value = opts.mode === 'demolition' ? 'demolition' : 'race';
  md.onchange = () => { opts.mode = md.value === 'demolition' ? 'demolition' : 'race'; store.set('cr.opts', opts); if (track) derbyStart(); };
  const rv = $('opt-rivals'); rv.value = String(opts.rivals);
  rv.onchange = () => { opts.rivals = +rv.value; store.set('cr.opts', opts); if (track) derbyStart(); };
  $('go-again').onclick = () => { hud.hideGameOver(); restartRace(); };
  $('go-menu').onclick = () => showMenu();
  bindOpt('opt-kmh', 'kmh', (v) => { opts.kmh = v; hud.setUnits(v); });
  bindOpt('opt-shadow', 'shadow', (v) => { opts.shadow = v; stage.setShadows(v); });
  // Graphics quality: antialiasing, shadow type/size and texture filtering are fixed when the page loads, so a change reloads it.
  const qsel = $('opt-quality'); qsel.value = TIER_NAMES.includes(opts.quality) ? opts.quality : 'auto';
  const csel = $('opt-chat'); csel.value = ['all', 'quick', 'off'].includes(opts.chat) ? opts.chat : 'all';
  csel.onchange = () => { opts.chat = csel.value; store.set('cr.opts', opts); chatUI.applyMode(); };
  qsel.onchange = () => {
    opts.quality = qsel.value; store.set('cr.opts', opts);
    if (net) { toast('Graphics quality will change next time the game loads.'); return; }   // don't drop a multiplayer room
    location.reload();
  };
  bindOpt('opt-sfx', 'sfx', (v) => { sound.setEnabled('sfx', v); syncSoundUI(); });
  bindOpt('opt-music', 'music', (v) => { if (v) sound.init(); sound.setEnabled('music', v); syncSoundUI(); });
  const sw = $('swatches');
  PAINTS.forEach(([name, hex], i) => {
    const b = document.createElement('button'); b.type = 'button'; b.title = name; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name);
    b.style.background = '#' + hex.toString(16).padStart(6, '0'); b.setAttribute('aria-checked', String(i === opts.paint));
    b.onclick = () => { opts.paint = i; visual.setPaint(hex); store.set('cr.opts', opts); [...sw.children].forEach((c, j) => c.setAttribute('aria-checked', String(j === i))); };
    sw.appendChild(b);
  });
  $('btn-new').onclick = () => { const d = makeTemplate('speedway'); d.name = 'My track'; openEditor(d); };
  $('btn-play-now').onclick = () => startDriving(makeRandomTrack());
  $('btn-new-top').onclick = () => $('btn-new').click();                          // the same Design-a-track! button, up with the others
  $('btn-multiplayer-top').onclick = () => $('btn-multiplayer').click();         // the same Multiplayer button, up beside Buckle up!
  $('import-file').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const d = normalizeTrack(JSON.parse(await f.text())); new Track(d);
      saveUserTrack(d); renderMenu(); toast(`Imported "${d.name}".`);
    } catch { toast('That file is not a valid track.'); }
  };
}

// -------------------------------------------------------------- multiplayer
const mpLabelV = new THREE.Vector3();
const MP_DAMAGE_HP_SCALE = 140 * TOUGHNESS; // derby crash HP converted onto multiplayer's single 0..1 health bar
const mpRaceLaps = () => Math.max(1, Math.min(3, Math.round(window.__raceLaps?.get?.() || 1)));  // host-selected multiplayer race length
const MP_WRECKED_INPUT = Object.freeze({ throttle: 0, brake: 0, steer: 0, handbrake: true, boost: false });   // a wrecked car just sits there
const MP_MAX_HIT_DAMAGE = 0.4;        // even the hardest single hit can't wreck you outright
const MP_BARREL_DAMAGE = 0.35;        // health a barrel takes off at point blank (inside 2 m), falling to nothing at 10 m
/** A crash has marked our own car at world point (x, y, z), `hp` hit points' worth: dent it here, and tell everyone else so their
 *  copy of our car shows the same dent. Only the owner decides - each player dents their own car - so nobody gets a double dent. */
let mpDentSentAt = 0;
function mpDentAt(x, y, z, hp) {
  if (!(hp >= DENT.minHp)) return;
  car.refreshFrame();
  const dx = x - car.pos.x, dy = y - car.pos.y, dz = z - car.pos.z;
  const lx = dx * car.ax.x + dy * car.ax.y + dz * car.ax.z, ly = dx * car.ay.x + dy * car.ay.y + dz * car.ay.z, lz = dx * car.az.x + dy * car.az.y + dz * car.az.z;
  if (visual.loaded) visual.addDent(lx, ly, lz, hp);
  const now = performance.now();
  if (net && now - mpDentSentAt > 90) {
    mpDentSentAt = now;
    net.sendDent({ x: +lx.toFixed(2), y: +ly.toFixed(2), z: +lz.toFixed(2), hp: +Math.min(hp, 100).toFixed(1) });
  }
}
/** The car has been put back together (we respawned): clear our dents here and on everyone else's screen. */
function mpClearDents() { visual.clearDents(); net?.sendDent({ clear: true }); }

/** Sound, sparks and a bit of smoke for a multiplayer ram - shared by both the rammer's and the
 *  target's side, so it feels and sounds the same crash from either end. */
function mpImpactFx(x, y, z, speed) {
  sound.hit(speed, 'car');
  chase.impact(speed);
  crashDebris(x, y, z, speed, rivalPaint());
  for (let i = 0, n = Math.min(8, 3 + speed * 0.3); i < n; i++) particles.spark(x, y, z, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, (Math.random() - 0.5) * 4);
  for (let i = 0; i < 3; i++) particles.puff(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1.2 + Math.random() * 0.6, 1 + Math.random() * 0.5, 0x9a9498);
}
/** Take health off the local player. Returns true if this was the blow that finished them (they explode). */
function mpTakeDamage(amount) {
  if (life.damage(amount, simTime) !== 'died') return false;
  mpExplodeAt(car.pos.x, car.pos.y, car.pos.z); wheelFlyers.launch(visual, car.vel);
  hud.banner('Wrecked! Back in a moment...', LIFE.respawnDelay * 1000);
  return true;
}
/** A barrel has gone off on our copy of the track: tell everyone else (unless we only set it off because
 *  they told us to), and hurt ourselves if we're close - the derby's falloff, on the one shared health bar. */
function mpBarrelBlast(e) {
  if (e.i != null && !mpBoomSeen.has(e.i)) { mpBoomSeen.add(e.i); net.sendBoom(e.i); }
  const d = Math.hypot(car.pos.x - e.x, car.pos.y - e.y, car.pos.z - e.z), frac = blastFraction(DAMAGE.barrel, d);
  if (frac > 0) mpTakeDamage(MP_BARREL_DAMAGE * frac);
}
/** A player's health has just hit zero - the same fireball, scorch mark and explosion sound a barrel gives,
 *  wherever the car actually is (yours, or a remote player's last known position). */
function mpExplodeAt(x, y, z, dist = 0) {
  particles.blast(x, y, z);
  crashDebris(x, y + 0.4, z, 20, rivalPaint(), 0, 0, 2.6);
  scorch.add(x, y, z, 0, 1, 0, 2.6);
  sound.explode(dist);
}

/** Push the local car out of any remote car it's overlapping, and kill the closing speed - then, if we hit
 *  them hard enough, tell them about it so their end applies a matching shove. Still not real physics (we
 *  only ever see their last reported position), but both sides now actually react. */
function mpCollideLocal() {
  const now = performance.now();
  const mine = multiplayerVehicleSpec(selectedVehicle().id);
  for (const [id, p] of remotePlayers) {
    if (!p.cur) continue;
    const info = net?.players.get(id);
    const theirs = multiplayerVehicleSpec(info?.vehicleId);
    if (Math.abs(car.pos.y - p.cur.y) > 3) continue;             // not roughly level - a jump, most likely
    // Each car is a rectangle (its real length and width) turned to face where it is heading. Two rectangles overlap unless some
    // axis separates them; the least-overlapping axis is the way out. (Circles sized by width alone let a long van merge into a short car.)
    const c = p.cur, mfx = car.az.x, mfz = car.az.z;
    const tfx = 2 * (c.qx * c.qz + c.qw * c.qy), tfz = 1 - 2 * (c.qx * c.qx + c.qy * c.qy);
    const ml = Math.hypot(mfx, mfz) || 1, tl = Math.hypot(tfx, tfz) || 1;
    const A = [mfx / ml, mfz / ml], B = [tfx / tl, tfz / tl];
    const dx = car.pos.x - c.x, dz = car.pos.z - c.z;
    if (dx * dx + dz * dz > 64) continue;                         // more than 8 m apart: nowhere near touching
    const mhl = mine.length * 0.48, mhw = mine.width * 0.48, thl = theirs.length * 0.48, thw = theirs.width * 0.48;
    const hit = obbOverlap(dx, dz, A, B, mhl, mhw, thl, thw);
    if (!hit) continue;
    const { overlap, nx, nz } = hit;
    const totalMass = mine.mass + theirs.mass;
    const myShare = theirs.mass / totalMass;
    const theirShare = mine.mass / totalMass;
    car.pos.x += nx * overlap * myShare;
    car.pos.z += nz * overlap * myShare;

    // Relative closing speed uses both cars' network velocities. This means a stationary target
    // still recognises a fast incoming ram instead of relying on the attacker's client to report it.
    const rvx = car.vel.x - (+p.cur.vx || 0);
    const rvz = car.vel.z - (+p.cur.vz || 0);
    const vn = rvx * nx + rvz * nz;
    const closing = Math.max(0, -vn);
    if (closing > 0) {
      const mu = mine.mass * theirs.mass / totalMass;
      const restitution = closing > 2 ? 0.18 : 0;
      const impulse = (1 + restitution) * closing * mu;
      const myDv = Math.min(18, impulse / mine.mass);
      car.vel.x += nx * myDv;
      car.vel.z += nz * myDv;
    }

    if (net && closing > 1 && now - (p.lastHitSent || 0) > 250) {
      net.sendHit(id, {
        nx: -nx, nz: -nz,
        overlap: overlap * theirShare,
        speed: Math.min(30, closing),
        attackerVehicleId: mine.id,
      });
      p.lastHitSent = now;
      mpImpactFx((car.pos.x + p.cur.x) / 2, car.pos.y + 0.6, (car.pos.z + p.cur.z) / 2, closing);
    }
  }
}

/** Caravans and other players' cars (see mpVanContacts.js): each side moves only what it owns. */
const mpFwd = new THREE.Vector3(), mpQ = new THREE.Quaternion();
function mpVanContacts() {
  if (!net) return;
  const mine = multiplayerVehicleSpec(selectedVehicle().id), van = car.tow;
  if (van) car.refreshFrame();
  for (const [id, p] of remotePlayers) {
    const c = p.cur; if (!c || c.alive === false) continue;
    const theirs = multiplayerVehicleSpec(net.players.get(id)?.vehicleId);
    mpFwd.set(0, 0, 1).applyQuaternion(mpQ.set(c.qx, c.qy, c.qz, c.qw));
    if (van) { const hit = remoteCarHitsVan(van, c, mpFwd.x, mpFwd.z, theirs); if (hit && hit.closing > 1.5) van.struck('car', hit.closing, hit.x, van.pos.y + 0.5, hit.z, crashDamage(hit.mu, hit.closing) * van.spec.carMul); }
    carHitsRemoteVan(car, c.van, caravan.spec, mine);
  }
}
function mpMakeView(hue) {
  let v = (mpViewPool[hue] || (mpViewPool[hue] = [])).pop();
  if (!v) { v = new CarVisual(stage.scene, car.restHeight); v.setPaint(RIVAL_LOOKS[hue].tint); v.hue = hue; }
  v.root.visible = true; v.root.scale.setScalar(1); v.clearDents();
  return v;
}
function mpDropVan(p) { if (p.vanView) { p.vanView.root.removeFromParent(); p.vanView = null; } }
function mpReleasePlayer(p) {
  mpDropVan(p);
  if (p.view) { p.view.root.visible = false; (mpViewPool[p.view.hue] || (mpViewPool[p.view.hue] = [])).push(p.view); p.view = null; }
  if (p.label) { p.label.remove(); p.label = null; }
}
function mpTeardown() {
  chatUI.setActive(false);
  clearSavedRoom();                                           // leaving on purpose: nothing to resume
  if (!net && !remotePlayers.size) return;
  for (const p of remotePlayers.values()) mpReleasePlayer(p);
  remotePlayers.clear();
  if (net) { net.leave(); net = null; }
  visual.setOwnLook(null);                                    // back to your own paint
}
/** What the others need to draw our caravan: where it is, how it is turned and rocking, its wheel angle and health (a fraction). */
const r3 = (v) => Math.round(v * 1000) / 1000;
function mpVanState(v) { return [r3(v.axle.x), r3(v.axle.y), r3(v.axle.z), r3(v.yaw), r3(v.pitch), r3(v.roll), r3(v.spin % 6.2832), r3(v.sway), r3(v.health / v.spec.hp)]; }
const mpVanObj = (a) => ({ axle: { x: a[0], y: a[1], z: a[2] }, yaw: a[3], pitch: a[4], roll: a[5], spin: a[6], sway: a[7], health: a[8], spec: { hp: 1 } });
/** Another player's caravan, drawn between the same two reports as their car. */
function mpSyncVan(p, a0, a1, rt, k) {
  const v1 = a1.s.van;
  if (!v1 || !Array.isArray(v1) || v1.length < 9 || !v1.every(Number.isFinite)) { mpDropVan(p); return; }
  if (!p.vanView) {
    if (!caravanView.loaded) { caravanView.load(); return; }
    p.vanView = caravanView.cloneFor(stage.scene, RIVAL_LOOKS[p.hue]);
  }
  const v0 = a0.s.van && a0.s.van.length >= 9 && a0.s.van.every(Number.isFinite) ? a0.s.van : v1;
  const w = p.vanView; w._prev = w._cur = null;
  if (rt >= a1.t) { w.capture(mpVanObj(v1)); w.capture(mpVanObj(v1)); w.update(1); }
  else { w.capture(mpVanObj(v0)); w.capture(mpVanObj(v1)); w.update(k); }
  if (w.wrecked && !w._wheelsOff) wheelFlyers.launch(w, null, 0.7);
  w.root.visible = p.view.root.visible;
}
/** Move each remote player's car towards its latest reported state and keep its name label placed. */
function mpSyncRemote() {
  const now = performance.now();
  for (const p of remotePlayers.values()) {
    if (!p.cur || !p.buf || !p.buf.length) continue;
    if (!p.view) p.view = mpMakeView(p.hue);
    if (!p.view.loaded && visual.loaded) p.view.adopt(visual, RIVAL_LOOKS[p.hue]);
    const c = p.cur, b = p.buf;
    // Draw the car a little in the past (MP_DELAY), between two real reports, so a late or bunched-up packet doesn't make it jump:
    // the sender's clock is mapped onto ours with p.off (the quickest the packets have been getting here).
    const rt = now - (p.off || 0) - MP_DELAY;
    let i = b.length - 1; while (i > 0 && b[i - 1].t > rt) i--;
    const a0 = b[Math.max(0, i - 1)], a1 = b[i];
    let x, y, z, vk = 1;
    if (rt >= a1.t) {                                              // ahead of the newest report: carry on at its speed for a moment, then hold
      const dt = Math.min(0.2, (rt - a1.t) / 1000), s1 = a1.s;
      x = s1.x + (+s1.vx || 0) * dt; y = s1.y + (+s1.vy || 0) * dt; z = s1.z + (+s1.vz || 0) * dt;
      qa.set(s1.qx, s1.qy, s1.qz, s1.qw); p.view.root.quaternion.copy(qa);
    } else {
      const span = Math.max(1, a1.t - a0.t), k = Math.max(0, Math.min(1, (rt - a0.t) / span)), s0 = a0.s, s1 = a1.s;
      vk = k;
      x = lerp(s0.x, s1.x, k); y = lerp(s0.y, s1.y, k); z = lerp(s0.z, s1.z, k);
      qa.set(s0.qx, s0.qy, s0.qz, s0.qw); qb.set(s1.qx, s1.qy, s1.qz, s1.qw);
      p.view.root.quaternion.slerpQuaternions(qa, qb, k);
    }
    p.view.root.position.set(x, y, z);
    p.view.setLook(c.alive === false ? 0.15 : 1, 0);
    const dx = p.view.root.position.x - camera.position.x, dz = p.view.root.position.z - camera.position.z;
    const d2 = dx * dx + dz * dz;
    p.view.root.visible = d2 < 300 * 300;   // 200,000 triangles each: skip the far ones, same as AI rivals
    if (tier.lodDist) p.view.setFar(d2 > (p.view._far ? tier.lodDist * 0.7 : tier.lodDist) ** 2);
    mpSyncVan(p, a0, a1, rt, vk);
    if (!p.label) {
      p.label = document.createElement('div'); p.label.className = 'mp-label';
      const nameEl = document.createElement('div'); nameEl.className = 'mp-name'; nameEl.textContent = p.name;
      const bar = document.createElement('div'); bar.className = 'mp-health';
      p.healthFill = document.createElement('div'); p.healthFill.className = 'mp-health-fill';
      bar.appendChild(p.healthFill); p.label.append(nameEl, bar); $('mp-labels').appendChild(p.label);
    }
    const health = c.health ?? 1;
    if (health <= 0 && !p.exploded) { p.exploded = true; wheelFlyers.launch(p.view, null, 0.8); mpExplodeAt(p.view.root.position.x, p.view.root.position.y, p.view.root.position.z, camera.position.distanceTo(p.view.root.position)); }
    else if (health > 0) p.exploded = false;
    p.healthFill.style.width = Math.round(health * 100) + '%';
    p.healthFill.style.background = health > 0.5 ? '#6bd66b' : health > 0.2 ? '#e8b13a' : '#d94b3a';
    mpLabelV.set(p.view.root.position.x, p.view.root.position.y + 2.6, p.view.root.position.z);
    const dist = camera.position.distanceTo(p.view.root.position);
    camera.updateMatrixWorld();
    mpLabelV.project(camera);
    if (mpLabelV.z > 1 || dist > 220) { p.label.style.display = 'none'; continue; }
    p.label.style.display = ''; p.label.style.opacity = String(Math.max(0.15, 1 - dist / 220));
    const lx = (mpLabelV.x * 0.5 + 0.5) * innerWidth;
    p.label.style.left = (p.bubble ? Math.min(Math.max(lx, 110), innerWidth - 110) : lx) + 'px';   // keep a speech bubble on screen
    p.label.style.top = (-mpLabelV.y * 0.5 + 0.5) * innerHeight + 'px';
  }
}
function mpShow(id) {
  for (const s of ['mp-home', 'mp-join', 'mp-lobby']) $(s).hidden = s !== id;
  for (const e of ['mp-home-error', 'mp-join-error', 'mp-lobby-error']) $(e).hidden = true;
}
function mpErr(id, msg) { const el = $(id); el.textContent = msg; el.hidden = false; }
function mpRenderLobby(players, hostId) {
  const ul = $('mp-players'); ul.innerHTML = '';
  let differs = false;
  for (const p of players) {
    const li = document.createElement('li'); li.textContent = p.name;
    const vh = document.createElement('span'); vh.className = 'mp-vehicle-tag'; vh.textContent = ` \u00b7 ${vehicleById(p.vehicleId).name}${p.caravan ? ' + caravan' : ''}`; li.appendChild(vh);
    if (p.id === hostId) { const tag = document.createElement('span'); tag.className = 'mp-host-tag'; tag.textContent = '(host)'; li.appendChild(tag); }
    if (p.v !== VERSION) {                                   // a different (or, for older games, unreported) version: chat and newer features may not work for them
      const old = document.createElement('span'); old.className = 'mp-old-tag'; old.textContent = p.v ? `(v${p.v})` : '(older version)'; li.appendChild(old);
      differs = true;
    }
    ul.appendChild(li);
  }
  $('mp-version-warning').hidden = !differs;
  if (net) {
    $('mp-start').hidden = !net.isHost;
    $('mp-start').disabled = players.length < 2;
    $('mp-need-more').hidden = !net.isHost || players.length >= 2;
    $('mp-waiting').hidden = net.isHost;
    const host = players.find((p) => p.id === hostId);
    $('mp-waiting').textContent = host ? `Connected! Waiting for ${host.name} to start the game\u2026` : 'Waiting for the host\u2026';
    $('mp-track-field').hidden = !net.isHost;
    $('mp-track-fixed').hidden = net.isHost;
    if (net.isHost) { $('mp-laps').value = String(mpRaceLaps()); mpSendOpts(); }
  }
}
/** Tell the other players which track and how many laps the host has picked (shown in their lobby). */
function mpSendOpts() {
  if (!net || !net.isHost) return;
  const sel = $('mp-track'), name = sel.options[sel.selectedIndex]?.text || '';
  net._sendAll({ t: 'opts', track: name, laps: mpRaceLaps() });
}
function mpBeginDrive(trackDef) {
  life.reset(); mpFinished = false; mpRaceStart = null; mpBoomSeen.clear();
  const mine = net.players.get(net.selfId);
  startDriving(trackDef || makeTemplate('speedway'));
  if (mine) visual.setOwnLook(RIVAL_LOOKS[mine.hue]);       // your car, in the colour everyone else sees you in
  mpPlaceOnGrid();
  hud.banner(`Room ${net.roomCode} \u00b7 ${net.players.size} drivers`, 2200);
}
/** Give each human player their own spot on the starting grid, same idea as the AI rivals' grid:
 *  a couple of cars per row, side by side. The order is sorted by peer id so every client computes
 *  the identical layout without needing to agree over the network. */
function mpPlaceOnGrid() {
  const roster = [...net.players.values()].sort((a, b) => a.id.localeCompare(b.id));
  const myIndex = Math.max(0, roster.findIndex((p) => p.id === net.selfId));
  const perRow = 2, row = Math.floor(myIndex / perRow), col = myIndex % perRow;
  const cols = Math.min(perRow, roster.length - row * perRow);
  const L = track.length;
  const rowGap = roster.some((p) => p.caravan) ? 14 : 8;            // caravans trail behind: leave room for them
  let s = track.startS(12) + row * rowGap; s = ((s % L) + L) % L;
  const lane = Math.max(2, track.frameAt(s).hw - 3);
  const off = cols > 1 ? (col - (cols - 1) / 2) * lane * 0.85 : 0;
  placeCar(s, off, 0);
}
// ----- keeping a hosted room across a page reload (the phone threw the tab away while you were in another app)
const ROOM_KEY = 'cr.mproom', ROOM_TTL = 15 * 60 * 1000;
const savedRoom = () => { const r = store.get(ROOM_KEY, null); return r && r.code && r.name && Date.now() - r.t < ROOM_TTL ? r : null; };
const saveRoom = (code, name) => store.set(ROOM_KEY, { code, name, t: Date.now() });
function clearSavedRoom() { try { localStorage.removeItem(ROOM_KEY); } catch { /* storage blocked */ } }
setInterval(() => { if (net && net.isHost && !net.started && net.selfName) saveRoom(net.roomCode, net.selfName); }, 30000);   // keep it fresh while you wait in the lobby
function updateResume() {
  const r = savedRoom(), b = $('mp-resume');
  b.hidden = !r; if (r) b.textContent = `Resume your room (${r.code})`;
}
/** A line of status in the multiplayer screens ("Reconnecting...", "The host is away..."); null clears it. */
function mpStatus(text) { const e = $('mp-status'); e.textContent = text || ''; e.hidden = !text; }

// ----- chat (see src/chat.js and src/mpChat.js)
const hueCss = (hue) => (hue != null && RIVAL_LOOKS[hue] ? '#' + RIVAL_LOOKS[hue].tint.toString(16).padStart(6, '0') : '#f6d9b0');
const chatUI = createChatUI({
  send: (m) => !!(net && net.sendChat(m)),
  nameOf: (id) => (net && net.players.get(id) ? net.players.get(id).name : 'Driver'),
  colorOf: (id) => hueCss(net && net.players.get(id) ? net.players.get(id).hue : null),
  isSelf: (id) => !!net && id === net.selfId,
  bubble: (id, text) => mpShowBubble(id, text),
  getMode: () => opts.chat,
  toast,
});
/** A speech bubble over a remote player's car (their name label already follows the car). */
function mpShowBubble(id, text) {
  const p = remotePlayers.get(id);
  if (!p || !p.label) return;
  if (p.bubble) { p.bubble.remove(); clearTimeout(p.bubbleTimer); }
  const b = document.createElement('div'); b.className = 'mp-bubble'; b.textContent = text;
  p.label.prepend(b); p.bubble = b;
  p.bubbleTimer = setTimeout(() => { b.remove(); if (p.bubble === b) p.bubble = null; }, 4500);
}

const mpHandlers = {
  version: () => VERSION,                                      // read when joining, not at load: version.js is still loading when this file runs
  onChat: (id, m) => chatUI.receive(id, m),
  onStatus: (text) => mpStatus(text),
  onLobby: (players, hostId) => mpRenderLobby(players, hostId),
  onOpts: (o) => { $('mp-track-fixed').textContent = `The host picked: ${o.track} \u00b7 ${o.laps} ${o.laps === 1 ? 'lap' : 'laps'}`; },
  onStart: (trackDef) => mpBeginDrive(trackDef),
  onState: (id, s) => {
    if (id === net.selfId) return;
    let p = remotePlayers.get(id);
    if (!p) { const info = net.players.get(id); p = { name: info ? info.name : 'Driver', hue: info ? info.hue : 0 }; remotePlayers.set(id, p); }
    const rx = performance.now(), ts = Number.isFinite(s.ts) ? s.ts : rx;
    if (!p.buf || (p.cur && Math.hypot(s.x - p.cur.x, s.z - p.cur.z) > 15)) p.buf = [];   // a respawn (or back-on-road), not driving: snap, don't slide
    const sample = rx - ts;
    p.off = p.off == null ? sample : sample < p.off ? sample : p.off + (sample - p.off) * 0.02;   // follows the quickest packets, creeping up slowly if the connection slows
    p.buf.push({ t: ts, s }); if (p.buf.length > 24) p.buf.shift();
    p.cur = s; p.recvAt = rx;
  },
  onPlayerLeft: (id) => {
    const p = remotePlayers.get(id);
    if (p) {
      // A departing player's car goes out with a bang at its last known position instead of just vanishing.
      // Use the rendered position when available so the explosion lines up with what this client is actually seeing.
      const pos = p.view?.root?.position || p.cur;
      if (pos && Number.isFinite(pos.x + pos.y + pos.z)) {
        mpExplodeAt(pos.x, pos.y + 0.35, pos.z, camera.position.distanceTo(new THREE.Vector3(pos.x, pos.y, pos.z)));
      }
      mpReleasePlayer(p);
      remotePlayers.delete(id);
    }
  },
  onBoom: (fromId, i) => { if (!mpBoomSeen.has(i)) { mpBoomSeen.add(i); props.igniteRemote(i); } },
  onHit: (fromId, d) => {
    const speed = Math.min(30, Math.max(0, +d.speed || 0)), overlap = Math.max(0, +d.overlap || 0);
    const victim = multiplayerVehicleSpec(selectedVehicle().id);
    const attackerInfo = net?.players.get(fromId);
    const attacker = multiplayerVehicleSpec(attackerInfo?.vehicleId || d.attackerVehicleId);
    const totalMass = victim.mass + attacker.mass;
    const mu = victim.mass * attacker.mass / totalMass;

    car.pos.x += d.nx * overlap;
    car.pos.z += d.nz * overlap;

    const restitution = speed > 2 ? 0.18 : 0;
    const impulse = (1 + restitution) * speed * mu;
    const dv = Math.min(18, impulse / victim.mass);
    car.vel.x += d.nx * dv;
    car.vel.z += d.nz * dv;

    // Same energy-based crash curve as the derby, converted to the multiplayer health bar.
    // The selected vehicle's multiplayer toughness then scales what actually gets through.
    const rawHp = crashDamage(mu, speed);
    const amount = Math.min(MP_MAX_HIT_DAMAGE, (rawHp / MP_DAMAGE_HP_SCALE) * victim.damageMul);
    mpDentAt(car.pos.x - d.nx, car.pos.y + 0.15, car.pos.z - d.nz, rawHp);        // marked on the side that faces whoever hit us
    if (!mpTakeDamage(amount)) mpImpactFx(car.pos.x, car.pos.y + 0.6, car.pos.z, speed);
  },
  onDent: (fromId, d) => {
    const p = remotePlayers.get(fromId); if (!p || !p.view) return;
    if (d.clear) p.view.clearDents();
    else if (p.view.loaded) p.view.addDent(d.x, d.y, d.z, d.hp);
  },
  onError: (msg) => { toast(msg); showMenu(); },
};
function bindMultiplayer() {
  $('mp-track').innerHTML = TEMPLATE_KEYS.map((k) => `<option value="${k}">${k === 'random' ? 'Random circuit' : makeTemplate(k).name}</option>`).join('');
  $('mp-track').value = 'random';
  // the same track and laps choice up on the first multiplayer screen, so the host sets the game up before creating the room
  $('mp-home-track').innerHTML = $('mp-track').innerHTML;
  const savedTrack = store.get('cr.mptrack', 'random');
  $('mp-home-track').value = TEMPLATE_KEYS.includes(savedTrack) ? savedTrack : 'random';
  $('mp-home-laps').value = String(mpRaceLaps());
  const homeToLobby = () => { $('mp-track').value = $('mp-home-track').value; store.set('cr.mptrack', $('mp-home-track').value); window.__raceLaps?.set?.(+$('mp-home-laps').value); $('mp-laps').value = $('mp-home-laps').value; mpSendOpts(); };
  $('mp-home-track').onchange = homeToLobby; $('mp-home-laps').onchange = homeToLobby;
  homeToLobby();
  $('btn-multiplayer').onclick = () => { setMode('mp'); mpShow('mp-home'); $('mp-name').value = store.get('cr.mpname', ''); updateResume(); };
  $('mp-back').onclick = () => { clearSavedRoom(); showMenu(); };
  $('mp-create').onclick = async () => {
    const name = $('mp-name').value.trim();
    if (!name) { mpErr('mp-home-error', 'Enter your name first.'); return; }
    store.set('cr.mpname', name);
    $('mp-create').disabled = true;
    try { net = new Multiplayer(mpHandlers); const code = await net.createRoom(name); saveRoom(code, name); chatUI.setActive(true); mpShow('mp-lobby'); $('mp-room-code').textContent = code; mpRenderLobby([...net.players.values()], net.selfId); }
    catch (e) { mpErr('mp-home-error', e.message); net = null; }
    $('mp-create').disabled = false;
  };
  $('mp-resume').onclick = async () => {
    const r = savedRoom(); if (!r) { updateResume(); return; }
    $('mp-resume').disabled = true; $('mp-create').disabled = true;
    try {
      net = new Multiplayer(mpHandlers);
      const code = await net.createRoom(r.name, r.code);
      saveRoom(code, r.name); chatUI.setActive(true); mpStatus(null); mpShow('mp-lobby'); $('mp-room-code').textContent = code; mpRenderLobby([...net.players.values()], net.selfId);
    } catch (e) { mpStatus(null); mpErr('mp-home-error', e.message); net = null; }
    $('mp-resume').disabled = false; $('mp-create').disabled = false;
  };
  $('mp-join-show').onclick = () => { mpShow('mp-join'); $('mp-join-name').value = store.get('cr.mpname', ''); };
  $('mp-join-go').onclick = async () => {
    const name = $('mp-join-name').value.trim(), code = $('mp-code').value.trim();
    if (!name) { mpErr('mp-join-error', 'Enter your name first.'); return; }
    if (!code) { mpErr('mp-join-error', 'Enter the room code.'); return; }
    store.set('cr.mpname', name);
    $('mp-join-go').disabled = true;
    try { net = new Multiplayer(mpHandlers); const joined = await net.joinRoom(code, name); chatUI.setActive(true); mpShow('mp-lobby'); $('mp-room-code').textContent = joined; }
    catch (e) { mpStatus(null); mpErr('mp-join-error', e.message); net = null; }
    $('mp-join-go').disabled = false;
  };
  $('mp-track').onchange = mpSendOpts;
  $('mp-laps').onchange = () => { window.__raceLaps?.set?.(+$('mp-laps').value); mpSendOpts(); };
  $('mp-start').onclick = () => {
    if (!net) return;
    const key = $('mp-track').value;
    clearSavedRoom();                                           // a started race is not something to resume
    net.startGame(key === 'random' ? makeRandomTrack() : makeTemplate(key));
  };
  const inviteUrl = () => `${location.origin}${location.pathname}?room=${net.roomCode}`;
  const copyInvite = async (url) => { try { await navigator.clipboard.writeText(url); toast('Invite link copied.'); } catch { toast(url); } };
  $('mp-copy').onclick = () => net && copyInvite(inviteUrl());
  // The phone's own share sheet: on an iPhone you can pick WhatsApp and send from inside the sheet, without leaving the game.
  $('mp-share').hidden = typeof navigator.share !== 'function';
  $('mp-share').onclick = async () => {
    if (!net) return;
    const url = inviteUrl();
    try { await navigator.share({ title: 'Bangers and Smash!', text: `Join my game of Bangers and Smash! Room ${net.roomCode}`, url }); }
    catch (e) { if (!(e && e.name === 'AbortError')) copyInvite(url); }
    finally {
      // iOS may briefly suspend the host while the native share sheet/WhatsApp is open.
      // Re-register the room with the PeerJS broker immediately when the host returns.
      net?.resume();
    }
  };
}

// ---------------------------------------------------------------------- boot
addEventListener('error', (e) => { const f = $('fatal'); f.hidden = false; f.textContent = 'Something broke:\n' + (e.error?.stack || e.message); });
addEventListener('unhandledrejection', (e) => { console.error(e.reason); });
document.addEventListener('visibilitychange', () => { last = performance.now(); if (!document.hidden && net) net.resume(); });
addEventListener('online', () => { if (net) net.resume(); });

bindMenu();
bindMultiplayer();
// Cache the heavy files (car models, sounds, three.js) so repeat visits - especially on mobile data - load fast.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
loadTrack(makeTemplate('speedway'));
renderMenu();
setMode('menu');
requestAnimationFrame(frame);

const params = new URLSearchParams(location.search);
if (params.get('track') && TEMPLATE_KEYS.includes(params.get('track'))) {
  const key = params.get('track'), d = key === 'random' ? makeRandomTrack() : makeTemplate(key);
  if (params.get('edit')) openEditor(d); else if (params.get('drive') !== '0') startDriving(d);
} else if (!params.get('room') && savedRoom()) {
  const r = savedRoom();                                        // you were hosting a room and the page went away: offer to bring it back
  setMode('mp'); mpShow('mp-home'); $('mp-name').value = r.name; updateResume();
} else if (params.get('room')) {
  setMode('mp'); mpShow('mp-join');
  $('mp-join-name').value = store.get('cr.mpname', '');
  $('mp-code').value = params.get('room').toUpperCase();
}

// ----- a track a friend sent as a link (see src/trackLink.js): offer to drive it, edit it or keep it
async function openSharedTrack(packed) {
  const d = await unpackTrack(packed);
  history.replaceState(null, '', location.pathname + location.search);            // so a reload does not ask again
  if (!d) { toast('That track link did not work. Ask your friend to send it again.'); return; }
  const box = $('shared-track'), close = () => { box.hidden = true; };
  const km = (new Track(d).length / 1000).toFixed(2);
  $('shared-title').textContent = d.name; $('shared-info').textContent = `${km} km lap`;
  $('shared-edit').hidden = matchMedia('(pointer: coarse)').matches;            // the editor needs a desktop computer
  $('shared-drive').onclick = () => { close(); startDriving(d); };
  $('shared-edit').onclick = () => { close(); openEditor(d); };
  $('shared-save').onclick = () => {
    const all = userTracks(); let name = d.name, n = 2;
    while (all[name]) name = `${d.name.slice(0, 34)} (${n++})`;                 // never overwrite a track you already have
    saveUserTrack({ ...d, name }); renderMenu(); toast(`Saved "${name}" to your tracks.`); close();
  };
  $('shared-close').onclick = close;
  box.hidden = false;
}
{ const packed = packedFromHash(location.hash); if (packed) openSharedTrack(packed); }

// What the story mode (storyMode.js) needs from the game: start a track, go back to the menu, hold the race still, read the settings.
window.__app = { sound, startDriving, showMenu, makeTemplate, opts, derby, freeze(v) { frozen = !!v; } };
