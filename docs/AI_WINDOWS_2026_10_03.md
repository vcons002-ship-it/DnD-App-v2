# Editable AI windows

The full map setup is under **Walls → Suggest walls, doors, windows & lights**.
Each workflow makes an independent image API request; structural walls still
receive their existing natural-boundary follow-up. Window generation uses the
simple visible-window prompt and the original map only. No exaggerated reference,
assumed window count, wall-guide image or symmetry instruction is supplied.

```
Paint every visible window and viewing slit in this battle map solid blue (#0000FF), including windows shown on wall faces. Mark only windows actually shown. Keep the map unchanged otherwise.
```

Blue connected regions become window candidates, with original blue artwork
excluded. Small panes are retained at map resolution rather than filtered by
the structural-wall minimum size; adjacent panes separated by a narrow mullion
are grouped. Each candidate is projected onto a nearby wall cap and fitted through
its full thickness. Candidates without a safe nearby wall are skipped and shown
with an explanation. The DM can deselect candidates in the Windows review tab.

Applied windows are independent saved pieces tagged `window: true`. Sight and
light use a cached wall outline with those footprints removed. Movement uses
the complete original walls and the window barriers. A window therefore permits
vision and illumination, never normal player movement, regardless of size.
Removing a mistaken window restores the opaque original wall without rebuilding
the wall mask. Existing maps have no windows added automatically.

**Remove window N** in the Walls menu deletes one window. Move / rotate wall
also supports the blue window pieces and offers **Remove window** for selection.
These outlines are DM-only while editing. Windows create no extra token or art.
They persist in the existing wall JSON and campaign backups; no migration is
required. Combined setup validates all selected workflows before any writes.

## New-map test

A fresh image-API roadside inn map was analyzed through the real app UI,
with all four requests and the existing second wall pass. The defaults applied
3 wall pieces, 5 fitted doors out of 6 candidates, 6 windows and 17 light sources.
No masks or selections were manually corrected. Door candidates that could not
meet wall jambs were skipped automatically. This is one map test, not a guarantee
of detection accuracy on every map. The DM should still inspect windows and lights.

The entrance arch cap remains a solid wall in this uncorrected result: this
combined production setup does not yet include the separate experimental arch
pass. It needs that opening pass or a DM edit before walking underneath it.
The recordings test windows without making that correction.

Raw masks, reviews and recordings are retained in
`artifacts/inn-window-full-flow-20261003/`. The static comparison and video page is
published under `/uploads/previews/inn-window-full-flow-20261003/` on the DnD domain.
The test runs against an isolated save, not the campaign database.

The later field/cabin/cave prompt comparison is documented in
[AI_MASK_PROMPT_TEST_2026_10_04.md](AI_MASK_PROMPT_TEST_2026_10_04.md).
