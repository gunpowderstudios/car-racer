// Car Racer - main entry. Wires physics, rendering, HUD, audio, menu and editor together.
import * as THREE from 'three';
import { Track, SURF, normalizeTrack, analyzeTrack } from './track.js';
import { Vehicle } from './vehicle.js';
import { V3 } from './math.js';
import { makeTemplate, TEMPLATE_KEYS, TEMPLATE_INFO } from './templates.js';
import { Stage } from './stage.js';
import { CarVisual, ChaseCamera } from './carVisual.js';
import { SkidMarks, Particles } from './effects.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Hud, fmtTime } from './hud.js';
import { Editor } from './editor.js';

const $ = (id) => document.getElementById(id);
const DT = 1 / 120;
const PAINTS = [['Tail-light red', 0xd9482b], ['Sodium yellow', 0xe8b02a], ['Racing green', 0x2f6b4a], ['Police white', 0xe4e1d8], ['Midnight', 0x2a2f5c]];

// ------------------------------------------------------------------ storage
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } },
};
const opts = Object.assign({ assist: true, kmh: false, shadow: true, paint: 0 }, store.get('cr.opts', {}));
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
const hud = new Hud(); hud.setUnits(opts.kmh);
const sound = new Sound();

let mode = 'menu', track = null, def = null, hasPlayed = false;
let paused = false;
const prevPos = new THREE.Vector3(), curPos = new THREE.Vector3(), prevQ = new THREE.Quaternion(), curQ = new THREE.Quaternion();
const drawPos = new THREE.Vector3(), drawQ = new THREE.Quaternion(), velV = new THREE.Vector3();
let acc = 0, last = performance.now(), simTime = 0, fps = 60, orbit = 0;
let throttleNow = 0, wallSpot = null;
const race = { unwrapped: 0, max: 0, lastS: null, index: -1, lapStart: null, laps: 0, best: null, reverseT: 0, lastTime: null };
const safe = { s: 0, off: 0, t: 0 };
const trouble = { flipped: 0, lost: 0 };

const input = new Input({
  onReset: () => mode === 'drive' && respawn(),
  onCamera: () => mode === 'drive' && hud.banner(chase.cycle() + ' camera', 900),
  onMenu: () => (mode === 'drive' ? showMenu() : null),
  onEditor: () => mode === 'drive' && openEditor(def),
  onDebug: () => { const d = $('debug'); d.hidden = !d.hidden; },
  onMusic: () => { sound.setEnabled('music', !sound.musicOn); syncSoundUI(); },
});

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

// --------------------------------------------------------------------- track
function loadTrack(newDef) {
  def = normalizeTrack(newDef);
  track = new Track(def);
  stage.setTrack(track);
  hud.buildMap(track);
  skid.clear(); particles.clear();
  race.best = store.get('cr.best', {})[bestKey(track)] ?? null;
  race.laps = 0; race.lapStart = null; race.lastTime = null;
  placeCar(track.startS(12), 0, 0);
  window.__game = { car, camera, visual, get track() { return track; }, race, opts, renderer, stage, sim, respawn };
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

function respawn() {
  const hw = track.hw[Math.floor(safe.s / track.ds) % track.n];
  placeCar((safe.s - 6 + track.length) % track.length, Math.max(-hw + 4, Math.min(hw - 4, safe.off)), 0, true);
  race.reverseT = 0;
  hud.banner('Back on the road', 1000);
}

/** Advance the simulation by `seconds` without rendering (used by automated tests). */
function sim(seconds, inp) {
  const full = { throttle: 0, brake: 0, steer: 0, handbrake: false, ...inp };
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    car.step(DT, typeof inp === 'function' ? inp(i * DT) : full, track); simTime += DT; car.events.length = 0;
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
  const inp = input.read();
  throttleNow = inp.throttle;
  acc += dt; let n = 0;
  while (acc >= DT && n < 6) {
    prevPos.copy(curPos); prevQ.copy(curQ);
    car.step(DT, inp, track);
    syncPose(); acc -= DT; n++; simTime += DT;
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

function effects(dt) {
  for (let i = 0; i < 4; i++) {
    const w = car.wheels[i];
    if (w.contact && w.skid > 0.3) {
      skid.add(i, w.contactPoint, w.normal, car.vel);
      if (w.skid > 0.55 && Math.random() < 14 * dt) particles.puff(w.contactPoint.x, w.contactPoint.y, w.contactPoint.z, car.vel.x, car.vel.z, 1.2 + w.skid);
    } else skid.lift(i);
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
    chase.update(dt, drawPos, drawQ, velV, track);
    effects(dt);
    hud.update(car, { lap: race.laps, time: race.lapStart != null ? simTime - race.lapStart : null, best: race.best });
    hud.drawMap(car);
    sound.update(car, throttleNow, true);
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
  stage.update(drawPos, camera.position);
  renderer.render(stage.scene, camera);
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
  hasPlayed = true; setMode('drive'); hud.hideHintsLater(); last = performance.now();
  hud.banner('Get to the start line', 1600);
}
function openEditor(d) {
  setMode('edit'); editor.open(d || def || makeTemplate('kidney'));
}

const editor = window.__editor = new Editor({
  toast,
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
    const d = makeTemplate(k), t = new Track(d);
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
  bindOpt('opt-kmh', 'kmh', (v) => { opts.kmh = v; hud.setUnits(v); });
  bindOpt('opt-shadow', 'shadow', (v) => { opts.shadow = v; stage.setShadows(v); });
  bindOpt('opt-sfx', 'sfx', (v) => { sound.setEnabled('sfx', v); syncSoundUI(); });
  bindOpt('opt-music', 'music', (v) => { sound.setEnabled('music', v); syncSoundUI(); });
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
  const d = makeTemplate(params.get('track'));
  if (params.get('edit')) openEditor(d); else if (params.get('drive') !== '0') startDriving(d);
}
