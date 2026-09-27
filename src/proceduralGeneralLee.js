import * as THREE from 'three';

// Higher-detail procedural muscle-car build, styled after the classic orange
// "01" stunt car, for the low-spec "Poly Vehicles" mode. Still just primitives
// (no external model), but broken into more panels/trim so the silhouette and
// details read properly instead of looking like a plain box. +Z is the
// vehicle's driving direction.
export function installProceduralGeneralLee(visual) {
  const root = new THREE.Group();
  root.name = 'procedural-general-lee';
  // Hood/windscreen are built at +Z, already the vehicle's forward direction.

  const mats = [];
  const mat = (color, roughness = 0.4, metalness = 0.25) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.userData.base = m.color.clone();
    mats.push(m);
    return m;
  };

  const paint = mat(0xd9482b, 0.32, 0.32);
  const black = mat(0x101010, 0.55, 0.15);
  const chrome = mat(0xcfcfcf, 0.18, 0.9);
  const chromeDark = mat(0x8c8c8c, 0.22, 0.85);
  const glass = mat(0x18262d, 0.18, 0.1);
  const rubber = mat(0x121212, 0.98, 0.0);
  const amber = mat(0xd78425, 0.4, 0.05);
  const red = mat(0x8d2620, 0.5, 0.08);

  // Roof decal: a small canvas cross-and-stars flag, close enough at driving
  // distance without needing an image file.
  const flagCv = document.createElement('canvas');
  flagCv.width = 128; flagCv.height = 64;
  const fg = flagCv.getContext('2d');
  fg.fillStyle = '#b5231d'; fg.fillRect(0, 0, 128, 64);
  fg.strokeStyle = '#1c2f6b'; fg.lineWidth = 16;
  fg.beginPath(); fg.moveTo(0, 0); fg.lineTo(128, 64); fg.moveTo(128, 0); fg.lineTo(0, 64); fg.stroke();
  fg.fillStyle = '#f2f2f2';
  for (const [x, y] of [[20, 10], [44, 20], [64, 32], [84, 20], [108, 10], [20, 54], [44, 44], [84, 44], [108, 54]]) {
    fg.beginPath(); fg.arc(x, y, 2.6, 0, Math.PI * 2); fg.fill();
  }
  const flagTex = new THREE.CanvasTexture(flagCv);
  flagTex.colorSpace = THREE.SRGBColorSpace;
  const flagMat = new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.6, metalness: 0.02 });
  flagMat.userData.base = new THREE.Color(0xffffff);
  mats.push(flagMat);

  // Door decal: plain white circle with a "01".
  const numCv = document.createElement('canvas');
  numCv.width = 96; numCv.height = 96;
  const ng = numCv.getContext('2d');
  ng.fillStyle = '#d9482b'; ng.fillRect(0, 0, 96, 96);
  ng.fillStyle = '#f4f2ea'; ng.beginPath(); ng.arc(48, 48, 40, 0, Math.PI * 2); ng.fill();
  ng.fillStyle = '#1c2f6b'; ng.font = 'bold 46px sans-serif';
  ng.textAlign = 'center'; ng.textBaseline = 'middle'; ng.fillText('01', 48, 52);
  const numTex = new THREE.CanvasTexture(numCv);
  numTex.colorSpace = THREE.SRGBColorSpace;
  const numMat = new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.6, metalness: 0.02 });
  numMat.userData.base = new THREE.Color(0xffffff);
  mats.push(numMat);

  const addBox = (name, sx, sy, sz, x, y, z, material, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.name = name; mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
    root.add(mesh);
    return mesh;
  };

  // --- Lower body: sill, main tub and fender flares (fake curvature with several boxes) ---
  addBox('rocker-l', 0.10, 0.10, 3.55, -0.90, -0.36, -0.05, black);
  addBox('rocker-r', 0.10, 0.10, 3.55, 0.90, -0.36, -0.05, black);
  addBox('body-lower', 1.80, 0.42, 4.55, 0, -0.14, 0, paint);
  addBox('belt-trim-l', 0.02, 0.03, 3.85, -0.915, 0.36, -0.05, chrome);
  addBox('belt-trim-r', 0.02, 0.03, 3.85, 0.915, 0.36, -0.05, chrome);
  for (const z of [1.30, -1.40]) {
    for (const side of [-1, 1]) {
      addBox('fender-flare', 0.14, 0.22, 0.62, side * 0.955, -0.02, z, paint);
      addBox('arch-shadow', 0.06, 0.10, 0.66, side * 1.00, -0.10, z, black);
    }
  }

  // --- Hood, trunk and greenhouse (narrower upper cabin gives a tapered look) ---
  addBox('hood', 1.78, 0.10, 1.55, 0, 0.28, 1.35, paint);
  addBox('hood-bulge', 0.36, 0.035, 1.20, 0, 0.335, 1.35, paint);
  addBox('trunk-deck', 1.78, 0.10, 1.10, 0, 0.28, -1.55, paint);
  addBox('cabin-sill', 1.66, 0.10, 2.05, 0, 0.44, -0.05, paint);
  addBox('cabin', 1.52, 0.34, 1.85, 0, 0.63, -0.05, paint);
  for (const side of [-1, 1]) {
    addBox('c-pillar', 0.06, 0.32, 0.28, side * 0.79, 0.62, -0.88, black);
    addBox('a-pillar', 0.055, 0.34, 0.10, side * 0.79, 0.62, 0.72, black);
  }
  const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.05, 1.55), black);
  roofMesh.name = 'roof'; roofMesh.position.set(0, 0.85, -0.10);
  root.add(roofMesh);
  // Flag decal as its own thin panel sitting on top, rather than a multi-material
  // face on the roof box: rival-car cloning assumes one material per mesh.
  const flagPanel = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.01, 1.51), flagMat);
  flagPanel.name = 'roof-flag'; flagPanel.position.set(0, 0.876, -0.10);
  root.add(flagPanel);

  // Windscreen, backlight and side glass.
  addBox('windscreen', 1.44, 0.40, 0.04, 0, 0.72, 0.83, glass, -0.35);
  addBox('backlight', 1.38, 0.38, 0.04, 0, 0.70, -1.00, glass, 0.30);
  for (const side of [-1, 1]) {
    addBox('side-window', 0.04, 0.32, 1.45, side * 0.79, 0.66, -0.12, glass);
    addBox('door-line', 0.06, 0.02, 3.1, side * 0.92, 0.10, -0.05, black);
    addBox('door-handle', 0.05, 0.035, 0.10, side * 0.955, 0.12, 0.35, chrome);
    addBox('door-decal', 0.03, 0.42, 0.42, side * 0.955, -0.02, -0.10, numMat);
    addBox('mirror-arm', 0.05, 0.05, 0.10, side * 0.90, 0.62, 0.75, black);
    addBox('mirror', 0.10, 0.10, 0.16, side * 0.98, 0.62, 0.80, black);
  }

  // --- Front end: chrome grille surround, vertical bars, round headlights, bumper with overriders ---
  addBox('grille-surround', 1.20, 0.30, 0.05, 0, 0.00, 2.26, chromeDark);
  addBox('grille', 1.06, 0.22, 0.03, 0, -0.01, 2.29, black);
  for (const gx of [-0.32, -0.11, 0.11, 0.32]) addBox('grille-bar', 0.025, 0.20, 0.04, gx, -0.01, 2.30, chrome);
  const lampGeo = new THREE.CylinderGeometry(0.145, 0.145, 0.06, 14);
  lampGeo.rotateX(Math.PI / 2);
  const bezelGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.03, 14);
  bezelGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const bezel = new THREE.Mesh(bezelGeo, chromeDark);
    bezel.position.set(side * 0.62, -0.01, 2.28); bezel.name = 'headlight-bezel'; root.add(bezel);
    const lamp = new THREE.Mesh(lampGeo, chrome);
    lamp.position.set(side * 0.62, -0.01, 2.31); lamp.name = 'headlight'; root.add(lamp);
    addBox('indicator', 0.20, 0.09, 0.05, side * 0.62, -0.21, 2.30, amber);
  }
  addBox('front-bumper', 1.98, 0.16, 0.20, 0, -0.32, 2.32, chrome);
  for (const side of [-1, 1]) addBox('bumper-guard', 0.10, 0.20, 0.10, side * 0.55, -0.22, 2.38, chromeDark);

  // --- Rear end: panel, tail lights, bumper with overriders, exhaust tips ---
  addBox('rear-panel', 1.80, 0.30, 0.05, 0, -0.05, -2.28, black);
  for (const side of [-1, 1]) {
    addBox('tail-light', 0.55, 0.16, 0.05, side * 0.45, -0.05, -2.28, red);
    addBox('bumper-guard-r', 0.10, 0.20, 0.10, side * 0.55, -0.24, -2.36, chromeDark);
  }
  addBox('rear-bumper', 1.98, 0.16, 0.20, 0, -0.32, -2.30, chrome);
  const exhaustGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.18, 10);
  exhaustGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(exhaustGeo, chromeDark);
    pipe.position.set(side * 0.30, -0.40, -2.38); pipe.name = 'exhaust'; root.add(pipe);
  }
  addBox('antenna', 0.02, 0.55, 0.02, 0.80, 0.55, -1.9, chromeDark);

  // Wheels: tyre, hub and five simple mag-style spokes.
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 20);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.23, 14);
  hubGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.045, 0.22, 0.05);
  for (const x of [-0.90, 0.90]) for (const z of [1.30, -1.40]) {
    const tyre = new THREE.Mesh(wheelGeo, rubber);
    tyre.position.set(x, -0.33, z); tyre.name = 'wheel'; root.add(tyre);
    const hub = new THREE.Mesh(hubGeo, chrome);
    hub.position.set(x, -0.33, z); hub.name = 'hub'; root.add(hub);
    for (let k = 0; k < 5; k++) {
      const spoke = new THREE.Mesh(spokeGeo, chromeDark);
      spoke.position.set(x, -0.33, z);
      spoke.rotation.x = (k / 5) * Math.PI * 2;
      spoke.translateY(0.11);
      spoke.name = 'spoke'; root.add(spoke);
    }
  }

  for (const child of visual.root.children) if (child !== visual.holder && child.isMesh) child.castShadow = false;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
  });

  while (visual.holder.children.length) visual.holder.remove(visual.holder.children[0]);
  visual.holder.rotation.set(0, 0, 0);
  visual.holder.add(root);
  visual.model = root;
  visual.mats = mats;
  visual.loaded = true;
  visual.hasTexture = false;
  visual._lookKey = -1;
  visual.onLoad?.(visual);
  return root;
}
