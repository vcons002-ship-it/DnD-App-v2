# 2024 spell fixes — October 2026

Haste and Hold Person now execute their core combat effects. The catalog and
runtime also correct reviewed older formulas while keeping unsupported mechanics
flagged. The [full Spellbook support audit](SPELLBOOK_COMBAT_SUPPORT.md) lists
every spell and the exact parts the app handles. The later
[linked spell batch](LINKED_SPELLS_2024.md) adds follow-up damage, control, repeat
actions, and Mirror Image; its workflow details supersede the earlier scope below.

## Haste

In Combat, choose an ally or yourself under **Buff target**, then cast Haste.
The target's base sheet stays intact: its live AC gains 2, each listed movement
speed doubles, and Dexterity saves gain advantage, cancelling disadvantage normally.
Boosted AC and speed appear green in the HUD/sheet and Haste summary. Dexterity
save controls show a green ADV indicator; the ability score and save modifier
stay unchanged. The highlight disappears when the spell ends.
The target's Combat panel shows a compact **Haste** control for one extra action
per turn: one weapon attack, Dash, Disengage, Hide, or Utilize. A missed extra
attack still spends that action. A spell or full Multiattack cannot use it.
Dash updates the movement allowance hint; Hide/Utilize still need the appropriate
check or DM interaction. Normal action economy and total movement remain the
table's bookkeeping.

Concentration loss, replacement, or expiration removes the linked buff and causes
Haste lethargy: Incapacitated and speed zero through the end of the affected
creature's next turn. Player movement and actions are refused during that recovery.
DM placement remains available for adjudication. Turn hooks reset the extra action.
An eight-second popup explains lethargy when it starts or the player reloads while
affected. **Why blocked?** repeats that explanation; recovery timing changes from
the end of the next turn to the end of the current recovery turn. Rejected movement,
attack, spell, summon, and stance requests use the same explanation. Ordinary
notices keep their shorter display time.

## Hold Person

The initial Wisdom save applies Paralyzed and its Incapacitated condition bundle
on failure. Humanoid eligibility is checked, including rejection of creature objects
and non-Humanoids. Each slot above level 2 permits one additional distinct target;
repeat clicks and multiple tokens for one creature cannot bypass that limit.
Linked paralysis blocks attacks, casting, summons, and player movement; DM movement
corrections, sheet edits, and the target's repeated save remain available.
Its **Why blocked?** control and rejected-action popup explain that recovery needs
a successful end-of-turn Wisdom save or the spell to end.

An affected creature repeats its Wisdom save at the end of each turn through the
existing live-dice flow. Passing removes its spell conditions without spending a
slot or recasting. Losing concentration, replacing the spell, or expiration clears
the linked conditions across maps. Independent conditions remain in place. A
living PC at zero HP can remain affected; the caster dropping to zero ends its
concentration. An old Apply button cannot revive a completed casting.

## Corrected catalog and safe execution

