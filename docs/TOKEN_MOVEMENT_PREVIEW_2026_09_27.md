# Private movement previews

Dragging leaves the committed figure and its labels at their original location.
The dragging browser alone draws a translucent copy at the proposed destination,
a facing arrow, and distance measured with grid diagonals counting as one square.
Facing is calculated from the committed starting point, not the last pointer step.
Escape abandons the preview. Releasing submits the existing `token:move` command.

The server retains collision correction and authoritative facing. Every viewer
animates an accepted snapshot over 220–460 ms, driving Konva and WebGL from the
same presentation coordinates. Newly revealed figures appear at their revealed
destination; hidden travel is not reconstructed. Fog is checked at the animated
base. Reduced motion skips the interpolation. The behavior also works with 2D
tokens and when the optional WebGL renderer is unavailable.

New clients send no planned token positions. DM pointer sharing is suppressed
during a drag. The server additionally excludes players from legacy DM drag
events, even for visible creatures on maps with no fog. Other authenticated DMs
may still receive those legacy events, subject to their selected map.

The proposed endpoint is tentative: collision correction happens on release.
The player preview does not inspect hidden blockers or request private map data.
No character stats, movement allowance or map geometry are changed by previewing.

## Verification

- All 897 server tests pass, including DM-preview privacy and legacy player fog rules.
- Typecheck and production build pass.
- Twelve browser scenarios pass with actual GLBs, the production app and a temporary
  server/database: both roles, sampled intermediate animation positions, no DM
  drag events reaching players, Escape, 2D, overhead/45°, free camera rotation,
  fog, collision correction, reconnect, touch gestures and WebGL failure.
- A recording uses the courtyard map and two connected browser contexts. To repeat:

```powershell
$env:PW_CHROMIUM='C:/Program Files/Google/Chrome/Application/chrome.exe'
$env:DND_MOVEMENT_DEMO='1'
npx.cmd playwright test -c e2e/playwright.config.ts -g 'private movement shadows' --output=PATH_TO_EVIDENCE
```

Only the test database is modified. These changes are on the development branch;
publishing the demonstration does not deploy the app or restart the live campaign.

Published evidence: https://dnd.nic024i.app/uploads/previews/movement-and-mist-20260927/index.html
Both H.264 videos played successfully at a 390-pixel browser width, with byte-range
responses, no horizontal overflow, and no page errors. This checks phone layout
on the host PC; it is not a benchmark on physical phone hardware.

## Mist reaction follow-up

The separate environment prototype already received Druk's movement, but its wake
was largely covered by his opaque base. In addition, the density formula cleared
the displaced rim as well as the trail. The disturbance now extends beyond the
base, deflects ribbons more visibly, and keeps the displaced edge separate from
the cleared density. It retains the existing 160×112 field, 15 Hz upload rate,
48-stamp bound and 3.6-second lifetime. This is a visual approximation, not fluids.

The full environment verifier passes, including wake creation/expiry, interaction
toggle, quality controls and phone layout. A focused recording compares reaction
off/on, then shows the wake from overhead:

```powershell
node scripts/environment-preview/build.mjs
node scripts/environment-preview/record-wake.mjs PATH_TO_EVIDENCE
```

Mist remains in the standalone environment test. It has not been enabled on live
campaign maps. Earlier GPU timings describe the previous preview, not this revision.
