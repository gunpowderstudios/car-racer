// WebAudio: engine (pitch follows RPM), tyre squeal, impacts, scrape and music.
import { getCustomMusic } from './customMusic.js';
// Uses the sound files in /sounds; falls back to a synthesised engine if they are missing.
export const TRACKS = ['lounge', 'fairground', 'rock', 'custom'];       // built-ins plus one user-supplied track kept in IndexedDB
export class Sound {
  constructor() {
    this.ctx = null; this.ready = false;
    this.sfxOn = localStorage.getItem('cr.sfx') !== '0';
    this.musicOn = localStorage.getItem('cr.music') !== '0';                        // (on unless the player has turned it off)
    this.sfxVol = +(localStorage.getItem('cr.sfxvol') ?? 0.8);                      // (effects at 80% unless the player changes it)
    this.musicVol = +(localStorage.getItem('cr.musicvol') ?? 0.5);                  // (in-game music at 50% unless the player changes it; the menu has its own volume)
    this.track = TRACKS.includes(localStorage.getItem('cr.musictrack')) ? localStorage.getItem('cr.musictrack') : 'lounge';
    this.buf = {};
  }

  async init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 64; this.analyser.smoothingTimeConstant = 0.7; this.master.connect(this.analyser);   // (feeds the little equaliser)
    this.tapNode = null;
    this.sfx = c.createGain(); this.sfx.gain.value = this.sfxOn ? this.sfxVol : 0; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.22 * this.musicVol : 0; this.music.connect(this.master);
    // (a url can be a list: the first one this browser can decode wins - older Safari cannot play Ogg, so the engine loop also comes as an MP3)
    const load = async (name, url) => { for (const u of [].concat(url)) { try { const r = await fetch(u); this.buf[name] = await c.decodeAudioData(await r.arrayBuffer()); return; } catch { /* try the next, or go without */ } } };
    await Promise.all([
      load('engine', ['sounds/engine-loop-loud.ogg', 'sounds/engine-loop-loud.mp3']), load('screech', 'sounds/tyre-screech.mp3'),
      load('crash', 'sounds/crash.mp3'), load('shunt', 'sounds/shunt.mp3'), load('scrape', 'sounds/scrape.mp3'),
      load('explosion', 'sounds/explosion.mp3'), load('busBell', 'sounds/bus-bell.mp3'), load('policeSiren', 'sounds/police-siren.mp3'), load('barrel', 'sounds/barrel.mp3'),
      load('engineStart', 'sounds/engine-start.mp3'),
      load('crusher', 'sounds/crusher.mp3'), load('flame', 'sounds/flame.mp3'), load('hammer', 'sounds/hammer.mp3'), load('fireworks', 'sounds/fireworks.mp3'), load('boulder', 'sounds/boulder.mp3'),      // (Apple Crumple's hazards and the finish; the game just goes without if a file is missing)
    ]);
    await this._loadMusicBuffer(this.track);
    this.engine = this._loop('engine', this.sfx, 0);
    this.screech = this._loop('screech', this.sfx, 0);
    this.scrape = this._loop('scrape', this.sfx, 0);
    if (!this.engine) this._synth();
    this._boostRush();
    if (this.buf.music) this.musicLoop = this._loop('music', this.music, 1, false);
    this.ready = true;
  }

  /** The music file for the chosen track (the loading screen plays it before the sound system exists). */
  async trackUrl() {
    if (this.track !== 'custom') return `sounds/${this.track}-music.mp3`;
    try {
      const item = await getCustomMusic();
      if (!item?.blob) return null;
      if (this._customObjectUrl) URL.revokeObjectURL(this._customObjectUrl);
      this._customObjectUrl = URL.createObjectURL(item.blob);
      return this._customObjectUrl;
    } catch { return null; }
  }

  async _loadMusicBuffer(name) {
    try {
      let data;
      if (name === 'custom') {
        const item = await getCustomMusic();
        if (!item?.blob) return false;
        data = await item.blob.arrayBuffer();
      } else {
        const r = await fetch(`sounds/${name}-music.mp3`);
        data = await r.arrayBuffer();
      }
      this.buf.music = await this.ctx.decodeAudioData(data);
      return true;
    } catch { return false; }
  }
  /** Pick the music: it is remembered, and swapped in at once if the game's sound is already running. */
  async setTrack(name) {
    if (!TRACKS.includes(name) || name === this.track) return;
    this.track = name;
    try { localStorage.setItem('cr.musictrack', name); } catch { /* storage unavailable */ }
    if (!this.ctx || !this.ready || this._film) return;                   // (a film in the making has its own soundtrack; the choice is picked up when it ends)
    await this._swapMusic(name);
  }
  /** Decode a music file and loop it in place of the current one. */
  async _swapMusic(name) {
    this._want = name;
    try {
      let data;
      if (name === 'custom') {
        const item = await getCustomMusic();
        if (!item?.blob) return;
        data = await item.blob.arrayBuffer();
      } else {
        const r = await fetch(`sounds/${name}-music.mp3`);
        data = await r.arrayBuffer();
      }
      const buf = await this.ctx.decodeAudioData(data);
      if (this._want !== name) return;                                    // (changed again while it loaded)
      try { this.musicLoop && this.musicLoop.src.stop(); } catch { /* already stopped */ }
      this.buf.music = buf; this.musicLoop = this._loop('music', this.music, 1, false);
    } catch { /* keep the old music */ }
  }
  /** The soundtrack of a film being made: a track name or 'off'; null puts the game's own music back. */
  async filmTrack(choice, fx = true) {
    if (!this.ctx || !this.ready) return;
    if (choice === 'custom') choice = 'off';                    // user-uploaded audio is for gameplay only, never movie export
    if (choice === null) {
      if (!this._film) return;
      this._film = null; this.music.gain.value = this.musicOn ? 0.22 * this.musicVol : 0; this.sfx.gain.value = this.sfxOn ? this.sfxVol : 0;
      if (this._want !== this.track) await this._swapMusic(this.track);
      return;
    }
    this._film = choice; this.sfx.gain.value = fx ? 0.5 : 0;      // (effects can be left out of the film; in a film they are at 50%)
    if (choice === 'off') { this.music.gain.value = 0; return; }
    this.music.gain.value = 0.22 * 0.8;                                    // (a film's soundtrack is at 80%, whatever the in-game music slider says)
    await this._swapMusic(choice);                                        // (from the top, so the tune starts with the film)
  }

  /** Speakers on or off (a video being made is recorded silently from the mix, so the player does not have to listen to it). */
  speakers(on) { try { if (!this.master || !this.ctx) return; if (on && !this._spk) { this.master.connect(this.ctx.destination); this._spk = true; } else if (!on && this._spk !== false) { this.master.disconnect(this.ctx.destination); this._spk = false; } } catch { /* already in that state */ } }
  /** A second output of the mix as a MediaStream, for recording a video with sound (made on first use). */
  tap() {
    if (!this.ctx || !this.ctx.createMediaStreamDestination) return null;
    if (!this.tapNode) { this.tapNode = this.ctx.createMediaStreamDestination(); this.master.connect(this.tapNode); }
    return this.tapNode.stream;
  }
  /** Loads the sound recorder (an AudioWorklet, which runs on the audio thread, so a busy page cannot make it miss or chop any sound). Safe to call twice. */
  prepareCapture() {
    const c = this.ctx;
    if (!c || !c.audioWorklet || typeof AudioWorkletNode === 'undefined') return Promise.resolve(false);
    if (!this._capReady) {
      const code = 'class Cap extends AudioWorkletProcessor{constructor(){super();this.l=new Float32Array(2048);this.r=new Float32Array(2048);this.n=0;this.on=true;this.port.onmessage=()=>{this.on=false;};}'
        + 'process(i){const a=i[0];if(a&&a[0]){const L=a[0],R=a[1]||a[0];this.l.set(L,this.n);this.r.set(R,this.n);this.n+=L.length;if(this.n>=2048){const l=this.l.slice(),r=this.r.slice();this.port.postMessage({l,r},[l.buffer,r.buffer]);this.n=0;}}return this.on;}}'
        + "registerProcessor('bs-cap',Cap);";
      const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
      this._capReady = c.audioWorklet.addModule(url).then(() => true).catch(() => false).finally(() => URL.revokeObjectURL(url));
    }
    return this._capReady;
  }
  /** Hands the mixed sound out as raw samples (left, right) for the video encoder; returns a function that stops it. */
  capture(cb) {
    if (!this.ctx) return null;
    const c = this.ctx, mute = c.createGain(); mute.gain.value = 0;
    if (this._capReady && c.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        const node = new AudioWorkletNode(c, 'bs-cap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        node.port.onmessage = (e) => { if (e.data && e.data.l) cb(e.data.l, e.data.r); };
        this.master.connect(node); node.connect(mute); mute.connect(c.destination);
        return () => {                                       // (sound already on its way still arrives for a moment after this, so nothing at the very end is lost)
          try { this.master.disconnect(node); node.port.postMessage(0); } catch { /* gone */ }
          setTimeout(() => { try { node.port.onmessage = null; node.disconnect(); mute.disconnect(); } catch { /* gone */ } }, 1500);
        };
      } catch { /* fall back to the older recorder below */ }
    }
    if (!c.createScriptProcessor) return null;
    const sp = c.createScriptProcessor(4096, 2, 2);
    sp.onaudioprocess = (e) => cb(e.inputBuffer.getChannelData(0).slice(), e.inputBuffer.getChannelData(Math.min(1, e.inputBuffer.numberOfChannels - 1)).slice());
    this.master.connect(sp); sp.connect(mute); mute.connect(c.destination);
    return () => { try { this.master.disconnect(sp); } catch { /* gone */ } sp.onaudioprocess = null; sp.disconnect(); mute.disconnect(); };
  }
  _loop(name, dest, gain, pitched = true) {
    const b = this.buf[name]; if (!b) return null;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(g).connect(dest); s.start();
    return { src: s, gain: g, pitched };
  }

  _synth() {
    const c = this.ctx;
    const o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 700; g.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(g).connect(this.sfx); o1.start(); o2.start();
    this.engine = { synth: [o1, o2, lp], gain: g };
  }

  /** Filtered noise loop for the boost; silent until the car boosts. */
  _boostRush() {
    const c = this.ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = last; }
    const src = c.createBufferSource(); src.buffer = b; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(this.sfx); src.start();
    this.rush = { gain: g, filter: bp };
  }

  setEnabled(kind, on) {
    localStorage.setItem(kind === 'music' ? 'cr.music' : 'cr.sfx', on ? '1' : '0');
    if (kind === 'music') { this.musicOn = on; if (this.music && !this._film) this.music.gain.value = on ? 0.22 * this.musicVol : 0; }
    else { this.sfxOn = on; if (this.sfx && !this._film) this.sfx.gain.value = on ? this.sfxVol : 0; }
  }

  /** Volume 0..1 for in-game music or effects (the cog menu sliders). */
  setVolume(kind, v) {
    v = Math.max(0, Math.min(1, +v || 0));
    try { localStorage.setItem(kind === 'music' ? 'cr.musicvol' : 'cr.sfxvol', String(v)); } catch { /* storage unavailable */ }
    if (kind === 'music') { this.musicVol = v; if (this.music && !this._film) this.music.gain.value = this.musicOn ? 0.22 * v : 0; }
    else { this.sfxVol = v; if (this.sfx && !this._film) this.sfx.gain.value = this.sfxOn ? v : 0; }
  }

  /** `level` (0..1) and `pitch` (1 = normal) let a replay hear a car from the camera: quieter far off, and shifted as it passes. */
  update(car, throttle, active, level = 1, pitch = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, on = active ? level : 0;
    const rpm = car.rpm, e = this.engine;
    if (e) {
      const gain = on * (0.18 + 0.5 * Math.max(throttle, 0.15) * (rpm / 7000));
      if (e.synth) {
        const f = (28 + rpm / 60 * 2.1) * pitch;
        e.synth[0].frequency.setTargetAtTime(f, t, 0.03); e.synth[1].frequency.setTargetAtTime(f * 0.5, t, 0.03);
        e.synth[2].frequency.setTargetAtTime((400 + rpm * 0.35) * pitch, t, 0.05); e.gain.gain.setTargetAtTime(gain * 0.25, t, 0.05);
      } else {
        e.src.playbackRate.setTargetAtTime((0.45 + (rpm / 7000) * 1.55) * pitch, t, 0.04);
        e.gain.gain.setTargetAtTime(gain, t, 0.05);
      }
    }
    if (this.screech) {
      // Hard braking should make the tyres talk even before the physics reports a full slide.
      // This uses the same smoothed brake input for keyboard, touch and gamepad, across every car.
      const brakeSkid = car.gear > 0 && car.onGround && car.speed > 4
        ? car.brk * clamp01((car.speed - 4) / 12)
        : 0;
      const tyreNoise = Math.max(Math.min(1, car.skidLevel), brakeSkid * 0.72);
      this.screech.gain.gain.setTargetAtTime(on * tyreNoise * 0.55, t, 0.05);
    }
    if (this.rush) {
      const b = on && car.boosting ? 1 : 0;
      this.rush.gain.gain.setTargetAtTime(b * 0.5, t, b ? 0.04 : 0.15);
      this.rush.filter.frequency.setTargetAtTime(500 + car.speed * 18, t, 0.1);
    }
    if (this.scrape) this.scrape.gain.gain.setTargetAtTime(on * (car.scraping ? 0.6 : 0), t, 0.04);
  }

  hit(speed, kind = 'wall', dist = 0) {
    if (!this.ready || !this.sfxOn) return;
    const near = clamp01(1 - dist / 90); if (near < 0.03) return;       // a crash across the track is quieter
    const b = this.buf[speed > 9 ? 'crash' : 'shunt'] || this.buf.crash; if (!b) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = b; s.playbackRate.value = 0.9 + Math.random() * 0.2; g.gain.value = Math.min(1, 0.25 + speed / 18) * (kind === 'ground' ? 0.7 : 1) * near;
    s.connect(g).connect(this.sfx); s.start();
  }

  /** One-shot sample. `dist` (m) fades it with distance; `cut` trims a long tail. */
  /** Starter motor + engine catching, played when the player restarts a stalled engine. */
  engineStart() { this._shot('engineStart', 1, 1, 0); }

  _shot(name, gain, rate, dist = 0, cut = 0) {
    if (!this.ready || !this.sfxOn) return;
    const b = this.buf[name]; if (!b) return;
    const g = gain * clamp01(1 - dist / 90); if (g < 0.02) return;
    const s = this.ctx.createBufferSource(), gn = this.ctx.createGain(), t = this.ctx.currentTime;
    s.buffer = b; s.playbackRate.value = rate; gn.gain.setValueAtTime(g, t);
    if (cut) gn.gain.setTargetAtTime(0, t + cut, cut * 0.35);
    s.connect(gn).connect(this.sfx); s.start(t); if (cut) s.stop(t + cut * 2.5);
  }
  /** A named sound effect from the loaded files (Apple Crumple's hammer / crusher / flame / fireworks), `dist` metres away. */
  cue(name, gain = 1, dist = 0) { this._shot(name, gain, 1, dist); }
  /** A barrel going off. */
  explode(dist = 0) { this._shot('explosion', 1, 0.92 + Math.random() * 0.16, dist); }
  /** A drum being knocked about: a clang whose loudness follows how hard it was hit. */
  clang(speed, dist = 0) { this._shot('barrel', Math.min(1, 0.4 + speed / 12), 0.85 + Math.random() * 0.4, dist, 0.6); }
  /** A car horn: two close notes (a major third) in a buzzy, squashed tone. `pitch` makes each car's horn a little different. */
  _hornVoice(gain, pitch) {
    const c = this.ctx, t = c.currentTime, g = c.createGain(), lp = c.createBiquadFilter(), oscs = [];
    lp.type = 'lowpass'; lp.frequency.value = 1700; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.02);
    for (const [f, type] of [[392 * pitch, 'sawtooth'], [494 * pitch, 'square']]) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(lp); o.start(t); oscs.push(o);
    }
    lp.connect(g).connect(this.sfx);
    let done = false;
    return { stop: (after = 0) => { if (done && after === 0) return; try { const n = c.currentTime + after; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0, n, 0.025); for (const o of oscs) o.stop(n + 0.2); done = true; } catch { /* already stopped */ } } };
  }
  /** Hold-to-honk for the player: starts a voice and returns it; call .stop() on the voice when the key comes up. */
  hornStart(vehicleId) {
    if (!this.ready || !this.sfxOn || this.hornOn === false) return null;
    if (vehicleId === 'bus' && this.buf.busBell) { this._shot('busBell', 0.9, 1, 0); return { stop() {} }; }      // the Rootmaster rings its bell instead of honking (once per press)
    if (vehicleId === 'police' && this.buf.policeSiren) return this._siren();      // Hills Street Blue wails its siren for as long as H is held
    const v = this._hornVoice(0.269, 1); v.stop(1.6); return v;
  }
  /** The police car's siren: the clip loops while the key is down (and stops by itself after a few seconds, like a horn). */
  _siren() {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), g = c.createGain();
    s.buffer = this.buf.policeSiren; s.loop = true; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 0.05);
    s.connect(g).connect(this.sfx); s.start(t);
    let done = false;
    const stop = () => { if (done) return; done = true; const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0, n, 0.06); s.stop(n + 0.4); };
    setTimeout(stop, 6000);
    return { stop };
  }
  /** A rival's short honk (two toots), quieter with distance. */
  honk(dist = 0, pitch = 1, vehicleId = null) {
    if (!this.ready || !this.sfxOn || this.hornOn === false) return;
    if (vehicleId === 'bus' && this.buf.busBell) { this._shot('busBell', 0.9, 1, dist); return; }                         // (the replay: the Rootmaster's bell...
    if (vehicleId === 'police' && this.buf.policeSiren) { this._shot('policeSiren', 0.6, 1, dist, 1.2); return; }          // ...and the police siren, one wail for the press)
    const gain = 0.32 * clamp01(1 - dist / 70); if (gain < 0.03) return;
    const a = this._hornVoice(gain, pitch); a.stop(0.16);
    setTimeout(() => { if (this.ctx) { const b = this._hornVoice(gain, pitch); b.stop(0.2); } }, 230);
  }
  /** A short pure beep (the start lights): `freq` Hz for `dur` seconds. */
  beep(freq = 440, dur = 0.18, gain = 0.3) {
    if (!this.ready || !this.sfxOn || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.2);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur + 0.1);
  }
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
