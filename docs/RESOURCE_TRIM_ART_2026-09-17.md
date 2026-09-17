# Character-matched resource trim

Three production PNGs were generated with the built-in image-generation tool.
The existing resource-branch-v4 PNG was the edit target; each final guardian
PNG was a style-only reference. No guardian image, gem, socket, resource value,
hit area or orb-centered arc geometry was edited. Original assets are retained.

Assets live in `client/public/art/hud/`:

- `resource-branch-fighter-v1.png`: forged iron, bronze and crimson accents.
- `resource-branch-ranger-v1.png`: antique gold/bronze vines and muted green leaves.
- `resource-branch-sorcerer-v1.png`: dark arcane metal, pale gold and purple inlay.

The PNGs retain real alpha transparency. The existing fixed-cap/repeating-middle
compositor uses the chosen texture at six through ten resource rings. Unmatched
race/class combinations retain the neutral v4 trim. Selection follows the orb's
existing race/class identity, not a name hardcode or a saved-data migration.

## Final prompt set

### fighter

Use case: precise-object-edit. Asset type: transparent dark-fantasy game HUD ornamental strip below resource icons. Image 1 is the edit target; Image 2 is ONLY a materials/style reference, do not reproduce the person or orb. Edit Image 1 into forged dark iron with warm polished bronze bevels, small angular armored spurs and recessed crimson leather or enamel accents, matching the fighter's armor and red-trimmed orb frame. Preserve Image 1's very wide 3:1 canvas, exact low horizontal undulating spine, low left scroll and elevated far-right tip, approximate ornament silhouette and edge margins. The large empty area ABOVE the thin bottom ornament must remain genuinely transparent, as must all holes between filigree strands. Highly detailed realistic 3D sculpted metal with crisp edge highlights and fine embossed texture at game-UI scale. Restrict ornament to the same position and extent as Image 1 so it can replace that image without moving controls. No text, no numbers, no resource symbols, no additional gems or sockets, no UI windows, no health orb, no characters, no opaque background, no ground or drop-shadow plane. Render a single production PNG asset on actual alpha, not a checkerboard. Keep the wide horizontal aspect ratio, approximately 2048 by 683.

### ranger

Use case: precise-object-edit. Asset type: transparent dark-fantasy game HUD ornamental strip below resource icons. Image 1 is the edit target; Image 2 is ONLY a materials/style reference, do not reproduce the person or orb. Edit Image 1 into antique bronze and warm pale gold, fine intertwined woody vines and graceful small muted green oak leaves, matching the ranger's natural elven orb frame. Preserve Image 1's very wide 3:1 canvas, exact low horizontal undulating spine, low left scroll and elevated far-right tip, approximate ornament silhouette and edge margins. The large empty area ABOVE the thin bottom ornament must remain genuinely transparent, as must all holes between filigree strands. Highly detailed realistic 3D sculpted metal with crisp edge highlights and fine embossed texture at game-UI scale. Restrict ornament to the same position and extent as Image 1 so it can replace that image without moving controls. No text, no numbers, no resource symbols, no additional gems or sockets, no UI windows, no health orb, no characters, no opaque background, no ground or drop-shadow plane. Render a single production PNG asset on actual alpha, not a checkerboard. Keep the wide horizontal aspect ratio, approximately 2048 by 683.

### sorcerer

Use case: precise-object-edit. Asset type: transparent dark-fantasy game HUD ornamental strip below resource icons. Image 1 is the edit target; Image 2 is ONLY a materials/style reference, do not reproduce the person or orb. Edit Image 1 into dark silver-black metal with pale antique-gold bevels and restrained purple enamel flowing through elegant arcane scrollwork, matching the sorceress's orb frame. Preserve Image 1's very wide 3:1 canvas, exact low horizontal undulating spine, low left scroll and elevated far-right tip, approximate ornament silhouette and edge margins. The large empty area ABOVE the thin bottom ornament must remain genuinely transparent, as must all holes between filigree strands. Highly detailed realistic 3D sculpted metal with crisp edge highlights and fine embossed texture at game-UI scale. Restrict ornament to the same position and extent as Image 1 so it can replace that image without moving controls. No text, no numbers, no resource symbols, no additional gems or sockets, no UI windows, no health orb, no characters, no opaque background, no ground or drop-shadow plane. Render a single production PNG asset on actual alpha, not a checkerboard. Keep the wide horizontal aspect ratio, approximately 2048 by 683.
Prompt provenance: built-in image generation; no fallback image service used.
