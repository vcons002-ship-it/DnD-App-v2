# Saved map environment controls

Shadows and mist can now be enabled from **DM → Maps → Environment** on the
development branch. Every map starts with effects off, including older saves.
The DM's changes apply to the map currently being viewed, so a staged map can
be prepared without changing the active map. Players receive the active map's
settings through the usual authoritative snapshot.

Controls include token shadows, their direction/length/darkness, drifting mist,
density, height from 0.5 to 10 feet, subtle ground shading and movement response.
Shadow direction is the direction the shadow travels in map coordinates:
0 degrees right, 90 down. Matching painted lighting is still manual. Sliders
commit on release or keyboard input rather than broadcasting every pointer event.

The DM's Environment section and the player's Interface settings offer a local
**Auto / High / Low / Off** preference. It is saved in that browser only. Low
reduces mist resolution and sample count, retaining full miniature detail; Off
removes the environmental effects and restores ordinary miniature lighting.
Auto uses the existing small-screen / drawing-buffer thresholds, not adaptive
frame-time control. Reduced-motion preference freezes the mist.

## Rendering and visibility

The real battlefield uses a transparent shadow receiver, not a second copy of
the artwork. The original Konva map, image tiles, grid and 2D tokens stay in
their existing layers; tools and health displays retain their foreground layer.
Effects cover composite bounds, including negative-coordinate tiles. Mist
height, optical density and drift use the calibrated map scale. The standalone
study retains its original scale and appearance.

Player map fog clips the mist's density, its final screen composite, ground
shading and contact shadows. A nearest-filtered cell texture follows the same
floor(x / grid), floor(y / grid) cell convention as game visibility. The final
composite clip prevents lower-resolution fog interpolation from brightening
covered terrain. Oversized fog masks fail closed rather than allocating
unbounded textures. Token fog still hides only creatures. Hidden creatures are
absent from the player snapshot, so they cannot cast shadows or disturb mist;
existing hidden-source wake cleanup remains active.

Loaded miniatures get a cached lower-body measurement when effects are enabled,
including models that finished loading before the DM turned the effects on.
The accepted narrow leading contact and trailing curls remain in use. Changing
the composite map origin clears old flow coordinates instead of treating the
new origin as a token move.

## Persistence and boundaries

`maps.environment` is an idempotent SQLite JSON column, defaulting to `{}`.
The row mapper fills conservative defaults; updates whitelist fields, bound
numeric values, preserve omitted settings, and reject other campaigns' map IDs.
Only DM connections can send `map:setEnvironment`. Full backups and map imports
copy the settings. Browser quality never enters the saved campaign.

There is no scenery editor in this change. Prototype pillars and rocks remain
in the standalone study. Painted walls still have no geometry, collision or
mist obstruction. Slides-based maps do not show the environment editor.
Rendering remains on each viewer's device. Actual phone GPU performance and
crowded-board performance remain to be measured before recommending High broadly.

## Verification

- Typecheck, production build and 909 server tests pass.
- Domain tests cover defaults, malformed values, socket role/campaign isolation,
  active versus staged maps, backup restore, map import and fog mask boundaries.
- A real-app browser case uses DM and player connections with Druk, Varis and
  Vanec. It checks saved settings after reload, independent local quality,
  phone-width Auto, negative-coordinate tiles, measured-body movement wakes,
  ruler visibility and fog in overhead/45-degree views. No script/shader errors.
- A pixel comparison requires zero changed central-map pixels between effects
  on/off when all terrain is fog-covered and all creatures are hidden.
- The standalone orbit regression checks that camera rotation retains wakes.

Evidence: `DnD-token-models/environment-app-controls-20260927` in the external
working-art folder. Published screenshots:
https://dnd.nic024i.app/uploads/previews/environment-app-controls-20260927/index.html

This is development-branch work. Testing uses temporary databases; no live
campaign was migrated or edited, and the running app has not been updated.
