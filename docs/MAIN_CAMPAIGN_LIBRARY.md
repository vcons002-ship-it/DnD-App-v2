# Main campaign shared library coverage

The main campaign is identified by its Slorith Map, Cormyr City and Tattered Cloak maps, not its non-unique “New Campaign” display name. This audit excludes the other five campaigns.

All 262 creature/object records map to 41 reusable presets: 17 already existed and 24 were saved, bringing the shared creature/object library to 80 entries. Numbered copies share a preset. The highest maximum-HP version supplies the full stat block; ties prefer a campaign template. Standard Guard, Treant and Giant Spider entries are preserved beside separately named campaign variants. Duplicate rowboat art shares one preset; different boat/scenery art receives descriptive names.

Varis was added to the character library; Druk and Vanec were already saved. Encounter state, current HP, fog, positions and initiative are not copied into creature presets.

| Saved preset | Max HP | 3D family | Import |
| --- | ---: | --- | --- |
| Archmage | 60 | human-mage | Existing |
| blood thirsty orc fighter | 25 | orc | Added |
| blood thirsty orc with sword | 22 | orc-swordsman | Added |
| CAPT Long Jahn | 30 | pirate-captain | Existing |
| Castle Staff | 15 | human-commoner | Added |
| city guardsmen | 25 | human-guard | Added |
| City Map Tile | 1 | 2D object | Added |
| Dwarf Slave | 35 | dwarf-commoner | Added |
| Elf Slave | 15 | elf-commoner | Added |
| Elite Castle Guard | 85 | human-guard | Existing |
| FIRST | 40 | pirate-first-mate | Added |
| Giant Spider (Main Campaign) | 26 | spider | Added |
| Guard (Main Campaign) | 35 | human-guard | Added |
| Guard Captain | 45 | human-guard | Existing |
| Human slave | 10 | human-commoner | Added |
| Ingmar - Tattered Cloak Leader | 55 | tattered-cloak-leader | Existing |
| Large Constricting Snake | 25 | snake | Added |
| Mage Guard | 20 | human-mage | Existing |
| Mage Hand | 1 | mage-hand | Existing |
| Medium sized boat token | 10 | 2D object | Added |
| Omarion - Tattered Cloak Lieutenant | 35 | tattered-cloak-lieutenant | Existing |
| orc fighter with an axe | 35 | orc | Added |
| Rebel Fighter | 45 | human-bandit | Existing |
| Rebel Mage | 35 | human-mage | Existing |
| Rowboat | 1 | 2D object | Added |
| Rowboat (Illustrated) | 1 | 2D object | Added |
| Sailor | 10 | human-commoner | Existing |
| sailor marine | 16 | human-bandit | Existing |
| Scholar | 125 | scholar | Added |
| Skeleton Warrior | 20 | skeleton | Existing |
| Spectral Visitor | 125 | spectral-visitor | Added |
| Stone Golem | 133 | stone-golem | Existing |
| Tattered Cloak - Rebel Leader | 85 | tattered-cloak-leader | Added |
| Tattered Cloak Mage | 125 | tattered-cloak-mage | Added |
| Tattered Cloak Rebel | 25 | human-bandit | Existing |
| Tiefling Slave | 20 | tiefling-commoner | Added |
| Treant (Main Campaign) | 138 | treant | Added |
| Varro - The Herald | 125 | royal-archmage | Existing |
| Werebear | 135 | werebear | Existing |
| Wooden Boat Deck | 1 | 2D object | Added |
| Young Treant | 165 | young-treant | Added |

## Asset production

Nine new families use image-API 2048px turnaround sheets split into front/back/left/right images. All four named views feed Hunyuan. The standard reduction targets 20k body triangles, 2048px JPEG95 textures, and fitted circular pewter bases. Source views and generation/reduction/preparation receipts are checked in under assets/miniatures/monster-provenance. Boats and the city map tile remain 2D scenery, and Varro retains the existing royal-archmage model.

Model-family assignments target the main campaign and its corresponding saved presets only. Other campaigns and combat stats remain untouched.

## Library fixes

Library saves now preserve object kind and interaction DC through REST, search, both creation panels and monster creation. The full library view returns up to 1,000 entries instead of truncating at 50; search/typeahead limits are unchanged. Selecting a creature preset clears a previously selected object type.

Private database backups, source IDs, import plans and field-level receipts remain under .preview-data/main-library-import. The older running REST handler omits appearance/object metadata, so the import preserved those fields in SQLite after authenticated saves. Newly bundled models and UI fixes require the normal stable update; the library records are already saved live.

The preparation step also removes small disconnected fragments well outside the main body bounds, preserving the source mesh. This cleaned an outlying fragment on the lieutenant without rebuilding its texture or main geometry.

## Delivered model sizes

| Family | Bytes | Triangles including base |
| --- | ---: | ---: |
| pirate-first-mate | 1,561,548 | 20,764 |
| pirate-captain | 1,870,104 | 20,760 |
| tattered-cloak-leader | 1,415,956 | 20,764 |
| tattered-cloak-lieutenant | 1,504,476 | 20,644 |
| scholar | 1,570,696 | 20,710 |
| spectral-visitor | 1,414,436 | 20,706 |
| tattered-cloak-mage | 1,562,508 | 20,698 |
| young-treant | 1,802,600 | 20,742 |
| orc-swordsman | 1,823,716 | 20,764 |

Total new runtime model storage: 14.53 MB across nine files. There are now 47 bundled physical families, plus the existing appearance variants and three PC models. Ten saved presets and 22 main-campaign creature records were assigned these nine families; other campaign fields were verified unchanged.

Validation passed: typechecking, 673 unit tests across 74 files, production build with GLB/hash checks, and browser loading of all 47 families plus the three PCs in overhead and tilted views. Live library search found all 41 presets; stat/attack completeness checks reported no gaps.

Subsequent role-specific family upgrades and the current full library mapping are documented in [SPECIALIST_LIBRARY_MODELS.md](SPECIALIST_LIBRARY_MODELS.md) and [TOKEN_LIBRARY_FAMILIES.md](TOKEN_LIBRARY_FAMILIES.md).
