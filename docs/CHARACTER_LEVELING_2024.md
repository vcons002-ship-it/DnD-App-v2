# Character leveling (2024)

The DM grants one level from a character sheet. The player who has claimed that
character, or the DM, then completes the guide. Granting a level does not change
the sheet until **Apply level** is confirmed.

## At the table

1. The DM opens a character's sheet in the token inspector and clicks **Grant
   level N**. A pending grant is saved to the campaign.
2. The player opens **Character** (the button gains a small `+1` badge) and clicks
   **Continue level-up**. The DM can complete the same guide.
3. Choose the class that gains this level, then fixed HP or **Roll for HP**. Complete class and subclass choices, choose
   an ability improvement or feat when due, and select new spells when applicable.
4. **Preview level-up** asks the server to calculate the actual resulting sheet.
   Review HP, proficiency, ability scores, added abilities, slots, resources, and
   any instructions that still need the DM's attention.
5. **Apply level N** saves the advancement once. To grant multiple levels,
   complete each level in order so its choices become the next level's baseline.

At class level 3 the guide offers the 48 subclasses from the 2024 Player's Handbook.
An existing subclass is preserved. Missing base ability scores must be filled in
before granting a level. The DM can cancel a pending grant or use the existing
sheet editor for manual or homebrew advancement.

## Rules and calculations

Progression uses the 2024 tables for the 12 core classes, levels 1 through 20.
The tables specify Hit Dice, fixed HP, proficiency, feat levels (including the
Fighter's and Rogue's extra improvements), spell slots, prepared-spell
allowances, cantrips, and reviewed class resources.

- Fixed HP uses the class's fixed Hit Die result plus Constitution, minimum 1.
  Rolling uses the app's server-run live dice tray. One HP face is saved per
  grant; reloading or repeating the request reuses it. Once rolled, fixed HP is
  unavailable for that grant. The rolled die also locks the chosen class for
  that grant, so a Wizard HP roll cannot be reused for a Fighter level.
- A permanent Constitution modifier increase adjusts HP for all attained
  levels, including the new level. Equipped item bonuses are excluded from this
  permanent advancement calculation. Tough, the reviewed HP feats, and supported
  HP-granting subclass features are included in the preview.
- An ordinary ability improvement grants +2 to one score or +1 to two scores,
  capped at 20. Epic Boon ability increases cap at 30. The Barbarian and Monk
  level-20 ability increases use their specific cap of 25.
- Proficiency advances with total character level. Expertise created by the
  guide follows that proficiency increase. Explicit customized attack bonuses
  remain overrides and are flagged for review.
- Wizard additions enter the spellbook without automatically preparing them.
  Choose prepared spells in **Spellbook** afterward. The guide distinguishes
  spellbook additions from the prepared-spell allowance.

