import * as THREE from 'three';
import { CarVisual } from './carVisual.js';
import { CAR } from './vehicle.js';

// Player vehicle catalogue. Add future vehicles (for example Tuk Tuk) here.
// `physics` is deliberately optional: the normal car continues to use the original,
// known-good CAR object unchanged.
export const VEHICLES = [
  { id: 'car', name: 'Car', url: 'cars/car-shrink.glb', fit: 'measured' },
  {
    id: 'motor-home', name: 'Motor Home', url: 'cars/motor-home-shrink.glb',
    fit: 'auto', targetLength: 4.85,
    physics: {
      mass: 2800,
      wheelbase: 3.15,
      track: 1.78,
      wheelRadius: 0.36,
      mountY: 0.04,
      // A heavier, softer vehicle: slower to accelerate, more momentum and more body movement.
      inertia: { x: 6500, y: 7600, z: 3600 },
      susp: {
        free: 0.56, travel: 0.30,
        kFront: 61000, kRear: 57000,
        cCompFront: 3900, cCompRear: 3700, cRebFront: 5100, cRebRear: 4800,
        arbFront: 22000, arbRear: 15000, bump: 250000, bumpDamp: 11000,
      },
      engine: { peakTorque: 360 },
      brakeBias: 0.64,
      wallBounce: 0.22,
      aero: { drag: 0.88, down: 0.20 },
      steer: { max: 0.48, rate: 3.6, returnRate: 5.4 },
      // Physical body dimensions around the centre of mass. These are what stop the
      // tall motor home falling through the road when it lands on its side or roof.
      body: { width: 2.08, length: 4.85, bottom: -0.72, shoulder: 0.38, roof: 1.82, roofWidth: 1.92, roofLength: 3.95 },
    },
  },
];

const KEY = 'cr.vehicle';
const fallback = VEHICLES[0];

export function selectedVehicle() {
  let id = fallback.id;
  try { id = localStorage.getItem(KEY) || id; } catch { /* storage unavailable */ }
  return VEHICLES.find((v) => v.id === id) || fallback;
}

function makeHull(b) {
  const p = [];
  const hx = b.width / 2, hz = b.length / 2;
  const rhx = b.roofWidth / 2, rhz = b.roofLength / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.push(new THREE.Vector3(hx * sx, b.bottom, hz * sz));
    p.push(new THREE.Vector3(hx * sx, b.shoulder, hz * sz));
    p.push(new THREE.Vector3(rhx * sx, b.roof, rhz * sz));
  }
  p.push(new THREE.Vector3(hx, b.shoulder, 0), new THREE.Vector3(-hx, b.shoulder, 0));
  p.push(new THREE.Vector3(0, b.roof, rhz), new THREE.Vector3(0, b.roof, -rhz));
  return p;
}

// Apply the selected profile BEFORE main.js creates its Vehicle. This keeps the original
// car code untouched and makes the change easy to back out. Multiplayer networking is not
// changed here; this only changes the local physical vehicle selected on this browser.
function applySelectedPhysics() {
  const cfg = selectedVehicle();
  const p = cfg.physics;
  if (!p) return;

  CAR.mass = p.mass;
  CAR.wheelbase = p.wheelbase;
  CAR.track = p.track;
  CAR.wheelRadius = p.wheelRadius;
  CAR.mountY = p.mountY;
  CAR.inertia = { ...p.inertia };
  CAR.susp = { ...CAR.susp, ...p.susp };
  CAR.engine = { ...CAR.engine, ...p.engine };
  CAR.brakeTotal = 1.35 * p.mass * 9.81;
  CAR.brakeBias = p.brakeBias;
  CAR.wallBounce = p.wallBounce;
  CAR.aero = { ...CAR.aero, ...p.aero };
  CAR.steer = { ...CAR.steer, ...p.steer };
  CAR.hull = makeHull(p.body);
}

applySelectedPhysics();

function addVehicleSelector() {
  const grid = document.querySelector('#menu .opt-grid');
  if (!grid || document.getElementById('opt-vehicle')) return;

  const label = document.createElement('label');
  label.className = 'sel';
  label.append('Vehicle ');

  const select = document.createElement('select');
  select.id = 'opt-vehicle';
  select.setAttribute('aria-label', 'Player vehicle');
  for (const vehicle of VEHICLES) {
    const option = document.createElement('option');
    option.value = vehicle.id;
    option.textContent = vehicle.name;
    select.appendChild(option);
  }
  select.value = selectedVehicle().id;
  select.addEventListener('change', () => {
    try { localStorage.setItem(KEY, select.value); } catch { /* storage unavailable */ }
    location.reload();
  });

  label.appendChild(select);
  grid.prepend(label);
}

// White/grey motor-home textures do not respond much to the car's hue-rotation recolouring.
// Keep the original texture detail, but multiply it by the rival/player colour so AI and
// multiplayer motor homes are easy to tell apart.
function tintMotorHome(view, look) {
  if (view.vehicleId !== 'motor-home' || !look) return;
  for (const m of view.mats || []) {
    if (!m) continue;
    m.color.set(look.tint);
    m.userData.base = m.color.clone();
    m.needsUpdate = true;
  }
  view._lookKey = -1;
}

const originalApplyOwnLook = CarVisual.prototype._applyOwnLook;
CarVisual.prototype._applyOwnLook = function patchedApplyOwnLook() {
  originalApplyOwnLook.call(this);
  tintMotorHome(this, this._ownLook);
};

const originalAdopt = CarVisual.prototype.adopt;
CarVisual.prototype.adopt = function patchedAdopt(src, look) {
  const ok = originalAdopt.call(this, src, look);
  if (!ok) return ok;
  this.vehicleId = src.vehicleId;
  tintMotorHome(this, look);
  return ok;
};

// Keep the existing, carefully measured car alignment. For differently modelled vehicles,
// load them normally, then fit the visible mesh to the selected physics footprint and ground it.
const originalLoad = CarVisual.prototype.load;
CarVisual.prototype.load = async function patchedVehicleLoad(url) {
  const config = url ? null : selectedVehicle();
  if (config) this.vehicleId = config.id;
  await originalLoad.call(this, url || config.url);

  if (!config || config.fit !== 'auto' || !this.model) return;

  const model = this.model;
  const holder = this.holder;
  holder.remove(model);

  model.position.set(0, 0, 0);
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);

  let box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) {
    holder.add(model);
    return;
  }

  const size = box.getSize(new THREE.Vector3());
  const longAxis = Math.max(size.x, size.z);
  const targetLength = config.physics?.body?.length || config.targetLength || 4.85;
  if (longAxis > 1e-6) model.scale.setScalar(targetLength / longAxis);

  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;

  // Align the visible model to the SAME centre-of-mass frame as the physics hull.
  // Upright, its lowest point sits at body.bottom relative to the vehicle origin. When the
  // vehicle rolls, both the GLB and the collision hull therefore rotate around the same point.
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const bodyBottom = config.physics?.body?.bottom;
  model.position.y += (Number.isFinite(bodyBottom) ? bodyBottom : -this.restHeight) - box.min.y;

  holder.rotation.y = config.flip ? -Math.PI / 2 : Math.PI / 2;
  holder.add(model);
};

addVehicleSelector();
