# Automated verification

`npm test` runs server and shared-rule tests. `npm run test:e2e` builds the client and runs the normal Playwright browser suite against a disposable server and save. Neither command uses the installed campaign database. CI runs both suites, typechecking, and the production build.

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

To run a focused browser check after building the client:

```sh
npx playwright test -c e2e/playwright.config.ts e2e/damage-prompt-ownership.spec.ts
```

`PW_CHROMIUM` can point to an installed Chromium/Chrome executable. `E2E_PORT` overrides the default disposable port, 4099, for independent audits. Give simultaneous runs distinct `--output` directories; each invocation creates its own temporary database. Do not run these commands against the installed campaign server.

## What a failure means

A regression test checks behavior that should continue to work after a change. A failing old test is not automatically obsolete. Reproduce it on the base branch and compare the assertion with the current feature contract before changing it.

- Fix the app when the expected behavior still applies.
- Update an assertion when an accepted workflow has changed, while preserving the behavior it protects.
- Keep missing asset files, incorrect arithmetic, privacy leaks, and broken interactions as failures.
- Run manual recordings and paid/live AI demonstrations explicitly, separately from automated regressions.

CI uploads browser traces, screenshots, and failure context as `browser-test-results` when the browser job fails. Open a downloaded trace with `npx playwright show-trace <trace.zip>`.

## Live dice regression contracts

The current roller streams server physics before committing a result. Tests must wait for a particular roll or pending-hit ID and its final result, rather than assume it completes within five seconds.

- A hit creates a pending damage choice without precomputed damage faces or modifiers. Rolling damage then commits the weapon, rider, modifiers, and HP change.
- Floating damage components must sum to the defended HP event, with one HP/death/concentration application per combined hit. One red total per creature/impact includes both a weapon hit and its AoE rider; smaller colored components explain mixed hits. `hpFeedback`, `marks`, `hailOfThorns` and `areaSpells` cover type defenses and compact per-token offsets; nearby victims must never push numbers across the map. `hunters-mark` and `spell-impact-timing` exercise real bow/mark/thorns rolls and verify totals against HP loss, distinct colors, the four-second number lifetime, and numbers without long captions.
- Compare visible physical faces and persisted arithmetic after settlement. Keep advantage/disadvantage kept/discarded checks, percentile arithmetic, critical extra dice, bonus labels, and class material checks.
- Check the current live tray and result boxes. The old prerecorded renderer's comparison markup does not describe the live workflow.
- Initiative starts with the DM; claimed players retain their own Roll initiative button. Your Turn and result announcements should be checked at their intended presentation phase.
- Unsupported custom polyhedra show an actionable notice without committing a roll. Standard d4, d6, d8, d10, d12, d20, and d100 rolls remain covered. See [Live dice physics](LIVE_DICE_PHYSICS.md).
- Asset-cache tests require an actual GLB, not a Git LFS pointer, and still verify cached/offline reuse. Reveal-tag, visibility, damage ownership, and roll privacy checks remain active.

The relevant regression list includes:

| Coverage | Specs |
| --- | --- |
| Live faces, totals, network privacy, disconnect completion | `live-dice-workflow`, `live-dice-contract`, `player-hud`, `upstream-dice-reconciliation` |
| Dice picker bounds and keyboard/touch controls | `dice-picker` |
| Background shader preload for each character and DM, cold-load readiness | `dice-preload`, `live-dice-contract`, `spell-impact-timing` |
| Animated settled dice, skippable reading hold, spell effects after compacting | `spell-impact-timing`, `roll-reveal-timing` |
| Results, impacts, bonuses, initiative, reactions | `roll-reveal-timing`, `combat-moments`, `compact-checks`, `player-initiative` |
| Pending ownership, damage history, on-hit choices | `damage-prompt-ownership`, `damage-roll-log`, `smite-damage`, `hunters-mark`, `maneuver-damage`, `spell-execution`, `weapon-quick-menu` |
| Combat controls and kill credit | `player-combat-layout`, `orb-kill-count` |
| DM-granted leveling, ASIs, Wizard spells, mobile live HP dice | `level-up` |
| Multiclass entry, class-level choices, legacy splits, Pact spending, separate class counters | `multiclass-level-up` |
| Spell support badges/filter, manual casts, safe player routing, summon levels/pools, class-scoped browse ownership | `spell-support` |
| Haste ally targeting, live benefits, restricted extra action, lethargy, Hold Person repeat saves, and shared healing | `spell-buffs` |
| 2D silhouettes and 3D base-only selection | `token-hit-region` |
| Cache integrity and creature reveal tags | `asset-cache`, `encounter-tags` |

