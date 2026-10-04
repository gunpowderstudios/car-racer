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
const editor = readFileSync(new URL('../src/editor.js', import.meta.url), 'utf8');
const editorPreview = readFileSync(new URL('../src/editorPreview.js', import.meta.url), 'utf8');
const cameraOrbit = readFileSync(new URL('../src/cameraOrbit.js', import.meta.url), 'utf8');
const assetVersion = readFileSync(new URL('../src/assetVersion.js', import.meta.url), 'utf8');
const versionFile = readFileSync(new URL('../src/version.js', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

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


test('German Beema keeps local paint and recolours only adopted AI or remote views', () => {
  assert.match(vehicleChoice, /function recolourBmwPaintTexture/);
  assert.match(vehicleChoice, /const colourVariant = view\._bmwColourVariant === true/);
  assert.match(vehicleChoice, /colourVariant && look && !isBmwDetailMaterial/);
  assert.match(vehicleChoice, /this\._bmwColourVariant = this\.vehicleId === 'bmw'/);
  assert.match(vehicleChoice, /this\._bmwColourVariant = wanted\.id === 'bmw'/);
  assert.match(vehicleChoice, /if \(config\.id === 'bmw'\) this\._bmwColourVariant = false/);
  assert.doesNotMatch(vehicleChoice, /view\.setPaint\?\.\(look\.tint\)/);
});


test('main menu links to the development story', () => {
  assert.match(indexHtml, /href="how-we-made-it\.html"[^>]*>How we made this game<\/a>/);
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


test('zero key resets the track editor 3D view', () => {
  assert.match(editorPreview, /resetView\(\) \{/);
  assert.match(editorPreview, /this\.yaw = 0;/);
  assert.match(editorPreview, /this\.pitch = 0\.5/);
  assert.match(editorPreview, /this\.zoom = 1/);
  assert.match(editorPreview, /dblclick'.*resetView/s);
  assert.match(editor, /e\.key === '0'.*resetView/);
  assert.match(indexHtml, /<b>0<\/b> resets the 3D view/);
});


test('development page loads compressed GLB with Meshopt', () => {
  assert.match(howMade, /MeshoptDecoder/);
  assert.match(howMade, /setMeshoptDecoder\(MeshoptDecoder\)/);
  assert.match(howMade, /cars\/car-shrink\.glb/);
});


test('3D reset pauses auto-rotation so the straight view is visible', () => {
  assert.match(editorPreview, /this\.yaw = 0;/);
  assert.match(editorPreview, /this\.spin = false;\s+\/\/ hold the reset view briefly/);
  assert.match(editorPreview, /e\.preventDefault\(\)/);
  assert.match(editorPreview, /e\.stopPropagation\(\)/);
});


test('gameplay camera resets with double-click or zero', () => {
  assert.match(cameraOrbit, /addEventListener\('dblclick'/);
  assert.match(cameraOrbit, /e\.key !== '0'/);
  assert.match(cameraOrbit, /cam\.snap\(\)/);
  assert.match(indexHtml, /<kbd>0<\/kbd> Reset view/);
  assert.match(indexHtml, /double-click the game view to centre the camera/);
});


test('development page car viewer is a five-car swipe carousel', () => {
  assert.match(howMade, /Mr Muscle.*car-shrink\.glb/s);
  assert.match(howMade, /70s Saloon.*escort-shrink\.glb/s);
  assert.match(howMade, /German Beema.*bmw-shrink\.glb/s);
  assert.match(howMade, /Motorhome.*motor-home-shrink\.glb/s);
  assert.match(howMade, /Happy Camper.*campervan-shrink\.glb/s);
  assert.match(howMade, /id="car-prev"/);
  assert.match(howMade, /id="car-next"/);
  assert.match(howMade, /swipeArea\.addEventListener\('pointerup'/);
  assert.match(howMade, /className = 'car-dot'/);
});


test('Happy Camper carousel uses the shrunk model', () => {
  assert.match(howMade, /Happy Camper.*campervan-shrink\.glb/s);
  assert.doesNotMatch(howMade, /cars\/campervan\.glb/);
});


test('vehicle model cache busting follows the game version', () => {
  const gameVersion = versionFile.match(/VERSION = '([^']+)'/)?.[1];
  const modelVersion = assetVersion.match(/ASSET_VERSION = '([^']+)'/)?.[1];
  assert.equal(modelVersion, gameVersion);
  assert.match(vehicleChoice, /assetUrl\(url \|\| config\.url\)/);
  assert.match(vehicleChoice, /fetch\(assetUrl\(selectedVehicle\(\)\.url\)/);
  assert.match(howMade, /loader\.loadAsync\(assetUrl\(car\.url\)\)/);
  assert.match(serviceWorker, /const MODEL = \/\\\.glb\$\/i/);
  assert.match(serviceWorker, /MODEL\.test\(url\.pathname\)/);
});


test('development story recommends a structured changelog for AI-assisted development', () => {
  assert.match(howMade, /CHANGELOG\.md/);
  assert.match(howMade, /v2\.25, v2\.24, v2\.23/);
  assert.match(howMade, /core engine version/i);
  assert.match(howMade, /should <em>not<\/em> be overwritten/);
  assert.match(howMade, /version-bump rule/);
  assert.match(howMade, /known issues/i);
  assert.match(howMade, /Claude, ChatGPT/);
});


test('auto-fitted vehicles ground their visible model at suspension rest height', () => {
  assert.match(vehicleChoice, /const restHeight = restHeightForVehicle\(config\);/);
  assert.match(vehicleChoice, /model\.position\.y \+= -restHeight - box\.min\.y/);
  assert.doesNotMatch(vehicleChoice, /Number\.isFinite\(bodyBottom\) \? bodyBottom/);
});


test('grass plane stays below low road sections to avoid z-fighting', () => {
  const stage = readFileSync(new URL('../src/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /this\.groundLevel = -0\.35/);
  assert.match(stage, /this\.ground\.position\.set\(camPos\.x, this\.groundLevel, camPos\.z\)/);
  assert.doesNotMatch(stage, /this\.ground\.position\.set\(camPos\.x, 0, camPos\.z\)/);
});
