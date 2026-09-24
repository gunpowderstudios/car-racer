// The world around the car: dusk sky, lights, ground, plus the meshes for a given track.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { roadTexture, grassTexture, windowTexture, checkerTexture, bannerTexture } from './textures.js';
import { buildTrackGeometry } from './trackGeometry.js';

const SKY_TOP = 0x2a2560, SKY_MID = 0xb04a72, SKY_LOW = 0xf6a05a, FOG = 0xdf8f69;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class Stage {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(FOG, 320, 2600);
    const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.aniso = aniso;

    // environment for reflections on the car paint
    const pm = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pm.dispose();

    // sky dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(SKY_TOP) }, mid: { value: new THREE.Color(SKY_MID) }, low: { value: new THREE.Color(SKY_LOW) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low;
        void main(){ float h = clamp(vP.y, -0.1, 1.0);
          vec3 c = mix(low, mid, smoothstep(0.0, 0.28, h)); c = mix(c, top, smoothstep(0.22, 0.8, h));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 14), skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // lights
    this.hemi = new THREE.HemisphereLight(0x9a8ad6, 0x4a3327, 0.75);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffd0a0, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 700;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.35;
    this.sunOffset = new THREE.Vector3(-170, 210, -120);
    this.scene.add(this.sun, this.sun.target);

    // ground
    const gm = new THREE.MeshStandardMaterial({ map: grassTexture(aniso), roughness: 1, metalness: 0 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), gm);
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true;
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
    this.ground.position.set(camPos.x, 0, camPos.z);
    const t = this.ground.material.map;
    // keep the grass pattern fixed in world space while the plane follows the camera
    t.offset.set(camPos.x / 9000 * 400, -camPos.z / 9000 * 400);
  }

  clearTrack() {
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
    const roadMat = new THREE.MeshStandardMaterial({ map: this.textures.road, roughness: 0.93, metalness: 0, side: THREE.DoubleSide });
    const vcMat = (rough = 0.9) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0, side: THREE.DoubleSide });
    mesh(geo.road, roadMat);
    mesh(geo.kerb, vcMat(0.8));
    mesh(geo.bank, vcMat(1));
    mesh(geo.slab, vcMat(0.95), { cast: true });
    mesh(geo.wall, vcMat(0.75), { cast: true });

    // pillars
    if (geo.pillars.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x6b6870, roughness: 0.95 }), geo.pillars.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
      geo.pillars.forEach((pl, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.yaw);
        p.set(pl.x, pl.h / 2, pl.z); s.set(pl.w, pl.h, 1.6);
        m4.compose(p, q, s); im.setMatrixAt(i, m4);
      });
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; g.add(im);
    }

    // lamp posts
    if (geo.lamps.length) {
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
    this.scene.add(g);
    this.trackGroup = g;
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

  _scenery(track, geo) {
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
      if (nearRoad(x, z, track.hw[0] + 16)) continue;
      trees.push([x, z, 0.8 + rnd() * 1.1]);
    }
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