Each name above is an `e2e/<name>.spec.ts` file. Other normal UI/map regressions remain enabled too. Component fixtures must provide valid current data, including condition IDs, and explicitly choose 2D/3D mode when checking a particular hit shape. A pulsing button can be clicked at its measured center when its intentional animation prevents Playwright's static-position actionability check; it must still be visible and enabled, and the test must verify the real resulting action.

Multiclass server tests also exercise persisted class rosters, class-specific
casting scores and combat scaling, mixed Hit Dice, rests, and spent-use
preservation. A level-up or a change to the recorded class split must not act as
a rest. Combined spell slots must not raise a class's spell-learning allowance.

## Optional captures and AI demonstrations

`dice-rider-reading.spec.ts` exercises real attack, weapon damage, superiority
dice and a target save. Consecutive rolls retain one card and acknowledge
readiness after the artwork handoff so the toss remains visible.
The outer roll window keeps fixed bounds throughout an automatic roll sequence,
including new dice pools, modifier chips and DM saves. Its result areas reserve
space and scroll within that space. Reserved result rows are compact, and the
roll window uses viewport sizing independently of player HUD zoom. The browser
checks that the canvas fills at least 80 percent of the window width on the
desktop combat fixture. The tray fills its fixed viewport at the
same apparent size for every pool. Existing physical dice-to-tray ratios are
preserved: larger pools make dice appear smaller, without growing the visible
tray, remounting its canvas or scaling the card. Different character/DM artwork
retains its 360 ms crossfade within that viewport. Browser assertions measure
card bounds, canvas visibility and actual projected deck corners across weapon,
rider and save rolls, alongside the pool's unchanged physical die radius.
Incoming dice
bypass only their entry rim; the other three walls always collide. A small
throw has an upward release velocity as well as horizontal travel and spin.
The Orb leap menu becomes available at impact readiness, while the compact
result remains readable; choosing a target clears that compact result.
Druk maxima use one shared finale clock: 750 ms after the last modifier
total finishes its 260 ms count-up, or 750 ms after the unmodified result is
ready. Ordinary intermediate calculations include the same full 2.5-second reading hold as final results; the server adds 250 ms for packet/interpolation latency. The tray retains 1.75 seconds after the explosion before its handoff.
The server uses the same schedule for intermediate weapon damage, so a
superiority die/save cannot cut off the weapon finale. Discarded advantage
dice and DM dice do not activate this clock.
Results without modifiers retain their 2.5-second reading/effects hold. Set
`DICE_RIDER_VIDEO` to capture this sequence with NVIDIA AV1.

Camera panning is parked on `prototype/dice-table-camera-20261008` (commit
`97e730c`). Its `dice-table-camera.spec.ts` and recordings are prototype evidence,
not requirements for the production crossfade UI.
The `dice-preload` browser suite waits for background preparation while the
character chooser is still open, then verifies that the first d20 borrows a
prepared scene and begins live physics within two seconds of clicking. It checks
all three character themes and DM dice, shader errors and large heading size.
Preloading includes every geometry/percentile variant plus critical materials,
with at most three prospective player styles and the DM style resident. The
selected character takes priority; queued themes yield when a roll begins.
The `diceRendererCache` unit suite checks bounded retention, in-flight leases,
large-pool disposal, session invalidation and maximum-roll state reset. The
network contract checks that hidden DM rolls never reach either player while
public player rolls still reach the DM and the rest of the party.

