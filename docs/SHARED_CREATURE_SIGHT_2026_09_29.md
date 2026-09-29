# Shared creature awareness

Party members always remain on the active map for players. Outside the
viewer's personal sight, they appear in grayscale at 78% opacity. Explicit
DM hiding still conceals a PC. Ordinary wall occlusion, range and map fog
do not erase a party member's known position.

An enemy currently seen by another non-hidden PC on the map appears with
the same grayscale treatment. When nobody in the party sees it, its token
and public creature record disappear from player snapshots. Terrain memory
persists; enemy positions do not. Reveal tags remain stable on rediscovery.

Personal visibility still uses walls and the existing illumination rules:
60 feet of darkvision in either darkness level, distant visible light pools,
and unlimited unobstructed range on non-dark maps. Map/token fog and explicit
DM hiding still conceal enemies. Objects and door controls remain personal.

## Interaction

Shared-only figures have no hit region, selection, dragging, context menu,
affinity outline, targeting entry or active-turn/condition ring. Direct sight
restores their normal display and interaction. Open context menus and pending
target selections clear when a target becomes shared-only.

The server rejects shared-only direct weapon targets, initial spell targets,
spell damage/ray/dart assignments, Chromatic Orb jumps, transferred marks and
Riposte targets. Rejected attacks/casts cannot spend slots or apply damage.
Already accepted hits retain their existing damage-resolution workflow.
The DM retains the full map and normal targeting permissions.

## Rendering and persistence

`Token.sharedSightOnly` is snapshot-only; it is never saved to a token row.
2D figures use a noninteractive grayscale Konva layer above personal fog.
3D figures reuse the existing WebGL renderer and cached models in a separate
awareness pass, copied to a transparent grayscale canvas above the fog.
The pass includes no terrain, lamps, atmosphere or spell effects. A depth-only
pass of personal figures preserves foreground occlusion. Static awareness
is cached until pose, camera, appearance, label or occlusion changes, so light
flicker and weather do not repeatedly copy the same figures.

Shared figures do not create local lights, shadows or mist disturbances.
Creature awareness does not change the map's persisted explored-terrain shape.
A door walkthrough exposed a terrain union precision error; normalization now
also covers previously saved intersection vertices, with a regression for
repeated fractional thick-door openings and closure.

## Verification

Final checks: typecheck and production build passed; 990 server tests across
108 files passed. The final three browser scenarios (creature awareness,
base-cell fog, and wall doors) passed, following the separately passed terrain
memory walkthrough. No browser/shader errors in the new awareness scenario.

- Server snapshots: independent viewers, daylight/dim/heavy darkness, last
  observer leaving, distant PCs, hidden PCs, fogged/hidden creatures, public
  monster redaction and unchanged DM snapshots.
- Actual registered socket handlers reject shared-only weapons, spells and
  ray assignments, without slot spending, damage or consumed ray budgets;
  the same requests work after the caster gains personal sight.
- Real-app browser coverage: two player sessions, overhead and 45 degrees,
  2D and 3D, rendered canvas pixels, target-list exclusion, ignored clicks,
  direct-sight restoration, stale context-menu closure, last-observer loss,
  doors and persistent terrain memory.
- Uses disposable databases and the real optimized model files. The live
  campaign and running service are not changed.

Record the new scenario with `DND_MOVEMENT_DEMO=1` and Playwright's
`shared creature awareness` test in `e2e/miniature-battlefield.spec.ts`.

[Video and screenshots](https://dnd.nic024i.app/uploads/previews/shared-creature-sight-20260929/index.html).
