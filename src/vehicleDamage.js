import { selectedVehicle } from './vehicleChoice.js';
import { SPECS } from './damage.js';

// Vehicle-specific toughness. Crash energy already uses the real vehicle mass in derby.js,
// so the 2800 kg Motor Home naturally hits harder than the 1450 kg Car. Give the player
// Motor Home a tougher shell too: it takes 20% less damage to every body zone.
// The Car keeps the original damage model unchanged.
const vehicle = selectedVehicle();

if (vehicle.id === 'motor-home') {
  const base = SPECS.player.mul || {};
  SPECS.player.mul = {
    front: (base.front ?? 1) * 0.8,
    back: (base.back ?? 1) * 0.8,
    left: (base.left ?? 1) * 0.8,
    right: (base.right ?? 1) * 0.8,
  };
}
