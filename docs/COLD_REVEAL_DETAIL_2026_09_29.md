# Earlier model preparation and clearer darkvision creatures

After movement and sight were aligned, the first creature could still arrive
after its name: asynchronous shader preparation had removed the movement hitch,
but was starting only when the server authorized that creature.

The renderer now prepares three common material variants at map startup: the
textured body, its double-sided variant, and the textured pewter base. Small
invisible geometry and a one-pixel texture compile the same lighting shaders.
Their materials stay alive until renderer disposal so the linked programs can
be reused. A zero-coverage preparation draw also completes the library's deferred
uniform/attribute setup without touching any screen pixels. It retains the
main renderer's output configuration and restores camera/light layers, scissor,
clearing and shadow settings afterwards. Changes to shadow configuration prepare
the relevant variants again.
No hidden encounter models, token positions or creature identities are fetched.
Unusual materials still use the existing asynchronous preparation fallback.

Heavy-darkness darkvision also raises the small neutral material-detail floor
and midtone contribution. Shared figures use the same shader and retain their
existing grayscale/transparency. Torch coverage suppresses this detail lift in
lit areas; terrain, explored memory, visibility limits and affinity borders are
unchanged.

## Verification

The disposable two-player corner test uses Varis with a lantern, revealing a
goblin sentry 45 feet away outside lantern illumination. Druk observes party
sight. Timing samples follow the actual displayed token positions, not only the
server's destination snapshot. The recorded baseline took 376 ms in Varis's view
and 330 ms in Druk's between the visible token label and 3D readiness. The first
updated heavy-darkness run had its model ready in the first visible frame of
both views.

Creature-body luminance increased from about 7.7 to 15.2 on a 0-255 scale in the
first updated capture. The live and remembered terrain samples remained 8.89
and 8.90 respectively. These are local desktop Chrome measurements, not mobile
frame-rate claims or a guarantee about uncached model downloads.

Final recorded runs showed 0 ms of model delay after the first visible label
in all six views (regular, dim darkness and heavy darkness, for both players).
The heavy-darkness creature sample measured 15.11 in both direct and shared
passes. The separate terrain samples were unchanged. Cold-load frame gaps still
reached 43-83 ms across these views; this fixes the late model arrival, not every
first-use frame cost on every device.

Browser checks passed for the three lighting conditions, explored-terrain retreat
in overhead and tilted views, and shared-creature noninteraction/removal. The
capture asserts that enemies never appear before the displayed observer clears
the wall, and shared exploration waits for committed movement to finish.
Typecheck, the client production build and all 996 server tests pass. The
20.7-second replay was checked on the public domain at a 430-pixel mobile
viewport, including playback and comparison image loading, with no page errors.

[Short mobile replay and brightness comparison](https://dnd.nic024i.app/uploads/previews/reveal-detail-20260929/index.html)

Only preview media was published. The installed app, running service and live
campaign were not modified.
