# Full-map Qwen gates and quadrant window masks

Requested change: retain local Qwen filtering, give it the full map for non-window
features, and use quadrants for windows. Existing image-API prompts remain unchanged.

## Fresh source and live run

Generated one new overhead fantasy battle map using the built-in image-generation
tool: a roofless roadside inn, courtyard, road and adjoining natural cave, with
visible doors, windows and light sources. No previous map was reused.

Source prompt: "Create a detailed overhead D&D battle map, square composition, roof
removed so interiors are visible. A small ruined roadside inn with three connected
rooms, clear wooden doors, several visible windows in the exterior walls, an
adjoining natural cave chamber reached through a passage, a grassy courtyard and
road, a few torches and lanterns. Mostly top-down, slight isometric depth on walls,
readable floor plan, no labels, no characters, no grid. Painted fantasy tabletop map
art. Distinct stone wall tops, natural cave rim and clear door and window artwork."

The run used the real application drafting functions, installed
`qwen3.8:27b-q4_K_M`, and `gemini-3-pro-image` through the application's image gateway.
Source SHA256: `4fa0837b626d53fe25c81f31a9853e4f11cde2d6eeafd0860f02901ee51f5dcf`.
Disposable data only; live campaign data was not modified.

| Check | Local input | Qwen reply | Mask calls |
|---|---|---|---:|
| Walls | Full original map | Yes | 1 |
| Cave interiors | Full original map | Yes | 1 |
| Doors | Full original map | Yes | 1 |
| Windows | NW, NE, SW, SE, with context | All Yes | 4 |
| Lights | Full original map | Yes | 1 |

All eight checks were positive. This confirms full-map cave recognition in this
case, but does not demonstrate request savings or guarantee Qwen negatives are
accurate. Masking remains the image API's job.

## Conversion and normal review selection

- 24 wall pieces from structural and natural masks.
- 7 door candidates; 4 fit automatically. The cave-side door and the two separate
  outdoor gate-leaf masks did not meet the existing jamb-fitting checks.
- 23 blue window components; 19 fitted pieces after existing sequential overlap
  and wall-fit checks. Several physical windows have separate painted panes.
- 22 light candidates, using existing light defaults and no new torch art.
- 532 saved wall edges including openings; combined application succeeded.

The raw window mask identifies the visible window artwork, but converted openings
are not all accurate: several project onto nearby corner edges and create overly
long or angled sight cuts. Successful geometric fitting is not an accuracy score.
This existing fitting limitation was retained in the evidence rather than repaired
by hand. The Qwen gate does not resolve it.

The first direct harness attempted independent window fits and encountered an
overlap rejection. It was corrected to use the same sequential fitting policy as
`MapSetupDraft`, then applied the same unchanged drafts. No candidates were
visually deselected, no mask pixels were edited, and no geometry was manually fixed.
The natural response also retraced masonry in green; the existing converter
reported and ignored those retraced components while retaining first-pass walls.

Evidence: `artifacts/qwen-full-map-gate-20261005/`, including source, raw API masks,
crop metadata, local answers, drafts and application receipts. The paid run was
not repeated to repair its output.

Mobile comparison, raw masks, exact prompts and actual DM screenshots:
https://dnd.nic024i.app/uploads/previews/qwen-full-map-gate-20261005/

## Regression coverage

Full-map input and clear-negative skipping, local failure/ambiguity fallback,
quadrant selection, selected-region intersections and a window crossing the
central crop seam are covered. Existing map setup browser tests retain real
authorization, application, geometry freshness, editing and disabled-pass behavior.
