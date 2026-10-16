// The random track generator: reproducibility, variety, and that every layout is actually clean and drivable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, analyzeTrack } from '../src/track.js';
import { makeTemplate, makeRandomTrack, TEMPLATE_KEYS, TEMPLATE_INFO } from '../src/templates.js';

test('random is a real template: listed, has a description, and makeTemplate finds it', () => {
  assert.ok(TEMPLATE_KEYS.includes('random'));
  assert.ok(TEMPLATE_INFO.random, 'no description for the random track');
  assert.equal(makeTemplate('random').name, 'Random circuit');
});

test('makeTemplate("random") is reproducible - same fixed seed every call', () => {
  assert.deepEqual(makeTemplate('random'), makeTemplate('random'));
});

test('makeRandomTrack(seed) is reproducible, but different seeds give different tracks', () => {
  const a = makeRandomTrack(1), a2 = makeRandomTrack(1);
  assert.deepEqual(a, a2, 'the same seed should produce the same track');
  const b = makeRandomTrack(2);
  assert.notDeepEqual(a, b, 'a different seed should produce a different track');
});

test('a random track always includes both barrels and chickens', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const def = makeRandomTrack(seed);
    const barrels = def.props.filter((p) => p.type === 'barrel').length;
    const chickens = def.props.filter((p) => p.type === 'chicken').length;
    assert.ok(barrels >= 3, `seed ${seed}: only ${barrels} barrels`);
    assert.ok(chickens >= 2, `seed ${seed}: only ${chickens} chickens`);
  }
});

test('random tracks are geometrically clean across many seeds: no tight corners, no self-crossings', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const track = new Track(makeRandomTrack(seed));
    const a = analyzeTrack(track);
    assert.equal(a.tight.length, 0, `seed ${seed} has tight corners`);
    assert.equal(a.crossings.length, 0, `seed ${seed} crosses itself`);
    assert.ok(track.length > 800, `seed ${seed} is too short`);
  }
});

test('a jump on a random track, if there is one, always has a takeoff ramp long enough to be fair', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const def = makeRandomTrack(seed);
    for (const h of def.handles) {
      if (!h.gap) continue;
      assert.ok(h.gap >= 6 && h.gap <= 30, `seed ${seed}: gap length ${h.gap} out of range`);
      assert.ok(h.lip >= 0.3 && h.lip <= 3, `seed ${seed}: lip ${h.lip} out of range`);
    }
  }
});
