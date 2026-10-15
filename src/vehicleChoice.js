import * as THREE from 'three';
import { CarVisual, RIVAL_LOOKS, MODEL } from './carVisual.js';
import { CAR } from './vehicle.js';
import { SPECS } from './damage.js';
import { Multiplayer } from './multiplayer.js';
import { assetUrl } from './assetVersion.js';
import { vehiclePhysicsProfile } from './vehiclePhysicsProfiles.js';
import { TIER_NAMES, detectTier, probeDevice } from './quality.js';

// Player vehicle catalogue. Add the model here and point `physicsProfile` at the matching
// entry in vehiclePhysicsProfiles.js. Physics stays platform-independent and shared by all modes.
export const VEHICLES = [
  { id: 'car', name: 'Mr Muscle', url: 'cars/dodge-shrink.glb', fit: 'auto', targetLength: 4.89, damageMul: 0.95, physicsProfile: 'car' },
  { id: 'escort', name: '70s Saloon', url: 'cars/escort-shrink.glb', fit: 'auto', targetLength: 4.05, damageMul: 1.15, physicsProfile: 'escort' },
  { id: 'bmw', name: 'German Beema', url: 'cars/bmw-shrink.glb', fit: 'auto', targetLength: 4.33, damageMul: 1.0, physicsProfile: 'bmw' },
  {
    id: 'mini',
    name: 'Mini Roundabout',
    description: 'A pocket-sized classic! Change the plugs and pot-noodle your way around corners.',
    url: 'cars/mini-SHRINK.glb',
    fit: 'auto',
    targetLength: 3.05,
    damageMul: 1.2,                  // pocket-sized: not much metal to crumple
    physicsProfile: 'mini',
    neutralBody: true,               // off-white paint: rivals recolour the body panels rather than turning the hue (see carVisual recolour)
  },
  {
    id: 'french-cheese',
    name: 'French Cheese',
    description: 'A bouncy French classic! Smooth enough to carry 24 eggs across a field!',
    url: 'cars/french-cheese-SHRINK.glb',
    fit: 'auto',
    targetLength: 3.83,
    damageMul: 1.25,                 // tin-can bodywork: crumples easily
    physicsProfile: 'french-cheese',
  },
  {
    id: 'panda',
    name: 'Cuddly Panda',
    description: 'Eats, shoots and leaves!',
    url: 'cars/panda-SHRINK.glb',
    fit: 'auto',
    targetLength: 3.54,
    damageMul: 1.15,                 // small and light: not much to crumple
    physicsProfile: 'panda',
  },
  {
    id: 'mobility-car',
    name: 'Mobile Chariot',
    description: 'A fiberglass deathtrap which rolled with the times... literally!',
    url: 'cars/mobility-car-SHRINK.glb',
    fit: 'auto',
    targetLength: 2.9,
    damageMul: 1.4,                  // fibreglass shell: cracks up at the first knock
    physicsProfile: 'mobility-car',
  },
  {
    id: 'volvo',
    name: 'Swedish Massage',
    description: 'Handy for shifting junk up hills!',
    url: 'cars/volvo-SHRINK.glb',
    fit: 'auto',
    targetLength: 4.79,
    damageMul: 0.9,                  // built like a brick: takes 10% less from every hit
    physicsProfile: 'volvo',
  },
  {
    id: 'v8-pilot',
    name: 'Classic Oil Burner',
    description: "Mum drove it, Dad fixed it. A smokin' V8 bruiser!",
    url: 'cars/v8-pilot-SHRINK.glb',
    fit: 'auto',
    targetLength: 4.44,
    damageMul: 0.85,                 // a bruiser: takes 15% less from every hit
    physicsProfile: 'v8-pilot',
  },
  {
    id: 'campervan',
    name: 'Happy Camper',
    url: 'cars/campervan-shrink.glb',
    fit: 'auto',
    targetLength: 4.50,
    damageMul: 1.1,                  // thin tin: crumples a little easier
    physicsProfile: 'campervan',
  },
  {
    id: 'bus',
    name: 'Rootmaster',
    description: "She's got a ticket to ride... and she don't care!",
    url: 'cars/bus-SHRINK.glb',
    fit: 'auto',
    targetLength: 6.4,               // a real Routemaster is 8.4m: shortened so it still fits the tracks
    damageMul: 0.7,                  // a double-decker full of steel: shrugs most hits off
    physicsProfile: 'bus',
  },
  {
    id: 'motor-home', name: 'Motorhome', url: 'cars/motorhome-SHRINK.glb',
    fit: 'auto', targetLength: 4.85, damageMul: 0.8, physicsProfile: 'motor-home',
  },
];

