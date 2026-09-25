# Campaign presets promoted to the shared library

Eighteen existing campaign creature presets were copied into the shared library,
bringing the live total from 38 to 56. These retain campaign stats, not replacement
SRD stat blocks. Duplicate selection uses highest maximum HP, then prefers a
campaign template when HP ties. Numbered placement suffixes are removed.

| Library entry | Maximum HP |
| --- | ---: |
| Stone Golem | 133 |
| Werebear | 135 |
| Archmage | 60 |
| Skeleton Warrior | 20 |
| Goblin Crossbowman | 7 |
| Guard Captain | 45 |
| Elite Castle Guard | 85 |
| Mage Guard | 20 |
| Sailor | 10 |
| Sailor Marine | 16 |
| Rebel Fighter | 45 |
| Rebel Mage | 35 |
| Dwarf Barbarian | 50 |
| Tattered Cloak Rebel | 25 |
| Varro - The Herald | 125 |
| Ingmar - Tattered Cloak Leader | 55 |
| Omarion - Tattered Cloak Lieutenant | 35 |
| CAPT Long Jahn | 30 |

The differing versions selected were Stone Golem 133 rather than 75 HP,
Skeleton Warrior 20 rather than 15 HP, and Elite Castle Guard 85 rather than
50 HP. Stats, AC, movement, weapons, abilities, rollable sheet abilities,
resistances, weaknesses, icon and appearance are preserved. New sheet ability
IDs avoid sharing identity with campaign entries. Current HP, temporary HP,
conditions, map positions, reveal state and encounter tracking are not library
preset fields and were not copied.

Goblin Crossbowman uses a dedicated `goblin-crossbowman` physical family with a
readied light crossbow, Small rule size and the same compact visual base as a
normal goblin. It is selectable explicitly and inferred by exact creature name.
Its image-API reference sheet feeds four separate views to Hunyuan, followed by
the standard 20k/JPEG95 reduction and fitted base. The mixed-weapon guards and
fighters keep their existing families and both melee and ranged attacks.

This is a one-time live library import, not a universal starter-library seed.
Private source IDs, before/after backups and full campaign data stay local under
`.preview-data/campaign-library-import/`. The older running REST handler saves
the sheets but omits appearance fields; those were preserved in the existing
library appearance columns and verified directly. The new model family becomes
available in the running app after the normal stable update.

Import verification compared all copied stats/attack/ability fields and confirmed
that the original 38 library entries and all campaign monster records were unchanged.

The final model is 1,666,640 bytes with 20,678 triangles including its base and
a 2048px JPEG95 texture. TypeScript checks, 672 tests, production build with
GLB/hash validation and browser loading of every family in overhead/tilted
views passed. The bundled catalog now has 38 physical families.
