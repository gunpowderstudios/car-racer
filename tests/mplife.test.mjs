// The multiplayer life cycle: hurt, wrecked (once), wait, come back, protected for a moment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Life, LIFE } from '../src/mplife.js';

test('a fresh life is full health, alive, and not protected', () => {
  const l = new Life();
  assert.equal(l.health, 1); assert.equal(l.dead, false); assert.equal(l.exploded, false);
  assert.equal(l.invulnerable(0), false);
});

test('damage that leaves you standing is "hurt" and lowers health', () => {
  const l = new Life();
  assert.equal(l.damage(0.3, 1), 'hurt');
  assert.ok(Math.abs(l.health - 0.7) < 1e-9);
  assert.equal(l.dead, false);
});

test('the blow that empties the bar is "died" exactly once - no second explosion from later hits', () => {
  const l = new Life();
  assert.equal(l.damage(0.6, 1), 'hurt');
  assert.equal(l.damage(0.6, 2), 'died');
  assert.equal(l.health, 0); assert.equal(l.dead, true); assert.equal(l.exploded, true);
  assert.equal(l.damage(0.6, 2.5), null, 'already wrecked: nothing more happens');
  assert.equal(l.damage(1, 2.6), null);
});

test('a wrecked car stays wrecked until the delay is up, then comes back once with full health', () => {
  const l = new Life();
  l.damage(2, 10);
  assert.equal(l.respawnDue(10 + LIFE.respawnDelay - 0.01), false, 'not yet');
  assert.equal(l.dead, true);
  assert.equal(l.respawnDue(10 + LIFE.respawnDelay), true, 'on time');
  assert.equal(l.health, 1); assert.equal(l.dead, false); assert.equal(l.exploded, false);
  assert.equal(l.respawnDue(10 + LIFE.respawnDelay + 1), false, 'it only comes back once per death');
});

test('an alive car is never "due" a respawn', () => {
  const l = new Life();
  assert.equal(l.respawnDue(0), false);
  assert.equal(l.respawnDue(999), false);
});

test('after coming back you are protected for a moment, then can be hurt again', () => {
  const l = new Life();
  l.damage(2, 0);
  l.respawnDue(LIFE.respawnDelay);
  const back = LIFE.respawnDelay;
  assert.equal(l.invulnerable(back + LIFE.grace - 0.01), true);
  assert.equal(l.damage(1, back + 0.5), null, 'no damage while protected - you cannot be killed again on the spot');
  assert.equal(l.health, 1);
  assert.equal(l.damage(0.25, back + LIFE.grace), 'hurt', 'protection over');
  assert.ok(Math.abs(l.health - 0.75) < 1e-9);
});

test('you can die and come back more than once in a race', () => {
  const l = new Life();
  let t = 0;
  for (let round = 0; round < 3; round++) {
    assert.equal(l.damage(1, t), 'died', `round ${round}`);
    t += LIFE.respawnDelay; assert.equal(l.respawnDue(t), true);
    t += LIFE.grace + 0.1;
  }
});

test('nothing, negative or nonsense damage does nothing', () => {
  const l = new Life();
  for (const bad of [0, -0.5, NaN, undefined, null]) assert.equal(l.damage(bad, 1), null);
  assert.equal(l.health, 1);
});

test('reset puts everything back: health, wreck state, timers', () => {
  const l = new Life();
  l.damage(2, 5); l.respawnDue(5 + LIFE.respawnDelay);
  l.damage(2, 100);
  l.reset();
  assert.equal(l.health, 1); assert.equal(l.dead, false); assert.equal(l.exploded, false);
  assert.equal(l.invulnerable(0), false);
  assert.equal(l.respawnDue(1e9), false);
});
