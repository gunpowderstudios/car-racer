// VW T2-style campervan visual extension.
// The vehicle catalogue and physics now live centrally in vehicleChoice.js and vehiclePhysicsProfiles.js.
// This file only keeps the Campervan-specific texture recolouring and remote/solo visual loading.
import { VEHICLES } from './vehicleChoice.js';
import { CarVisual } from './carVisual.js';

const ID = 'campervan';
const KEY = 'cr.vehicle';

const camper = () => VEHICLES.find((v) => v.id === ID);
function selectedId() {
  try { return localStorage.getItem(KEY) || 'car'; } catch { return 'car'; }
}

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
      this.load(camper()?.url, camper())
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
