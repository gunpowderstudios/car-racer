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
  name: 'Happy Camper',
  url: 'cars/campervan-shrink.glb',
  fit: 'auto',
  // Full-size 1972 Type 2 proportions: roughly 4.50 m long.
  targetLength: 4.50,
  physics: {
    // 1972 VW Type 2 1600 character: rear-engined, rear-drive, tall, modest power and
    // relatively soft torsion-bar suspension. Real figures are used where the game model supports them,
    // then lightly game-tuned so the van remains usable on jumps and banked tracks.
    mass: 1280,
    frontWeight: 0.44,          // rear-engine / rear-drive weight bias
    wheelbase: 2.40,
    track: 1.41,
    wheelRadius: 0.33,
    // Keep the effective COM low enough to avoid cartoon rollovers, while allowing noticeably more
    // lean and slower transitions than the saloons.
    mountY: 0.18,
    inertia: { x: 3900, y: 3500, z: 2850 },
    susp: {
      free: 0.50, travel: 0.28,
      kFront: 28500, kRear: 31500,
      cCompFront: 2150, cCompRear: 2350,
      cRebFront: 3050, cRebRear: 3300,
      arbFront: 11200, arbRear: 7600,
      bump: 205000, bumpDamp: 9000,
    },
    tyre: {
      muFront: 1.00, muRear: 1.05,
      B: 10.0, C: 1.21, E: 0,
      loadSens: 0.075, nominalLoad: 3200, maxTyreLoad: 7800,
      slideMu: 0.80, rolling: 0.018,
    },
    engine: {
      idle: 850,
      // Stock-style 1584 cc flat-four: about 106 Nm peak torque around 2800 rpm and roughly
      // 50 DIN hp. The game gearbox shifts at higher rpm, so the limiter stays high enough to
      // permit an upshift while the torque curve itself falls away hard above the real power band.
      limiter: 6500, stall: 1550,
      peakTorque: 106, efficiency: 0.86,
      curve: [[850, 0.55], [1400, 0.72], [2200, 0.94], [2800, 1.0], [3600, 0.93], [4300, 0.78], [5100, 0.48], [6000, 0.22], [6500, 0.10]],
      gears: [3.80, 2.06, 1.26, 0.82], reverse: 3.80, finalDrive: 5.375,
      engineBrake: 17,
    },
    brakeBias: 0.60,
    wallBounce: 0.23,
    aero: { drag: 0.80, down: 0.08 },
    steer: { max: 0.57, rate: 3.7, returnRate: 5.5 },
    boost: { accel: 3.3, airShare: 0.30, burn: 3.2, refill: 9, restart: 0.2 },
    body: {
      width: 1.78, length: 4.50,
      bottom: -0.48, shoulder: 0.36,
      roof: 1.24, roofWidth: 1.66, roofLength: 3.62,
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
  CAR.brakeTotal = 1.18 * p.mass * 9.81;
  CAR.brakeBias = p.brakeBias;
  CAR.wallBounce = p.wallBounce;
  CAR.aero = { ...CAR.aero, ...p.aero };
  CAR.steer = { ...CAR.steer, ...p.steer };
  CAR.boost = { ...CAR.boost, ...p.boost };
  CAR.hull = makeHull(p.body);
  CAR.profileName = '1972 VW Type 2 1600 campervan';
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
