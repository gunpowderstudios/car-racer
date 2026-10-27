# Bangers & Smash! — Change Log

This file records notable user-facing changes. New entries go at the top.

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
