// Runtime bootstrap for Car Racer.
//
// Keep runtime extensions in one explicit order, then start main.js. Stable feature
// patches can be folded back into core modules here without making script-tag order
// part of the game's behaviour.
import './vehicleChoice.js';
import './vehicleDamage.js';
import './cameraChoice.js';
import './menuVehicle.js';
import './sparkEffects.js';
import './derbyOffTrackRecovery.js?v=16.25';
import './multiplayerOffTrackRespawn.js?v=16.22';
import './multiplayerTrackLock.js?v=16.23';
import './gapEndCollision.js';

// Start the game only after every runtime extension above has been installed.
import './main.js';
