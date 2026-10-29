// The world around the car: dusk sky, lights, ground, plus the meshes for a given track.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { roadTexture, dirtRoadTexture, grassTexture, windowTexture, checkerTexture, bannerTexture } from './textures.js';
import { buildTrackGeometry } from './trackGeometry.js';
import { Track, puddleShape, puddleEdge, WALL_GAP, TANK_H } from './track.js';
import { buildArena } from './arenaView.js';
import { AssaultView } from './assaultView.js';
import { GetawayView } from './getawayView.js';

// Golden-hour look: a low sun (about 17 degrees up) from the side and a little behind, strong warm light, dark cool shadows, a hazy warm distance.
const SKY_TOP = 0x1f3a72, SKY_MID = 0xc2557a, SKY_LOW = 0xffa45c, FOG = 0xe39a6a;
const SUN_OFFSET = [-250, 95, -190];          // (x, y, z) from the car: y over the ground distance is about tan(17 degrees)

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** A lumpy rock: a squashed, roughened sphere (lit with flat facets). */
function rockGeometry() {
  const rg = new THREE.IcosahedronGeometry(1, 2), pos = rg.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * 5.1 + y * 3.3) * Math.cos(z * 4.7 - y * 2.1) * 0.5 + Math.sin(x * 11 + z * 9) * 0.25;
    const k = 1 + 0.22 * n; pos.setXYZ(i, x * k, y * k * (y < 0 ? 0.6 : 1), z * k);
  }
  rg.computeVertexNormals();
  return rg;
}

export class Stage {
  /** `q` is a quality tier from quality.js (aniso, shadowSize, shadowRange); the defaults match the old fixed values. */
  constructor(renderer, q = {}) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(FOG, 240, 2200);
    const aniso = Math.min(q.aniso ?? 8, renderer.capabilities.getMaxAnisotropy());
    this.aniso = aniso;

    // environment for reflections on the car paint
    const pm = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.4;
    pm.dispose();

