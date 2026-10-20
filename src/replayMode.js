// Replay mode: plays what replay.js recorded back through the real car models, from TV-style cameras.
// main.js hands in the pieces of the game this needs (`d`); nothing here knows how a race works.
import * as THREE from 'three';
import { ReplayPlayer, ReplayCams, VIEWS } from './replay.js';
import { createMp4Saver, videoBitrate } from './mp4Save.js';
import { pickBestBit } from './bestBit.js';
import { assetUrl } from './assetVersion.js';

const SPEEDS = [0.25, 0.5, 1, 2];
const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const qTmp = new THREE.Quaternion(), vTmp = new THREE.Vector3();
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function createReplayMode(d) {
  const $ = d.$;
  let wake = null, title0 = null;
  const desktop = !matchMedia('(pointer: coarse)').matches;           // making films is for a computer: a phone is for quick racing in your pocket
  const el = { bar: $('replay-bar'), play: $('rp-play'), seek: $('rp-seek'), time: $('rp-time'), speed: $('rp-speed'), view: $('rp-view-btn'), next: $('rp-next'), save: $('rp-save'), edit: $('rp-editing'), editFill: $('re-fill'), editPct: $('re-pct'), editCancel: $('re-cancel'), ready: $('rp-ready'), readyInfo: $('rr-info'), readySave: $('rr-save'), readyClose: $('rr-close'), eta: $('re-eta'), note: $('rp-note'), exit: $('rp-exit'), label: $('rp-label') };
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
    hear.rpm = f.rpm; hear.speed = Math.hypot(vx, vz); hear.skidLevel = f.skid; hear.boosting = f.boost; hear.scraping = !!f.scrape;
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
    else if (e.type === 'prop') { if (fx) d.fx.prop(e); }
    else if (e.type === 'honk') { if (fx) d.fx.honk(e); }
  }
  /** Put every car's dents and wheels as they were at time t (after a jump), without any noise or smoke. */
  function rebuildTo(t) {
    d.visual.clearDents(); for (const v of d.views.values()) v.clearDents();
    for (const e of d.rec.events) { if (e.t > t) break; applyEvent(e, false); }
    R.evT = t;
  }

  if (el.ready) { el.readySave.onclick = () => R.ready && R.ready(); el.readyClose.onclick = () => { el.ready.hidden = true; R.ready = null; tabTitle(null); }; }
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
      if (!ent.isPlayer) { v.root.visible = d2 < 300 * 300; const lod = (d.derby.lastStanding ? d.tier.arenaLod : d.tier.lodDist) * 2.5; if (lod) v.setFar(d2 > (v._far ? lod * 0.7 : lod) ** 2); }
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

  // a little car (the player's own) bounces above the "editing room" heading while the movie is made
  function setEditCar() {
    const img = $('re-car'); if (!img || img.dataset.set) return;
    let id = 'car'; try { id = localStorage.getItem('cr.vehicle') || 'car'; } catch { /* storage unavailable */ }
    img.onerror = () => { if (img.dataset.fb) { img.hidden = true; return; } img.dataset.fb = '1'; img.src = assetUrl('cars/thumbs/car.webp'); };
    img.onload = () => { img.hidden = false; };
    img.src = assetUrl(`cars/thumbs/${id}.webp`); img.dataset.set = '1';
  }

  // ---- the controls bar
  function syncUi() {
    el.play.textContent = R.playing ? '❚❚' : (R.t >= R.player.t1 - 1e-3 ? '↺' : '▶');
    el.speed.textContent = SPEEDS[R.speed] + '×';
    el.note.hidden = true;
    const quick = !!R.saving;
    if (quick) setEditCar();
    if (el.edit) el.edit.hidden = !quick;                     // the dark "editing room" screen while the film is made
    document.body.classList.toggle('rp-saving', !!R.saving);
    if (!R.saving) { holdAwake(false); R.saveWall0 = null; R.lastPc = -1; if (!(el.ready && !el.ready.hidden)) tabTitle(null); }
    d.sound.speakers?.(!quick);                               // (a quick film is made without playing any sound out loud)
    el.save.textContent = R.saving ? 'Cancel film' : 'Make my movie';
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
  // ---- "Make my movie": the best bit of the replay, in the 1970s TV set, made as fast as the computer can (the music is laid on afterwards)
  function makeLogo() {                                                // the menu's TV logo as a picture (a still: fonts and animation do not come along inside an image)
    const img = new Image(), svg = document.getElementById('menu-tv-svg') || document.getElementById('rp-logo');
    if (!svg) return img;
    const css = 'text{font-family:Impact,"Arial Narrow",sans-serif;font-weight:900;letter-spacing:.02em}.rpl-big{font-size:33px}.rpl-small{font-size:15px}.rpl-tv{font-size:38px}.rpl-live{font-size:9px;letter-spacing:.1em}.rpl-burst{fill:#e8392c;stroke:#ffb31f;stroke-width:2;stroke-linejoin:round}';
    const src = svg.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="204"').replace(/>/, '><style>' + css + '</style>');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
    return img;
  }
  // ---- optional 1970s TV set around the video: the game picture is cropped to fill the screen cut-out of tv/tv-frame.webp
  const TV = { w: 1536, h: 1024, sx: 172, sy: 122, sw: 908, sh: 674 };   // the screen opening in the 1536x1024 picture (a little oversize, so the frame covers the edge)
  let tvImg = null;
  const musicClip = () => (d.sound.musicOn && d.sound.buf && d.sound.buf.music ? { buffer: d.sound.buf.music, vol: 0.7 } : null);      // music only if it is switched on for the race
  async function makeFilm() {
    if (!desktop || R.saving || R.making) return;
    R.making = true;
    try {
      if (!(tvImg && tvImg.complete && tvImg.naturalWidth)) {
        tvImg = new Image();
        await new Promise((ok) => { tvImg.onload = ok; tvImg.onerror = () => { tvImg = null; ok(); }; tvImg.src = 'tv/tv-frame.webp'; });
      }
      if (!tvImg) { d.toast('Could not load the TV set, so no film this time'); return; }
      startSave(tvImg, pickBestBit(R.player), musicClip());
    } finally { R.making = false; }
  }
  function startSave(tv, hl, clip) {
    if (R.saving) return;
    R.saveStart = hl.start; R.saveEnd = hl.end; R.cuts = hl.cuts; R.quick = true;
    const filmLen = Math.max(1, R.saveEnd - R.saveStart), cv = d.canvas;
    // each video frame is made on a second canvas: the 3D picture is cropped into the TV screen, the TV set goes over it and the TV logo is stamped on
    const out = document.createElement('canvas'); out.width = 1920; out.height = 1280;
    const octx = out.getContext('2d'), logo = makeLogo();
    let saver = null;
    R.stamp = () => {
      const k = out.width / TV.w, x = TV.sx * k, y = TV.sy * k, w = TV.sw * k, h = TV.sh * k, ca = cv.width / cv.height, ta = w / h;
      const cw = ca > ta ? cv.height * ta : cv.width, ch = ca > ta ? cv.height : cv.width / ta;   // cover-crop the picture to the screen shape
      octx.fillStyle = '#000'; octx.fillRect(0, 0, out.width, out.height);
      octx.drawImage(cv, (cv.width - cw) / 2, (cv.height - ch) / 2, cw, ch, x, y, w, h);
      octx.drawImage(tv, 0, 0, out.width, out.height);
      if (logo.complete && logo.naturalWidth) { const lw = w * 0.287, lh = lw * logo.naturalHeight / logo.naturalWidth, m = w * 0.02 + 18 * k; octx.drawImage(logo, x + w - lw - m, y + m * 0.7, lw, lh); }
      const live = $('re-live'), nowMs = performance.now();                  // a small live view of the TV film as it is made
      if (live && nowMs - (R.livePaint || 0) > 200) { R.livePaint = nowMs; live.getContext('2d').drawImage(out, 0, 0, live.width, live.height); }
      if (saver && !R.held && !R.skip) saver.addFrame(out, R.t - R.saveStart);
    };
    const finishWith = (blob) => {
      R.saving = null; syncUi();
      const file = new File([blob], 'bangers-and-smash-replay.mp4', { type: 'video/mp4' });
      const give = () => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      };
      R.ready = give; give();
      showReady(`${(blob.size / 1048576).toFixed(1)} MB, ${Math.round(filmLen)} seconds. It has gone to your downloads: Save film saves it again.`);
    };
    const pend = { state: 'recording', stop() { this.state = 'inactive'; } };
    R.saving = { rec: pend, cancel: false }; syncUi();
    seek(R.saveStart); R.speed = 2;
    const make = () => createMp4Saver({ width: out.width, height: out.height, seconds: filmLen, sound: d.sound, prefs: globalThis.__bsEncoderPrefs, audio: false, music: clip, maxBitrate: out.width > 1280 ? 6e6 : 3.5e6 }).catch(() => null);
    make().then((sv) => sv || (out.width = 1280, out.height = 854, make())).then((sv) => {      // 1920 wide if this computer's encoder can, else 1280
      const me = R.saving;
      if (!me || me.rec !== pend) { sv && sv.cancel(); return; }
      if (me.cancel || pend.state === 'inactive') { sv && sv.cancel(); R.stamp = null; R.saving = null; syncUi(); return; }      // cancelled while the encoder was starting
      if (!sv) { R.stamp = null; R.saving = null; syncUi(); d.toast('This browser cannot make films: try a recent Chrome, Edge or Safari'); return; }
      saver = sv; R.saver = sv; R.nextT = null;
      me.rec = {
        state: 'recording',
        async stop() {
          if (this.state === 'inactive') return; this.state = 'inactive'; saver = null; R.saver = null;
          if (me.cancel) { sv.cancel(); R.saving = null; syncUi(); return; }
          let blob = null; try { blob = await sv.finish(); } catch { blob = null; }
          if (R.saving !== me) return;
          if (!blob) { R.saving = null; syncUi(); d.toast('Could not save the video'); return; }
          finishWith(blob);
        },
      };
      sv.start(); R.saveWall0 = performance.now(); holdAwake(true); R.playing = true; syncUi();
    });
  }
  // ---- a film that is being made: keep the screen awake, show how far on in the tab title, and a card when it is done (so you can walk away)
  function holdAwake(on) {
    try {
      if (on) { navigator.wakeLock && navigator.wakeLock.request('screen').then((w) => { if (R.saving) wake = w; else w.release(); }).catch(() => {}); }
      else if (wake) { wake.release().catch(() => {}); wake = null; }
    } catch { /* not supported */ }
  }
  function tabTitle(pct) {
    if (title0 == null) { if (pct == null) return; title0 = document.title; }
    document.title = pct == null ? title0 : (pct === 'ready' ? 'Film ready - ' : `Film ${pct}% - `) + title0.replace(/^Film[^-]*- /, '');
    if (pct == null) title0 = null;
  }
  function showReady(info) {
    if (el.ready) { el.readyInfo.textContent = info; el.ready.hidden = false; }
    tabTitle('ready'); d.toast('Your film is ready');
  }
  function stopSave(finished) {
    const s = R.saving; if (!s) return;
    R.stamp = null;
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
  el.save.onclick = () => { if (R.saving) stopSave(false); else makeFilm(); };      // one tap: the fast film, in the TV set
  if (el.editCancel) el.editCancel.onclick = () => stopSave(false);
  if (!desktop) el.save.hidden = true;
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
    if (el.ready) el.ready.hidden = true; R.ready = null; tabTitle(null);
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
    R.held = !!(R.saving && R.saver && R.saver.busy());        // saving a video and the encoder is behind: hold the replay still until it catches up
    R.skip = false;
    if (R.saving && R.saver) {
      // Saving a video: the replay moves on in exact 1/30 s steps, one step per video frame, paced to real time. Every frame of the video is then
      // evenly spaced however uneven the screen's own frame rate is (that unevenness is what made saved videos look jolty).
      const now = performance.now();
      if (R.nextT == null || R.nextT < now - 150) R.nextT = now;           // (fell behind: carry on from now)
      if (R.held) { R.skip = true; R.saver.setClock(R.t - R.saveStart + 0.1, R.held); return R.lastF || null; }      // not this frame's turn: the picture just stays as it was
      R.nextT += 1000 / 30; dt = 1 / 30;
      R.saver.setClock(R.t - R.saveStart + (R.playing ? dt : 0) + 0.1, false);
    }
    if (R.playing && !R.held) {
      R.t += dt * SPEEDS[R.speed];
      const endT = R.saving ? R.saveEnd : p.t1;
      if (R.t >= endT) { R.t = endT; R.playing = false; if (R.saving) setTimeout(() => stopSave(true), 400); syncUi(); }
    }
    if (R.saving && R.cuts) {                                    // the film's camera cuts
      let v = -1; for (const c of R.cuts) if (c.t <= R.t) v = c.view;
      if (v >= 0 && v !== R.view) { R.view = v; R.cams.reset(); d.chase.snap(); syncUi(); }
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
    R.lastF = f;
    if (R.saving && R.saveWall0) {
      const pc = Math.max(0, Math.min(100, Math.round((R.t - R.saveStart) / Math.max(0.001, R.saveEnd - R.saveStart) * 100)));
      if (pc !== R.lastPc) { R.lastPc = pc; tabTitle(pc); }
      const wall = (performance.now() - R.saveWall0) / 1000;
      if (el.eta) el.eta.textContent = pc >= 4 ? `About ${Math.max(1, Math.round(wall * (100 - pc) / pc))} seconds to go` : 'Working out how long it will take…';
    }
    if (R.saving && el.editFill) { const pc = Math.max(0, Math.min(100, Math.round((R.t - R.saveStart) / Math.max(0.001, R.saveEnd - R.saveStart) * 100))); el.editFill.style.width = pc + '%'; el.editPct.textContent = pc + '%'; }
    return f;
  }

  /** Called by main.js right after the picture is drawn, while a video is being saved. */
  function afterRender() { if (R.saving && R.stamp) R.stamp(); }
  const turbo = () => !!(R.saving && R.saver);
  return { enter, exit, frame, afterRender, turbo, togglePlay, get active() { return R.active; }, state: R };
}
