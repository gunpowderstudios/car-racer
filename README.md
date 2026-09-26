# Car Racer

A 3D racing game with heavy, slidey 70s muscle-car handling (think the original *Driver*), a destruction derby
against rival cars, and a track editor built into the same page. No build step: open it through any static web server.

```
npm start            # then open http://localhost:8080
npm test             # physics, track, barrel and derby tests (Node 20+, no dependencies)
```

Try `?track=hills` (or `speedway`, `kidney`, `technical`, `overpass`, `random`) to jump straight in, and `&edit=1`
to open the editor. `random` builds a fresh circuit every time - hills, jumps, banks, barrels and chickens.

## Controls

| | |
|---|---|
| W / S or Up / Down | throttle, brake (hold S when stopped to reverse) |
| A / D or Left / Right | steer |
| Space | boost: a nitro push while held. The meter under the speedo drains in about 3 s and refills in about 9 s |
| Shift | handbrake: locks the rear wheels for handbrake turns |
| R | put the car back on the road (also happens automatically if you flip or fall off) |
| Backspace | restart: back to the start line with a fresh lap, a full boost tank and (in the derby) a new set of rivals and a repaired car |
| C | camera: chase, high, bumper |
| V | rear-view mirror on/off |
| E | open the track editor with the current track |
| Esc | menu, M music, F3 telemetry |

Gamepad (right trigger, left trigger, left stick, A or X boost, B or RB handbrake, Y reset, Back restart) and touch controls also work.
The controls bar along the bottom of the screen shows the keys; its buttons (Restart, Back on road, Camera, Edit, Menu) can be clicked too.
The menu has a **drift assist** option that counter-steers when the rear axle slides.

## Destruction derby

Rival cars share the track with you. Wreck as many as you can before your own car goes up. It is on by default; the menu's
Options let you turn it off (plain lap racing) or pick how many rivals (3 to 10).

- **Damage is per zone.** Every car has four: front, back, left and right, each with its own hit points. A crash damages the zone that was
  actually touched, in proportion to how hard the hit was (closing speed and the mass of both cars); a nudge under about 3 m/s does nothing.
  A hit also crumples the two zones either side of it a little. **The first zone to run out wrecks the car.**
- **Your car is a banger built for the job.** It is tougher than a rival everywhere, and the front has extra plate welded on: lots of hit
  points *and* it soaks half of every hit. The rear and sides are much easier to kill, so keep your tail out of the way. The chart at the left
  of the screen shows all four zones (green to red, flashing when hit); when one hits zero you explode and the game is over.
- **Score.** Wrecking a rival that you hit within the last 6 seconds is a *Takedown*, worth 100. That includes rivals caught in the blast of
  one you wrecked (chain reactions), and rivals a barrel blast near you finished off. Your best score on each track is kept in the browser.
- **Rivals** run on the same car physics as you. They cruise the road in their own lane, slow for corners, traffic and barrels, take the jump, and
  reverse out of trouble; now and then one turns on you, aims at where you are going to be and rams (the nastiest use their boost) - though a
  jump always takes priority, so a hunting rival still lines up and commits to a gap rather than yanking the wheel toward you mid-air. Ram one
  yourself and it holds a grudge for a while (`AI.grudgeTime`), hunting you down even if it wouldn't normally pick a fight.
  A wrecked rival burns for a while, then sits as a permanent obstacle - it never disappears - while a fresh rival
is dropped on the road far from you. Once 8 hulks are piled up (`DERBY.maxWrecks`), the oldest quietly shrinks away
to make room for the next one.
- **Barrels hurt everybody**: an explosion damages every car in range (yours takes less than half as much), and a burning wreck sets off
  barrels beside it. Lay barrels in the editor to build a proper killing ground.
- **Chickens are just for laughs**: they wander back and forth across the road, oblivious to traffic, and any touch launches one into a
  quick comedic tumble before it vanishes - no damage, no explosion, no chain reaction. Purely cosmetic scatter.

Everything you would want to tune is in the open at the top of `src/damage.js` (`ARMOUR`, `DAMAGE`, `SPECS`), `src/derby.js` (`DERBY`, `POINTS`)
and `src/ai.js` (`AI`).

**Adding another way to score** is one line: put a new entry in `POINTS` in `src/derby.js` (for example `landing: 50`) and call
`derby.award('landing')` from wherever the event is detected. `award(kind, mult, label)` adds the points, shows "+50 Landing" in the points
feed and does nothing once you are wrecked. A good jump landing would go in `main.js` where `car.airTime` drops back to zero; a barrel
scoring would go where `propEvents()` sees a `blast`.

## The track editor

Draw a closed circuit by dragging points. The editor and the game share the same `Track` class, so what you see is what you drive.

- Drag a point to move it. **Double-click the road** to add a point, or press A. Delete removes one.
- Every point has a height, a bank angle, an optional width, and an optional **jump gap** (a takeoff ramp is built for you).
- A jump's **ramp height** and **lip angle** shape the takeoff. At 0° the ramp flattens out at the edge; higher angles curve
  the end up into a kicker that launches the car at exactly that angle. A side view under the sliders shows the ramp to scale.
- The **3D view** (top right) turns slowly and updates as you edit. Drag it to look around, scroll to zoom, double-click to reset.
  Heights are exaggerated in it (shown as "heights ×N") so hills and jumps are easy to read. Press 3 to hide or show it.
