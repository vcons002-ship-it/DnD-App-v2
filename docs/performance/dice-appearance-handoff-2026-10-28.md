# Dice appearance across Legacy and standard viewers

Reported: Vanec rolled a d100 from Legacy mode, and two players using 3D mode saw plain grey dice. The user subsequently confirmed the same appearance on an ordinary Vanec d20 roll, so the issue is not exclusive to percentile expansion. A Legacy DM may encounter the same concern for DM and creature rolls.

Source inspection found that Legacy mode selects a text-only local overlay. It does not intentionally strip class, DM, or per-die appearance metadata from the server frames sent to observers. The d100 path expands into two d10 bodies and retains that metadata.

The result overlay nevertheless looked up its material again from the current roll log and roster, ignoring its retained authoritative tray. During intermediate calculations it also consulted `rollFx` even though the displayed calculation belongs to `liveDice`. That fallback can produce the neutral material when its lookup context is absent, or select another material when names collide.

The prepared change uses the live or retained server tray's appearance first, preserving explicit DM and gold overrides. Historical results without a tray still use roster lookup. Generic player roll metadata now resolves the claimed character by ID instead of name, avoiding ambiguity between characters with identical names. A generic DM roll no longer borrows a character's class just because that character is named DM; explicitly rolling for a selected PC still retains that PC's class.

After the campaign ended, regression cases passed for Vanec's ordinary d20 through motion, calculation and retained result presentation, his percentile pair, missing local lookup context, DM and creature d20 and percentile materials, explicit gold appearance, and historical fallback. The full suite passed 2,403 tests across 244 files; production builds and typechecks passed.

The new `e2e/legacy-dice-appearance.spec.ts` passed with real RTX 5090 WebGL: two standard 3D player browsers observed a Legacy player rolling d20/d100 and a Legacy DM rolling d20/d100 and a creature saving throw. It verifies server appearance metadata, both physical percentile dice, class/DM material selection, loaded graphics, and continued local static HP controls on Low. Settled-dice screenshots are under `artifacts/navigation-fog-20261028/settled-dice-final/`.

Those observers finish material warmup before the throws, so this establishes the tested mixed-mode appearance contract rather than reproducing the original grey-dice incident or proving cold-start behavior. No deployment, restart, or live campaign mutation was performed for this validation.
