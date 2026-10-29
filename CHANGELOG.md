# Bangers & Smash! — Change Log

This file records notable user-facing changes. New entries go at the top.

## v17.470 — Device edition label restored
- Restored the small top-right Desktop Edition, Tablet Edition or Mobile Edition label on the main menu. No gameplay or audio code changed.

## v17.469 — Edition label rolled back
- Removed the new Desktop/Tablet/Mobile Edition corner label after sound was reported missing. No gameplay or audio code was changed.\n\n## v17.468 — Device edition label\n- A small top-right label on the main menu now identifies the current version as Desktop Edition, Tablet Edition or Mobile Edition.\n
## v17.467 — Hazards move in the replay
- Apple Crumple: the hammers, spinners, rolling rocks and presses now move in the replay (and in made movies) exactly as they did in your run; they used to stand frozen.

## v17.466 — Solid spinners
- Apple Crumple: the spinning bars (and their poles) are now properly solid. Before, they only gave you a knock and you could carry on through; now you are stopped, pushed out and bounced off, with the same damage as before.

## v17.465 — Tidier phone replay
- The Film shape and In a TV set choices are gone from the replay on a phone.

## v17.464 — More replay on a phone
- On a phone the replay controls now tuck down out of the way, leaving the whole screen for the replay; tap the little tab at the bottom to bring them back up (and again to put them away).

## v17.463 — Simpler graphics quality
- Starting quality is now just: computers on High, phones and tablets on Medium (you can still pick any level in Settings). The old special cases for older phones are gone for now, until mobile has been tested.

## v17.462 — Lights and podium on every race
- Every race against rivals now starts with the Red, Red, Green! lights (also when you restart). Demolition, arenas and Apple Crumple are not races, so they start as before.
- Race Day races now finish with the podium too; the stage results come up once you close it.

## v17.461 — Site publishing fixed
- Updates since v17.456 were not reaching the live site (a stray file stopped the site build); fixed, so everything from v17.457 on goes out together.

## v17.460 — Fair and square multiplayer
- In multiplayer every car now pulls and tops out at the same speed, whatever it is (weight, handling and crash damage still differ).
- Other players now show up as the car they actually chose, instead of everyone looking like the first car.
- The lethal black barrels lose their yellow stripes and get a yellow skull and crossbones instead.

## v17.459 — Start lights in multiplayer
- Multiplayer races now begin with the Red, Red, Green! start lights, like Race Day. Everyone is held on the grid and the lights go out at the same moment for all players.

## v17.458 — Join chime
- A two-note chime plays in the multiplayer lobby whenever someone joins the room.

## v17.457 — Proper bumps in multiplayer
- Car-to-car contact in multiplayer now works like the solo game: a real two-car impact (heavier cars shove lighter ones, off-centre hits spin you), a little bounce on hard hits, and a dent, health loss, sparks, smoke, debris and crash sound on BOTH cars - not just the one that got rammed.

## v17.456 — Podium comes back properly
- Coming back to the podium after watching a replay (or making a movie) showed a blank white box instead of the podium; it now gets a fresh drawing surface each time and shows the cars again.

## v17.455 — Race Day: 1 lap
- Race Day now starts on 1 lap (it remembers what you pick afterwards) and the lap choice goes up to 5 laps, both on the Race Day screen and in Settings. The Race Day button's sub-title is now "Jump in and put your foot down!". (Multiplayer races stay at up to 3 laps.)

## v17.454 — Lethal black barrels
- New black barrels with yellow hazard stripes: they explode the instant anything touches them, and every car within about 7 m of the blast (you or the rivals) is wrecked on the spot. About one in six barrels on the Barrels track is one, scattered at random with the red ones, and a few turn up on random circuits too. (Not during the spawn grace after a start or respawn.)

## v17.453 — Rivals keep up with your car
- In races the rivals now cruise at the pace of the car you chose: they follow the fastest speed your car has been showing lately (about 90% of it on Normal, 95% on Hard, 100% on Expert), instead of a fixed top speed, so a fast car can't simply leave them behind. Bends still slow them as before.

