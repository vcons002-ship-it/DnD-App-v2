# Linked spell actions and Mirror Image

Implemented October 2026, using the 2024 rules. Spells are cast from **Combat**
or the right-click target menu. The server owns dice, damage, saves, conditions,
concentration, and repeat-action timing. Existing saved sheets receive matching
runtime profiles; their descriptions and authored formulas are not rewritten.
Explicit Custom or Manual profiles keep their authored behavior.

## Mirror Image

Cast once to create three translucent duplicates of the caster. In 3D mode,
the app captures the already-loaded figure into a transparent image and reuses
it on three lightweight billboards. In 2D mode it repeats the caster's token
image or icon. Copies follow movement and facing, share the caster's visibility,
have no selectable bases, cast no shadows, and require no additional model
downloads. View changes refresh the captured figure in coarse steps.

After an attack roll hits, the server rolls one d6 per remaining duplicate.
At least one result of 3+ redirects the hit and destroys exactly one duplicate.
The caster takes no attack damage and gets no damage-roll prompt for that hit.
The duplicate disappears as the authoritative result arrives. If every die is
1–2, the hit resolves normally. An intercepted hit is not a miss and does not
trigger Riposte.

Other damage, including area damage, does not remove duplicates. Attackers unable
to see the caster, or using qualifying Blindsight/Truesight, bypass them. The
app recognizes Blinded/Invisible conditions and explicit senses/ranges in creature
traits; unusual sight exceptions remain DM adjudication. The spell has no
concentration requirement and ends after one minute or when all copies are gone.
The Combat panel shows the current count.

## Damage chains and control

| Spell | Linked workflow |
|---|---|
| Sorcerous Burst | Choose its damage type; maximum d8 faces generate bonus d8s recursively, capped at the casting modifier. Critical base dice participate. |
| Ice Knife | Piercing attack followed by a Cold burst on hit or miss. The burst rolls damage once, then labeled saves for nearby creatures. Upcasting increases only the burst. |
| Melf's Acid Arrow | Full initial Acid on hit; half initial on miss. A hit schedules one additional Acid roll at the end of the target's next turn. |
| Vampiric Touch | Heal half the defended spell's Necrotic damage, excluding unrelated mark riders. Deferred damage heals only after the damage click. Repeat attacks use the active concentration. |
| Hold Monster | Wisdom saves, linked Paralysis/action blocking, upcast target budget, end-turn repeat saves, and concentration cleanup. Undead are eligible. |
| Phantasmal Killer | Initial Psychic damage with a Wisdom save for half; failure adds attack/check disadvantage. Later turn-end saves occur before damage: success ends the effect; failure deals damage again. |
| Heat Metal | Initial/repeated Fire damage and Constitution saves; attacks/checks have disadvantage while the heated item is retained, until the caster's next turn. A Drop heated item control ends the contact effect. |
| Ice Storm | Separate Bludgeoning and Cold pools; only Bludgeoning upcasts. |
| Flame Strike | Separate Fire and Radiant pools; both upcast. |
| Meteor Swarm | Separate Fire and Bludgeoning pools, preventing repeated application to one creature across overlapping spheres. |

Mixed damage retains per-type immunity, resistance, and vulnerability. A target
has one save and one combined HP/concentration application. Multiple tokens for
the same creature cannot apply a casting twice.

## Repeat-use controls

After the initial cast, **Active spell actions** appears in Combat for both
players and the DM. Choose the target in the usual target selector, then press
the spell's Magic action or Bonus action button. Repeat use retains the original
slot level, concentration identity, and duration; it does not cast again or
spend another slot. During combat the action is available on the caster's turn,
once per turn. Ending concentration removes these controls.

| Spell | Repeat action |
|---|---|
| Witch Bolt | Bonus action: automatic 1d12 to the original target, even if the initial attack missed. A broken 60-foot/Total Cover link ends concentration. Only initial damage upcasts. |
| Spiritual Weapon | Bonus action: spell attack and Force damage plus casting modifier. |
| Flame Blade | Cast to create it; use the Magic action button for its Fire spell attack plus casting modifier. |
| Vampiric Touch | Magic action: repeat its Necrotic attack and healing. |
| Call Lightning | Magic action: another burst with grouped Dexterity saves. |
| Heat Metal | Bonus action: repeat Fire damage on the original creature retaining the object. |

The app does not place/move a Spiritual Weapon object, infer Heat Metal material
eligibility, remove worn armor, or model a Call Lightning cloud. Those details
remain explicit in the Partial badges. Call Lightning currently centers its burst
on a chosen creature; empty-space cloud targeting and the existing-storm bonus
remain table-managed. Flame Blade's continuous light and temporary Ice Storm
terrain are also table-managed. Ordinary action/reaction economy remains the
existing soft/table-managed system.

## Hit riders

- Guiding Bolt grants the next attack advantage, consumed by that roll or expired
  at the end of the caster's next turn.
- Ray of Frost reduces live movement speed by 10 feet until the caster's next
  turn without changing saved speed.
- Ray of Sickness applies Poisoned directly on a hit; no extra Constitution
  save. It expires at the end of the caster's next turn.
- Chill Touch uses a melee d10 attack and prevents ordinary healing through the
  end of the caster's next turn. An explicit DM HP correction can still override it.
- Shocking Grasp marks the target as unable to make Opportunity Attacks until
  its next turn starts. Other reactions, including Riposte, are not blocked.
  Opportunity-attack adjudication remains table-managed.

## Verification

`server/src/linkedSpells.test.ts` covers catalog profiles, authored opt-outs,
live/manual Mirror Image checks, sight bypasses, timed expiry, damage chains,
repeat uses, separate damage defenses, concentration cleanup, and hit riders.
`e2e/linked-spells.spec.ts` runs a disposable campaign through the real player
Combat UI with the loaded Vanec figure, duplicate removal after a monster attack,
and a repeat Flame Blade attack. Existing spell, Haste, and leveling browser
regressions are retained. Production campaign saves are not used.

Rules: [official 2024 spell descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions),
[licensed 2024 Witch Bolt](https://roll20.net/compendium/dnd5e/Spells%3AWitch%20Bolt?expansion=32231&from_listings=true).
