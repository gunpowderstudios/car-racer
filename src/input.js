// Keyboard, gamepad and on-screen touch controls -> one driver input object.
import { clamp } from './math.js';

// Remappable controller actions: [id, label, default button on a standard pad (null = stick / D-pad)]
export const PAD_ACTIONS = [['left', 'Steer left', 'D-pad left'], ['right', 'Steer right', 'D-pad right'], ['gas', 'Gas', 'RT'], ['brake', 'Brake', 'LT'], ['boost', 'Boost', 'A'], ['drift', 'Drift', 'B'],
  ['horn', 'Horn', 'L3'], ['reset', 'Back on road', 'Y'], ['camera', 'Camera', 'LB'], ['menu', 'Menu', 'Start'], ['restart', 'Restart', 'Select']];
const HAT = [-1, -0.714, -0.428, -0.143, 0.143, 0.428, 0.714, 1];                  // what a "hat" D-pad axis reads in each direction (about 3.3 when centred)
const STD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right'];
const MAP_KEY = 'cr.padmap';
const bval = (gp, b) => {                                                           // how far a saved binding is pressed (0 to 1)
  if (!b) return 0;
  if (b.t === 'b') { const x = gp.buttons[b.i]; return x ? (x.value || (x.pressed ? 1 : 0)) : 0; }
  const a = gp.axes[b.i]; if (a == null) return 0;
  if (b.t === 'a') return a * b.s > 0.5 ? 1 : 0;
  return Math.abs(a - b.v) < 0.1 ? 1 : 0;                                          // 'h': a hat direction
};
export function describeBinding(b, standard) {
  if (!b) return '';
  if (b.t === 'b') return (standard && STD_NAMES[b.i]) || 'Button ' + b.i;
  if (b.t === 'a') return `Axis ${b.i} ${b.s > 0 ? '+' : '-'}`;
  return 'D-pad ' + ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'][HAT.indexOf(b.v)];
}

