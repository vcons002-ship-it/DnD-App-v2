# Darkness and arch preview corrections

Regular explored terrain previously used 48% of the raw map image regardless
of atmosphere. Live dungeon terrain retains only 16% before its grade color,
so remembered floors could appear brighter. Memory now follows the same unlit
grade and is slightly dimmer (13.6% for the regular dungeon at full light level).
Daylight memory and the existing heavy-darkvision contour pass are preserved.

Carried lantern vision used a 2.8-ft source height while the renderer used 9 ft.
Both now use the approved 9-ft source at the token center, including wall
occlusion. The visible lantern fixture remains on the hip. This avoids competing
vision/light fans from different origins; light strength and radius still flicker.

The experimental arch-art overlay now uses the renderer's ground-light field,
grading and heavy-darkness desaturation. Its original map pixels fade over the
visible figure mask when the figure stands inside the arch footprint. The
previous darkness recordings did not enable this overlay. Corrected captures
enable `VITE_ARCH_ART_STUDY=1` and `archArt=1` in the disposable app. This remains
the experimental overlay, not a new automatic arch-import or saved-map feature.

Verified with type checking, the full server suite, new lighting regressions,
real player drags, memory-filter assertions and arch activation/fade assertions.
Fresh map copies start without exploration history. The live save is untouched.

Replacement recordings and an opaque/faded arch close-up comparison:
https://dnd.nic024i.app/uploads/previews/repaired-wall-gaps-20261003/darkness-v2.html
