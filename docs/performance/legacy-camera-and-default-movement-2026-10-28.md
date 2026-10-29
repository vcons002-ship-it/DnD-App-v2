# Legacy camera concealment and default movement — 2026-10-28

Legacy movement animation is now automatic when the server provides a valid prepared sequence. The separate animation checkbox and saved movement preference have been removed. A stale saved `dnd-legacy-movement=snap` value is ignored. Browser reduced-motion settings, missing server support, disabled assistance, teleports, fog resets and invalid walking routes retain their safe fallback behavior.

## Camera concealment fix

The local Legacy SVG fallback used its 500 ms visibility timer to update camera placement. The raster path used a React state update for camera placement. Both could lag the map during a pan or zoom.

Camera movement now updates the existing SVG world transforms, tiled-mask transform, raster/atlas planes, static graded artwork and raster boundary covers synchronously. It does not calculate new visibility, decode images or wait for a server revision. Layout effects restore the latest camera after React commits. Unchanged camera placement is skipped, keeping ordinary movement/snapshot commits from repeating DOM placement work.

The new regression fails against the prior served client with a 414.5-pixel transform mismatch in the same JavaScript turn as the pan handler. It passes for players and the DM's Player view, with assistance on and off. It also checks an actually hidden orange-map pixel remains dark, real wheel zoom, draw-turn alignment, and panning an active server animation without changing its atlas frame. This establishes browser/runtime behavior in Chrome; physical macOS Safari was not available.

## Torch visibility and valid walks

Viewer-shaped snapshots change a placed light's `visibleTorch` artwork flag when its fixture enters/leaves personal sight. Comparing complete map JSON treated this as a structural change and made the moving player's heavy-room animation fall back to snap. The observer could still animate because its personal map did not change.

The map discontinuity key now ignores only that per-viewer display flag. Changes to light positions/radii, added lights, walls, heavy darkness and manual fog remain discontinuities. Focused tests protect that boundary. Player and DM walking regressions include a torch entering sight around a wall, verify intermediate movement/creature visibility and footsteps, and verify fallback after assistance is disabled. The final heavy-room smooth test requires real intermediate sight poses for the moving player's 1x run.

## Validation and deployment

- Client/server TypeScript checks and an isolated Vite production client build passed.
- Four camera concealment regressions passed. Default player/DM walking, startup gating, light/wall editing, policy/private assets, state resync and retained-rendering regressions passed across the focused runs.
- The retained/full-canvas pixel comparison now compares premultiplied color plus alpha, retaining its 8/255 tolerance. The previous raw-RGB comparison incorrectly rejected one almost-transparent pixel: RGB 0 versus 32 at identical alpha 8/255 is only about one composited color value. This change does not weaken opaque-pixel or concealment checks.
- Twenty-one focused unit tests passed, including the new narrow torch-flag discontinuity tests, walking and state delivery.

Verification builds now use `E2E_CLIENT_DIST` and `e2e/serve-isolated-client.mts`, so they need not overwrite the live `client/dist`. Build an isolated client with:

```powershell
npm.cmd exec -w client -- vite build --outDir ../artifacts/default-animation-camera-client-20261028
$env:E2E_CLIENT_DIST='C:\Users\vcons\DnD-App-v2\artifacts\default-animation-camera-client-20261028'
npx.cmd playwright test -c e2e/playwright.config.ts e2e/legacy-camera-mask.spec.ts e2e/legacy-walking.spec.ts
```

After runtime validation, the frontend was deliberately published on 2026-10-28 at 23:14:50 UTC by adding the new immutable hashed assets, retaining old assets, backing up the old entry page and atomically replacing the live entry page. Localhost and the public domain returned the new SHA-256 `91d0a2b16fa2bab2b85bad5f4963183dadbf47dca5db456533fa529b8a5e5ee6`; both health checks passed. Refresh is required for an already-open client.

The backend was not restarted. Its live process predates these changes, so newer server-side preparation, animation and latency improvements are not activated there by this frontend publication. The public site's appearance of Legacy mode earlier was explained by builds updating the already-served `client/dist`, independently of backend restart. No Git push occurred in this work. Live `.env`, campaign data and uploads were preserved.

Evidence: `artifacts/camera-mask-regression-20261028/before.png`, `frontend-deployment.json`, and `live-index-before.html`. Heavy-board measurements are documented separately in `assistance-direct-current-2026-10-28.md`; no timing measurement ran concurrently with video or correctness tests.
