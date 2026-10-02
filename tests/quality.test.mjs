// Run with:  npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, TIER_NAMES, detectTier, AdaptiveRes } from '../src/quality.js';

test('tiers get cheaper from high to low in every setting that costs frames', () => {
  const { low, medium, high } = TIERS;
  assert.deepEqual([...TIER_NAMES].sort(), ['high', 'low', 'medium']);
  for (const k of ['pixelRatio', 'shadowSize', 'shadowRange', 'aniso', 'mirrorScale', 'physicsHz', 'rivals', 'minScale']) {
    assert.ok(low[k] <= medium[k] && medium[k] <= high[k], `${k} should not rise towards the lower tiers`);
  }
  assert.ok(low.mirrorEvery >= medium.mirrorEvery && medium.mirrorEvery >= high.mirrorEvery);
  assert.ok(low.lodDist > 0 && medium.lodDist > low.lodDist && high.lodDist === 0, 'high keeps full models at every distance');
  assert.equal(high.aa, true); assert.equal(low.aa, false);
});

test('device detection: desktop high, phones medium, old or data-saving phones low, a forced tier wins', () => {
  assert.equal(detectTier({ touch: false, memory: 2, cores: 2 }), 'high');
  assert.equal(detectTier({ touch: true, memory: 8, cores: 8 }), 'medium');
  assert.equal(detectTier({ touch: true }), 'medium');                       // iPhone: no hints at all
  assert.equal(detectTier({ touch: true, memory: 2, cores: 8 }), 'low');
  assert.equal(detectTier({ touch: true, memory: 8, cores: 4 }), 'low');
  assert.equal(detectTier({ touch: true, memory: 8, cores: 8, saveData: true }), 'low');
  assert.equal(detectTier({ touch: true, memory: 8, cores: 8, gpu: 'Adreno (TM) 506' }), 'low');
  assert.equal(detectTier({ touch: true, memory: 8, cores: 8, gpu: 'Mali-T830' }), 'low');
  assert.equal(detectTier({ touch: true, memory: 8, cores: 8, gpu: 'Adreno (TM) 740' }), 'medium');
  assert.equal(detectTier({ touch: true, memory: 8, cores: 8, gpu: 'Apple GPU' }), 'medium');
  assert.equal(detectTier({ forced: 'high', touch: true, memory: 2 }), 'high');
  assert.equal(detectTier({ forced: 'nonsense', touch: false }), 'high');
});

const feedSeconds = (a, seconds, fps) => { let last = null; for (let i = 0; i < Math.round(seconds * fps); i++) { const r = a.feed(1 / fps); if (r) last = r; } return last; };

test('adaptive resolution: two slow seconds step down, one does not', () => {
  const a = new AdaptiveRes({ min: 0.6 });
  assert.equal(feedSeconds(a, 1.1, 30), null);
  assert.equal(a.scale, 1);
  assert.deepEqual(feedSeconds(a, 1, 30), { scale: 0.85 });
  assert.equal(a.scale, 0.85);
});

test('adaptive resolution: a smooth second in between resets the slow count', () => {
  const a = new AdaptiveRes({ min: 0.6 });
  feedSeconds(a, 1.05, 30); feedSeconds(a, 1.05, 60); feedSeconds(a, 1.05, 30);
  assert.equal(a.scale, 1);
});

test('adaptive resolution: never goes below the floor, and says so instead', () => {
  const a = new AdaptiveRes({ min: 0.6 });
  const seen = [];
  for (let i = 0; i < 30; i++) { const r = feedSeconds(a, 1, 25); if (r) seen.push(r); }
  assert.ok(a.scale >= 0.6 - 1e-9 && a.scale <= 0.61);
  assert.ok(seen.includes('floor'));
});

test('adaptive resolution: climbs back up after a long smooth run, and waits longer each time it has dropped', () => {
  const a = new AdaptiveRes({ min: 0.6 });
  feedSeconds(a, 2.2, 30);                      // down once
  assert.equal(a.scale, 0.85);
  assert.equal(a.upNeeded, 10);
  feedSeconds(a, 8, 60);
  assert.equal(a.scale, 0.85, 'still waiting - 10 smooth seconds are needed after a drop');
  feedSeconds(a, 3, 60);
  assert.equal(a.scale, 0.95);
  feedSeconds(a, 30, 60);
  assert.equal(a.scale, 1, 'never above max');
});

test('adaptive resolution: stalls and hidden-tab gaps are ignored', () => {
  const a = new AdaptiveRes({ min: 0.6 });
  for (let i = 0; i < 20; i++) { a.feed(2); a.feed(0.9); }   // tab switches, loading hitches
  assert.equal(a.scale, 1);
  assert.equal(a.feed(NaN), null); assert.equal(a.feed(-1), null);
});
