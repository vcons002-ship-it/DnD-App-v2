# Common token expansion: second batch

Seven additions bring the starter library to 38 entries. Stats follow the same
2014/SRD 5.1 rules as the existing library; each creature has six ability scores,
HP, AC, speed and rollable attacks. Model equipment remains cosmetic.

| Token | CR | HP | AC | Size | Model family |
| --- | ---: | ---: | ---: | --- | --- |
| Ogre | 2 | 59 | 11 | Large | ogre, new |
| Ghoul | 1 | 22 | 12 | Medium | ghoul, new |
| Giant Bat | 1/4 | 22 | 13 | Large | giant-bat, new |
| Black Bear | 1/2 | 19 | 11 | Medium | brown-bear, black tag |
| Giant Wolf Spider | 1/4 | 11 | 13 | Medium | spider |
| Scout | 1/2 | 16 | 13 | Medium | human-bandit |
| Veteran | 3 | 58 | 17 | Medium | human-guard |

New reference sheets use the configured image API and four separately named
Hunyuan multiview inputs. Models use the accepted 20k triangle/JPEG95 workflow
and fitted round bases. Sources and generation/reduction receipts are retained
under `assets/miniatures/monster-provenance/<family>/`.

The Ghoul exposed a stray mesh island below the body that displaced the fitted
base. Base preparation now removes small islands below the main body's floor
before measuring the footprint. The Ghoul was repackaged and visually checked
on its centered base; its original generated source is preserved.

The `starter-common-creatures-v2` seed runs once, preserves existing entries,
and fills omitted appearance metadata from the older live server. Existing
explicit 2D-only or custom model choices survive. Deleting a seeded entry does
not cause it to reappear on subsequent restarts.

Black Bear deliberately uses automatic color with `black` in its appearance
tags. Explicit Natural or another dropdown color overrides tags. The current
black palette is a multiplicative tint, darkened from `#777777` to `#333333`
after the first in-game preview. It produces near-black fur with subtle warm
highlights while retaining the original texture. Pewter
base materials are excluded. The preview compares identical-sized brown-bear
models to isolate color; the library Black Bear itself is Medium, while Brown
Bear is Large.

Sources: [2014 NPCs, Scout and Veteran](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters),
[Black Bear](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monster-stat-blocks-b),
and [Giant Wolf Spider](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monster-stat-blocks-g).

## Packaged assets and checks

| Family | Bytes | Triangles including fitted base |
| --- | ---: | ---: |
| Ogre | 1,600,080 | 20,720 |
| Ghoul | 1,526,148 | 20,628 |
| Giant Bat | 1,521,028 | 20,760 |

The three new models total 4,647,256 bytes and retain 2048px JPEG95 textures.
The bundled catalog now contains 37 families. TypeScript, 671 server tests,
production build and GLB/hash validation passed. Browser checks cover the bear
comparison and loading every family in overhead and tilted views.

All seven additions are saved to the live library (38 entries, no core stat or
attack gaps). New model families and darker black tint are development changes
and take effect in the live install after the normal merge/update.
