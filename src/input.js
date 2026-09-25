// Keyboard, gamepad and on-screen touch controls -> one driver input object.
import { clamp } from './math.js';

export class Input {
  constructor({ onReset, onRestart, onCamera, onMenu, onEditor, onDebug, onMusic, onMirror } = {}) {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, hand: false, boost: false };
    this.pad = { throttle: 0, brake: 0, steer: 0, hand: false, boost: false };
    this._prevPad = {};
    this.enabled = true;
    const map = { KeyR: onReset, Backspace: onRestart, KeyC: onCamera, Escape: onMenu, KeyE: onEditor, F3: onDebug, KeyM: onMusic, KeyV: onMirror };
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat && map[e.code]) { e.preventDefault(); map[e.code](); }
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    this.callbacks = { onReset, onRestart, onCamera, onMenu };
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
    if (!gp) { this.pad.throttle = this.pad.brake = this.pad.steer = 0; this.pad.hand = this.pad.boost = false; return; }
    const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
    this.pad.steer = -dz(gp.axes[0] || 0);
    this.pad.throttle = gp.buttons[7]?.value || 0;
    this.pad.brake = gp.buttons[6]?.value || 0;
    this.pad.hand = !!(gp.buttons[1]?.pressed || gp.buttons[5]?.pressed);
    this.pad.boost = !!(gp.buttons[0]?.pressed || gp.buttons[2]?.pressed);   // A or X
    const edge = (i, fn) => { const p = !!gp.buttons[i]?.pressed; if (p && !this._prevPad[i]) fn?.(); this._prevPad[i] = p; };
    edge(3, this.callbacks.onReset); edge(4, this.callbacks.onCamera); edge(9, this.callbacks.onMenu); edge(8, this.callbacks.onRestart);
  }

  read() {
    this._poll();
    const k = this.keys, t = this.touch;
    const key = (...c) => c.some((x) => k.has(x));
    const steerKeys = (key('KeyA', 'ArrowLeft') || t.left ? 1 : 0) - (key('KeyD', 'ArrowRight') || t.right ? 1 : 0);
    return {
      throttle: clamp(Math.max(key('KeyW', 'ArrowUp') || t.gas ? 1 : 0, this.pad.throttle), 0, 1),
      brake: clamp(Math.max(key('KeyS', 'ArrowDown') || t.brake ? 1 : 0, this.pad.brake), 0, 1),
      steer: clamp(steerKeys + this.pad.steer, -1, 1),
      handbrake: key('ShiftLeft', 'ShiftRight') || t.hand || this.pad.hand,
      boost: key('Space') || t.boost || this.pad.boost,
    };
  }
}
