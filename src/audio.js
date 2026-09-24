// WebAudio: engine (pitch follows RPM), tyre squeal, impacts, scrape and music.
// Uses the sound files in /sounds; falls back to a synthesised engine if they are missing.
export class Sound {
  constructor() {
    this.ctx = null; this.ready = false;
    this.sfxOn = localStorage.getItem('cr.sfx') !== '0';
    this.musicOn = localStorage.getItem('cr.music') !== '0';
    this.buf = {};
  }

  async init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = this.sfxOn ? 1 : 0; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = this.musicOn ? 0.22 : 0; this.music.connect(this.master);
    const load = async (name, url) => { try { const r = await fetch(url); this.buf[name] = await c.decodeAudioData(await r.arrayBuffer()); } catch { /* optional */ } };
    await Promise.all([
      load('engine', 'sounds/engine-loop-loud.ogg'), load('screech', 'sounds/tyre-screech.mp3'),
      load('crash', 'sounds/crash.mp3'), load('shunt', 'sounds/shunt.mp3'), load('scrape', 'sounds/scrape.mp3'),
      load('music', 'sounds/background-music.mp3'),
    ]);
    this.engine = this._loop('engine', this.sfx, 0);
    this.screech = this._loop('screech', this.sfx, 0);
    this.scrape = this._loop('scrape', this.sfx, 0);
    if (!this.engine) this._synth();
    this._boostRush();
    if (this.buf.music) this._loop('music', this.music, 1, false);
    this.ready = true;
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

  update(car, throttle, active) {
    if (!this.ready) return;
    const t = this.ctx.currentTime, on = active ? 1 : 0;
    const rpm = car.rpm, e = this.engine;
    if (e) {
      const gain = on * (0.18 + 0.5 * Math.max(throttle, 0.15) * (rpm / 7000));
      if (e.synth) {
        const f = 28 + rpm / 60 * 2.1;
        e.synth[0].frequency.setTargetAtTime(f, t, 0.03); e.synth[1].frequency.setTargetAtTime(f * 0.5, t, 0.03);
        e.synth[2].frequency.setTargetAtTime(400 + rpm * 0.35, t, 0.05); e.gain.gain.setTargetAtTime(gain * 0.25, t, 0.05);
      } else {
        e.src.playbackRate.setTargetAtTime(0.45 + (rpm / 7000) * 1.55, t, 0.04);
        e.gain.gain.setTargetAtTime(gain, t, 0.05);
      }
    }
    if (this.screech) this.screech.gain.gain.setTargetAtTime(on * Math.min(1, car.skidLevel) * 0.55 * (car.onGround ? 1 : 0), t, 0.05);
    if (this.rush) {
      const b = on && car.boosting ? 1 : 0;
      this.rush.gain.gain.setTargetAtTime(b * 0.5, t, b ? 0.04 : 0.15);
      this.rush.filter.frequency.setTargetAtTime(500 + car.speed * 18, t, 0.1);
    }
    if (this.scrape) this.scrape.gain.gain.setTargetAtTime(on * (car.scraping ? 0.6 : 0), t, 0.04);
  }

  hit(speed, kind = 'wall') {
    if (!this.ready || !this.sfxOn) return;
    const b = this.buf[speed > 9 ? 'crash' : 'shunt'] || this.buf.crash; if (!b) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = b; s.playbackRate.value = 0.9 + Math.random() * 0.2; g.gain.value = Math.min(1, 0.25 + speed / 18) * (kind === 'ground' ? 0.7 : 1);
    s.connect(g).connect(this.sfx); s.start();
  }
}
