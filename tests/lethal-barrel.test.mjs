// Black-and-yellow barrels: they go off the instant anything touches them and wreck every car close by.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Track, normalizeProps } from '../src/track.js';
import { Vehicle } from '../src/vehicle.js';
import { makeTemplate } from '../src/templates.js';
import { Props } from '../src/props.js';
import { Derby, DERBY, placeOnRoad } from '../src/derby.js';
import { DAMAGE } from '../src/damage.js';
import { DT, bot } from './harness.mjs';

const drive = (lethal) => {
  const track = new Track(makeTemplate('speedway')), car = new Vehicle();
  const s0 = 100, f = track.frameAt(s0 + 30), props = new Props();
  props.load(track, [{ type: 'barrel', x: f.x, z: f.z, y: f.y, ...(lethal ? { lethal: true } : {}) }], 1, 1, 1);
  placeOnRoad(car, track, s0, 0, 1.5);                                         // a slow roll along the middle of the road: barely 2 m/s, too gentle to set off an ordinary drum
  const blasts = [], steer = bot({ speed: 1.5 });
  for (let i = 0; i < 40 / DT; i++) {
    car.step(DT, { throttle: 0, brake: 0, steer: 0, handbrake: false, ...(steer(i * DT, car, track) || {}) }, track); props.step(DT, car);
    for (const e of props.events) if (e.type === 'blast') blasts.push(e); props.events.length = 0; car.events.length = 0;
  }
  return blasts;
};

test('a lethal barrel goes off at once on a gentle touch, an ordinary one does not', () => {
  const l = drive(true), n = drive(false);
  assert.equal(l.length, 1, 'the lethal barrel exploded'); assert.equal(l[0].lethal, true);
  assert.equal(n.length, 0, 'an ordinary barrel shrugs off a 2 m/s nudge');
});

test('the lethal blast wrecks any car close by and spares the ones far away', () => {
  const track = new Track(makeTemplate('speedway')), car = new Vehicle();
  placeOnRoad(car, track, track.startS(12), 0, 0);
  const derby = new Derby(); derby.enabled = true; derby.start(track, car, 2, 5); derby.time = DERBY.grace + 1;
  const [a, b] = derby.rivals; a.age = b.age = 9;
  const c = a.car.pos;
  derby.blast(c.x + 3, c.y, c.z, DAMAGE.lethal);
  assert.ok(a.wrecked, 'the rival 3 m away was wrecked outright');
  const near = (f) => Math.hypot(f.car.pos.x - (c.x + 3), f.car.pos.y - c.y, f.car.pos.z - c.z) < 6.5;
  assert.equal(b.wrecked, near(b), 'a car is wrecked if it is inside the blast and spared if it is outside');
  assert.ok(!derby.player.wrecked, 'the player, well away, is untouched');
  derby.blast(car.pos.x + 2, car.pos.y, car.pos.z, DAMAGE.lethal);
  assert.ok(derby.player.wrecked, 'and so is the player');
});

test('the flag survives saving and loading, the Barrels track has some, and the game draws them black and yellow', () => {
  assert.deepEqual(normalizeProps([{ type: 'barrel', x: 1, z: 2, y: 0, lethal: true }, { type: 'barrel', x: 3, z: 4 }]).map((p) => !!p.lethal), [true, false]);
  const def = makeTemplate('barrels'), n = def.props.filter((p) => p.lethal).length;
  assert.ok(n >= 3 && n < def.props.length / 2, `some lethal barrels among the red ones (${n} of ${def.props.length})`);
  const v = readFileSync(new URL('../src/propsView.js', import.meta.url), 'utf8');
  assert.match(v, /#f2c200/); assert.match(v, /b\.lethal \? deadly : plain/);
});
