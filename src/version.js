// version.js is loaded by the small version label script in index.html.
// bootstrap.js owns the runtime feature order and starts main.js explicitly.
import './bootstrap.js';

// Shown small on the menu screen.
// VERSION is edited by hand, every time a change lands - bump it and set NOTE to a short line describing
// what changed, e.g. 'AI cars now line up on the grid'. NOTE isn't shown on screen any more (removed from
// the menu), but keep filling it in anyway: it's a handy one-line changelog to glance back through.
export const VERSION = '16.29';
export const NOTE = 'Cleanup phase 6: vehicle toughness now lives in the vehicle profile and enhanced sparks now live in the core particle system, removing two more side-effect patch modules without changing gameplay';
