import './vehicleChoice.js';
import './cameraChoice.js';
import './menuVehicle.js';

// Shown small on the menu screen.
// VERSION is edited by hand, every time a change lands - bump it and set NOTE to a short line describing
// what changed, e.g. 'AI cars now line up on the grid'. NOTE isn't shown on screen any more (removed from
// the menu), but keep filling it in anyway: it's a handy one-line changelog to glance back through.
export const VERSION = '16.6';
export const NOTE = 'Fixed the normal Car model disappearing by measuring its alignment outside the moving world transform before placing it back on the vehicle';
