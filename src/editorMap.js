// Map backdrop for the track editor: a screenshot of a real place laid flat under the grid, to trace a road over.
// It is a drawing guide only (never in the game). The picture is kept in this browser, per track name.
const MAX_PX = 1600;                  // the picture is shrunk to this on the long side (keeps it small to store)
const KEY = 'cr.map:';

/** Default width in metres for a freshly loaded picture: about 80% of what is on screen. */
export function startWidth(viewW, scale) { return Math.round(Math.max(40, (viewW / scale) * 0.8)); }

/** After the user says two clicked points are `dist` metres apart: returns the map's new width and centre, scaling about point A so A stays put. */
export function rescale(map, A, B, dist) {
  const d = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (!(d > 0) || !(dist > 0)) return null;
  const f = dist / d;
  return { w: map.w * f, x: A[0] + (map.x - A[0]) * f, z: A[1] + (map.z - A[1]) * f, f };
}

/** Screen-space transform pieces for drawing: where the centre goes and how many screen pixels one image pixel covers. */
export function drawParams(map, iw, S) { return { k: (S * map.w) / iw, rot: (map.rot || 0) * Math.PI / 180 }; }

export class EditorMap {
  constructor(ed) {
    this.ed = ed; this.m = null; this.img = null; this.mode = null; this.A = null; this.B = null; this.drag = null; this.open = false;
    const c = ed.c;
    c.addEventListener('pointerdown', (e) => this._down(e), true);
    c.addEventListener('pointermove', (e) => this._move(e), true);
    c.addEventListener('pointerup', (e) => this._up(e), true);
    c.addEventListener('pointercancel', (e) => this._up(e), true);
    this._build();
  }

  // ---------------------------------------------------------------- storage
  load(name) {
    this.m = null; this.img = null; this.mode = null; this.A = this.B = null;
    try {
      const raw = localStorage.getItem(KEY + name);
      if (raw) { const m = JSON.parse(raw); if (m && typeof m.src === 'string') { this.m = m; this._img(m.src); } }
    } catch { /* blocked or corrupt: no backdrop */ }
    this._sync();
  }
  _save() {
    if (!this.m) return;
    try { localStorage.setItem(KEY + (this.ed.def?.name || ''), JSON.stringify(this.m)); this._warned = false; }
    catch { if (!this._warned) { this._warned = true; this.ed.cb.toast('The map picture is too big to remember after a reload. It still works until you close the editor.'); } }
  }
  _forget() { try { localStorage.removeItem(KEY + (this.ed.def?.name || '')); } catch { /* blocked */ } }
  _img(src) { const im = new Image(); im.onload = () => { this.img = im; this._sync(); this.ed.draw(); }; im.src = src; }

  /** The user picked a file: shrink it, then lay it in the middle of the screen. */
  async add(file) {
    if (!file || !/^image\//.test(file.type)) { this.ed.cb.toast('That is not a picture. Use a PNG or JPG screenshot.'); return; }
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { this.ed.cb.toast('Could not read that picture.'); return; }
    const f = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * f); cv.height = Math.round(bmp.height * f);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const src = cv.toDataURL('image/jpeg', 0.82), v = this.ed.view;
    const fit = this.ed.def?.mapFit;                                  // (a tracing track says where its picture goes)
    this.m = fit ? { src, x: fit.x, z: fit.z, w: fit.w, rot: fit.rot, op: 0.6 } : { src, x: v.x, z: v.z, w: startWidth(this.ed.w, v.scale), rot: 0, op: 0.6 };
    this._img(src); this.mode = 'move'; this._save(); this._sync();
    this.ed.cb.toast(fit ? 'Picture added and lined up with this track.' : 'Picture added. Drag it into place, then use Set scale to make the streets the right size.');
  }
  remove() { this.m = null; this.img = null; this.mode = null; this.A = this.B = null; this._forget(); this._sync(); this.ed.draw(); }

