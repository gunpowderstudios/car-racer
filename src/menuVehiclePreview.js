import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { VEHICLES, selectedVehicle, modelUrl } from './vehicleChoice.js';
import { assetUrl } from './assetVersion.js';
import { tidyGltfMaterial } from './carVisual.js';
import { CaravanView } from './caravanView.js';
import { HITCH, TOW_CARS, CARAVAN_INFO } from './caravan.js';

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
  const baseBlurb = vehicle.description || COPY[vehicle.id] || 'Built for a bit of harmless trouble.';
  if (blurbEl) blurbEl.textContent = baseBlurb;

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

    let model = null, rig = null, van = null;
    const caravanOn = () => {
      if (!blurbEl) return false;      // the multiplayer pickers never tow
      const cb = document.getElementById('opt-caravan');
      if (cb) return cb.checked;
      try { return !!JSON.parse(localStorage.getItem('cr.opts') || '{}').caravan; } catch { return false; }
    };
    // Cars that can tow: show the caravan hitched on behind the car when "Tow a caravan" is ticked
    const showCaravan = async () => {
      if (!rig || !van) return;
      let want = caravanOn();
      if (want && !van.loaded) await van.load();
      if (!van.loaded) want = false;      // no caravan model (yet): still frame the car on its own
      if (want) {
        van.root.position.set(0, van.dims.wheelR, (HITCH[vehicle.id] || HITCH.escort).z - van.dims.dAxle);
        van.root.rotation.set(0, 0, 0);
        van.root.visible = true;
        rig.add(van.root);
      } else rig.remove(van.root);   // out of the rig when unticked, so the framing ignores it
      if (blurbEl) blurbEl.textContent = want ? `Towing ${CARAVAN_INFO.name}: ${CARAVAN_INFO.blurb}` : baseBlurb;
      rig.position.set(0, 0, 0);
      frameModel(rig, want ? 1.12 : 1);
      holder.rotation.set(pitch, yaw, 0);
      wrap.classList.add('ready'); loading.textContent = '';
    };
    window.addEventListener('change', (e) => { if (e.target?.id === 'opt-caravan') showCaravan(); });
    let dragging = false;
    let lastX = 0;
    let yaw = -0.58;
    const pitch = -0.06;
    let resumeAt = 0;
    let last = performance.now();

    const frameModel = (next, room = 1) => {
      holder.rotation.set(0, 0, 0);          // measure the model un-turned, so the framing is the same whichever way it faces
      holder.updateMatrixWorld(true);
      next.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(next);
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      next.position.sub(centre);
      next.position.y += size.y * 0.02;
      next.updateMatrixWorld(true);

      const framed = new THREE.Box3().setFromObject(next);
      const framedSize = framed.getSize(new THREE.Vector3());
      const radius = Math.max(framedSize.x, framedSize.y, framedSize.z) * 0.66 * room;
      camera.position.set(radius * 1.48, radius * 0.64, radius * 1.92);
      camera.lookAt(0, framedSize.y * 0.015, 0);
      camera.near = Math.max(0.01, radius / 50);
      camera.far = Math.max(100, radius * 20);
      camera.updateProjectionMatrix();
    };

    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loader.loadAsync(assetUrl(modelUrl(vehicle.url))).then((gltf) => {
      model = gltf.scene;
      model.traverse((o) => { if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) tidyGltfMaterial(m); });
      if (TOW_CARS.includes(vehicle.id)) {
        // Lay the car out the way the game does (length-fitted, centred, facing +z) so a caravan can be hitched on behind it
        model.updateMatrixWorld(true);
        let b = new THREE.Box3().setFromObject(model);
        const sz = b.getSize(new THREE.Vector3());
        model.scale.setScalar((vehicle.targetLength || 4.05) / Math.max(sz.x, sz.z));
        model.updateMatrixWorld(true);
        b = new THREE.Box3().setFromObject(model);
        const c = b.getCenter(new THREE.Vector3());
        model.position.set(-c.x, -b.min.y, -c.z);
        const face = new THREE.Group();
        face.rotation.y = vehicle.flip ? -Math.PI / 2 : Math.PI / 2;
        face.add(model);
        rig = new THREE.Group();
        rig.add(face);
        van = new CaravanView(rig);
        rig.remove(van.root);
        holder.add(rig);
        showCaravan();
      } else {
        holder.add(model);
        frameModel(model);
      }
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
      if (typeof window.__previewYaw === 'number') { yaw = window.__previewYaw; holder.rotation.y = yaw; }   // fixed pose, used to make the gallery thumbnails (tools/make-vehicle-thumbs.py)
      else if (model && !dragging && now >= resumeAt) {
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
