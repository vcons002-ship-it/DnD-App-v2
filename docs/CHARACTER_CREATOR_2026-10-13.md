# Guided character creator

The player character-selection screen now offers **Create a character** alongside
the existing quick form and saved-character library. It opens a responsive
charcoal-and-gold dialog with six steps and a live character preview.

1. **Identity:** name, race (species) near the top, and one of the twelve core classes.
2. **Abilities:** recommended standard array with score swapping, 27-point buy,
   or manual 4d6-drop-lowest rolls;
   a named custom background, +2/+1 or three +1 increases, and origin feats.
3. **Equipment & skills:** 2024 class equipment packages or their gold alternative,
   priced equipment purchases, worn armor and shield, two background skills, class
   skill selections, additional Human/Skilled proficiencies, and class choices
   including orders, expertise, fighting styles, invocations, and weapon masteries.
4. **Spells:** useful suggested cantrips and first-level spells, searchable and
   replaceable. Wizards choose six spellbook spells and prepare four. Rangers also
   get the catalog's always-prepared Hunter's Mark.
5. **Appearance:** describe the hero, select the weapon the miniature holds from
   chosen equipment (or Unarmed), and optionally enable personal token crafting.
6. **Review:** inspect the sheet and choose **Create & play** or **Create & craft token**. Creation claims the
   character for that player; token placement uses the existing Place token flow.

## Scope

This is a level-one starter creator. It uses the existing 2024 class progression,
spell catalog, species traits, and leveling system. It does not represent a full
PHB character builder: origins are explicit custom backgrounds, the initial feat
selection is Tough/Alert/Savage Attacker/Skilled. Class equipment now follows
the 2024 Free Rules packages; custom backgrounds take the 50-GP alternative. Ancestry,
lineage, language, and other situational details can be completed with the DM on
the sheet. The creator retains existing combat support for class features; it
does not add new automation for every invocation or fighting style.

## Rolled stats (14 October update)

**Roll for stats** exposes six separate **Roll STR**, **Roll DEX**, etc. buttons.
Each click tosses four dice through the existing live server-physics tray and
returns to the creator. Nothing automatically advances to the next ability.
The result cards strike out exactly one lowest die, including tied-lowest rolls.
Each completed ability is retained as the player rolls the others.

**Roll all** is an option at the top. It tosses 24 dice simultaneously and groups
them into six sets of four. Choosing it after individual rolls starts a new set,
as the button explicitly says. Completed scores can be swapped between abilities,
or arranged with **Suggest assignment**. Background bonuses are added afterward.

The server durably stores partial and completed sets, scoped to session and
player. Retrying a lost response recovers the same ability without rolling it
again. Creation checks all six submitted scores against that stored pool; client
supplied dice faces cannot replace it. Base rolled scores can be 3–18, rather
than the 8–15 limit used for point buy/standard-array assignment.

Ability generation and first-level HP follow the
[official 2024 character-creation rules](https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character).
HP and AC are calculated from the selected scores, armor, shield, unarmored
defense, Defense style, Tough, and Dwarven Toughness as applicable. Weapons retain
dice-only expressions and derive their attack/damage modifiers from live scores.

## Persistence and validation

`character:createGuided` validates choices on the server, builds the actual sheet
from local catalogs, and returns its ID by acknowledgement. The sheet has weapons,
inventory, saving-throw and skill proficiencies, species/class abilities, resources,
spell slots, and a 2024 level-one class roster. No existing character is migrated.

A small idempotency table links session/player/request IDs to the created sheet.
Retrying a lost acknowledgement recovers the same character, including after a
server restart. The dialog preserves its draft across close/reopen in the same
selection screen and keeps choices after a connection failure.

## Verification

- Server tests cover all twelve classes, array/point-buy validation, illegal spell
  and skill choices, retry safety, prepared-spell limits, unarmored defense,
  Tough, and continuation through the existing level-up guide.
- Real Chrome tests cover creating/claiming/placing a fighter, a mobile wizard's
  prepared spellbook, draft retention, focus restoration, invalid socket input,
  and desktop/mobile layout.
- Tests use disposable campaigns and data directories. The installed campaign
  and server are not updated by this implementation.
- The demonstration uses Windows Graphics Capture with RTX 5090 NVENC AV1;
  a separate H.264 copy supports mobile playback.

Final checks: typecheck and production build passed; 206 regression files / 2,195
tests passed, including 23 creator tests and upload permission/model checks; all six real-browser creator scenarios
passed. The production build retains its existing large-chunk warnings.

