# Live, server-authoritative dice

The game server advances the rigid-body world while clients render its streamed poses. Dice use fixed face labels; the upper resting face supplies the rules result. A d4 reads the face opposite the upper vertex, and d100 uses separate tens and ones dice. There is no trajectory search, face reassignment or completed simulation to replay.

## Timing and presentation

- The first packet creates the tray. The initiating browser acknowledges graphics readiness before the server launches; this wait is bounded at 2.5 seconds if graphics are disabled or the client disappears.
- Readiness includes an offscreen render with the dice inside the camera, so first-use glass, shadow and texture setup cannot be deferred until a die enters view. The opening animation also finishes before launch.
- Every die starts with forward tumble aligned to its actual diagonal heading plus a randomized sideways twist, as if released from a hand or cup. Only the release gets this spin; subsequent motion comes from the rigid-body solver.
- D6s have a rounded collision hull and matching curved artwork, with an approximately 1 mm radius on a 16 mm die. Six broad flat faces retain the original number mapping. Only the numbered planes determine results; the small edge/corner facets are never read as extra faces.
- Physics advances at fixed steps against elapsed time. The server sends about 30 pose updates per second; clients interpolate with an 80 ms buffer.
- Throws use a gentler 0.55-0.70 m/s release, a varied 22-30 rad/s forward tumble, and lower surface friction. Release is closer to the rim so slower dice clear it before landing. The shared presentation cadence is 0.75 physics seconds per wall-clock second; poses are still produced live. This balances a readable entry with sustained motion instead of stretching the original aggressive throw. Gravity and floor restitution remain unchanged.
- A die must sleep, sit on the floor, stay within the tray, and have an unambiguous face. An unreadable/stacked die is thrown again. A die still moving after ten simulation seconds is thrown again too. Only the affected die is reset; the other dice remain physical bodies in the same world.
- Number flashes and result-box flights finish before the completed rules action is published. Hidden DM rolls and hidden/off-map actors do not stream to players.
- Modifiers and the final total appear beneath the result boxes in the same live tray. The actual resting dice and their animated materials remain visible; there is no subsequent standalone modifier-dice screen. Checks, attacks, healing and damage all use the existing server-authored breakdown, including negative adjustments. Grouped saves retain each creature's own calculation and pass/fail result in its result box. Player views still receive only redacted NPC/DM calculations.
- Commands retain their completed non-save throws for the final calculation, so damage followed by grouped saves cannot associate the damage total with the saving-throw dice. Unmodified damage clears straight to the compact impact summary after the live reading hold. Clicking, tapping, the Skip button or Escape dismisses either the live throw presentation or its in-tray result; map effects still wait for completion or skip.
- Normal and extra critical damage terms are requested as one physical pool, with per-die critical flags. They enter the same world together; only the extra critical dice use gold. Individual term results remain separate for damage-type calculations and modifiers.
- Worlds contain at most forty physical bodies. Larger expressions use successive batches; percentile pairs stay together. Standard d4/d6/d8/d10/d12/d20/d100 rolls are supported. Unsupported custom polyhedra produce an explicit notice rather than silently falling back to a random-number roll.

## Rules integration

The existing synchronous rules engine runs in a rollback-safe transaction with an injected dice source. When it needs unknown faces, the transaction is rolled back, a live throw runs outside the transaction, and the command resumes with those recorded faces. No database lock remains held while dice move. A per-session queue prevents overlapping game mutations.

HP effects, reactions, socket notices and snapshot broadcasts are deferred or checkpointed. Only the successful final pass commits. Provider results are checked for count and range; missing faces never fall back to random numbers. Dice plans that change during resumption fail instead of applying a partial action.

Manual attacks persist an unresolved damage continuation, stripped from all public snapshots. Attack and damage remain separate clicks. The known hit/crit and weapon context survive until damage; attack maneuvers are neither rolled nor spent twice. Smite and other on-hit choices validate before starting damage physics. Old already-resolved pending hits remain compatible.

## Verification

`server/src/liveDice.test.ts` checks fixed-face reads for every standard shape, forty bodies, automatic unreadable/timeout rerolls, rollback/commit behavior, manual critical damage, maneuver use and authoritative face validation.

`e2e/live-dice-workflow.spec.ts` casts Fireball and uses a weapon plus Roll Damage through the player UI, checks live frames against the committed result in a disposable campaign.

`e2e/live-dice-contract.spec.ts` checks identical shared frames, private DM rolls, d100 decoding, advantage selection, and server completion after a client disconnects.

`e2e/roll-reveal-timing.spec.ts`, `e2e/spell-impact-timing.spec.ts` and `e2e/dm-dice-theme.spec.ts` check that the original canvas remains mounted during skill, attack, healing and damage modifiers, that material animations keep advancing, and that results clear before map impacts. `e2e/save-privacy.spec.ts` covers grouped-save privacy and prevents repeated save popups.
