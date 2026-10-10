// Procedural textures: no image files to ship, everything is drawn on canvases.
import * as THREE from 'three';

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

function tex(c, { repeat = false, aniso = 8, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Asphalt with edge lines and a dashed centre line. u = across the road, v = along (20 m). */
export function roadTexture(aniso) {
  const r = rng(7);
  const c = canvas(256, 512, (g, w, h) => {
    g.fillStyle = '#44454c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = r() < 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},${0.03 + r() * 0.06})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // darker rubbered racing line, two tracks
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(w * 0.28, 0, w * 0.1, h); g.fillRect(w * 0.62, 0, w * 0.1, h);
    // edge lines
    g.fillStyle = '#e9e4d6';
    g.fillRect(w * 0.035, 0, w * 0.014, h); g.fillRect(w * 0.951, 0, w * 0.014, h);
    // dashed centre line
    g.fillStyle = '#e9e4d6';
    g.fillRect(w * 0.493, h * 0.0, w * 0.014, h * 0.3);
    g.fillRect(w * 0.493, h * 0.5, w * 0.014, h * 0.3);
  });
  return tex(c, { repeat: true, aniso });
}

export function grassTexture(aniso) {
  const r = rng(21);
  const c = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#3c4629'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) {
      const l = 30 + r() * 30;
      g.fillStyle = `hsla(${70 + r() * 30},35%,${l}%,0.18)`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
    }
  });
  const t = tex(c, { repeat: true, aniso });
  t.repeat.set(400, 400);
  return t;
}

/** Skyline windows: dark blue facade with warm lit windows (used as emissive map too). */
export function windowTexture() {
  const r = rng(99);
  const c = canvas(128, 256, (g, w, h) => {
    g.fillStyle = '#05040c'; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h - 6; y += 10) for (let x = 6; x < w - 6; x += 10) {
      if (r() < 0.32) { g.fillStyle = r() < 0.8 ? '#ffc866' : '#ff8a5c'; g.fillRect(x, y, 5, 6); }
    }
  });
  return tex(c, { repeat: false });
}

export function checkerTexture() {
  const c = canvas(256, 64, (g, w, h) => {
    const cs = 16;
    for (let y = 0; y < h / cs; y++) for (let x = 0; x < w / cs; x++) {
      g.fillStyle = (x + y) % 2 ? '#f1ede2' : '#151319'; g.fillRect(x * cs, y * cs, cs, cs);
    }
  });
  return tex(c);
}

export function bannerTexture(text) {
  const c = canvas(1024, 160, (g, w, h) => {
    g.fillStyle = '#251a48'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffb31f'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    g.font = '900 104px "Big Shoulders Display", Impact, "Arial Narrow", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffb31f';
    g.fillText(text, w / 2, h / 2 + 4);
  });
  return tex(c);
}

/** Soft round puff for smoke and sparks. */
export function puffTexture() {
  const c = canvas(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  return tex(c, { srgb: false });
}

/** Packed dirt for an arena floor: brown, mottled, with darker tyre-scuffed patches. Repeats; one tile is about 24 m. */
export function dirtTexture(aniso) {
  const r = rng(52);
  const c = canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#8a6a48'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {                       // big soft patches
      g.fillStyle = `hsla(${24 + r() * 8},${30 + r() * 15}%,${28 + r() * 26}%,0.10)`;
      g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 70, 14 + r() * 40, r() * 3, 0, 7); g.fill();
    }
    for (let i = 0; i < 14000; i++) {                    // grit
      const l = 25 + r() * 45;
      g.fillStyle = `hsla(${22 + r() * 10},30%,${l}%,0.22)`;
      g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 2);
    }
    g.strokeStyle = 'rgba(40,24,12,0.14)'; g.lineWidth = 5;      // churned-up tyre arcs
    for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(r() * w, r() * h, 40 + r() * 140, r() * 6, r() * 6 + 1.2); g.stroke(); }
  });
  return tex(c, { repeat: true, aniso });
}

/** A packed crowd, seen from the front: rows of heads and shirts. Repeats along u. */
export function crowdTexture(aniso) {
  const r = rng(77);
  const shirts = ['#d94b3a', '#f1c94a', '#3d7fd1', '#44a96a', '#e9e4d6', '#8c52c9', '#e07bb0', '#e8913a', '#2b2d42'];
  const c = canvas(256, 64, (g, w, h) => {
    g.fillStyle = '#1b1830'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 5; row++) for (let x = (row % 2) * 4; x < w + 8; x += 8) {
      const y = 6 + row * 12 + r() * 2, tone = 120 + r() * 100;
      g.fillStyle = shirts[Math.floor(r() * shirts.length)]; g.fillRect(x, y + 4, 6, 8);
      g.fillStyle = `rgb(${tone},${tone * 0.78},${tone * 0.6})`; g.beginPath(); g.arc(x + 3, y + 2, 2.6, 0, 7); g.fill();
    }
  });
  const t = tex(c, { repeat: true, aniso: Math.min(aniso, 4) });
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Red and white crash barrier. Repeats along u (one tile is about 8 m). */
export function barrierTexture(aniso) {
  const c = canvas(256, 64, (g, w, h) => {
    g.fillStyle = '#e9e4d6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8342a'; g.fillRect(0, 0, w / 2, h);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, h * 0.82, w, h * 0.18);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(w / 2 - 1, 0, 2, h); g.fillRect(0, 0, 2, h);
  });
  return tex(c, { repeat: true, aniso });
}
