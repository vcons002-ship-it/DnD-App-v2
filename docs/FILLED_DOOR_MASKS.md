# Filled door masks

The standalone door pass and combined map setup use this prompt:

> Paint every visible door and gate in this overhead/isometric battle map completely solid opaque cyan (#00FFFF). Cover the entire door, including its frame, with a flat mask that hides all texture and details. Mark only doors and gates actually shown. Keep the map unchanged otherwise.

The converter retains a bounded convex footprint of each cyan component, excluding original cyan map art. It accepts full door faces rather than requiring thin strokes. Tiny paint flecks are skipped; broad room-sized paint is rejected. Legacy line markers remain supported.

When a marker does not fit directly, the fitter uses nearby wall-cap directions to project the filled footprint across the wall. Projection is limited to 0.9 grid squares, preserves the position along the wall, and still requires jambs on both sides. It does not cut or move existing walls. Footprint coordinates are validated again before applying a draft. Both review screens show the painted footprint and fitted mechanical door separately.

On the unchanged Crossroads test map, two fresh image requests painted both front doors, a garden gate, and a banner false positive. The cottage door fitted successfully and became a linked working door. Closed sight/movement, Locked refusal, opening, and closing were verified against the actual saved geometry. The watchpost and outdoor candidates still did not fit the existing wall geometry; no masks or walls were manually corrected. The banner demonstrates that filled masks do not eliminate recognition errors.

The first simpler prompt left visible grain and fragmented cyan. That response is preserved alongside the revised flat-mask response for comparison. Walls, windows, lights, caves and arch prompts were not changed.

Evidence: https://dnd.nic024i.app/uploads/previews/filled-door-flat-test-20261004/

## Connecting incomplete jambs

When ordinary fitting fails, the fitter can add short wall connections from two facing wall ends to the painted door. The footprint must lie between those ends and within 0.9 grid squares of their shared axis. Each extension is limited to one grid square; the projected opening must be 0.3–2 grid squares wide. One-sided gaps, inward-facing wall edges, distant doors, and connections crossing other walls or openings are rejected. Existing walls stay intact. Connections are separate editable wall pieces, highlighted yellow in both review screens with a “Connects 2 wall ends” note. Deselecting the door omits its connections too.

Apply recomputes all geometry on the server and saves connections and the linked door together; supplied client extension geometry is ignored. Connections count as walls, not door objects. Opening the door leaves the connections opaque and solid, so sight and movement pass through the actual doorway without leaking around its edges.

Reusing the exact previous Crossroads masks now fits both the cottage and watchhouse doors, without another AI request or manual mask correction. The watchhouse needs two connections about 4.2 feet long each. Saved closed/open/locked checks passed for both doors. The banner and garden gate remain unfitted.

Connection comparison: https://dnd.nic024i.app/uploads/previews/door-jamb-connections-20261004/
