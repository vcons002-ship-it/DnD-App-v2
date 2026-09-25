# Creature CR scaling

Changing CR in the creature stat editor previews automatic scaling. Save applies it; Cancel leaves the creature unchanged. While previewing a different CR, other stat edits are disabled: save the CR change, then reopen Edit for manual tuning. Player levels and non-combat objects are unaffected.

The first saved CR change captures the existing creature as its original baseline. Every subsequent change uses that baseline, including a return to its original CR. The baseline is stored in SQLite and carried through spawning, copying, backups, and library save/load. Existing creatures require no data rewrite; their current stats become their baseline when first scaled.

## Math

Uses the **2014 Dungeon Master's Guide, page 274, Monster Statistics by Challenge Rating** benchmarks (range midpoints):

- Maximum HP = original maximum HP × target HP benchmark / original CR HP benchmark.
- Damage expectations = original damage × target DPR benchmark / original CR DPR benchmark. Dice expressions approximate the result within half a point, retaining the original die type where possible. Secondary damage and rollable spells also scale.
- AC, attack bonuses, and save DCs retain their original offset from the corresponding CR benchmark.
- Ability scores, speed, resistances, equipment, attack counts, recharge rules, and spell levels remain unchanged. Existing saving-throw proficiency calculations use the new CR. Cantrip caster tiers stay at the original baseline to avoid multiplying damage twice.
- Current HP retains its fraction of maximum HP, rounded to an integer. A living creature stays at least at 1 HP; a creature at 0 stays at 0. Temporary HP stays unchanged.
- Supported CRs: 0, 1/8, 1/4, 1/2, and integers 1–30. Invalid targets are rejected without mutation.

Example: a CR 4 creature with 60 HP, AC 17 and +5 to hit becomes 67 HP, AC 18 and +6 to hit at CR 5. Its damage multiplier is 35.5/29.5. Returning to CR 4 restores its original combat values, without accumulating rounding errors.

This is a **baseline-preserving estimate**, not a guarantee that every scaled monster has the exact effective CR. D&D has no universal “one CR equals X percent stronger” rule. The DMG evaluates offensive and defensive CR separately, including traits, effective HP, and action economy. Retaining a creature's existing strengths and weaknesses is deliberate; unusual traits, custom prose, and large CR jumps need DM review. Unparseable damage expressions are preserved rather than rewritten speculatively.

Official background: [D&D Beyond's monster design workshop](https://www.dndbeyond.com/posts/181-design-workshop-monsters) and [2014 Basic Rules monster statistics](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters). The ratios and baseline-retention policy are this app's implementation, rather than an official automatic conversion rule.

Scaling is recomputed server-side when a DM changes a creature's CR. Client previews do not override the server's result. Manual changes at an unchanged CR still work as before.
