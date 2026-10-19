// WebAudio: engine (pitch follows RPM), tyre squeal, impacts, scrape and music.
// Uses the sound files in /sounds; falls back to a synthesised engine if they are missing.
export class Sound {
  constructor() {
    this.ctx = null; this.ready = false;
    this.sfxOn = localStorage.getItem('cr.sfx') !== '0';
    this.musicOn = localStorage.getItem('cr.music') === '1';
    this.buf = {};
  }

  async init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    this.tapNode = null;
    this.sfx = c.createGain(); this.sfx.gain.value = this.sfxOn ? 1 : 0; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.22 : 0; this.music.connect(this.master);
    // (a url can be a list: the first one this browser can decode wins - older Safari cannot play Ogg, so the engine loop also comes as an MP3)
    const load = async (name, url) => { for (const u of [].concat(url)) { try { const r = await fetch(u); this.buf[name] = await c.decodeAudioData(await r.arrayBuffer()); return; } catch { /* try the next, or go without */ } } };
    await Promise.all([
      load('engine', ['sounds/engine-loop-loud.ogg', 'sounds/engine-loop-loud.mp3']), load('screech', 'sounds/tyre-screech.mp3'),
      load('crash', 'sounds/crash.mp3'), load('shunt', 'sounds/shunt.mp3'), load('scrape', 'sounds/scrape.mp3'),
      load('explosion', 'sounds/explosion.mp3'), load('busBell', 'sounds/bus-bell.mp3'), load('barrel', 'sounds/barrel.mp3'), load('cluck', 'sounds/cluck.mp3'),
      load('music', 'sounds/background-music.mp3'), load('engineStart', 'sounds/engine-start.mp3'),
    ]);
    this.engine = this._loop('engine', this.sfx, 0);
    this.screech = this._loop('screech', this.sfx, 0);
    this.scrape = this._loop('scrape', this.sfx, 0);
    if (!this.engine) this._synth();
    this._boostRush();
    if (this.buf.music) this._loop('music', this.music, 1, false);
    this.ready = true;
  }

  /** A second output of the mix as a MediaStream, for recording a video with sound (made on first use). */
  tap() {
    if (!this.ctx || !this.ctx.createMediaStreamDestination) return null;
    if (!this.tapNode) { this.tapNode = this.ctx.createMediaStreamDestination(); this.master.connect(this.tapNode); }
    return this.tapNode.stream;
  }
  /** Hands the mixed sound out as raw samples (left, right) for the video encoder; returns a function that stops it. */
  capture(cb) {
    if (!this.ctx || !this.ctx.createScriptProcessor) return null;
    const c = this.ctx, sp = c.createScriptProcessor(4096, 2, 2), mute = c.createGain(); mute.gain.value = 0;
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
    if (kind === 'music') { this.musicOn = on; if (this.music) this.music.gain.value = on ? 0.22 : 0; }
    else { this.sfxOn = on; if (this.sfx) this.sfx.gain.value = on ? 1 : 0; }
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
    const v = this._hornVoice(0.269, 1); v.stop(1.6); return v;
  }
  /** A rival's short honk (two toots), quieter with distance. */
  honk(dist = 0, pitch = 1) {
    if (!this.ready || !this.sfxOn || this.hornOn === false) return;
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
  /** A chicken meeting its end. */
  splat(dist = 0) { this._shot('cluck', 0.85, 0.85 + Math.random() * 0.3, dist, 0.5); }
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
