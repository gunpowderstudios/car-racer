// Central handling profiles for every playable vehicle.
//
// Keep game physics here rather than beside the visual/model catalogue. This gives desktop,
// mobile, solo and multiplayer one source of truth. New vehicles should get a profile here and
// reference it with `physicsProfile` in vehicleChoice.js.
//
// Values are game-tuned rather than engineering simulations. Existing values were moved here
// unchanged so introducing the profile system does not silently retune the cars.
export const VEHICLE_PHYSICS_PROFILES = {
  car: {
    reference: '1969 Charger-style RWD muscle car',
    mass: 1450,
    frontWeight: 0.52,
    wheelbase: 2.77,
    track: 1.52,
    wheelRadius: 0.30,
    mountY: 0.08,
    inertia: { x: 3000, y: 3200, z: 850 },
    susp: {
      free: 0.44, travel: 0.24,
      kFront: 33500, kRear: 30900,
      cCompFront: 2400, cCompRear: 2250, cRebFront: 3400, cRebRear: 3200,
      arbFront: 18000, arbRear: 12000, bump: 200000, bumpDamp: 9000,
    },
    tyre: {
      muFront: 1.15, muRear: 1.20, B: 11, C: 1.25, E: 0,
      loadSens: 0.07, nominalLoad: 3700, maxTyreLoad: 8500, slideMu: 0.8, rolling: 0.014,
    },
    engine: { peakTorque: 430 },
    brakeG: 1.40,
    brakeBias: 0.62,
    wallBounce: 0.30,
    aero: { drag: 0.55, down: 0.33 },
    steer: { max: 0.55, rate: 4.2, returnRate: 6.5 },
    boost: { accel: 4.8 },
  },

  escort: {
    reference: '1970s Ford Escort-style lightweight RWD saloon',
    mass: 920,
    frontWeight: 0.53,
    wheelbase: 2.40,
    track: 1.32,
    wheelRadius: 0.29,
    mountY: 0.12,
    inertia: { x: 1800, y: 1750, z: 820 },
    susp: {
      free: 0.42, travel: 0.22,
      kFront: 26000, kRear: 24000,
      cCompFront: 2000, cCompRear: 1850, cRebFront: 2900, cRebRear: 2700,
      arbFront: 14500, arbRear: 10000, bump: 180000, bumpDamp: 8000,
    },
    engine: { peakTorque: 170 },
    brakeG: 1.35,
    brakeBias: 0.60,
    wallBounce: 0.28,
    aero: { drag: 0.42, down: 0.28 },
    steer: { max: 0.57, rate: 4.8, returnRate: 7.0 },
    body: { width: 1.57, length: 4.05, bottom: -0.40, shoulder: 0.32, roof: 0.96, roofWidth: 1.38, roofLength: 2.40 },
  },

  bmw: {
    reference: 'late-1980s German compact RWD saloon',
    mass: 1080,
    frontWeight: 0.52,
    wheelbase: 2.57,
    track: 1.41,
    wheelRadius: 0.30,
    mountY: 0.13,
    inertia: { x: 2050, y: 2100, z: 760 },
    susp: {
      free: 0.43, travel: 0.23,
      kFront: 30000, kRear: 28000,
      cCompFront: 2150, cCompRear: 2050, cRebFront: 3050, cRebRear: 2900,
      arbFront: 15500, arbRear: 11500, bump: 195000, bumpDamp: 8500,
    },
    engine: { peakTorque: 190 },
    brakeG: 1.35,
    brakeBias: 0.59,
    wallBounce: 0.27,
    aero: { drag: 0.43, down: 0.27 },
    steer: { max: 0.55, rate: 4.7, returnRate: 6.9 },
    body: { width: 1.65, length: 4.33, bottom: -0.40, shoulder: 0.30, roof: 0.92, roofWidth: 1.40, roofLength: 2.32 },
  },

  'v8-pilot': {
    reference: 'late-1940s Ford V8 Pilot-style RWD saloon',
    mass: 1510,
    frontWeight: 0.54,
    wheelbase: 2.77,
    track: 1.48,
    wheelRadius: 0.34,
    mountY: 0.10,
    inertia: { x: 3400, y: 3700, z: 1050 },
    susp: {
      free: 0.48, travel: 0.27,
      kFront: 32000, kRear: 28500,
      cCompFront: 2350, cCompRear: 2150, cRebFront: 3350, cRebRear: 3100,
      arbFront: 12000, arbRear: 7500, bump: 190000, bumpDamp: 8500,
    },
    tyre: {
      muFront: 1.02, muRear: 1.06, B: 9.8, C: 1.18, E: 0,
      loadSens: 0.07, nominalLoad: 3900, maxTyreLoad: 9000, slideMu: 0.78, rolling: 0.016,
    },
    engine: { peakTorque: 285 },
    brakeG: 1.18,
    brakeBias: 0.61,
    wallBounce: 0.25,
    aero: { drag: 0.72, down: 0.18 },
    steer: { max: 0.52, rate: 3.8, returnRate: 5.8 },
    boost: { accel: 4.0 },
    body: { width: 1.75, length: 4.44, bottom: -0.46, shoulder: 0.38, roof: 1.12, roofWidth: 1.48, roofLength: 2.62 },
  },

  'motor-home': {
    reference: '1970s V8 motor home',
    mass: 2800,
    frontWeight: 0.52,
    wheelbase: 3.15,
    track: 1.78,
    wheelRadius: 0.36,
    mountY: 0.04,
    inertia: { x: 6500, y: 7600, z: 3600 },
    susp: {
      free: 0.56, travel: 0.30,
      kFront: 61000, kRear: 57000,
      cCompFront: 3900, cCompRear: 3700, cRebFront: 5100, cRebRear: 4800,
      arbFront: 22000, arbRear: 15000, bump: 250000, bumpDamp: 11000,
    },
    engine: { peakTorque: 360 },
    brakeG: 1.35,
    brakeBias: 0.64,
    wallBounce: 0.22,
    aero: { drag: 0.88, down: 0.20 },
    steer: { max: 0.48, rate: 3.6, returnRate: 5.4 },
    body: { width: 2.08, length: 4.85, bottom: -0.72, shoulder: 0.38, roof: 1.82, roofWidth: 1.92, roofLength: 3.95 },
  },

  // Template/default for the next three-wheeler. It is harmless until a vehicle points at it.
  'tuk-tuk': {
    reference: 'Bajaj/Piaggio-style three-wheeler',
    mass: 520,
    frontWeight: 0.38,
    wheelbase: 2.05,
    track: 1.28,
    wheelRadius: 0.27,
    mountY: 0.10,
    inertia: { x: 900, y: 760, z: 520 },
    susp: {
      free: 0.38, travel: 0.20,
      kFront: 15000, kRear: 18000,
      cCompFront: 1500, cCompRear: 1650, cRebFront: 2200, cRebRear: 2350,
      arbFront: 8000, arbRear: 6500, bump: 140000, bumpDamp: 6500,
    },
    tyre: { muFront: 1.10, muRear: 1.16, B: 10.5, C: 1.23, slideMu: 0.86, loadSens: 0.05, rolling: 0.016 },
    engine: { peakTorque: 62 },
    brakeG: 1.20,
    brakeBias: 0.58,
    wallBounce: 0.24,
    aero: { drag: 0.50, down: 0.12 },
    steer: { max: 0.62, rate: 5.0, returnRate: 7.2 },
    boost: { accel: 3.2 },
  },
};

export function vehiclePhysicsProfile(id) {
  return VEHICLE_PHYSICS_PROFILES[id] || VEHICLE_PHYSICS_PROFILES.car;
}
