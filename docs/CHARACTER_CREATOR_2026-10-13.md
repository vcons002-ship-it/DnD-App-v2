# Guided character creator

The player character-selection screen now offers **Create a character** alongside
the existing quick form and saved-character library. It opens a responsive
charcoal-and-gold dialog with five steps and a live character preview.

1. **Identity:** name, one of the twelve core classes, and one of ten species.
2. **Abilities:** recommended standard array with score swapping, or 27-point buy;
   a named custom background, +2/+1 or three +1 increases, and origin feats.
3. **Equipment & skills:** curated class loadouts, two background skills, class
   skill selections, additional Human/Skilled proficiencies, and class choices
   including orders, expertise, fighting styles, invocations, and weapon masteries.
4. **Spells:** useful suggested cantrips and first-level spells, searchable and
   replaceable. Wizards choose six spellbook spells and prepare four. Rangers also
   get the catalog's always-prepared Hunter's Mark.
5. **Review:** inspect the sheet and choose **Create & play**. Creation claims the
   character for that player; token placement uses the existing Place token flow.

## Scope

This is a level-one starter creator. It uses the existing 2024 class progression,
spell catalog, species traits, and leveling system. It does not represent a full
PHB character builder: origins are explicit custom backgrounds, the initial feat
selection is Tough/Alert/Savage Attacker/Skilled, and equipment is labeled as
curated starter kits rather than official starting-equipment packages. Ancestry,
lineage, language, and other situational details can be completed with the DM on
the sheet. The creator retains existing combat support for class features; it
does not add new automation for every invocation or fighting style.

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

Final checks: typecheck and production build passed; 203 regression files / 2,180
tests passed, including 18 creator tests; all four real-browser creator scenarios
passed. The production build retains its existing large-chunk warnings.

[Desktop preview](https://dnd.nic024i.app/uploads/previews/character-creator-20261013/creator-desktop.png)
· [Mobile review](https://dnd.nic024i.app/uploads/previews/character-creator-20261013/creator-mobile-review.png)
· [Short walkthrough](https://dnd.nic024i.app/uploads/previews/character-creator-20261013/character-creator-mobile.mp4)
