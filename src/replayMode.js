// Replay mode: plays what replay.js recorded back through the real car models, from TV-style cameras.
// main.js hands in the pieces of the game this needs (`d`); nothing here knows how a race works.
import * as THREE from 'three';
import { ReplayPlayer, ReplayCams, VIEWS } from './replay.js';
import { createMp4Saver, videoBitrate } from './mp4Save.js';
import { createFilmEditor } from './filmEditor.js';

const SPEEDS = [0.25, 0.5, 1, 2];
const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const qTmp = new THREE.Quaternion(), vTmp = new THREE.Vector3();
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function createReplayMode(d) {
  const $ = d.$;
  let wake = null, title0 = null;
  const desktop = !matchMedia('(pointer: coarse)').matches;           // making films is for a computer: a phone is for quick racing in your pocket
  const el = { bar: $('replay-bar'), play: $('rp-play'), seek: $('rp-seek'), time: $('rp-time'), speed: $('rp-speed'), view: $('rp-view-btn'), next: $('rp-next'), save: $('rp-save'), edit: $('rp-editing'), editFill: $('re-fill'), editPct: $('re-pct'), editCancel: $('re-cancel'), ready: $('rp-ready'), readyInfo: $('rr-info'), readySave: $('rr-save'), readyClose: $('rr-close'), eta: $('re-eta'), rec: $('rp-rec'), recPct: $('rp-rec-pct'), recCancel: $('rp-rec-cancel'), note: $('rp-note'), exit: $('rp-exit'), label: $('rp-label') };
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
    el.note.hidden = true;
    const quick = !!(R.saving && R.quick);
    if (el.edit) el.edit.hidden = !quick;                     // Quick save: the dark "editing room" screen while the film is made
    if (el.rec) { el.rec.hidden = !(R.saving && !R.quick); if (!el.rec.hidden) { el.rec.querySelector('b').textContent = R.quiet ? '\u25CF RUSHES' : '\u25CF REC'; el.recCancel.textContent = R.quiet ? 'Skip' : 'Cancel'; } }      // otherwise the player watches (and hears) the film being made, with a REC badge
    document.body.classList.toggle('rp-saving', !!R.saving);
    if (!R.saving) { holdAwake(false); R.saveWall0 = null; R.lastPc = -1; if (!(el.ready && !el.ready.hidden)) tabTitle(null); }
    d.sound.speakers?.(!(quick || R.quiet));                               // (a quick film has no sound: nothing to hear)
    el.save.textContent = R.saving ? 'Cancel film' : 'Make a movie';
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
  // ---- save as video (the MP4 types NAME the audio codec: with only a video codec listed, Chrome saves a silent file): the replay plays through once at normal speed while the canvas (and the sound) is recorded
  const REC_TYPES = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1,opus', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
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
  const frameOn = () => { try { return localStorage.getItem('bs-tvframe') === '1'; } catch { return false; } };
  function setFrame(on) { try { localStorage.setItem('bs-tvframe', on ? '1' : '0'); } catch { /* private mode */ } syncFrameBtn(); }
  function syncFrameBtn() { /* the TV set tick box lives in the film editor */ }
  // "Make a movie" opens the film editor (film.js); its Make my film / Quick save buttons come here.
  async function makeFilm(kind) {
    if (!desktop || R.saving || R.making) return;
    R.making = true;
    if (kind === 'auto' && R.rushes) {                           // the rushes were made after the race: nothing to wait for
      R.making = false; film.close(); R.ready = R.rushes.give; showReady(R.rushes.info); return;
    }
    const rushes = kind === 'rushes';
    if (kind === 'auto' || rushes) { film.autoCut(); kind = 'live'; }      // "Make it for me": the best bit, cuts and music chosen, then made while you watch
    try {
      const clip = kind === 'live' ? await film.musicClip() : null;
      if (clip && clip.error) d.toast('Could not read that music file, making the film without it');
      let tv = null;
      if (frameOn()) {
        if (!(tvImg && tvImg.complete && tvImg.naturalWidth)) {
          tvImg = new Image();
          await new Promise((ok) => { tvImg.onload = ok; tvImg.onerror = () => { tvImg = null; d.toast('Could not load the TV set, making the film without it'); ok(); }; tvImg.src = 'tv/tv-frame.webp'; });
        }
        tv = tvImg && tvImg.naturalWidth ? tvImg : null;
      }
      startSave(tv, { quick: kind === 'quick', rushes, clip: clip && !clip.error ? clip : null });
    } finally { R.making = false; }
  }
  function startSave(tv, opt = {}) {
    if (R.saving) return;
    const trim = film.trim(); R.saveStart = trim.start; R.saveEnd = trim.end; R.quick = !!opt.quick; R.previewEnd = null; R.quiet = !!opt.rushes;
    const filmLen = Math.max(1, R.saveEnd - R.saveStart);
    const cv = d.canvas, MR = globalThis.MediaRecorder;
    if (!cv || !cv.captureStream || !MR) { d.toast('This browser cannot save video'); return; }
    const type = REC_TYPES.find((t) => MR.isTypeSupported(t));
    if (!type) { d.toast('This browser cannot save video'); return; }
    // the video is made from a second canvas: each frame the 3D picture is copied in and the TV logo stamped top right
    const out = document.createElement('canvas'), small = matchMedia('(pointer: coarse)').matches;
    const cap = film.size() === 'small' ? 854 : 1280;                                        // longest side: Small is quicker to make and a smaller file
    if (tv) { out.width = Math.min(cap, small ? 960 : 1280); out.height = Math.round(out.width * 2 / 3 / 2) * 2; } else {   // (even sizes, 1280 at most: what the video encoders and social sites like)
      const k = Math.min(1, cap / Math.max(cv.width, cv.height)); out.width = Math.max(2, Math.floor(cv.width * k / 2) * 2); out.height = Math.max(2, Math.floor(cv.height * k / 2) * 2); }
    const octx = out.getContext('2d'), logo = makeLogo();
    let saver = null;
    const fcss = 'filter' in octx ? film.filterCss() : '';          // (Safari cannot filter a canvas: the film is then made without the look)
    R.stamp = () => {
      if (tv) {
        const k = out.width / TV.w, x = TV.sx * k, y = TV.sy * k, w = TV.sw * k, h = TV.sh * k, ca = cv.width / cv.height, ta = w / h;
        const cw = ca > ta ? cv.height * ta : cv.width, ch = ca > ta ? cv.height : cv.width / ta;   // cover-crop the picture to the screen shape
        octx.fillStyle = '#000'; octx.fillRect(0, 0, out.width, out.height);
        if (fcss) octx.filter = fcss;
        octx.drawImage(cv, (cv.width - cw) / 2, (cv.height - ch) / 2, cw, ch, x, y, w, h);
        octx.filter = 'none';
        octx.drawImage(tv, 0, 0, out.width, out.height);
        if (logo.complete && logo.naturalWidth) { const lw = w * 0.221, lh = lw * logo.naturalHeight / logo.naturalWidth, m = w * 0.02 + 18 * k; octx.drawImage(logo, x + w - lw - m, y + m * 0.7, lw, lh); }
      } else {
        if (fcss) octx.filter = fcss;
        octx.drawImage(cv, 0, 0, out.width, out.height);
        octx.filter = 'none';
        if (logo.complete && logo.naturalWidth) { const w = Math.max(195 * out.width / cv.width, out.width * 0.221), h = w * logo.naturalHeight / logo.naturalWidth, m = out.width * 0.012; octx.drawImage(logo, out.width - w - m, m, w, h); }
      }
      film.drawOver(octx, out.width, out.height, R.t - R.saveStart, filmLen);
      if (saver && !R.held && !R.skip) saver.addFrame(out, R.t - R.saveStart);
    };
    const finishWith = (blob, ext) => {
      const wall = (performance.now() - (R.saveWall0 || performance.now())) / 1000;
      if (R.quick) film.learn(filmLen, wall);
      R.saving = null; syncUi();
      const file = new File([blob], 'bangers-and-smash-replay.' + ext, { type: blob.type });
      const touch = matchMedia('(pointer: coarse)').matches, canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }) && touch);
      const give = () => {
        if (canShare) { navigator.share({ files: [file], title: 'Bangers and Smash! replay' }).catch(() => {}); return; }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      };
      const info = `${(blob.size / 1048576).toFixed(1)} MB, ${Math.round(filmLen)} seconds. ${canShare ? 'Tap Save film to share it.' : 'It has gone to your downloads: Save film saves it again.'}`;
      if (R.quiet) {                                   // rushes: made quietly after the race, kept (in memory only) until the next race
        R.rushes = { give, info }; R.rushJob = false; R.quiet = false;
        exit(); d.rushesReady && d.rushesReady(true); d.toast('Your rushes are ready'); return;
      }
      R.ready = give;
      if (!touch) give();                              // (a phone needs a tap to share: the card below has the button)
      showReady(info);
    };
    // First choice: the browser's video encoder writes a plain steady-30-fps H.264 + AAC .mp4 sized to fit WhatsApp (about 14 MB at most).
    // Fallback: MediaRecorder (its mp4 is fragmented, which WhatsApp can choke on).
    const startMusic = () => { if (opt.clip && !R.quick) R.music = d.sound.playClip(opt.clip.buffer, opt.clip.vol, filmLen); };
    const pend = { state: 'recording', stop() { this.state = 'inactive'; } };
    R.saving = { rec: pend, cancel: false }; syncUi();
    film.close(); seek(R.saveStart); R.speed = 2;
    createMp4Saver({ width: out.width, height: out.height, seconds: filmLen, sound: d.sound, prefs: globalThis.__bsEncoderPrefs, audio: !R.quick }).catch(() => null).then((sv) => {
      const me = R.saving;
      if (!me || me.rec !== pend) { sv && sv.cancel(); return; }
      if (me.cancel || pend.state === 'inactive') { sv && sv.cancel(); R.stamp = null; R.saving = null; syncUi(); return; }      // cancelled while the encoder was starting
      if (!sv && R.quick) { R.stamp = null; R.saving = null; syncUi(); d.toast('Quick save needs a newer browser: use Make my film instead'); return; }
      if (sv) {
        saver = sv; R.saver = sv; R.nextT = null;
        const rec = {
          state: 'recording',
          async stop() {
            if (this.state === 'inactive') return; this.state = 'inactive'; saver = null; R.saver = null;
            if (me.cancel) { sv.cancel(); R.saving = null; syncUi(); return; }
            let blob = null; try { blob = await sv.finish(); } catch { blob = null; }
            if (R.saving !== me) return;
            if (!blob) { R.saving = null; syncUi(); d.toast('Could not save the video'); return; }
            finishWith(blob, 'mp4');
          },
        };
        me.rec = rec; sv.start(); R.saveWall0 = performance.now(); holdAwake(true); startMusic(); R.playing = true; syncUi();
        return;
      }
      const stream = out.captureStream(30), audio = d.sound.tap && d.sound.tap();
      if (audio) for (const tr of audio.getAudioTracks()) stream.addTrack(tr);
      let rec;
      try { rec = new MR(stream, { mimeType: type, videoBitsPerSecond: videoBitrate(filmLen, tv ? 3.5e6 : 5e6), audioBitsPerSecond: 128000 }); } catch { R.saving = null; R.stamp = null; syncUi(); d.toast('This browser cannot save video'); return; }
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        for (const tr of stream.getTracks()) tr.stop();
        if (!R.saving || R.saving.cancel || !chunks.length) { R.saving = null; syncUi(); return; }
        finishWith(new Blob(chunks, { type: type.split(';')[0] }), type.startsWith('video/mp4') ? 'mp4' : 'webm');
      };
      me.rec = rec; rec.start(1000); R.saveWall0 = performance.now(); holdAwake(true); startMusic(); R.playing = true; syncUi();
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
  // ---- rushes: after a game ends, the highlights film is made quietly (it plays behind a small badge) and kept in memory for "Make it for me" or "Save rushes".
  // A new race, or going back to the menu, throws it away.
  function startRushes() {
    if (!desktop || R.active || R.saving || R.making || R.rushes || d.rec.empty || d.rec.duration < 4) return false;
    if (!enter()) return false;
    R.rushJob = true; R.quiet = true; el.bar.hidden = true;
    makeFilm('rushes');
    return true;
  }
  function cancelRushJob() { if (R.rushJob || R.quiet) { R.rushJob = false; R.quiet = false; if (R.active) exit(); } }
  function dropRushes() { cancelRushJob(); if (R.rushes) { R.rushes = null; } d.rushesReady && d.rushesReady(false); }
  function giveRushes() { if (R.rushes) R.rushes.give(); }
  function stopSave(finished) {
    const s = R.saving; if (!s) return;
    R.stamp = null; if (R.music) { R.music.stop(); R.music = null; }
    s.cancel = !finished;
    if (s.rec.state !== 'inactive') s.rec.stop();
  }
  function cycleView() { R.view = (R.view + 1) % VIEWS.length; R.cams.reset(); d.chase.snap(); syncUi(); }
  function nextCar(ents) {
    const list = (ents || R.player.sample(R.t)).map((e) => e.id);
    if (!list.length) return;
    R.focusId = list[(list.indexOf(R.focusId) + 1) % list.length]; R.cams.reset(); R.lastFocus = null; d.chase.snap(); syncUi();
  }

  const film = createFilmEditor({
    $, getPlayer: () => R.player, getT: () => R.t, seek: (t) => seek(t), sound: d.sound, frameOn, setFrame,
    onMake: (kind) => makeFilm(kind),
    onPreview: (a, b) => { seek(a); R.previewEnd = b; R.playing = true; syncUi(); },
    onClose: () => { R.previewEnd = null; },
  });
  el.play.onclick = () => { if (!R.saving) togglePlay(); };
  el.save.onclick = () => { if (R.saving) stopSave(false); else if (film.isOpen) film.close(); else film.open(); };
  if (el.editCancel) el.editCancel.onclick = () => stopSave(false);
  if (!desktop) el.save.hidden = true;
  if (el.recCancel) el.recCancel.onclick = () => stopSave(false);
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
    if (el.ready) el.ready.hidden = true; R.ready = null; tabTitle(null); film.close();
    R.quiet = false; R.rushJob = false;
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
    if (R.quiet && !R.saving && !R.making && !R.rushes) { cancelRushJob(); return null; }       // the rushes could not be made, or were skipped: back to the game
    const p = R.player;
    R.held = !!(R.saving && R.saver && R.saver.busy());        // saving a video and the encoder is behind: hold the replay still until it catches up
    R.skip = false;
    if (R.saving && R.saver) {
      // Saving a video: the replay moves on in exact 1/30 s steps, one step per video frame, paced to real time. Every frame of the video is then
      // evenly spaced however uneven the screen's own frame rate is (that unevenness is what made saved videos look jolty).
      const now = performance.now();
      if (R.nextT == null || R.nextT < now - 150) R.nextT = now;           // (fell behind: carry on from now)
      if (R.held || (!R.quick && now < R.nextT - 1)) { R.skip = true; R.saver.setClock(R.t - R.saveStart + 0.1, R.held); return R.lastF || null; }      // not this frame's turn: the picture just stays as it was
      R.nextT += 1000 / 30; dt = 1 / 30;
      R.saver.setClock(R.t - R.saveStart + (R.playing ? dt : 0) + 0.1, false);
    }
    if (R.playing && !R.held) {
      R.t += dt * SPEEDS[R.speed];
      const endT = R.saving ? R.saveEnd : (R.previewEnd != null ? R.previewEnd : p.t1);
      if (R.t >= endT) { R.t = endT; R.playing = false; if (R.saving) setTimeout(() => stopSave(true), 400); R.previewEnd = null; syncUi(); }
    }
    if (R.saving || R.previewEnd != null) {                      // the film editor's camera cuts
      const v = film.viewAt(R.t);
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
      if (pc !== R.lastPc) { R.lastPc = pc; tabTitle(pc); if (el.recPct) el.recPct.textContent = pc + '%'; }
      const wall = (performance.now() - R.saveWall0) / 1000;
      if (el.eta) el.eta.textContent = pc >= 4 ? `About ${Math.max(1, Math.round(wall * (100 - pc) / pc))} seconds to go` : 'Working out how long it will take…';
    }
    if (R.saving && R.quick && el.editFill) { const pc = Math.max(0, Math.min(100, Math.round((R.t - R.saveStart) / Math.max(0.001, R.saveEnd - R.saveStart) * 100))); el.editFill.style.width = pc + '%'; el.editPct.textContent = pc + '%'; }
    return f;
  }

  /** Called by main.js right after the picture is drawn, while a video is being saved. */
  function afterRender() { if (R.saving && R.stamp) R.stamp(); }
  const turbo = () => !!(R.saving && R.quick && R.saver);
  return { enter, exit, frame, afterRender, turbo, startRushes, cancelRushJob, dropRushes, giveRushes, get rushesReady() { return !!R.rushes; }, togglePlay, get active() { return R.active; }, state: R };
}