// Lighter copies of the heavy models (cars/lite/, about 30-50k triangles instead of 100-320k, made with gltfpack) for phones and
// other non-'high' devices. `url` stays the car's identity (multiplayer matches on it); only the file that gets fetched changes.
// ?lite=1 / ?lite=0 forces it on or off for testing.
export const LITE_MODELS = ['cars/mini-SHRINK.glb', 'cars/french-cheese-SHRINK.glb', 'cars/campervan-shrink.glb', 'cars/panda-SHRINK.glb', 'cars/volvo-SHRINK.glb', 'cars/bus-SHRINK.glb', 'cars/mobility-car-SHRINK.glb'];
function wantLite() {
  try {
    const qs = new URLSearchParams(location.search), force = qs.get('lite');
    if (force === '1') return true;
    if (force === '0') return false;
    const q = qs.get('q'); let saved = null;
    try { saved = JSON.parse(localStorage.getItem('cr.opts'))?.quality; } catch { /* no saved options */ }
    const forced = TIER_NAMES.includes(q) ? q : TIER_NAMES.includes(saved) ? saved : null;
    return detectTier({ forced, ...probeDevice() }) !== 'high';
  } catch { return false; }
}
const USE_LITE = wantLite();
export function modelUrl(url) { return USE_LITE && LITE_MODELS.includes(url) ? url.replace('cars/', 'cars/lite/') : url; }

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
  inertia: { ...CAR.inertia },
  susp: { ...CAR.susp },
  tyre: { ...CAR.tyre },
  engine: { ...CAR.engine },
  aero: { ...CAR.aero },
  steer: { ...CAR.steer },
  boost: { ...CAR.boost },
  brakeBias: CAR.brakeBias,
  wallBounce: CAR.wallBounce,
};

export function selectedVehicle() {
  let id = fallback.id;
  try { id = localStorage.getItem(KEY) || id; } catch { /* storage unavailable */ }
  return VEHICLES.find((v) => v.id === id) || fallback;
}

export function vehicleById(id) {
  return VEHICLES.find((v) => v.id === id) || fallback;
}

// Kick off the selected GLB request as soon as this module loads. GLTFLoader will then normally
// hit the browser cache when the scene asks for the model a moment later, reducing the blank wait.
try { fetch(assetUrl(modelUrl(selectedVehicle().url)), { cache: 'no-cache' }).catch(() => {}); } catch { /* preload is optional */ }

export function physicsForVehicle(config) {
  const p = vehiclePhysicsProfile(config?.physicsProfile || config?.id || 'car');
  return {
    ...BASE_CAR,
    ...p,
    inertia: { ...BASE_CAR.inertia, ...p.inertia },
    susp: { ...BASE_CAR.susp, ...p.susp },
    tyre: { ...BASE_CAR.tyre, ...p.tyre },
    engine: { ...BASE_CAR.engine, ...p.engine },
    aero: { ...BASE_CAR.aero, ...p.aero },
    steer: { ...BASE_CAR.steer, ...p.steer },
    boost: { ...BASE_CAR.boost, ...p.boost },
  };
}

export function multiplayerVehicleSpec(id) {
  const config = vehicleById(id);
  const p = physicsForVehicle(config);
  const body = p.body || {};
  return {
    id: config.id,
    mass: Math.max(400, Number(p.mass) || BASE_CAR.mass),
    width: Math.max(1.2, Number(body.width) || 1.85),
    length: Math.max(3.2, Number(body.length) || Number(config.targetLength) || 4.60),
    damageMul: Math.max(0.5, Math.min(1.5, Number(p.mpDamageMul ?? config.damageMul ?? 1) || 1)),
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
  const p = physicsForVehicle(cfg);
  CAR.mass = p.mass;
  CAR.frontWeight = p.frontWeight;
  CAR.wheelbase = p.wheelbase;
  CAR.track = p.track;
  CAR.wheelRadius = p.wheelRadius;
  CAR.mountY = p.mountY;
  CAR.inertia = { ...p.inertia };
  CAR.susp = { ...p.susp };
  CAR.tyre = { ...p.tyre };
  CAR.engine = { ...p.engine };
  CAR.brakeTotal = (p.brakeG ?? 1.35) * p.mass * 9.81;
  CAR.brakeBias = p.brakeBias;
  CAR.wallBounce = p.wallBounce;
  CAR.aero = { ...p.aero };
  CAR.steer = { ...p.steer };
  CAR.boost = { ...p.boost };
  CAR.profileName = p.reference || cfg.name;
  if (p.body) { CAR.hull = makeHull(p.body); CAR.body = { width: p.body.width, length: p.body.length }; }   // the size cars-against-cars collision uses (derby.js)

  if (cfg.damageMul && cfg.damageMul !== 1) {
    const base = SPECS.player.mul || {};
    SPECS.player.mul = {
      front: (base.front ?? 1) * cfg.damageMul,
      back: (base.back ?? 1) * cfg.damageMul,
      left: (base.left ?? 1) * cfg.damageMul,
      right: (base.right ?? 1) * cfg.damageMul,
      roof: (base.roof ?? 1) * cfg.damageMul,
    };
  }
}

applySelectedProfile();

/**
 * A little gallery of every vehicle (a picture and a name each) instead of a dropdown, so all the choices are visible at a
 * glance. The pictures are cars/thumbs/<id>.webp - made by tools/make-vehicle-thumbs.py; a car without one just shows its name.
 * Picking a different car calls `onPick(id)` (which reloads the page, as the physics profile is chosen before the game starts).
 */
function buildVehicleGallery(onPick, extraClass = '') {
  const gallery = document.createElement('div');
  gallery.className = `vgallery ${extraClass}`.trim();
  gallery.setAttribute('role', 'radiogroup');
  gallery.setAttribute('aria-label', 'Choose your vehicle');
  const current = selectedVehicle().id;
  for (const vehicle of VEHICLES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'vcard';
    card.dataset.id = vehicle.id;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(vehicle.id === current));
    card.title = vehicle.description ? `${vehicle.name} - ${vehicle.description}` : vehicle.name;
    const img = new Image();
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener('error', () => img.remove());
    img.src = assetUrl(`cars/thumbs/${vehicle.id}.webp`);
    const name = document.createElement('span');
    name.textContent = vehicle.name;
    card.append(img, name);
    card.addEventListener('click', () => { if (vehicle.id !== selectedVehicle().id) onPick(vehicle.id); });
    gallery.appendChild(card);
  }
  return gallery;
}

