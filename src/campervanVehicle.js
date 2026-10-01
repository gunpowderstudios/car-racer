// VW T2-style campervan vehicle extension.
// Adds the model to the shared vehicle catalogue and applies a real-world-inspired
// physics setup before main.js creates the player's Vehicle.
import { VEHICLES } from './vehicleChoice.js';
import { CAR } from './vehicle.js';
import { V3 } from './math.js';

const ID = 'campervan';
const KEY = 'cr.vehicle';

const camper = {
  id: ID,
  name: 'Campervan',
  url: 'cars/campervan.glb',
  fit: 'auto',
  targetLength: 4.42,
  physics: {
    // Approximate early-1970s VW Type 2 proportions, game-tuned for enjoyable handling.
    mass: 1280,
    frontWeight: 0.46,          // rear-engine / rear-drive character
    wheelbase: 2.40,
    track: 1.40,
    wheelRadius: 0.32,
    mountY: 0.05,
    inertia: { x: 3400, y: 3200, z: 1900 },
    susp: {
      free: 0.48, travel: 0.27,
      kFront: 30000, kRear: 32000,
      cCompFront: 2300, cCompRear: 2450,
      cRebFront: 3250, cRebRear: 3450,
      arbFront: 13500, arbRear: 10500,
      bump: 205000, bumpDamp: 9000,
    },
    tyre: {
      muFront: 1.08, muRear: 1.12,
      B: 10.4, C: 1.23, E: 0,
      loadSens: 0.07, nominalLoad: 3200, maxTyreLoad: 7800,
      slideMu: 0.84, rolling: 0.016,
    },
    engine: {
      idle: 850, limiter: 5200, stall: 1800,
      peakTorque: 145, efficiency: 0.87,
      curve: [[850, 0.62], [1600, 0.84], [2600, 1.0], [3400, 0.96], [4300, 0.80], [5200, 0.55]],
      gears: [3.8, 2.2, 1.4, 0.93], reverse: 3.8, finalDrive: 4.13,
      engineBrake: 20,
    },
    brakeBias: 0.58,
    wallBounce: 0.24,
    aero: { drag: 0.72, down: 0.16 },
    steer: { max: 0.55, rate: 4.0, returnRate: 6.0 },
    boost: { accel: 3.9, airShare: 0.32, burn: 3.2, refill: 9, restart: 0.2 },
    body: {
      width: 1.72, length: 4.42,
      bottom: -0.48, shoulder: 0.35,
      roof: 1.28, roofWidth: 1.60, roofLength: 3.55,
    },
  },
};

if (!VEHICLES.some((v) => v.id === ID)) VEHICLES.push(camper);

function selectedId() {
  try { return localStorage.getItem(KEY) || 'car'; } catch { return 'car'; }
}

function makeHull(b) {
  const p = [];
  const hx = b.width / 2, hz = b.length / 2;
  const rhx = b.roofWidth / 2, rhz = b.roofLength / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    p.push(new V3(hx * sx, b.bottom, hz * sz));
    p.push(new V3(hx * sx, b.shoulder, hz * sz));
    p.push(new V3(rhx * sx, b.roof, rhz * sz));
  }
  p.push(new V3(hx, b.shoulder, 0), new V3(-hx, b.shoulder, 0));
  p.push(new V3(0, b.roof, rhz), new V3(0, b.roof, -rhz));
  return p;
}

function applyCamperPhysics() {
  if (selectedId() !== ID) return;
  const p = camper.physics;
  CAR.mass = p.mass;
  CAR.frontWeight = p.frontWeight;
  CAR.wheelbase = p.wheelbase;
  CAR.track = p.track;
  CAR.wheelRadius = p.wheelRadius;
  CAR.mountY = p.mountY;
  CAR.inertia = { ...p.inertia };
  CAR.susp = { ...CAR.susp, ...p.susp };
  CAR.tyre = { ...CAR.tyre, ...p.tyre };
  CAR.engine = { ...CAR.engine, ...p.engine };
  CAR.brakeTotal = 1.30 * p.mass * 9.81;
  CAR.brakeBias = p.brakeBias;
  CAR.wallBounce = p.wallBounce;
  CAR.aero = { ...CAR.aero, ...p.aero };
  CAR.steer = { ...CAR.steer, ...p.steer };
  CAR.boost = { ...CAR.boost, ...p.boost };
  CAR.hull = makeHull(p.body);
  CAR.profileName = '1972 VW Type 2-style campervan';
}

function addOption(select) {
  if (!select || [...select.options].some((o) => o.value === ID)) return;
  const option = document.createElement('option');
  option.value = ID;
  option.textContent = camper.name;
  select.appendChild(option);
  if (selectedId() === ID) select.value = ID;
}

// vehicleChoice.js has already created the selectors by the time this extension runs.
addOption(document.getElementById('opt-vehicle'));
addOption(document.getElementById('mp-vehicle'));
addOption(document.getElementById('mp-join-vehicle'));

applyCamperPhysics();
