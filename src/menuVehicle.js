import * as THREE from 'three';

// Keep the currently selected player vehicle visible on the normal menu scene.
// main.js already loads the correct GLB/physics profile; this only gives that same
// visual a stable showcase pose near the start/finish while the menu camera orbits.
const basis = new THREE.Matrix4();
const q = new THREE.Quaternion();
const left = new THREE.Vector3();
const up = new THREE.Vector3();
const forward = new THREE.Vector3();

function install() {
  const game = window.__game;
  if (!game || !game.stage?.scene || !game.visual) {
    requestAnimationFrame(install);
    return;
  }

  const scene = game.stage.scene;
  const previous = scene.onBeforeRender;
  scene.onBeforeRender = function menuVehicleBeforeRender(renderer, renderedScene, camera, geometry, material, group) {
    if (previous) previous.call(this, renderer, renderedScene, camera, geometry, material, group);
    if (!document.body.classList.contains('mode-menu')) return;

    const track = game.track;
    const visual = game.visual;
    if (!track || !visual) return;

    // A little way beyond the start line keeps the vehicle clear of the gantry and
    // visible in the open part of the menu background.
    const s = (track.startS(12) + 16) % track.length;
    const f = track.frameAt(s);
    const h = game.car.restHeight + 0.08;

    visual.root.visible = true;
    visual.root.scale.setScalar(1);
    visual.root.position.set(
      f.x + f.nx * h,
      f.y + f.ny * h,
      f.z + f.nz * h
    );

    left.set(f.lx, f.ly, f.lz).normalize();
    up.set(f.nx, f.ny, f.nz).normalize();
    forward.set(f.fx, f.fy, f.fz).normalize();
    basis.makeBasis(left, up, forward);
    q.setFromRotationMatrix(basis);
    visual.root.quaternion.copy(q);
  };
}

install();
