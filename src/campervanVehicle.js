// VW T2-style campervan vehicle extension.
// Adds the model to the shared vehicle catalogue and applies a real-world-inspired
// physics setup before main.js creates the player's Vehicle.
import { VEHICLES } from './vehicleChoice.js';
import { CarVisual } from './carVisual.js';
import { CAR } from './vehicle.js';
import { V3 } from './math.js';

const ID = 'campervan';
const KEY = 'cr.vehicle';

const camper = {
  id: ID,
  name: 'Campervan',
  url: 'cars/campervan.glb',
  fit: 'auto',
  // Slightly game-scaled so the tall T2 body does not look oversized beside the Charger.
  targetLength: 4.05,
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
      idle: 850,
      // The core automatic gearbox shifts around 6300 rpm at full throttle. A 5200 rpm
      // limiter meant the Campervan hit the limiter before it could upshift, leaving it
      // effectively stuck in a low gear. The higher game limiter lets the box shift while
      // the torque curve still falls away like an old VW engine.
      limiter: 6900, stall: 1800,
      peakTorque: 175, efficiency: 0.88,
      curve: [[850, 0.64], [1600, 0.86], [2600, 1.0], [3400, 0.98], [4300, 0.88], [5200, 0.72], [6200, 0.52], [6900, 0.34]],
      gears: [3.8, 2.2, 1.4, 0.93], reverse: 3.8, finalDrive: 4.13,
      engineBrake: 20,
    },
    brakeBias: 0.58,
    wallBounce: 0.24,
    aero: { drag: 0.62, down: 0.16 },
    steer: { max: 0.55, rate: 4.0, returnRate: 6.0 },
    boost: { accel: 3.9, airShare: 0.32, burn: 3.2, refill: 9, restart: 0.2 },
    body: {
      width: 1.68, length: 4.05,
      bottom: -0.46, shoulder: 0.34,
      roof: 1.18, roofWidth: 1.56, roofLength: 3.25,
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

// In solo, rivals clone the player's loaded visual. Force the source and requested look to the
// Campervan whenever Campervan is selected, rather than relying on a timing-sensitive vehicleId tag.
// That guarantees a Campervan player gets a full grid of Campervan AI rivals.
const previousAdopt = CarVisual.prototype.adopt;
CarVisual.prototype.adopt = function campervanAdopt(src, look) {
  if (selectedId() === ID) {
    if (src) src.vehicleId = ID;
    const camperLook = look ? { ...look, vehicleId: ID } : { vehicleId: ID };
    return previousAdopt.call(this, src, camperLook);
  }
  return previousAdopt.call(this, src, look);
};
