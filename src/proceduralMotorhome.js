import * as THREE from 'three';

// Lightweight procedural A-class motorhome built from Three.js primitives.
// The whole thing is only a few hundred triangles, so it is suitable for the
// low-spec "Poly Vehicles" mode. +Z is the vehicle's driving direction.
export function installProceduralMotorhome(visual) {
  const root = new THREE.Group();
  root.name = 'procedural-motorhome';
  // Body was built with its cab/windscreen at +Z, which is already the
  // vehicle's forward direction here, so no flip is needed.

  const mats = [];
  const mat = (color, roughness = 0.72, metalness = 0.05) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    m.userData.base = m.color.clone();
    mats.push(m);
    return m;
  };

  const cream = mat(0xd9d1ba, 0.80, 0.05);
  const cream2 = mat(0xbdb39c, 0.84, 0.04);
  const trim = mat(0x6f6b62, 0.68, 0.28);
  const stripe = mat(0x7e5a43, 0.82, 0.05);
  const dark = mat(0x16191b, 0.62, 0.18);
  const glass = mat(0x16262d, 0.24, 0.12);
  const rubber = mat(0x121212, 0.98, 0.0);
  const steel = mat(0x77736b, 0.58, 0.62);
  const amber = mat(0xd78425, 0.42, 0.05);
  const red = mat(0x8d2620, 0.55, 0.08);

  const addBox = (name, sx, sy, sz, x, y, z, material, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    root.add(mesh);
    return mesh;
  };

  // Tall coachbuilt shell with a slightly narrower lower skirt.
  addBox('living-body', 2.10, 1.86, 4.20, 0, 0.66, -0.36, cream);
  addBox('lower-skirt', 2.04, 0.34, 4.55, 0, -0.18, -0.18, cream2);
  addBox('roof-cap', 2.02, 0.18, 4.05, 0, 1.63, -0.38, cream2);

  // Integrated A-class cab: broad glass, shallow nose, and a brow above the screen.
  addBox('cab-lower', 2.08, 0.68, 1.02, 0, 0.00, 2.04, cream);
  const cabUpper = addBox('cab-upper', 2.03, 0.92, 0.80, 0, 0.75, 2.00, cream);
  cabUpper.rotation.x = -0.10;
  addBox('front-brow', 2.04, 0.20, 0.38, 0, 1.43, 2.12, cream2, -0.08);

  // Huge split windscreen, slightly laid back.
  addBox('windscreen-left', 0.82, 0.73, 0.045, 0.43, 0.90, 2.43, glass, -0.12);
  addBox('windscreen-right', 0.82, 0.73, 0.045, -0.43, 0.90, 2.43, glass, -0.12);
  addBox('windscreen-divider', 0.045, 0.76, 0.060, 0, 0.90, 2.46, dark, -0.12);
  addBox('wiper-left', 0.48, 0.022, 0.032, 0.40, 0.63, 2.49, dark, 0, 0, 0.18);
  addBox('wiper-right', 0.48, 0.022, 0.032, -0.40, 0.63, 2.49, dark, 0, 0, -0.18);

  // Front grille, lamps and chunky old-school bumper.
  addBox('grille', 1.10, 0.27, 0.060, 0, 0.02, 2.57, dark);
  for (const side of [-1, 1]) {
    addBox('headlight', 0.34, 0.23, 0.065, side * 0.68, 0.05, 2.59, steel);
    addBox('indicator', 0.24, 0.11, 0.070, side * 0.68, 0.27, 2.59, amber);
  }
  addBox('front-bumper', 2.18, 0.20, 0.22, 0, -0.31, 2.57, steel);

  // Three large side windows make the silhouette read as a motorhome at a glance.
  for (const side of [-1, 1]) {
    const x = side * 1.065;
    addBox('cab-side-window', 0.045, 0.65, 0.72, x, 0.83, 1.58, glass);
    addBox('living-window-front', 0.045, 0.68, 0.90, x, 0.92, 0.42, glass);
    addBox('living-window-rear', 0.045, 0.68, 0.90, x, 0.92, -1.15, glass);
    addBox('waist-stripe', 0.050, 0.10, 3.92, x * 1.002, 0.18, -0.26, stripe);
    addBox('awning-rail', 0.050, 0.075, 3.30, x * 1.006, 1.43, -0.30, trim);
    addBox('mirror-arm', 0.22, 0.045, 0.045, side * 1.16, 0.76, 1.85, dark);
    addBox('mirror', 0.08, 0.30, 0.21, side * 1.27, 0.76, 1.91, dark);
  }

  // Habitation door, vents and lockers.
  addBox('hab-door', 0.052, 1.38, 0.72, -1.075, 0.56, -0.36, cream2);
  addBox('hab-door-window', 0.057, 0.52, 0.42, -1.082, 0.94, -0.36, glass);
  addBox('door-handle', 0.075, 0.08, 0.10, -1.10, 0.54, -0.02, dark);
  addBox('side-vent', 0.055, 0.25, 0.42, -1.08, -0.02, -1.03, dark);
  addBox('locker', 0.055, 0.34, 0.58, 1.08, -0.03, -1.25, cream2);

  // Rear face and ladder.
  addBox('rear-panel', 2.05, 1.70, 0.12, 0, 0.62, -2.48, cream);
  addBox('rear-bumper', 2.16, 0.18, 0.20, 0, -0.29, -2.55, steel);
  for (const side of [-1, 1]) addBox('rear-light', 0.15, 0.32, 0.060, side * 0.80, 0.02, -2.56, red);
  addBox('ladder-left', 0.045, 1.42, 0.045, 0.72, 0.75, -2.58, steel);
  addBox('ladder-right', 0.045, 1.42, 0.045, 0.98, 0.75, -2.58, steel);
  for (const y of [0.20, 0.48, 0.76, 1.04, 1.32]) addBox('ladder-rung', 0.30, 0.035, 0.045, 0.85, y, -2.60, steel);

  // Roof rack and two simple boards.
  for (const side of [-1, 1]) addBox('roof-rail', 0.055, 0.055, 3.45, side * 0.72, 1.80, -0.28, dark);
  for (const z of [-1.45, -0.50, 0.45, 1.25]) addBox('roof-crossbar', 1.48, 0.045, 0.055, 0, 1.83, z, dark);
  addBox('roof-board-a', 0.22, 0.07, 2.35, -0.28, 1.91, -0.22, cream2);
  addBox('roof-board-b', 0.22, 0.07, 2.35, 0.28, 1.91, -0.22, cream2);

  // Low-segment wheels: enough detail at driving distance, very cheap to draw.
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.23, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.245, 10);
  hubGeo.rotateZ(Math.PI / 2);
  for (const x of [-0.94, 0.94]) for (const z of [1.28, -1.43]) {
    const tyre = new THREE.Mesh(wheelGeo, rubber);
    tyre.position.set(x, -0.27, z); tyre.name = 'wheel'; root.add(tyre);
    const hub = new THREE.Mesh(hubGeo, steel);
    hub.position.set(x, -0.27, z); hub.name = 'hub'; root.add(hub);
  }

  // Let this tiny model cast its own shadow rather than the old car-shaped proxy.
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
