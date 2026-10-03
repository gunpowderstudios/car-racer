from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    s = p.read_text()
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"{path}: expected exactly one match for {old!r}, found {n}")
    p.write_text(s.replace(old, new, 1))


replace_once(
    "src/main.js",
    "completed MP_RACE_LAPS laps",
    "completed the selected race distance",
)
replace_once(
    "src/main.js",
    "const MP_RACE_LAPS = 3;     // a multiplayer race is this many laps",
    "const mpRaceLaps = () => Math.max(1, Math.min(3, Math.round(window.__raceLaps?.get?.() || 1)));  // host-selected multiplayer race length",
)
replace_once(
    "src/main.js",
    "if (net && !mpFinished && race.laps >= MP_RACE_LAPS)",
    "if (net && !mpFinished && idx >= mpRaceLaps())",
)
replace_once(
    "src/main.js",
    "maxLap: net ? MP_RACE_LAPS : null",
    "maxLap: net ? mpRaceLaps() : null",
)
replace_once(
    "src/soloRacePosition.js",
    "return { player, rivals };",
    "return { player, rivals, total: startingRivalCount + 1 };",
)
replace_once(
    "src/soloRacePosition.js",
    "if (field && field.rivals.length > 0) {\n    let place = 1;\n    for (const p of field.rivals) if (p > field.player) place++;\n    const total = field.rivals.length + 1;",
    "if (field && field.total > 1) {\n    let place = 1;\n    for (const p of field.rivals) if (p > field.player) place++;\n    const total = field.total;",
)
replace_once(
    "src/bootstrap.js",
    "import './soloRacePosition.js?v=16.77';",
    "import './soloRacePosition.js?v=16.80';",
)
replace_once(
    "src/version.js",
    "export const VERSION = '16.79';\nexport const NOTE = 'Campervan has a lower effective centre of gravity and more roll inertia, making it much less prone to tipping over while keeping its tall van handling character';",
    "export const VERSION = '16.80';\nexport const NOTE = 'Bug audit: solo race field size stays fixed when rivals wreck, and multiplayer finish banners use the selected 1-3 lap target without an off-by-one';",
)

Path("tests/recent-fixes.test.mjs").write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const solo = readFileSync(new URL('../src/soloRacePosition.js', import.meta.url), 'utf8');

test('multiplayer core finish banner uses selected race length without an off-by-one', () => {
  assert.match(main, /const mpRaceLaps = \\(\\) =>/);
  assert.match(main, /idx >= mpRaceLaps\\(\\)/);
  assert.match(main, /maxLap: net \\? mpRaceLaps\\(\\) : null/);
  assert.doesNotMatch(main, /MP_RACE_LAPS/);
});

test('solo race field size stays fixed when original rivals wreck', () => {
  assert.match(solo, /total: startingRivalCount \\+ 1/);
  assert.match(solo, /const total = field\\.total/);
  assert.doesNotMatch(solo, /const total = field\\.rivals\\.length \\+ 1/);
});
""")
