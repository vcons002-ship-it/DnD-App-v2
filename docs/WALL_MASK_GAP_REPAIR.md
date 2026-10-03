# Structural wall-mask gap repair

Structural yellow-mask conversion now joins small paint breaks by default.
The repair threshold is one quarter of a grid square, rounded down in the
working raster and capped at 16 working pixels. The closing radius expands
only enough to handle that threshold. Wider cuts remain reserved during both
contour simplification and rectangle fitting.

A wider chipped section can reserve an entire connected unpainted seam.
Repair releases only its locally short runs between painted pixels, and only
where the closing operation filled them. This joins partially painted cap
breaks without treating every connected empty floor region as a wall.

Precise mode remains available as the seventh `wallsFromYellowMask` argument:
`false` preserves even one-pixel cuts. It is used for experimental colored
arch-footprint extraction and separate natural-boundary fallback conversion.
An already merged structural/natural mask uses the ordinary structural policy.

Arch cuts happen afterward. Only their central 70% is cut; the outer 15% at
each end retains normal wall blocking. This change does not implement automatic
window detection or alter door fitting, and does not migrate existing saved
walls. The DM must generate and apply a new draft for an existing map.

## Courtyard comparison

The same accepted simple yellow and material-neutral magenta masks were reused,
without new image requests or manual edits. Final wall pieces decreased from
15 to 9. On the 64-pixel, 5-ft grid, the effective repair threshold was 15.2
source pixels (about 1.19 ft).

Both central arch passages and all four retained ends passed sight/movement
checks; real player mouse drags passed after application through the ordinary
wall-draft endpoint in a disposable campaign. The upper-left vertical seam
now blocks sight. The upper-right break is about 24 source pixels and remains
open because it is wider than the repair threshold.

https://dnd.nic024i.app/uploads/previews/repaired-wall-gaps-20261003/index.html

The live campaign was unchanged. Synthetic regressions cover small paint
breaks, a chipped seam, wider passages, precise extraction, offset doorways,
diagonal walls, and the normal draft/apply workflow.
