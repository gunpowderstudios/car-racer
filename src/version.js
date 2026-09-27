import { installProceduralMotorhome } from './proceduralMotorhome.js';

// Shown small on the menu screen.
// VERSION is edited by hand, every time a change lands - bump it and set NOTE to a short line describing
// what changed, e.g. 'AI cars now line up on the grid'. NOTE isn't shown on screen any more (removed from
// the menu), but keep filling it in anyway: it's a handy one-line changelog to glance back through.
export const VERSION = '14.4';
export const NOTE = 'First procedural motorhome test - lightweight Three.js geometry instead of the GLB car';

// Temporary visual test: main.js still loads the old car, then this swaps in the procedural motorhome
// once the game and original visual are ready. That keeps all existing physics/gameplay untouched while
// we judge the look. If we keep it, this can move directly into CarVisual and skip loading the GLB at all.
let tries = 0;
const motorhomeTest = setInterval(() => {
  tries++;
  const visual = window.__game?.visual;
  if (visual?.loaded) {
    clearInterval(motorhomeTest);
    installProceduralMotorhome(visual);
  } else if (tries > 300) {
    clearInterval(motorhomeTest);
  }
}, 50);