export class Input {
  constructor({ onReset, onRestart, onPadConnect, onCamera, onMenu, onEditor, onDebug, onMusic, onMirror, onPause, onBoom, onReplay } = {}) {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, hand: false, boost: false, horn: false };
    this.pad = { throttle: 0, brake: 0, steer: 0, hand: false, boost: false, horn: false };
    this._prevPad = {};
    this.learn = null;                                                              // set while the Controller panel waits for a button press
    try { this.padMap = JSON.parse(localStorage.getItem(MAP_KEY) || '{}') || {}; } catch { this.padMap = {}; }      // saved per controller name
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
    bind('t-left', 'left'); bind('t-right', 'right'); bind('t-gas', 'gas'); bind('t-brake', 'brake'); bind('t-hand', 'hand'); bind('t-boost', 'boost'); bind('mq-horn', 'horn');
  }

  poll() { this._poll(); }                                                          // (the Controller panel polls on the menu, where no race is reading the input)
  _poll() {
    const gp = (navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null);
    const info = this.padInfo;
    if (!gp) { this.pad.throttle = this.pad.brake = this.pad.steer = 0; this.pad.hand = this.pad.boost = this.pad.horn = false; if (info.connected) { info.connected = false; info.down = []; document.body.classList.remove('has-pad'); } return; }
    info.connected = true; if (!document.body.classList.contains('has-pad')) document.body.classList.add('has-pad');      // (a mode change rewrites the body's classes, so it is re-checked every poll)
    info.id = gp.id; info.standard = gp.mapping === 'standard'; info.axes = [...gp.axes];
    info.down = gp.buttons.map((b) => !!b.pressed);
    info.down.forEach((on, i) => { if (on) info.last = i; });
    if (this.learn) { this._learnPoll(gp); return; }
    // Standard gamepad layout (Xbox / PlayStation / Switch Pro in a browser): left stick or D-pad steers, RT gas, LT brake,
    // A or X boost, B or RB drift, Y back on road, LB camera, right-stick click reset view, Start menu, Back/Select restart.
    // Anything the player has set in the Controller panel replaces the default for that action.
    const m = this.padMap[gp.id] || {};
    const dz = (v) => { const a = Math.abs(v); return a < 0.12 ? 0 : Math.sign(v) * Math.pow((a - 0.12) / 0.88, 1.4); };   // dead zone, then gentle curve for fine control
    let dpad = (gp.buttons[14]?.pressed ? 1 : 0) - (gp.buttons[15]?.pressed ? 1 : 0);
    if (gp.mapping !== 'standard' && !dpad) {                                  // cheap USB pads often report the D-pad as axes instead of buttons
      const hat = gp.axes[9];                                                  // a "hat" axis: -1 up, then clockwise in steps of 2/7; about 3.3 = centred
      if (hat != null && hat <= 1.05) dpad = hat > 0.3 ? 1 : hat < -0.1 && hat > -0.8 ? -1 : 0;      // left = down-left, left, up-left; right = up-right, right, down-right
      else if (gp.axes[6] != null && Math.abs(gp.axes[6]) > 0.5) dpad = -Math.sign(gp.axes[6]);
    }
    const s0 = -dz(gp.axes[0] || 0) + dpad;
    this.pad.steer = clamp((m.left ? bval(gp, m.left) : Math.max(s0, 0)) - (m.right ? bval(gp, m.right) : Math.max(-s0, 0)), -1, 1);
    this.pad.throttle = m.gas ? bval(gp, m.gas) : gp.buttons[7]?.value || 0;
    this.pad.brake = m.brake ? bval(gp, m.brake) : gp.buttons[6]?.value || 0;
    this.pad.hand = m.drift ? bval(gp, m.drift) > 0.5 : !!(gp.buttons[1]?.pressed || gp.buttons[5]?.pressed);
    this.pad.boost = m.boost ? bval(gp, m.boost) > 0.5 : !!(gp.buttons[0]?.pressed || gp.buttons[2]?.pressed);   // A or X
    this.pad.horn = m.horn ? bval(gp, m.horn) > 0.5 : !!gp.buttons[10]?.pressed;                                // left-stick click: horn
    const edge = (act, def, fn) => { const p = m[act] ? bval(gp, m[act]) > 0.5 : !!gp.buttons[def]?.pressed; if (p && !this._prevPad[act]) fn?.(); this._prevPad[act] = p; };
    edge('reset', 3, this.callbacks.onReset); edge('camera', 4, this.callbacks.onCamera); edge('menu', 9, this.callbacks.onMenu); edge('restart', 8, this.callbacks.onRestart);
    edge('view', 11, () => window.__resetCameraView?.());
  }

  /** Controller panel: wait for the next button (or D-pad direction) and save it for `action`. `done(binding)` is called with it, or null if it timed out. */
  startLearn(action, done) {
    const gp = (navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null);
    if (!gp) { done?.(null); return false; }
    this.cancelLearn();
    this.learn = { action, done, id: gp.id, base: [...gp.axes], held: gp.buttons.map((b) => !!b.pressed), until: performance.now() + 8000 };
    return true;
  }
  cancelLearn() { const l = this.learn; this.learn = null; if (l) l.done?.(null); }
  clearMap(action) {
    const id = this.padInfo.id; if (!id) return;
    if (action) { if (this.padMap[id]) delete this.padMap[id][action]; } else delete this.padMap[id];
    this._saveMap();
  }
  bindingFor(action) { return (this.padMap[this.padInfo.id] || {})[action] || null; }
  _saveMap() { try { localStorage.setItem(MAP_KEY, JSON.stringify(this.padMap)); } catch { /* private mode */ } }
  _learnPoll(gp) {
    const l = this.learn;
    this.pad.throttle = this.pad.brake = this.pad.steer = 0; this.pad.hand = this.pad.boost = this.pad.horn = false;
    if (performance.now() > l.until || gp.id !== l.id) { this.cancelLearn(); return; }
    let b = null;
    gp.buttons.forEach((x, i) => { if (b) return; if (x.pressed && !l.held[i]) b = { t: 'b', i }; if (!x.pressed) l.held[i] = false; });
    if (!b) gp.axes.forEach((a, i) => {
      if (b) return; const base = l.base[i] ?? 0;
      if (base > 1.5 && a <= 1.05) { b = { t: 'h', i, v: HAT.reduce((best, h) => (Math.abs(h - a) < Math.abs(best - a) ? h : best), HAT[0]) }; }
      else if (base <= 1.5 && Math.abs(a - base) > 0.6) b = { t: 'a', i, s: Math.sign(a - base) };
    });
    if (!b) return;
    (this.padMap[l.id] || (this.padMap[l.id] = {}))[l.action] = b; this._saveMap();
    this.learn = null; l.done?.(b);
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
      horn: key('KeyH') || t.horn || this.pad.horn,
    };
  }
}
