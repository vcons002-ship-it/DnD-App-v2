# Explicit spell casting

Learned spells have a Cast button in the character spellbook, the combat panel's reference list, and the combat action controls. The reference list allows its owner to cast without enabling sheet editing. The catalog separates Add from Cast; unlearned entries explain that they must be learned first.

Spellbook and reference-list Cast buttons open setup. Browsing, choosing a slot, and cancelling are free. The final button displays the actual selected slot level, including Pact Magic's casting level, or states that a cantrip uses no slot. Setup defaults to the lowest available qualifying slot; an explicitly exhausted selection stays disabled. Existing server validation and resource spending remain authoritative.

Combat action buttons show their cost directly. Immediate spells submit when pressed; spells requiring targets or a Command word explain their final Cast step. Map placement and Misty Step confirmation show the slot cost and explain that placement alone does not spend it. Repeat uses of an existing spell effect show that they use no additional slot. Reaction, post-hit and unprepared spells explain the required trigger or preparation. Manual utility spells record casting and slot spending while their effects remain for the DM to resolve.

The shared control uses a native modal dialog so it remains clickable above the character window. Closed spell rows do not subscribe to movement snapshots or compute targeting lists.

## Validation

- Full unit suite: **2,408 tests in 245 files passed**, including five new cost/restriction tests and existing manual casting and slot-pool contracts.
- Client/server TypeScript checks and production builds passed. The final client was built into an isolated artifact directory.
- **19 distinct browser regressions passed** during this change: the full new workflow, five spell-support checks, four advanced-spell checks, three party-spell checks, and six spell-execution checks. The final reference-list addition was verified with the complete workflow and all five spell-support checks.
- The new workflow verifies saved spell, catalog, combat action and combat reference-list casting; level selection and exact slot spending outside combat; mobile dialog bounds; cantrip summoning; free area cancellation; reaction guidance; Command chooser cancellation; and disabled exhausted slots. The 390-pixel mobile screenshot was visually inspected.
- Two broader checks remain failing: Spike Growth movement damage raises a server dice-context error, and the party-spell Command test times out on the NPC Grovel follow-up after the player cast succeeds. Both failures were reproduced using the unchanged client from **fe1d548e**, with the same backend and disposable fixtures. No backend change or weakened assertion was added to hide them.

All browser tests used disposable sessions/databases with controlled AI endpoints. DnDServer, live campaign data and the installed client were not updated or restarted. Native mobile and Safari testing were not performed.