Measured-area contracts live in `areaSpells`, `spell-execution` and
`live-dice-workflow`: place/confirm before casting, grouped saves and automatic
occupants, no repeated apply clicks, and cancellation without spending a slot.
`linked-spells-video` supports `DND_LINKED_VIDEO=1` and an optional pipe-separated
`DND_LINKED_SPELLS` list for real-physics demonstrations; its `areas` group covers
circles, cones, lines, cubes, selective healing and persistent utility areas.
The `aoe-review` group records a single chaptered walkthrough with Heat Metal,
Call Lightning/repeat strikes, typed Ice Storm damage, grouped save bonuses,
the area shapes, selected healing, connected Fire Storm cubes and four Meteor
Swarm areas. Run it with `--grep 'showcase aoe-review'`; use
`DND_CAPTURE_AV1=1` for the RTX hardware encoder and `DND_CAPTURE_GPU=0`.
The `phantasmal-review` group exercises the initial save/damage order and
both end-of-turn outcomes through real server dice and initiative turn hooks.

The static Spellbook compatibility report is regenerated with
`npm run audit:spells -- --write`. It imports only catalogue data and the shared
support registry; it does not connect to a save or an AI service. The
`spellbook-compatibility` and `manualSpellCast` server suites cover catalogue-wide
classification, preserved authored rolls, actual combat paths, manual casts
without HP changes, selected Spellcasting/Pact spending, and concentration.
Spell support is a capability flag, not a claim that every spell rule is automated.
See [the complete audit](SPELLBOOK_COMBAT_SUPPORT.md).

The `spellRevisions`, `spellHealing`, `spellBuffs`, and `holdPerson` server suites
cover corrected 2024 formulas, exact legacy-profile matching, temporary HP versus
healing, one shared healing roll with six distinct recipients, casting modifiers
on critical damage, linked control cleanup, turn hooks, and extra-action authority.
Older save-only Hold Person assertions now expect the supported paralysis effect;
Prayer of Healing and Conjure tests retain their protection against executing
unsafe healing or obsolete creature summoning. These are changed feature contracts,
not disabled regressions. See [implementation scope](SPELL_FIXES_2024.md).

These are recordings or environment-dependent demonstrations, not required CI tests. Their explicit switches keep Windows-only ffmpeg lookup, long walkthroughs, and external API calls out of the normal regression run.

| Spec | Opt-in environment variable |
| --- | --- |
| `combat-environment-video.spec.ts` | `DND_ENVIRONMENT_DEMO=1` |
| `dm-affinity-dice.spec.ts` | `DND_DM_DICE_DEMO=1` |
| AV1 capture within `dm-dice-theme.spec.ts` (purple DM dice with gold numbers) | `DND_DM_GOLD_VIDEO=1` |
| `combat-fixes-video.spec.ts` | `DND_FIXES_DEMO=1` |
| `party-abilities-video.spec.ts` | `DND_PARTY_DEMO=1` |
| `party-spells-video.spec.ts` (five repaired party spells, regular darkness with no placed lights, +10 Stealth and no tracks, 3D tokens, NVIDIA AV1) | `DND_PARTY_SPELL_VIDEO=1` |
| Optional recordings within `miniature-battlefield.spec.ts` | `DND_MOVEMENT_DEMO=1` |
| Live wall-draft comparison within `miniature-battlefield.spec.ts` | `DND_WALL_DRAFT_DEMO=1` |
| Recorded mask conversion within `miniature-battlefield.spec.ts` | `DND_MASK_WALL_DEMO=1` |

For example, on Windows PowerShell with ffmpeg installed:

```powershell
$env:DND_ENVIRONMENT_DEMO = '1'
npm run test:e2e -- e2e/combat-environment-video.spec.ts
Remove-Item Env:DND_ENVIRONMENT_DEMO
```

The ordinary miniature, movement, combat, and visibility regressions still run without those switches.
