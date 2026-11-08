import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cv = fs.readFileSync(new URL('../src/carVisual.js', import.meta.url), 'utf8');

test('wheels drop small loose body pieces that stick out past the tyre', () => {
  assert.match(cv, /export function trimWheelPieces\(geo, ax\)/);
  assert.match(cv, /e\.n < nT \* 0\.05 && e\.reach > ax\.r \* 0\.97/, 'only small pieces reaching past the tyre go');
  const call = cv.indexOf('trimWheelPieces(m.geometry, ax);');
  const exact = cv.indexOf('if (!exact) trimWheel(m.geometry, ax);');
  assert.ok(call > 0 && call < exact, 'runs for every wheel, Shrink-exported ones included');
});
