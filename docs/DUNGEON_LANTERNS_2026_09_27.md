# Hip lanterns and dungeon darkness

Carried lanterns now hang from the side of the hip, slightly forward of its
outer edge. The attachment samples the belt height and side of each approved
model's body geometry. The source GLBs, hands, weapons and poses are unchanged.
Movement and facing use the rendered figure transform, including the matching
side offset in 2D mode.

## Controls and saved behavior

- DM: Maps > Environment > Lighting > **Heavy darkness**. Off restores the
  selected lighting preset and ambient slider value. On reduces ambient,
  directional and reflection light to 10% of that setting, darkens the map
  tint and reduces ambient mist illumination. Local lantern/torch strengths
  and their scattering in the mist stay unchanged.
- A placed light now offers **Model: Torch / Lantern**, plus its existing
  Show 3D model checkbox. Older lights retain their previous torch/invisible
  appearance. Use a height of 0.5 feet for a floor lantern, or raise it to hang
  it above the floor. There is no placement count cap.
- The darkness flag and fixture choice use the existing sanitized environment
  JSON. They persist through save/import and reach both DM and player clients.
  Old maps default to normal darkness. No schema migration is necessary.
- Players retain their own Lantern on/off and Environment quality controls.
  Map darkness remains DM-controlled. Fog still determines visibility; this
  does not implement darkvision, wall occlusion or automatic fog revelation.

## Dungeon demonstration

The unchanged Castle Basement image comes from the existing campaign upload.
Its dimensions, scale and SHA-256 are recorded in
`assets/environment-preview/dungeon-source.json`. The static lab uses:

- 1402 x 1122 map, 5 pixels per foot, full-detail Druk/Varis/Vanec models.
- Three carried hip lanterns and three occasional warm floor lanterns.
- Whole-map floor mist, 1.5 feet high at 8% density, light wind.
- Normal/heavy comparison at the same camera position, party movement along
  the L-shaped corridor in both settings, hip close-up and full-map view.

The preview routes figures along the existing corridor. Its camera follows
the party for the movement demonstration; this does not add a camera-follow
rule to gameplay.

```sh
node scripts/environment-preview/build.mjs
node scripts/environment-preview/record-orbit.mjs EVIDENCE_DIRECTORY --dungeon
node scripts/environment-preview/publish-dungeon.mjs EVIDENCE_DIRECTORY
```

Preview: https://dnd.nic024i.app/uploads/previews/environment-dungeon-lanterns-20260927/index.html

## Verification

- Typecheck, production build and 912 tests in 99 files passed. Build retains
  the existing bundle-size advisories.
- The connected real-app DM/player browser regression passed: darkness
  propagates, survives reload, restores normal mode, and placed lanterns
  can be switched/hidden without losing their light. Existing ownership,
  fog, movement, 2D fallback and local-quality coverage remains in the test.
- Sanitizer and save/import tests cover the new darkness/fixture settings,
  invalid values and conservative old-map defaults.
- Recorded renderer: no JavaScript or WebGL errors. The H.264 video is
  1142 x 752, 28.44 seconds. Published bytes match the local artifacts.
- Published video plays and seeks in Chrome at a 390 x 844 mobile viewport,
  with no playback errors or horizontal overflow. The interactive scene
  loads all seven models, chooses Low mist quality, switches darkness and
  produces movement wakes. Physical-phone performance was not measured.

Only static preview artifacts were published. The running campaign app and
campaign save were not changed.
