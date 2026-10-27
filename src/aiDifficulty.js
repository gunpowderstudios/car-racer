// A tougher field: rivals corner harder, carry more speed, use their nitro on straights and get a stronger but still physics-based catch-up.
// Stage 4: Hard should now make a clean player work for the win, while Expert remains the full challenge.
// The extra pace is still only a target for the normal Vehicle physics: no teleporting, hidden grip or fake position changes.
import { AI } from './ai.js';

AI.cruiseMin = 43;      // ~96 mph
AI.cruiseMax = 57;      // ~128 mph
AI.huntMax = 64;        // ~143 mph
AI.aLatCruise = 10.9;   // slightly less lateral demand: faster overall without tipping as often
AI.aLatHunt = 12.9;
AI.catchupStart = 8;
AI.catchupFull = 125;
AI.catchupSpeed = 0.44; // harder default catch-up, still entirely through normal vehicle physics
AI.raceMax = 80;          // let a fast player pull the field up to serious arcade-racing speeds