These calculations follow the official [gaining a level rules](https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character#GainingaLevel)
and [2024 class tables](https://www.dndbeyond.com/sources/dnd/br-2024/character-classes).

## Existing sheets and campaign safety

An old sheet is the baseline, not a character to rebuild. The database change
adds an empty leveling field to old rows; it does not automatically advance or
rewrite existing characters. The explicit guide opts a character into the 2024
progression display.

Leveling preserves a living character's wound deficit: if maximum HP increases
by 8, current HP also increases by 8. A character at 0 HP stays at 0; death saves,
conditions, and temporary HP remain unchanged. Leveling is not a rest. Spent Hit
Dice and resource uses remain spent, including Warlock Pact Magic uses when the
slot pool moves to a higher spell level.

Custom abilities, equipment, species bonuses, extra spells, and overridden
resource totals are preserved. The guide adds newly gained features without
duplicating an ability already present. A changed level, subclass, base score,
or feature definition makes a pending grant stale; cancel and re-grant after
the edit. Normal wounds, resource spending, and stance toggles do not invalidate
a grant.

The server validates all choices and ownership, previews inside a rolled-back
transaction, then applies the whole advancement atomically. A saved grant ID and
history make a repeated confirmation idempotent. Pending grants, recorded HP
faces, and applied history survive campaign saves and server restarts; unsubmitted
selection changes in the guide are not saved as a separate draft.

Character-library saves and JSON sheet copies retain permanent modifiers and
completed advancement history, explicit class levels, subclasses, and each
spell's class association. They do not transfer an unfinished grant or its
recorded HP roll to another character. Importing a sheet into a character with a
pending grant keeps the server's grant and existing completion records intact.

## Multiclassing

The level-up class chooser supports all 12 core 2024 classes. Existing classes
show their current level; new classes show whether the character qualifies and
the missing ability score prerequisites. Entering a new class requires scores
of 13 in the primary abilities of that class and all current classes. The
Fighter accepts Strength or Dexterity; Monk, Paladin, and Ranger require both
of their listed primary abilities. The total of all class levels cannot exceed 20.

Class levels are stored explicitly. For example, Fighter 4 / Wizard 1 has a
level-5 proficiency bonus, Wizard level-1 preparation and spells, and separate
d10 and d6 Hit Dice. Class features, subclasses, ASIs, and class-resource
capacity use the level in the relevant class; cantrip scaling uses total level.
Extra Attack does not stack, and alternative Armor Class formulas must be
chosen individually rather than added together.

The first level in a new class grants the class's limited multiclass
proficiencies and its level-1 features. It does not grant new saving-throw
proficiencies, starting equipment, or maximum first-level HP. Armor, weapon,
and tool training are recorded as proficiency entries; skill choices update
the character's skill proficiencies. Review equipment and saved Armor Class
with the DM when training changes.

Spellcasting uses the 2024 combined caster table when two classes have the
Spellcasting feature. Full casters contribute their class levels; Paladin and
Ranger contribute half, rounded up; Eldritch Knight and Arcane Trickster
contribute a third, rounded down. If there is only one Spellcasting class,
its own table applies. A higher shared slot enables upcasting, not learning
spells above that class's individual spell level. Each spell is associated
with its class and uses that class's casting ability. Spellbook shows separate
preparation and cantrip allowances per class.

Pact Magic has a separate **Pact** pool in multiclass sheets. The spell controls
and on-hit spell choices allow either ordinary slots or Pact Magic slots.
Short rests replenish Pact slots, while ordinary slots remain spent. Existing
single-class Warlock L-level trackers remain compatible; their spent uses
carry across when the pool becomes Pact or increases in level. Cleric and
Paladin Channel Divinity are also kept as independent class pools.

For a pre-existing multiclass character, the DM uses **Edit class levels** on
the sheet. Enter each class's current level and subclass, totaling the existing
character level. This records a baseline without rebuilding HP, abilities,
equipment, or saving throws. Ambiguous labels such as “Fighter / Wizard” are
never interpreted as a guessed split. Existing spells without a known class
can be assigned using **Spell class** in their expanded Spellbook entry.
Cancel a pending grant before changing the baseline class levels.

Mixed Hit Dice can be selected by die size from the sheet or compact HUD.
Spent dice remain spent across level-ups and reloads; a Long Rest restores
all pools. When an old sheet records only a spent total, the total is allocated
to the larger dice first to avoid accidentally granting a rest.

These rules follow the official [2024 multiclassing rules](https://www.dndbeyond.com/sources/dnd/br-2024/creating-a-character#Multiclassing)
and the [limited class-entry proficiencies](https://www.dndbeyond.com/sources/dnd/br-2024/character-classes).

## Current scope

Artificer and homebrew classes use manual DM advancement; they are outside the
12 core 2024 class tables. The app never infers a class split or silently applies
a single-class slot table to an ambiguous label.

The feat picker contains a reviewed set of 2024 feats, rather than relabeling
the older general picker as a complete 2024 catalog. Supported choices apply
their numeric changes; situational feat and class effects are recorded as
notes unless an existing reviewed combat profile handles them. The guide calls
out remaining rulebook choices. A listed subclass is not a promise that every
one of its special combat mechanics is automated.

## Verification

`server/src/characterProgression.test.ts` checks the class tables and HP math.
`server/src/leveling.test.ts` checks grants, ownership, validation, rollback-only
previews, idempotent application, HP rolls, spell and feature choices, and
preservation of existing sheets. `e2e/level-up.spec.ts` exercises the actual DM
and player controls, Wizard learning, mobile layout, and the live HP tray above
the guide, using an isolated campaign database. `multiclass.test.ts` covers
the shared multiclass rules and counter preservation; `multiclass-runtime.test.ts`
and `spellSlotPools.test.ts` cover casting, class-level combat scaling, rests,
and mixed Hit Dice. `multiclassLeveling.test.ts` and `e2e/multiclass-level-up.spec.ts`
check authoritative advancement and the actual DM/player multiclass controls.
