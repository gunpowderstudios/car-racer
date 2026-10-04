import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const solo = readFileSync(new URL('../src/soloRacePosition.js', import.meta.url), 'utf8');
const multiplayer = readFileSync(new URL('../src/multiplayerRace.js', import.meta.url), 'utf8');
const celebration = readFileSync(new URL('../src/raceCelebration.js', import.meta.url), 'utf8');
const camper = readFileSync(new URL('../src/campervanVehicle.js', import.meta.url), 'utf8');
const vehicleChoice = readFileSync(new URL('../src/vehicleChoice.js', import.meta.url), 'utf8');
const vehicleProfiles = readFileSync(new URL('../src/vehiclePhysicsProfiles.js', import.meta.url), 'utf8');
const templates = readFileSync(new URL('../src/templates.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const howMade = readFileSync(new URL('../how-we-made-it.html', import.meta.url), 'utf8');

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

test('campervan rivals recolour only the original red body texture', () => {
  assert.match(camper, /function recolourCamperBodyTexture/);
  assert.match(camper, /dominance = r - Math\.max\(g, b\)/);
  assert.match(camper, /r < g \* 1\.12/);
  assert.match(camper, /m\.map = tex/);
  assert.doesNotMatch(camper, /m\.color\.set\(look\.tint\)/);
});


test('German Beema is available with its own size and handling profile', () => {
  assert.match(vehicleChoice, /id: 'bmw', name: 'German Beema', url: 'cars\/bmw-shrink\.glb'/);
  assert.match(vehicleChoice, /targetLength: 4\.33/);
  assert.match(vehicleChoice, /wheelbase: 2\.57/);
  assert.match(vehicleChoice, /body: \{ width: 1\.65, length: 4\.33/);
  assert.match(vehicleProfiles, /bmw: \{/);
  assert.match(vehicleProfiles, /mass: 1080/);
  assert.match(vehicleProfiles, /peakTorque: 190/);
});


test('random circuits scatter more barrels and chickens', () => {
  assert.match(templates, /scatter\('barrel', 6 \+ Math\.floor\(rnd\(\) \* 7\)\)/);
  assert.match(templates, /scatter\('chicken', 4 \+ Math\.floor\(rnd\(\) \* 6\)\)/);
});


test('German Beema rivals receive a strong colour tint while obvious trim stays neutral', () => {
  assert.match(vehicleChoice, /function tintStrongVehicle/);
  assert.match(vehicleChoice, /view\.vehicleId !== 'motor-home' && view\.vehicleId !== 'bmw'/);
  assert.match(vehicleChoice, /glass\|window\|windscreen/);
  assert.match(vehicleChoice, /m\.color\.set\(look\.tint\)/);
  assert.match(vehicleChoice, /tintStrongVehicle\(this, look\)/);
});


test('main menu links to the development story', () => {
  assert.match(indexHtml, /href="how-we-made-it\.html">How we made this game<\/a>/);
  assert.match(howMade, /How we made Bangers and Smash!/);
  assert.match(howMade, /SHRINK3D/);
  assert.match(howMade, /Happy Camper/);
  assert.match(howMade, /track editor/i);
});


test('development page has an interactive Mr Muscle viewer and visible yellow footer links', () => {
  assert.match(howMade, /id="muscle-car-canvas"/);
  assert.match(howMade, /cars\/car-shrink\.glb/);
  assert.match(howMade, /GLTFLoader/);
  assert.match(howMade, /pointerdown/);
  assert.match(indexHtml, /How we made this game<\/a> &middot;/);
  assert.match(indexHtml, /style="color:#ffb31f">View the source on GitHub/);
});
