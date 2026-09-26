// Track editor: a top-down blueprint plus an elevation strip. It edits the same track
// definition the game drives, using the same Track class, so what you see is what you drive.
import { Track, normalizeTrack, analyzeTrack, suggestBanks, takeoffRamp } from './track.js';
import { makeTemplate, TEMPLATE_KEYS } from './templates.js';
import { placeProp, BARREL } from './props.js';
import { clamp, lerp } from './math.js';

const $ = (id) => document.getElementById(id);
const PAPER = '#17427a', PAPER_DEEP = '#10335f', LINE = '127,184,230', INK = '#eaf6ff', AMBER = '#ffc857', RED = '#ff6b5e';
const DEG = 180 / Math.PI;

export class Editor {
  constructor({ onDrive, onClose, onSave, toast, preview }) {
    this.cb = { onDrive, onClose, onSave, toast };
    this.preview = preview || null;               // optional 3D view (EditorPreview)
    if (this.preview) this.preview.onScale = (ex) => { $('ed-3d-ex').textContent = ex > 1 ? `heights \u00d7${ex}` : ''; };
    try { this.show3d = localStorage.getItem('cr.ed3d') !== '0'; } catch { this.show3d = true; }
    this.c = $('ed-canvas'); this.g = this.c.getContext('2d');
    this.pc = $('ed-profile'); this.pg = this.pc.getContext('2d');
    this.def = null; this.track = null; this.analysis = { tight: [], crossings: [] };
    this.sel = -1; this.hover = -1;
    this.tool = 'road'; this.selProp = -1; this.hoverProp = -1; this._ghost = null;   // tool: 'road' edits points, 'barrel' drops barrels
    this.view = { x: 0, z: 0, scale: 0.5 };
    this.undoStack = []; this.redoStack = [];
    this.drag = null; this.visible = false; this._raf = 0; this._analyzeT = 0;
    this._bind();
    const sel = $('ed-template');
    sel.innerHTML = '<option value="">Start from a template</option>' + TEMPLATE_KEYS.map((k) => `<option value="${k}">${makeTemplate(k).name}</option>`).join('');
    new ResizeObserver(() => { if (this.visible) { this._resize(); this.draw(); } }).observe(this.c.parentElement);
    new ResizeObserver(() => { if (this.visible) { this._resizeProfile(); this.drawProfile(); } }).observe(this.pc.parentElement);
  }

  // ------------------------------------------------------------- lifecycle
  open(def) {
    this.def = normalizeTrack(def);
    this.undoStack = []; this.redoStack = []; this.sel = -1; this.selProp = -1; this._setTool('road');
    this.visible = true;
    $('ed-name').value = this.def.name;
    this._resize(); this._resizeProfile();
    this.rebuild(true); this.fit(); this.updateUI(); this.draw();
    this._show3d(this.show3d); this.preview?.fit();
  }
  close() { this.visible = false; this.preview?.stop(); }
  _show3d(on) {
    this.show3d = on; try { localStorage.setItem('cr.ed3d', on ? '1' : '0'); } catch { /* blocked */ }
    $('ed-3d').hidden = !on || !this.preview; $('ed-3d-toggle').setAttribute('aria-pressed', String(on));
    if (on && this.visible) this.preview?.play(); else this.preview?.stop();
  }
  get json() { return JSON.stringify(this.def, null, 2); }

