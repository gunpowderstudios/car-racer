import * as THREE from 'three';

// Lightweight procedural motorhome built from Three.js primitives.
// +Z is forward, +Y is up, +X is left, matching vehicle.js.
export function installProceduralMotorhome(visual) {
  const root = new THREE.Group();
  root.name = 'procedural-motorhome';

  const mats = [];
  const mat = (color, roughness = 0.72, metalness = 0.05) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.userData.base = m.color.clone();
    mats.push(m);
    return m;
  };

  const cream = mat(0xd8d0b8, 0.78, 0.08);
  const cream2 = mat(0xbeb59e, 0.82, 0.05);
  const dark = mat(0x171a1c, 0.5, 0.15);
  const glass = mat(0x172329, 0.25, 0.12);
  const rubber = mat(0x161616, 0.95, 0.0);
  const steel = mat(0x6b6860, 0.6, 0.62);
  const rust = mat(0x72402c, 0.9, 0.08);
  const amber = mat(0xd98021, 0.42, 0.05);
  const red = mat(0x7e201c, 0.55, 0.08);

  const addBox = (name, sx, sy, sz, x, y, z, material, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    root.add(mesh);
    return mesh;
  };

  // Main camper shell. Broad simple forms keep the silhouette clear at racing-camera distance.
  addBox('body', 2.04, 1.72, 4.45, 0, 0.58, -0.24, cream);
  addBox('lower-skirt', 2.08, 0.34, 4.54, 0, -0.15, -0.22, cream2);

  // Cab / nose: stepped front gives the old European motorhome character.
  addBox('cab-lower', 2.02, 0.76, 1.16, 0, 0.05, 2.06, cream);
  const cabTop = addBox('cab-top', 1.98, 0.92, 0.92, 0, 0.79, 1.97, cream);
  cabTop.rotation.x = -0.08;

  // Windscreen: one broad panel with a centre divider.
  addBox('windscreen', 1.72, 0.66, 0.045, 0, 0.88, 2.44, glass, -0.10);
  addBox('windscreen-divider', 0.045, 0.70, 0.065, 0, 0.88, 2.47, dark, -0.10);
  addBox('wiper-l', 0.46, 0.025, 0.035, 0.42, 0.62, 2.49, dark, 0, 0, 0.14);
  addBox('wiper-r', 0.46, 0.025, 0.035, -0.42, 0.62, 2.49, dark, 0, 0, -0.14);

  // Side windows and door details. Duplicate both sides where useful so it reads from any camera.
  for (const side of [-1, 1]) {
    const x = side * 1.035;
    addBox('cab-side-window', 0.045, 0.62, 0.72, x, 0.80, 1.65, glass);
    addBox('mid-window', 0.045, 0.62, 0.90, x, 0.83, 0.30, glass);
    addBox('rear-window', 0.045, 0.62, 0.82, x, 0.83, -1.15, glass);
    addBox('side-stripe', 0.055, 0.10, 3.72, x * 1.005, 0.22, -0.20, rust);
    addBox('mirror-arm', 0.20, 0.045, 0.045, side * 1.12, 0.72, 1.86, dark);
    addBox('mirror', 0.08, 0.28, 0.20, side * 1.22, 0.72, 1.90, dark);
  }

  // Front face.
  addBox('grille', 1.20, 0.28, 0.06, 0, 0.06, 2.59, dark);
  for (const side of [-1, 1]) {
    addBox('headlight', 0.34, 0.24, 0.065, side * 0.70, 0.08, 2.60, steel);
    addBox('indicator', 0.20, 0.11, 0.070, side * 0.70, 0.30, 2.60, amber);
    addBox('rear-light', 0.13, 0.30, 0.060, side * 0.79, 0.05, -2.51, red);
  }
  addBox('front-bumper', 2.16, 0.20, 0.22, 0, -0.29, 2.55, steel);
  addBox('rear-bumper', 2.14, 0.18, 0.20, 0, -0.28, -2.48, steel);

  // Roof rack: deliberately chunky rather than detailed tubes.
  for (const side of [-1, 1]) addBox('roof-rail', 0.055, 0.055, 3.55, side * 0.72, 1.53, -0.15, dark);
  for (const z of [-1.55, -0.55, 0.45, 1.30]) addBox('roof-crossbar', 1.48, 0.045, 0.055, 0, 1.57, z, dark);
  addBox('roof-board-a', 0.22, 0.07, 2.45, -0.28, 1.65, -0.15, cream2);
  addBox('roof-board-b', 0.22, 0.07, 2.45, 0.28, 1.65, -0.15, cream2);

  // Wheels. Low segment count is intentional: this is a lightweight game asset.
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.235, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const wheelZ = [1.35, -1.40];
  for (const x of [-0.92, 0.92]) for (const z of wheelZ) {
    const tyre = new THREE.Mesh(wheelGeo, rubber);
    tyre.position.set(x, -0.25, z); tyre.name = 'wheel'; root.add(tyre);
    const hub = new THREE.Mesh(hubGeo, steel);
    hub.position.set(x, -0.25, z); root.add(hub);
  }

  // A few large vents/panels add character without texture maps.
  for (const side of [-1, 1]) {
    addBox('vent', 0.05, 0.28, 0.42, side * 1.04, -0.02, -0.65, dark);
    addBox('service-panel', 0.05, 0.34, 0.54, side * 1.04, -0.02, -1.55, cream2);
  }

  // Tiny amount of deliberate asymmetry / wear blocks so it doesn't feel toy-perfect.
  addBox('rust-patch-front', 0.08, 0.18, 0.50, 1.05, -0.12, 1.78, rust, 0, 0, 0.08);
  addBox('rust-patch-rear', 0.08, 0.12, 0.68, -1.05, -0.08, -1.72, rust, 0, 0, -0.05);

  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = false;
    o.receiveShadow = false;
  });

  // Replace whatever visual is currently in the holder (placeholder or loaded GLB).
  while (visual.holder.children.length) visual.holder.remove(visual.holder.children[0]);
  visual.holder.add(root);
  visual.model = root;
  visual.mats = mats;
  visual.loaded = true;
  visual.hasTexture = false;
  visual._lookKey = -1;
  visual.onLoad?.(visual);
  return root;
}
