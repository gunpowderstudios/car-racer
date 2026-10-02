// Graphics quality: three tiers, a guess at which one a device should start on, and an adaptive
// resolution controller that backs off when the frame rate sags. Pure logic - no DOM at import time -
// so it can be unit-tested with `npm test`.

/**
 * pixelRatio   cap on the canvas pixel ratio (the biggest single cost on a high-DPI phone)
 * aa           MSAA; fixed when the renderer is made, so changing tier reloads the page
 * shadow       default for the Shadows checkbox when the player has not chosen yet
 * shadowSize   shadow map resolution; shadowRange is the half-width (m) of the area it covers
 * shadowType   'pcf' (cheap) or 'pcfsoft' (prettier)
 * aniso        anisotropic filtering cap for the ground, road and car textures
 * mirrorEvery  redraw the rear-view mirror every N frames; mirrorScale is its resolution multiplier
 * physicsHz    fixed physics step rate. 60 gives the same handling as 120 in the headless lap tests
 * rivals       default number of derby rivals when the player has not chosen
 * lodDist      rivals/remote cars further than this (m) are drawn as a plain box instead of the
 *              full model. 0 = never. Each full model is 190k-620k triangles.
 * minScale     lowest the adaptive resolution is allowed to go (fraction of pixelRatio)
 */
export const TIERS = {
  low:    { pixelRatio: 1,   aa: false, shadow: false, shadowSize: 1024, shadowRange: 45, shadowType: 'pcf',     aniso: 2, mirrorEvery: 3, mirrorScale: 0.4, physicsHz: 60,  rivals: 3, lodDist: 80, minScale: 0.55 },
  medium: { pixelRatio: 1.5, aa: false, shadow: true,  shadowSize: 1024, shadowRange: 55, shadowType: 'pcf',     aniso: 4, mirrorEvery: 2, mirrorScale: 0.6, physicsHz: 120, rivals: 5, lodDist: 120, minScale: 0.6 },
  high:   { pixelRatio: 2,   aa: true,  shadow: true,  shadowSize: 2048, shadowRange: 70, shadowType: 'pcfsoft', aniso: 8, mirrorEvery: 1, mirrorScale: 1,   physicsHz: 120, rivals: 6, lodDist: 0,  minScale: 0.75 },
};
export const TIER_NAMES = Object.keys(TIERS);

// Mobile GPUs from roughly 2016 and earlier (Adreno 2xx-5xx, Mali-4xx/T-series, PowerVR SGX/GE8xxx).
const OLD_GPU = /adreno[^0-9]*[2-5]\d\d\b|mali-?(4\d\d|t\d+)|powervr\s*(sgx|ge8)|\bsgx\b/i;

/**
 * Pick a starting tier. `forced` (from ?q= or the settings menu) wins. Desktops start on high - the
 * adaptive resolution still protects weak laptops. Touch devices start on medium and drop to low when
 * something says the phone is old or data-saving. Phones that give no hints (iPhones) start on medium
 * and rely on the adaptive resolution.
 */
export function detectTier({ forced, touch = false, memory = 0, cores = 0, saveData = false, gpu = '' } = {}) {
  if (forced && TIERS[forced]) return forced;
  if (!touch) return 'high';
  if (saveData) return 'low';
  if (memory && memory <= 3) return 'low';
  if (cores && cores <= 4) return 'low';
  if (gpu && OLD_GPU.test(gpu)) return 'low';
  return 'medium';
}

/** Read the device hints from the browser. Browser-only; kept out of detectTier so that stays testable. */
export function probeDevice(win = globalThis) {
  const nav = win.navigator || {};
  let gpu = '';
  try {
    const cv = win.document.createElement('canvas');
    const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    const lose = gl && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  } catch { /* no WebGL probe; the hints below still work */ }
  return {
    touch: !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches),
    memory: nav.deviceMemory || 0,
    cores: nav.hardwareConcurrency || 0,
    saveData: !!(nav.connection && nav.connection.saveData),
    gpu,
  };
}

/**
 * Watches frame times in one-second windows and moves a resolution multiplier (0..1 of the tier's pixel
 * ratio). Two slow windows in a row step it down; a long run of smooth windows steps it back up, and
 * each step down doubles how long it waits before trying again, so it settles instead of flapping.
 * If it is already at the floor and still slow, `feed` reports 'floor' so the caller can drop a feature.
 */
export class AdaptiveRes {
  constructor({ min = 0.6, max = 1, slowFps = 45, smoothFps = 57, down = 0.15, up = 0.1 } = {}) {
    Object.assign(this, { min, max, slowFps, smoothFps, down, up });
    this.scale = max;
    this.reset();
    this.upNeeded = 5;       // smooth windows required before stepping up (doubles after every step down)
  }
  reset() { this.t = 0; this.frames = 0; this.slow = 0; this.smooth = 0; }
  /** Feed one real frame time in seconds. Returns {scale} when the multiplier changed, 'floor' at the floor, else null. */
  feed(dt) {
    if (!(dt > 0) || dt > 0.5) { this.t = 0; this.frames = 0; return null; }   // a stall or a hidden tab says nothing about speed
    this.t += dt; this.frames++;
    if (this.t < 1) return null;
    const fps = this.frames / this.t;
    this.t = 0; this.frames = 0;
    if (fps < this.slowFps) { this.smooth = 0; this.slow++; }
    else if (fps >= this.smoothFps) { this.slow = 0; this.smooth++; }
    else { this.slow = 0; this.smooth = 0; }
    if (this.slow >= 2) {
      this.slow = 0;
      this.upNeeded = Math.min(this.upNeeded * 2, 60);
      if (this.scale <= this.min + 1e-6) return 'floor';
      this.scale = Math.max(this.min, +(this.scale - this.down).toFixed(3));
      return { scale: this.scale };
    }
    if (this.smooth >= this.upNeeded && this.scale < this.max - 1e-6) {
      this.smooth = 0;
      this.scale = Math.min(this.max, +(this.scale + this.up).toFixed(3));
      return { scale: this.scale };
    }
    return null;
  }
}
