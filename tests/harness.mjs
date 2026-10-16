// Headless simulation helpers shared by the tests (and handy for tuning).
import { Track } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { V3 } from '../src/math.js';
import { makeTemplate } from '../src/templates.js';

export const DT = 1 / 120;

export function placeOnTrack(car, track, s, offset = 0, speed = 0) {
  const f = track.frameAt(s);
  const up = new V3(f.nx, f.ny, f.nz);
  const p = new V3(
    f.x + f.lx * offset + f.nx * (car.restHeight + 0.05),
    f.y + f.ly * offset + f.ny * (car.restHeight + 0.05),
    f.z + f.lz * offset + f.nz * (car.restHeight + 0.05));
  car.reset(p, new V3(f.fx, f.fy, f.fz), up, speed);
  return f;
}

export function makeSim(templateOrDef = 'speedway', startS = 0, speed = 0) {
  const def = typeof templateOrDef === 'string' ? makeTemplate(templateOrDef) : templateOrDef;
  const track = new Track(def);
  const car = new Vehicle();
  placeOnTrack(car, track, startS, 0, speed);
  return { track, car };
}

export function run(car, track, seconds, inputFn) {
  const steps = Math.round(seconds / DT);
  const log = [];
  for (let i = 0; i < steps; i++) {
    const t = i * DT;
    const input = inputFn(t, car, track) || {};
    car.step(DT, { throttle: 0, brake: 0, steer: 0, handbrake: false, ...input }, track);
    if (i % 12 === 0) log.push({ t, x: car.pos.x, y: car.pos.y, z: car.pos.z, speed: car.speed, fwd: car.fwdSpeed, gear: car.gear, rpm: car.rpm, up: car.ay.y, slip: car.sideSlip });
  }
  return log;
}

/** Steers along the centreline with look-ahead and holds a target speed. */
export function bot({ speed = 35, aLat = 8, look = 0.6 } = {}) {
  const q = Track.newQuery();
  return (t, car, track) => {
    const s = track.progressAt(car.pos.x, car.pos.y, car.pos.z);
    const la = Math.max(12, car.speed * look);
    const f = track.frameAt(s + la);
    const dx = f.x - car.pos.x, dz = f.z - car.pos.z;
    const fx = car.az.x, fz = car.az.z;
    const cross = fz * dx - fx * dz;               // + when target is to the left? (left = +x when facing +z)
    const ang = Math.atan2(-(fx * dz - fz * dx), fx * dx + fz * dz);
    const steer = Math.max(-1, Math.min(1, ang * 2.2));
    // speed target from upcoming curvature
    let maxK = 0;
    for (let o = 0; o < 60; o += 6) {
      const i = Math.floor(((s + o * 2) % track.length) / track.ds) % track.n;
      maxK = Math.max(maxK, Math.abs(track.curv[i]));
    }
    const vT = Math.min(speed, Math.sqrt(aLat / Math.max(maxK, 1e-4)));
    const err = vT - car.speed;
    void cross; void q;
    return { steer, throttle: err > 0 ? Math.min(1, err / 4) : 0, brake: err < -2 && car.fwdSpeed > 3 ? Math.min(1, -err / 6) : 0 };
  };
}

/** A dead-straight 2.2 km strip (x = 0, z from -1100 to 1100) joined by wide loops. */
export const DRAG_DEF = {
  name: 'Drag strip', width: 26,
  handles: [
    { x: 0, y: .65, z: -1100 }, { x: 0, y: .65, z: -550 }, { x: 0, y: .65, z: 0 }, { x: 0, y: .65, z: 550 }, { x: 0, y: .65, z: 1100 },
    { x: 180, y: .65, z: 1350 }, { x: 450, y: .65, z: 1350 }, { x: 650, y: .65, z: 1100 },
    { x: 650, y: .65, z: -1100 }, { x: 450, y: .65, z: -1350 }, { x: 180, y: .65, z: -1350 },
  ],
};
