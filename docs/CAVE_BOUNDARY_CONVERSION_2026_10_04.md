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

The accepted prompt is now:

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
