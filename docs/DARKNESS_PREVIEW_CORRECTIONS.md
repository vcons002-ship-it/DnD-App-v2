# Darkness and arch preview corrections

Regular explored terrain previously used 48% of the raw map image regardless
of atmosphere. Live dungeon terrain retains only 16% before its grade color,
so remembered floors could appear brighter. Memory now follows the same unlit
grade (16% for the regular dungeon at full light level). This is a small lift
from the previous 13.6%, without retaining the brightness of an old lantern.
Daylight memory and the existing heavy-darkvision contour pass are preserved.
Current sight in heavy darkness retains muted original color in recovered
detail, at the same brightness. Desaturation is now 35% instead of 80%, because
the previous trace of color was too faint to distinguish on mobile.
Remembered terrain stays fully grayscale.

Carried lantern vision used a 2.8-ft source height while the renderer used 9 ft.
Both now use the approved 9-ft source at the token center, including wall
occlusion. The visible lantern fixture remains on the hip. This avoids competing
vision/light fans from different origins; light strength and radius still flicker.

The experimental arch-art overlay now uses the renderer's ground-light field,
grading and heavy-darkness desaturation. Its original map pixels fade over the
visible figure mask when the figure stands inside the arch footprint. The
overhead view retains 42% of the arch over the covered figure, rather than the
previous 12%, so the stone is still recognizable above the miniature. At 45
degrees it retains 22%, with a smooth change between camera angles.
The previous darkness recordings did not enable this overlay. Corrected captures
enable `VITE_ARCH_ART_STUDY=1` and `archArt=1` in the disposable app. This remains
the experimental overlay, not a new automatic arch-import or saved-map feature.

Verified with type checking, the full server suite, new lighting regressions,
real player drags, memory-filter assertions and arch activation/fade assertions.
Fresh map copies start without exploration history. The live save is untouched.

Replacement recordings and an opaque/faded arch close-up comparison:
https://dnd.nic024i.app/uploads/previews/repaired-wall-gaps-20261003/darkness-v4.html
