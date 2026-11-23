// Track editor: a top-down blueprint plus an elevation strip. It edits the same track
// definition the game drives, using the same Track class, so what you see is what you drive.
import { pendingJunctions, keepCrossroad, forgetCrossroad, makeGap, flattenCrossing, structureAt, setStructure, GAP_HEIGHT, TUNNEL_HEIGHT, CROSS_MIN_SIN } from './junctions.js';
import { curveHandle, Track, normalizeTrack, analyzeTrack, suggestBanks, takeoffRamp, crCentripetal, openRoad, MAX_PROPS } from './track.js';
import { smoothHandles } from './smoothTrack.js';
import { makeTemplate, makeRandomTrack, EDITOR_TEMPLATE_KEYS } from './templates.js';
import { placeProp, BARREL } from './props.js';
const STUNT_TOOLS = ['bus', 'boxes', 'target', 'building', 'ramp', 'lights', 'crossing'];
const STUNT_LABEL = { bus: 'Bus', boxes: 'Cardboard boxes', target: 'Bullseye', building: 'Building', ramp: 'Ramp', lights: 'Traffic lights', crossing: 'Pedestrian crossing' };
const SIGNALS = ['lights', 'crossing'];                        // set on the road, turned to the way it runs (see signals.js)
import { clamp, lerp } from './math.js';
import { arenaInfo, arenaOutline } from './arena.js';
import { BUILDING } from './buildings.js';
import { RAMP } from './track.js';
import { EditorMap } from './editorMap.js';

const $ = (id) => document.getElementById(id);
const PAPER = '#17427a', PAPER_DEEP = '#10335f', LINE = '127,184,230', INK = '#eaf6ff', AMBER = '#ffc857', RED = '#ff6b5e';
const DEG = 180 / Math.PI;

export class Editor {
  constructor({ onDrive, onClose, onSave, onShare, toast, preview, vehicles }) {
    this.cb = { onDrive, onClose, onSave, onShare, toast, vehicles };
    this.vehOpts = { car: '', mode: 'static' };
    this.bldOpts = { w: 20, d: 20, h: 25, style: 0 };          // the next building placed
    this.rampOpts = { w: 0, d: RAMP.d, h: RAMP.h };            // the next ramp placed (w 0 = as wide as the road)
    this.preview = preview || null;               // optional 3D view (EditorPreview)
    if (this.preview) this.preview.onScale = (ex) => { $('ed-3d-ex').textContent = ex > 1 ? `heights \u00d7${ex}` : ''; };
    try { this.show3d = localStorage.getItem('cr.ed3d') !== '0'; } catch { this.show3d = true; }
    this.c = $('ed-canvas'); this.g = this.c.getContext('2d');
    this.pc = $('ed-profile'); this.pg = this.pc.getContext('2d');
    this.def = null; this.track = null; this.analysis = { tight: [], crossings: [] };
    this.sel = -1; this.hover = -1;
    this.tool = 'road'; this.selProp = -1; this.hoverProp = -1; this._ghost = null; this.blank = false; this.pen = []; this.penRedo = []; this._penDrag = null; this._penMouse = null;   // tool: 'road' edits points, 'barrel' drops barrels
    this.view = { x: 0, z: 0, scale: 0.5 };
    this.undoStack = []; this.redoStack = [];
    this.drag = null; this.visible = false; this._raf = 0; this._analyzeT = 0;
    this._iconBar();
    this.map = new EditorMap(this);                // (before _bind: its mouse handlers must run first)
    this._bind();
    const sel = $('ed-template');
    sel.innerHTML = '<option value="">Start from a template</option>' + EDITOR_TEMPLATE_KEYS.map((k) => `<option value="${k}">${makeTemplate(k).name}</option>`).join('');
    new ResizeObserver(() => { if (this.visible) { this._resize(); this.draw(); } }).observe(this.c.parentElement);
    new ResizeObserver(() => { if (this.visible) { this._resizeProfile(); this.drawProfile(); } }).observe(this.pc.parentElement);
  }

