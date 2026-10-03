// VW T2-style campervan vehicle extension.
// Adds the model to the shared vehicle catalogue and applies a real-world-inspired
// physics setup before main.js creates the player's Vehicle.
import { VEHICLES } from './vehicleChoice.js';
import { CarVisual } from './carVisual.js';
import { CAR } from './vehicle.js';
import { V3 } from './math.js';

const ID = 'campervan';
const KEY = 'cr.vehicle';

const camper = {
  id: ID,
  name: 'Campervan',
  url: 'cars/campervan.glb',
  fit: 'auto',
  // Slightly game-scaled so the tall T2 body does not look oversized beside the Charger.
  targetLength: 4.05,
  physics: {
    // Approximate early-1970s VW Type 2 proportions, game-tuned for enjoyable handling.
    mass: 1280,
    frontWeight: 0.46,          // rear-engine / rear-drive character
    wheelbase: 2.40,
    track: 1.40,
    wheelRadius: 0.32,
    // A taller vehicle needs a lower effective centre of mass than the old 0.05 setting gave it.
    // Raising the suspension mount relative to the body COM lowers the simulated COM without adding
    // artificial tyre grip, so the van can still lean and slide but is much less eager to trip over.
    mountY: 0.18,
    inertia: { x: 3400, y: 3200, z: 2450 },
    susp: {
      free: 0.48, travel: 0.27,
      kFront: 30000, kRear: 32000,
      cCompFront: 2300, cCompRear: 2450,
      cRebFront: 3250, cRebRear: 3450,
      arbFront: 13500, arbRear: 10500,
      bump: 205000, bumpDamp: 9000,
    },
    tyre: {
      muFront: 1.08, muRear: 1.12,
      B: 10.4, C: 1.23, E: 0,
      loadSens: 0.07, nominalLoad: 3200, maxTyreLoad: 7800,
      slideMu: 0.84, rolling: 0.016,
    },
    engine: {
      idle: 850,
      // The core automatic gearbox shifts around 6300 rpm at full throttle. A 5200 rpm
      // limiter meant the Campervan hit the limiter before it could upshift, leaving it
      // effectively stuck in a low gear. The higher game limiter lets the box shift while
      // the torque curve still falls away like an old VW engine.
      limiter: 6900, stall: 1800,
      peakTorque: 175, efficiency: 0.88,
      curve: [[850, 0.64], [1600, 0.86], [2600, 1.0], [3400, 0.98], [4300, 0.88], [5200, 0.72], [6200, 0.52], [6900, 0.34]],
      gears: [3.8, 2.2, 1.4, 0.93], reverse: 3.8, finalDrive: 4.13,
      engineBrake: 20,
    },
    brakeBias: 0.58,
    wallBounce: 0.24,
    aero: { drag: 0.62, down: 0.16 },
    steer: { max: 0.55, rate: 4.0, returnRate: 6.0 },
    boost: { accel: 3.9, airShare: 0.32, burn: 3.2, refill: 9, restart: 0.2 },
    body: {
      width: 1.68, length: 4.05,
      bottom: -0.46, shoulder: 0.34,
      roof: 1.18, roofWidth: 1.56, roofLength: 3.25,
    },
  },
};

if (!VEHICLES.some((v) => v.id === ID)) VEHICLES.push(camper);

function selectedId() {
  try { return localStorage.getItem(KEY) || 'car'; } catch { return 'car'; }
}

function makeHull(b) {
  const p = [];
  const hx = b.width / 2, hz = b.length / 2;
  const rhx = b.roofWidth / 2, rhz = b.roofLength / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.push(new V3(hx * sx, b.bottom, hz * sz));
    p.push(new V3(hx * sx, b.shoulder, hz * sz));
    p.push(new V3(rhx * sx, b.roof, rhz * sz));
  }
  p.push(new V3(hx, b.shoulder, 0), new V3(-hx, b.shoulder, 0));
  p.push(new V3(0, b.roof, rhz), new V3(0, b.roof, -rhz));
  return p;
}

function applyCamperPhysics() {
  if (selectedId() !== ID) return;
  const p = camper.physics;
  CAR.mass = p.mass;
  CAR.frontWeight = p.frontWeight;
  CAR.wheelbase = p.wheelbase;
  CAR.track = p.track;
  CAR.wheelRadius = p.wheelRadius;
  CAR.mountY = p.mountY;
  CAR.inertia = { ...p.inertia };
  CAR.susp = { ...CAR.susp, ...p.susp };
  CAR.tyre = { ...CAR.tyre, ...p.tyre };
  CAR.engine = { ...CAR.engine, ...p.engine };
  CAR.brakeTotal = 1.30 * p.mass * 9.81;
  CAR.brakeBias = p.brakeBias;
  CAR.wallBounce = p.wallBounce;
  CAR.aero = { ...CAR.aero, ...p.aero };
  CAR.steer = { ...CAR.steer, ...p.steer };
  CAR.boost = { ...CAR.boost, ...p.boost };
  CAR.hull = makeHull(p.body);
  CAR.profileName = '1972 VW Type 2-style campervan';
}