| Spell | Correction / remaining scope |
| --- | --- |
| Poison Spray | Ranged spell attack, 1d12 with cantrip scaling. |
| Inflict Wounds | Constitution save, 2d10 Necrotic, half on success, +1d10 per upcast. |
| Sorcerous Burst | Seven permitted damage types; Force removed. Bonus dice from maximum faces now roll automatically, capped at the casting modifier. |
| False Life | 2d4 + 4 temporary HP, +5 per upcast. Keeps the larger existing pool; never heals wounds. |
| Witch Bolt | Initial 2d12 Lightning, +1d12 per upcast, 60-foot range. Active spell actions handles later Bonus Action damage and the distance/Total Cover link. |
| Flame Blade | 3d6 + casting modifier, +1d6 per upcast. Active spell actions handles later attacks; continuous blade light remains manual. |
| Spiritual Weapon | Casting modifier, +1d8 per upcast, and 2024 concentration. Repeat attacks use Active spell actions; weapon placement and movement remain manual. |
| Mordenkainen's Sword | 4d12 + casting modifier, 90-foot range, no concentration. Later attacks remain manual. |
| Wind Wall | Initial 4d8 Bludgeoning with Strength save for half. Physical wall behavior remains manual. |
| Mass Cure Wounds | 5d8 + casting modifier, +1d8 per upcast; one roll for up to six recipients. |
| Mass Healing Word | 2d4 + casting modifier, +1d4 per upcast; one roll for up to six recipients. |
| Circle of Death | 8d8, +2d8 per upcast. Area eligibility remains table adjudication. |
| Blade Barrier | Force damage replaces Slashing. Cover, difficult terrain, and later triggers remain manual. |
| Weird | Initial 10d10; ongoing 5d10, fear, and repeat saves remain manual. |
| Ray of Enfeeblement | Initial Constitution save replaces the older attack. Success/failure weakening and repeat saves remain manual. |
| Contagion | Constitution save and 11d8 Necrotic on failure. Disease, Poisoned, and repeat-save progression remain manual. |
| Ice Storm | Description/components: 2d10 Bludgeoning + 4d6 Cold; +1d10 Bludgeoning per upcast. Separate typed pools now apply their defenses correctly; area selection remains table-managed. |
| Flame Strike | Description/components: 5d6 Fire + 5d6 Radiant; +1d6 of each per upcast. Separate typed pools now apply their defenses correctly; area selection remains table-managed. |
| Meteor Swarm | Description/components: 20d6 Fire + 20d6 Bludgeoning. Separate defenses and once-per-creature application are now enforced; sphere placement remains table-managed. |
| True Strike, Aid, Prayer of Healing, Mass Heal | Correct descriptions; weapon-based attacks, max-HP changes, rests, or allocated healing pools are not ordinary single-target rolls. Remain manual. |
| Glyph of Warding, Dream, Earthquake, Fire Shield, Geas, Elemental Weapon, Bestow Curse | Correct conditional timing: casting does not immediately apply their damage riders. Remain manual. |
| Conjure Animals, Conjure Woodland Beings | New catalog entries describe the 2024 spirit areas and omit obsolete creature placeholders. Area/turn effects remain manual. |

Casting modifiers are named steps in the reveal and added once; critical hits
double damage dice, never the modifier. Multi-target healing uses **Apply healing**
after the one roll: click up to six creatures, then Done. Repeated clicks do not heal
twice; dead PCs are not revived. Targets must be directly visible to the acting player.
Range and area eligibility remain table adjudication.

## Existing saves and homebrew

No database migration rewrites spell text or statistics. The pure compatibility
layer recognizes an exact older shipped roll and supplies the corrected runtime
profile. It retains the spell ID, source class, and explicit casting ability.
Edited formulas, additional authored mechanics, custom spells, and manual execution
opt-outs keep their chosen behavior and unreviewed support flag. Saved descriptions
remain saved; new catalog entries have corrected text. Unsupported old Conjure
summons remain blocked by their Manual support profile.

## Verification and next small candidates

Server regressions cover actual casts, HP changes, turn transitions, conditions,
spell slots, target limits, live repeat saves, critical modifiers, and preserved
authored formulas. Browser tests run a disposable campaign with real Combat,
Conditions, movement, initiative, and healing controls; no production save is used.

Linked hit riders below are implemented; Heal condition removal remains a candidate:

- Guiding Bolt: now grants and consumes the next attack's advantage, with expiration.
- Ray of Frost: now applies and expires the speed reduction.
- Heal: remove Blinded, Deafened, and Poisoned with its existing fixed healing.
- Shocking Grasp: now marks Opportunity Attacks as unavailable for its duration;
  other reactions remain available under the 2024 rule.

Rules sources: [2024 Free Rules spell descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions)
and [Witch Bolt, licensed 2024 PHB compendium](https://roll20.net/compendium/dnd5e/Spells%3AWitch%20Bolt?expansion=32231&from_listings=true).
