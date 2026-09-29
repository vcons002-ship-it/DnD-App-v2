# Shared explored terrain

Players share one explored map, while current line of sight and creature
visibility remain personal. This is enabled automatically with wall/darkness
vision. The display has three states:

- Currently visible: existing map colors, lighting, darkvision and effects.
- Previously explored by the party but outside this player's sight: static
  map art and grid at grayscale with 48% brightness.
- Never explored: opaque cover.

An unobstructed non-dark map stays fully visible in its normal colors.
Explicit DM map fog still takes precedence: covered cells show neither live
terrain nor memory. Token fog only affects creatures, as before.

## Recording and persistence

On player snapshots of the active map, the server unions terrain visible from
all non-hidden PC tokens placed there. It does this once per broadcast, rather
than separately for each player. DM-only preparation does not record terrain.
History is in `explored_terrain`, keyed by map ID, and persists across browser
reloads, changing characters, map switches and campaign backup/restore. Old
saves start with no exploration history. Replacing/rearranging terrain resets
the geometry signature so old visibility cannot disclose newly placed art.

The recorded shape uses the same wall ray caster and darkvision distance as
current sight, plus visible distant light pools clipped against both observer
and light-source walls. Explicit map fog clips both new discoveries and the
returned history. Tiny subpixel coordinate quantization prevents nearly
coincident daylight boundary rays from producing unstable polygon unions.

Unchanged authoritative sight uses a bounded server cache; flame flicker and
camera movement do not write to the database. Polygon clipping is server-only.
The browser reuses the existing downloaded map images with a native SVG clip
and the same perspective transform as the battlefield. It reprojects history
only on geometry/camera changes, rather than every light flicker.

## Visibility boundaries

Memory contains only map images and the grid. It does not include miniatures,
names, health, doors' interactive controls, annotations, spell effects, moving
lights or other live scene objects. Token filtering, target lists, reveal tags
and interaction permissions continue using current personal sight. A party
member exploring a room lets others remember its layout without revealing
creatures through walls.

## Verification

- Server tests cover shared exploration without shared enemy visibility,
  no-wall daylight, DM fog, darkvision range, distant lights, cache loss,
  reconnect, map switches, replaced art, backup/restore and repeated doorway
  walks without polygon-clipping errors.
- The real-app browser test walks Druk into a room and back out, checks the
  exact pixel colors before/during/after exploration, verifies hidden figures,
  compares overhead/45-degree memory alignment, opens a separate Vanec player
  session to verify shared memory, reloads, then verifies explicit DM fog wins.
- Test name: `explored dungeon terrain remains gray after retreat while
  creatures disappear in overhead and tilted views` in
  `e2e/miniature-battlefield.spec.ts`. Set `DND_MOVEMENT_DEMO=1` to record.
- All app tests use a disposable database; the live campaign is unchanged.

[Video and screenshots](https://dnd.nic024i.app/uploads/previews/shared-exploration-20260929/index.html).
