// The multiplayer results screen: "Paul came 1st!" over a podium with each of the top three drivers' cars turning on it, and their names.
// multiplayerRace.js sends the finishing order (a 'carracer-race-podium' event on every player's screen); this only draws it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { vehicleById, modelUrl } from './vehicleChoice.js';
import { assetUrl } from './assetVersion.js';
import { tidyGltfMaterial, RIVAL_LOOKS, recolour } from './carVisual.js';
const hueCss = (hue) => (hue != null && RIVAL_LOOKS[hue] ? '#' + RIVAL_LOOKS[hue].tint.toString(16).padStart(6, '0') : '#f6d9b0');

const ORD = ['1st', '2nd', '3rd'];
// podium slots, left to right on screen: 2nd, 1st, 3rd
const SLOTS = [{ place: 1, x: -3.1, h: 0.95 }, { place: 0, x: 0, h: 1.5 }, { place: 2, x: 3.1, h: 0.62 }];
let overlay = null, stop = null;

function build() {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'podium'; overlay.hidden = true;
  overlay.innerHTML = '<div class="podium-inner"><h2 id="podium-title"></h2><div class="podium-stage"><canvas id="podium-canvas"></canvas><div id="podium-names"></div></div><p id="podium-rest" class="fine"></p><div class="podium-btns"><button id="podium-replay" class="btn" type="button">Watch replay</button><button id="podium-close" class="btn ghost" type="button">Back to the game</button></div></div>';
  const st = document.createElement('style');
  st.textContent = `
#podium{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 40%,rgba(60,32,100,.94),rgba(16,9,30,.97));color:#f6d9b0}
#podium[hidden]{display:none}
.podium-inner{width:min(900px,96vw);text-align:center}.podium-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:10px}
#podium-title{margin:0 0 4px;font-family:"Big Shoulders Display",Impact,sans-serif;font-weight:900;font-size:clamp(40px,8vw,88px);line-height:.95;text-transform:uppercase;color:#ffb31f;text-shadow:3px 3px 0 #e8392c}
.podium-stage{position:relative;width:100%;aspect-ratio:2/1}
#podium-canvas{position:absolute;inset:0;width:100%;height:100%}
#podium-names{position:absolute;inset:0;pointer-events:none}
#podium-names div{position:absolute;transform:translateX(-50%);margin-top:4px;font-family:"Barlow Condensed",Arial,sans-serif;font-weight:700;font-size:clamp(15px,2.8vw,26px);line-height:1.05;text-shadow:0 2px 6px #000;white-space:nowrap}
#podium-names b{display:block;font-family:"Big Shoulders Display",Impact,sans-serif;font-size:1.5em;color:#ffb31f}
#podium-rest{margin:6px 0 10px}`;
  document.head.appendChild(st);
  document.body.appendChild(overlay);
  overlay.querySelector('#podium-close').onclick = hide;
  overlay.querySelector('#podium-replay').onclick = () => { hide(); window.dispatchEvent(new CustomEvent('carracer-podium-replay')); };
  return overlay;
}
function hide() { if (stop) { stop(); stop = null; } if (overlay) overlay.hidden = true; }

function loadCar(id, hue = null) {
  const v = vehicleById(id), look = Number.isInteger(hue) ? RIVAL_LOOKS[hue] : null;
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(assetUrl(modelUrl(v.url))).then((g) => {
    const m = g.scene;
    m.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const painted = mats.map((src) => {
        const x = src.clone(); tidyGltfMaterial(x);
        if (!look) return x;
        if (x.map) {
          if (v.neutralBody) x.map.userData.neutralBody = true;
          const tex = recolour(x.map, look);
          if (tex) x.map = tex; else x.color.set(look.tint);
        } else x.color.set(look.tint);
        return x;
      });
      o.material = Array.isArray(o.material) ? painted : painted[0];
    });
    const b = new THREE.Box3().setFromObject(m), sz = b.getSize(new THREE.Vector3());
    m.scale.setScalar(2.7 / Math.max(sz.x, sz.z));
    m.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -b2.min.y, -c.z);
    const g2 = new THREE.Group(); g2.add(m); return g2;
  }).catch(() => null);
}

let lastPodium = null;
export function reshowPodium() { if (lastPodium) showPodium(lastPodium.list, lastPodium.selfId, lastPodium.derby); }
export function showPodium(list, selfId, derby = false) {
  if (!Array.isArray(list) || !list.length) return;
  lastPodium = { list, selfId, derby };
  hide();
  const ov = build();
  const top = list.slice(0, 3);
  ov.querySelector('#podium-title').textContent = derby ? (top[0].id === selfId ? 'You are the last one standing!' : `${top[0].name} is the last one standing!`) : (top[0].id === selfId ? 'You came 1st!' : `${top[0].name} came 1st!`);
  ov.querySelector('#podium-rest').textContent = list.length > 3 ? list.slice(3).map((p, i) => `${i + 4}th ${p.name}`).join(' · ') : '';
  ov.hidden = false;
  const oldCanvas = ov.querySelector('#podium-canvas'), canvas = oldCanvas.cloneNode(false);
  oldCanvas.replaceWith(canvas);                                  // a fresh canvas each time: the last one's WebGL context was released, and a canvas cannot get a new one (it came back as a blank white box)
  const names = ov.querySelector('#podium-names');
  names.innerHTML = '';
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(34, 2, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffe2b4, 0x25163e, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(3, 7, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a47, 1.5); rim.position.set(-5, 3, -4); scene.add(rim);
  cam.position.set(0, 3.4, 12.5); cam.lookAt(0, 0.7, 0); cam.updateMatrixWorld(true);
  const spinners = [];
  for (const slot of SLOTS) {
    const who = top[slot.place]; if (!who) continue;
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.6, slot.h, 2.4), new THREE.MeshStandardMaterial({ color: slot.place === 0 ? 0xffb31f : slot.place === 1 ? 0xc9ccd6 : 0xb87333, roughness: 0.5, metalness: 0.3 }));
    block.position.set(slot.x, slot.h / 2, 0); scene.add(block);
    const v = new THREE.Vector3(slot.x, -0.1, 1.2).project(cam);          // where the name goes: just under the podium block
    const label = document.createElement('div');
    label.style.left = ((v.x * 0.5 + 0.5) * 100) + '%'; label.style.top = ((-v.y * 0.5 + 0.5) * 100) + '%';
    label.innerHTML = '<b></b><span></span>';
    label.querySelector('b').textContent = ORD[slot.place];
    const sp = label.querySelector('span'); sp.textContent = who.id === selfId ? `${who.name} (you)` : who.name; sp.style.color = hueCss(who.hue);
    names.appendChild(label);
    loadCar(who.vehicleId, who.hue).then((car) => { if (!car || !overlay || overlay.hidden) return; car.position.set(slot.x, slot.h, 0); scene.add(car); spinners.push(car); });
  }
  let raf = 0, last = performance.now(), alive = true;
  const frame = (now) => {
    if (!alive) return; raf = requestAnimationFrame(frame);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && (canvas.width !== Math.round(w * renderer.getPixelRatio()))) { renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const c of spinners) c.rotation.y += dt * 0.9;
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(frame);
  stop = () => { alive = false; cancelAnimationFrame(raf); renderer.dispose(); renderer.forceContextLoss?.(); };
}

window.addEventListener('carracer-race-podium', (e) => showPodium(e.detail?.list, e.detail?.selfId, !!e.detail?.derby));