- **Fit** (or F) puts the whole track back on screen. Scrolling zooms gently, pinching zooms faster, and a sideways
  swipe pans; zooming out stops a little past the fitted view so the track can't get lost.
- Drag the markers in the **height strip** at the bottom to build hills. Steep sections turn red.
- **Auto-bank** leans every corner into the turn. **Reverse** drives the loop the other way.
- Tight corners and roads that cross at the same height are flagged. Raise one crossing by about 5 m to make a bridge.
- Pick **Random circuit** from the template dropdown for a fresh, ready-made layout to tweak - hills, jumps, banked
  corners, and a scatter of barrels and chickens. Every pick is a different track; it's checked to be actually
  drivable before it's handed to you, not just randomly thrown together.
- **Barrels**: press **B** (or the Barrels button) and click the map to drop an explosive barrel. Drag one to move it and press Delete
  to remove it; the side panel has *Remove all props*. Barrels sit on the road surface (bridges included), and are nudged clear of the
  barriers. They are drawn as little drums in the 3D view.
- **Chickens**: press **K** (or the Chickens button) and click the map the same way. They just splat on any touch - purely decorative,
  no damage or chain reaction.
- Save keeps the track in your browser. Export writes a `.json` file; import it from the menu.

Track format (`version: 6`): `{ name, width, walls, handles: [{ x, y, z, w, bank, gap, lip, kick }], props: [{ type, x, z, y }] }` in metres and degrees.
`lip` (ramp height, default 0.5) and `kick` (lip angle, default 0) only matter on points with a `gap`; older files load unchanged.
`y` is the height of the lowest edge of the road. `bank > 0` lifts the left edge. Old editor files (v4, v5) are migrated on load. `props` are things dropped on the track (`type: "barrel"` for now) at world position `x`, `z`; `y` is the ground height where they were placed and only tells a bridge from the road under it.

## How it works

| File | What it does |
|---|---|
| `src/track.js` | Spline through the handles, resampled by arc length. Answers "what is the ground here?" for any point, so there is no road mesh to collide with and walls have no seams. |
| `src/vehicle.js` | Full 3D rigid body: four spring/damper wheels, slip-angle tyres with a friction ellipse, locking handbrake, automatic gearbox and engine. **All tuning lives in the `CAR` object at the top.** |
| `src/trackGeometry.js` | Road, kerb, barrier and embankment meshes built to match the physics surface exactly (no three.js needed, so it is tested in Node). |
| `src/editor.js` | The blueprint editor and height strip. |
| `src/main.js` | Game loop (fixed 120 Hz physics, interpolated rendering), laps, respawn, menu. |
| `src/props.js` | Barrels: rigid bodies that rest on the same analytic ground as the car, get pushed by an impulse from the car's hull, light a fuse when hit and explode after a short delay, throw their neighbours (chain reaction), shove the car and scatter scrap. No three.js, so it is tested in Node. **Tuning lives in `BARREL` and `BLAST` at the top.** |
| `src/propsView.js` | Draws the barrels, chickens and scrap as instanced meshes. |
| `src/derby.js` | The derby: rivals, car-against-car collisions (five spheres per car, impulses at the point of contact), damage, wrecks, replacements and `award()` for scoring. No three.js. |
| `src/damage.js` | Zones, hit points, armour and the crash / wall / blast damage formulas. No three.js. |
| `src/ai.js` | The rival driver: follows the road, avoids traffic and barrels, takes jumps, hunts you - and holds a grudge if you ram it. Produces the same throttle / brake / steer a person would. No three.js. |
| `src/stage.js`, `carVisual.js`, `effects.js` | Scenery, car model and chase camera, skid marks, smoke, explosions and scorch marks. `carVisual.js` also paints the rival cars: the model's texture is hue-shifted once per colour and shared. |
| `src/hud.js` | The DOM heads-up display, including the derby score, damage chart, points feed and game-over card. |

Barrels: `BARREL.lightSpeed` is the closing speed (m/s) at which a hit lights the fuse (slower nudges just knock it about), `BARREL.fuse` is the delay before it goes off, `BARREL.bounce` how lively it is, `BARREL.radius`/`height` its size, `BLAST.carPush` is how hard an explosion shoves the car, and `BLAST.chainRadius` decides which neighbours go off too.

Tuning the feel: in `CAR.tyre` lower `muFront` and `muRear` for a slidier car; in `CAR.susp` change the spring rates for more or less body roll; `CAR.engine` holds the torque curve and gear ratios.
If the model's nose points the wrong way, set `MODEL.flip = true` in `src/carVisual.js`.

## Migrating from the old version

This replaces the single-file `index.html` and the `track-editor/` folder. You can delete `track-editor/`, `cars/car.gltf` (22 MB, the game uses `cars/car.glb`),
and the sounds `boost` and `engine.mp3`, which are no longer used. Keep `barrel.mp3` and `explosion.mp3` (the barrels use them) and `cluck.mp3` (the chickens use it).
There are also Dropbox-style "conflicted copy" files inside `.git`, which are worth removing before they confuse git.

## Ideas for next

Scattered debris such as cones, crates and tyres, points for clean jump landings and barrels, difficulty that ramps up with your score, open point-to-point tracks, a ghost of your best lap, and a street-network mode for the full Driver experience.
