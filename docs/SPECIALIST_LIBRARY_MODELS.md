# Specific creature families and legacy appearance repair

The live shared library audit found 17 blank model-family fields. Older REST saves had omitted appearance metadata after the previous one-time seed/repair markers had already been set. Eleven names could infer an existing model; six fell back to 2D.

This change repairs the saved assignments and adds explicit name aliases so old blank imports still resolve correctly. A separate one-time upgrade handles already-seeded installations. It updates appearance columns only, preserves custom families and explicit 2D-only selections, does not recreate deleted entries, and restores default tags only when none were saved. Existing tag-driven colors are preserved.

## New models

| Family | Appearance / equipment |
| --- | --- |
| cultist | Hooded burgundy ritual robes, raised scimitar |
| scout | Green leather armor, readied longbow |
| veteran | Seasoned armored soldier, raised longsword |
| bandit-captain | Brigandine and leather coat, raised scimitar, belt dagger |
| archmage | Ornate violet/gold robes, crystal staff |
| sailor | Cream shirt and blue sash, raised scimitar |
| sailor-marine | Navy coat and breastplate, readied light crossbow |
| elite-castle-guard | Plate armor and closed helmet, readied glaive |

Guard Captain shares the new Veteran family. Pirate First Mate now uses the existing pirate-first-mate model; Rebel Mage uses tattered-cloak-mage. Ordinary Commoner, Mage, Guard, racial commoners and appropriate animal variants keep their matching existing families.

Each new model uses image-API four-view art, named front/back/left/right Hunyuan inputs, 20k body geometry, 2048px JPEG95 textures and a fitted pewter base. Original art and production receipts are retained.

## Library assignments repaired or upgraded

| Preset | Family |
| --- | --- |
| Archmage | archmage |
| Bandit Captain | bandit-captain |
| Black Bear | brown-bear |
| Brown Bear | brown-bear |
| Bugbear | bugbear |
| Commoner | human-commoner |
| Cultist | cultist |
| Elite Castle Guard | elite-castle-guard |
| Ghoul | ghoul |
| Giant Bat | giant-bat |
| Giant Wolf Spider | spider |
| Gnoll | gnoll |
| Guard Captain | veteran |
| Imp | imp |
| Mage | human-mage |
| Ogre | ogre |
| Owlbear | owlbear |
| Pirate First Mate | pirate-first-mate |
| Rebel Mage | tattered-cloak-mage |
| Sailor | sailor |
| Sailor Marine | sailor-marine |
| Scout | scout |
| Treant | treant |
| Veteran | veteran |

Live data updates are confined to the shared library and matching records in the main campaign identified by Slorith Map. Private backups and field-level verification remain under .preview-data/specialist-models. No combat stats, art, positions or other campaigns are changed. The new bundled models require the app version containing these assets.

## Delivery and validation

Updated 24 library records and 42 matching main-campaign records. All 80 saved creature/object presets now have an explicit family or the intentional none value; no blanks remain.

| Model | Bytes | Triangles including base |
| --- | ---: | ---: |
| cultist | 1,626,632 | 20,764 |
| scout | 1,581,148 | 20,708 |
| veteran | 1,633,752 | 20,736 |
| bandit-captain | 1,430,280 | 20,606 |
| archmage | 1,748,236 | 20,742 |
| sailor | 1,422,088 | 20,698 |
| sailor-marine | 1,590,588 | 20,752 |
| elite-castle-guard | 1,636,512 | 20,764 |

Eight new runtime files total 12.67 MB. The catalog now has 55 physical creature families. A floating reconstruction fragment on Bandit Captain was removed without changing its source texture.

Validation: TypeScript checks and all 675 tests across 74 files passed. Production build verified all runtime asset hashes. The browser catalog test loaded every family successfully in overhead and tilted views. Live repair verified that stats, attacks, art, placement, and other campaigns remained unchanged.
