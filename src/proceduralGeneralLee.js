import * as THREE from 'three';

// Lightweight procedural muscle-car build, styled after the classic orange
// "01" stunt car, for the low-spec "Poly Vehicles" mode. Built entirely from
// primitives plus two small canvas decals (roof flag, door number) so there
// are no extra image assets to load. +Z is the vehicle's driving direction.
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

  const paint = mat(0xd9482b, 0.35, 0.3);
  const black = mat(0x101010, 0.55, 0.15);
  const chrome = mat(0xc9c9c9, 0.25, 0.85);
  const glass = mat(0x18262d, 0.2, 0.1);
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

  // Long, low fastback body with a black vinyl roof panel.
  addBox('body-lower', 1.83, 0.60, 4.55, 0, -0.10, 0, paint);
  addBox('hood', 1.78, 0.10, 1.55, 0, 0.26, 1.35, paint);
  addBox('trunk-deck', 1.78, 0.10, 1.10, 0, 0.26, -1.55, paint);
  addBox('cabin', 1.64, 0.44, 1.95, 0, 0.60, -0.05, paint);
  const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(1.40, 0.05, 1.55), [black, black, flagMat, black, black, black]);
  roofMesh.name = 'roof'; roofMesh.position.set(0, 0.85, -0.10);
  root.add(roofMesh);

  // Windscreen, backlight and side glass.
  addBox('windscreen', 1.50, 0.42, 0.04, 0, 0.72, 0.85, glass, -0.35);
  addBox('backlight', 1.44, 0.40, 0.04, 0, 0.70, -1.00, glass, 0.30);
  for (const side of [-1, 1]) {
    addBox('side-window', 0.04, 0.34, 1.55, side * 0.825, 0.66, -0.10, glass);
    addBox('door-line', 0.06, 0.02, 3.1, side * 0.92, 0.10, -0.05, black);
    addBox('door-decal', 0.03, 0.42, 0.42, side * 0.93, -0.02, -0.10, numMat);
    addBox('mirror-arm', 0.05, 0.05, 0.10, side * 0.95, 0.62, 0.75, black);
    addBox('mirror', 0.10, 0.10, 0.16, side * 1.02, 0.62, 0.80, black);
  }

  // Front grille, quad headlights, chrome bumper.
  addBox('grille', 1.10, 0.22, 0.05, 0, -0.02, 2.28, black);
  for (const side of [-1, 1]) {
    addBox('headlight', 0.30, 0.24, 0.05, side * 0.62, -0.02, 2.30, chrome);
    addBox('indicator', 0.20, 0.10, 0.05, side * 0.62, -0.20, 2.30, amber);
  }
  addBox('front-bumper', 1.95, 0.18, 0.20, 0, -0.30, 2.30, chrome);

  // Rear panel, tail lights, chrome bumper.
  addBox('rear-panel', 1.80, 0.30, 0.05, 0, -0.05, -2.28, black);
  for (const side of [-1, 1]) addBox('tail-light', 0.55, 0.16, 0.05, side * 0.45, -0.05, -2.28, red);
  addBox('rear-bumper', 1.95, 0.18, 0.20, 0, -0.30, -2.28, chrome);

  // Wheels: black tyres with simple chrome mag hubs.
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.25, 10);
  hubGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.85, 0.85]) for (const z of [1.30, -1.40]) {
    const tyre = new THREE.Mesh(wheelGeo, rubber);
    tyre.position.set(x, -0.33, z); tyre.name = 'wheel'; root.add(tyre);
    const hub = new THREE.Mesh(hubGeo, chrome);
    hub.position.set(x, -0.33, z); hub.name = 'hub'; root.add(hub);
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
