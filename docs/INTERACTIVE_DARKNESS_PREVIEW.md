# Interactive darkness exploration

Published preview:
https://dnd.nic024i.app/uploads/previews/darkness-exploration-20261003/index.html

This is a standalone browser sandbox using the current MiniatureLayer,
PlayerVisionOverlay, wall collision and player-vision rules. It does not open a
socket connection or access a campaign. Each browser has its own position and
explored terrain; reloading starts fresh.

## Controls

- Lighting: daylight, regular darkness or heavy darkness. Switching levels keeps
  exploration, so the same route can be compared with different lighting.
- Lantern: toggle Druk's carried lantern. It starts on.
- Move: tap a destination, or drag Druk's base to preview the destination and
  distance, then release. Straight moves stop at walls; use intermediate points
  to walk around a corner. Arch centers are passable.
- Pan: drag the camera. Dragging empty ground in Move mode also pans.
- Rotate: drag horizontally to rotate freely. A desktop right drag also rotates.
- Pinch or use the +/- buttons to zoom. Overhead and 45 degrees change the view.
- Follow Druk recenters the view; Fit map shows the full map extent.
- Reset returns Druk to the start and clears explored terrain.

The scene contains Druk and a goblin beyond the arch. The goblin is preloaded but
only displayed while personally visible. Remembered map art has no remembered
creatures. Daylight has unlimited sight, blocked by walls; dungeon darkvision
reaches 60 ft, with the same carried-light falloff as the app. The arch overlay
uses original map pixels and fades only over a figure under the arch.

The heavy-darkness current/memory settings match the latest correction: muted
color remains in current sight, memory remains grayscale with darker highlights.
There are no raised walls, weather, multiplayer or combat controls in this preview.

## Build and publish

From the repository root:

```sh
npm run build:exploration-preview -w client
```

This packages `client/exploration-dist` with the courtyard image, wall/arch scene,
approved Druk and goblin models and textures. It leaves `client/dist` untouched.
Git LFS assets must be available before packaging. Copy the packaged directory to
a folder under the server's `uploads/previews/` directory to serve it. No service
restart, database copy, campaign import or production client rebuild is required.

The arch-data override only runs in a build with `VITE_ARCH_ART_STUDY=1`, and its
metadata URL must be under `/uploads/previews/`. The prototype remains separate
from automatic arch import and saved-map features.

## Verification

Phone-size touch-browser checks cover wall-blocked dragging, movement under the
arch, lantern and all darkness toggles, enemy reveal, panning, free rotation,
pinch zoom and reset. Landscape checks cover layout and touch movement. The
published HTTPS page is checked directly, with no campaign/socket requests.
Browser emulation does not establish performance on a physical phone.
