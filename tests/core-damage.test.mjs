// The player's car has a weak core under its armour: a used-up zone no longer wrecks it, the core does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Health, SPECS, ARMOUR, ZONES } from '../src/damage.js';

test('the player has a core that is weaker than every outer zone; rivals have none', () => {
  assert.ok(ARMOUR.player.core > 0);
  for (const z of ZONES) assert.ok(ARMOUR.player.core < ARMOUR.player[z], `core weaker than ${z}`);
  assert.equal(ARMOUR.rival.core, undefined);
});

test('a used-up zone does not wreck the player car: you keep driving', () => {
  const h = new Health(SPECS.player.hp);
  h.hit('back', h.max.back);
  assert.equal(h.hp.back, 0);
  assert.equal(h.wrecked, null);
  assert.equal(h.hp.core, h.max.core);
});

test('once a zone is gone, hits on it go straight to the core, and the core wrecks the car', () => {
  const h = new Health(SPECS.player.hp);
  h.hit('back', h.max.back + 10);
  assert.equal(h.hp.core, h.max.core - 10);
  h.hit('back', 30);
  assert.equal(h.hp.core, h.max.core - 40);
  assert.equal(h.wrecked, null);
  h.hit('back', 1000);
  assert.equal(h.hp.core, 0);
  assert.equal(h.wrecked, 'back');
});

test('a standing zone shields the core completely', () => {
  const h = new Health(SPECS.player.hp);
  h.hit('left', h.max.left - 1);
  assert.equal(h.hp.core, h.max.core);
});

test('a dead zone makes the car look badly hurt but not dead', () => {
  const h = new Health(SPECS.player.hp);
  h.hit('back', h.max.back);
  assert.ok(h.worst > 0 && h.worst <= 0.25 + 1e-9);
});

test('rivals are still wrecked as soon as one zone gives out', () => {
  const h = new Health(SPECS.rival.hp);
  h.hit('front', 1e6);
  assert.equal(h.wrecked, 'front');
});

test('the damage panel has a place for the core', () => {
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /id="dz-core"[\s\S]*id="dt-core"/);
});
