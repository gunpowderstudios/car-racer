import './bootstrap.js';

// VERSION is edited by hand, every time a change lands - bump it and set NOTE to a short line describing
// what changed, e.g. 'AI cars now line up on the grid'. NOTE isn't shown on screen any more (removed from
// the menu), but keep filling it in anyway: it's a handy one-line changelog to glance back through.
export const VERSION = '16.66';
export const NOTE = 'Bridge-gap recovery now finds the nearest whole gap span and always respawns at its forward/end edge plus a safety margin, so it cannot choose the near side';
