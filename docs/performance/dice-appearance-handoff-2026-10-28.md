# Dice appearance across Legacy and standard viewers

Reported: Vanec rolled a d100 from Legacy mode, and two players using 3D mode saw plain grey dice. The user subsequently confirmed the same appearance on an ordinary Vanec d20 roll, so the issue is not exclusive to percentile expansion. A Legacy DM may encounter the same concern for DM and creature rolls.

Source inspection found that Legacy mode selects a text-only local overlay. It does not intentionally strip class, DM, or per-die appearance metadata from the server frames sent to observers. The d100 path expands into two d10 bodies and retains that metadata.

The result overlay nevertheless looked up its material again from the current roll log and roster, ignoring its retained authoritative tray. During intermediate calculations it also consulted `rollFx` even though the displayed calculation belongs to `liveDice`. That fallback can produce the neutral material when its lookup context is absent, or select another material when names collide.

The prepared change uses the live or retained server tray's appearance first, preserving explicit DM and gold overrides. Historical results without a tray still use roster lookup. Generic player roll metadata now resolves the claimed character by ID instead of name, avoiding ambiguity between characters with identical names. A generic DM roll no longer borrows a character's class just because that character is named DM; explicitly rolling for a selected PC still retains that PC's class.

Regression cases were added for Vanec's ordinary d20 through motion, calculation and retained result presentation, his percentile pair, missing local lookup context, DM and creature d20 and percentile materials, explicit gold appearance, and historical fallback. These cases have not been executed.

Validation is deferred because the campaign is active. Only source/diff inspection was performed. No tests, builds, typechecks, live campaign requests, pushes, or deployment were performed. The complete reported grey-dice behavior has not been reproduced, so this is a correction to an identified appearance fallback, not confirmation of the original incident's root cause. Later validation should exercise a Legacy player and Legacy DM rolling ordinary d20s and d100s while two standard 3D browser clients observe both motion and the settled/result handoff, plus creature rolls from the Legacy DM. In particular, inspect the first transmitted frame's class/DM appearance and actual rendered material: result-handoff coverage alone does not establish why a live tray could look grey.
