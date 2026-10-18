# Automated verification

Two suites, one purpose: prove the app starts and that a change did not break
something that worked. Neither suite judges how anything looks, sounds or
animates. That is verified by hand in two browser windows (`/dm` and `/join`).

```sh
npm run typecheck   # tsc --noEmit, server + client
npm test            # Vitest: server + shared rules + client/src/lib (fast, ~2,250 tests)
npm run build       # client (vite) + server (tsc)
npm run test:e2e    # Playwright: builds the client, runs the browser suite against a disposable server
```

Run `typecheck` and `test` before every commit. CI runs all four on every push
and pull request. **Adding a test? Read [`WRITING_TESTS.md`](WRITING_TESTS.md)
first**: when a test is needed, where it goes, and how to write one that holds.

## What each suite is for

- **Unit tests (`npm test`)** cover the rules engine and the server: dice,
  attacks, saves, damage traits, spells, rests, leveling, multiclassing,
  visibility shaping, persistence/migrations, role gates. They are pure, fast
  and deterministic. This is where most regressions are caught, and where a new
  rule or server behaviour gets its test.
- **Browser suite (`npm run test:e2e`)** is a short functional gate: real DM and
  player sessions over real sockets, exercising the flows a unit test can't
  reach (join, claim, create a character, cast, attack, approve a hidden roll,
  upload a map, apply a wall draft, level up). 108 tests in 37 files. A browser
  test earns its place only if it checks an outcome (HP changed, slot spent,
  token blocked, request rejected, state survived reload). Pixel colours,
  animation timing, shader output, dice art, sound cues, layout at a given
  viewport and video captures are **not** tested; those checks were removed in
  October 2026 because they were slow, brittle and verified by eye anyway.

Both commands use a throwaway database and the fixed secret `e2e-secret`; they
never touch the installed campaign save.

## Running the browser suite

```sh
npm run test:e2e                                                  # everything
npx playwright test -c e2e/playwright.config.ts e2e/smoke.spec.ts # one file (client already built)
```

- The suite passes on a plain checkout and a plain container. Monster figures
  are Git LFS objects; without `git lfs pull` the test server runs with
  `PLACEHOLDER_MODELS=1` (set only by `e2e/playwright.config.ts`) and serves a
  generated stand-in for any `.glb` that is a pointer file. A real install never
  sets this.
- On a software WebGL renderer (CI runners, cloud containers) `e2e/globalSetup.ts`
  detects it and `e2e/helpers/test.ts` multiplies every test and expect budget
  by `E2E_SLOW_FACTOR` (default 4). Specs import `test`/`expect` from
  `./helpers/test`, never from `@playwright/test` directly. `E2E_SOFTWARE_GL=0|1`
  overrides the probe.
- `E2E_PORT` overrides the disposable port (4099); `PW_CHROMIUM` points at an
  installed browser. The synthetic map video is encoded as VP9 when the test
  browser cannot decode H.264.
- CI runs the browser suite in two shards and uploads traces and screenshots
  as `browser-test-results-<shard>` on failure. Open a trace with
  `npx playwright show-trace <trace.zip>`.

## What a failure means

A failing test is a behaviour that used to work. Reproduce it on the base
branch before touching the assertion.

- Fix the app when the expected behaviour still applies.
- Update the assertion only when the workflow deliberately changed, keeping the
  outcome it protects.
- Never skip, quarantine or widen a test to get green.

## Browser coverage

| Area | Specs (`e2e/<name>.spec.ts`) |
| --- | --- |
| App starts, two live clients, REST/DM secret gates, library, placement, ADV/DIS | `smoke` |
| Characters: guided creator, stat rolls, server rejection of bad choices | `character-creator` |
| Leveling: DM grants, ASIs, spellbook, subclass choices, multiclass rules, Pact slots | `level-up`, `multiclass-level-up` |
| Combat outcomes: pending damage ownership, damage history, smite, maneuvers, quick menu | `damage-prompt-ownership`, `damage-roll-log`, `smite-damage`, `maneuver-damage`, `weapon-quick-menu`, `compact-checks` |
| Spells: areas and saves, rays, buffs, support flags, summons, party reactions, advanced spells, footprints | `spell-execution`, `spell-buffs`, `spell-support`, `party-spells`, `advanced-spells`, `lightning-footprints`, `dm-default-save` |
| Roll privacy and hidden DM approval | `hidden-roll-approval`, `hidden-area-save`, `save-privacy`, `unseen-creature-saves`, `ice-knife-order` |
| Live dice contract: faces match the server, disconnects, skipping | `live-dice-contract`, `live-dice-workflow` |
| Turns, rests, Hit Dice, initiative requests | `rest-turn-sound`, `player-initiative` |
| Maps: upload, animated maps, wall/door drafts, arches, feature selection, exploration reset | `animated-maps`, `map-setup-draft`, `map-arches`, `map-feature-selection`, `window-openings`, `reset-exploration` |
| Role security and resource ownership | `player-hud` |
| Chat audiences, annotations, creature scaling, offline asset cache | `chat-private`, `annotation-menu`, `creature-scaling`, `asset-cache` |

A few specs still accept an optional recording switch (`HIDDEN_REVIEW_VIDEO`,
`CAPTURE_HIDDEN_AREA`, `CREATOR_CAPTURE`, `ICE_KNIFE_CAPTURE`). They record a
headed Windows run through NVIDIA AV1 for review; unset, they do nothing and
never run in CI.
