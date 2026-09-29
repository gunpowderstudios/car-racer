// version.js is loaded by the small version label script in index.html.
// bootstrap.js owns the runtime feature order and starts main.js explicitly.
import './bootstrap.js';

// Shown small on the menu screen.
// VERSION is edited by hand, every time a change lands - bump it and set NOTE to a short line describing
// what changed, e.g. 'AI cars now line up on the grid'. NOTE isn't shown on screen any more (removed from
// the menu), but keep filling it in anyway: it's a handy one-line changelog to glance back through.
export const VERSION = '16.34';
export const NOTE = 'Multiplayer guests now send an explicit leave message before disconnecting so departed players are removed immediately instead of lingering as static cars';
