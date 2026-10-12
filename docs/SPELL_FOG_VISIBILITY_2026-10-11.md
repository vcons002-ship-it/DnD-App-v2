# Spell effects and terrain fog - 11 October 2026

Visible spell geometry could be clipped by the ground-plane wall fog. Raised
figures had a protected body mask, but their bolts, arrows, sparks and chains
were outside that mask. A visible target close to a wall could therefore lose
the part of its effect that projected over hidden ground.

Spell meshes now have a dedicated render layer. With player terrain fog enabled,
their visible color pass runs after terrain compositing, using the original
scene depth. Foreground figures still occlude particles. The effect pass draws
only spell pixels: it does not lift map art, alter sight/exploration polygons or
add light origins that reveal rooms. Hidden targets still produce no effect.

Without terrain fog, spells render in the ordinary scene pass. The legacy sight
lift includes the same depth-tested spell pixels in its foreground canvas. Body
and outline masks remain cached and do not redraw just because a spell animates.
Detached GPU warmup and skip behavior continue to use the dedicated spell layer.

## Recordings

[Watch the short effects reel or the complete casting sequence](https://dnd.nic024i.app/uploads/previews/spell-space-20261011/index.html)

The spacious courtyard demonstrates Fireball, Call Lightning and Hail of Thorns
through real spell/hit-feature buttons, live server dice, saving throws and HP
changes. A deliberately added test barrier then checks Shocking Grasp and Hold
Person beside terrain fog, rotation, and heavy darkness. A sentry beyond the
barrier disappears from the player's snapshot and remains absent. Previously
seen terrain can remain as remembered terrain under the existing fog rules.

This is a disposable campaign. Vanec has a demonstration spell loadout and
practice bow; targets have extra HP and low saving-throw stats. It is not a copy
of the user's campaign sheets. The short reel trims dice waits from the same
recording; the complete video retains the controls and rolls.

Captured actual window frames with Windows Graphics Capture, AV1 NVENC on the
verified RTX 5090, 60 fps, 1440 x 1010. H.264 copies support phone playback.

## Verification

- Production build and both workspace typechecks passed.
- All 2,005 unit tests in 197 files passed.
- Twenty-one focused browser checks passed, including actual heavy-dungeon combat.
- Pixel regression covers spell recovery over fog, foreground occlusion, hidden
  effect suppression, covered terrain preservation and the legacy sight path.
- Existing light-mask tests preserve darkvision, exploration and spell-light
  expiry. Hold-preparation tests preserve invisible staging and immediate skip.
- The recording completes five actual spell/hit-feature flows without browser
  errors and verifies that the hidden sentry is absent after the wall check.

This release also includes the preceding dice-hold preparation and floating
damage-text caching work documented in
[the performance report](ROLL_HOLD_PREPARATION_2026-10-11.md). Full spell lighting
and local darkvision color restoration remain enabled on High and Balanced;
the simple color overlay remains diagnostic. Low retains ground-sampled figure
lighting. No spell, damage or targeting rules change in this visibility fix.
