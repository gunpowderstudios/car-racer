// Replay mode: plays what replay.js recorded back through the real car models, from TV-style cameras.
// main.js hands in the pieces of the game this needs (`d`); nothing here knows how a race works.
import * as THREE from 'three';
import { ReplayPlayer, ReplayCams, VIEWS } from './replay.js';

const SPEEDS = [0.25, 0.5, 1, 2];
const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const qTmp = new THREE.Quaternion(), vTmp = new THREE.Vector3();
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function createReplayMode(d) {
  const $ = d.$;
  const el = { bar: $('replay-bar'), play: $('rp-play'), seek: $('rp-seek'), time: $('rp-time'), speed: $('rp-speed'), view: $('rp-view-btn'), next: $('rp-next'), save: $('rp-save'), exit: $('rp-exit'), label: $('rp-label') };
  const R = { active: false, player: null, cams: null, t: 0, evT: 0, playing: true, speed: 2, view: 0, focusId: 'p', dragging: false, savedMode: 0, savedFov: 62, seen: new Set(), lastFocus: null, fv: new THREE.Vector3(), seekUi: 0, opening: false, lastV: { x: 0, z: 0 } };
  const fakeCar = { steerAngle: 0, wheels: [{ spin: 0 }, { spin: 0 }, { spin: 0 }, { spin: 0 }] };
  const fakeVan = { axle: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, roll: 0, spin: 0, sway: 0, health: 1, spec: { hp: 1 } };
  const setVan = (v) => { const a = v.van; fakeVan.axle.x = a[0]; fakeVan.axle.y = a[1]; fakeVan.axle.z = a[2]; fakeVan.yaw = a[3]; fakeVan.pitch = a[4]; fakeVan.roll = a[5]; fakeVan.spin = a[6]; fakeVan.sway = a[7]; fakeVan.health = a[8]; return fakeVan; };

  // what the focus car sounds like from the camera: quieter with distance, and its pitch drops as it goes past (the Doppler effect)
  const hear = { rpm: 0, speed: 0, gear: 1, onGround: true, brk: 0, skidLevel: 0, boosting: false, scraping: false };
  let pitchNow = 1;
  function listen(f, vx, vz, dt) {
    const cam = d.camera.position;
    const dx = f.x - cam.x, dy = f.y - cam.y, dz = f.z - cam.z, dist = Math.hypot(dx, dy, dz) || 1;
    hear.rpm = f.rpm; hear.speed = Math.hypot(vx, vz); hear.skidLevel = f.skid; hear.boosting = f.boost;
    const away = (vx * dx + vz * dz) / dist;                                    // m/s the car is moving away from the camera
    const slow = SPEEDS[R.speed] < 1 ? Math.sqrt(SPEEDS[R.speed]) : 1;          // slow motion drops the pitch
    const want = Math.max(0.8, Math.min(1.25, 343 / (343 + away))) * slow;
    pitchNow += (want - pitchNow) * Math.min(1, 6 * dt);
    const level = 0.22 + 0.78 * Math.pow(clamp01(1 - dist / 120), 1.6);
    d.sound.update(hear, f.wrecked ? 0 : Math.max(f.thr, 0.15), R.playing && !f.wrecked, level, pitchNow);
  }

  const viewById = (id) => (id === 'p' ? d.visual : d.views.get(id) || null);

  // ---- what happened (dents, wrecks, knocks): applied as the replay clock passes them
  function applyEvent(e, fx) {
    const v = viewById(e.id);
    if (e.type === 'dent') { if (v && v.loaded) v.addDent(e.lx, e.ly, e.lz, e.hp); }
    else if (e.type === 'clear') { if (v) v.clearDents(); }
    else if (e.type === 'wreck') { if (v) v._rpWreckT = e.t; if (v) d.wheelFlyers.launch(v, { x: fx ? e.vx || 0 : 0, z: fx ? e.vz || 0 : 0 }, fx ? 1 : 0.04); if (fx) d.fx.wreck(e); }
    else if (e.type === 'hit') { if (fx) d.fx.hit(e); }
  }
  /** Put every car's dents and wheels as they were at time t (after a jump), without any noise or smoke. */
  function rebuildTo(t) {
    d.visual.clearDents(); for (const v of d.views.values()) v.clearDents();
    for (const e of d.rec.events) { if (e.t > t) break; applyEvent(e, false); }
    R.evT = t;
  }

  function seek(t) {
    R.t = Math.max(R.player.t0, Math.min(R.player.t1, t));
    if (R.t < R.evT || R.t - R.evT > 1.5) rebuildTo(R.t);          // went back, or skipped ahead: rebuild rather than replay every knock
    R.cams.reset(); R.lastFocus = null; d.chase.snap();
  }

  // ---- the cars
  function place(ent) {
    const v = d.viewFor(ent);
    if (!v) return null;
    if (v._wheelsOff && !ent.wrecked && R.t - (v._rpWreckT ?? -1e9) > 0.5) v.restoreWheels();      // (as in the live game: only a wreck goes without wheels)
    if (v.loaded && !v._rpReady) { v._rpReady = true; R.fresh = true; }          // a car that has only just been built (or finished loading): it needs its dents so far
    v.root.visible = true; v.root.position.set(ent.x, ent.y, ent.z); v.root.quaternion.set(ent.qx, ent.qy, ent.qz, ent.qw); v.root.scale.setScalar(1);
    fakeCar.steerAngle = ent.steer; for (let i = 0; i < 4; i++) fakeCar.wheels[i].spin = ent.spin[i];
    v.setWheels(fakeCar);
    if (v.loaded) {
      const dx = ent.x - d.camera.position.x, dz = ent.z - d.camera.position.z, d2 = dx * dx + dz * dz;
      if (!ent.isPlayer) { v.root.visible = d2 < 300 * 300; const lod = d.derby.lastStanding ? d.tier.arenaLod : d.tier.lodDist; if (lod) v.setFar(d2 > (v._far ? lod * 0.7 : lod) ** 2); }
      v.setLook(ent.wrecked ? (ent.isPlayer ? 0.3 : 0.1) : 1 - (ent.isPlayer ? 0.5 : 0.55) * (1 - ent.health), 0);
    }
    // a caravan behind it
    if (ent.isPlayer) {
      if (ent.van && d.caravanView.loaded) { d.caravanView.visible = true; d.caravanView.root.visible = true; d.caravanView.capture(setVan(ent)); d.caravanView.capture(fakeVan); d.caravanView.update(1); }
      else if (!ent.van) d.caravanView.root.visible = false;
    } else {
      const tv = ent.van ? d.towFor(ent) : (d.dropTow(ent.id), null);
      if (tv) { tv.root.visible = true; tv.capture(setVan(ent)); tv.capture(fakeVan); tv.update(1); }
    }
    return v;
  }

  // ---- the camera
  function aim(ents, dt) {
    let f = ents.find((e) => e.id === R.focusId);
    if (!f) { f = ents.find((e) => e.isPlayer) || ents[0]; if (f) R.focusId = f.id; }
    if (!f) return null;
    const cam = d.camera;
    // velocity from how far it moved since the last frame (the notes hold positions only)
    let vx = 0, vz = 0;
    if (R.lastFocus && dt > 0 && dt < 0.2) { vx = (f.x - R.lastFocus.x) / dt; vz = (f.z - R.lastFocus.z) / dt; }
    R.lastFocus = R.lastFocus || { x: 0, z: 0 }; R.lastFocus.x = f.x; R.lastFocus.z = f.z;
    R.lastV.x = vx; R.lastV.z = vz;
    qTmp.set(f.qx, f.qy, f.qz, f.qw); vTmp.set(0, 0, 1).applyQuaternion(qTmp);
    const mode = VIEWS[R.view];
    if (mode === 'Chase') {
      if (d.chase.mode !== 0) { d.chase.mode = 0; d.chase.ready = false; }
      d.chase.update(dt, R.fv.set(f.x, f.y, f.z), qTmp, { x: vx, y: 0, z: vz }, d.getTrack());
    } else {
      const o = R.cams.update(mode, dt, { x: f.x, y: f.y, z: f.z, vx, vz, fx: vTmp.x, fz: vTmp.z });
      cam.position.set(o.px, o.py, o.pz); cam.lookAt(o.tx, o.ty, o.tz);
      let dirty = false;
      if (cam.near !== 0.3) { cam.near = 0.3; dirty = true; }
      if (Math.abs(cam.fov - o.fov) > 0.05) { cam.fov = o.fov; dirty = true; }
      if (dirty) cam.updateProjectionMatrix();
    }
    return f;
  }

  // ---- the controls bar
  function syncUi() {
    el.play.textContent = R.playing ? '❚❚' : (R.t >= R.player.t1 - 1e-3 ? '↺' : '▶');
    el.speed.textContent = SPEEDS[R.speed] + '×';
    el.save.textContent = R.saving ? 'Saving… (tap to cancel)' : 'Save video';
    el.view.textContent = VIEWS[R.view];
    const n = d.rec.table.find((c) => c.id === R.focusId);
    el.label.textContent = R.focusId === 'p' ? 'You' : 'Rival ' + (1 + d.rec.table.filter((c) => !c.isPlayer).findIndex((c) => c.id === R.focusId));
  }
  function togglePlay() {
    if (R.saving) return;
    if (R.t >= R.player.t1 - 1e-3) { seek(R.player.t0); R.playing = true; }
    else R.playing = !R.playing;
    syncUi();
  }
  // ---- save as video: the replay plays through once at normal speed while the canvas (and the sound) is recorded
  const REC_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  function saveVideo() {
    if (R.saving) { stopSave(false); return; }
    const cv = d.canvas, MR = globalThis.MediaRecorder;
    if (!cv || !cv.captureStream || !MR) { d.toast('This browser cannot save video'); return; }
    const type = REC_TYPES.find((t) => MR.isTypeSupported(t));
    if (!type) { d.toast('This browser cannot save video'); return; }
    const stream = cv.captureStream(30), audio = d.sound.tap && d.sound.tap();
    if (audio) for (const tr of audio.getAudioTracks()) stream.addTrack(tr);
    let rec;
    try { rec = new MR(stream, { mimeType: type, videoBitsPerSecond: 6e6 }); } catch { d.toast('This browser cannot save video'); return; }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      for (const tr of stream.getTracks()) tr.stop();
      if (!R.saving || R.saving.cancel || !chunks.length) { R.saving = null; syncUi(); return; }
      const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm', blob = new Blob(chunks, { type: type.split(';')[0] });
      R.saving = null; syncUi();
      const file = new File([blob], 'bangers-and-smash-replay.' + ext, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
        navigator.share({ files: [file], title: 'Bangers and Smash! replay' }).catch(() => {});
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      }
      d.toast('Video saved');
    };
    R.saving = { rec, cancel: false };
    seek(R.player.t0); R.speed = 2; R.playing = true;
    rec.start(1000);
    syncUi();
  }
  function stopSave(finished) {
    const s = R.saving; if (!s) return;
    s.cancel = !finished;
    if (s.rec.state !== 'inactive') s.rec.stop();
  }
  function cycleView() { R.view = (R.view + 1) % VIEWS.length; R.cams.reset(); d.chase.snap(); syncUi(); }
  function nextCar(ents) {
    const list = (ents || R.player.sample(R.t)).map((e) => e.id);
    if (!list.length) return;
    R.focusId = list[(list.indexOf(R.focusId) + 1) % list.length]; R.cams.reset(); R.lastFocus = null; d.chase.snap(); syncUi();
  }

  el.play.onclick = () => { if (!R.saving) togglePlay(); };
  el.save.onclick = () => saveVideo();
  el.speed.onclick = () => { if (R.saving) return; R.speed = (R.speed + 1) % SPEEDS.length; syncUi(); };
  el.view.onclick = () => cycleView();
  el.next.onclick = () => nextCar();
  el.exit.onclick = () => exit();
  const seekFromUi = () => { if (R.active) seek(R.player.t0 + (+el.seek.value / 1000) * Math.max(0.001, R.player.duration)); };
  el.seek.addEventListener('input', seekFromUi);
  el.seek.addEventListener('pointerdown', () => { R.dragging = true; });
  addEventListener('pointerup', () => { R.dragging = false; });
  for (const b of el.bar.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => e.preventDefault());       // buttons never take focus: Space stays play/pause
  addEventListener('keydown', (e) => {
    if (!R.active || e.repeat || R.opening) return;          // (the very key press that opened the replay must not also close it)
    const k = e.code;
    if (k === 'Space' || k === 'KeyK') togglePlay();
    else if (k === 'ArrowRight') seek(R.t + 5);
    else if (k === 'ArrowLeft') seek(R.t - 5);
    else if (k === 'Escape' || k === 'KeyT') exit();
    else if (k === 'KeyV' || k === 'KeyC') cycleView();
    else if (k === 'KeyN') nextCar();
    else if (k === 'Digit1') { R.speed = 0; syncUi(); } else if (k === 'Digit2') { R.speed = 1; syncUi(); } else if (k === 'Digit3') { R.speed = 2; syncUi(); } else if (k === 'Digit4') { R.speed = 3; syncUi(); }
    else return;
    e.preventDefault();
  });

  function enter() {
    if (R.active || d.rec.empty) return false;
    R.player = new ReplayPlayer(d.rec);
    const tr = d.getTrack();
    R.cams = new ReplayCams(tr, d.derby.lastStanding ? d.arenaInfo(tr) : null);
    R.savedMode = d.chase.mode; R.savedFov = d.camera.fov;
    R.t = R.player.t0; R.evT = R.t; R.playing = true; R.speed = 2; R.view = 0; R.focusId = 'p'; R.lastFocus = null; R.seen.clear();
    d.setMode('replay');
    R.active = true; R.opening = true; setTimeout(() => { R.opening = false; }, 0);          // (the key press that opened the replay is still being handled: it must not also close it)
    d.visual._rpReady = false; for (const v of d.views.values()) v._rpReady = false;
    rebuildTo(R.t);
    d.chase.mode = 0; d.chase.snap();
    el.bar.hidden = false; syncUi();
    return true;
  }

  function exit() {
    if (!R.active) return;
    if (R.saving) stopSave(false);
    R.active = false; el.bar.hidden = true; d.sound.update(hear, 0, false);
    // cars that were only in the replay go back; the others get their true dents and wheels back
    for (const id of R.seen) if (id !== 'p' && !d.derby.fighters.some((f) => f.id === id && !f.gone)) { d.dropTow(id); d.releaseView(id); }
    rebuildTo(Infinity);
    d.chase.mode = R.savedMode; d.chase.snap();
    d.camera.fov = R.savedFov; d.camera.near = 0.3; d.camera.updateProjectionMatrix();
    d.setMode('drive');
    d.resyncLive();
    if (!d.derby.over) d.setPaused(true);               // back in the game, held still until you are ready
  }

  /** Called every frame while the replay is on. Returns the position the sun and shadows should follow. */
  function frame(dt) {
    const p = R.player;
    if (R.playing) {
      R.t += dt * SPEEDS[R.speed];
      if (R.t >= p.t1) { R.t = p.t1; R.playing = false; if (R.saving) setTimeout(() => stopSave(true), 400); syncUi(); }
    }
    const ents = p.sample(R.t);
    for (const e of ents) R.seen.add(e.id);
    const f = aim(ents, dt);
    if (f) listen(f, R.lastV.x, R.lastV.z, dt); else d.sound.update(hear, 0, false);
    R.fresh = false;
    for (const e of ents) place(e);
    if (R.fresh) rebuildTo(R.t);
    else { for (const e of p.between(R.evT, R.t)) applyEvent(e, R.playing); if (R.t > R.evT) R.evT = R.t; }
    // cars that are not in this moment (not yet arrived, or gone) are hidden
    for (const [id, v] of d.views) if (!ents.some((e) => e.id === id)) v.root.visible = false;
    d.particles.update(dt * SPEEDS[R.speed]); d.debris.update(dt * SPEEDS[R.speed], d.debrisGround); d.wheelFlyers.update(dt * SPEEDS[R.speed], d.debrisGround);
    if (!R.dragging) el.seek.value = String(Math.round((R.t - p.t0) / Math.max(0.001, p.duration) * 1000));
    el.time.textContent = `${fmt(R.t - p.t0)} / ${fmt(p.duration)}`;
    return f;
  }

  return { enter, exit, frame, togglePlay, get active() { return R.active; }, state: R };
}
