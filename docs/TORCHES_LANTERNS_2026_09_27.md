# Placed torches and waist lanterns

The DM can place lights without the former eight-light count cap and choose
**Show 3D torch** on each light. Newly placed lights show a torch by default;
older saved lights retain their invisible-source appearance. Position, radius,
height, color, strength, flicker, move and remove controls still apply.

Players have **Lantern on/off** next to their character controls. The DM has
the same control under the selected token's DM tools. A small framed lantern
hangs at the front of the waist. It follows the figure's movement and facing;
the flame/light is not attached to a hand and no weapon or pose is replaced.
The belt surface is measured once from the named body geometry on the approved
models; other models have a proportional fallback. Two-dimensional token mode
keeps a lantern and illumination at the token's position.

## Saved state and visibility

- `tokens.carried_lantern` is an idempotent new column, default off. Snapshots,
  backups, map imports and token copies retain it.
- `token:setLantern` requires campaign ownership. A player can toggle only their
  claimed, visible PC on the active map; the DM can toggle their campaign's tokens.
- Hidden/covered figures do not leave their carried light behind. Placed sources
  in map fog remain filtered server-side, including the player map list.
- A carried lantern works even when saved map atmosphere is disabled, without
  changing the DM's settings. Local environment quality Off hides these effects.

Lighting is decorative: no automatic fog reveal, inventory spending or changes
to vision/combat. Painted walls do not block the light, and these sources do not
add point-light shadows. Existing directional/contact shadows remain separate.

## Rendering and cost

All sources contribute to one bounded GPU light field (1024 pixels on its longest
side, 512 on Low). Ground shading and mist scattering sample that field. Torches
and lanterns share instanced geometry/materials rather than loading a GLB for
each light. Each miniature receives the eight strongest nearby sources through
its PBR materials, independently of lights elsewhere on the map. This removes
the placement cap without an unbounded light loop on every miniature fragment.

Brightness, reach, flame motion and mist illumination use the same time signal.
The preview uses maximum mist density (0.7) and height (10 ft), including three
and twelve placed torches, three carried lanterns, movement, orbit and overhead.
Physical-phone performance on crowded boards has not been measured.

## Verification and review

- Typecheck, production build, and 912 tests in 99 files passed.
- Server tests cover ownership, cross-campaign/hidden/prep-map rejection, save
  import, movement persistence, sanitizer safety and more than eight lights.
- The connected DM/player browser regression covers the actual toggle and
  placement UI, optional visible geometry, twelve sources, movement, 2D fallback,
  local quality, weather, fog and zero changed central pixels on a covered map.
- The recording checks for JavaScript/WebGL errors and captures the real renderer
  with the approved full-resolution models. The live campaign save is untouched.
- Published video playback passed in Chrome with a 390 x 844 mobile viewport:
  1142 x 752 video, 27.48 seconds, no playback error or horizontal overflow.
  Publication checks compare HTTP bytes with the local video and screenshots.

```sh
node scripts/environment-preview/build.mjs
node scripts/environment-preview/record-orbit.mjs <evidence-directory> --torches
node scripts/environment-preview/publish-lanterns.mjs <evidence-directory>
```

Preview: https://dnd.nic024i.app/uploads/previews/environment-waist-lanterns-20260927/index.html

Only static preview files are published. The running campaign app is not updated.
