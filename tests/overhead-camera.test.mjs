// The Overhead camera only exists in the open arenas, and C steps through it after the Helicopter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');

test('the Overhead camera (mode 5) needs an arena, and C only steps to it there', () => {
  assert.match(src('cameraChoice.js'), /\(m === 5 && !this\.arena\)/);
  assert.match(src('carVisual.js'), /this\.mode === 5 && !this\.arena\) \{ this\.mode = 0/);
});

test('main sets the arena on the camera for the last-one-standing tracks, and puts the camera right way up outside the game', () => {
  const m = src('main.js');
  assert.match(m, /chase\.arena = def\.mode === 'lastStanding' \? arenaInfo\(track\) : null/);
  assert.match(m, /chase\.arena = track\.def\.mode === 'lastStanding'/);
  assert.match(m, /if \(m !== 'drive'\) camera\.up\.set\(0, 1, 0\)/);
});

test('the Overhead view looks straight down, with a fixed north, and is kept inside the wall', () => {
  const v = src('carVisual.js');
  assert.match(v, /this\.cam\.up\.set\(0, 0, -1\)/);
  assert.match(v, /const lim = Math\.max\(0, R - 30\)/);
});
