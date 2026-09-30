// Real-world-inspired handling profiles for player vehicles.
// These are intentionally game-tuned rather than engineering simulations: the real vehicle's
// weight, drivetrain character, wheelbase/power class and stability inform the feel, while the
// final numbers are adjusted so each vehicle remains enjoyable on the game's tracks.
import { CAR } from './vehicle.js';

const G = 9.81;
const KEY = 'cr.vehicle';

export const VEHICLE_PHYSICS_PROFILES = {
  // Loosely based on a late-1960s Dodge Charger R/T 440: heavy RWD muscle car,
  // strong low/mid-range torque, stable enough to race but still able to power-oversteer.
  car: {
    reference: '1969 Charger-style RWD muscle car',
    mass: 1650,
    frontWeight: 0.54,
    wheelbase: 2.97,
    track: 1.52,
    wheelRadius: 0.33,
    inertia: { x: 3500, y: 3800, z: 980 },
    susp: {
      kFront: 40000, kRear: 36000,
      cCompFront: 2700, cCompRear: 2500,
      cRebFront: 3800, cRebRear: 3550,
      arbFront: 20500, arbRear: 14500,
    },
    tyre: {
      muFront: 1.30, muRear: 1.36,
      B: 11.5, C: 1.28, slideMu: 0.92,
      loadSens: 0.065, rolling: 0.014,
    },
    engine: {
      peakTorque: 540,
      efficiency: 0.90,
      curve: [[900, 0.62], [1800, 0.84], [2800, 0.96], [3800, 1.0], [5000, 0.94], [6100, 0.82], [6900, 0.62]],
      finalDrive: 3.55,
    },
    brakeG: 1.48,
    brakeBias: 0.61,
    aero: { drag: 0.58, down: 0.36 },
    steer: { max: 0.54, rate: 4.4, returnRate: 6.8 },
    boost: { accel: 5.1 },
  },

  // Large 1970s-style American motor home: heavy, torquey, soft and high-sided.
  // It gets enough low-speed shove to be fun, but noticeably less cornering grip and slower response.
  'motor-home': {
    reference: '1970s V8 motor home',
    mass: 2800,
    frontWeight: 0.56,
    wheelbase: 3.15,
    track: 1.78,
    wheelRadius: 0.36,
    inertia: { x: 6800, y: 7900, z: 3900 },
    susp: {
      kFront: 61000, kRear: 57000,
      cCompFront: 3900, cCompRear: 3700,
      cRebFront: 5100, cRebRear: 4800,
      arbFront: 21000, arbRear: 14000,
    },
    tyre: {
      muFront: 1.08, muRear: 1.14,
      B: 10.2, C: 1.22, slideMu: 0.84,
      loadSens: 0.08, rolling: 0.018,
    },
    engine: {
      peakTorque: 430,
      efficiency: 0.86,
      curve: [[900, 0.72], [1600, 0.90], [2400, 1.0], [3400, 0.94], [4400, 0.80], [5600, 0.60], [6500, 0.42]],
      finalDrive: 4.10,
    },
    brakeG: 1.28,
    brakeBias: 0.64,
    aero: { drag: 0.90, down: 0.20 },
    steer: { max: 0.47, rate: 3.5, returnRate: 5.2 },
    boost: { accel: 3.6 },
  },

  // Ready for the three-wheeler model when it is added to VEHICLES.
  'tuk-tuk': {
    reference: 'Bajaj/Piaggio-style three-wheeler',
    mass: 520,
    frontWeight: 0.38,
    wheelbase: 2.05,
    track: 1.28,
    wheelRadius: 0.27,
    inertia: { x: 900, y: 760, z: 520 },
    tyre: { muFront: 1.10, muRear: 1.16, B: 10.5, C: 1.23, slideMu: 0.86, loadSens: 0.05, rolling: 0.016 },
    engine: { peakTorque: 62, efficiency: 0.86, finalDrive: 4.9 },
    brakeG: 1.20,
    steer: { max: 0.62, rate: 5.0, returnRate: 7.2 },
    boost: { accel: 3.2 },
  },

  // Ready for Paul's Escort once its model is wired into the vehicle selector.
  escort: {
    reference: '1970s Ford Escort-style lightweight RWD saloon',
    mass: 920,
    frontWeight: 0.53,
    wheelbase: 2.40,
    track: 1.32,
    wheelRadius: 0.29,
    inertia: { x: 1800, y: 1750, z: 560 },
    tyre: { muFront: 1.24, muRear: 1.29, B: 11.3, C: 1.27, slideMu: 0.90, loadSens: 0.055, rolling: 0.013 },
    engine: { peakTorque: 170, efficiency: 0.89, finalDrive: 3.90 },
    brakeG: 1.38,
    steer: { max: 0.57, rate: 4.8, returnRate: 7.0 },
    boost: { accel: 4.7 },
  },
};

function selectedId() {
  try { return localStorage.getItem(KEY) || 'car'; } catch { return 'car'; }
}

function patch(dst, src) {
  if (!src) return dst;
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) dst[k] = { ...(dst[k] || {}), ...v };
    else dst[k] = v;
  }
  return dst;
}

export function applyVehiclePhysicsProfile(id = selectedId()) {
  const p = VEHICLE_PHYSICS_PROFILES[id] || VEHICLE_PHYSICS_PROFILES.car;

  // vehicleChoice.js remains the authority for wheelbase, track, wheel radius and body/hull dimensions,
  // because those values must stay aligned with the visible GLB. This layer changes driving dynamics only.
  if (Number.isFinite(p.mass)) CAR.mass = p.mass;
  if (Number.isFinite(p.frontWeight)) CAR.frontWeight = p.frontWeight;
  patch(CAR, { inertia: p.inertia, susp: p.susp, tyre: p.tyre, engine: p.engine, aero: p.aero, steer: p.steer, boost: p.boost });
  if (Number.isFinite(p.brakeG)) CAR.brakeTotal = p.brakeG * CAR.mass * G;
  if (Number.isFinite(p.brakeBias)) CAR.brakeBias = p.brakeBias;

  CAR.profileName = p.reference;
  return p;
}

applyVehiclePhysicsProfile();