[Desktop preview](https://dnd.nic024i.app/uploads/previews/character-creator-20261013/creator-desktop.png)
· [Mobile review](https://dnd.nic024i.app/uploads/previews/character-creator-20261013/creator-mobile-review.png)
· [Short walkthrough](https://dnd.nic024i.app/uploads/previews/character-creator-20261013/character-creator-mobile.mp4)

[Manual rolls and Roll all video](https://dnd.nic024i.app/uploads/previews/character-creator-stats-20261014/stat-rolls-mobile.mp4)
· [Rolled scores](https://dnd.nic024i.app/uploads/previews/character-creator-stats-20261014/creator-rolled-stats.png)
· [Race selection](https://dnd.nic024i.app/uploads/previews/character-creator-stats-20261014/creator-desktop.png)

## Personal token crafting (14 October update)

The optional Appearance step gathers up to 600 characters describing the hero.
The server combines that description with the saved species/race, class, weapons,
and clothing/armor inventory. It snapshots the brief when the job is queued;
retries and later sheet edits do not silently change the reference art.

**Create & craft token** creates/claims the character immediately and submits a
character-specific job to the existing durable asset queue. The production path
prefers the configured Gemini image API, retaining the established ComfyUI backup
and connection retries. It generates a 2K four-view turnaround, then passes its
front/back/left/right references through the existing Hunyuan shape and verified
multi-view texture workflow. Geometry reduction, texture compression, base fitting,
validation, and publication are the same stages used for creature models.

The front reference is published as playable 2D art before 3D reconstruction.
On completion, the generated model is automatically attached by character/model
ID, rather than matching the character name. Catalog and character updates reach
players and DMs; map preload and sizing controls resolve the custom model too.
Existing campaign miniatures are unchanged. Personal bindings and descriptions
survive saved-library export/import and server restarts.

The editable character sheet includes **Personal token & miniature**, with
progress, appearance editing, new crafting, and retries. Only the owning player
or DM can access a character's job or request a craft. The DM can resume a paused
queue there; players can retry their own job without changing shared queue controls.
Failure leaves the character and any completed 2D art usable.

Verification covers queueing from the real browser, ownership gates, immutable
briefs, distinct models for same-named heroes, 2D publication before 3D, model
attachment, failure/retry, restart recovery, catalog resolution, and library
persistence. Production completion/attachment tests use a controlled producer;
this implementation pass did not spend an image request or generate a new live
Hunyuan model. Browser tests deliberately use offline AI/3D endpoints.


## 2024 equipment and held weapons

Source: [2024 Free Rules class starting equipment](https://www.dndbeyond.com/sources/dnd/br-2024/character-classes)
and [background equipment alternatives](https://www.dndbeyond.com/sources/dnd/br-2024/character-origins).
All twelve core classes offer their published equipment package and gold alternative;
Fighter also has its second package. Weapons appear once per attack type; carried
quantities (such as eight javelins or twenty arrows) are saved in inventory. The
correct armor, packs, focuses, class gold and background gold are saved before
crafting. Bard and Monk packages expose their instrument/tool choice. The creator
now has a searchable **Buy starting equipment** list for spending class or background
gold before creation, using published 2024 prices calculated in integer copper.
It saves quantities, remaining gold and one canonical attack per weapon type.
Worn armor and an equipped shield determine the starting AC; armor Strength
requirements adjust the starting speed, and Stealth disadvantage is noted on
the armor's inventory entry. Weapons and armor are limited to class training,
including Protector/Warden choices. These are baseline sheet values, as in the
existing equipment system; later equipment edits remain on the sheet.
Stow an equipped shield before choosing a two-handed weapon for token crafting.
Fractional GP from copper/silver-priced purchases survive creation and purse edits.
The full inventory, armor, remaining gold and chosen spells appear in Review.
Custom-background traits remain the creator's existing
custom choices; this update does not add every published background.

Appearance requires a **Weapon held by your token** choice when crafting is on.
Weapons from the selected package and purchases, plus Unarmed, are offered. Class/loadout
changes clear that choice. The server validates it and snapshots it into the
image-generation brief, explicitly stowing the other weapons. Sheet regeneration
has the same choice based on the current weapons. Combat still offers all weapons;
the art choice does not change attacks, ammunition or stats.

## Uploading personal GLB models

- Player: own **Character record > Personal token & miniature > Upload your own
  3D miniature**.
- DM, character: the editable character sheet, in the same section.
- DM, creature: **3D model** during creation/placement, or token information's
  **3D appearance** controls, then **Upload your own 3D miniature**.

Choose one static GLB with embedded PNG/JPEG/WebP textures, at most 25 MB. Y-up is
standard; Z-up exports have an explicit option. If it already has a round base,
check the base option; otherwise preparation adds a dark pewter circular base.
The host fits floor contact and base center, retains texture resolution, and uses
the established 20k-triangle / .01-error simplification policy for large meshes.
Prepared output must fit 60k triangles and 12 MB; unsuitable models get a readable
error and the current miniature stays available. Draco, external assets,
animations/skins and multi-scene exports require a static self-contained export.

Uploads are bound to the selected character/creature, persisted in the existing
asset catalog, and use normal visibility, facing, clicking, tinting and sizing.
Players need a live session credential and may upload only to their currently
claimed character. Creature uploads require the DM. Permission is checked again
before publication. Interrupted network connections can retry through the same
control. An older crafting job cannot replace a newer uploaded model.

Files live in the host's `server/uploads/miniatures`, with catalog metadata under
`server/data/asset-production`; preserve both when moving the installation.
These are local-host assets, not Cloudflare storage. Existing named campaign
models are unchanged. A real Chrome test uploaded the existing textured Varis
battlefield GLB into a disposable character, verified the model URL loaded on the
map and kept sheet stats/weapons intact. The prepared model was 11.12 MiB / 30,984
triangles. Backend tests cover DM uploads for both subjects, denied player creature
uploads, stale credentials, retained models after invalid files, floor contact,
base fitting and restart recovery. No new paid image/3D request was required.


[Held-weapon choice](https://dnd.nic024i.app/uploads/previews/character-equipment-uploads-20261014/held-weapon-choice.png)
| [Model upload controls](https://dnd.nic024i.app/uploads/previews/character-equipment-uploads-20261014/model-upload-controls.png)
| [Uploaded model on the map](https://dnd.nic024i.app/uploads/previews/character-equipment-uploads-20261014/uploaded-model-on-map.png)
