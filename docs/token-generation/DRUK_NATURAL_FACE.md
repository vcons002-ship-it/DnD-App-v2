# Druk natural face - September 2026

Druk's runtime miniature now uses the approved natural-face reconstruction.
Both eyes use his anatomical left eye from the first generated head (the eye
on the right in a front view). The lower face has restored length and chin
depth, softer cheek and jaw transitions, and a more level nose.

The four original views remain the reconstruction references. The selected
textured export was welded at geometric seams, mirrored from the anatomical
left half, and subdivided once while retaining its native UVs. Small local
deformations restore the approved proportions. Mirroring applies to the head,
ears, scars and hair. This does not introduce new texture detail: the original
2048-pixel head atlas bytes are preserved.

The fitted head replaces the old head and separate iris overlays. Twenty-seven
body, equipment, base and collar components are preserved byte-for-byte; the
front collar retains its geometry with the reviewed dark inner lining. Existing
base dimensions, hands, sword and hip axes are unchanged. The app still applies
its dark basalt texture to the base after loading.

| Artifact | Value |
| --- | --- |
| Runtime file | `druk-c98df869b913.glb` |
| Runtime size | 24,966,816 bytes (24.97 MB) |
| Triangles | 880,404 |
| Source SHA-256 | `186dde63b81d2a6523ae8c990a53ff5862e7b7f559ace17e72953ed9d8305582` |
| Earlier Meshopt-only SHA-256 | `c652013a617c4309ae1f10c62fd8af034c06a1c39abcbf45e350e69f38e32813` |

Lossless Meshopt compression and texture repacking preserve every triangle's
attribute bytes and decoded texture pixels. The September 28 workflow installed
the previously separate 24.97 MB test and applied it to Varis and Vanec too; see
[character compression](../CHARACTER_COMPRESSION_2026_09_28.md). The hash-named URL replaces the previous Druk model in the shared player
and DM manifest, so an existing browser cache cannot serve the old head for the
new URL. No campaign migration is needed.

GitHub rejected this revision's initial LFS upload because the repository's LFS
budget is exhausted. Only this new runtime file and its selected provenance are
stored in regular Git, with scoped attribute exceptions preserving exact bytes.
Existing LFS assets and account billing are unchanged. This adds binary data to
Git history; it does not alter model compression or require an external asset host.

Selected art, raw generated head, corrected head, scripts, assembly checks and
compression receipt are indexed by
[`runtime-provenance/manifest.json`](../../assets/miniatures/runtime-provenance/manifest.json).
The original local paths in immutable receipts document provenance; the archive
uses their `DnD-token-models`-relative suffixes. Earlier receipts remain historical.

The [face comparison and rotation](https://dnd.nic024i.app/uploads/previews/druk-face-proportions-20260926/index.html)
and [4K map previews](https://dnd.nic024i.app/uploads/previews/druk-map-4k-20260926/index.html)
show the selected assembled model. Those Blender previews do not include the
app's runtime basalt material override.