  // --------------------------------------------------------------- model
  snapshot() {
    this.undoStack.push(JSON.stringify(this.def));
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0; this._buttons();
  }
  _restore(str) {
    this.def = normalizeTrack(JSON.parse(str));
    if (this.sel >= this.def.handles.length) this.sel = -1;
    this.selProp = -1;
    $('ed-name').value = this.def.name;
    this.rebuild(true); this.updateUI(); this.draw();
  }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(JSON.stringify(this.def)); this._restore(this.undoStack.pop()); this._buttons(); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(JSON.stringify(this.def)); this._restore(this.redoStack.pop()); this._buttons(); }
  _buttons() { $('ed-undo').disabled = !this.undoStack.length; $('ed-redo').disabled = !this.redoStack.length; $('ed-del').disabled = this.selProp >= 0 ? false : (this.sel < 0 || this.def.handles.length <= 4); }

  rebuild(analyseNow = false) {
    try { this.track = new Track(this.def); } catch (e) { return; }
    this.preview?.setTrack(this.track); this.preview?.setProps(this.def.props);
    clearTimeout(this._analyzeT);
    const run = () => { this.analysis = analyzeTrack(this.track); this.updateIssues(); this.draw(); };
    if (analyseNow) run(); else this._analyzeT = setTimeout(run, 140);
    const km = this.track.length / 1000;
    $('ed-length').textContent = `Length ${km.toFixed(2)} km, ${this.def.handles.length} points`;
    this._buttons();
  }
  changed() { this.rebuild(); this.updateInspector(); this.draw(); }

  // ----------------------------------------------------------- view maths
  _resize() {
    const r = this.c.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
    this.c.width = Math.max(10, Math.round(r.width * d)); this.c.height = Math.max(10, Math.round(r.height * d));
    this.w = r.width; this.h = r.height; this.dpr = d;
  }
  _resizeProfile() {
    const r = this.pc.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
    this.pc.width = Math.max(10, Math.round(r.width * d)); this.pc.height = Math.max(10, Math.round(r.height * d));
    this.pw = r.width; this.ph = r.height;
  }
  toScreen(x, z) { return [(x - this.view.x) * this.view.scale + this.w / 2, (z - this.view.z) * this.view.scale + this.h / 2]; }
  toWorld(sx, sy) { return [(sx - this.w / 2) / this.view.scale + this.view.x, (sy - this.h / 2) / this.view.scale + this.view.z]; }
  /** Bounding box of the road itself (not just the points), in world metres. */
  _bounds() {
    const t = this.track;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    if (t) for (let i = 0; i < t.n; i += 2) { const r = t.hw[i]; minX = Math.min(minX, t.px[i] - r); maxX = Math.max(maxX, t.px[i] + r); minZ = Math.min(minZ, t.pz[i] - r); maxZ = Math.max(maxZ, t.pz[i] + r); }
    for (const p of this.def.handles) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    return { minX, maxX, minZ, maxZ };
  }
  /** Scale at which the whole track fits, leaving room for the panels on top of the map. */
  _fitScale() {
    const b = this._bounds(), pad = 40;
    const w = this.w - (this.show3d && this.preview ? Math.min(380, Math.max(240, this.w * 0.3)) + 24 : 0);
    return clamp(Math.min(Math.max(120, w) / (b.maxX - b.minX + pad * 2), (this.h - 60) / (b.maxZ - b.minZ + pad * 2)), 0.03, 6);
  }
  /** Fit the whole track on screen. */
  fit() {
    if (!this.w) return;
    const b = this._bounds(), S = this._fitScale();
    const shift = this.show3d && this.preview ? (Math.min(380, Math.max(240, this.w * 0.3)) + 24) / 2 / S : 0;   // centre in the free area left of the 3D view
    this.view.x = (b.minX + b.maxX) / 2 + shift; this.view.z = (b.minZ + b.maxZ) / 2; this.view.scale = S;
    this.preview?.fit();
  }
  /** Keep the track findable: limit zoom-out to a bit past "fit" and keep part of it on screen. */
  _clampView() {
    const fitS = this._fitScale();
    this.view.scale = clamp(this.view.scale, fitS * 0.5, 8);
    const b = this._bounds(), mx = this.w / 2 / this.view.scale * 0.8, mz = this.h / 2 / this.view.scale * 0.8;
    this.view.x = clamp(this.view.x, b.minX - mx, b.maxX + mx);
    this.view.z = clamp(this.view.z, b.minZ - mz, b.maxZ + mz);
  }
  /** Zoom by `factor` keeping the world point under (sx, sy) fixed. */
  zoomAt(sx, sy, factor) {
    const [wx, wz] = this.toWorld(sx, sy);
    this.view.scale *= factor; this._clampView();
    const [nx, nz] = this.toWorld(sx, sy); this.view.x += wx - nx; this.view.z += wz - nz;
    this._clampView(); this.draw();
  }

  // ------------------------------------------------------------- drawing
  draw() {
    if (!this.visible || !this.track || !this.w) return;
    const g = this.g, t = this.track, S = this.view.scale;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = PAPER; g.fillRect(0, 0, this.w, this.h);
    this._grid(g);

    // road surface
    const step = Math.max(1, Math.round(3 / (S * t.ds)));
    const edge = (i, sg) => this.toScreen(t.px[i] + t.lx[i] * t.hw[i] * sg, t.pz[i] + t.lz[i] * t.hw[i] * sg);
    const hasGap = t.gap.some((v) => v);
    g.fillStyle = 'rgba(234,246,255,.16)'; g.strokeStyle = 'rgba(234,246,255,.85)'; g.lineWidth = 1.4; g.lineJoin = 'round';
    if (!hasGap) {
      g.beginPath();
      for (const sg of [1, -1]) {
        for (let i = 0; i < t.n; i += step) { const [x, y] = edge(i, sg); i === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
        g.closePath();
      }
      g.fill('evenodd'); g.stroke();
    } else {
      let i = 0;
      while (i < t.n) {
        while (i < t.n && t.gap[i]) i++;
        const a = i; while (i < t.n && !t.gap[i]) i++;
        const b = i - 1; if (b <= a) continue;
        g.beginPath();
        for (let k = a; k <= b; k += step) { const [x, y] = edge(k, 1); k === a ? g.moveTo(x, y) : g.lineTo(x, y); }
        for (let k = b; k >= a; k -= step) { const [x, y] = edge(k, -1); g.lineTo(x, y); }
        g.closePath(); g.fill(); g.stroke();
      }
    }

    // centre line coloured by height
    const maxY = Math.max(6, ...t.py);
    g.lineWidth = 2; g.setLineDash([]);
    for (let i = 0; i < t.n; i += 4) {
      const j = (i + 4) % t.n; if (t.gap[i] || t.gap[j]) continue;
      const u = clamp(t.py[i] / maxY, 0, 1);
      g.strokeStyle = `rgb(${Math.round(lerp(127, 255, u))},${Math.round(lerp(227, 200, u))},${Math.round(lerp(255, 87, u))})`;
      const [x1, y1] = this.toScreen(t.px[i], t.pz[i]), [x2, y2] = this.toScreen(t.px[j], t.pz[j]);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }

    // direction arrows
    g.fillStyle = INK;
    for (let i = 30; i < t.n; i += 80) {
      if (t.gap[i]) continue;
      const [x, y] = this.toScreen(t.px[i], t.pz[i]), dx = t.tx[i], dz = t.tz[i], l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
      g.beginPath(); g.moveTo(x + ux * 7, y + uz * 7); g.lineTo(x - ux * 5 - uz * 5, y - uz * 5 + ux * 5); g.lineTo(x - ux * 5 + uz * 5, y - uz * 5 - ux * 5); g.closePath(); g.fill();
    }

    // jump gaps
    g.strokeStyle = RED; g.fillStyle = RED; g.lineWidth = 2; g.setLineDash([5, 4]); g.font = '600 13px "Barlow Condensed", sans-serif';
    t.def.handles.forEach((h, k) => {
      if (!h.gap) return;
      const f = t.frameAt(t.handleS[k]), half = h.gap / 2;
      for (const o of [-half, half]) {
        const q = t.frameAt(t.handleS[k] + o), [x1, y1] = this.toScreen(q.x + t.lx[q.idx] * q.hw, q.z + t.lz[q.idx] * q.hw), [x2, y2] = this.toScreen(q.x - t.lx[q.idx] * q.hw, q.z - t.lz[q.idx] * q.hw);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
      const [cx, cy] = this.toScreen(f.x, f.z); g.setLineDash([]); g.fillText(`jump ${h.gap} m` + (h.kick ? `, ${h.lip} m lip at ${h.kick}\u00b0` : ''), cx + 14, cy + 22); g.setLineDash([5, 4]);
    });
    g.setLineDash([]);

    // start / finish
    {
      const [x1, y1] = edge(0, 1), [x2, y2] = edge(0, -1);
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = PAPER; g.lineWidth = 5; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
      g.fillStyle = INK; g.font = '700 15px "Big Shoulders Display", sans-serif'; g.fillText('Start', x1 + 8, y1 - 8);
    }

    // problems
    g.strokeStyle = RED; g.lineWidth = 3;
    let lastT = -99;
    for (const i of this.analysis.tight) {
      if (i - lastT < 6) continue; lastT = i;
      const [x, y] = this.toScreen(t.px[i], t.pz[i]); g.beginPath(); g.arc(x, y, 12, 0, 7); g.stroke();
    }
    for (const c of this.analysis.crossings) {
      const [x, y] = this.toScreen(c.x, c.z); g.beginPath(); g.moveTo(x - 9, y - 9); g.lineTo(x + 9, y + 9); g.moveTo(x + 9, y - 9); g.lineTo(x - 9, y + 9); g.stroke();
    }

    // props
    this._drawProps(g);

    // handles
    this.def.handles.forEach((h, k) => {
      const [x, y] = this.toScreen(h.x, h.z), on = k === this.sel, hov = k === this.hover;
      g.beginPath(); g.arc(x, y, on ? 9 : 7, 0, 7);
      g.fillStyle = on ? AMBER : PAPER_DEEP; g.fill();
      g.lineWidth = hov || on ? 3 : 2; g.strokeStyle = on ? '#fff' : INK; g.stroke();
      g.fillStyle = on ? '#2a1a00' : INK; g.font = '700 11px "Barlow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(k + 1), x, y + 0.5);
      if (on || hov) { g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = INK; g.font = '600 13px "Barlow Condensed", sans-serif'; g.fillText(`${h.y.toFixed(1)} m`, x + 12, y - 10); }
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    });

    // scale bar
    const bar = [10, 20, 50, 100, 200, 500].find((m) => m * S > 70) || 500;
    g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 2; g.font = '600 13px "Barlow Condensed", sans-serif';
    const bx = this.w - 24 - bar * S, by = this.h - 22;
    g.beginPath(); g.moveTo(bx, by - 5); g.lineTo(bx, by); g.lineTo(bx + bar * S, by); g.lineTo(bx + bar * S, by - 5); g.stroke();
    g.fillText(`${bar} m`, bx, by - 9);
    this.drawProfile();
    this.preview?.setSelected(this.sel);
  }

  _grid(g) {
    const S = this.view.scale;
    let minor = 10; while (minor * S < 14) minor *= 5;
    const major = minor * 5;
    const [x0, z0] = this.toWorld(0, 0), [x1, z1] = this.toWorld(this.w, this.h);
    for (const [step, alpha] of [[minor, 0.14], [major, 0.32]]) {
      g.strokeStyle = `rgba(${LINE},${alpha})`; g.lineWidth = 1; g.beginPath();
      for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const [sx] = this.toScreen(x, 0); g.moveTo(Math.round(sx) + 0.5, 0); g.lineTo(Math.round(sx) + 0.5, this.h); }
      for (let z = Math.floor(z0 / step) * step; z <= z1; z += step) { const [, sy] = this.toScreen(0, z); g.moveTo(0, Math.round(sy) + 0.5); g.lineTo(this.w, Math.round(sy) + 0.5); }
      g.stroke();
    }
  }

  _drawProps(g) {
    const S = this.view.scale, R = Math.max(4.5, BARREL.radius * S * 1.7);
    const icon = (x, y, on, ghost, type) => {
      g.globalAlpha = ghost ? 0.5 : 1;
      g.beginPath(); g.arc(x, y, R, 0, 7); g.fillStyle = type === 'chicken' ? '#f5e6c8' : '#ff9d3a'; g.fill();
      g.lineWidth = on ? 3 : 1.6; g.strokeStyle = on ? '#fff' : INK; g.stroke();
      g.beginPath(); g.arc(x, y, R * 0.45, 0, 7); g.fillStyle = type === 'chicken' ? '#d94b2b' : '#7a2e0c'; g.fill();
      g.globalAlpha = 1;
    };
    this.def.props.forEach((p, k) => { const [x, y] = this.toScreen(p.x, p.z); icon(x, y, k === this.selProp || k === this.hoverProp, false, p.type); });
    if ((this.tool === 'barrel' || this.tool === 'chicken') && this._ghost && !this.drag) icon(this._ghost[0], this._ghost[1], false, true, this.tool);
    if (this.selProp >= 0 && this.def.props[this.selProp]) {
      const p = this.def.props[this.selProp], [x, y] = this.toScreen(p.x, p.z);
      g.fillStyle = INK; g.font = '600 13px "Barlow Condensed", sans-serif'; g.fillText(p.type === 'chicken' ? 'Chicken' : 'Barrel', x + R + 6, y + 4);
    }
  }

  // --------------------------------------------------------- elevation strip
  _pmap() {
    const t = this.track, L = t.length, padL = 44, padR = 18, padT = 14, padB = 22;
    const maxY = Math.max(8, ...this.def.handles.map((h) => h.y + 2), ...t.py);
    return {
      L, maxY, x: (s) => padL + (s / L) * (this.pw - padL - padR), y: (h) => this.ph - padB - (h / maxY) * (this.ph - padT - padB),
      sOf: (px) => ((px - padL) / (this.pw - padL - padR)) * L, hOf: (py) => ((this.ph - padB - py) / (this.ph - padT - padB)) * maxY, padL, padR, padT, padB,
    };
  }
  drawProfile() {
    if (!this.visible || !this.track || !this.pw) return;
    const g = this.pg, t = this.track, m = this._pmap(), d = devicePixelRatio || 1;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = PAPER_DEEP; g.fillRect(0, 0, this.pw, this.ph);
    g.font = '600 12px "Barlow Condensed", sans-serif'; g.fillStyle = INK; g.strokeStyle = `rgba(${LINE},.25)`; g.lineWidth = 1;
    for (let h = 0; h <= m.maxY; h += 5) { const y = Math.round(m.y(h)) + 0.5; g.beginPath(); g.moveTo(m.padL, y); g.lineTo(this.pw - m.padR, y); g.stroke(); g.fillText(`${h} m`, 6, y + 4); }
    for (let s = 0; s <= m.L; s += 200) { const x = Math.round(m.x(s)) + 0.5; g.beginPath(); g.moveTo(x, m.padT); g.lineTo(x, this.ph - m.padB); g.stroke(); g.fillText(`${s}`, x - 8, this.ph - 6); }
    // gap bands
    g.fillStyle = 'rgba(255,107,94,.25)';
    let i = 0; while (i < t.n) { if (t.gap[i]) { const a = i; while (i < t.n && t.gap[i]) i++; g.fillRect(m.x(t.s[a]), m.padT, Math.max(2, m.x(t.s[i - 1]) - m.x(t.s[a])), this.ph - m.padT - m.padB); } else i++; }
    // profile line (coloured by grade)
    g.lineWidth = 2.5;
    for (let k = 0; k < t.n - 1; k += 2) {
      if (t.gap[k] || t.gap[k + 1]) continue;
      const gr = Math.abs(t.ty[k]) * 100, u = clamp(gr / 10, 0, 1);
      g.strokeStyle = `rgb(${Math.round(lerp(234, 255, u))},${Math.round(lerp(246, 107, u))},${Math.round(lerp(255, 94, u))})`;
      g.beginPath(); g.moveTo(m.x(t.s[k]), m.y(t.py[k])); g.lineTo(m.x(t.s[Math.min(k + 2, t.n - 1)]), m.y(t.py[Math.min(k + 2, t.n - 1)])); g.stroke();
    }
    // handle markers
    this.def.handles.forEach((h, k) => {
      const x = m.x(t.handleS[k]), y = m.y(this._lineY(k)), on = k === this.sel;
      g.beginPath(); g.arc(x, y, on ? 8 : 6, 0, 7); g.fillStyle = on ? AMBER : PAPER; g.fill(); g.lineWidth = 2; g.strokeStyle = on ? '#fff' : INK; g.stroke();
      g.fillStyle = on ? '#2a1a00' : INK; g.font = '700 10px Barlow, sans-serif'; g.textAlign = 'center'; g.fillText(String(k + 1), x, y + 3.5); g.textAlign = 'left';
    });
    if (this._ptip) { g.fillStyle = INK; g.font = '600 13px "Barlow Condensed", sans-serif'; g.fillText(this._ptip, this.pw - m.padR - 260, m.padT + 4); }
    else { g.fillStyle = 'rgba(234,246,255,.7)'; g.font = '600 12px "Barlow Condensed", sans-serif'; g.fillText('Height along the lap. Drag a marker up or down. Steeper sections turn red.', m.padL + 6, m.padT + 4); }
  }

  /** Actual centre-line height at handle k (handle height plus banking lift). */
  _lineY(k) { const t = this.track; return t.py[Math.round(t.handleS[k] / t.ds) % t.n]; }

  // ------------------------------------------------------------ UI updates
  updateUI() {
    const d = this.def;
    $('ed-width').value = d.width; $('ed-width-o').textContent = `${d.width} m`;
    $('ed-walls').checked = d.walls;
    this.updateInspector(); this.updateIssues(); this._buttons();
  }
  updateProps() {
    const n = this.def.props.length;
    const nb = this.def.props.filter((p) => p.type === 'barrel').length;
    const nc = this.def.props.filter((p) => p.type === 'chicken').length;
    const parts = [];
    if (nb) parts.push(`${nb} barrel${nb === 1 ? '' : 's'}`);
    if (nc) parts.push(`${nc} chicken${nc === 1 ? '' : 's'}`);
    $('ed-props-count').textContent = parts.length ? `${parts.join(' and ')} on the track.` : 'No props yet.';
    $('ed-props-clear').disabled = !n;
  }
  updateInspector() {
    this.updateProps();
    const h = this.def.handles[this.sel];
    $('ed-none').hidden = !!h; $('ed-inspector').hidden = !h;
    this._buttons();
    if (!h) return;
    $('ed-h').value = h.y; $('ed-h-o').textContent = `${h.y.toFixed(1)} m`;
    $('ed-b').value = h.bank; $('ed-b-o').textContent = `${h.bank.toFixed(1)}\u00b0`;
    const auto = !h.w;
    $('ed-w-auto').checked = auto; $('ed-w').disabled = auto; $('ed-w').value = h.w || this.def.width; $('ed-w-o').textContent = `${h.w || this.def.width} m`;
    $('ed-gap').checked = h.gap > 0; $('ed-gap-len').disabled = !h.gap; $('ed-gap-len').value = h.gap || 14; $('ed-gap-o').textContent = h.gap ? `${h.gap} m` : 'off';
    for (const id of ['ed-lip', 'ed-kick']) { $(id).disabled = !h.gap; $(id).closest('.field').classList.toggle('off', !h.gap); }
    $('ed-lip').value = h.lip; $('ed-lip-o').textContent = h.gap ? `${h.lip.toFixed(1)} m` : '';
    $('ed-kick').value = h.kick; $('ed-kick-o').textContent = h.gap ? (h.kick ? `${h.kick}\u00b0` : 'flat') : '';
    $('ed-ramp').hidden = !h.gap;
    if (h.gap) this.drawRamp(h);
    const t = this.track;
    if (t) {
      const i = Math.round(t.handleS[this.sel] / t.ds) % t.n, k = t.curv[i];
      const r = Math.abs(k) > 1e-4 ? Math.round(1 / Math.abs(k)) : null;
      $('ed-info').innerHTML = `Distance ${Math.round(t.handleS[this.sel])} m<br>Grade ${(t.ty[i] * 100).toFixed(1)}%<br>` + (r ? `Corner radius ${r} m ${k > 0 ? '(left)' : '(right)'}` : 'Straight');
    }
  }
  /** Close-up side view of the selected jump: run-up, curved lip, gap and landing, to scale. */
  drawRamp(h) {
    const c = $('ed-ramp'), r = c.getBoundingClientRect(), d = devicePixelRatio || 1;
    if (!r.width) return;
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d);
    const g = c.getContext('2d'), W = r.width, Hh = r.height; g.setTransform(d, 0, 0, d, 0, 0);
    const ramp = takeoffRamp(h), before = 6, landing = 12, total = before + ramp.len + h.gap + landing;
    const sx = (W - 16) / total, sy = Math.min(sx * 2.5, (Hh - 40) / Math.max(1, ramp.rise + 0.6));   // heights drawn up to 2.5x
    const X = (m) => 8 + m * sx, Y = (m) => Hh - 22 - m * sy;
    g.fillStyle = PAPER_DEEP; g.fillRect(0, 0, W, Hh);
    g.strokeStyle = `rgba(${LINE},.35)`; g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); g.stroke(); g.setLineDash([]);
    // road: run-up and ramp
    g.fillStyle = 'rgba(234,246,255,.14)'; g.strokeStyle = INK; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(before), Y(0));
    for (let x = 0; x <= ramp.len; x += 0.25) g.lineTo(X(before + x), Y(ramp.at(x)));
    g.lineTo(X(before + ramp.len), Y(ramp.at(ramp.len))); g.stroke();
    g.lineTo(X(before + ramp.len), Hh); g.lineTo(X(0), Hh); g.closePath(); g.fill();
    // landing (sits a little lower)
    const l0 = before + ramp.len + h.gap;
    g.beginPath(); g.moveTo(X(l0), Y(-0.4)); g.lineTo(X(total), Y(0)); g.stroke();
    g.lineTo(X(total), Hh); g.lineTo(X(l0), Hh); g.closePath(); g.fill();
    // launch direction from the lip
    const lx = X(before + ramp.len), ly = Y(ramp.rise), a = ramp.angle / DEG;
    g.strokeStyle = AMBER; g.lineWidth = 2; g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + Math.cos(a) * 40, ly - Math.sin(a) * 40 * (sy / sx)); g.stroke(); g.setLineDash([]);
    g.fillStyle = AMBER; g.beginPath(); g.arc(lx, ly, 3.5, 0, 7); g.fill();
    // labels
    g.font = '600 12px "Barlow Condensed", sans-serif'; g.fillStyle = INK;
    g.fillText(`${ramp.len.toFixed(0)} m ramp`, X(before), Hh - 6);
    g.fillStyle = RED; g.fillText(`${h.gap} m gap`, X(before + ramp.len) + 4, Hh - 6);
    g.fillStyle = AMBER; g.fillText(ramp.angle ? `${ramp.angle}\u00b0 lip` : 'flat lip', Math.min(W - 44, lx + 6), Math.max(12, ly - 8));
    g.fillStyle = `rgba(${LINE},.8)`; g.fillText(`${ramp.rise.toFixed(1)} m`, 8, Math.max(12, ly - 4));
  }
  updateIssues() {
    const el = $('ed-issues'); el.innerHTML = '';
    const a = this.analysis, add = (txt, ok) => { const d = document.createElement('div'); d.textContent = txt; if (ok) d.className = 'ok'; el.appendChild(d); };
    if (a.tight.length) add(`Corner too tight for a ${this.def.width} m road (red circles). Move points apart or narrow the road.`);
    if (a.crossings.length) add(`The road crosses itself at the same height (red crosses). Raise one point by 5 m or more to make a bridge.`);
    if (!a.tight.length && !a.crossings.length && this.track) add(`No problems found. ${(this.track.length / 1000).toFixed(2)} km lap.`, true);
  }

  // ----------------------------------------------------------- interaction
  _hit(sx, sy, r = 12) {
    let best = -1, bd = r * r;
    this.def.handles.forEach((h, k) => { const [x, y] = this.toScreen(h.x, h.z), d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; best = k; } });
    return best;
  }
  _hitProp(sx, sy, r = 12) {
    let best = -1, bd = r * r;
    this.def.props.forEach((p, k) => { const [x, y] = this.toScreen(p.x, p.z), d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; best = k; } });
    return best;
  }
  _setTool(t) {
    this.tool = t; this._ghost = null;
    $('ed-tool-barrel').setAttribute('aria-pressed', String(t === 'barrel'));
    $('ed-tool-chicken').setAttribute('aria-pressed', String(t === 'chicken'));
    if (this.c) this.c.style.cursor = (t === 'barrel' || t === 'chicken') ? 'copy' : 'crosshair';
  }
  propsChanged() { this.preview?.setProps(this.def.props); this.updateProps(); this._buttons(); this.draw(); }
  addProp(type, sx, sy) {
    if (!this.track) return;
    const [wx, wz] = this.toWorld(sx, sy);
    if (this.def.props.length >= 400) { this.cb.toast('That is enough props (400).'); return; }
    const p = placeProp(this.track, wx, wz);
    this.snapshot();
    this.def.props.push({ type, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, y: Math.round(p.y * 100) / 100 });
    this.selProp = this.def.props.length - 1; this.sel = -1; this.updateInspector(); this.propsChanged();
  }
  removeProp() {
    if (this.selProp < 0) return;
    this.snapshot(); this.def.props.splice(this.selProp, 1); this.selProp = -1; this.propsChanged();
  }
  _nearestSample(sx, sy, r = 14) {
    const t = this.track; let best = -1, bd = r * r;
    for (let i = 0; i < t.n; i++) { const [x, y] = this.toScreen(t.px[i], t.pz[i]), d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  insertAt(i) {
    const t = this.track, s = t.s[i]; let k = 0;
    for (let q = 0; q < t.handleS.length; q++) if (t.handleS[q] <= s) k = q;
    this.snapshot();
    this.def.handles.splice(k + 1, 0, { x: Math.round(t.px[i]), y: Math.round(t.py[i] * 2) / 2, z: Math.round(t.pz[i]), w: 0, bank: Math.round(t.bank[i] * DEG * 2) / 2, gap: 0 });
    this.sel = k + 1; this.rebuild(true); this.updateUI(); this.draw();
  }
  addPoint() {
    const n = this.def.handles.length, k = this.sel >= 0 ? this.sel : n - 1;
    const t = this.track, s0 = t.handleS[k], s1 = k + 1 < n ? t.handleS[k + 1] : t.length;
    const f = t.frameAt((s0 + s1) / 2), i = f.idx;
    this.insertAt(i);
  }
  removeSelected() {
    if (this.selProp >= 0) { this.removeProp(); return; }
    if (this.sel < 0) return;
    if (this.def.handles.length <= 4) { this.cb.toast('A circuit needs at least 4 points.'); return; }
    this.snapshot(); this.def.handles.splice(this.sel, 1); this.sel = -1;
    this.rebuild(true); this.updateUI(); this.draw();
  }

  _bind() {
    const c = this.c, pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', (e) => {
      const [sx, sy] = pos(e); c.setPointerCapture(e.pointerId);
      const k = e.button === 0 ? this._hit(sx, sy) : -1, pk = k < 0 && e.button === 0 ? this._hitProp(sx, sy) : -1;
      if (k >= 0) { this.sel = k; this.selProp = -1; this.drag = { type: 'handle', k, moved: false }; this.updateInspector(); this.draw(); }
      else if (pk >= 0) { this.selProp = pk; this.sel = -1; this.drag = { type: 'prop', k: pk, moved: false }; this.updateInspector(); this.draw(); }
      else this.drag = { type: 'pan', sx, sy, vx: this.view.x, vz: this.view.z, moved: false, button: e.button };
    });
    c.addEventListener('pointermove', (e) => {
      const [sx, sy] = pos(e), d = this.drag;
      if (!d) {
        const k = this._hit(sx, sy), pk = k < 0 ? this._hitProp(sx, sy) : -1;
        const placing = this.tool === 'barrel' || this.tool === 'chicken';
        if (placing) this._ghost = pk < 0 && k < 0 ? [sx, sy] : null;
        if (k !== this.hover || pk !== this.hoverProp || placing) {
          this.hover = k; this.hoverProp = pk;
          c.style.cursor = k >= 0 || pk >= 0 ? 'grab' : placing ? 'copy' : 'crosshair'; this.draw();
        }
        return;
      }
      if (d.type === 'prop') {
        if (!d.moved) { this.snapshot(); d.moved = true; c.style.cursor = 'grabbing'; }
        const [wx, wz] = this.toWorld(sx, sy), p = this.def.props[d.k], q = placeProp(this.track, wx, wz);
        p.x = Math.round(q.x * 100) / 100; p.z = Math.round(q.z * 100) / 100; p.y = Math.round(q.y * 100) / 100;
        this.propsChanged();
      } else if (d.type === 'handle') {
        if (!d.moved) { this.snapshot(); d.moved = true; c.style.cursor = 'grabbing'; }
        const [wx, wz] = this.toWorld(sx, sy), snap = e.altKey ? 0.1 : 2, h = this.def.handles[d.k];
        h.x = Math.round(wx / snap) * snap; h.z = Math.round(wz / snap) * snap;
        this.rebuild(); this.updateInspector(); this.draw();
      } else {
        const dx = sx - d.sx, dy = sy - d.sy; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
        this.view.x = d.vx - dx / this.view.scale; this.view.z = d.vz - dy / this.view.scale; this._clampView(); this.draw();
      }
    });
    const end = () => {
      const d = this.drag; this.drag = null; c.style.cursor = (this.tool === 'barrel' || this.tool === 'chicken') ? 'copy' : 'crosshair';
      if (d?.type === 'pan' && !d.moved) {
        if ((this.tool === 'barrel' || this.tool === 'chicken') && d.button === 0) this.addProp(this.tool, d.sx, d.sy);
        else { this.sel = -1; this.selProp = -1; this.updateInspector(); this.draw(); }
      }
      if (d?.type === 'handle' && d.moved) this.rebuild(true);
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', (e) => {
      if (this.tool !== 'road') return;
      const [sx, sy] = pos(e); if (this._hit(sx, sy) >= 0 || this._hitProp(sx, sy) >= 0) return;
      const i = this._nearestSample(sx, sy); if (i >= 0) this.insertAt(i);
    });
    // Wheel / trackpad / Magic Mouse. Zoom follows how far you actually scrolled (so the stream of
    // small momentum events from a Magic Mouse or trackpad glides instead of jumping), capped per event.
    // Pinch (ctrlKey) zooms a little faster; a mostly sideways swipe pans instead of zooming.
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.h : 1;
      const dx = e.deltaX * unit, dy = e.deltaY * unit;
      if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy) * 1.5) {
        this.view.x += dx / this.view.scale; this._clampView(); this.draw(); return;
      }
      const k = e.ctrlKey ? 0.006 : 0.0011;
      const [sx, sy] = pos(e);
      this.zoomAt(sx, sy, Math.exp(clamp(-dy * k, -0.08, 0.08)));
    }, { passive: false });
    c.addEventListener('pointerleave', () => { if (this._ghost) { this._ghost = null; this.draw(); } });
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    // elevation strip
    const pc = this.pc, ppos = (e) => { const r = pc.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    pc.addEventListener('pointerdown', (e) => {
      const [sx, sy] = ppos(e), m = this._pmap(), t = this.track; pc.setPointerCapture(e.pointerId);
      let best = -1, bd = 14 * 14;
      this.def.handles.forEach((h, k) => { const d = (m.x(t.handleS[k]) - sx) ** 2 + (m.y(this._lineY(k)) - sy) ** 2; if (d < bd) { bd = d; best = k; } });
      if (best < 0) { let bx = 40; this.def.handles.forEach((h, k) => { const d = Math.abs(m.x(t.handleS[k]) - sx); if (d < bx) { bx = d; best = k; } }); }
      if (best >= 0) { this.sel = best; this.pdrag = { k: best, moved: false, near: bd < 14 * 14 }; this.updateInspector(); this.draw(); }
    });
    pc.addEventListener('pointermove', (e) => {
      const [sx, sy] = ppos(e), m = this._pmap();
      if (this.pdrag && this.pdrag.near) {
        if (!this.pdrag.moved) { this.snapshot(); this.pdrag.moved = true; }
        const lift = this._lineY(this.pdrag.k) - this.def.handles[this.pdrag.k].y;      // banking / ramp lift
        this.def.handles[this.pdrag.k].y = clamp(Math.round((m.hOf(sy) - lift) * 2) / 2, 0, 40); this.changed();
      } else {
        const s = m.sOf(sx); this._ptip = s >= 0 && s <= m.L ? (() => { const f = this.track.frameAt(s), i = f.idx; return `${Math.round(s)} m   height ${f.y.toFixed(1)} m   grade ${(this.track.ty[i] * 100).toFixed(1)}%`; })() : '';
        this.drawProfile();
      }
    });
    const pend = () => { this.pdrag = null; this.rebuild(true); };
    pc.addEventListener('pointerup', pend); pc.addEventListener('pointercancel', pend);
    pc.addEventListener('pointerleave', () => { this._ptip = ''; this.drawProfile(); });

    // toolbar
    $('ed-undo').onclick = () => this.undo(); $('ed-redo').onclick = () => this.redo();
    $('ed-add').onclick = () => this.addPoint(); $('ed-del').onclick = () => this.removeSelected();
    $('ed-tool-barrel').onclick = () => { this._setTool(this.tool === 'barrel' ? 'road' : 'barrel'); this.draw(); };
    $('ed-tool-chicken').onclick = () => { this._setTool(this.tool === 'chicken' ? 'road' : 'chicken'); this.draw(); };
    $('ed-props-clear').onclick = () => { if (!this.def.props.length) return; this.snapshot(); this.def.props = []; this.selProp = -1; this.propsChanged(); this.cb.toast('All props removed.'); };
    $('ed-bank').onclick = () => {
      if (!this.track) return; this.snapshot();
      const banks = suggestBanks(this.track, 12); this.def.handles.forEach((h, i) => { h.bank = banks[i]; });
      this.rebuild(true); this.updateInspector(); this.draw(); this.cb.toast('Corners now lean into the turns.');
    };
    $('ed-rev').onclick = () => {
      this.snapshot(); const [h0, ...rest] = this.def.handles; this.def.handles = [h0, ...rest.reverse()];
      this.def.handles.forEach((h) => { h.bank = -h.bank; });
      this.sel = -1; this.rebuild(true); this.updateUI(); this.draw();
    };
    $('ed-template').onchange = (e) => {
      const k = e.target.value; e.target.value = ''; if (!k) return;
      this.snapshot(); const t = makeTemplate(k); this.def = normalizeTrack(t); this.sel = -1; $('ed-name').value = this.def.name;
      this.rebuild(true); this.fit(); this.updateUI(); this.draw();
    };
    $('ed-fit').onclick = () => { this.fit(); this.draw(); };
    $('ed-3d-toggle').onclick = () => { this._show3d(!this.show3d); this.draw(); };
    $('ed-3d-hide').onclick = () => { this._show3d(false); this.draw(); };
    $('ed-save').onclick = () => { this.cb.onSave(this.def); };
    $('ed-export').onclick = () => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([this.json], { type: 'application/json' }));
      a.download = (this.def.name || 'track').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $('ed-drive').onclick = () => this.cb.onDrive(this.def);
    $('ed-close').onclick = () => this.cb.onClose(this.def);

    // inspector + global fields (one undo step per drag gesture)
    const gesture = (el, apply) => {
      let started = false;
      el.addEventListener('pointerdown', () => { started = false; });
      el.addEventListener('input', () => { if (!started) { this.snapshot(); started = true; } apply(el); this.changed(); });
      el.addEventListener('change', () => { started = false; this.rebuild(true); });
    };
    const H = () => this.def.handles[this.sel];
    gesture($('ed-h'), (el) => { H().y = +el.value; });
    gesture($('ed-b'), (el) => { H().bank = +el.value; });
    gesture($('ed-w'), (el) => { H().w = +el.value; });
    gesture($('ed-gap-len'), (el) => { H().gap = +el.value; });
    gesture($('ed-lip'), (el) => { H().lip = +el.value; });
    gesture($('ed-kick'), (el) => { H().kick = +el.value; });
    gesture($('ed-width'), (el) => { this.def.width = +el.value; $('ed-width-o').textContent = `${el.value} m`; });
    $('ed-w-auto').onchange = (e) => { this.snapshot(); H().w = e.target.checked ? 0 : this.def.width; this.rebuild(true); this.updateInspector(); this.draw(); };
    $('ed-gap').onchange = (e) => {
      this.snapshot(); const h = H(); h.gap = e.target.checked ? 14 : 0;
      this.rebuild(true); this.updateInspector(); this.draw();
    };
    $('ed-walls').onchange = (e) => { this.snapshot(); this.def.walls = e.target.checked; };
    $('ed-name').oninput = (e) => { this.def.name = e.target.value; };

    addEventListener('keydown', (e) => {
      if (!this.visible) return;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
      if (typing) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.removeSelected(); }
      else if (e.key === 'a') this.addPoint();
      else if (e.key === 'b' || e.key === 'B') { this._setTool(this.tool === 'barrel' ? 'road' : 'barrel'); this.draw(); }
      else if (e.key === 'k' || e.key === 'K') { this._setTool(this.tool === 'chicken' ? 'road' : 'chicken'); this.draw(); }
      else if (e.key === 'f' || e.key === 'F') { this.fit(); this.draw(); }
      else if (e.key === '3') { this._show3d(!this.show3d); this.draw(); }
      else if (e.key === 'Escape') { if (this.tool !== 'road') this._setTool('road'); else { this.sel = -1; this.selProp = -1; } this.updateInspector(); this.draw(); }
      else if (e.key === '[' || e.key === ']') { const n = this.def.handles.length; this.sel = (((this.sel < 0 ? 0 : this.sel) + (e.key === ']' ? 1 : -1)) + n) % n; this.updateInspector(); this.draw(); }
    });
  }
}