## v17.452 — Replay from the podium
- Multiplayer races are now recorded (you and the other players' cars), and the podium has a "Watch replay" button. When the replay ends you are back on the podium.

## v17.451 — AI cars lean with banked roads
- Rival cars were being held level with the flat ground by their anti-roll stabiliser, so on banked roads they stood upright instead of leaning with the road (and floated off it). The stabiliser now measures roll against the road under the wheels, so rivals (and the player's drift/caravan guard) bank with the track.

## v17.450 — Merged holes, banked Bluebell
- Holy Moley: when the same spot is hit again and again, its small holes run together into one bigger hole.
- Bluebell Woods: every corner now banks into the turn, up to the maximum 20 degrees on the tighter ones (not at the start or beside a jump).

## v17.449 — Ragged debris
- Crash debris is no longer square: the pieces are ragged, uneven shards in a mix of sizes — small chips, mid-size bits, long slivers and the odd large panel.

## v17.448 — Several small holes
- Holy Moley: a deep crumple now tears two or three small holes scattered over it instead of one big one.

## v17.447 — Holy Moley on by default
- Holy Moley (real damage) is now on by default, including for players who had the old default saved. Switching it off in settings still sticks.

## v17.446 — Even music levels
- All the tunes now play at the same loudness (each was measured and levelled: the fairground tune was much louder than the rock one), and the music as a whole sits a little lower than the sound effects. Applies to the menu, in-game and movie soundtracks.

## v17.445 — In the lift
- New tune "In the lift" (the movie-editing music) in the Tune choices (menu, settings and in-game) and as a movie soundtrack.

## v17.444 — Rival bell and siren
- When rival cars honk as you approach, a rival bus now rings its bell and a rival police car sounds its siren (also in the replay), instead of the normal horn.

## v17.443 — Tyres not black
- Holy Moley: the black inside a hole no longer spreads to the tyres (they now have their own material instead of sharing the body's).

## v17.442 — Smaller holes
- Holy Moley holes are about 40% smaller.

## v17.441 — Black holes
- Holy Moley: the inside seen through a torn hole is now plain black (no lighting or reflections), instead of showing the inside of the model.

## v17.440 — Sharper holes
- Holy Moley holes now look like torn sheet metal: a crisp jagged edge with only a thin burnt rim (no more graduated dark fade), steep walls and a flat floor, and no paint smudging round the tear.

## v17.439 — Holy Moley (real damage)
- New setting, off by default: Holy Moley (real damage). When it is on, a hard enough crash tears a ragged hole right through the bodywork (dark, scorched edges, the dark inside of the car showing through) and pieces of panel and sparks fly off. It uses the existing dents, so it costs almost nothing, and only the shader switches on - the car models are untouched.

## v17.438 — Shared tracks: solo or with other cars
- When a friend sends you a track link, you can now choose "Drive it solo" (just your car on the track) or "Drive it with other cars" (the usual rivals).

## v17.437 — Boulder rumble
- boulder.mp3 plays when a rolling boulder sets off, on Apple Crumple and on Bluebell Woods (and any other track with rolling rocks), quieter with distance.

## v17.436 — Apple Crumple replay
- The result card at the end of Apple Crumple has a Watch replay button; when the replay ends the card is back so you can try again. (The hazards themselves don't animate in the replay yet.)
- The yellow warning signs now face you with a clean front; their posts are on the back.
- crusher.mp3 is now in the sounds folder, so all four hazard sounds are in.

## v17.435 — Apple Crumple: stages, flaming hoop, fireworks
- The yellow hazard stripes and checkpoint strips now lie flat on the road (they used to hover on hills and banks).
- Every stage (the road between checkpoints) now has its own clock: 20 s for the first, then 18, 16, 14 and 12. Reaching a checkpoint starts the next stage's clock afresh; run out of time in a stage and the run is over. A wreck now costs 5 s, a fall or reset 3 s.
- A new finale: a long ramp up to a second jump, with a flaming hoop hanging over the gap. Fly through it to finish (miss it and you still finish, with +10 s), then enjoy the fireworks. Medal times are now gold 58 s, silver 68 s, bronze 80 s.
- Sounds wired in: hammer.mp3 (each swing), crusher.mp3 (each slam), flame.mp3 (each burst of fire) and fireworks.mp3 (at the finish), quieter with distance. Drop the files into the sounds folder; the game just stays silent for any that are missing.

## v17.434 — Bigger pizza toppings, smarter rivals round drums
- Deep Pan Pizza: the olive humps are 50% higher and the cheese dips 50% deeper.
- Rival cars now see explosive drums much earlier, slow down for the ones in their path, and swerve round them (using nearly the whole road, and not drifting back through them). On the road tracks the rivals set off roughly half as many drums as before - far fewer on the thin road - and in the arena the rivals steer round drums too, even while charging at a target.

## v17.433 — Bug sweep
- Fixed Deep Pan Pizza: two of the cheese dips were silently missing (eight olive humps but only six dips). It now has six humps and six dips, properly spaced out, none close to where you start.
- Brought the automated tests up to date with earlier deliberate changes (single-life Last One Standing, Expert skill 1.3, Arcade-only handling, new button wording, pizza sauce colour, movie soundtrack rule); the test suite is now fully green.

## v17.432 — Apple Crumple is deadlier
- The hammers, the crushing presses and the fire pits now wreck your car outright (boulders and the spinning arm still just knock you about).
- You have 3 spanners (lives) on the course: each wreck uses one (and costs +10 s), and when they run out the car is scrapped and the run ends.
- Resetting with B on the course costs time, not a spanner.

## v17.431 — Apple Crumple tweaks
- Fixed: the "Try again" and "Menu" buttons on the result card could not be clicked (Enter and Esc work too).
- More hills round the course.
- Boulders are now plain rocks.
- New hazard: random fire pits that shoot a column of flame into the air, burning and throwing any car above them.
- Apple Crumple asks for a password until it is ready.

## v17.430 — Apple Crumple, the obstacle course (feature branch)
- New solo timed obstacle course in **Driving Tests**: swinging hammers, rolling boulders, a spinning arm, crushing presses, exploding barrels, a big jump and a final gauntlet.
- Beat the clock: start lights, a countdown timer, four checkpoints that repair your car and act as restart points, and a finish line with a result card, medals and best time.
- Wrecks cost +10 s, falling off or resetting +5 s; you restart at your last checkpoint.
- Every hazard is real: it touches your car, shoves it and takes hit points off the zone it hit. Warning signs and hazard stripes come before each one.

## v17.428 — Apple Crumple moved to Driving Tests
- Moved **Apple Crumple** out of Wacky Racing and into **Driving Tests**.
- Driving Tests is now a real section rather than showing only “Coming soon…”.

## v17.427 — Apple Crumple startup fix
- Fixed the game-wide startup crash introduced by Apple Crumple.
- The obstacle-course barrel generator now rounds coordinates directly instead of calling an out-of-scope helper.

## v17.426 — Apple Crumple
- Added **Apple Crumple** under Wacky Racing as a solo one-lap assault course.
- Added deterministic swinging demolition hammers with real car impacts and denting.
- Added three triggered rolling boulder crossings, barrel slaloms and a jump.
- Added a 90-second target clock; overtime is allowed so a run is never simply thrown away.
- Apple Crumple is currently **solo only** and excluded from Multiplayer and Race Day.
- Normal race podium is suppressed; finishing shows **Course complete!** and your run time.

## v17.425 — More visible crumple damage
- Increased visual dent depth and radius by roughly **25–30%**.
- Smaller genuine impacts can now leave a visible dent.
- Bigger impacts reach strong crumple deformation sooner.
- This is **visual only**: car HP, crash damage and wrecking strength are unchanged.

## v17.424 — Race Day stage-flow fix
- Race Day no longer opens the generic solo podium after each championship stage.
- The finish message remains visible for about **5 seconds**, then the Race Day results panel appears.
- Championship stages can now continue normally via **Next stage** instead of being covered by the podium.

## v17.423 — Buckle Up race-mode fix
- Fixed an old saved **Demolition** mode leaking into **Buckle up!** after the Options simplification.
- Buckle up now always starts a normal **1-lap race** on a random circuit.
- **Deep Pan Pizza / Demolition Day** still forces Last One Standing from the arena track itself.

## v17.422 — Podium car colours
- Solo AI podium cars now keep the same paint colour they used during the race.
- Wacky Racing podiums continue to use each rival's actual vehicle as well as its race colour.
- Multiplayer podiums use each player's transmitted name, chosen vehicle and colour.
- Added the same special recolouring path used by pale/neutral-body vehicles so podium paint matches the race more closely.

## v17.421 — Arcade-only cleanup
- Removed the final obsolete code that still referenced the old Handling dropdown.
- Prevents a menu error now that Handling has been removed from Options.

## v17.420 — Simplified game setup
- **Buckle up!** is now always a quick **1-lap random race**.
- Buckle up respects the optional **Vehicles** choice below: **Mixed vehicles** or **Same vehicle, different colours**.
- Removed Demolition from the Options selector; **Demolition Day** is the dedicated Last One Standing experience and still launches Deep Pan Pizza.
- **Race Day** is unchanged.
- Removed the Handling selector and forced **Arcade handling throughout**, including for players with an old Standard setting saved.

## v17.419 — Deep Pan Pizza previews
- The large editor map now shows Deep Pan Pizza with its crust, dark sauce, olive humps and cheese dips instead of a plain arena disc.
- The editor 3D preview now uses a pizza texture generated from the same bump/topping data as the playable arena.
- The home-page track preview uses that same 3D preview renderer, so selecting Deep Pan Pizza now shows the pizza there too.

## v17.418 — Deep Pan Pizza visual tune
- Darkened the red tomato sauce base.
- Increased the cheese circles/dips by **30%**.
- Increased spacing between pizza toppings so the arena looks less tightly patterned and more like a real pizza.

## v17.417 — Podium after race finish
- Solo race finish/win message now remains readable for a full **5 seconds**.
- After those 5 seconds, the podium appears automatically using the actual finishing order and vehicles from that race.
- The podium now says **You came 1st!** when the local player wins.

## v17.416 — Wacky Racing label
- Renamed the game-mode option to **Wacky Racing - a mix of vehicles**.

## v17.415 — Mobile icon spacing
- Increased the vertical spacing between the small mobile quick-action icons.
- Moved the camera-cycle icon slightly higher above Boost for clearer separation.

## v17.414 — Mobile quick actions
- Added three small white vertical buttons above the phone speedometer: Mirror, Back on road and Explode.
- Each uses the existing game action so behaviour matches the desktop/cog controls.

## v17.413 — Mobile camera button
- Added a small white camera-cycle icon directly above Boost on phones.
- It uses the same camera switching behaviour as the existing C/LB camera control.

## v17.412 — Mobile Auto performance
- Auto graphics now starts **phones at Medium** instead of High.
- Auto keeps **tablets at High**.
- Medium quality on touch devices now runs vehicle physics at **60Hz** instead of 120Hz; headless lap testing already showed equivalent handling at 60Hz.
- Manual **Low / Medium / High** quality choices still take priority over Auto.
- Existing adaptive resolution remains active and can still reduce render resolution or disable expensive features when frame rate falls.

## v17.411 — Mobile home buttons
- Big home-screen race buttons now use the full available phone width.

## v17.410 — Custom music reset
- Added Reset for locally uploaded music.
- Reset deletes the stored browser copy and returns Custom music to Lounge when needed.

## v17.409 — Last One Standing
- Player now has one life: first wreck means elimination and the round ends.

## v17.408 — Movie Maker music safety
- User-uploaded custom music is gameplay-only and cannot be included in exported movies.

## v17.407 — Solid trees
- Scenery tree trunks now have physical collision.

## v17.406 — Custom music
- Players can upload a local music track and keep it in IndexedDB on that browser/device.

## v17.405 — Tougher, steadier AI
- Increased default race AI pace and catch-up pressure.
- Added AI-only anti-roll assistance to reduce rival rollovers.

## v17.404 — Mobile holding screen
- Added “Try it anyway…” so phone/tablet users can enter the existing touch version.

## v17.403 — Mobile/tablet notice
- Added the larger-screen recommendation screen for mobile and tablet visitors.