function addVehicleSelector() {
  const slot = document.getElementById('menu-vehicle-choice');
  if (!slot || slot.querySelector('.vgallery')) return;
  const heading = document.createElement('div');
  heading.className = 'vgallery-title';
  heading.textContent = 'Choose your vehicle';
  slot.append(heading, buildVehicleGallery((id) => {
    try { localStorage.setItem(KEY, id); } catch { /* storage unavailable */ }
    location.reload();
  }));
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
  if (!container || container.querySelector('.vgallery')) return;

  const nameInput = document.getElementById(screen === 'join' ? 'mp-join-name' : 'mp-name');
  const nameLabel = nameInput?.closest('label');
  if (!nameLabel) return;

  const field = document.createElement('div');
  field.className = 'mp-field';
  field.id = selectId;
  field.append('Vehicle', buildVehicleGallery((id) => changeMultiplayerVehicle(id, screen), 'small'));
  nameLabel.insertAdjacentElement('afterend', field);
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
// Keep the Motorhome's existing broad tint, but give the dark BMW its own texture recolouring
// so the paint becomes a proper rival colour instead of black with coloured edges.
const bmwTextureCache = new WeakMap();
const bmwMaterialBase = new WeakMap();

function isBmwDetailMaterial(m) {
  const name = String(m?.name || '').toLowerCase();
  return /glass|window|windscreen|windshield|tyre|tire|wheel|rim|chrome|light|lamp|indicator|bumper|trim|plate|number|badge|grill|grille|mirror|interior|seat/.test(name)
    || m?.transparent || (m?.opacity ?? 1) < 0.98;
}

function recolourBmwPaintTexture(source, look) {
  if (!source?.image || !look?.tint) return null;
  let perTexture = bmwTextureCache.get(source);
  if (!perTexture) bmwTextureCache.set(source, perTexture = new Map());
  const key = look.tint >>> 0;
  if (perTexture.has(key)) return perTexture.get(key);

  let out = null;
  try {
    const img = source.image;
    const w = img.width || img.naturalWidth || img.videoWidth;
    const h = img.height || img.naturalHeight || img.videoHeight;
    if (!w || !h) throw new Error('texture image has no size');

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    const px = image.data;

    const tr = (key >> 16) & 255;
    const tg = (key >> 8) & 255;
    const tb = key & 255;
    const targetMax = Math.max(1, tr, tg, tb);

    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
      const sat = hi - lo;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;

      // The source BMW paint is very dark and mostly neutral. Work on dark/medium-low-saturation
      // pixels, but leave absolute black alone so tyre gaps, deep trim and shadows stay black.
      if (luma < 18 || luma > 150 || sat > 58) continue;

      // Fade in through the darkest tones and fade out before bright chrome/reflections.
      const darkIn = Math.max(0, Math.min(1, (luma - 18) / 28));
      const brightOut = Math.max(0, Math.min(1, (150 - luma) / 45));
      const neutral = Math.max(0, Math.min(1, (58 - sat) / 42));
      const strength = darkIn * brightOut * neutral;
      if (strength <= 0) continue;

      // Lift black paint enough for the rival colour to read, while preserving the source shading.
      const value = 0.30 + (luma / 150) * 0.78;
      const nr = Math.min(255, tr / targetMax * 255 * value);
      const ng = Math.min(255, tg / targetMax * 255 * value);
      const nb = Math.min(255, tb / targetMax * 255 * value);
      px[i] = r + (nr - r) * strength;
      px[i + 1] = g + (ng - g) * strength;
      px[i + 2] = b + (nb - b) * strength;
    }

    ctx.putImageData(image, 0, 0);
    out = source.clone();
    out.image = canvas;
    out.needsUpdate = true;
  } catch (e) {
    console.warn('Could not selectively recolour German Beema paint texture.', e);
  }

  perTexture.set(key, out);
  return out;
}

