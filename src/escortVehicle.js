// Escort vehicle catalogue entry and body dimensions.
// Imported immediately after vehicleChoice.js so its shared VEHICLES array is extended
// before the menu, player visual and multiplayer vehicle lookups are created.
import { VEHICLES } from './vehicleChoice.js';
import { CAR } from './vehicle.js';
import { V3 } from './math.js';

const ESCORT_BODY = {
  width: 1.57,
  length: 4.04,
  bottom: -0.34,
  shoulder: 0.24,
  roof: 0.72,
  roofWidth: 1.36,
  roofLength: 2.10,
};

const ESCORT = {
  id: 'escort',
  name: 'Escort',
  url: 'cars/escort-shrink.glb',
  fit: 'auto',
  targetLength: ESCORT_BODY.length,
  physics: {
    mass: 920,
    frontWeight: 0.53,
    wheelbase: 2.40,
    track: 1.32,
    wheelRadius: 0.29,
    mountY: 0.08,
    susp: {
      free: 0.44,
      travel: 0.24,
      kFront: 30000,
      kRear: 27500,
    },
    body: ESCORT_BODY,
  },
};

if (!VEHICLES.some((v) => v.id === ESCORT.id)) VEHICLES.push(ESCORT);

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

// vehicleChoice.js applies its selected dimensions before this module exists. If the
// Escort is the saved choice, apply its footprint here; vehiclePhysicsProfiles.js runs
// next and supplies the Escort-specific mass, grip, torque and handling tune.
let selected = 'car';
try { selected = localStorage.getItem('cr.vehicle') || selected; } catch { /* storage unavailable */ }
if (selected === 'escort') {
  CAR.wheelbase = ESCORT.physics.wheelbase;
  CAR.frontWeight = ESCORT.physics.frontWeight;
  CAR.track = ESCORT.physics.track;
  CAR.wheelRadius = ESCORT.physics.wheelRadius;
  CAR.mountY = ESCORT.physics.mountY;
  CAR.susp = { ...CAR.susp, ...ESCORT.physics.susp };
  CAR.hull = makeHull(ESCORT_BODY);
}
