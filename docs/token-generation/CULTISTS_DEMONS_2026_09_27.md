# Cultist and demon library expansion

Adds five shared-library templates and four new physical model families.

| Template | Family | CR | HP | AC | Combat space |
| --- | --- | --- | --- | --- | --- |
| Cultist Swordsman | cultist (reused) | 1/8 | 9 | 14 | Medium, 5 ft. |
| Cultist Fanatic | cultist-fanatic | 2 | 44 | 13 | Medium, 5 ft. |
| Vrock | vrock | 6 | 152 | 15 | Large, 10 ft. |
| Hezrou | hezrou | 8 | 157 | 18 | Large, 10 ft. |
| Glabrezu | glabrezu | 9 | 189 | 17 | Large, 10 ft. |

The Swordsman is explicitly a library equipment variant of the SRD 5.1 Cultist:
the existing scimitar-and-shield model is reused, and a shield adds 2 to AC.
The other four use SRD 5.2.1. Existing Cultist statistics and appearances are not
changed. The earlier Shadow, Mummy, Quasit and Dretch batch remains included.

## Rules and automatic behavior

All templates include six ability scores, CR, HP, AC, speed, attacks, equipment
or natural weapons, senses, languages and applicable damage traits. Their names
resolve to the selected physical families; the DM can still override the family,
color or size. `natural` preserves the authored texture; visual tags add no rules.
The three Large demons retain 10-foot combat spaces with smaller visible bases.

Pact Blade rolls slashing plus necrotic; Shred and Rend roll their primary type
plus poison. Spiritual Weapon has a +4 attack and 1d8+2 force damage. Pummel is a
DC 17 DEX save for 3d6+5 bludgeoning (half on success). Stunning Screech offers
DC 15 CON saves for 3d6 thunder (no damage on success); its demon exemption must
be applied by the DM. Spore damage is a separate ongoing-damage button.

Condition riders, special save proficiencies, Magic Resistance, daily uses,
recharge, concentration, spectral-weapon placement and multiattack sequencing
remain DM-managed and are described on the token. Descriptive Multiattack,
Confusion and Spores entries deliberately avoid inferred immediate damage rolls.
This batch adds content without introducing new combat-engine automation.

`starter-cultists-demons-v1` seeds missing names once. Existing DM-authored copies
are preserved, and deleting one of these starters does not restore it on restart.
No existing campaign instance is converted.

## Source art and production

Built-in image generation produced four separate four-view sheets, with simple
equipment and ready poses. Each sheet contains only one creature. Prompts and
source images are archived under `assets/miniatures/monster-provenance/<family>`.
The requested sheet size was 2048 square; actual returned sheets are 1254 square,
and cropped named views are 619 square without upscaling. Side inputs are assigned
from their visible direction rather than assumed panel labels.

Hunyuan3D-2mv shape generation and Hunyuan3D-2 texture generation both use the
four named front/back/left/right inputs. Receipts verify the actual checkpoint
and the named texture references. Settings: 50 steps, guidance 5.5, octree 512,
10,000 chunks, seeds 927201-927204.

The accepted `monster-reduction-v1` process targets 20k body triangles with a
0.01 error limit, then compresses opaque color atlases with JPEG95 4:4:4 while
retaining their 2048-square dimensions. Blender removes disconnected specks and
fits a circular base. Packaging restores the compressed texture bytes and checks
the GLB geometry and hashes. The battlefield uses its common raised pewter base,
affinity border, fog visibility, base-only clicking and facing behavior.

## Verification

Server tests cover fresh additions, preserving edits, restart idempotence,
deletions, family selection, combat size, typed damage riders and the absence of
duplicate or unintended damage buttons. The browser scenario retrieves all five
from the actual shared-library API and places their real models beside the party
in both tilted and overhead views. Model validation checks the bundled GLBs,
embedded images, byte counts, triangle counts and SHA-256 hashes.

Rules sources: [SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)
and the project's existing SRD 5.1 Cultist. Required attribution is in README.md.
