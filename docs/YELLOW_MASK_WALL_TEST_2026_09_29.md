# Gemini yellow mask to functional walls

The accepted second Gemini image was converted to 71 solid rectangle walls
(284 edges) and loaded into a disposable app map through `map:editWalls`.
The original dungeon image remained the displayed map; only yellow annotations
from the generated image supplied geometry. No manual coordinate corrections
were applied. The live campaign was not changed.

## Source and conversion

- Source map: `assets/environment-preview/dungeon.png`, 1402 x 1122.
- Grid: 50 image pixels per 5-foot square.
- Mask: `artifacts/gemini-yellow-mask-v2/generated.jpg`, 2304 x 1856,
  returned by `gemini-3-pro-image`.
- Mask SHA256: `607de93daac4b15508d8774360e64a3f5b7b4271f1283f3d64efa21b0ce12fe8`.
- Saved source: [second Gemini output](https://dnd.nic024i.app/uploads/previews/gemini-wall-mask-20260929/second-generated.jpg).
- [Video, imported walls and alignment comparison](https://dnd.nic024i.app/uploads/previews/gemini-mask-walls-20260929/index.html).

`server/src/wallMask.ts` normalizes the full generated frame to the original
map aspect ratio and processes it at 800 x 640. It detects yellow pixels,
closes tiny compression gaps, and fills narrow enclosed wall interiors while
leaving large room interiors empty. It decomposes the result into the app's
existing solid rectangle primitive, within the 512-edge wall budget.

The rectangles represent 95.6% of the cleaned/filled mask pixels. This is a
decomposition coverage metric, **not** a measured accuracy score against the
map art. Small irregular edge remnants are omitted. Different map scales,
diagonal/curved walls or badly shifted AI output still need separate testing.
Doorway gaps remain open passages; the DM can place functional doors there.

## Verified behavior

The recorded real-app test uses a fresh database on port 4099 and no darkness:

1. All 71 rectangles load and appear in the DM wall editor over the map art.
2. Varis in the northwestern room is hidden from Druk in the corridor.
3. A click-and-drag toward the room stops Druk at the south wall
   (center y=438.519; requested y approximately 335). Varis stays hidden.
4. Druk moves sideways, through the preserved doorway gap, into the room.
   Varis becomes visible, with his real 3D miniature loaded.
5. A direct player socket move toward the eastern wall is stopped by the
   server too, independently of drag-preview collision handling.

Run after placing the saved mask at its artifact path:

```powershell
$env:DND_MASK_WALL_DEMO='1'
$env:DND_MOVEMENT_DEMO='1'
$env:PW_CHROMIUM='C:/Program Files/Google/Chrome/Application/chrome.exe'
npx.cmd playwright test -c e2e/playwright.config.ts e2e/miniature-battlefield.spec.ts -g 'Gemini outline becomes solid app walls' --output artifacts/gemini-mask-app-test
```

The test writes screenshots, video and `mask-wall-result.json`. It is opt-in
because the original API image is an external review artifact. Synthetic
coverage in `server/src/wallMask.test.ts` always runs, checking filled wall
interiors, empty room interiors, line of sight, collisions and open gaps.

Validation: typecheck, 977 server tests across 106 files, production build,
and the recorded Playwright test passed. This is an import experiment; it does
not yet add yellow-mask generation/import to the DM's automatic wall-draft UI.
