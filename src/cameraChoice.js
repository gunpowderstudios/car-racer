import { ChaseCamera } from './carVisual.js';

// The C key/button rotates through Chase -> High -> Bumper -> Bonnet -> Helicopter -> Chase. The bonnet view needs a vehicle with a bonnet
// (see bonnetCam.js): a bus, motorhome or campervan skips it.
ChaseCamera.prototype.cycle = function cycleCameras() {
  let m = this.mode;
  do { m = (m + 1) % 5; } while (m === 3 && !this.bonnet);
  this.mode = m;
  this.ready = false;
  return ['Chase', 'High', 'Bumper', 'Bonnet', 'Helicopter'][this.mode];
};
