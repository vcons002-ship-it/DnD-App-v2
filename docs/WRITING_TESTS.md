# Writing tests: when a test is needed, and how to write one that earns its place

Tests here answer one question: **does the app still work after a change?**
They do not check how anything looks, sounds or moves. The person running the
game verifies that by eye in two browser windows. Keep that split and the suite
stays fast, honest and green.

## 1. Decide whether a test is needed

Ask, in order:

1. **Would a user notice if this broke?** HP wrong, slot not spent, a token a
   player shouldn't move, a hidden roll leaking, a save failing to load, a
   request a player can make that only the DM should. Yes → it needs a test.
   A glow that's the wrong shade, a card that lingers 200 ms too long, a panel
   a few pixels wider at 430 px → no test. If you can only tell by looking,
   look.
2. **Is it a rule or a flow?** A rule (dice, modifiers, damage traits, spell
   scaling, rest recovery, visibility shaping, role gates, migrations) gets a
   **unit test**. A flow (join, claim, create a character, cast, attack and
   apply damage, approve a hidden roll, upload a map, level up) that a unit test
   can't reach gets a **browser test**, and only if no existing spec already
   walks that path. Extend an existing spec before adding a file.
3. **Is it already covered?** `grep` the test names first. One assertion added
   to a test that already sets up the scenario beats a new 100-line fixture.

Never add a test for:

- shader output, lighting, shadows, fog pixels, screenshots compared by colour;
- animation timing, reading holds, "settles within N ms", frame counts;
- dice art, materials, particle counts, sound cues;
- layout at a given viewport, "fits without scrolling", element bounds;
- video or AV1 captures, demos, performance comparisons;
- a feature flag's visual effect (test the state it writes, not the look).

Those were all removed in October 2026 (77 spec files) because they broke on
every visual tweak, took hours on a software renderer, and told us nothing a
glance at the screen didn't.

## 2. Where it goes

| Code under test | Test location | Runner |
| --- | --- | --- |
| `shared/*` pure modules | `server/src/<module>.test.ts` (Vitest runs from the server workspace) | `npm test` |
| Server domain logic, sockets, routes, DB | `server/src/<module>.test.ts` | `npm test` |
| `client/src/lib/*` pure helpers | `client/src/lib/<module>.test.ts` | `npm test` |
| A real DM + player flow in the browser | `e2e/<flow>.spec.ts` | `npm run test:e2e` |

React components and the Konva/three canvases have no component tests. Put the
logic in a pure module and test that; the rendering is verified by hand.

## 3. Writing a unit test properly

- **Test the rule, not the implementation.** Assert the number a player would
  see (`toHit`, `damage`, `curHp`), not internal call counts.
- **Make randomness explicit.** Stub it the way the existing suites do,
  `vi.spyOn(Math,'random').mockReturnValue(.5)` (or `0` / `.999` for a
  nat 1 / nat 20), and assert the exact number. Never assert on a range
  because the dice were real.
- **Server tests use the real SQLite layer in a temp file**, through the same
  helpers the socket handlers call (`sessions.ts`, `combat.ts`, `rests.ts`),
  not a mocked DB. Role gates are tested by calling the handler as the wrong
  role and asserting the refusal.
- **Migrations run twice.** Any `ensureColumn`/data migration test loads an old
  shape, migrates, asserts, migrates again and asserts nothing changed.
- **Visibility is a test per tier.** Anything new in a snapshot gets a check
  that `buildSnapshot` strips it for players when it should.
- One file per module, named after it. Describe blocks by behaviour, not by
  function name. No snapshot (`toMatchSnapshot`) tests.

## 4. Writing a browser test properly

A browser test is a short story: set up a real session, do what a user does,
assert what changed on the server.

- **Import from `./helpers/test`**, never from `@playwright/test`. That is what
  scales timeouts on a software GPU; a direct import silently loses it.
- **Build the scenario through the API and a DM socket**, not through menus.
  `POST /api/sessions` with `x-dm-passphrase: e2e-secret`, then `join` as DM
  over socket.io and emit `character:update`, `token:spawn`, `map:setActive`,
  `fog:setLayer` to lay the board. Set every stat the assertion depends on;
  never rely on the seed campaign's defaults. Turn on
  `session:setManualDamage` when the test clicks damage itself.
- **Drive only the step under test through the UI.** Click the attack button,
  the Create & play button, the Apply result button. Everything before and
  after is API.
- **Assert the outcome from a fresh snapshot**, not from the DOM: HP on the
  monster, `gold` on the character, the slot count, the token position, the
  roll-log length, a refused `emitWithAck`. A DOM assertion is fine for "the
  dialog closed" or "the button is disabled", never for position or colour.
- **Wait for state, not time.** `expect.poll(() => snapshot())` or
  `expect(locator).toBeVisible()`; no `waitForTimeout` except the rare
  "nothing should happen" check, and say why in a comment.
- **Live dice:** wait for the roll's card to go away
  (`.roll-reveal` count 0 with a generous timeout) before reading HP. Don't
  assert on the id printed in the card; it is the live-roll id, not the log id.
- **One flow per test, under a minute on a GPU.** If it needs
  `test.setTimeout(180000)` it is several tests or it is a demo.
- **Must pass without the LFS models and without WebGL.** The e2e server
  sets `PLACEHOLDER_MODELS=1`, and on a software renderer (CI) the test
  browser has no WebGL at all, so the app runs its 2D tokens and static dice.
  Never assert on the miniature layer's attributes, spell-effect kinds, tilt or
  loaded model urls; assert the token, condition or HP the effect belongs to.
- **No screenshots as evidence, no `sharp` pixel reads, no viewport matrices,
  no `test.use({isMobile})` layout checks.** A phone flow is tested the same
  way as a desktop flow: by what it changed.
- **Clean up.** Disconnect every socket in `afterEach`; close extra contexts.
- Name the test by the behaviour it protects ("a player cannot move a hidden
  enemy token"), not the feature it exercises ("token move").

## 5. Before you commit

```sh
npm run typecheck
npm test
npx playwright test -c e2e/playwright.config.ts e2e/<your-spec>.spec.ts   # client built
```

Run the one spec you touched twice. If it fails once in two runs it is not
done. Then run `npm run test:e2e` if you changed anything in `e2e/helpers` or
the server's join/snapshot path.

When an existing test fails after your change: reproduce it on the base branch
first. If it passes there, the app regressed; fix the app. If the workflow
deliberately changed, update the assertion to the new outcome and keep the
protection. Never skip, quarantine or widen a test to get green.