  /** The scenery icons along the bottom of the map: one click picks a tool, click the map to place it (the same tools as the Scenery menu). */
  _iconBar() {
    const items = [['barrel', '\u{1F6E2}\uFE0F', 'Barrel'], ['skull', '\u2620\uFE0F', 'Skull barrel'], ['fire', '\u{1F525}', 'Fire pit'], ['vehicle', '\u{1F697}', 'Car'], ['bus', '\u{1F68C}', 'Stunt bus'], ['boxes', '\u{1F4E6}', 'Cardboard boxes'], ['target', '\u{1F3AF}', 'Bullseye'], ['building', '\u{1F3E2}', 'Building'], ['ramp', '\u25E2', 'Ramp'], ['lights', '\u{1F6A6}', 'Traffic lights'], ['crossing', '\u{1F6B8}', 'Crossing']];
    const bar = this.iconBar = document.createElement('div'); bar.id = 'ed-icons'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Scenery');
    for (const [k, ic, nm] of items) {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.tool = k; b.title = `${nm}: click, then click the map to place one`; b.setAttribute('aria-label', nm); b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span>${ic}</span><small>${nm}</small>`; b.onclick = () => { $('ed-tool-' + k).click(); }; bar.appendChild(b);
    }
    this.c.parentElement.appendChild(bar);
  }

  // ------------------------------------------------------------- lifecycle
  /** `keepUndo`: coming back from a Test Drive, so the undo history survives. */
  open(def, keepUndo = false) {
    this.def = openRoad(normalizeTrack(def));
    if (!keepUndo) { this.undoStack = []; this.redoStack = []; }
    this.blank = !!def.blank; this.pen = []; this.penRedo = [];
    this.sel = -1; this.selProp = -1; this._setTool(this.blank ? 'pen' : 'road');
    this.visible = true;
    $('ed-name').value = this.def.name;
    if (!keepUndo) this.map.load(this.def.name); else this.map._sync();
    this._resize(); this._resizeProfile();
    this.rebuild(true); this.fit(); this.updateUI(); this.draw();
    this._show3d(this.show3d); this.preview?.fit();
    this._memMsg = ''; this._guard(true);
  }
  close() { if (this._smoothBox) this._smoothClose(true); this._askBox?.remove(); this._askBox = null; this._autosave(); this.visible = false; this.preview?.stop(); this._guard(false); }

  // ------------------------------------------------------ crash protection: a memory gauge, and a copy of the work kept every few seconds
  /** Starts or stops the watchers while the editor is open. The copy (cr.autosave) is kept when you leave and is only cleared by a Save, so a reload never loses the work. */
  _guard(on) {
    clearInterval(this._guardT); this._guardT = 0;
    if (!on) return;                                                              // (the copy stays after leaving: it is only cleared by a Save, so a reload or a trip to the menu never loses the work)
    this._lastSaved = JSON.stringify(this.def);
    const tick = () => { this._autosave(); this._memory(); };
    this._guardT = setInterval(tick, 4000); tick();
    if (!this._unload) { this._unload = () => this._autosave(); addEventListener('pagehide', this._unload); }
  }
  _autosave() {
    if (!this.visible || !this.def) return;
    const now = JSON.stringify(this.def);
    if (now === this._lastSaved) return;                                         // nothing new since the last save
    try { localStorage.setItem('cr.autosave', JSON.stringify({ t: Date.now(), def: this.def })); } catch { /* full or blocked */ }
  }
  /** Called after a Save: the work is safe in the track list, so the copy is not needed until the next change. */
  markSaved() { this._lastSaved = JSON.stringify(this.def); try { localStorage.removeItem('cr.autosave'); } catch { /* blocked */ } }
  _memory() {
    const box = $('ed-mem'); if (!box) return;
    const m = performance && performance.memory, val = box.querySelector('.mem-val'), bar = box.querySelector('.mem-bar i'), note = box.querySelector('.mem-note');
    let pct = -1, msg = '';
    if (m && m.jsHeapSizeLimit) {
      const used = m.usedJSHeapSize / 1048576, max = m.jsHeapSizeLimit / 1048576; pct = used / max;
      val.textContent = `${Math.round(used)} of ${Math.round(max)} MB`; bar.style.width = Math.min(100, pct * 100).toFixed(0) + '%';
      if (pct >= 0.88 && this.show3d) { this._show3d(false); msg = 'Nearly out of memory: the 3D view has been switched off. Save your track now.'; this._memMsg = msg; }
      else if (pct >= 0.88) msg = 'Nearly out of memory! Save your track now, then close other tabs.';
      else if (pct >= 0.7) msg = 'Memory is getting full. Save your track.';
      else msg = this._memMsg && !this.show3d ? '3D view is off to save memory.' : '';
    } else {
      val.textContent = 'not shown here'; bar.style.width = '0'; msg = 'This browser does not report memory. Save often: your work is also copied automatically every few seconds.';
    }
    note.textContent = msg; box.className = pct >= 0.88 ? 'crit' : pct >= 0.7 ? 'warn' : '';
  }
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
    const raw = JSON.parse(str);
    this.def = openRoad(normalizeTrack(raw)); this.blank = !!raw.blank; if (this.blank) this.def.blank = true;
    this.pen = []; this.penRedo = []; if (this.blank && this.tool !== 'pen') this._setTool('pen'); else if (!this.blank && this.tool === 'pen') this._setTool('road');
    if (this.sel >= this.def.handles.length) this.sel = -1; this.multi?.clear();
    this.selProp = -1;
    $('ed-name').value = this.def.name;
    this.rebuild(true); this.updateUI(); this.draw();
  }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(JSON.stringify(this.def)); this._restore(this.undoStack.pop()); this._buttons(); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(JSON.stringify(this.def)); this._restore(this.redoStack.pop()); this._buttons(); }
  _buttons() { const pn = this.tool === 'pen'; $('ed-undo').disabled = !this.undoStack.length && !(pn && this.pen.length); $('ed-redo').disabled = !this.redoStack.length && !(pn && this.penRedo.length); $('ed-del').disabled = this.selProp >= 0 ? false : (this.sel < 0 || this.def.handles.length <= 4); }

  rebuild(analyseNow = false) {
    try { this.track = new Track(this.def); } catch (e) { return; }
    this.preview?.setTrack(this.track); this.preview?.setProps(this.def.props);
    clearTimeout(this._analyzeT);
    const run = () => { this.analysis = analyzeTrack(this.track); this.updateIssues(); this.draw(); if (!this.drag) this._junctionAsk(); };
    if (analyseNow) run(); else this._analyzeT = setTimeout(run, 140);
    const km = this.track.length / 1000;
    $('ed-length').textContent = `Length ${km.toFixed(2)} km, ${this.def.handles.length} points`;
    this._buttons();
  }
  /** Every place the road crosses itself, as the editor knows it: a crossroad, a gap (one road well over the other), or a problem (too uneven or too shallow to join yet). */
  _crossings() {
    const a = this.analysis || {}, out = [];
    for (const c of this.track?.crossroads || []) out.push({ ...c, kind: 'crossroad', dy: 0 });
    for (const c of a.crossings || []) out.push({ ...c, kind: 'problem' });
    for (const c of a.bridges || []) out.push({ ...c, kind: 'bridge', struct: structureAt(this.def, c) });
    return out;
  }
  _crossAt(sx, sy, r = 15) {
    let best = null, bd = r * r;
    for (const c of this._crossings()) { const [x, y] = this.toScreen(c.x, c.z), d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; best = c; } }
    return best;
  }

  /**
   * The "crossroad or gap?" question. It comes up by itself for a new flat crossing (and for an uneven one) and whenever a crossing's
   * marker is clicked, with the current answer ticked. A crossing that is already a gap stays as it is; joining roads at different
   * heights warns first, then raises the lower road up to the higher one.
   */
  _junctionAsk(forced = null, preset = null) {
    if (!this.visible || !this.track || this.def.mode === 'lastStanding') return;
    if (this._askBox && !forced) return;
    const c = forced, auto = false;
    if (!c) return;      // (nothing pops up by itself: a flat crossing is simply a crossroad until its marker is clicked, so the shape of the track can be sorted out first)
    this._askBox?.remove(); this._askBox = null;
    const host = this.c.parentElement, box = this._askBox = document.createElement('div');
    const shallow = c.sin < CROSS_MIN_SIN, here = c.kind === 'crossroad' ? 'cross' : c.kind === 'bridge' ? (c.struct === 'flyover' ? 'fly' : c.struct === 'tunnel' ? 'tunnel' : 'gap') : '';
    const note = c.kind === 'problem' ? `<small class="warn">The two roads are ${c.dy.toFixed(1)} m apart.${shallow ? ' They also cross at too shallow an angle to join.' : ''}</small>` : c.kind === 'bridge' ? `<small>This is already a ${c.struct || 'gap'}: one road is ${c.dy.toFixed(1)} m over the other.</small>` : '';
    box.className = 'ed-junction'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Two roads cross here');
    box.innerHTML = `<b>The road crosses itself here</b>${note}<label><input type="checkbox" data-a="cross"${here === 'cross' ? ' checked' : ''}${shallow ? ' disabled' : ''}> <span><u>Crossroad</u> join the roads, with give way signs</span></label><label><input type="checkbox" data-a="gap"${here === 'gap' ? ' checked' : ''}> <span><u>Gap</u> one road over the other (at least 5 m)</span></label><label><input type="checkbox" data-a="fly"${here === 'fly' ? ' checked' : ''}> <span><u>Flyover</u> a gap with a bridge deck on pillars</span></label><label><input type="checkbox" data-a="tunnel"${here === 'tunnel' ? ' checked' : ''}> <span><u>Tunnel</u> the lower road runs under a roof</span></label><small>Tick the other one to change it.</small><button type="button" class="x" aria-label="Close">&times;</button>`;
    const [sx, sy] = this.toScreen(c.x, c.z), hw = host.clientWidth, hh = host.clientHeight;
    box.style.left = Math.max(8, Math.min(hw - 300, sx + 22)) + 'px'; box.style.top = Math.max(8, Math.min(hh - 190, sy - 40)) + 'px';
    host.appendChild(box);
    const done = () => { if (this._askBox) { this._askBox.remove(); this._askBox = null; } this.rebuild(true); this.updateInspector(); this.draw(); setTimeout(() => this._junctionAsk(), 60); };
    const toGap = (type = '') => {
      const was = this._askBox; this._askBox = null; was?.remove(); this.snapshot();
      const m = makeGap(this.def, c, type === 'tunnel' ? TUNNEL_HEIGHT : GAP_HEIGHT);
      forgetCrossroad(this.def, c); setStructure(this.def, c, type);
      const nm = type || 'gap';
      this.cb.toast(m ? `${nm[0].toUpperCase() + nm.slice(1)} made: one road lifted ${m.toFixed(1)} m so cars can pass under.` : `Now a ${nm}.`);
      done();
    };
    const toCross = () => {
      if (c.kind === 'crossroad') { this.cb.toast('Already a crossroad.'); return done(); }
      if (c.dy >= 0.4) return warn();
      commit(false);
    };
    const warn = () => {                                                  // the roads are at different heights: say so, then flatten on a yes
      box.innerHTML = `<b>These roads are ${c.dy.toFixed(1)} m apart</b><span>To join them as a crossroad, the lower road will be raised to meet the higher one.</span><div class="row"><button type="button" class="go">Flatten the road</button><button type="button" class="no">Cancel</button></div>`;
      box.querySelector('.go').onclick = () => commit(true);
      box.querySelector('.no').onclick = () => { if (auto) (this._dismissed ||= new Set()).add(Math.round(c.x / 10) + ',' + Math.round(c.z / 10)); this._askBox.remove(); this._askBox = null; this.draw(); };
    };
    const commit = (flatten) => {
      const was = this._askBox; this._askBox = null; was?.remove(); this.snapshot();
      if (flatten) {
        const r = flattenCrossing(this.def, c);
        const joined = r >= 0 && new Track(this.def).crossroads.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < 15);
        if (!joined) { this.cb.toast('Could not join those roads: try making them cross more squarely.'); return done(); }
        this.cb.toast(`Crossroad made: the lower road was raised ${r.toFixed(1)} m to meet the higher one.`);
      } else this.cb.toast('Crossroad made. Drive straight over it, and give way.');
      setStructure(this.def, c, ''); keepCrossroad(this.def, c); done();
    };
    box.querySelectorAll('input').forEach((i) => { i.onchange = () => { if (!i.checked) { i.checked = true; return; } if (i.dataset.a === here) return; const a = i.dataset.a; if (a === 'cross') toCross(); else toGap(a === 'fly' ? 'flyover' : a === 'tunnel' ? 'tunnel' : ''); }; });
    if (preset && preset !== (here === 'fly' ? 'flyover' : here === 'tunnel' ? 'tunnel' : here === 'gap' ? 'gap' : '')) { toGap(preset === 'gap' ? '' : preset); return; }
    box.querySelector('.x').onclick = () => {
      if (auto && c.kind === 'crossroad') return commit(false);           // closing the question on a new flat crossing makes it a crossroad
      if (auto) (this._dismissed ||= new Set()).add(Math.round(c.x / 10) + ',' + Math.round(c.z / 10));
      this._askBox.remove(); this._askBox = null; this.draw();
    };
    this.draw();
  }
  /** Fill: turn the drawn shape into one solid arena floor (mode 'lastStanding'), or back into a road round the same outline.
   *  An arena is a short centreline ellipse with a very wide "road": the floor reaches `hw` beyond it, so the outer edge lands on the drawn shape's bounding oval. */
  _fill(on) {
    const t = this.track, d = this.def; if (!t || (!on && d.mode !== 'lastStanding') || (on && d.mode === 'lastStanding')) { this.updateUI(); return; }
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    if (d.mode === 'lastStanding') { const A = arenaInfo(t); x0 = A.cx - A.ax; x1 = A.cx + A.ax; z0 = A.cz - A.az; z1 = A.cz + A.az; }
    else for (let i = 0; i < t.n; i += 2) { const hw = t.hw[i]; x0 = Math.min(x0, t.px[i] - hw * 0.5); x1 = Math.max(x1, t.px[i] + hw * 0.5); z0 = Math.min(z0, t.pz[i] - hw * 0.5); z1 = Math.max(z1, t.pz[i] + hw * 0.5); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, Rx = Math.max(20, (x1 - x0) / 2), Rz = Math.max(20, (z1 - z0) / 2);
    this.snapshot();
    const ring = (a, b) => Array.from({ length: 12 }, (_, k) => { const u = (k / 12) * Math.PI * 2; return { x: cx + a * Math.cos(u), y: 0.65, z: cz + b * Math.sin(u) }; });
    if (on) {
      const hw = Math.min(230, Math.max(8, Math.min(Rx, Rz) * 0.5));
      d.mode = 'lastStanding'; d.width = Math.round(hw * 2); d.handles = ring(Math.max(1, Rx - hw), Math.max(1, Rz - hw));
      d.structures = []; d.blocks = []; d.rollers = []; d.puddles = []; d.rough = [];
    } else {
      delete d.mode; delete d.bumps; d.width = 22; d.handles = ring(Rx - 11, Rz - 11);
    }
    this.def = normalizeTrack(d); this.sel = -1; this.rebuild(true); this.fit(); this.updateUI(); this.draw();
    this.cb.toast(on ? 'Filled: a solid arena. The last car running wins. Untick to go back to a road.' : 'Back to a road round the same outline.');
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
    $('editor').classList.toggle('blank', !!this.blank);
    const g = this.g, t = this.track, S = this.view.scale;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = PAPER; g.fillRect(0, 0, this.w, this.h);
    this._grid(g); this.map.draw(g);
    if (this.blank || this.tool === 'pen') { if (this.tool === 'pen') this._drawPen(g); if (this.blank) return; }

    // road surface
    const step = Math.max(1, Math.round(3 / (S * t.ds)));
    const edge = (i, sg) => this.toScreen(t.px[i] + t.lx[i] * t.hw[i] * sg, t.pz[i] + t.lz[i] * t.hw[i] * sg);
    const hasGap = t.gap.some((v) => v);
    const arena = t.def.mode === 'lastStanding';                    // an arena is one floor, not a road: draw its outline once
    g.fillStyle = 'rgba(234,246,255,.16)'; g.strokeStyle = 'rgba(234,246,255,.85)'; g.lineWidth = 1.4; g.lineJoin = 'round';
    if (arena) {
      const A = arenaInfo(t), pizza = t.def.name === 'Deep Pan Pizza';
      const ring = arenaOutline(A, A.hw, 96);
      g.beginPath();
      ring.forEach((p, k) => { const [x, y] = this.toScreen(p.x, p.z); k ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.closePath();
      if (pizza) {
        g.fillStyle = '#d5b97f'; g.fill();                                            // crust
        const [cx, cy] = this.toScreen(A.cx, A.cz), sauceR = A.ax * 0.8 * S;
        g.fillStyle = '#7f2424'; g.beginPath(); g.arc(cx, cy, sauceR, 0, Math.PI * 2); g.fill();
        for (const b of (t.bumps || [])) {
          const [bx, by] = this.toScreen(b.x, b.z), rr = Math.max(2, b.r * S);
          if (b.h > 0) {
            g.fillStyle = '#1f1e1c'; g.beginPath(); g.arc(bx, by, rr, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#514b42'; g.beginPath(); g.arc(bx, by, rr * 0.62, 0, Math.PI * 2); g.fill();
          } else {
            const gr = g.createRadialGradient(bx, by, rr * 0.15, bx, by, rr);
            gr.addColorStop(0, '#9a621c'); gr.addColorStop(0.55, '#d6a83d'); gr.addColorStop(1, '#f8d762');
            g.fillStyle = gr; g.beginPath(); g.arc(bx, by, rr, 0, Math.PI * 2); g.fill();
            g.strokeStyle = 'rgba(70,35,0,.55)'; g.lineWidth = Math.max(1, rr * 0.1); g.stroke();
          }
        }
        g.strokeStyle = 'rgba(234,246,255,.85)'; g.lineWidth = 1.4; g.stroke();
      } else {
        g.fillStyle = 'rgba(234,246,255,.16)'; g.fill(); g.stroke();
      }
    } else if (!hasGap) {
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

    // barriers along the edges (when ticked): red and white blocks, like the kerb stripes in the game
    if (t.def.walls !== false) {
      g.save(); g.lineWidth = 2; g.lineCap = 'butt';
      const blk = Math.max(4, Math.min(9, 3 * this.view.scale));
      const ringPts = arena ? arenaOutline(arenaInfo(t), arenaInfo(t).hw, 160) : null;
      for (const [col, off] of [['#d8362b', 0], ['#ffffff', blk]]) {
        g.strokeStyle = col; g.setLineDash([blk, blk]); g.lineDashOffset = -off;
        if (arena) {                                                   // a solid arena: the crash wall round the whole outline
          g.beginPath(); ringPts.forEach((q, k) => { const [x, y] = this.toScreen(q.x, q.z); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke();
          continue;
        }
        for (const sg of [1, -1]) {
          let i = 0;
          while (i < t.n) {
            while (i < t.n && t.gap[i]) i++;
            const a = i; while (i < t.n && !t.gap[i]) i++;
            const b = i - 1; if (b <= a) continue;
            g.beginPath();
            for (let k = a; k <= b; k += step) { const [x, y] = edge(k, sg); k === a ? g.moveTo(x, y) : g.lineTo(x, y); }
            g.stroke();
          }
        }
      }
      g.restore();
    }

    // centre line coloured by height
    const maxY = Math.max(6, ...t.py);
    g.lineWidth = 2; g.setLineDash([]);
    for (let i = 0; i < t.n && !arena; i += 4) {                      // (an arena has no road line to show)
      const j = (i + 4) % t.n; if (t.gap[i] || t.gap[j]) continue;
      const u = clamp(t.py[i] / maxY, 0, 1);
      g.strokeStyle = `rgb(${Math.round(lerp(127, 255, u))},${Math.round(lerp(227, 200, u))},${Math.round(lerp(255, 87, u))})`;
      const [x1, y1] = this.toScreen(t.px[i], t.pz[i]), [x2, y2] = this.toScreen(t.px[j], t.pz[j]);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }

    // direction arrows
    g.fillStyle = INK;
    for (let i = 30; i < t.n && !arena; i += 80) {
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

    // start / finish (an arena has none)
    if (!arena) {
      const [x1, y1] = edge(0, 1), [x2, y2] = edge(0, -1);
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = PAPER; g.lineWidth = 5; g.setLineDash([5, 5]); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
      g.fillStyle = INK; g.font = '700 15px "Big Shoulders Display", sans-serif'; g.fillText('Start', x1 + 8, y1 - 8);
    }

    // problems
    g.strokeStyle = RED; g.lineWidth = 3;
    let lastT = -99;
    for (const i of (arena ? [] : this.analysis.tight)) {
      if (i - lastT < 6) continue; lastT = i;
      const [x, y] = this.toScreen(t.px[i], t.pz[i]); g.beginPath(); g.arc(x, y, 12, 0, 7); g.stroke();
    }
    for (const c of this.analysis.crossings) {
      const [x, y] = this.toScreen(c.x, c.z); g.beginPath(); g.moveTo(x - 9, y - 9); g.lineTo(x + 9, y + 9); g.moveTo(x + 9, y - 9); g.lineTo(x - 9, y + 9); g.stroke();
    }

    // crossroads: a little 3D junction (a thick grey plus of road with a white dashed middle), so the crossing can be clicked and changed
    for (const c of this.analysis.crossroads || []) {
      const [x, y] = this.toScreen(c.x, c.z), r = Math.max(15, 16 * Math.min(1.4, this.view.scale / 2));
      this._junctionIcon(g, x, y, r);
    }

    // gaps (one road clearly over the other): two little ramps facing each other with the jump between them
    for (const c of this.analysis.bridges || []) {
      const [x, y] = this.toScreen(c.x, c.z), r = Math.max(15, 16 * Math.min(1.4, this.view.scale / 2));
      const st = structureAt(this.def, c);
      if (st === 'flyover') this._flyoverIcon(g, x, y, r); else if (st === 'tunnel') this._tunnelIcon(g, x, y, r); else this._gapIcon(g, x, y, r);
    }

    // props
    this._drawProps(g);

    if (this.drag?.type === 'marquee') { const m = this.drag; g.save(); g.fillStyle = 'rgba(255,170,0,0.12)'; g.strokeStyle = AMBER; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.fillRect(Math.min(m.sx, m.x2), Math.min(m.sy, m.y2), Math.abs(m.x2 - m.sx), Math.abs(m.y2 - m.sy)); g.strokeRect(Math.min(m.sx, m.x2), Math.min(m.sy, m.y2), Math.abs(m.x2 - m.sx), Math.abs(m.y2 - m.sy)); g.restore(); }
    // handles
    if (!arena) this.def.handles.forEach((h, k) => {
      const [x, y] = this.toScreen(h.x, h.z), on = k === this.sel || !!this.multi?.has(k), hov = k === this.hover;
      g.beginPath(); g.arc(x, y, on ? 9 : 7, 0, 7);
      g.fillStyle = on ? AMBER : PAPER_DEEP; g.fill();
      g.lineWidth = hov || on ? 3 : 2; g.strokeStyle = on ? '#fff' : INK; g.stroke();
      g.fillStyle = on ? '#2a1a00' : INK; g.font = '700 11px "Barlow", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(k + 1), x, y + 0.5);
      if (on || hov) { g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = INK; g.font = '600 13px "Barlow Condensed", sans-serif'; g.fillText(`${h.y.toFixed(1)} m`, x + 12, y - 10); }
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    });

    // curve handles: on the selected point, and on every point next to a too-sharp spot (a red circle) so you know where to bend the road
    if (!this.blank) for (const k of this._bezPoints()) this._drawBez(g, k, k !== this.sel);

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

  _placing() { return this.tool === 'barrel' || this.tool === 'skull' || this.tool === 'fire' || this.tool === 'vehicle' || STUNT_TOOLS.includes(this.tool); }
  /** Where the turn handle of a prop sits on screen (null if it cannot be turned): out from its middle, along the way it points. Dragging it round sets `rot` (degrees) or a car's `yaw`. */
  _rotHandle(p) {
    if (!p || !['building', 'ramp', 'bus', 'boxes', 'vehicle'].includes(p.type)) return null;
    if (p.type === 'building' && this.track?.buildings?.find((q) => this.def.props[q.pi] === p)?.tunnel) return null;          // (a tunnel turns itself to follow the road)
    const S = this.view.scale, [x, y] = this.toScreen(p.x, p.z);
    let dx, dy, reach = 34;
    if (p.type === 'vehicle') { const a = p.yaw || 0; dx = Math.sin(a); dy = Math.cos(a); }
    else { const th = (p.rot || 0) * Math.PI / 180; if (p.type === 'ramp') { dx = Math.sin(th); dy = Math.cos(th); reach = 20 + Math.max(26, (p.d || RAMP.d) * S) / 2; } else { dx = -Math.sin(th); dy = -Math.cos(th); if (p.type === 'building') reach = 20 + Math.max(26, (p.d || BUILDING.d) * S) / 2; } }
    return { x: x + dx * reach, y: y + dy * reach, cx: x, cy: y };
  }
  _rotateTo(p, sx, sy, free) {
    const h = this._rotHandle(p); if (!h) return;
    const px = sx - h.cx, py = sy - h.cy; if (px * px + py * py < 16) return;
    const snap = (deg) => free ? Math.round(deg) : Math.round(deg / 5) * 5;
    if (p.type === 'vehicle') { p.yaw = Math.round(Math.atan2(px, py) * 100) / 100; return; }
    const th = p.type === 'ramp' ? Math.atan2(px, py) : Math.atan2(-px, -py), deg = (((snap(th * 180 / Math.PI)) % 360) + 360) % 360;
    if (deg) p.rot = deg; else delete p.rot;
  }
  _toolType() { return this.tool === 'fire' ? 'fire' : this.tool === 'vehicle' ? 'vehicle' : STUNT_TOOLS.includes(this.tool) ? this.tool : 'barrel'; }

  _drawProps(g) {
    const S = this.view.scale, R = Math.max(9, BARREL.radius * S * 3.4);      // (props are drawn twice as big as they once were, so they are easy to pick up)
    const icon = (x, y, on, ghost, type, skull, vp) => {
      g.globalAlpha = ghost ? 0.5 : 1;
      if (type === 'vehicle') {                                   // a car seen from above, nose pointing the way it faces; green and arrowed if it drives, blue-grey and parked if not
        const yaw = vp?.yaw || 0, [ex, ey] = this.toScreen(vp ? vp.x + Math.sin(yaw) : 0, vp ? vp.z + Math.cos(yaw) : 0), [cx, cy] = vp ? this.toScreen(vp.x, vp.z) : [x, y];
        const ang = vp ? Math.atan2(ey - cy, ex - cx) : -Math.PI / 2, len = Math.max(26, 4.4 * S), wid = Math.max(14, 1.9 * S), mode = vp ? vp.mode : this.vehOpts.mode, driving = mode !== 'static';
        g.save(); g.translate(x, y); g.rotate(ang);
        g.beginPath(); g.roundRect(-len / 2, -wid / 2, len, wid, Math.min(4, wid / 3)); g.fillStyle = mode === 'race' ? '#d99a12' : driving ? '#2f9d5b' : '#6f86a6'; g.fill(); g.lineWidth = on ? 3 : 1.6; g.strokeStyle = on ? '#fff' : INK; g.stroke();
        g.fillStyle = 'rgba(10,20,40,.75)'; g.fillRect(len * 0.08, -wid * 0.36, len * 0.2, wid * 0.72);           // windscreen, toward the nose
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(len * 0.5 + 1, 0); g.lineTo(len * 0.5 - wid * 0.35, -wid * 0.28); g.lineTo(len * 0.5 - wid * 0.35, wid * 0.28); g.closePath(); g.fill();
        if (!driving || mode === 'race') { g.fillStyle = '#fff'; g.font = `700 ${Math.round(wid * 0.8)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.rotate(-ang); g.fillText(mode === 'race' ? 'R' : 'P', 0, 1); }
        g.restore(); g.globalAlpha = 1; return;
      }
      if (type === 'ramp') {                                       // a ramp seen from above: striped, with an arrow up the slope (the way you climb it)
        const th = (vp?.rot || 0) * Math.PI / 180, bw = Math.max(18, (vp?.w || RAMP.w) * S), bd = Math.max(26, (vp?.d || RAMP.d) * S);
        g.save(); g.translate(x, y); g.rotate(Math.PI - th);
        const gr = g.createLinearGradient(0, bd / 2, 0, -bd / 2); gr.addColorStop(0, '#6f6d68'); gr.addColorStop(1, '#ffc21a');
        g.fillStyle = gr; g.fillRect(-bw / 2, -bd / 2, bw, bd); g.lineWidth = on ? 3 : 1.6; g.strokeStyle = on ? '#fff' : INK; g.strokeRect(-bw / 2, -bd / 2, bw, bd);
        g.fillStyle = '#1b1b1b'; g.beginPath(); g.moveTo(0, -bd / 2 + 3); g.lineTo(bw * 0.28, -bd / 2 + 3 + Math.min(14, bd * 0.3)); g.lineTo(-bw * 0.28, -bd / 2 + 3 + Math.min(14, bd * 0.3)); g.closePath(); g.fill();
        g.restore();
        g.fillStyle = '#fff'; g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${vp?.h || RAMP.h} m`, x, y); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
        g.globalAlpha = 1; return;
      }
      if (type === 'building') {                                   // a building seen from above: its real footprint, turned by its angle; a tunnel when it sits over the road
        const w = vp?.w || BUILDING.w, d = vp?.d || BUILDING.d, th = (vp?.rot || 0) * Math.PI / 180, bw = Math.max(26, w * S), bd = Math.max(26, d * S);
        const bl = vp && this.track?.buildings?.find((q) => this.def.props[q.pi] === vp), tun = !!bl?.tunnel;
        g.save(); g.translate(x, y); g.rotate(-th);
        g.fillStyle = tun ? '#6a6a70' : ['#3a3550', '#4a4540', '#35465a', '#5a4a42', '#2f4a4a', '#553c48', '#4d5260', '#403a30'][(vp?.style || 0) % 8]; g.fillRect(-bw / 2, -bd / 2, bw, bd);
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.beginPath(); for (let i = 1; i < 4; i++) { g.moveTo(-bw / 2 + i * bw / 4, -bd / 2); g.lineTo(-bw / 2 + i * bw / 4, bd / 2); } g.stroke();
        g.lineWidth = on ? 3 : 1.6; g.strokeStyle = on ? '#fff' : INK; g.strokeRect(-bw / 2, -bd / 2, bw, bd);
        if (vp?.name && !tun) { g.strokeStyle = '#ffc857'; g.lineWidth = 3; g.beginPath(); g.moveTo(-bw / 2, bd / 2); g.lineTo(bw / 2, bd / 2); g.stroke(); }          // (the front, where the name board goes)
        g.restore();
        g.fillStyle = '#fff'; g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(tun ? 'tunnel' : vp?.name || `${vp?.h || BUILDING.h} m`, x, y); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
        g.globalAlpha = 1; return;
      }
      if (type === 'lights' || type === 'crossing') {                                      // set across the road, turned the way the road runs
        const th = (vp?.rot || 0) * Math.PI / 180, rw = Math.max(26, (this.track?.def?.width || 14) * S), dp = Math.max(12, (type === 'crossing' ? 4 : 1.2) * S);
        g.save(); g.translate(x, y); g.rotate(-th);
        if (type === 'crossing') {
          g.fillStyle = 'rgba(40,40,48,.85)'; g.fillRect(-rw / 2, -dp / 2, rw, dp); g.fillStyle = '#fff';
          for (let i = 0; i < 9; i++) g.fillRect(-rw / 2 + (i + 0.15) * rw / 9, -dp / 2 + 1, rw / 9 * 0.55, dp - 2);
          g.lineWidth = on ? 3 : 1.4; g.strokeStyle = on ? '#fff' : INK; g.strokeRect(-rw / 2, -dp / 2, rw, dp);
        } else {
          g.fillStyle = '#fff'; g.fillRect(-rw / 2, -2, rw, 4);                           // the stop line
          g.fillStyle = '#16181d'; g.beginPath(); g.roundRect(-9, -22, 18, 44, 5); g.fill(); g.lineWidth = on ? 3 : 1.4; g.strokeStyle = on ? '#fff' : INK; g.stroke();
          [['#ff4a3d', -13], ['#ffc02e', 0], ['#38d26b', 13]].forEach(([c, dy]) => { g.fillStyle = c; g.beginPath(); g.arc(0, dy, 5, 0, 7); g.fill(); });
        }
        g.restore(); g.globalAlpha = 1; return;
      }
      if (type === 'bus' || type === 'boxes' || type === 'target') {      // stunt props: true size when zoomed in, never smaller than a good handful of pixels, turned by their angle
        const th = (vp?.rot || 0) * Math.PI / 180, up = vp?.up || 0;
        g.save(); g.translate(x, y); g.rotate(-th);
        if (type === 'bus') {
          const w = Math.max(18, 2.6 * S), l = Math.max(36, 9 * S);
          g.fillStyle = '#c0281f'; g.fillRect(-w / 2, -l / 2, w, l); g.lineWidth = on ? 3 : 1.6; g.strokeStyle = on ? '#fff' : INK; g.strokeRect(-w / 2, -l / 2, w, l);
          g.fillStyle = 'rgba(10,20,40,.7)'; g.fillRect(-w / 2 + 2, -l / 2 + 2, w - 4, l * 0.16);       // (the windscreen: the nose points up the map)
        } else if (type === 'boxes') {
          const s2 = Math.max(24, 9 * S);
          g.fillStyle = '#b98a54'; g.fillRect(-s2 / 2, -s2 / 2, s2, s2); g.lineWidth = on ? 3 : 1.6; g.strokeStyle = on ? '#fff' : '#7a5a30'; g.strokeRect(-s2 / 2, -s2 / 2, s2, s2);
          g.strokeStyle = '#7a5a30'; g.lineWidth = 1; g.beginPath(); for (let i = 1; i < 5; i++) { g.moveTo(-s2 / 2 + i * s2 / 5, -s2 / 2); g.lineTo(-s2 / 2 + i * s2 / 5, s2 / 2); g.moveTo(-s2 / 2, -s2 / 2 + i * s2 / 5); g.lineTo(s2 / 2, -s2 / 2 + i * s2 / 5); } g.stroke();
        } else {
          const R2 = Math.max(20, 9 * S);
          [['#f4f1e8', 1], ['#d02a1f', 0.78], ['#f4f1e8', 0.53], ['#d02a1f', 0.27]].forEach(([c, k]) => { g.beginPath(); g.arc(0, 0, R2 * k, 0, 7); g.fillStyle = c; g.fill(); });
          g.beginPath(); g.arc(0, 0, R2, 0, 7); g.lineWidth = on ? 3 : 1.6; g.strokeStyle = on ? '#fff' : INK; g.stroke(); g.beginPath(); g.arc(0, 0, R2 * 0.12, 0, 7); g.fillStyle = '#ffc21a'; g.fill();
        }
        g.restore();
        if (type === 'bus' && up > 0.5) { g.fillStyle = '#fff'; g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(`${up}m`, x, y); g.textAlign = 'start'; g.textBaseline = 'alphabetic'; }
        g.globalAlpha = 1; return;
      }
      if (type === 'fire') {
        g.beginPath(); g.arc(x, y, R * 1.15, 0, 7); g.fillStyle = '#2a1410'; g.fill(); g.lineWidth = on ? 3 : 1.6; g.strokeStyle = on ? '#fff' : '#ff6a10'; g.stroke();
        g.beginPath(); g.moveTo(x, y - R * 0.95); g.bezierCurveTo(x + R * 0.9, y - R * 0.2, x + R * 0.7, y + R * 0.7, x, y + R * 0.75); g.bezierCurveTo(x - R * 0.7, y + R * 0.7, x - R * 0.9, y - R * 0.1, x, y - R * 0.95); g.fillStyle = '#ff8a1a'; g.fill();
        g.beginPath(); g.ellipse(x, y + R * 0.3, R * 0.28, R * 0.38, 0, 0, 7); g.fillStyle = '#ffe27a'; g.fill();
        g.globalAlpha = 1; return;
      }
      g.beginPath(); g.arc(x, y, R, 0, 7); g.fillStyle = skull ? '#1b1b1f' : '#ff9d3a'; g.fill();
      g.lineWidth = on ? 3 : 1.6; g.strokeStyle = on ? '#fff' : skull ? '#ffc21a' : INK; g.stroke();
      if (skull) { g.fillStyle = '#ffc21a'; g.font = `700 ${Math.round(R * 1.5)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('\u2620', x, y + 1); g.textAlign = 'start'; g.textBaseline = 'alphabetic'; }
      else { g.beginPath(); g.arc(x, y, R * 0.45, 0, 7); g.fillStyle = '#7a2e0c'; g.fill(); }
      g.globalAlpha = 1;
    };
    this.def.props.forEach((p, k) => { const [x, y] = this.toScreen(p.x, p.z); icon(x, y, k === this.selProp || k === this.hoverProp, false, p.type, !!p.lethal, p); });
    if ((this._placing()) && this._ghost && !this.drag) icon(this._ghost[0], this._ghost[1], false, true, this._toolType(), this.tool === 'skull');
    if (this.selProp >= 0 && this.def.props[this.selProp]) {
      const p = this.def.props[this.selProp], [x, y] = this.toScreen(p.x, p.z), rh = this._rotHandle(p);
      if (rh) {                                                                  // the turn handle: drag it round
        g.save(); g.strokeStyle = AMBER; g.fillStyle = AMBER; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, y); g.lineTo(rh.x, rh.y); g.stroke(); g.setLineDash([]);
        g.beginPath(); g.arc(rh.x, rh.y, 8, 0, 7); g.fill(); g.fillStyle = '#2a1a00'; g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('\u21bb', rh.x, rh.y + 0.5); g.restore();
      }
      g.fillStyle = INK; g.font = '600 13px "Barlow Condensed", sans-serif'; g.fillText(p.type === 'vehicle' ? (p.mode === 'race' ? 'Race car' : p.mode === 'regular' ? 'Traffic car' : p.mode === 'driving' ? 'Driving car' : 'Parked car') : p.type === 'fire' ? 'Fire pit' : STUNT_LABEL[p.type] ? STUNT_LABEL[p.type] : p.lethal ? 'Skull barrel' : 'Barrel', x + R + 6, y + 4);
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
    { const arena = d.mode === 'lastStanding'; $('ed-fill').checked = arena; $('ed-fill').disabled = !!(d.getaway || d.weeval); $('ed-width').disabled = arena; }
    this.updateInspector(); this.updateIssues(); this._buttons();
  }
  updateProps() {
    const n = this.def.props.length;
    const nb = this.def.props.filter((p) => p.type === 'barrel' && !p.lethal).length, ns = this.def.props.filter((p) => p.type === 'barrel' && p.lethal).length;
    const nf = this.def.props.filter((p) => p.type === 'fire').length, nv = this.def.props.filter((p) => p.type === 'vehicle').length, parts = [];
    const nbus = this.def.props.filter((p) => p.type === 'bus').length, nbx = this.def.props.filter((p) => p.type === 'boxes').length, ntg = this.def.props.filter((p) => p.type === 'target').length;
    if (nbus) parts.push(`${nbus} bus${nbus === 1 ? '' : 'es'}`);
    if (nbx) parts.push(`${nbx} stack${nbx === 1 ? '' : 's'} of boxes`);
    if (ntg) parts.push('a bullseye');
    const nrp = this.def.props.filter((p) => p.type === 'ramp').length; if (nrp) parts.push(`${nrp} ramp${nrp === 1 ? '' : 's'}`);
    const nbl = this.def.props.filter((p) => p.type === 'building').length; if (nbl) parts.push(`${nbl} building${nbl === 1 ? '' : 's'}`);
    if (nv) parts.push(`${nv} car${nv === 1 ? '' : 's'}`);
    if (nf) parts.push(`${nf} fire pit${nf === 1 ? '' : 's'}`);
    if (nb) parts.push(`${nb} barrel${nb === 1 ? '' : 's'}`);
    if (ns) parts.push(`${ns} skull barrel${ns === 1 ? '' : 's'}`);
    $('ed-props-count').textContent = parts.length ? `${parts.join(' and ')} on the track.` : 'No props yet.';
    $('ed-props-clear').disabled = !n;
  }
  updateInspector() {
    this.updateProps(); this._vehPanel(); this._stuntPanel(); this._buildPanel();
    $('ed-h').max = this.def.weeval ? 120 : 40; $('ed-gap-len').max = this.def.weeval ? 150 : 70;      // (a stunt track is a great deal bigger)
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
    const lip = Number.isFinite(+h.lip) && h.lip !== null && h.lip !== '' ? +h.lip : 0.5, kick = Number(h.kick) || 0;      // (a point added in the editor has no lip or kick yet)
    $('ed-lip').value = lip; $('ed-lip-o').textContent = h.gap ? `${lip.toFixed(1)} m` : '';
    $('ed-kick').value = kick; $('ed-kick-o').textContent = h.gap ? (kick ? `${kick}\u00b0` : 'flat') : '';
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
    if (this.def.mode === 'lastStanding') { add('Open arena: the floor is everything inside the outline, and the wall stands at its edge. Use Shorter / Longer to resize it, or untick Fill to go back to a road and reshape it.', true); return; }
    if (a.tight.length) add(`Corner too tight for a ${this.def.width} m road (red circles). Move points apart or narrow the road.`);
    if (a.crossings.length) add(`The road crosses itself at the same height (red crosses), but too differently or too slantwise to be a crossroad. Make the two roads meet at the same height, cross more squarely, or raise one point by 5 m or more to make a bridge.`);
    if (a.crossroads?.length && !a.crossings.length) add(`${a.crossroads.length} crossroad${a.crossroads.length === 1 ? '' : 's'} (white squares): the barriers are open and the roads are levelled where they cross. Raise one road by 5 m or more to make a bridge instead.`, true);
    if (!a.tight.length && !a.crossings.length && this.track) add(`No problems found. ${(this.track.length / 1000).toFixed(2)} km lap.`, true);
  }

