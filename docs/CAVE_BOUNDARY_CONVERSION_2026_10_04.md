# Cave boundary conversion repair

The floor-edge prompt produced a useful single green outline, but its converted
wall had gaps. Reusing that exact API response reproduced the large gap in
front of the hearth: sight rays at x=1250, 1255 and 1260 passed through it.

Two conversion problems were involved:

- Original-art rejection removed painted boundary pixels near the yellow
  hearth glow, treating them as preexisting firelight.
- The 800-pixel working raster fragmented the thin curved paint at diagonal
  joins, producing many separate wall pieces.

The natural pass already exports an additions-only, yellow-on-black paint
layer. Conversion now receives that layer as explicit paint evidence. It takes
precedence over the firelight filter, while unmarked flame pixels remain
excluded. Imports with this layer use a working raster capped at 1600 pixels;
ordinary structural imports retain their existing resolution and filtering.
Both union conversion and separate-layer fallback receive this evidence.

The initial floor-edge prompt was:

```
Draw one continuous bright green (#00FF00) line where the walkable cave floor meets the surrounding rock wall. Leave entrances and passages open. Keep the rest of the image unchanged.
```

The structural wall, window, door and light prompts are unchanged. Existing
saved walls are not migrated or silently regenerated.

On the saved field/cabin/cave response, the result changes from 20 full-map wall
pieces to 4, with the cave represented by one continuous polygon. Seven sight
and body-clearance probes across the hearth boundary are now blocked. The
entrance remains open; approaching it at an angle still requires steering the
body between its actual edges rather than cutting across a rock corner.

Verification: the new regression failed on the old converter, then passed with
the repair. It checks painted boundaries over firelight, excluded unmarked
flame art, movement blocking and an open cave entrance. Typecheck and all 1650
tests passed. The saved response was reused without another image-API request
or manual mask edits. Runtime drag verification and comparison assets are
recorded under `artifacts/cave-wall-conversion-fixed-20261004/`.

## Keep the interior wall art visible

The player walkthrough exposed a separate placement problem: a boundary at the
floor/wall seam puts the painted vertical wall faces and hearth behind the sight
barrier. Repairing its gaps made that clipping more obvious.

The current natural-pass prompt uses one top edge around the visible interior:

```
Draw one continuous bright green (#00FF00) line along the top edge of the visible interior cave walls. Keep the wall faces and built-in features such as the hearth inside the boundary. Leave entrances and passages open. Keep the rest of the image unchanged.
```

One real image-API request on the same unchanged structural input returned one
boundary above the interior walls. Only its green additions are imported; any
other changes to the returned artwork are ignored, preserving the original map.
The confirmed-paint conversion repair remains in place.

Sight checks from the cave floor reach the hearth face, its upper structure,
and sampled left, right and back wall faces. Rays through the back, left and
right rock remain blocked. Real player drags enter and exit through the opening
and stop at the back boundary. This moves the mechanical boundary to the painted
top edge; it does not add raised walls or independently collidable furniture.

Evidence is under `assets/maps/experiments/cave-wall-art-boundary-20261004/` and
`artifacts/cave-wall-art-visible-20261004/`. The prompt change affects new drafts;
existing walls are not automatically replaced.
