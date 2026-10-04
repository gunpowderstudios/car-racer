import * as THREE from 'three';
import { CarVisual, RIVAL_LOOKS, MODEL } from './carVisual.js';
import { CAR } from './vehicle.js';
import { SPECS } from './damage.js';
import { Multiplayer } from './multiplayer.js';
import { assetUrl } from './assetVersion.js';

// Player vehicle catalogue. Add future vehicles (for example Tuk Tuk) here.
// `physics` is deliberately optional: the normal car continues to use the original,
// known-good CAR object unchanged.
export const VEHICLES = [
  { id: 'car', name: 'Mr Muscle', url: 'cars/car-shrink.glb', fit: 'measured' },
  {
    id: 'escort', name: '70s Saloon', url: 'cars/escort-shrink.glb',
    fit: 'auto', targetLength: 4.05,
    physics: {
      mass: 920,
      frontWeight: 0.53,
      wheelbase: 2.40,
      track: 1.32,
      wheelRadius: 0.29,
      // Slightly lower effective centre of gravity than before, so the Escort slides
      // and oversteers before it tries to trip over its outside tyres.
      mountY: 0.12,
      inertia: { x: 1800, y: 1750, z: 820 },
      susp: {
        free: 0.42, travel: 0.22,
        kFront: 26000, kRear: 24000,
        cCompFront: 2000, cCompRear: 1850, cRebFront: 2900, cRebRear: 2700,
        arbFront: 14500, arbRear: 10000, bump: 180000, bumpDamp: 8000,
      },
      engine: { peakTorque: 170 },
      brakeBias: 0.60,
      wallBounce: 0.28,
      aero: { drag: 0.42, down: 0.28 },
      steer: { max: 0.57, rate: 4.8, returnRate: 7.0 },
      body: { width: 1.57, length: 4.05, bottom: -0.40, shoulder: 0.32, roof: 0.96, roofWidth: 1.38, roofLength: 2.40 },
    },
  },
  {
    id: 'bmw', name: 'German Beema', url: 'cars/bmw-shrink.glb',
    fit: 'auto', targetLength: 4.33,
    physics: {
      // Late-1980s compact RWD sports saloon proportions. The visible GLB is auto-fitted
      // to these dimensions so its source/export scale does not affect how large it looks.
      mass: 1080,
      frontWeight: 0.52,
      wheelbase: 2.57,
      track: 1.41,
      wheelRadius: 0.30,
      mountY: 0.13,
      inertia: { x: 2050, y: 2100, z: 760 },
      susp: {
        free: 0.43, travel: 0.23,
        kFront: 30000, kRear: 28000,
        cCompFront: 2150, cCompRear: 2050, cRebFront: 3050, cRebRear: 2900,
        arbFront: 15500, arbRear: 11500, bump: 195000, bumpDamp: 8500,
      },
      engine: { peakTorque: 190 },
      brakeBias: 0.59,
      wallBounce: 0.27,
      aero: { drag: 0.43, down: 0.27 },
      steer: { max: 0.55, rate: 4.7, returnRate: 6.9 },
      body: { width: 1.65, length: 4.33, bottom: -0.40, shoulder: 0.30, roof: 0.92, roofWidth: 1.40, roofLength: 2.32 },
    },
  },
  {
    id: 'motor-home', name: 'Motorhome', url: 'cars/motor-home-shrink.glb',
    fit: 'auto', targetLength: 4.85,
    damageMul: 0.8,
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
const MP_RESTORE_KEY = 'cr.mpVehicleRestore';
const fallback = VEHICLES[0];

// Keep a pristine copy of the original car dimensions before a selected vehicle profile mutates CAR.
// Remote multiplayer cars must use THEIR dimensions, not the local player's Motor Home dimensions.
const BASE_CAR = {
  mass: CAR.mass,
  wheelbase: CAR.wheelbase,
  frontWeight: CAR.frontWeight,
  track: CAR.track,
  wheelRadius: CAR.wheelRadius,
  mountY: CAR.mountY,
  susp: { ...CAR.susp },
};

export function selectedVehicle() {
  let id = fallback.id;
  try { id = localStorage.getItem(KEY) || id; } catch { /* storage unavailable */ }
  return VEHICLES.find((v) => v.id === id) || fallback;
}

function vehicleById(id) {
  return VEHICLES.find((v) => v.id === id) || fallback;
}

// Kick off the selected GLB request as soon as this module loads. GLTFLoader will then normally
// hit the browser cache when the scene asks for the model a moment later, reducing the blank wait.
try { fetch(assetUrl(selectedVehicle().url), { cache: 'no-cache' }).catch(() => {}); } catch { /* preload is optional */ }

function physicsForVehicle(config) {
  const p = config?.physics;
  if (!p) return BASE_CAR;
  return {
    ...BASE_CAR,
    ...p,
    susp: { ...BASE_CAR.susp, ...p.susp },
  };
}

function restHeightForVehicle(config) {
  const sp = physicsForVehicle(config);
  const sprungFront = sp.mass * sp.frontWeight / 2;
  const staticCompression = sprungFront * 9.81 / sp.susp.kFront;
  return sp.wheelRadius + (sp.susp.free - staticCompression) - sp.mountY;
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

// Apply the selected profile BEFORE main.js creates its Vehicle. Physics and damage toughness
// now live in the same vehicle definition instead of a separate side-effect module.
function applySelectedProfile() {
  const cfg = selectedVehicle();
  const p = cfg.physics;
  if (p) {
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

  if (cfg.damageMul && cfg.damageMul !== 1) {
    const base = SPECS.player.mul || {};
    SPECS.player.mul = {
      front: (base.front ?? 1) * cfg.damageMul,
      back: (base.back ?? 1) * cfg.damageMul,
      left: (base.left ?? 1) * cfg.damageMul,
      right: (base.right ?? 1) * cfg.damageMul,
    };
  }
}

applySelectedProfile();

function fillVehicleSelect(select) {
  select.innerHTML = '';
  for (const vehicle of VEHICLES) {
    const option = document.createElement('option');
    option.value = vehicle.id;
    option.textContent = vehicle.name;
    select.appendChild(option);
  }
  select.value = selectedVehicle().id;
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
  fillVehicleSelect(select);
  select.addEventListener('change', () => {
    try { localStorage.setItem(KEY, select.value); } catch { /* storage unavailable */ }
    location.reload();
  });

  label.appendChild(select);
  grid.prepend(label);
}

// Multiplayer gets its own obvious vehicle selector on BOTH the Create and Join screens.
// Changing vehicle needs one reload because the local physics profile is chosen before main.js
// creates the Vehicle. Preserve the form and reopen the same multiplayer screen afterwards.
function rememberMultiplayerScreen(screen) {
  const data = {
    screen,
    homeName: document.getElementById('mp-name')?.value || '',
    joinName: document.getElementById('mp-join-name')?.value || '',
    code: document.getElementById('mp-code')?.value || '',
  };
  try { sessionStorage.setItem(MP_RESTORE_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
}

function changeMultiplayerVehicle(id, screen) {
  rememberMultiplayerScreen(screen);
  try { localStorage.setItem(KEY, vehicleById(id).id); } catch { /* storage unavailable */ }
  location.reload();
}

function addMultiplayerVehicleSelector(containerId, selectId, screen) {
  const container = document.getElementById(containerId);
  if (!container || document.getElementById(selectId)) return;

  const nameInput = document.getElementById(screen === 'join' ? 'mp-join-name' : 'mp-name');
  const nameLabel = nameInput?.closest('label');
  if (!nameLabel) return;

  const label = document.createElement('label');
  label.className = 'mp-field';
  label.append('Vehicle');

  const select = document.createElement('select');
  select.id = selectId;
  select.setAttribute('aria-label', 'Vehicle');
  fillVehicleSelect(select);
  select.addEventListener('change', () => changeMultiplayerVehicle(select.value, screen));

  label.appendChild(select);
  nameLabel.insertAdjacentElement('afterend', label);
}

function restoreMultiplayerScreenAfterReload() {
  let data = null;
  try {
    const raw = sessionStorage.getItem(MP_RESTORE_KEY);
    if (raw) data = JSON.parse(raw);
    sessionStorage.removeItem(MP_RESTORE_KEY);
  } catch { /* storage unavailable */ }
  if (!data) return;

  addEventListener('load', () => {
    setTimeout(() => {
      document.getElementById('btn-multiplayer')?.click();
      if (data.homeName) document.getElementById('mp-name').value = data.homeName;
      if (data.screen === 'join') {
        document.getElementById('mp-join-show')?.click();
        if (data.joinName) document.getElementById('mp-join-name').value = data.joinName;
        if (data.code) document.getElementById('mp-code').value = data.code;
      }
    }, 0);
  }, { once: true });
}

// White/grey motor-home textures do not respond much to the car's hue-rotation recolouring.
// Keep the original texture detail, but multiply it by the rival/player colour so AI and
// multiplayer motor homes are easy to tell apart.
function tintStrongVehicle(view, look) {
  if (!look || (view.vehicleId !== 'motor-home' && view.vehicleId !== 'bmw')) return;

  for (const m of view.mats || []) {
    if (!m) continue;

    // The Motorhome keeps its existing broad tint. For German Beema, protect obvious
    // glass, chrome, wheels, tyres, lights and trim so only body-like materials get colour.
    if (view.vehicleId === 'bmw') {
      const name = String(m.name || '').toLowerCase();
      const detail = /glass|window|windscreen|windshield|tyre|tire|wheel|rim|chrome|light|lamp|indicator|bumper|trim|plate|number|badge|grill|grille|mirror/.test(name);
      const transparent = m.transparent || m.opacity < 0.98;
      const metallicDetail = (m.metalness || 0) > 0.65 && (m.roughness ?? 1) < 0.45;
      if (detail || transparent || metallicDetail) continue;
    }

    m.color.set(look.tint);
    m.userData.base = m.color.clone();
    m.needsUpdate = true;
  }
  view._lookKey = -1;
}

const originalApplyOwnLook = CarVisual.prototype._applyOwnLook;
CarVisual.prototype._applyOwnLook = function patchedApplyOwnLook() {
  originalApplyOwnLook.call(this);
  tintStrongVehicle(this, this._ownLook);
};

// Keep the existing, carefully measured car alignment. For differently modelled vehicles,
// load them normally, then fit the visible mesh to the selected physics footprint and ground it.
const originalLoad = CarVisual.prototype.load;
CarVisual.prototype.load = async function patchedVehicleLoad(url, explicitConfig) {
  const config = explicitConfig || (url ? VEHICLES.find((v) => v.url === url) || null : selectedVehicle());
  if (config) this.vehicleId = config.id;

  // Size the temporary loading car roughly like the selected vehicle so the player never starts
  // a race with an apparently empty track while a larger GLB is still downloading/decoding.
  if (config?.physics?.body && this.placeholder) {
    this.placeholder.scale.set(config.physics.body.width / 1.85, 1, (config.targetLength || config.physics.body.length) / 4.85);
  }

  await originalLoad.call(this, assetUrl(url || config.url));

  if (!config || !this.model) return;

  const model = this.model;
  const holder = this.holder;

  // Re-apply the known-good original car measurements for a measured vehicle. Detach the
  // model while measuring it so Box3 cannot accidentally include the player's current world
  // position. That race could make the normal car end up far below the road if the GLB finished
  // loading after the menu/track had already positioned visual.root.
  if (config.fit === 'measured') {
    const wb = BASE_CAR.wheelbase;
    const s = wb / (MODEL.rearAxleX - MODEL.frontAxleX);
    const a = (1 - BASE_CAR.frontWeight) * wb;
    const restHeight = restHeightForVehicle(config);

    holder.remove(model);
    model.scale.setScalar(s);
    if (!MODEL.flip) {
      holder.rotation.y = Math.PI / 2;
      model.position.set(-MODEL.frontAxleX * s - a, 0, -MODEL.centerZ * s);
    } else {
      holder.rotation.y = -Math.PI / 2;
      model.position.set(a - MODEL.rearAxleX * s, 0, MODEL.centerZ * s);
    }
    model.updateMatrixWorld(true);
    const groundBox = new THREE.Box3().setFromObject(model);
    if (!groundBox.isEmpty() && Number.isFinite(groundBox.min.y)) {
      model.position.y = -restHeight - groundBox.min.y;
    } else {
      model.position.y = -restHeight - MODEL.groundY * s;
    }
    holder.add(model);
    this.restHeight = restHeight;
    return;
  }

  if (config.fit !== 'auto') return;

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

  // Ground every auto-fitted visible vehicle by the same suspension/rest-height rule as
  // the measured original car. Using body.bottom here made several cars look 5-11 cm airborne
  // even though their physics wheels were correctly resting on the road.
  const restHeight = restHeightForVehicle(config);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  model.position.y += -restHeight - box.min.y;

  holder.rotation.y = config.flip ? -Math.PI / 2 : Math.PI / 2;
  holder.add(model);
  this.restHeight = restHeight;
};

// Rivals normally clone the local player's model. In multiplayer another player may have chosen
// a different vehicle, so load that vehicle once instead of cloning the wrong one.
const originalAdopt = CarVisual.prototype.adopt;
CarVisual.prototype.adopt = function patchedAdopt(src, look) {
  const wanted = vehicleById(look?.vehicleId || src.vehicleId || fallback.id);
  if (wanted.id !== (src.vehicleId || fallback.id)) {
    if (this.loaded && this.vehicleId === wanted.id) return true;
    if (!this._vehicleLoading) {
      this._vehicleLoading = true;
      this.load(wanted.url, wanted)
        .then(() => {
          if (look) this.setOwnLook(look);
        })
        .catch((e) => console.warn('Could not load remote player vehicle.', e))
        .finally(() => { this._vehicleLoading = false; });
    }
    return false;
  }

  const ok = originalAdopt.call(this, src, look);
  if (!ok) return ok;
  this.vehicleId = src.vehicleId;
  tintStrongVehicle(this, look);
  return ok;
};

// ---------------------------------------------------------------- multiplayer vehicle identity
// Keep the existing multiplayer protocol intact and add one small optional message. Each player
// announces their vehicle after joining; the host stores it in the normal lobby roster and
// broadcasts that roster. Old/missing values safely fall back to the car.
function syncVehicleLooks(players) {
  for (const p of players || []) {
    if (!Number.isInteger(p.hue) || !RIVAL_LOOKS[p.hue]) continue;
    RIVAL_LOOKS[p.hue].vehicleId = vehicleById(p.vehicleId).id;
  }
}

function wrapVehicleHandlers(net) {
  if (net._vehicleHandlersWrapped) return;
  net._vehicleHandlersWrapped = true;

  const onLobby = net.h.onLobby;
  net.h.onLobby = (players, ...rest) => {
    syncVehicleLooks(players);
    return onLobby?.(players, ...rest);
  };

  const onState = net.h.onState;
  net.h.onState = (id, state) => {
    const info = net.players.get(id);
    if (info && Number.isInteger(info.hue) && RIVAL_LOOKS[info.hue]) {
      RIVAL_LOOKS[info.hue].vehicleId = vehicleById(info.vehicleId).id;
    }
    return onState?.(id, state);
  };
}

const originalCreateRoom = Multiplayer.prototype.createRoom;
Multiplayer.prototype.createRoom = async function patchedCreateRoom(name, ...rest) {   // ...rest: createRoom(name, resumeCode) re-opens a saved room
  wrapVehicleHandlers(this);
  const code = await originalCreateRoom.call(this, name, ...rest);
  const mine = this.players.get(this.selfId);
  if (mine) {
    mine.vehicleId = selectedVehicle().id;
    syncVehicleLooks(this.players.values());
    this._broadcastLobby();
  }
  return code;
};

const originalJoinRoom = Multiplayer.prototype.joinRoom;
Multiplayer.prototype.joinRoom = async function patchedJoinRoom(code, name) {
  wrapVehicleHandlers(this);
  const joined = await originalJoinRoom.call(this, code, name);
  if (this.hostConn && this.hostConn.open) {
    this.hostConn.send({ t: 'vehicle', vehicleId: selectedVehicle().id });
  }
  return joined;
};

// A guest who rejoined a lobby (the host's tab was paused or reloaded) tells the host which car they picked, as on first joining.
const originalRejoinOpen = Multiplayer.prototype._onRejoinOpen;
Multiplayer.prototype._onRejoinOpen = function patchedRejoinOpen(conn) {
  originalRejoinOpen.call(this, conn);
  conn.send({ t: 'vehicle', vehicleId: selectedVehicle().id });
};

const originalHostMessage = Multiplayer.prototype._onHostMessage;
Multiplayer.prototype._onHostMessage = function patchedHostMessage(id, msg) {
  if (msg && msg.t === 'vehicle') {
    const p = this.players.get(id);
    if (!p) return;
    p.vehicleId = vehicleById(msg.vehicleId).id;
    syncVehicleLooks(this.players.values());
    this._broadcastLobby();
    return;
  }
  return originalHostMessage.call(this, id, msg);
};

const originalLeave = Multiplayer.prototype.leave;
Multiplayer.prototype.leave = function patchedLeave() {
  for (const look of RIVAL_LOOKS) delete look.vehicleId;
  return originalLeave.call(this);
};

addVehicleSelector();
addMultiplayerVehicleSelector('mp-home', 'mp-vehicle', 'home');
addMultiplayerVehicleSelector('mp-join', 'mp-join-vehicle', 'join');
restoreMultiplayerScreenAfterReload();