    // sky dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(SKY_TOP) }, mid: { value: new THREE.Color(SKY_MID) }, low: { value: new THREE.Color(SKY_LOW) }, sunDir: { value: new THREE.Vector3(...SUN_OFFSET).normalize() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir;
        void main(){ float h = clamp(vP.y, -0.1, 1.0);
          vec3 c = mix(low, mid, smoothstep(0.0, 0.28, h)); c = mix(c, top, smoothstep(0.22, 0.8, h));
          float sd = max(dot(normalize(vP), sunDir), 0.0);
          c += vec3(1.0, 0.55, 0.22) * (pow(sd, 6.0) * 0.45 + pow(sd, 28.0) * 0.5) * (1.0 - smoothstep(0.0, 0.7, h));   // warm glow round the sun, strongest low down
          c = mix(c, vec3(1.0, 0.93, 0.78), smoothstep(0.9988, 0.9996, sd));                                          // the sun itself
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 14), skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // lights
    this.hemi = new THREE.HemisphereLight(0x6a80c4, 0x3c2a24, 0.3);       // weak cool fill, so shadows stay dark and blue next to the warm sun
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffb468, 4.3);               // low sun: strong and golden (the ground sees only a third of it at this angle)
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(q.shadowSize ?? 2048, q.shadowSize ?? 2048);
    const R = q.shadowRange ?? 70;
    const sc = this.sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 700;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.5;           // (a low sun needs more bias or the road speckles)
    this.sunOffset = new THREE.Vector3(...SUN_OFFSET);
    this.scene.add(this.sun, this.sun.target);

    // ground
    const gm = new THREE.MeshStandardMaterial({ map: grassTexture(aniso), roughness: 1, metalness: 0 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), gm);
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true;
    this.groundLevel = -0.35; // keep grass safely below low/banked road edges to prevent z-fighting
    this.ground.position.y = this.groundLevel;
    this.scene.add(this.ground);

    this.trackGroup = null;
    this.textures = { road: roadTexture(aniso) };
  }

  setShadows(on) { this.sun.castShadow = on; this.renderer.shadowMap.enabled = on; }

  /** Follow the camera/car so the sky, ground and shadow box never run out. */
  update(focus, camPos) {
    this.sun.position.copy(focus).add(this.sunOffset);
    this.sun.target.position.copy(focus);
    this.sky.position.copy(camPos);
    this.ground.position.set(camPos.x, this.groundLevel, camPos.z);
    const t = this.ground.material.map;
    // keep the grass pattern fixed in world space while the plane follows the camera
    t.offset.set(camPos.x / 9000 * 400, -camPos.z / 9000 * 400);
  }

  /** Apple Crumple: put every hazard where its clock says it is (`a` is the Assault run). */
  updateAssault(a) { if (this.assaultView && a) this.assaultView.update(a); }
  /** The Getaway: bags, rings and the safehouse (`game` is the GetawayGame). */
  setGetawayRoute(pts) { if (this.getawayView) this.getawayView.setRoute(pts); }
  updateGetaway(game, dt) { if (this.getawayView && game) this.getawayView.update(game, dt); }

  /** Put each rolling boulder where the simulation has it, turning as it rolls. */
  updateRollers() {
    if (this.fish) this._swim();
    if (!this.rollerMeshes || !this.rollerMeshes.length) return;
    const ax = new THREE.Vector3(), dq = new THREE.Quaternion();
    for (const m of this.rollerMeshes) {
      const rk = m.userData.rock;
      m.position.set(rk.x, rk.y + rk.h * 0.5, rk.z);
      if (rk.state === 'roll') { ax.set(rk.dz, 0, -rk.dx); dq.setFromAxisAngle(ax, (rk.ang - (m.userData.ang || 0))); m.quaternion.premultiply(dq); m.userData.ang = rk.ang; }
      else if (rk.state === 'wait') m.userData.ang = rk.ang;
    }
  }

  /** Goldfish swimming about at random INSIDE the thick glass walls of the flooded tank (the walls are the aquariums): one instanced body and one instanced tail, moved a little every frame (see updateRollers). */
  _addFish(g, track, range, rows) {
    const N = 22, rnd = mulberry(4242), T = 1.65, H = TANK_H;
    const body = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0x7a2a00, emissiveIntensity: 0.6, roughness: 0.4 }), N);
    const tg = new THREE.ConeGeometry(0.5, 1, 6); tg.rotateZ(-Math.PI / 2);                      // apex towards the body, wide end out behind
    const tail = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: 0xffb040, emissive: 0x7a4a00, emissiveIntensity: 0.6, roughness: 0.5, side: THREE.DoubleSide }), N);
    body.frustumCulled = tail.frustumCulled = false; g.add(body); g.add(tail);
    const hw = rows[0].hw, fish = [];
    for (let i = 0; i < N; i++) fish.push({ side: i % 2 ? 1 : -1, s: range.a + 3 + rnd() * (range.b - range.a - 6), d: 0.55 + rnd() * (T - 1.1), y: 0.9 + rnd() * (H - 2.2), h: rnd() * 6.28, v: 0.7 + rnd() * 1.0, ph: rnd() * 6.28, big: 1.5 + rnd() * 1.1 });
    this.fish = { track, range, fish, body, tail, hw, T, H, t: performance.now() };
  }

  _swim() {
    const F = this.fish; if (!F) return;
    const now = performance.now(), dt = Math.min(0.1, (now - F.t) / 1000); F.t = now;
    const f = this._ff || (this._ff = {}), m = this._fm || (this._fm = new THREE.Matrix4()), m2 = new THREE.Matrix4(), tm = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), P = new THREE.Vector3(), S = new THREE.Vector3(), Y2 = new THREE.Vector3(), U = new THREE.Vector3(0, 1, 0);
    F.fish.forEach((k, i) => {
      k.h += (Math.sin(now / 1000 * 0.9 + k.ph * 3) * 1.2 + (Math.random() - 0.5) * 2.4) * dt;      // wander: the heading drifts and gets nudged at random (h is the angle in the plane of the wall: along it and up)
      k.s += Math.cos(k.h) * k.v * dt; k.y += Math.sin(k.h) * k.v * dt;
      k.d += (Math.random() - 0.5) * 0.6 * dt; k.d = Math.min(F.T - 0.5, Math.max(0.5, k.d));          // a little drift in and out through the thickness of the glass
      if (k.s < F.range.a + 2 || k.s > F.range.b - 2) { k.h = Math.PI - k.h; k.s = Math.min(F.range.b - 2, Math.max(F.range.a + 2, k.s)); }       // turn round at the ends of the wall
      if (k.y < 0.6 || k.y > F.H - 0.8) { k.h = -k.h; k.y = Math.min(F.H - 0.8, Math.max(0.6, k.y)); }                                              // and at the bottom and the water surface
      F.track.frameAt(k.s, f);
      const o = k.side * (F.hw + k.d);
      P.set(f.x + f.lx * o, f.y + f.ly * o + k.y, f.z + f.lz * o);
      const c = Math.cos(k.h), sn = Math.sin(k.h);
      X.set(f.fx * c, f.fy * c + sn, f.fz * c).normalize();                                          // the way it is facing: along the wall and up or down
      Z.crossVectors(X, U); if (Z.lengthSq() < 1e-6) Z.set(f.lx, f.ly, f.lz); Z.normalize(); Y2.crossVectors(Z, X);
      m.makeBasis(X, Y2, Z).setPosition(P);
      S.set(0.3 * k.big, 0.12 * k.big, 0.09 * k.big); m2.copy(m).scale(S); F.body.setMatrixAt(i, m2);
      const wag = Math.sin(now / 1000 * 9 + k.ph) * 0.55;
      tm.copy(m).multiply(m2.makeTranslation(-0.27 * k.big, 0, 0)).multiply(m2.makeRotationY(wag)).multiply(m2.makeTranslation(-0.1 * k.big, 0, 0)).multiply(m2.makeScale(0.2 * k.big, 0.2 * k.big, 0.03 * k.big));
      F.tail.setMatrixAt(i, tm);
    });
    F.body.instanceMatrix.needsUpdate = true; F.tail.instanceMatrix.needsUpdate = true;
  }

  clearTrack() {
    this.fish = null; this.assaultView = null; this.getawayView = null;
    if (!this.trackGroup) return;
    this.scene.remove(this.trackGroup);
    this.trackGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map && m.map !== this.textures.road) m.map.dispose(); m.dispose(); }); }
    });
    this.trackGroup = null;
  }

  setTrack(track) {
    this.clearTrack();
    if (track.def.mode === 'lastStanding') return this._setArena(track);
    const geo = buildTrackGeometry(track);
    const g = new THREE.Group();

    const mesh = (a, mat, { cast = false, receive = true } = {}) => {
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
      bg.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
      bg.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
      bg.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
      bg.setIndex(new THREE.BufferAttribute(a.index, 1));
      bg.computeBoundingSphere();
      const m = new THREE.Mesh(bg, mat);
      m.castShadow = cast; m.receiveShadow = receive; m.frustumCulled = false;
      g.add(m); return m;
    };
    const dirty = !!track.def.dirt, roadMat = new THREE.MeshStandardMaterial({ map: dirty ? dirtRoadTexture(this.aniso || 8) : this.textures.road, roughness: 0.93, metalness: 0, side: THREE.DoubleSide });
    const vcMat = (rough = 0.9) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, side: THREE.DoubleSide });
    mesh(geo.road, roadMat);
    if (!dirty) mesh(geo.kerb, vcMat(0.8));
    mesh(geo.bank, vcMat(1));
    mesh(geo.slab, vcMat(0.95), { cast: true });
    mesh(geo.wall, vcMat(0.75), { cast: true });

    // puddles on a rally stage: flat, glossy pools lying on the road (turned to follow its slope)
    if (track.puddles) {
      const wm = new THREE.MeshStandardMaterial({ color: 0x2f5c78, roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.82, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const q = Track.newQuery(), zAxis = new THREE.Vector3(0, 0, 1), nrm = new THREE.Vector3();
      const range = track.floodRange();                                               // a flooded dip (Big Dipper): a fish tank, glass walls either side with the water inside, lying on the road
      if (range) {
        const f = {}, STEP = 2, H = TANK_H, W = 0.4, T = 1.65, GAP = WALL_GAP;          // glass height, water depth (about halfway up a wheel), glass thickness (a thick slab), and how far outside the road edge the glass stands (the physics wall is there too)
        const rows = []; for (let sv = range.a; sv <= range.b + 1e-6; sv += STEP) { track.frameAt(sv, f); rows.push({ x: f.x, y: f.y, z: f.z, lx: f.lx, ly: f.ly, lz: f.lz, hw: f.hw + GAP }); }
        const at = (r, side, up, extra = 0) => { const o = side * (r.hw + extra); return [r.x + r.lx * o, r.y + r.ly * o + up, r.z + r.lz * o]; };
        const ribbon = (pts, mat) => {                                                 // pts(r) -> the two edges of one strip at that step along the road
          const pos = [], idx = [];
          rows.forEach((r, k) => { const e = pts(r); pos.push(...e[0], ...e[1]); if (k > 0) { const i = k * 2; idx.push(i - 2, i - 1, i, i - 1, i + 1, i); } });
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
          const m = new THREE.Mesh(geo, mat); m.receiveShadow = false; m.frustumCulled = false; g.add(m);
        };
        const water = new THREE.MeshStandardMaterial({ color: 0x1ea4ff, emissive: 0x0a4a8a, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
        const glass = new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x2a6a8a, emissiveIntensity: 0.5, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
        const edge = new THREE.MeshStandardMaterial({ color: 0xeaf9ff, emissive: 0x6ab8d8, emissiveIntensity: 0.7, roughness: 0.3, side: THREE.DoubleSide });
        ribbon((r) => [at(r, -1, W), at(r, 1, W)], water);                              // the water: a top surface...
        for (const side of [-1, 1]) {
          ribbon((r) => [at(r, side, -0.05), at(r, side, W)], water);                   // ...and its side, seen through the glass
          ribbon((r) => [at(r, side, -0.05), at(r, side, H)], glass);                   // the glass slab: inner face, outer face, top, and a bright edge along the top and bottom
          ribbon((r) => [at(r, side, -0.05, T), at(r, side, H, T)], glass);
          const wm2 = water.clone(); wm2.opacity = 0.32;                                    // the wall is an aquarium: water fills it (a little inside the glass), up to just below the top
          ribbon((r) => [at(r, side, 0.05, 0.1), at(r, side, H - 0.3, 0.1)], wm2);
          ribbon((r) => [at(r, side, 0.05, T - 0.1), at(r, side, H - 0.3, T - 0.1)], wm2);
          ribbon((r) => [at(r, side, H - 0.3, 0.1), at(r, side, H - 0.3, T - 0.1)], wm2);
          ribbon((r) => [at(r, side, H), at(r, side, H, T)], edge);
          ribbon((r) => [at(r, side, -0.05), at(r, side, -0.05, T)], edge);
          ribbon((r) => [at(r, side, H - 0.25), at(r, side, H)], edge);
        }
        const quad = (p0, p1, p2, p3, mat) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p3], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; g.add(m); };
        for (const side of [-1, 1]) for (const r of [rows[0], rows[rows.length - 1]]) {   // the glass slabs are solid blocks: a face closes each end
          quad(at(r, side, -0.05), at(r, side, -0.05, T), at(r, side, H, T), at(r, side, H), glass);
          quad(at(r, side, H - 0.25), at(r, side, H - 0.25, T), at(r, side, H, T), at(r, side, H), edge);
        }
        for (const r of [rows[0], rows[rows.length - 1]]) {                             // the ends of the water block: a cross-section, so it reads as a solid slab of water
          const pts = [at(r, -1, -0.05), at(r, 1, -0.05), at(r, 1, W), at(r, -1, W)], geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
          const m = new THREE.Mesh(geo, water); m.frustumCulled = false; g.add(m);
        }
        this._addFish(g, track, range, rows);
      }
      for (const p of track.puddles) {
        if (p.r >= 15) continue;
        track.query(p.x, 1e4, p.z, q, 1);
        const sh = puddleShape(p), pts = [];
        for (let i = 0; i < 48; i++) {                                           // an irregular, lumpy, stretched outline (the same one the physics uses); local y is world -z once the mesh is laid on the ground
          const th = i / 48 * Math.PI * 2, e = puddleEdge(sh, th), u = Math.cos(th) * sh.a * e, v = Math.sin(th) * sh.b * e;
          pts.push(new THREE.Vector2(u * sh.cos - v * sh.sin, -(u * sh.sin + v * sh.cos)));
        }
        const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), wm);
        nrm.set(q.nx, q.ny, q.nz); m.quaternion.setFromUnitVectors(zAxis, nrm);
        m.position.set(p.x, q.y + 0.04, p.z); m.receiveShadow = false; m.frustumCulled = false; g.add(m);
      }
    }

    // boulders beside a rally stage: one lumpy grey rock shape, stretched and turned a different way for each
    this.rollerMeshes = [];
    if (track.rocks) {
      const rg = rockGeometry(), rm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, flatShading: true });
      const still = track.rocks.filter((r) => !r.roller);
      const im = new THREE.InstancedMesh(rg, rm, Math.max(1, still.length)), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), pp = new THREE.Vector3(), ss = new THREE.Vector3(), cc = new THREE.Color();
      const rnd = mulberry(77);
      still.forEach((rk, i) => {
        ee.set((rnd() - 0.5) * 0.35, rnd() * 6.28, (rnd() - 0.5) * 0.35); qq.setFromEuler(ee);
        pp.set(rk.x, rk.y + rk.h * 0.4, rk.z); ss.set(rk.r * (0.95 + rnd() * 0.2), rk.h * 0.6, rk.r * (0.95 + rnd() * 0.2));
        m4.compose(pp, qq, ss); im.setMatrixAt(i, m4);
        const gg = 0.38 + rnd() * 0.22; cc.setRGB(gg, gg * 0.98, gg * 0.95); im.setColorAt(i, cc);          // greys, a touch of warmth
      });
      im.count = still.length; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; g.add(im);
      for (const rk of track.rocks) if (rk.roller) {                                                           // the ones that roll across the road: a rounder rock each, moved every frame
        const m = new THREE.Mesh(rg, rm.clone()); m.material.color.setRGB(0.5, 0.49, 0.47);
        m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.scale.set(rk.r, rk.r * 0.95, rk.r);
        m.userData.rock = rk; g.add(m); this.rollerMeshes.push(m);
      }
    }

    // pillars
    if (geo.pillars.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x6b6870, roughness: 0.95 }), geo.pillars.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qBank = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
      geo.pillars.forEach((pl, i) => {
        // Roll around the deck's own axis to match its bank, then yaw to its heading - otherwise a
        // flat-topped pillar pokes through one edge of a steeply banked road while gapping the other.
        qBank.setFromAxisAngle(new THREE.Vector3(0, 0, 1), pl.bank || 0);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.yaw).multiply(qBank);
        p.set(pl.x, pl.h / 2, pl.z); s.set(pl.w, pl.h, 1.6);
        m4.compose(p, q, s); im.setMatrixAt(i, m4);
      });
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; g.add(im);
    }

    // lamp posts
    if (!dirty && geo.lamps.length) {
      const pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 7, 0.16), new THREE.MeshStandardMaterial({ color: 0x2e2c38, roughness: 0.6 }), geo.lamps.length);
      const head = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 0.16, 0.5), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa640, emissiveIntensity: 2.2 }), geo.lamps.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
      geo.lamps.forEach((l, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(l.dx, l.dz));
        p.set(l.x, l.y + 3.5, l.z); m4.compose(p, q, one); pole.setMatrixAt(i, m4);
        p.set(l.x + l.dx * 0.5, l.y + 7.0, l.z + l.dz * 0.5); m4.compose(p, q, one); head.setMatrixAt(i, m4);
      });
      pole.castShadow = true; pole.frustumCulled = false; head.frustumCulled = false; g.add(pole, head);
    }

    g.add(this._startLine(geo.start));
    g.add(this._scenery(track, geo));
    if (track.def.assault) this.assaultView = new AssaultView(track, g);          // Apple Crumple: the hazards, signs and checkpoint gates
    this.scene.add(g);
    this.trackGroup = g;
    return geo;
  }

  /** An open arena (see arena.js) has no road to draw: a dirt floor, a wall and stands instead. */
  _setArena(track) {
    const g = new THREE.Group(), arena = buildArena(track, this.aniso);
    g.add(arena);
    const geo = { bounds: arena.userData.bounds, arena: true };
    if (track.def.getaway) this.getawayView = new GetawayView(track, g);          // The Getaway: the town, its bags and the safehouse (no scenery in the streets)
    else g.add(this._scenery(track, geo, arena.userData.clear));
    this.scene.add(g); this.trackGroup = g;
    return geo;
  }

  _startLine(s) {
    const grp = new THREE.Group();
    const yaw = Math.atan2(s.fx, s.fz);
    const w = s.hw * 2;
    const tx = checkerTexture(); tx.wrapS = THREE.RepeatWrapping; tx.repeat.set(Math.max(1, Math.round(w / 3.2)), 1);
    const geo = new THREE.PlaneGeometry(w, 3.2).rotateX(-Math.PI / 2);        // width along X, length along Z, normal +Y
    const line = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    // basis: X = banked left, Y = surface normal, Z = direction of travel -> lies exactly on the road plane
    line.matrixAutoUpdate = false;
    line.matrix.makeBasis(new THREE.Vector3(s.bx, s.by, s.bz), new THREE.Vector3(s.nx, s.ny, s.nz), new THREE.Vector3(s.fx, s.fy, s.fz));
    line.matrix.setPosition(s.x, s.y + 0.03, s.z);
    line.receiveShadow = true;
    grp.add(line);
    // gantry
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b3550, roughness: 0.5, metalness: 0.4 });
    const off = s.hw + 1.4;
    for (const sg of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), poleMat);
      p.position.set(s.x + s.lx * off * sg, s.y + 4.5, s.z + s.lz * off * sg); p.castShadow = true; grp.add(p);
    }
    const face = new THREE.MeshStandardMaterial({ map: bannerTexture('START / FINISH'), roughness: 0.6 });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(w + 3.2, 2.2, 0.35), [poleMat, poleMat, poleMat, poleMat, face, face]);
    banner.position.set(s.x, s.y + 8.4, s.z); banner.rotation.y = yaw; banner.castShadow = true;
    grp.add(banner);
    return grp;
  }

  _scenery(track, geo, clear = track.hw[0] + 16) {
    const g = new THREE.Group();
    const rnd = mulberry(Math.floor(track.length * 7) ^ track.n);
    const b = geo.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2;

    // distance-to-road test on a decimated sample list
    const xs = [], zs = [];
    for (let i = 0; i < track.n; i += 4) { xs.push(track.px[i]); zs.push(track.pz[i]); }
    const nearRoad = (x, z, min) => { const m2 = min * min; for (let i = 0; i < xs.length; i++) { const dx = x - xs[i], dz = z - zs[i]; if (dx * dx + dz * dz < m2) return true; } return false; };

    // trees
    const trees = [];
    for (let tries = 0; tries < 2600 && trees.length < 240; tries++) {
      const x = cx + (rnd() * 2 - 1) * (half + 260), z = cz + (rnd() * 2 - 1) * (half + 260);
      if (nearRoad(x, z, clear)) continue;
      trees.push([x, z, 0.8 + rnd() * 1.1]);
    }
    // Share the exact visible tree positions with vehicle physics. The trunk collider matches the
    // cylinder artwork closely enough to feel solid without making the broad crown an invisible wall.
    track.trees = trees.map(([x, z, sc]) => ({ x, z, y: 0, r: 0.35 * sc, h: 3 * sc }));
    if (trees.length) {
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 1 }), trees.length);
      const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 8, 7), new THREE.MeshStandardMaterial({ color: 0x27452f, roughness: 1 }), trees.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
      trees.forEach(([x, z, sc], i) => {
        s.set(sc, sc, sc); p.set(x, 1.5 * sc, z); m4.compose(p, q, s); trunk.setMatrixAt(i, m4);
        p.set(x, (3 + 4) * sc, z); m4.compose(p, q, s); crown.setMatrixAt(i, m4);
      });
      trunk.castShadow = crown.castShadow = true; trunk.frustumCulled = crown.frustumCulled = false;
      g.add(trunk, crown);
    }

    // distant city
    const wtex = windowTexture();
    const cityMat = new THREE.MeshStandardMaterial({ color: 0x1a1733, roughness: 1, emissive: 0xffffff, emissiveMap: wtex, emissiveIntensity: 0.9 });
    const N = 110;
    const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), cityMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = rnd() * Math.PI * 2, r = half + 520 + rnd() * 900;
      const w = 40 + rnd() * 90, h = 50 + Math.pow(rnd(), 2) * 320, d = 40 + rnd() * 90;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
      p.set(cx + Math.cos(a) * r, h / 2, cz + Math.sin(a) * r); s.set(w, h, d);
      m4.compose(p, q, s); city.setMatrixAt(i, m4);
    }
    city.frustumCulled = false; g.add(city);
    return g;
  }
}
