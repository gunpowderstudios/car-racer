import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const solo = readFileSync(new URL('../src/soloRacePosition.js', import.meta.url), 'utf8');
const multiplayer = readFileSync(new URL('../src/multiplayerRace.js', import.meta.url), 'utf8');
const celebration = readFileSync(new URL('../src/raceCelebration.js', import.meta.url), 'utf8');
const camper = readFileSync(new URL('../src/campervanVehicle.js', import.meta.url), 'utf8');

test('multiplayer core finish banner uses selected race length without an off-by-one', () => {
  assert.match(main, /const mpRaceLaps = \(\) =>/);
  assert.match(main, /idx >= mpRaceLaps\(\)/);
  assert.match(main, /maxLap: net \? mpRaceLaps\(\) : null/);
  assert.doesNotMatch(main, /MP_RACE_LAPS/);
});

test('solo race field size stays fixed when original rivals wreck', () => {
  assert.match(solo, /total: startingRivalCount \+ 1/);
  assert.match(solo, /const total = field\.total/);
  assert.doesNotMatch(solo, /const total = field\.rivals\.length \+ 1/);
});

test('all local race finishes use the shared large finish overlay', () => {
  assert.match(solo, /carracer-player-finish/);
  assert.match(multiplayer, /carracer-player-finish/);
  assert.match(celebration, /YOU CAME \$\{ordinal\(place\)\}!/);
  assert.match(celebration, /race-finish-active #derby-score/);
  assert.match(celebration, /race-finish-active #dmg-card/);
});

test('campervan rivals get a strong explicit colour tint', () => {
  assert.match(camper, /function tintCampervan/);
  assert.match(camper, /m\.color\.set\(look\.tint\)/);
  assert.match(camper, /this\.vehicleId === ID/);
});