  // ---------------------------------------------------------------- drawing
  draw(g) {
    const m = this.m, im = this.img; if (!m || !im || m.hide) return;
    const ed = this.ed, [cx, cy] = ed.toScreen(m.x, m.z), p = drawParams(m, im.width, ed.view.scale);
    g.save(); g.translate(cx, cy); g.rotate(p.rot); g.scale(p.k, p.k); g.globalAlpha = m.op; g.drawImage(im, -im.width / 2, -im.height / 2); g.restore();
    if (this.mode === 'move') {                                          // outline, so you can see what you are dragging
      g.save(); g.translate(cx, cy); g.rotate(p.rot); g.strokeStyle = 'rgba(255,200,87,.8)'; g.setLineDash([8, 6]); g.lineWidth = 1.5;
      g.strokeRect(-im.width * p.k / 2, -im.height * p.k / 2, im.width * p.k, im.height * p.k); g.restore();
    }
    if (this.A) {                                                        // the two points for Set scale
      g.save(); g.strokeStyle = '#ffc857'; g.fillStyle = '#ffc857'; g.lineWidth = 2;
      const a = ed.toScreen(...this.A), b = this.B ? ed.toScreen(...this.B) : null;
      g.beginPath(); g.arc(a[0], a[1], 5, 0, 6.3); g.fill();
      if (b) { g.beginPath(); g.arc(b[0], b[1], 5, 0, 6.3); g.fill(); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      g.restore();
    }
  }

  // ---------------------------------------------------------------- mouse (runs before the editor's own handlers, only while a map mode is on)
  _own(e) { return this.m && this.mode && e.button === 0; }
  _pos(e) { const r = this.ed.c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  _down(e) {
    if (!this._own(e)) return;
    e.stopImmediatePropagation();
    const [sx, sy] = this._pos(e), w = this.ed.toWorld(sx, sy); this.ed.c.setPointerCapture(e.pointerId);
    if (this.mode === 'move') this.drag = { w, x: this.m.x, z: this.m.z };
    else if (this.mode === 'scale') {
      if (!this.A || this.B) { this.A = w; this.B = null; this._ask(false); } else { this.B = w; this._ask(true); }
      this.ed.draw();
    }
  }
  _move(e) {
    if (!this.drag) return;
    e.stopImmediatePropagation();
    const [sx, sy] = this._pos(e), w = this.ed.toWorld(sx, sy);
    this.m.x = this.drag.x + (w[0] - this.drag.w[0]); this.m.z = this.drag.z + (w[1] - this.drag.w[1]); this.ed.draw();
  }
  _up(e) { if (!this.drag) return; e.stopImmediatePropagation(); this.drag = null; this._save(); }

  // ---------------------------------------------------------------- panel
  _build() {
    const p = this.panel = document.createElement('div'); p.id = 'ed-map-panel'; p.hidden = true;
    p.innerHTML = `
      <div class="mp-head"><b>Map backdrop</b><button data-a="close" aria-label="Close">&times;</button></div>
      <div class="mp-note">Trace a real place: add a screenshot, line it up, then draw the road over it. It is only a guide and never shows in the game.</div>
      <div class="mp-row"><button data-a="add">Add picture</button><input type="file" accept="image/*" hidden><button data-a="remove">Remove</button></div>
      <div class="mp-has">
        <div class="mp-row"><button data-a="move" aria-pressed="false">Drag picture</button><button data-a="scale" aria-pressed="false">Set scale</button><button data-a="hide" aria-pressed="false">Hide</button></div>
        <div class="mp-ask" hidden><span>Those two points are</span><input type="number" min="1" max="20000" value="100" step="1"><span>m apart</span><button data-a="apply">Apply</button></div>
        <label>Size <input type="range" data-k="w" min="40" max="4000" step="1"><span data-o="w"></span></label>
        <label>Turn <input type="range" data-k="rot" min="-180" max="180" step="0.5"><span data-o="rot"></span></label>
        <label>See-through <input type="range" data-k="op" min="0.1" max="1" step="0.05"><span data-o="op"></span></label>
      </div>`;
    this.ed.c.parentElement.appendChild(p);
    const file = p.querySelector('input[type=file]');
    file.onchange = () => { this.add(file.files[0]); file.value = ''; };
    p.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'close') this.show(false);
      else if (a === 'add') file.click();
      else if (a === 'remove') this.remove();
      else if (a === 'move' || a === 'scale') { this.mode = this.mode === a ? null : a; this.A = this.B = null; this._ask(false); this._sync(); this.ed.draw();
        if (this.mode === 'scale') this.ed.cb.toast('Set scale: click two places on the picture whose real distance you know (a street length, say), then type the distance.'); }
      else if (a === 'hide') { this.m.hide = !this.m.hide; this._save(); this._sync(); this.ed.draw(); }
      else if (a === 'apply') this._apply();
    });
    p.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => {
      if (!this.m) return; this.m[r.dataset.k] = +r.value; this._sync(true); this.ed.draw(); clearTimeout(this._st); this._st = setTimeout(() => this._save(), 400);
    }));
    // typing a distance must not trigger the editor's single-key shortcuts
    p.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && e.target.type === 'number') this._apply(); });
  }
  _ask(on) { this.panel.querySelector('.mp-ask').hidden = !on; if (on) this.panel.querySelector('.mp-ask input').focus(); }
  _apply() {
    const dist = +this.panel.querySelector('.mp-ask input').value, r = this.A && this.B ? rescale(this.m, this.A, this.B, dist) : null;
    if (!r) { this.ed.cb.toast('Click two different points and give the distance in metres.'); return; }
    this.m.w = Math.min(20000, Math.max(10, r.w)); this.m.x = r.x; this.m.z = r.z;
    this.A = this.B = null; this.mode = null; this._ask(false); this._save(); this._sync(); this.ed.draw();
    this.ed.cb.toast(`Scale set (the picture is now ${Math.round(this.m.w)} m wide).`);
  }
  show(on) { this.open = on; this.panel.hidden = !on; if (!on) { this.mode = null; this.A = this.B = null; this._ask(false); } this._sync(); this.ed.draw(); }
  toggle() { this.show(!this.open); }
  _sync(light) {
    const p = this.panel, m = this.m;
    this.ed.c.style.cursor = this.mode ? (this.mode === 'move' ? 'move' : 'crosshair') : this.ed.c.style.cursor;
    document.getElementById('ed-map')?.setAttribute('aria-pressed', String(this.open));
    p.querySelectorAll('.mp-has').forEach((el) => { el.hidden = !m; }); p.querySelector('[data-a=remove]').hidden = !m;
    if (!m) return;
    for (const k of ['w', 'rot', 'op']) {
      const r = p.querySelector(`[data-k=${k}]`), o = p.querySelector(`[data-o=${k}]`);
      if (!light) { if (k === 'w') r.max = Math.max(4000, Math.ceil(m.w * 1.5)); r.value = m[k]; }
      o.textContent = k === 'w' ? `${Math.round(m.w)} m` : k === 'rot' ? `${Math.round(m.rot)}°` : `${Math.round(m.op * 100)}%`;
    }
    p.querySelector('[data-a=move]').setAttribute('aria-pressed', String(this.mode === 'move'));
    p.querySelector('[data-a=scale]').setAttribute('aria-pressed', String(this.mode === 'scale'));
    p.querySelector('[data-a=hide]').setAttribute('aria-pressed', String(!!m.hide)); p.querySelector('[data-a=hide]').textContent = m.hide ? 'Show' : 'Hide';
  }
}
