import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { VEHICLES, selectedVehicle } from './vehicleChoice.js';
import { assetUrl } from './assetVersion.js';

const COPY = {
  car: 'Big, loud and happiest going sideways.',
  escort: 'Your Dad\'s favourite! Light, lively and always up for a scrap.',
  bmw: 'Great engineering and boringly reliable, Wunderbar!',
  'v8-pilot': "Mum drove it, Dad fixed it. A smokin' V8 bruiser!",
  'motor-home': '"Put the kettle on dear!" Slow, huge and deeply annoying if you\'re stuck behind it.',
  campervan: 'Peace, love and absolutely no hurry whatsoever.',
};

function installPreview({
  wrapId, canvasId, loadingId, nameId = null, blurbId = null,
  active = () => true,
}) {
  const wrap = document.getElementById(wrapId);
  const canvas = document.getElementById(canvasId);
  const loading = document.getElementById(loadingId);
  const nameEl = nameId ? document.getElementById(nameId) : null;
  const blurbEl = blurbId ? document.getElementById(blurbId) : null;
  if (!wrap || !canvas || !loading) return;

  const chosen = selectedVehicle();
  const vehicle = VEHICLES.find((v) => v.id === chosen.id) || chosen;
  if (nameEl) nameEl.textContent = vehicle.name;
  if (blurbEl) blurbEl.textContent = vehicle.description || COPY[vehicle.id] || 'Built for a bit of harmless trouble.';

  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1.55, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xffe2b4, 0x25163e, 2.4));

    const key = new THREE.DirectionalLight(0xffffff, 3.2);
    key.position.set(4, 6, 5);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xff7a47, 1.5);
    rim.position.set(-5, 2, -4);
    scene.add(rim);

    const holder = new THREE.Group();
    scene.add(holder);

    let model = null;
    let dragging = false;
    let lastX = 0;
    let yaw = -0.58;
    const pitch = -0.06;
    let resumeAt = 0;
    let last = performance.now();

    const frameModel = (next) => {
      next.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(next);
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      next.position.sub(centre);
      next.position.y += size.y * 0.02;
      next.updateMatrixWorld(true);

      const framed = new THREE.Box3().setFromObject(next);
      const framedSize = framed.getSize(new THREE.Vector3());
      const radius = Math.max(framedSize.x, framedSize.y, framedSize.z) * 0.66;
      camera.position.set(radius * 1.48, radius * 0.64, radius * 1.92);
      camera.lookAt(0, framedSize.y * 0.015, 0);
      camera.near = Math.max(0.01, radius / 50);
      camera.far = Math.max(100, radius * 20);
      camera.updateProjectionMatrix();
    };

    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loader.loadAsync(assetUrl(vehicle.url)).then((gltf) => {
      model = gltf.scene;
      holder.add(model);
      frameModel(model);
      holder.rotation.set(pitch, yaw, 0);
      wrap.classList.add('ready');
      loading.textContent = '';
    }).catch((err) => {
      console.warn('Could not load vehicle preview.', vehicle.url, err);
      loading.textContent = '3D preview unavailable';
    });

    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      canvas.classList.add('dragging');
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      yaw += (e.clientX - lastX) * 0.008;
      lastX = e.clientX;
      holder.rotation.y = yaw;
    });
    const release = (e) => {
      dragging = false;
      canvas.classList.remove('dragging');
      resumeAt = performance.now() + 1800;
      canvas.releasePointerCapture?.(e.pointerId);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    const resize = () => {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      const dpr = renderer.getPixelRatio();
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    };

    const frame = (now) => {
      requestAnimationFrame(frame);
      if (!active() || document.hidden || wrap.offsetParent === null) {
        last = now;
        return;
      }
      resize();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (model && !dragging && now >= resumeAt) {
        yaw += dt * 0.26;
        holder.rotation.y = yaw;
      }
      holder.rotation.x = pitch;
      renderer.render(scene, camera);
    };
    requestAnimationFrame(frame);
  } catch (err) {
    console.warn('Could not create vehicle preview.', err);
    loading.textContent = '3D preview unavailable';
  }
}

function installVehiclePreviews() {
  installPreview({
    wrapId: 'menu-vehicle-preview',
    canvasId: 'menu-vehicle-canvas',
    loadingId: 'menu-vehicle-loading',
    nameId: 'menu-vehicle-name',
    blurbId: 'menu-vehicle-blurb',
    active: () => document.body.classList.contains('mode-menu'),
  });

  installPreview({
    wrapId: 'mp-home-vehicle-preview',
    canvasId: 'mp-home-vehicle-canvas',
    loadingId: 'mp-home-vehicle-loading',
    nameId: 'mp-home-vehicle-name',
    active: () => document.body.classList.contains('mode-mp'),
  });

  installPreview({
    wrapId: 'mp-join-vehicle-preview',
    canvasId: 'mp-join-vehicle-canvas',
    loadingId: 'mp-join-vehicle-loading',
    nameId: 'mp-join-vehicle-name',
    active: () => document.body.classList.contains('mode-mp'),
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installVehiclePreviews, { once: true });
} else {
  installVehiclePreviews();
}
