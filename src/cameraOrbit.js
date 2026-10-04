import * as THREE from 'three';
import { ChaseCamera } from './carVisual.js';

// Mouse/touch orbit for the third-person cameras.
// Dragging the game view rotates the camera around the vehicle. The offset stays where
// the player leaves it until the normal camera snap/reset path runs (respawn, restart etc.).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let currentCamera = null;
let drag = null;
let listenersInstalled = false;
let resetButtonInstalled = false;
const target = new THREE.Vector3();

function isUiControl(el) {
  if (!(el instanceof Element)) return false;
  return !!el.closest('button, a, input, select, textarea, label, [role="button"], #menu, #editor, .modal, .dialog');
}

function gameCanvas() {
  return document.querySelector('canvas');
}

function installResetButton() {
  if (resetButtonInstalled || typeof document === 'undefined') return;
  const hud = document.getElementById('hud');
  if (!hud) return;
  resetButtonInstalled = true;

  const style = document.createElement('style');
  style.textContent = `
    #reset-view {
      position:absolute;
      top:calc(max(14px, env(safe-area-inset-top)) + 232px);
      right:16px;
      z-index:3;
      width:42px;
      height:42px;
      display:grid;
      place-items:center;
      padding:0;
      border:2px solid rgba(246,217,176,.42);
      border-radius:50%;
      background:rgba(42,29,74,.82);
      color:#f6d9b0;
      font:700 25px/1 "Big Shoulders Display", Impact, sans-serif;
      text-shadow:none;
      pointer-events:auto;
      cursor:pointer;
      box-shadow:0 3px 10px rgba(0,0,0,.28);
    }
    #reset-view:hover { border-color:#ffb31f; color:#ffb31f; }
    #reset-view:active { transform:scale(.94); }
    @media (pointer: coarse) and (max-width: 760px) {
      #mirror {
        top:calc(max(14px, env(safe-area-inset-top)) + 188px) !important;
      }
      #reset-view {
        left:10px;
        right:auto;
        top:calc(max(14px, env(safe-area-inset-top)) + 154px);
        width:40px;
        height:40px;
        font-size:24px;
      }
    }
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.id = 'reset-view';
  button.type = 'button';
  button.setAttribute('aria-label', 'Reset camera view');
  button.title = 'Reset view';
  button.textContent = '↺';
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    currentCamera?.snap();
  });
  hud.appendChild(button);
}

function installListeners() {
  if (listenersInstalled || typeof document === 'undefined') return;
  listenersInstalled = true;

  // Capture phase is intentional: desktop HUD layers can sit above the canvas and may stop
  // bubbling pointer events. We still ignore real controls so menus/buttons behave normally.
  document.addEventListener('pointerdown', (e) => {
    const cam = currentCamera;
    if (!cam || cam.mode >= 2) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isUiControl(e.target)) return;

    const canvas = gameCanvas();
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;

    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cam, el: canvas };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* optional */ }
    e.preventDefault();
  }, { passive: false, capture: true });

  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.cam._orbitYaw = (drag.cam._orbitYaw || 0) - dx * 0.008;
    drag.cam._orbitPitch = clamp((drag.cam._orbitPitch || 0) + dy * 0.005, -0.32, 0.42);
    e.preventDefault();
  }, { passive: false, capture: true });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    try { drag.el.releasePointerCapture(e.pointerId); } catch { /* optional */ }
    drag = null;
  };
  document.addEventListener('pointerup', end, { capture: true });
  document.addEventListener('pointercancel', end, { capture: true });

  // Reset an orbited gameplay camera with a double-click/tap on the game view.
  document.addEventListener('dblclick', (e) => {
    const cam = currentCamera;
    if (!cam || cam.mode >= 2 || isUiControl(e.target)) return;
    const canvas = gameCanvas();
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    e.preventDefault();
    e.stopPropagation();
    cam.snap();
  }, { capture: true });

  // 0 = reset gameplay camera view. Ignore text-entry controls.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '0' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isUiControl(document.activeElement)) return;
    const cam = currentCamera;
    if (!cam || cam.mode >= 2) return;
    e.preventDefault();
    cam.snap();
  }, { capture: true });
}

const originalUpdate = ChaseCamera.prototype.update;
ChaseCamera.prototype.update = function updateWithOrbit(dt, p, quat, vel, track) {
  currentCamera = this;
  installListeners();
  installResetButton();
  originalUpdate.call(this, dt, p, quat, vel, track);

  // Bumper view remains fixed. Chase and High can orbit around the vehicle.
  if (this.mode >= 2) return;
  const yaw = this._orbitYaw || 0;
  const pitchOffset = this._orbitPitch || 0;
  if (Math.abs(yaw) < 1e-5 && Math.abs(pitchOffset) < 1e-5) return;

  target.set(p.x, p.y + (this.mode === 1 ? 0.4 : 1.0), p.z);
  const dx = this.cam.position.x - target.x;
  const dy = this.cam.position.y - target.y;
  const dz = this.cam.position.z - target.z;
  const radius = Math.max(0.1, Math.hypot(dx, dy, dz));
  const baseYaw = Math.atan2(dx, dz);
  const basePitch = Math.asin(clamp(dy / radius, -1, 1));
  const pitch = clamp(basePitch + pitchOffset, -0.55, 1.15);
  const horizontal = Math.cos(pitch) * radius;
  const a = baseYaw + yaw;

  this.cam.position.set(
    target.x + Math.sin(a) * horizontal,
    target.y + Math.sin(pitch) * radius,
    target.z + Math.cos(a) * horizontal,
  );
  this.cam.lookAt(target);
};

const originalSnap = ChaseCamera.prototype.snap;
ChaseCamera.prototype.snap = function snapAndCentre() {
  this._orbitYaw = 0;
  this._orbitPitch = 0;
  if (drag?.cam === this) drag = null;
  return originalSnap.call(this);
};

const originalCycle = ChaseCamera.prototype.cycle;
ChaseCamera.prototype.cycle = function cycleAndCentre() {
  this._orbitYaw = 0;
  this._orbitPitch = 0;
  if (drag?.cam === this) drag = null;
  return originalCycle.call(this);
};