  // ----------------------------------------------------------- interaction
  _hit(sx, sy, r = 12) {
    if (this.def.mode === 'lastStanding') return -1;                 // an arena is a shape, not a road: its few centre points mean nothing to you, so they are not shown or grabbed
    let best = -1, bd = r * r;
    this.def.handles.forEach((h, k) => { const [x, y] = this.toScreen(h.x, h.z), d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; best = k; } });
    return best;
  }
  /** The crossroad map icon: a short slab of road in the shape of a plus, drawn at an angle so it has a top and a thickness. */
  _junctionIcon(g, x, y, r) {
    const plus = (k) => { const a = r, b = r * 0.36; g.beginPath(); g.moveTo(-b, -a); g.lineTo(b, -a); g.lineTo(b, -b); g.lineTo(a, -b); g.lineTo(a, b); g.lineTo(b, b); g.lineTo(b, a); g.lineTo(-b, a); g.lineTo(-b, b); g.lineTo(-a, b); g.lineTo(-a, -b); g.lineTo(-b, -b); g.closePath(); };
    g.save(); g.lineJoin = 'round'; g.lineWidth = 1.5; g.strokeStyle = '#0b1f3f';
    for (const [dy, fill] of [[r * 0.34, '#5d7596'], [r * 0.17, '#7d93b3'], [0, '#eef3fa']]) {
      g.save(); g.translate(x, y + dy); g.scale(1, 0.62); g.rotate(Math.PI / 4); plus(); g.fillStyle = fill; g.fill(); if (!dy) g.stroke(); g.restore();
    }
    g.save(); g.translate(x, y); g.scale(1, 0.62); g.rotate(Math.PI / 4); g.strokeStyle = '#d68a00'; g.lineWidth = 1.6; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(-r * 0.85, 0); g.lineTo(r * 0.85, 0); g.moveTo(0, -r * 0.85); g.lineTo(0, r * 0.85); g.stroke(); g.restore();
    g.restore();
  }
  /** The flyover map icon: a bridge deck on two pillars with a little road passing underneath. */
  _flyoverIcon(g, x, y, r) {
    const w = r * 1.2, base = y + r * 0.6, deck = y - r * 0.15;
    g.save(); g.lineJoin = 'round'; g.lineWidth = 1.6; g.strokeStyle = '#0b1f3f';
    g.fillStyle = '#7d93b3'; for (const sx of [-0.62, 0.62]) { g.beginPath(); g.rect(x + sx * w - r * 0.14, deck, r * 0.28, base - deck); g.fill(); g.stroke(); }
    g.fillStyle = '#eef3fa'; g.beginPath(); g.rect(x - w, deck - r * 0.3, w * 2, r * 0.3); g.fill(); g.stroke();
    g.strokeStyle = '#d68a00'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x - w * 0.9, deck - r * 0.15); g.lineTo(x + w * 0.9, deck - r * 0.15); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#0b1f3f'; g.beginPath(); g.moveTo(x - w * 1.1, base); g.lineTo(x + w * 1.1, base); g.stroke();
    g.restore();
  }
  /** The tunnel map icon: a rounded portal in a block of rock, dark inside, with the road above. */
  _tunnelIcon(g, x, y, r) {
    const w = r * 1.05, base = y + r * 0.6, top = y - r * 0.55;
    g.save(); g.lineJoin = 'round'; g.lineWidth = 1.6; g.strokeStyle = '#0b1f3f'; g.fillStyle = '#9aa8bb';
    g.beginPath(); g.rect(x - w, top, w * 2, base - top); g.fill(); g.stroke();
    g.fillStyle = '#1a2330'; g.beginPath(); g.moveTo(x - w * 0.5, base); g.lineTo(x - w * 0.5, y - r * 0.05); g.arc(x, y - r * 0.05, w * 0.5, Math.PI, 0); g.lineTo(x + w * 0.5, base); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#d68a00'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x - w * 0.9, top + r * 0.12); g.lineTo(x + w * 0.9, top + r * 0.12); g.stroke(); g.setLineDash([]);
    g.restore();
  }
  /** The gap map icon: two ramps facing each other across a gap, with the jump drawn as a dotted arc. */
  _gapIcon(g, x, y, r) {
    const w = r * 1.15, h = r * 0.7, gap = r * 0.3, base = y + r * 0.45;
    g.save(); g.lineJoin = 'round'; g.lineWidth = 1.6; g.strokeStyle = '#10151c'; g.fillStyle = '#ffc933';
    g.beginPath(); g.moveTo(x - gap - w, base); g.lineTo(x - gap, base); g.lineTo(x - gap, base - h); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x + gap + w, base); g.lineTo(x + gap, base); g.lineTo(x + gap, base - h); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - gap - w * 1.15, base); g.lineTo(x + gap + w * 1.15, base); g.lineWidth = 1.2; g.stroke();
    g.setLineDash([2, 3]); g.lineWidth = 1.5; g.strokeStyle = '#10151c'; g.beginPath(); g.moveTo(x - gap, base - h); g.quadraticCurveTo(x, base - h - r * 0.8, x + gap, base - h); g.stroke();
    g.restore();
  }
  /** The points whose curve handles show: the selected one, plus the nearest point to each too-sharp spot (sharp ones first have a red tint). */
  _bezPoints() {
    const out = new Set(), t = this.track; if (!t || t.def.mode === 'lastStanding') return [];
    if (this.sel >= 0 && this.def.handles[this.sel]) out.add(this.sel);
    for (const i of this.analysis?.tight || []) {
      const sd = t.s[i]; let best = -1, bd = 1e9;
      t.handleS.forEach((hs, k) => { let d = Math.abs(hs - sd); d = Math.min(d, t.length - d); if (d < bd) { bd = d; best = k; } });
      if (best >= 0 && bd < 60) out.add(best);
    }
    return [...out];
  }
  _drawBez(g, k, sharp) {
    const h = this.def.handles[k]; if (!h) return;
    const [vx, vz] = curveHandle(this.def.handles, k), [x, y] = this.toScreen(h.x, h.z), [ox, oy] = this.toScreen(h.x + vx, h.z + vz), [ix, iy] = this.toScreen(h.x - vx, h.z - vz);
    g.save(); g.strokeStyle = sharp ? '#e0452f' : '#1b7fd1'; g.fillStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(ix, iy); g.lineTo(x, y); g.lineTo(ox, oy); g.stroke();
    for (const [ex, ey, lead] of [[ox, oy, true], [ix, iy, false]]) { g.beginPath(); g.arc(ex, ey, 6, 0, 7); g.fill(); g.stroke(); if (lead) { g.beginPath(); g.arc(ex, ey, 2.2, 0, 7); g.fillStyle = sharp ? '#e0452f' : '#1b7fd1'; g.fill(); g.fillStyle = '#fff'; } }
    g.restore();
  }
  /** Which curve-handle end is under (sx, sy): { k, side } for a handle end of a shown point, or null. */
  _hitBez(sx, sy) {
    if (this.blank) return null;
    for (const k of this._bezPoints()) {
      const h = this.def.handles[k], [vx, vz] = curveHandle(this.def.handles, k);
      const [ox, oy] = this.toScreen(h.x + vx, h.z + vz), [ix, iy] = this.toScreen(h.x - vx, h.z - vz);
      if ((ox - sx) ** 2 + (oy - sy) ** 2 < 100) return { k, side: 'out' };
      if ((ix - sx) ** 2 + (iy - sy) ** 2 < 100) return { k, side: 'in' };
    }
    return null;
  }
  _hitProp(sx, sy, r = 22) {
    let best = -1, bd = Infinity;
    const S = this.view.scale;
    this.def.props.forEach((p, k) => {
      const [x, y] = this.toScreen(p.x, p.z), d = (x - sx) ** 2 + (y - sy) ** 2, rr = Math.max(r, p.type === 'bus' ? 9 * S * 0.5 : p.type === 'boxes' ? 9 * S * 0.5 : p.type === 'target' ? 9 * S : p.type === 'building' ? Math.max(14, Math.min(p.w || BUILDING.w, p.d || BUILDING.d) * S * 0.5) : p.type === 'ramp' ? Math.max(14, Math.min(p.w || RAMP.w, p.d || RAMP.d) * S * 0.5) : 0);
      if (d < rr * rr && d < bd) { bd = d; best = k; }
    });
    return best;
  }
  _setTool(t) {
    this.tool = t; this._ghost = null;
    this.iconBar?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    $('ed-tool-barrel').setAttribute('aria-pressed', String(t === 'barrel')); $('ed-tool-skull').setAttribute('aria-pressed', String(t === 'skull')); $('ed-tool-fire').setAttribute('aria-pressed', String(t === 'fire')); $('ed-tool-vehicle').setAttribute('aria-pressed', String(t === 'vehicle')); for (const k of STUNT_TOOLS) $('ed-tool-' + k).setAttribute('aria-pressed', String(t === k)); this._vehPanel(); this._stuntPanel(); this._buildPanel();
    const names = { barrel: 'Barrels', skull: 'Skull barrels', fire: 'Fire pits', vehicle: 'Vehicles', bus: 'Stunt bus', boxes: 'Cardboard boxes', target: 'Bullseye target', building: 'Buildings', ramp: 'Ramp', lights: 'Traffic lights', crossing: 'Crossing' };
    $('ed-obst').setAttribute('aria-pressed', String(!!names[t])); $('ed-obst').innerHTML = (names[t] || 'Scenery') + ' &#9662;';
    this._obstMenu(false); this._worksMenu(false);
    $('ed-add').setAttribute('aria-pressed', String(t === 'addpoint')); if (t === 'addpoint') this.cb.toast('Add point: click on the track where the new point should go. Esc stops adding.');
    $('ed-pen').setAttribute('aria-pressed', String(t === 'pen')); if (t !== 'pen') { this.pen = []; this.penRedo = []; this._penDrag = null; }
    for (const [id, nm] of [['ed-tool-gap', 'gap'], ['ed-tool-fly', 'flyover'], ['ed-tool-tunnel', 'tunnel']]) $(id).setAttribute('aria-pressed', String(t === nm));
    const wn = { gap: 'Gap', flyover: 'Flyover', tunnel: 'Tunnel' };
    $('ed-works').setAttribute('aria-pressed', String(!!wn[t])); $('ed-works').innerHTML = (wn[t] || 'Roadworks') + ' &#9662;';
    if (t === 'gap') this.cb.toast('Gap: click the road for a 30 m jump gap, or a crossing for a 5 m gap. Esc stops.');
    if (t === 'flyover' || t === 'tunnel') this.cb.toast(`${wn[t]}: click a place where the road crosses itself. Esc stops.`);
    if (this.c) this.c.style.cursor = this._placing() ? 'copy' : 'crosshair';
  }

  // ------------------------------------------------------------- the Draw (Bézier pen) tool
  /** The Auto-smooth box: a live slider from "as drawn" to "very smooth". Apply keeps it (one Undo step); Cancel puts the track back. */
  _smoothOpen() {
    if (!this.track || this._needTrack()) return;
    if (this._smoothBox) { this._smoothClose(true); return; }
    this._askBox?.remove(); this._askBox = null;
    this.snapshot(); const base = this.def.handles.map((h) => ({ ...h }));
    const box = this._smoothBox = document.createElement('div');
    box.className = 'ed-junction ed-smoothbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Auto-smooth');
    box.innerHTML = '<b>Auto-smooth</b><label for="ed-smooth-r"><span>Smoothness <output id="ed-smooth-o">40%</output></span></label><input id="ed-smooth-r" type="range" min="0" max="100" step="1" value="40"><small>Left: as you drew it. Right: very smooth. Points with a jump gap stay put.</small><div class="row"><button type="button" class="go">Apply</button><button type="button" class="no">Cancel</button></div>';
    this.c.parentElement.appendChild(box); box.style.left = '14px'; box.style.top = '14px';
    this._smoothBase = base;
    const r = box.querySelector('input'), o = box.querySelector('output');
    const run = () => {
      const res = smoothHandles(base, r.value / 100); this.def.handles = res.handles; this.sel = -1;
      o.textContent = r.value + '%' + (res.merged ? `, ${res.merged} merged` : ''); this.rebuild(); this.updateUI(); this.draw();
    };
    r.oninput = run; run();
    box.querySelector('.go').onclick = () => this._smoothClose(true);
    box.querySelector('.no').onclick = () => this._smoothClose(false);
  }
  _smoothClose(keep) {
    const box = this._smoothBox; if (!box) return; this._smoothBox = null; box.remove();
    if (!keep) { this.def.handles = this._smoothBase; this.undoStack.pop(); this._buttons(); }
    this.rebuild(true); this.updateUI(); this.draw();
    if (keep) this.cb.toast('Track smoothed. Undo puts it back.');
  }
  _needTrack() { if (!this.blank) return false; this.cb.toast('Draw your track first: click to place points, then click the first point to close it.'); return true; }
  /** Click puts a point down; dragging from it pulls out the curve handles (both sides, like a pen tool). Clicking the first point closes the circuit. */
  _penDown(sx, sy) {
    const [wx, wz] = this.toWorld(sx, sy), a0 = this.pen[0];
    if (a0 && this.pen.length >= 4) { const [x, y] = this.toScreen(a0.x, a0.z); if ((x - sx) ** 2 + (y - sy) ** 2 < 14 * 14) { this._penFinish(); return; } }
    const a = { x: wx, z: wz, dx: 0, dz: 0 }; this.pen.push(a); this.penRedo = []; this._penDrag = a; this.draw();
  }
  _penMove(sx, sy) {
    this._penMouse = [sx, sy];
    const a = this._penDrag;
    if (a) { const [wx, wz] = this.toWorld(sx, sy); a.x = wx; a.z = wz; }
    this.draw();
  }
  _penUp() { this._penDrag = null; this.draw(); }
  penUndo() { if (!this.pen.length) return false; this.penRedo.push(this.pen.pop()); this._buttons(); this.draw(); return true; }
  penRedoStep() { if (!this.penRedo.length) return false; this.pen.push(this.penRedo.pop()); this._buttons(); this.draw(); return true; }
  /** The track's own curve through the placed points (what you will get), as [x, z] steps; a straight line until there are 4 points. */
  _penCurve(closed) {
    const A = this.pen;
    if (A.length < 4) { const o = A.map((a) => [a.x, a.z]); if (closed && o.length) o.push(o[0]); return o; }
    const key = A.map((a) => a.x.toFixed(1) + ',' + a.z.toFixed(1)).join(';') + (closed ? 'c' : 'o');
    if (this._penKey !== key) {                                                // (the track's own spline, worked out cheaply here so dragging stays smooth)
      this._penKey = key;
      const n = A.length, P = A.map((a) => [a.x, 0, a.z]), out = [], tmp = [0, 0, 0], segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const g = (k) => closed ? P[(k + n) % n] : P[Math.max(0, Math.min(n - 1, k))];
        for (let k = 0; k < 14; k++) { crCentripetal(g(i - 1), g(i), g(i + 1), g(i + 2), k / 14, tmp); out.push([tmp[0], tmp[2]]); }
      }
      out.push(closed ? out[0] : [A[n - 1].x, A[n - 1].z]);
      this._penPts = out;
    }
    return this._penPts;
  }
  _penFinish() {
    if (this.pen.length < 4) { this.cb.toast('Place at least 4 points first.'); return; }
    if (!this.blank && !confirm('Replace this track with the new shape?\n\nThe old track and its obstacles will go (Undo brings them back).')) return;
    if (!this.blank) this.snapshot();
    const handles = smoothHandles(this.pen.map((a) => ({ x: a.x, y: 0.65, z: a.z, w: 0, bank: 0, gap: 0 })), 0.3, { merge: false }).handles;      // the points you placed (no more, no fewer), eased a little so no kinks are left in the drawn shape
    const keep = { name: this.def.name, width: this.def.width, walls: this.def.walls, defaultLaps: this.def.defaultLaps };
    this.def = normalizeTrack({ ...keep, handles, props: [] }); this.blank = false; this.pen = []; this.penRedo = [];
    this.sel = -1; this.selProp = -1; this._setTool('road');
    this.rebuild(true); this.fit(); this.updateUI(); this.propsChanged();
    this.cb.toast(`Track drawn with your ${handles.length} points: ${(this.track.length / 1000).toFixed(2)} km. Drag the points to fine tune it.`);
  }
  _drawPen(g) {
    const A = this.pen; g.save();
    if (!A.length) { g.fillStyle = 'rgba(234,246,255,.7)'; g.font = '16px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('Click to place the first point of your track', this.w / 2, this.h / 2); g.restore(); return; }
    const S = (p) => this.toScreen(p[0], p[1]);
    const pv = this._penMouse && !this._penDrag ? this._penMouse : null;
    const poly = this._penCurve(A.length >= 4);
    g.strokeStyle = '#8fe0ff'; g.lineWidth = Math.max(3, this.def.width * this.view.scale); g.globalAlpha = 0.28; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); poly.forEach((p, i) => { const [x, y] = S(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.globalAlpha = 1;
    g.lineWidth = 2; g.stroke();
    if (pv && !this._penDrag) { const l = A[A.length - 1], [lx0, ly0] = this.toScreen(l.x, l.z); g.setLineDash([5, 5]); g.beginPath(); g.moveTo(lx0, ly0); g.lineTo(pv[0], pv[1]); g.stroke(); g.setLineDash([]); }
    A.forEach((a, i) => {
      const [x, y] = this.toScreen(a.x, a.z);
      g.fillStyle = i === 0 ? '#ffd24a' : '#fff'; g.strokeStyle = '#12305f'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, i === 0 ? 8 : 6, 0, 7); g.fill(); g.stroke();
    });
    if (A.length >= 4) { g.fillStyle = 'rgba(234,246,255,.8)'; g.font = '13px system-ui, sans-serif'; const [x, y] = this.toScreen(A[0].x, A[0].z); g.textAlign = 'left'; g.fillText('click to close', x + 12, y - 10); }
    g.restore();
  }

  /** The Stunt bus options (its height on a platform, a quarter turn): shown with a bus selected. */
  /** Building size and look: shown with a building selected (or while placing, for the next one). */
  _buildPanel() {
    const box = $('ed-build'); if (!box) return;
    const sel = this.def && this.def.props[this.selProp], isB = sel && sel.type === 'building', isR = sel && sel.type === 'ramp', ramp = isR || (!sel && this.tool === 'ramp') || (this.tool === 'ramp' && !isB);
    box.hidden = !(this.tool === 'building' || this.tool === 'ramp' || isB || isR); if (box.hidden) return;
    const v = isB || isR ? sel : ramp ? this.rampOpts : this.bldOpts, set = (k, val, suf) => { $('ed-bld-' + k).value = val; $('ed-bld-' + k + '-o').textContent = `${val}${suf}`; };
    const lim = ramp ? { w: [3, 60], d: [4, 60], h: [0.5, 12] } : { w: [4, 120], d: [4, 120], h: [3, 150] };
    for (const k of ['w', 'd', 'h']) { $('ed-bld-' + k).min = lim[k][0]; $('ed-bld-' + k).max = lim[k][1]; $('ed-bld-' + k).step = k === 'h' && ramp ? 0.5 : 1; }
    $('ed-bld-d').previousElementSibling.textContent = ramp ? 'Length' : 'Depth';
    set('w', v.w || (ramp ? RAMP.w : BUILDING.w), ' m'); set('d', v.d || (ramp ? RAMP.d : BUILDING.d), ' m'); set('h', v.h || (ramp ? RAMP.h : BUILDING.h), ' m'); set('turn', v.rot || 0, '\u00b0');
    $('ed-bld-turn').parentElement.hidden = !(isB || isR);
    $('ed-bld-look').parentElement.hidden = ramp; $('ed-bld-name').parentElement.hidden = !(isB || this.tool === 'building'); $('ed-bld-name').value = isB ? sel.name || '' : this.bldOpts.name || '';
    $('ed-bld-note').textContent = ramp ? 'Click the road to drop a ramp: it lines up with the road and you drive up it and off the lip. Drag it, turn it, make it longer or higher for a bigger jump. Width starts as the road.' : isB && this.track?.buildings?.find((q) => this.def.props[q.pi] === sel)?.tunnel ? 'Over the road: this is a tunnel. It lines up with the road and the road runs through it. Move it off the road for a building.' : 'Put one over the road and enlarge it to make a tunnel.';
  }
  _stuntPanel() {
    const box = $('ed-stunt'); if (!box) return;
    const sel = this.def && this.def.props[this.selProp], on = sel && (sel.type === 'bus' || sel.type === 'boxes');
    box.hidden = !on; if (!on) return;
    $('ed-stunt-up-f').hidden = sel.type !== 'bus';
    $('ed-stunt-up').value = sel.up || 0; $('ed-stunt-up-o').textContent = `${(sel.up || 0).toFixed(1)} m`;
    $('ed-stunt-turn').value = sel.rot || 0; $('ed-stunt-turn-o').textContent = `${sel.rot || 0}\u00b0`;
  }
  /** The Vehicle options (which car, parked or driving, which way it faces): shown while placing cars or with a car selected. Changing them changes the selected car, or what the next one placed will be. */
  _vehPanel() {
    const box = $('ed-veh'); if (!box) return;
    const sel = this.def && this.def.props[this.selProp], isVeh = sel && sel.type === 'vehicle';
    box.hidden = !(this.tool === 'vehicle' || isVeh);
    if (box.hidden) return;
    const carSel = $('ed-veh-car');
    if (!carSel.options.length) {
      carSel.innerHTML = '<option value="">Same as your car</option>' + (this.cb.vehicles?.() || []).map((v) => `<option value="${v.id}">${v.name}</option>`).join('');
    }
    const cur = isVeh ? sel : this.vehOpts;
    carSel.value = cur.car || ''; $('ed-veh-mode').value = ['driving', 'regular', 'race'].includes(cur.mode) ? cur.mode : 'static';
    $('ed-veh-yaw').disabled = !isVeh; $('ed-veh-yaw').value = isVeh ? Math.round((sel.yaw || 0) * 180 / Math.PI) : 0;
    $('ed-veh-yaw-o').textContent = isVeh ? `${Math.round((sel.yaw || 0) * 180 / Math.PI)}\u00b0` : 'place one first';
  }
  _vehEdit(apply) {
    const sel = this.def.props[this.selProp];
    if (sel && sel.type === 'vehicle') { this.snapshot(); apply(sel); apply(this.vehOpts); this.propsChanged(); }
    else { apply(this.vehOpts); this.draw(); }
    this._vehPanel();
  }

  /** Open or close the Scenery dropdown. */
  _obstMenu(open) { const m = $('ed-obst-menu'); if (!m) return; if (open) { this._worksMenu(false); this._keysMenu(false); } m.hidden = !open; $('ed-obst').setAttribute('aria-expanded', String(open)); }
  _keysMenu(open) { const m = $('ed-keys-menu'); if (!m) return; if (open) { this._obstMenu(false); this._worksMenu(false); } m.hidden = !open; $('ed-keys-btn').setAttribute('aria-expanded', String(open)); }
  _worksMenu(open) { const m = $('ed-works-menu'); if (!m) return; if (open) this._keysMenu(false); m.hidden = !open; $('ed-works').setAttribute('aria-expanded', String(open)); }
  propsChanged() {
    const any = this.def.props.some((p) => p.type === 'building' || p.type === 'ramp'); if (any || this._hadBuildings) this.rebuild(); this._hadBuildings = any;          // (buildings are part of the track's solid shape, and snap into tunnels over the road)
    this.preview?.setProps(this.def.props); this.updateProps(); this._buttons(); this.draw(); }
  addProp(type, sx, sy, lethal = false) {
    if (!this.track) return;
    const [wx, wz] = this.toWorld(sx, sy);
    if (this.def.props.length >= MAX_PROPS) { this.cb.toast('That is enough props (' + MAX_PROPS + ').'); return; }
    const p = placeProp(this.track, wx, wz);
    let sig = null;
    if (SIGNALS.includes(type)) {                                              // traffic lights and crossings sit on the road, turned the way it runs
      const i = this._nearestSample(sx, sy, 70); if (i < 0 || Math.hypot(this.track.px[i] - wx, this.track.pz[i] - wz) > this.track.hw[i] + 4) { this.cb.toast(type === 'lights' ? 'Click on the road to put traffic lights there.' : 'Click on the road to put a crossing there.'); return; }
      sig = { x: this.track.px[i], z: this.track.pz[i], y: this.track.py[i], rot: ((Math.round(Math.atan2(this.track.tx[i], this.track.tz[i]) * 180 / Math.PI) % 360) + 360) % 360 };
    }
    this.snapshot();
    let extra = {};
    if (STUNT_TOOLS.includes(type)) {
      if (type === 'target') this.def.props = this.def.props.filter((q) => q.type !== 'target');            // (only one bullseye: placing it again moves it)
    }
    if (type === 'ramp') {                                                     // lined up with the road under it, climbing the way the cars drive, as wide as the road unless you have set it
      let th = 0, w = this.rampOpts.w;
      const i = this._nearestSample(sx, sy, 80); if (i >= 0) { th = Math.round(Math.atan2(this.track.tx[i], this.track.tz[i]) * 180 / Math.PI / 5) * 5; if (!w) w = Math.max(3, Math.round(this.track.hw[i] * 2 - 1)); }
      extra = { w: w || 8, d: this.rampOpts.d, h: this.rampOpts.h, ...(((th % 360) + 360) % 360 ? { rot: ((th % 360) + 360) % 360 } : {}) };
    }
    if (type === 'building') { extra = { w: this.bldOpts.w, d: this.bldOpts.d, h: this.bldOpts.h, style: this.bldOpts.style = (this.bldOpts.style + 3) % 8, ...(this.bldOpts.name && this.bldOpts.name.trim() ? { name: this.bldOpts.name } : {}) }; this.bldOpts.name = ''; }      // (a name typed before placing is used for that one building)      // (each one placed gets a different look)
    if (type === 'vehicle') {                                                  // facing along the road if it is on one; the person turns it with the Facing slider
      let yaw = 0; try { const s = this.track.progressAt(p.x, p.y, p.z), f = this.track.frameAt(s); yaw = Math.atan2(f.fx, f.fz); } catch { /* off the road */ }
      extra = { mode: this.vehOpts.mode, yaw: Math.round(yaw * 100) / 100, ...(this.vehOpts.car ? { car: this.vehOpts.car } : {}) };
    }
    if (sig) { Object.assign(p, { x: sig.x, z: sig.z, y: sig.y }); if (sig.rot) extra = { rot: sig.rot }; }
    this.def.props.push({ type, ...extra, ...(lethal ? { lethal: true } : {}), x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, y: Math.round(p.y * 100) / 100 });
    this.selProp = this.def.props.length - 1; this.sel = -1; this.updateInspector(); this.propsChanged();
  }
  /** Copy, cut, paste and duplicate for the selected prop (a barrel, building, vehicle, bus...): Ctrl/Cmd + C, X, V and D. A paste lands a little way from the last one, on whatever is under it. */
  _clipKey(k) {
    const sel = this.def.props[this.selProp];
    if (k === 'c' || k === 'x' || k === 'd') {
      if (!sel) { this.cb.toast('Select a barrel, building, vehicle or other prop first, then Ctrl+C to copy it.'); return; }
      this.clip = JSON.parse(JSON.stringify(sel)); this.clipN = 0;
      if (k === 'c') { this.cb.toast('Copied. Ctrl+V pastes it.'); return; }
      if (k === 'x') { this.removeProp(); this.cb.toast('Cut. Ctrl+V pastes it.'); return; }
    }
    if (!this.clip) { this.cb.toast('Nothing copied yet. Select a prop and press Ctrl+C.'); return; }
    if (!this.track) return;
    if (this.clip.type === 'target' && this.def.props.some((q) => q.type === 'target')) { this.cb.toast('There is only one bullseye: drag it to move it.'); return; }
    if (this.def.props.length >= MAX_PROPS) { this.cb.toast('That is enough props (' + MAX_PROPS + ').'); return; }
    this.snapshot();
    const n = (this.clipN = (this.clipN || 0) + 1), step = Math.max(6, (this.clip.w || 0) * 0.6, (this.clip.d || 0) * 0.6), q = { ...this.clip };
    const at = placeProp(this.track, this.clip.x + step * n, this.clip.z + step * n * 0.5);
    q.x = Math.round(at.x * 100) / 100; q.z = Math.round(at.z * 100) / 100; q.y = Math.round(at.y * 100) / 100;
    this.def.props.push(q); this.selProp = this.def.props.length - 1; this.sel = -1; this.updateInspector(); this.propsChanged();
  }
  removeProp() {
    if (this.selProp < 0) return;
    this.snapshot(); this.def.props.splice(this.selProp, 1); this.selProp = -1; this._unstunt(); this.propsChanged();
  }
  /** A track turned into a stunt track by its first stunt prop goes back to a normal track once the last one is removed (a stunt template, with its own one-road shape, stays). */
  _unstunt() {
    const w = this.def.weeval; if (!w || !w.custom || w.oneRoad || this.def.props.some((q) => STUNT_TOOLS.includes(q.type))) return;
    delete this.def.weeval; this.cb.toast('No stunt pieces left: this is an ordinary track again.');
  }
  _nearestSample(sx, sy, r = 14) {
    const t = this.track; let best = -1, bd = r * r;
    for (let i = 0; i < t.n; i++) { const [x, y] = this.toScreen(t.px[i], t.pz[i]), d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  insertAt(i) {
    const t = this.track, s = t.s[i]; let k = 0;
    if (this.def.weeval?.oneRoad && s > t.handleS[this.def.handles.length - 1] + 1) { this.cb.toast('That is the hidden return road that closes the loop. Click along your own road.'); return; }
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
    if (this.multi?.size > 1) {
      const gone = [...this.multi].sort((a, b) => b - a);
      if (this.def.handles.length - gone.length < (this.def.weeval?.oneRoad ? 2 : 4)) { this.cb.toast('A circuit needs at least 4 points.'); return; }
      this.snapshot(); for (const k of gone) this.def.handles.splice(k, 1); this.multi.clear(); this.sel = -1;
      this.rebuild(true); this.updateUI(); this.draw(); return;
    }
    if (this.def.handles.length <= (this.def.weeval?.oneRoad ? 2 : 4)) { this.cb.toast('A circuit needs at least 4 points.'); return; }
    this.snapshot(); this.def.handles.splice(this.sel, 1); this.sel = -1; this.multi?.clear();
    this.rebuild(true); this.updateUI(); this.draw();
  }

  /** Start dragging every selected point at once (the pointer's world spot and each point's start are remembered). */
  _groupDrag(sx, sy) {
    const [wx, wz] = this.toWorld(sx, sy), orig = new Map();
    for (const k of this.multi) { const h = this.def.handles[k]; if (h) orig.set(k, { x: h.x, z: h.z }); }
    this.drag = { type: 'group', sx, sy, wx, wz, orig, moved: false };
  }

  _bind() {
    const c = this.c, pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', (e) => {
      const [sx, sy] = pos(e); c.setPointerCapture(e.pointerId);
      if (this.tool === 'pen' && e.button === 0) { this._penDown(sx, sy); return; }
      if (this.tool === 'addpoint' && e.button === 0) {
        const i = this._nearestSample(sx, sy, 30);
        if (i >= 0) { this.drag = null; this.insertAt(i); this.updateInspector(); } else this.cb.toast('Click on the track to add a point there.');
        return;
      }
      if (e.button === 0 && this.selProp >= 0 && !this._placing()) {
        const rh = this._rotHandle(this.def.props[this.selProp]);
        if (rh && (rh.x - sx) ** 2 + (rh.y - sy) ** 2 < 144) { this.drag = { type: 'rot', k: this.selProp, moved: false }; c.style.cursor = 'grabbing'; return; }
      }
      this.multi ||= new Set();
      if (e.shiftKey && e.button === 0 && !this._placing()) {               // Shift: add points to the selection (click) or box-select (drag on empty space), then drag them all together
        const hk = this._hit(sx, sy);
        if (hk >= 0) {
          if (this.sel >= 0 && !this.multi.size) this.multi.add(this.sel);
          if (this.multi.has(hk)) { this._groupDrag(sx, sy); this.drag.toggle = hk; this.draw(); return; }      // (already picked: a drag moves the group, a plain click lets it go)
          this.multi.add(hk); this.sel = hk; this.selProp = -1; this._groupDrag(sx, sy);
          this.updateInspector(); this.draw(); return;
        }
        this.drag = { type: 'marquee', sx, sy, x2: sx, y2: sy }; return;
      }
      if (e.button === 0 && this.multi.size > 1 && this._hit(sx, sy) >= 0 && this.multi.has(this._hit(sx, sy))) { this._groupDrag(sx, sy); this.draw(); return; }
      if (e.button === 0 && this.multi.size && this._hit(sx, sy) < 0) this.multi.clear();
      const bez = e.button === 0 && !this._placing() ? this._hitBez(sx, sy) : null;
      if (bez) { this.sel = bez.k; this.drag = { type: 'bez', side: bez.side, k: bez.k, moved: false }; this.updateInspector(); return; }
      const k = e.button === 0 ? this._hit(sx, sy) : -1, pk = k < 0 && e.button === 0 ? this._hitProp(sx, sy) : -1;
      const works = this.tool === 'gap' || this.tool === 'flyover' || this.tool === 'tunnel';
      const xc = (works || (k < 0 && pk < 0)) && e.button === 0 && !this._placing() ? this._crossAt(sx, sy, works ? 26 : 15) : null;   // with the Roadworks tool a crossing wins over a point sitting on it
      if (xc) { this.drag = null; this._junctionAsk(xc, works ? this.tool : null); return; }
      if (works && this.tool !== 'gap' && e.button === 0 && k < 0 && pk < 0) { this.cb.toast('Click a place where the road crosses itself.'); return; }
      if (works && e.button === 0 && k < 0 && pk < 0) {                       // on the plain road: drop a jump gap here
        const i = this._nearestSample(sx, sy);
        if (i >= 0) { this.drag = null; this.insertAt(i); const h = this.def.handles[this.sel]; h.gap = 30; h.lip = 0.5; h.kick = 0; this.rebuild(true); this.updateInspector(); this.draw(); this.cb.toast('Jump gap added: 30 m. Change it in the point settings.'); return; }
        this.cb.toast('Click on the road to add a gap.'); return;
      }
      if (k >= 0) { this.multi.clear(); this.sel = k; this.selProp = -1; this.drag = { type: 'handle', k, moved: false, xc: !works ? this._crossAt(sx, sy, 15) : null }; this.updateInspector(); this.draw(); }
      else if (pk >= 0) { this.selProp = pk; this.sel = -1; this.drag = { type: 'prop', k: pk, moved: false }; this.updateInspector(); this.draw(); }
      else this.drag = { type: 'pan', sx, sy, vx: this.view.x, vz: this.view.z, moved: false, button: e.button };
    });
    c.addEventListener('pointermove', (e) => {
      const [sx, sy] = pos(e), d = this.drag;
      if (this.tool === 'pen' && !d) { this._penMove(sx, sy); return; }
      if (!d) {
        const k = this._hit(sx, sy), pk = k < 0 ? this._hitProp(sx, sy) : -1;
        const placing = this._placing();
        if (placing) this._ghost = pk < 0 && k < 0 ? [sx, sy] : null;
        if (k !== this.hover || pk !== this.hoverProp || placing) {
          this.hover = k; this.hoverProp = pk;
          c.style.cursor = k >= 0 || pk >= 0 ? 'grab' : placing ? 'copy' : 'crosshair'; this.draw();
        }
        return;
      }
      if (d.type === 'marquee') { d.x2 = sx; d.y2 = sy; this.draw(); return; }
      if (d.type === 'group') {
        if (!d.moved) { if (Math.abs(sx - d.sx) + Math.abs(sy - d.sy) < 3) return; this.snapshot(); d.moved = true; c.style.cursor = 'grabbing'; }
        const [wx, wz] = this.toWorld(sx, sy), snap = e.altKey ? 0.1 : 2, dx = wx - d.wx, dz = wz - d.wz;
        for (const [k, o] of d.orig) { const h = this.def.handles[k]; if (h) { h.x = Math.round((o.x + dx) / snap) * snap; h.z = Math.round((o.z + dz) / snap) * snap; } }
        this.rebuild(); this.updateInspector(); this.draw(); return;
      }
      if (d.type === 'rot') {
        if (!d.moved) { this.snapshot(); d.moved = true; }
        this._rotateTo(this.def.props[d.k], sx, sy, e.altKey); this.propsChanged(); this.updateInspector();
      } else if (d.type === 'prop') {
        if (!d.moved) { this.snapshot(); d.moved = true; c.style.cursor = 'grabbing'; }
        const [wx, wz] = this.toWorld(sx, sy), p = this.def.props[d.k], q = placeProp(this.track, wx, wz);
        if (SIGNALS.includes(p.type)) { const i = this._nearestSample(sx, sy, 80); if (i >= 0) { q.x = this.track.px[i]; q.z = this.track.pz[i]; q.y = this.track.py[i]; const r = ((Math.round(Math.atan2(this.track.tx[i], this.track.tz[i]) * 180 / Math.PI) % 360) + 360) % 360; if (r) p.rot = r; else delete p.rot; } }
        p.x = Math.round(q.x * 100) / 100; p.z = Math.round(q.z * 100) / 100; p.y = Math.round(q.y * 100) / 100;
        this.propsChanged();
      } else if (d.type === 'bez') {
        if (!d.moved) { this.snapshot(); d.moved = true; c.style.cursor = 'grabbing'; }
        const [wx, wz] = this.toWorld(sx, sy), h = this.def.handles[d.k];
        let vx = (d.side === 'out' ? wx - h.x : h.x - wx), vz = (d.side === 'out' ? wz - h.z : h.z - wz);
        const len = Math.hypot(vx, vz); if (len > 150) { vx *= 150 / len; vz *= 150 / len; }
        if (len < 1) { vx = 1; vz = 0; }
        h.hx = Math.round(vx * 10) / 10; h.hz = Math.round(vz * 10) / 10;
        this.rebuild(); this.draw();
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
      if (this.tool === 'pen' && !this.drag) { this._penUp(); return; }
      const d = this.drag; this.drag = null; c.style.cursor = this._placing() ? 'copy' : 'crosshair'; setTimeout(() => this._junctionAsk(), 220);
      if (d?.type === 'pan' && !d.moved) {
        if ((this._placing()) && d.button === 0) this.addProp(this._toolType(), d.sx, d.sy, this.tool === 'skull');
        else { this.sel = -1; this.selProp = -1; this.multi?.clear(); this.updateInspector(); this.draw(); }
      }
      if (d?.type === 'marquee') {
        const x0 = Math.min(d.sx, d.x2), x1 = Math.max(d.sx, d.x2), y0 = Math.min(d.sy, d.y2), y1 = Math.max(d.sy, d.y2);
        this.multi ||= new Set();
        if (x1 - x0 > 4 || y1 - y0 > 4) this.def.handles.forEach((h, k) => { const [x, y] = this.toScreen(h.x, h.z); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) this.multi.add(k); });
        if (this.multi.size) { this.sel = [...this.multi][0]; this.selProp = -1; this.cb.toast(`${this.multi.size} point${this.multi.size > 1 ? 's' : ''} selected: drag one to move them all, Esc to deselect.`); }
        this.updateInspector();
      }
      if (d?.type === 'handle' && !d.moved && d.xc) { this._junctionAsk(d.xc); return; }      // a plain click on a point that sits on a crossing opens its crossroad / gap question
      if ((d?.type === 'handle' || d?.type === 'bez' || d?.type === 'group') && d.moved) this.rebuild(true);
      if (d?.type === 'group' && !d.moved && d.toggle !== undefined) { this.multi.delete(d.toggle); this.sel = this.multi.size ? [...this.multi][0] : -1; this.updateInspector(); }
      if (d?.type === 'group') { c.style.cursor = 'crosshair'; this.draw(); }
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', (e) => {
      if (this.tool !== 'road') return;
      const [sx0, sy0] = pos(e), hb = this._hitBez(sx0, sy0);
      if (hb) { const h = this.def.handles[hb.k]; if (h.hx !== undefined) { this.snapshot(); delete h.hx; delete h.hz; this.rebuild(true); this.draw(); this.cb.toast('Curve handle back to automatic.'); } return; }
      const [sx, sy] = pos(e); if (this.def.mode === 'lastStanding' || this._hit(sx, sy) >= 0 || this._hitProp(sx, sy) >= 0) return;
      const i = this._nearestSample(sx, sy, Math.max(14, (this.track?.hw?.[0] || 10) * this.view.scale));      // (anywhere on the road surface, not only on the centre line)
      if (i >= 0) this.insertAt(i);
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
    $('ed-undo').onclick = () => { if (this.tool === 'pen' && this.penUndo()) return; this.undo(); }; $('ed-redo').onclick = () => { if (this.tool === 'pen' && this.penRedoStep()) return; this.redo(); };
    $('ed-add').onclick = () => { this._setTool(this.tool === 'addpoint' ? 'road' : 'addpoint'); this.draw(); }; $('ed-del').onclick = () => this.removeSelected();
    $('ed-pen').onclick = () => { this._setTool(this.tool === 'pen' ? (this.blank ? 'pen' : 'road') : 'pen'); this.draw(); };
    $('ed-works').onclick = (e) => { e.stopPropagation(); this._worksMenu($('ed-works-menu').hidden); };
    $('ed-tool-gap').onclick = () => { this._setTool(this.tool === 'gap' ? 'road' : 'gap'); this.draw(); };
    $('ed-tool-fly').onclick = () => { this._setTool(this.tool === 'flyover' ? 'road' : 'flyover'); this.draw(); };
    $('ed-tool-tunnel').onclick = () => { this._setTool(this.tool === 'tunnel' ? 'road' : 'tunnel'); this.draw(); };
    $('ed-keys-btn').onclick = (e) => { e.stopPropagation(); this._keysMenu($('ed-keys-menu').hidden); };
    $('ed-obst').onclick = (e) => { e.stopPropagation(); this._obstMenu($('ed-obst-menu').hidden); };
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest?.('.ed-menu')) { this._obstMenu(false); this._worksMenu(false); this._keysMenu(false); } });
    $('ed-tool-vehicle').onclick = () => { this._setTool(this.tool === 'vehicle' ? 'road' : 'vehicle'); this.draw(); };
    $('ed-veh-car').onchange = (e) => this._vehEdit((o) => { if (e.target.value) o.car = e.target.value; else delete o.car; });
    $('ed-veh-mode').onchange = (e) => this._vehEdit((o) => { o.mode = e.target.value; });
    $('ed-veh-yaw').oninput = (e) => { const sel = this.def.props[this.selProp]; if (!sel || sel.type !== 'vehicle') return; if (!this._vehYawSnap) { this.snapshot(); this._vehYawSnap = true; } sel.yaw = Math.round(e.target.value * Math.PI / 180 * 100) / 100; $('ed-veh-yaw-o').textContent = `${e.target.value}\u00b0`; this.draw(); };
    $('ed-veh-yaw').onchange = () => { this._vehYawSnap = false; this.propsChanged(); };
    for (const k of STUNT_TOOLS) $('ed-tool-' + k).onclick = () => { this._setTool(this.tool === k ? 'road' : k); this.draw(); };
    const bld = (k, key) => { $('ed-bld-' + k).oninput = (e) => {
      const sel = this.def.props[this.selProp], isB = sel && (sel.type === 'building' || sel.type === 'ramp'), val = +e.target.value;
      if (isB) { if (!this._bldSnap) { this.snapshot(); this._bldSnap = true; } if (key === 'rot') { if (val) sel.rot = val; else delete sel.rot; } else sel[key] = val; this.propsChanged(); }
      else if (key !== 'rot') (this.tool === 'ramp' ? this.rampOpts : this.bldOpts)[key] = val;
      const suf = key === 'rot' ? '\u00b0' : ' m'; $('ed-bld-' + k + '-o').textContent = `${val}${suf}`;
    }; $('ed-bld-' + k).onchange = () => { this._bldSnap = false; this._buildPanel(); }; };
    bld('w', 'w'); bld('d', 'd'); bld('h', 'h'); bld('turn', 'rot');
    $('ed-bld-name').oninput = (e) => { const sel = this.def.props[this.selProp]; if (!sel || sel.type !== 'building') { if (this.tool === 'building') this.bldOpts.name = e.target.value.slice(0, 24); return; } if (!this._nameSnap) { this.snapshot(); this._nameSnap = true; } const v = e.target.value.slice(0, 24); if (v.trim()) sel.name = v; else delete sel.name; this.draw(); clearTimeout(this._nameT); this._nameT = setTimeout(() => this.propsChanged(), 250); };
    $('ed-bld-name').onchange = () => { this._nameSnap = false; this.propsChanged(); };
    $('ed-bld-look').onclick = () => { const sel = this.def.props[this.selProp]; if (sel && sel.type === 'building') { this.snapshot(); sel.style = ((sel.style || 0) + 1) % 8; this.propsChanged(); } else this.bldOpts.style = (this.bldOpts.style + 1) % 8; };
    $('ed-stunt-up').oninput = (e) => { const p = this.def.props[this.selProp]; if (!p || p.type !== 'bus') return; if (!this._stuntSnap) { this.snapshot(); this._stuntSnap = true; } p.up = +e.target.value; if (!p.up) delete p.up; $('ed-stunt-up-o').textContent = `${(+e.target.value).toFixed(1)} m`; this.draw(); };
    $('ed-stunt-up').onchange = () => { this._stuntSnap = false; this.propsChanged(); };
    const turnable = () => { const p = this.def.props[this.selProp]; return p && (p.type === 'bus' || p.type === 'boxes') ? p : null; };
    $('ed-stunt-turn').oninput = (e) => { const p = turnable(); if (!p) return; if (!this._stuntSnap) { this.snapshot(); this._stuntSnap = true; } p.rot = +e.target.value; if (!p.rot) delete p.rot; $('ed-stunt-turn-o').textContent = `${+e.target.value}\u00b0`; this.draw(); };
    $('ed-stunt-turn').onchange = () => { this._stuntSnap = false; this.propsChanged(); };
    $('ed-stunt-rot').onclick = () => { const p = turnable(); if (!p) return; this.snapshot(); p.rot = ((p.rot || 0) + 90) % 360; if (!p.rot) delete p.rot; this.propsChanged(); this._stuntPanel(); };
    $('ed-tool-fire').onclick = () => { this._setTool(this.tool === 'fire' ? 'road' : 'fire'); this.draw(); };
    $('ed-tool-skull').onclick = () => { this._setTool(this.tool === 'skull' ? 'road' : 'skull'); this.draw(); };
    $('ed-tool-barrel').onclick = () => { this._setTool(this.tool === 'barrel' ? 'road' : 'barrel'); this.draw(); };
    $('ed-props-clear').onclick = () => { if (!this.def.props.length) return; this.snapshot(); this.def.props = []; this.selProp = -1; this._unstunt(); this.propsChanged(); this.cb.toast('All props removed.'); };
    $('ed-smooth').onclick = () => this._smoothOpen();
    $('ed-bank').onclick = () => {
      if (!this.track) return; this.snapshot();
      const banks = suggestBanks(this.track, 12); this.def.handles.forEach((h, i) => { h.bank = banks[i]; });
      this.rebuild(true); this.updateInspector(); this.draw(); this.cb.toast('Corners now lean into the turns.');
    };
    $('ed-rev').onclick = () => {
      this.snapshot(); const [h0, ...rest] = this.def.handles; this.def.handles = [h0, ...rest.reverse()];
      this.def.handles.forEach((h) => { h.bank = -h.bank; if (h.hx !== undefined) { h.hx = -h.hx; h.hz = -h.hz; } });
      this.sel = -1; this.rebuild(true); this.updateUI(); this.draw();
    };
    $('ed-template').onchange = (e) => {
      const k = e.target.value; e.target.value = ''; if (!k) return;
      this.snapshot(); const t = k === 'random' ? makeRandomTrack() : makeTemplate(k); this.def = normalizeTrack(t); this.sel = -1; $('ed-name').value = this.def.name; this.map.load(this.def.name);
      this.rebuild(true); this.fit(); this.updateUI(); this.draw();
    };
    const resize = (f) => {                                           // the whole track (road, jumps, props) bigger or smaller, about its middle; heights, banking and widths stay as they are
      const hs = this.def.handles; if (!hs.length || !this.track) return;
      const len = this.track.length * f; if (len < 250) { this.cb.toast('That is as short as a track can go.'); return; } if (len > 12000) { this.cb.toast('That is as long as a track can go.'); return; }
      this.snapshot();
      const cx = hs.reduce((a, h) => a + h.x, 0) / hs.length, cz = hs.reduce((a, h) => a + h.z, 0) / hs.length, sc = (o) => { o.x = Math.round((cx + (o.x - cx) * f) * 100) / 100; o.z = Math.round((cz + (o.z - cz) * f) * 100) / 100; };
      hs.forEach(sc); (this.def.props || []).forEach(sc);
      this.rebuild(true); this.fit(); this.updateUI(); this.propsChanged(); this.cb.toast(`Track is now ${(this.track.length / 1000).toFixed(2)} km.`);
    };
    $('ed-shorter').onclick = () => resize(0.9); $('ed-longer').onclick = () => resize(1.1);
    $('ed-clear').onclick = () => {                                   // start from scratch: an empty page and the Draw tool (Undo gets the old track back)
      if (!confirm('Clear this track and start from scratch?\n\nEverything on it will go (Undo brings it back).')) return;
      this.snapshot();
      const handles = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return { x: Math.round(Math.cos(a) * 150), y: 0.65, z: Math.round(Math.sin(a) * 90), w: 0, bank: 0, gap: 0 }; });   // (hidden placeholder: the editor needs a track to stand on until one is drawn)
      this.def = normalizeTrack({ name: 'New track', width: 22, walls: true, defaultLaps: 3, handles, props: [] }); this.def.blank = true; this.blank = true;
      this.sel = -1; this.selProp = -1; this.pen = []; this.penRedo = []; this._setTool('pen');
      $('ed-name').value = this.def.name; this.rebuild(true); this.view.x = 0; this.view.z = 0; this.view.scale = 0.5; this.updateUI(); this.propsChanged(); this.cb.toast('Blank page: click to place points (4 or more), then click the first point to close the circuit.');
    };
    $('ed-fit').onclick = () => { this.fit(); this.draw(); };
    $('ed-map').onclick = () => this.map.toggle();
    $('ed-3d-toggle').onclick = () => { this._show3d(!this.show3d); this.draw(); };
    $('ed-3d-hide').onclick = () => { this._show3d(false); this.draw(); };
    $('ed-save').onclick = () => { if (this._needTrack()) return; this.cb.onSave(this.def); };
    $('ed-share').onclick = () => { if (this._needTrack()) return; this.cb.onShare?.(this.def); };
    $('ed-export').onclick = () => {
      if (this._needTrack()) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([this.json], { type: 'application/json' }));
      a.download = (this.def.name || 'track').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $('ed-drive').onclick = () => { if (this._needTrack()) return; this.cb.onDrive(this.def); };
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
      if (h.gap) { if (!Number.isFinite(+h.lip) || h.lip === null || h.lip === '') h.lip = 0.5; if (!Number.isFinite(+h.kick)) h.kick = 0; }          // (a new point has neither: give it the usual flat ramp)
      this.rebuild(true); this.updateInspector(); this.draw();
    };
    $('ed-fill').onchange = (e) => this._fill(e.target.checked);
    $('ed-walls').onchange = (e) => { this.snapshot(); this.def.walls = e.target.checked; this.draw(); };
    $('ed-name').oninput = (e) => { this.def.name = e.target.value; };

    addEventListener('keydown', (e) => {
      if (!this.visible) return;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (this.tool === 'pen' && !e.shiftKey && this.penUndo()) return; if (this.tool === 'pen' && e.shiftKey && this.penRedoStep()) return; e.shiftKey ? this.redo() : this.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); if (this.tool === 'pen' && this.penRedoStep()) return; this.redo(); return; }
      if (!typing && (e.ctrlKey || e.metaKey) && !e.altKey && ['c', 'x', 'v', 'd'].includes(e.key.toLowerCase())) { e.preventDefault(); this._clipKey(e.key.toLowerCase()); return; }
      if (typing) return;
      if (e.ctrlKey || e.metaKey) return;                                                    // (no other shortcut fires with Ctrl held: Ctrl+V is paste, not the vehicle tool)
      if (this.tool === 'pen' && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); this.penUndo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.removeSelected(); }
      else if (e.key === 'a') { this._setTool(this.tool === 'addpoint' ? 'road' : 'addpoint'); this.draw(); }
      else if (e.key === 'v' || e.key === 'V') { this._setTool(this.tool === 'vehicle' ? 'road' : 'vehicle'); this.draw(); }
      else if (e.key === 'p' || e.key === 'P') { this._setTool(this.tool === 'pen' && !this.blank ? 'road' : 'pen'); this.draw(); }
      else if (e.key === 'Enter' && this.tool === 'pen') this._penFinish();
      else if (e.key === 'o' || e.key === 'O') { this._setTool(this.tool === 'flyover' ? 'road' : 'flyover'); this.draw(); }
      else if (e.key === 'u' || e.key === 'U') { this._setTool(this.tool === 'tunnel' ? 'road' : 'tunnel'); this.draw(); }
      else if (e.key === 'g' || e.key === 'G') { this._setTool(this.tool === 'gap' ? 'road' : 'gap'); this.draw(); }
      else if (e.key === 'l' || e.key === 'L') { this._setTool(this.tool === 'fire' ? 'road' : 'fire'); this.draw(); }
      else if (e.key === 'k' || e.key === 'K') { this._setTool(this.tool === 'skull' ? 'road' : 'skull'); this.draw(); }
      else if (e.key === 'b' || e.key === 'B') { this._setTool(this.tool === 'barrel' ? 'road' : 'barrel'); this.draw(); }
      else if (e.key === 'f' || e.key === 'F') { this.fit(); this.draw(); }
      else if (e.key === '3') { this._show3d(!this.show3d); this.draw(); }
      else if (e.key === '0') { this.preview?.resetView(); this.draw(); }
      else if (e.key === 'Escape') { if (this.tool === 'pen' && (this.pen.length || this.blank)) { this.pen = []; this.penRedo = []; this.draw(); return; } if (this.tool !== 'road') this._setTool('road'); else { this.sel = -1; this.selProp = -1; this.multi?.clear(); } this.updateInspector(); this.draw(); }
      else if (e.key === '[' || e.key === ']') { const n = this.def.handles.length; this.sel = (((this.sel < 0 ? 0 : this.sel) + (e.key === ']' ? 1 : -1)) + n) % n; this.updateInspector(); this.draw(); }
    });
  }
}