function applyBmwLook(view, look, sourceView = null) {
  if (view.vehicleId !== 'bmw') return false;
  const colourVariant = view._bmwColourVariant === true;
  const sourceMats = sourceView?.mats || null;

  for (let i = 0; i < (view.mats || []).length; i++) {
    const m = view.mats[i];
    if (!m) continue;

    let base = bmwMaterialBase.get(m);
    if (!base) {
      const sourceMat = sourceMats?.[i];
      base = {
        map: sourceMat?.map || m.map,
        color: (sourceMat?.color || m.color).clone(),
      };
      bmwMaterialBase.set(m, base);
    }

    m.map = base.map;
    m.color.copy(base.color);

    if (colourVariant && look && !isBmwDetailMaterial(m)) {
      if (base.map) {
        const tex = recolourBmwPaintTexture(base.map, look);
        if (tex) m.map = tex;
      } else {
        m.color.set(look.tint);
      }
    }

    m.userData.base = m.color.clone();
    m.needsUpdate = true;
  }

  // Keep the simple far-distance proxy colour-coded without calling setPaint(), which would
  // re-enter _applyOwnLook. The player's own BMW is deliberately left in its original paint.
  if (colourVariant && look && view.material) {
    view.material.color.set(look.tint);
    view.material.userData.base = view.material.color.clone();
  }
  view._lookKey = -1;
  return true;
}

function tintMotorHome(view, look) {
  if (!look || view.vehicleId !== 'motor-home') return;
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
  if (applyBmwLook(this, this._ownLook)) return;
  originalApplyOwnLook.call(this);
  tintMotorHome(this, this._ownLook);
};

// Keep the existing, carefully measured car alignment. For differently modelled vehicles,
// load them normally, then fit the visible mesh to the selected physics footprint and ground it.
const originalLoad = CarVisual.prototype.load;
CarVisual.prototype.load = async function patchedVehicleLoad(url, explicitConfig) {
  const config = explicitConfig || (url ? VEHICLES.find((v) => v.url === url) || null : selectedVehicle());
  const profile = config ? physicsForVehicle(config) : null;
  if (config) {
    this.vehicleId = config.id;
    // A directly loaded BMW is the local/player car unless an adopt path marks this visual as remote afterwards.
    if (config.id === 'bmw') this._bmwColourVariant = false;
  }

  // Size the temporary loading car roughly like the selected vehicle so the player never starts
  // a race with an apparently empty track while a larger GLB is still downloading/decoding.
  if (profile?.body && this.placeholder) {
    this.placeholder.scale.set(profile.body.width / 1.85, 1, (config.targetLength || profile.body.length) / 4.85);
  }

  await originalLoad.call(this, assetUrl(modelUrl(url || config.url)));

  if (!config || !this.model) return;
  if (config.neutralBody) for (const m of this.mats || []) if (m.map) m.map.userData.neutralBody = true;

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
  const targetLength = profile?.body?.length || config.targetLength || 4.85;
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

  // BMW rivals/remotes must start from a clean GLB, not from the already-recoloured clone path.
  // This keeps the local player's real dark paint untouched and gives every rival its own colour.
  if (wanted.id === 'bmw' && look) {
    if (this.loaded && this.vehicleId === 'bmw') {
      this._bmwColourVariant = true;
      this.setOwnLook(look);
      return true;
    }
    if (!this._bmwLoading) {
      this._bmwLoading = true;
      this.load(wanted.url, wanted)
        .then(() => {
          this.vehicleId = 'bmw';
          this._bmwColourVariant = true;
          this.setOwnLook(look);
        })
        .catch((e) => console.warn('Could not load German Beema rival.', e))
        .finally(() => { this._bmwLoading = false; });
    }
    return false;
  }
  if (wanted.id !== (src.vehicleId || fallback.id)) {
    if (this.loaded && this.vehicleId === wanted.id) return true;
    if (!this._vehicleLoading) {
      this._vehicleLoading = true;
      this.load(wanted.url, wanted)
        .then(() => {
          this._bmwColourVariant = wanted.id === 'bmw';
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
  tintMotorHome(this, look);
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