function addOption(select) {
  if (!select || [...select.options].some((o) => o.value === ID)) return;
  const option = document.createElement('option');
  option.value = ID;
  option.textContent = camper.name;
  select.appendChild(option);
  if (selectedId() === ID) select.value = ID;
}

// vehicleChoice.js has already created the selectors by the time this extension runs.
addOption(document.getElementById('opt-vehicle'));
addOption(document.getElementById('mp-vehicle'));
addOption(document.getElementById('mp-join-vehicle'));

applyCamperPhysics();

// Campervans traditionally keep their cream/white roof while the lower painted body changes colour.
// The source model already contains that boundary in its texture, so use the original red paint as
// a mask instead of tinting the entire material. Neutral cream/white, glass, tyres and trim remain unchanged.
const camperTextureCache = new WeakMap();
const camperMaterialBase = new WeakMap();

function recolourCamperBodyTexture(source, look) {
  if (!source?.image || !look?.tint) return null;
  let perTexture = camperTextureCache.get(source);
  if (!perTexture) camperTextureCache.set(source, perTexture = new Map());
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
      const dominance = r - Math.max(g, b);

      // Only original red-painted pixels qualify. Low-saturation cream/white and dark/neutral
      // detail pixels fail these tests and therefore retain their exact source colour.
      if (r < 45 || r < g * 1.12 || r < b * 1.10 || dominance < 14 || hi - lo < 20) continue;

      // Soft edges preserve anti-aliasing, reflections and texture detail around the paint boundary.
      const domStrength = Math.max(0, Math.min(1, (dominance - 14) / 42));
      const satStrength = Math.max(0, Math.min(1, (hi - lo - 20) / 55));
      const strength = domStrength * satStrength;
      if (strength <= 0) continue;

      // Preserve the original pixel's light/dark value, changing hue rather than painting a flat colour.
      const shade = hi / targetMax;
      const nr = Math.min(255, tr * shade);
      const ng = Math.min(255, tg * shade);
      const nb = Math.min(255, tb * shade);
      px[i] = r + (nr - r) * strength;
      px[i + 1] = g + (ng - g) * strength;
      px[i + 2] = b + (nb - b) * strength;
    }

    ctx.putImageData(image, 0, 0);
    out = source.clone();
    out.image = canvas;
    out.needsUpdate = true;
  } catch (e) {
    console.warn('Could not selectively recolour Campervan body texture.', e);
  }

  perTexture.set(key, out);
  return out;
}

function applyCampervanLook(view, look) {
  if (view.vehicleId !== ID) return false;
  for (const m of view.mats || []) {
    if (!m) continue;
    let base = camperMaterialBase.get(m);
    if (!base) {
      base = { map: m.map, color: m.color.clone() };
      camperMaterialBase.set(m, base);
    }

    m.map = base.map;
    m.color.copy(base.color);
    if (look && base.map) {
      const tex = recolourCamperBodyTexture(base.map, look);
      if (tex) m.map = tex;
    }
    m.userData.base = m.color.clone();
    m.needsUpdate = true;
  }
  view._lookKey = -1;
  return true;
}

const previousApplyOwnLook = CarVisual.prototype._applyOwnLook;
CarVisual.prototype._applyOwnLook = function campervanApplyOwnLook() {
  if (applyCampervanLook(this, this._ownLook)) return;
  previousApplyOwnLook.call(this);
};

// Solo rivals normally adopt/clone the player's visual. For Campervan, do not depend on the
// source visual's timing-sensitive vehicleId at all: each rival explicitly loads the Campervan
// config. The GLB request itself is browser-cached, so this is deterministic without repeated downloads.
const previousAdopt = CarVisual.prototype.adopt;
CarVisual.prototype.adopt = function campervanAdopt(src, look) {
  // In solo the rival look has no vehicleId. In multiplayer, respect another player's explicitly
  // selected vehicle instead of forcing every remote player to be a Campervan just because we are.
  if (selectedId() === ID && (!look?.vehicleId || look.vehicleId === ID)) {
    if (this.loaded && this.vehicleId === ID) return true;
    if (!this._campervanSoloLoading) {
      this._campervanSoloLoading = true;
      this.load(camper.url, camper)
        .then(() => {
          this.vehicleId = ID;
          if (look) this.setOwnLook({ ...look, vehicleId: ID });
        })
        .catch((e) => console.warn('Could not load Campervan rival.', e))
        .finally(() => { this._campervanSoloLoading = false; });
    }
    return false;
  }
  return previousAdopt.call(this, src, look);
};
