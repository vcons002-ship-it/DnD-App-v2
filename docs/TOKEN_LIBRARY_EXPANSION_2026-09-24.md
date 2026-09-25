# Creature completeness and common token expansion

The live maintenance audit covered 335 campaign monster/template records and
23 shared library entries. Nineteen campaign records were objects or utility
effects (including Mage Hand and the boat marker), not combat creatures.

195 campaign records required a repair: missing ability scores, AC, movement,
attacks, missing weapon dice/bonuses, or older damage fields containing prose
such as `1d8+2 slashing damage`. The Cultist library entry also needed scores
and attacks. A second audit found no remaining core stat/attack gaps among the
316 creature records or existing library creatures. Current, maximum and
temporary HP were compared before/after and did not change. Existing valid
scores, AC, custom attacks, names, art, positions and encounter state were kept.

Sources were completed campaign copies of the same creature first, preferring
the linked template, same session and closest existing HP. Standard stat blocks
provided remaining gaps. Empty custom NPCs use explicit role baselines, not a
claim that their custom names have official stat blocks:

| Custom role | Baseline for missing fields |
| --- | --- |
| nilboG | Goblin |
| Blood thirsty orc fighter | Orc |
| First / CAPT Long Jahn | Bandit Captain (pirate role) |
| Human, elf, dwarf and tiefling civilian/slave NPCs; Scholar | Commoner |
| Young Treant | Treant, retaining existing HP |
| Spectral Visitor | Ghost, retaining existing HP |
| Omarion - Tattered Cloak Lieutenant | Bandit Captain |
| Tattered Cloak Mage | Mage |
| Large Constricting Snake | Existing copy plus Constrictor Snake attack dice |

Private before/after snapshots are retained locally; campaign IDs, session codes,
credentials and campaign data are not part of the asset package. Repairs were
applied through authenticated application updates and verified by rereading.

## New shared library entries

| Creature | CR | HP | AC | Size | Physical family |
| --- | ---: | ---: | ---: | --- | --- |
| Bugbear | 1 | 27 | 16 | Medium | bugbear (new) |
| Gnoll | 1/2 | 22 | 15 | Medium | gnoll (new) |
| Owlbear | 3 | 59 | 13 | Large | owlbear (new) |
| Brown Bear | 1 | 34 | 11 | Large | brown-bear (new) |
| Commoner | 0 | 4 | 10 | Medium | human-commoner |
| Bandit Captain | 2 | 65 | 15 | Medium | human-bandit |
| Mage | 6 | 40 | 12 | Medium | human-mage |
| Treant | 9 | 138 | 16 | Huge | treant |

Rules use the 2014/SRD 5.1 baseline already used by the library, including the
[NPC stat blocks](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters),
[Mage](https://www.dndbeyond.com/monsters/16947-mage), and
[Treant](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monster-stat-blocks-t).
Model equipment is cosmetic; rollable attacks come from each creature's sheet.
Mage spell slots, concentration and pre-cast Mage Armor remain DM-managed.

New families use image API reference sheets, four separately named Hunyuan
multi-view inputs, the accepted 20k/JPEG95 reduction policy and fitted round
bases. The first Owlbear sheet incorrectly depicted a humanoid; that attempt
was rejected and replaced with a natural animal form. Reference generation now
distinguishes animals from humanoid equipment users. Sources and receipts live
under `assets/miniatures/monster-provenance/<family>/`.

`starter-common-creatures-v1` adds the eight entries once.
`library-stat-completeness-v1` fills missing known library fields and omitted
appearance metadata from older servers. Neither restores previously deleted
old entries, replaces edited scores/HP, or changes an explicit 2D-only choice.
The campaign repairs are this maintenance operation, not an automatic rewrite
of campaign NPCs on future startups.

## Final assets and validation

| New family | Packaged bytes | Triangles including base |
| --- | ---: | ---: |
| Bugbear | 1,823,696 | 20,744 |
| Gnoll | 1,892,316 | 20,764 |
| Owlbear | 1,828,964 | 20,647 |
| Brown Bear | 1,729,616 | 20,744 |

All four retain 2048px textures encoded as JPEG95. Their combined runtime size
is 7,274,592 bytes. The catalog now has 34 creature families; the library has
31 entries. Other existing campaign-specific templates remain in their campaigns.

Validation: TypeScript checks, 669 server tests, production build with asset
hash/GLB validation, and the browser test loading every family plus the three
player models in overhead and tilted battlefield views passed. Final live data
comparison confirmed 195 changed records and zero health changes.

Stats repairs and the eight library entries are already saved in the live data.
The new bundled model families and startup migrations are development code;
they require the usual stable update before appearing in the running install.
