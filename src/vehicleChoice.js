import * as THREE from 'three';
import { CarVisual } from './carVisual.js';

// Player vehicle catalogue. Add future vehicles (for example Tuk Tuk) here.
export const VEHICLES = [
  { id: 'car', name: 'Car', url: 'cars/car-shrink.glb', fit: 'measured' },
  { id: 'motor-home', name: 'Motor Home', url: 'cars/motor-home-shrink.glb', fit: 'auto', targetLength: 4.85 },
];

const KEY = 'cr.vehicle';
const fallback = VEHICLES[0];

function selectedVehicle() {
  let id = fallback.id;
  try { id = localStorage.getItem(KEY) || id; } catch { /* storage unavailable */ }
  return VEHICLES.find((v) => v.id === id) || fallback;
}

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

// Keep the existing, carefully measured car alignment. For differently modelled vehicles,
// load them normally, then fit the visible mesh to the current physics footprint and ground it.
const originalLoad = CarVisual.prototype.load;
CarVisual.prototype.load = async function patchedVehicleLoad(url) {
  const config = url ? null : selectedVehicle();
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
  if (longAxis > 1e-6) model.scale.setScalar((config.targetLength || 4.85) / longAxis);

  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;

  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  model.position.y += -this.restHeight - box.min.y;

  holder.rotation.y = config.flip ? -Math.PI / 2 : Math.PI / 2;
  holder.add(model);
};

addVehicleSelector();
