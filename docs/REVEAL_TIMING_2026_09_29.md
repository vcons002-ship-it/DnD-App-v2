# Movement-aligned creature and terrain reveals

The destination snapshot previously revealed creatures and updated shared
exploration immediately, while the figure still animated from its old position.
First-use shader linking also blocked the browser during the first goblin reveal.

## Changes

- A map-owned presentation clock drives token anchors, 3D bodies, carried lights,
  personal sight and party sight. It survives model readiness and switching
  between personal and shared-sight layers. No React render is needed per frame.
- Newly authorized enemies remain concealed until the displayed observer has
  sight. This also gates the other player's grayscale sighting. Tokens removed
  by the authoritative snapshot are removed immediately.
- Existing explored terrain remains during a move; new destination exploration
  joins it when movement finishes. Current personal sight still opens naturally
  along the route. Map changes, memory clears and explicit fog changes apply
  immediately. This does not change server authorization or persistent data.
- New model materials compile asynchronously against the actual scene lighting
  before their first draw. Loaded assets and compiled shaders remain reusable.
  This does not download hidden encounter models or reduce texture/mesh quality.

## Evidence

Disposable two-player test campaigns use Varis scouting around a physical wall,
with a goblin sentry 45 feet from his destination. Druk observes shared sight.
Movement uses real player drag controls, with lanterns on in each condition.

Cold reveal, isolated desktop Chrome baseline versus the first fixed run:

| View | Largest captured frame gap before | After | Main-thread tasks over 50 ms after |
|---|---:|---:|---:|
| Varis | 395 ms | 44 ms | 0 |
| Druk | 347 ms | 55 ms | 0 |

The CPU profile attributed about 341 ms to blocking `getProgramInfoLog` during
first-use shader linking. The goblin file itself arrived in about 8 ms locally.
Before the fix both views exposed the enemy while Varis was still at y=650;
afterwards it appeared only after line of sight cleared the corner. New terrain
memory waited until he reached y=550.

These are local desktop measurements, not Fold/mobile FPS claims. The later
three-lighting capture ran alongside the unit suite and had maximum frame gaps
of 52–96 ms. First-time model preparation may still finish shortly after the
reveal; it no longer synchronously holds the entire movement animation.

- Three recorded reveal cases pass: regular, dim darkness and heavy darkness,
  each asserting both players' frame-by-frame visibility and memory timing.
- Four browser regressions pass: private movement animation, physical wall
  collision, explored terrain on retreat and noninteractive shared sight.
- Six pure timing regressions cover delayed personal/party vision, interrupted
  movement, repeated snapshots, immediate removals/clears, map switches and
  reduced motion.
- Typecheck, production build and 996 tests pass.

Run the short capture with `DND_MOVEMENT_DEMO=1 DND_REVEAL_PROFILE=1` and
Playwright's `record corner party combat` filter. Optional `DND_REVEAL_CPU=1`
also writes a Chrome CPU profile. Captures and timing JSON live under the chosen
Playwright output directory.

[Mobile replay: all three conditions, both views](https://dnd.nic024i.app/uploads/previews/reveal-timing-20260929/index.html)

Only preview media was published. The live app service and campaign were not
updated or restarted.
