// Runtime bootstrap for Car Racer.
//
// Keep all side-effect feature modules in one explicit order, then start main.js.
// This replaces the old situation where version.js itself was the patch stack and
// game behaviour depended on the relative order of two script tags in index.html.
//
// During the cleanup we are deliberately preserving the proven v16.23 feature
// order and behaviour. Later passes can fold stable patches back into their core
// modules one at a time without changing the bootstrap contract.
import './vehicleChoice.js';
import './vehicleDamage.js';
import './cameraChoice.js';
import './menuVehicle.js';
import './sparkEffects.js';
import './offTrackRespawn.js';
import './playerOffTrackRespawn.js?v=16.20';
import './multiplayerOffTrackRespawn.js?v=16.22';
import './multiplayerTrackLock.js?v=16.23';
import './gapEndCollision.js';

// Start the game only after every runtime extension above has been installed.
import './main.js';
