// A tougher field: rivals corner harder, carry more speed, use their nitro on straights and get a stronger but still physics-based catch-up.
// Stage 4: Hard should now make a clean player work for the win, while Expert remains the full challenge.
// The extra pace is still only a target for the normal Vehicle physics: no teleporting, hidden grip or fake position changes.
import { AI } from './ai.js';

AI.cruiseMin = 40;      // ~89 mph
AI.cruiseMax = 53;      // ~119 mph
AI.huntMax = 60;        // ~134 mph
AI.aLatCruise = 11.25;
AI.aLatHunt = 13.4;
AI.catchupStart = 20;
AI.catchupFull = 165;
AI.catchupSpeed = 0.36; // stronger only while genuinely behind; still driven through normal car physics
AI.raceMax = 74;          // allow a fast player to pull the field up to arcade-racing speeds
