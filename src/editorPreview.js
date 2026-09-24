// Small rotating 3D view of the track for the editor. It builds a light mesh straight from
// the Track samples (road ribbon, elevation curtains, supports), so it can rebuild on every
// drag without stalling. The game itself still uses trackGeometry.js.
import * as THREE from 'three';

const INK = 0xeaf6ff, AMBER = 0xffc857, PAPER = 0x10335f, LINE = 0x7fb8e6, RED = 0xff6b5e;

export class EditorPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setClearColor(PAPER, 1);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(PAPER, 400, 2600);
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 8000);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x1b3a66, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(0.4, 1, 0.3); this.scene.add(sun);

    this.roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.curtainMat = new THREE.MeshBasicMaterial({ color: LINE, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    this.edgeMat = new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.75 });
    this.postMat = new THREE.LineBasicMaterial({ color: LINE, transparent: true, opacity: 0.55 });
    this.gapMat = new THREE.LineBasicMaterial({ color: RED });
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.grid = null;

    const mk = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: AMBER }));
    this.marker = new THREE.Group(); this.marker.add(mk);
    this.markerStem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]), new THREE.LineBasicMaterial({ color: AMBER }));
    this.marker.add(this.markerStem); this.marker.visible = false; this.scene.add(this.marker);
    this.start = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.scene.add(this.start);

    this.yaw = 0.6; this.pitch = 0.5; this.zoom = 1; this.spin = true; this._idle = 0;
    this.center = new THREE.Vector3(); this.radius = 300;
    this.track = null; this.dirty = false; this.sel = -1; this.active = false; this._last = 0;
    this._bind();
  }

  /** Call with the latest Track; the mesh rebuilds on the next frame (coalesced). */
  setTrack(track) { this.track = track; this.dirty = true; }
  setSelected(k) { this.sel = k; this._placeMarker(); }
  /** Re-frame the camera on the whole track (used by Fit). */
  fit() { this.zoom = 1; this._frame(); }

  play() {
    if (this.active) return;
    this.active = true; this._last = performance.now();
    const loop = (now) => { if (!this.active) return; requestAnimationFrame(loop); this._tick(now); };
    requestAnimationFrame(loop);
  }
  stop() { this.active = false; }

  _bind() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; this.spin = false; c.style.cursor = 'grabbing'; });
    c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw = drag.yaw - (e.clientX - drag.x) * 0.008;
      this.pitch = Math.min(1.45, Math.max(0.08, drag.pitch + (e.clientY - drag.y) * 0.006));
    });
    const end = () => { drag = null; this._idle = 0; c.style.cursor = 'grab'; };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoom = Math.min(2.5, Math.max(0.3, this.zoom * Math.exp(Math.max(-0.1, Math.min(0.1, dy * 0.0012)))));
      this.spin = false; this._idle = 0;
    }, { passive: false });
    c.addEventListener('dblclick', () => { this.spin = true; this.fit(); });
  }

  _tick(now) {
    const dt = Math.min(0.1, (now - this._last) / 1000); this._last = now;
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const w = Math.round(r.width), h = Math.round(r.height);
    if (this._w !== w || this._h !== h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this._w = w; this._h = h; }
    if (this.dirty && this.track) { this._build(); this.dirty = false; }
    if (!this.spin) { this._idle += dt; if (this._idle > 4) this.spin = true; }    // resume turning after a few seconds
    if (this.spin) this.yaw += dt * 0.22;
    const d = this.radius * 2.05 * this.zoom;
    this.camera.position.set(
      this.center.x + Math.sin(this.yaw) * Math.cos(this.pitch) * d,
      this.center.y + Math.sin(this.pitch) * d,
      this.center.z + Math.cos(this.yaw) * Math.cos(this.pitch) * d);
    this.camera.lookAt(this.center);
    this.renderer.render(this.scene, this.camera);
  }

  _frame() {
    const t = this.track; if (!t) return;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, maxY = 0;
    for (let i = 0; i < t.n; i++) { minX = Math.min(minX, t.px[i]); maxX = Math.max(maxX, t.px[i]); minZ = Math.min(minZ, t.pz[i]); maxZ = Math.max(maxZ, t.pz[i]); maxY = Math.max(maxY, t.py[i]); }
    this.center.set((minX + maxX) / 2, maxY * 0.3 * (this.ex || 1), (minZ + maxZ) / 2);
    this.radius = Math.max(60, Math.hypot(maxX - minX, maxZ - minZ) / 2);
    this.scene.fog.near = this.radius * 1.5; this.scene.fog.far = this.radius * 6;
  }

  _build() {
    const t = this.track, n = t.n;
    this._frame();
    // exaggerate heights so hills and jumps read at this size (shown in the panel title)
    const topY = Math.max(1, ...t.py);
    const ex = this.ex = Math.round(Math.min(4, Math.max(1, (this.radius * 0.12) / topY)) * 2) / 2;
    this.onScale?.(ex);
    for (const o of [...this.group.children]) { o.geometry.dispose(); this.group.remove(o); }

    const V = 3;                                    // 3 m spacing is plenty for a preview
    const maxY = Math.max(6, ...t.py);
    const pos = [], col = [], idx = [], curtain = [], cIdx = [], edges = [], posts = [], gaps = [];
    const cLow = new THREE.Color(0x9fe3ff), cHigh = new THREE.Color(0xffc857), c = new THREE.Color();
    const edge = (i, sg) => {
      const hw = t.hw[i];
      const x = t.px[i] + t.lx[i] * hw * sg, z = t.pz[i] + t.lz[i] * hw * sg;
      const y = t.py[i] - (t.nx[i] * t.lx[i] * hw * sg + t.nz[i] * t.lz[i] * hw * sg) / t.ny[i];
      return [x, (y + 0.05) * ex, z];
    };
    const samples = []; for (let i = 0; i < n; i += V) samples.push(i); samples.push(0);
    let prevRoad = false;
    for (let k = 0; k < samples.length; k++) {
      const i = samples[k], L = edge(i, 1), R = edge(i, -1);
      c.copy(cLow).lerp(cHigh, Math.min(1, t.py[i] / maxY));
      const base = pos.length / 3;
      pos.push(...L, ...R); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      const cb = curtain.length / 3;
      curtain.push(L[0], L[1], L[2], L[0], 0, L[2], R[0], R[1], R[2], R[0], 0, R[2]);
      const road = !t.gap[i];
      if (k > 0 && road && prevRoad) {
        idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
        cIdx.push(cb - 4, cb, cb - 3, cb - 3, cb, cb + 1, cb - 2, cb + 2, cb - 1, cb - 1, cb + 2, cb + 3);
        const pL = pos.slice((base - 2) * 3, (base - 2) * 3 + 3), pR = pos.slice((base - 1) * 3, (base - 1) * 3 + 3);
        edges.push(...pL, ...L, ...pR, ...R);
      }
      if (road && t.py[i] > 2.5 && k % 6 === 0) posts.push(t.px[i], t.py[i] * ex, t.pz[i], t.px[i], 0, t.pz[i]);
      if (road !== prevRoad && k > 0) gaps.push(...L, ...R);     // red line where the road stops or starts
      prevRoad = road;
    }
    const geo = (arr, index, color) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
      if (index) g.setIndex(index);
      return g;
    };
    const roadGeo = geo(pos, idx, col); roadGeo.computeVertexNormals();
    this.group.add(new THREE.Mesh(roadGeo, this.roadMat));
    this.group.add(new THREE.Mesh(geo(curtain, cIdx), this.curtainMat));
    this.group.add(new THREE.LineSegments(geo(edges), this.edgeMat));
    if (posts.length) this.group.add(new THREE.LineSegments(geo(posts), this.postMat));
    if (gaps.length) this.group.add(new THREE.LineSegments(geo(gaps), this.gapMat));

    // ground grid sized to the track
    const size = Math.ceil((this.radius * 2.6) / 50) * 50;
    if (!this.grid || this.grid.userData.size !== size) {
      if (this.grid) { this.grid.geometry.dispose(); this.scene.remove(this.grid); }
      this.grid = new THREE.GridHelper(size, size / 25, LINE, LINE);
      this.grid.material.transparent = true; this.grid.material.opacity = 0.22; this.grid.userData.size = size;
      this.scene.add(this.grid);
    }
    this.grid.position.set(this.center.x, 0, this.center.z);

    // start line block, and the selected point
    const f = t.frameAt(0);
    this.start.position.set(f.x, f.y * ex + 0.3, f.z); this.start.scale.set(t.hw[0] * 2, 1, Math.max(1, this.radius / 150));
    this.start.rotation.y = Math.atan2(f.fx, f.fz);
    this._placeMarker();
  }

  _placeMarker() {
    const t = this.track;
    if (!t || this.sel < 0 || this.sel >= t.handleS.length) { this.marker.visible = false; return; }
    const f = t.frameAt(t.handleS[this.sel]), s = Math.max(2.5, this.radius / 60), y = f.y * (this.ex || 1) + s * 3;
    this.marker.position.set(f.x, y, f.z);
    this.marker.children[0].scale.setScalar(s);
    this.markerStem.scale.y = y;
    this.marker.visible = true;
  }
}
