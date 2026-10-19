// Keyboard, gamepad and on-screen touch controls -> one driver input object.
import { clamp } from './math.js';

export class Input {
  constructor({ onReset, onRestart, onPadConnect, onCamera, onMenu, onEditor, onDebug, onMusic, onMirror, onPause, onBoom, onReplay } = {}) {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, hand: false, boost: false };
    this.pad = { throttle: 0, brake: 0, steer: 0, hand: false, boost: false, horn: false };
    this._prevPad = {};
    this.padInfo = { connected: false, id: '', standard: false, last: -1, down: [], axes: [] };      // what the Controller panel in the cog shows
    this.enabled = true;
    // R (reset camera view) lives in cameraOrbit.js; B puts the car back on the road; Backspace / Delete restart the race.
    const map = { KeyB: onReset, Backspace: onRestart, Delete: onRestart, KeyC: onCamera, Escape: onMenu, KeyE: onEditor, F3: onDebug, KeyM: onMusic, KeyV: onMirror, KeyP: onPause, KeyX: onBoom, KeyT: onReplay };
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat && map[e.code]) { e.preventDefault(); map[e.code](); }
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.callbacks = { onReset, onRestart, onCamera, onMenu };
    addEventListener('gamepadconnected', (e) => onPadConnect?.(e.gamepad?.id || 'Controller'));
    this._bindTouch();
  }

  _bindTouch() {
    const bind = (id, key) => {
      const el = document.getElementById(id); if (!el) return;
      const set = (v) => (e) => { e.preventDefault(); this.touch[key] = v; el.classList.toggle('down', v); };
      el.addEventListener('pointerdown', set(true)); el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false)); el.addEventListener('pointerleave', set(false));
    };
    bind('t-left', 'left'); bind('t-right', 'right'); bind('t-gas', 'gas'); bind('t-brake', 'brake'); bind('t-hand', 'hand'); bind('t-boost', 'boost');
  }

  _poll() {
    const gp = (navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null);
    const info = this.padInfo;
    if (!gp) { this.pad.throttle = this.pad.brake = this.pad.steer = 0; this.pad.hand = this.pad.boost = this.pad.horn = false; if (info.connected) { info.connected = false; info.down = []; document.body.classList.remove('has-pad'); } return; }
    info.connected = true; if (!document.body.classList.contains('has-pad')) document.body.classList.add('has-pad');      // (a mode change rewrites the body's classes, so it is re-checked every poll)
    info.id = gp.id; info.standard = gp.mapping === 'standard'; info.axes = [...gp.axes];
    info.down = gp.buttons.map((b) => !!b.pressed);
    info.down.forEach((on, i) => { if (on) info.last = i; });
    // Standard gamepad layout (Xbox / PlayStation / Switch Pro in a browser): left stick or D-pad steers, RT gas, LT brake,
    // A or X boost, B or RB drift, Y back on road, LB camera, right-stick click reset view, Start menu, Back/Select restart.
    const dz = (v) => { const a = Math.abs(v); return a < 0.12 ? 0 : Math.sign(v) * Math.pow((a - 0.12) / 0.88, 1.4); };   // dead zone, then gentle curve for fine control
    let dpad = (gp.buttons[14]?.pressed ? 1 : 0) - (gp.buttons[15]?.pressed ? 1 : 0);
    if (gp.mapping !== 'standard' && !dpad) {                                  // cheap USB pads often report the D-pad as axes instead of buttons
      const hat = gp.axes[9];                                                  // a "hat" axis: -1 up, then clockwise in steps of 2/7; about 3.3 = centred
      if (hat != null && hat <= 1.05) dpad = hat > 0.3 ? 1 : hat < -0.1 && hat > -0.8 ? -1 : 0;      // left = down-left, left, up-left; right = up-right, right, down-right
      else if (gp.axes[6] != null && Math.abs(gp.axes[6]) > 0.5) dpad = -Math.sign(gp.axes[6]);
    }
    this.pad.steer = clamp(-dz(gp.axes[0] || 0) + dpad, -1, 1);
    this.pad.throttle = gp.buttons[7]?.value || 0;
    this.pad.brake = gp.buttons[6]?.value || 0;
    this.pad.hand = !!(gp.buttons[1]?.pressed || gp.buttons[5]?.pressed);
    this.pad.boost = !!(gp.buttons[0]?.pressed || gp.buttons[2]?.pressed);   // A or X
    this.pad.horn = !!gp.buttons[10]?.pressed;                                // left-stick click: horn
    const edge = (i, fn) => { const p = !!gp.buttons[i]?.pressed; if (p && !this._prevPad[i]) fn?.(); this._prevPad[i] = p; };
    edge(3, this.callbacks.onReset); edge(4, this.callbacks.onCamera); edge(9, this.callbacks.onMenu); edge(8, this.callbacks.onRestart);
    edge(11, () => window.__resetCameraView?.());
  }

  read() {
    this._poll();
    const k = this.keys, t = this.touch;
    const key = (...c) => c.some((x) => k.has(x));
    const steerKeys = (key('KeyA', 'ArrowLeft') || t.left ? 1 : 0) - (key('KeyD', 'ArrowRight') || t.right ? 1 : 0);
    return {
      // Drift is a powered-slide control everywhere: Shift, touch Drift, or gamepad drift all include full throttle.
      throttle: clamp(Math.max(key('KeyW', 'ArrowUp') || key('ShiftLeft', 'ShiftRight') || t.gas || t.hand || this.pad.hand ? 1 : 0, this.pad.throttle), 0, 1),
      brake: clamp(Math.max(key('KeyS', 'ArrowDown') || t.brake ? 1 : 0, this.pad.brake), 0, 1),
      steer: clamp(steerKeys + this.pad.steer, -1, 1),
      handbrake: key('ShiftLeft', 'ShiftRight') || t.hand || this.pad.hand,
      boost: key('Space') || t.boost || this.pad.boost,
      horn: key('KeyH') || this.pad.horn,
    };
  }
}
