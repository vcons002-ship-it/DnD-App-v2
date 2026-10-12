# Visible figures at wall edges and Shocking Grasp

The terrain fog compositor already preserved the full opaque body, but erased
the outside affinity rim wherever it projected over hidden or remembered ground.
This made heads and shoulders look cut off. The rim now renders after terrain fog,
using the existing visible-body depth/mask. Both GPU and fallback composition keep
hidden terrain covered and preserve foreground figure occlusion. Shared-only and
hidden creatures still follow the existing visibility and affinity rules.

There was also a separate color-filter problem: a warm-lit figure's raised head
could project over a dark floor pixel behind a wall and become black/grayscale.
Artwork's existing CSS grading now stays below the miniature canvas. The existing
GPU compositor grades its terrain pixels from the shared light field, and grades
each personally visible figure using light/darkvision at its base. This retains
wall-clipped light, cosmetic spell illumination and darkness settings without a
floor-shaped filter cutting through the head. It also works with map fog disabled.
A 256-pixel lookup texture shares the existing body-mask pass; there is no extra
model draw or CPU canvas readback. Cached polygon containment avoids repeating
wall tests on stationary figures as lantern brightness flickers.

Framebuffer copies now explicitly activate texture unit zero before using the
reused frame texture. Otherwise the renderer's texture-binding cache could leave
the body-mask sampler active and overwrite its pixels on a later frame. A pixel
test asserts that repeated grading/fog changes do not mutate the body mask.

Batch source meshes now have no active rendering layers while their instances
are drawn. Their former suppression layer collided with the spell foreground
layer, risking a second model draw over terrain fog. Restoration, instanced
shadows and outline IDs remain unchanged.

Shocking Grasp's damaging touch stays a brief body-wrapped lightning effect.
Its actual `noOpportunityAttacks` condition now drives a separate floating blue
electrical glyph and faint body arcs. It is not a standing sky bolt. Only the glyph
faces the camera, so it remains readable overhead and during rotation. Removing
or expiring the condition removes its marker; no client timer invents a duration.
The 2024 restriction is opportunity attacks, not all reactions.

Verification includes GPU pixel tests with an actual geometry-rendered body mask
at three camera angles: body pixels remain unchanged, erased outline pixels are
restored and empty hidden terrain stays covered. Further pixel tests check lit
head color, unlit darkvision, map-fog-off grading and the reused ground light field.
Batch tests retain each instance's grading slot. Status tests cover visibility,
bounded geometry and removal; server tests cover expiration on the target's next
turn. A disposable real-app recording uses a successful Shocking Grasp hit/damage,
wall-edge figures, regular/heavy darkness, overhead and rotated views.

Recording: <https://dnd.nic024i.app/uploads/previews/wall-token-20261011/index.html>.
The recording uses practice statistics and an isolated campaign, not a live save.
