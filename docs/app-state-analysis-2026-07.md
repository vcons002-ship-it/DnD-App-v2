# App state analysis — July 2026

A full review of the current codebase: security, stability, performance, correctness,
tooling, and product gaps. Baseline at the time of review: `npm run typecheck` clean,
**384/384 server tests passing** (40 files), client production bundle ~250 KB gzipped in
three chunks (react / konva / app). Findings are consolidated from four deep passes
(server core, client/canvas, security & visibility, cross-cutting quality) and ranked.

**Bottom line:** the codebase is unusually disciplined for its size — clean client↔server
event parity (all 92 events paired), zero TODO/`@ts-ignore`/`as any` debt, strict TS
everywhere, sanitization consistently applied at untrusted boundaries, and a genuinely
careful `visibility.ts`. The systemic weaknesses are: **(1)** the internet-facing security
posture is open-by-default, **(2)** one malformed packet can crash the server, **(3)** a
handful of damage events skip the otherwise-consistent role gates, **(4)** combat-time
client rendering redraws the whole canvas at 60 fps, and **(5)** there is no CI, no e2e,
and no backup/undo safety net for the DM's data.

---

## 1. Security (internet-facing via tunnel/GCP — treat as public)

### Critical

- **C1 — No DM authentication by default.** `config.ts:21` defaults `dmPassphrase` to
  `''` and every DM gate is `if (config.dmPassphrase && ...)` — with no passphrase set,
  the check is skipped entirely. Anyone who knows a session code can
  `join({role:'dm'})` and gets full authority (delete sessions, rewrite sheets, read all
  monster stats, change settings, upload files). **Fix:** make a DM secret mandatory —
  generate one at first boot and print it in the console links; never treat "no
  passphrase" as "open".

### High

- **H1 — `GET /api/sessions` enumerates every session code + name, unauthenticated**
  (`routes.ts:111`). This defeats the "the code is the real gate" model and turns C1 from
  "guess a code" into "own everything". Gate it behind the DM secret.
- **H2 — Character hijack via leaked `ownerId`.** The player snapshot sends the
  `characters` array **unshaped** (`visibility.ts:311`), including every PC's `ownerId`
  (durable per-browser id) and `claimedBy` (live socket id). Join accepts a
  client-supplied `playerId` (`socketHandlers.ts:247-256`), and reclaim grants a character
  when `ownerId === playerId` — so a malicious player can read a victim's `ownerId` from
  the raw snapshot, rejoin with it, and be auto-handed the victim's PC. **Fix:** strip
  `ownerId`/`claimedBy` from other players' characters in `visibility.ts` (replace
  `claimedBy` with a boolean/holder name); treat `playerId` as a bearer secret.
- **H3 — Unauthenticated paid-AI endpoints.** `/creatures/lookup`, `/items/generate`,
  `/shops/generate`, `/comfy/generate` (routes.ts:327/463/473/241) have no gate and no
  rate limiting anywhere — a script can run up the DM's Gemini bill or spam ComfyUI.
- **H4 — Stored XSS via uploads.** `/icons` (routes.ts:62-75) takes the extension from
  client `originalname` and trusts client-declared mimetype (`startsWith('image/')`,
  trivially spoofed; SVG with script also passes); files are served same-origin by
  `express.static` from `/uploads` with content-type by extension. Upload `x.html` (or an
  `.svg`) → script execution on the app origin. **Fix:** whitelist raster extensions or
  sniff magic bytes; serve `/uploads` with a restrictive CSP.

### Medium

- **M1 — SSRF.** `POST /api/icons/from-url` (routes.ts:512) validates protocol and
  response content-type but not the target — it will fetch loopback/private/link-local
  addresses (e.g. `169.254.169.254` on the GCP VM), and its differing 422 messages make it
  an internal port scanner. `POST /api/settings` (when no passphrase) lets anyone point
  `ollamaUrl`/`comfyUrl` at internal hosts (fetched server-side) or clobber the Gemini
  key. **Fix:** require the DM secret; resolve + reject private IP ranges before fetching.
- **M2 — Hidden/off-map monster roster leaks to players.** `visibility.ts:270` maps
  `toPlayerMonster` over **all** session monsters, not just those on visible tokens on the
  player's map — a player inspecting the raw snapshot enumerates hidden-token and
  staged-map creature names/dispositions/dead flags (boss names, ambush existence).
  Restrict the player `monsters` array to creatures referenced by tokens that player can
  actually see.
- **M3 — Cross-session scoping is UUID-luck, not enforcement.** `token:move/drag/resize/
  delete/duplicate/setHidden`, `initiative:set`, `character:update/delete`,
  `object:interact`, `trap:disarm` fetch by client-supplied id without checking the entity
  belongs to the caller's session (the `monsterInSession` pattern exists at
  `sessions.ts:2291` but isn't applied to these). On the always-on multi-session VM,
  sessions are mutually writable given a leaked id. Apply session scoping uniformly.

### Low

- Session codes: 4 chars from a 31-char alphabet generated with `Math.random()`
  (`db.ts:516`), no join rate limiting — brute-forceable; use `crypto` and lengthen once
  H1 is closed.
- Gemini key stored plaintext in `data/settings.json` (never returned by any API and
  never logged — good); ensure `data/` permissions on shared VMs.
- 25 MB/file uploads with no quota/rate limit → disk-fill on the VM.
- Socket CORS reflects any origin (`origin:true`) — acceptable (no cookie auth to ride),
  note only.

**Perspective:** requiring a DM secret (C1) + closing the two enumeration leaks (H1, H2)
converts nearly every other finding from "any internet visitor" to "an already-invited
player" — the intended trust boundary. Those three changes are the security priority.

---

## 2. Stability — the crash class

- **No error boundary anywhere.** No `uncaughtException`/`unhandledRejection` handler in
  `index.ts`, no try/catch wrapper around socket handlers (Socket.IO v4 doesn't catch
  listener throws), and Express 4 doesn't catch async route rejections. **One malformed
  packet from any joined player kills the whole table mid-session.** Concrete vectors:
  - `ability:set` (`socketHandlers.ts:949`) stores `roll.dice` **verbatim**; `ability:roll`
    later does `rollDice(expr)!` (`combat.ts:132`, `:850`) which returns `null` for an
    invalid expression → `TypeError` → process exit. Worse, the bad string is persisted,
    so the crash **recurs after every restart** until the row is hand-edited.
  - `token:move` (`socketHandlers.ts:604`), `character:update` (`:786`),
    `initiative:set` (`:1425`), `map:setGrid` (`:305` — non-numeric `widthFt` → `NaN` →
    bound as NULL → NOT NULL constraint throw): unvalidated payloads reach better-sqlite3
    binds, which throw on wrong types.
  - `ai:fillCreature`/`ai:fillCharacter` and async routes (`/creatures/lookup`,
    `/comfy/generate`, `/rulebook`) are one missed internal catch away from an
    unhandled rejection (Node ≥15 exits).

  **Fix (small):** a `safeOn(socket, event, handler)` wrapper that try/catches + logs +
  emits `error`; process-level handlers as a last resort; validate `roll.dice` with
  `rollDice()` at `ability:set` time; type-guard numeric payloads before binds.

- **Ungated damage events (also griefing):** `damage:apply` (`socketHandlers.ts:683`),
  `tempHp:set` (`:694`), `tokens:damage` (`:1307`) check only `Number.isFinite` — **any
  player** can damage/heal any creature, PC, or object in any session by refId (amounts
  clamped ±10000, so bounded but unauthorized). `dice:clearLog` (`:1523`) has no DM gate —
  any player wipes the shared roll log. These are the anomalies: `condition:set` right
  next to them is properly owner-gated, and `tokens:damage`'s three siblings are all
  DM-gated. **Fix:** gate like `condition:set` (DM, or owning player of a PC/friendly
  target).

---

## 3. Performance

### Client (the bigger win — combat-time rendering)

1. **Single Konva `Layer` for the entire scene** (`MapStage.tsx:1542-1860`): map bitmap,
   grid, both fog shapes, decals, tokens, measurements, annotations, FX, cursors all in
   one layer — Konva redraws per layer, so any animated node repaints everything.
2. **The active-turn ring runs a 60 fps `Konva.Animation` bound to that layer for the
   entire combat** (`TokenShape.tsx:254-268`) — i.e. during the app's hottest period the
   full scene (including the fog loop below and hundreds of grid `Line` nodes)
   rasterizes every frame. This is the single biggest perf multiplier in the client.
3. **Fog is an uncached per-cell `fillRect` loop in a `sceneFunc`**
   (`MapStage.tsx:1599-1641`) — ~19k cells on a large map, re-executed on every layer
   draw (i.e. every frame while the ring pulses).

   **Fix direction for 1–3 (localized):** split into ~3 layers (static map/grid/fog —
   cached; tokens; FX/overlay), cache the fog shape and invalidate only on
   `fogRevealed` change, and scope the turn-ring animation to its own tiny layer or a
   cheap tween. These three changes would transform combat performance on big maps.
4. **Whole-snapshot subscriptions at the top of every route**
   (`DmView.tsx:20`, `PlayerView.tsx:18`, `DmDataView.tsx:45`, …): zero `useShallow`, no
   slice selectors — every `state:snapshot` (fired after every mutation by anyone,
   including each fog-brush batch) re-renders the entire tree. `TokenShape`/`DataCard`
   are memoized with content comparators (good); the heavy panels
   (`DmPanel`, `DicePanel`, `SelectedTokenPanel`, `StatBlock`, `CharacterSpells`) are not.
5. **MapStage re-renders at pointer-move frequency**: token hover sets a fresh object per
   mouse event (`MapStage.tsx:694`, `TokenShape.tsx:247`), and every remote cursor/drag
   ghost packet (~20/s per user) does `set({cursors:{...}})` → full 2,100-line MapStage
   render. Move cursors/ghosts/hover into small self-subscribing children.
6. Smaller: wheel/pinch zoom re-renders MapStage per event (panning already does this
   right — commit on `dragend`); `resolveToken` linear scans per token per render
   (build a memoized `Map` per snapshot); grid as one `Shape` instead of hundreds of
   `Line` nodes; `Silhouette` component type defined inside render
   (`TokenShape.tsx:288` — forces remounts); `useImage` has no cross-component cache.

### Server

1. **Per-mousemove DB queries:** `cursor:move` (`socketHandlers.ts:1087`) runs a
   `SELECT ... WHERE claimed_by = ?` (unindexed) per cursor packet at ~30–60 Hz per
   client; `token:drag` does several lookups per packet. Cache the roller name on the
   connection at join/claim time.
2. **Missing indexes on per-broadcast queries:** `listAnnotations`/`listMeasurements`
   filter by `map_id` but the indexes are on `session_id` (`db.ts:239-240`) — full scans
   of all sessions' rows on **every snapshot build**. Also missing: `tokens(kind, ref_id)`,
   `characters(claimed_by)`. One-line `CREATE INDEX IF NOT EXISTS` fixes.
3. **Almost no transactions:** only 3 exist. `deleteMap`, `duplicateToken`,
   `resolveAttack` (~6 separate WAL commits), and all bulk loops
   (`setTokensCondition`, `rollAllInitiative`) should be wrapped in `db.transaction` —
   integrity + a large write-throughput win.
4. **Full-snapshot fanout on every mutation** (`connections.ts:45`): each change re-reads
   all characters + monsters (~15 `JSON.parse` per row), roll log, chat, and per-map
   collections, then emits complete snapshots to N clients. Fine at design scale (and the
   `createSnapshotBuilder` sharing is a genuine win), but interactive gestures
   (`annotation:move`/`resize`, `mapImage:move`) run `afterChange()` per event. Gesture-end
   commits (or deltas, eventually) are the fix.
5. **Unbounded growth:** `chat_messages` is never pruned (roll log got a 500 cap, chat
   didn't); annotations/measurements accumulate per map and ship whole in every snapshot;
   `uploads/` orphans are never GC'd. Fog paint rewrites the whole revealed-cells JSON
   per brush event (`sessions.ts:251-269`).
6. Minor: double snapshot build+send on join (`socketHandlers.ts:265-279`); a second
   `assistant:ask` orphans the first request's AbortController (`:1118`); FX queued while
   a session has no sockets replay as stale floaters to the next joiner
   (`sessions.ts:2609`).

---

## 4. Correctness bugs

- **Warlock spells-known table is wrong** (`shared/spellPrep.ts:77`): the row is roughly
  half-caster progression (L10: table says 6, real is 10) — players show falsely over-cap
  (red) for half their spells. Wizard/bard/druid cantrip starts are also off by one
  (documented as approximations, but cheap to correct).
- **Server melee-range rules use the legacy grid scale, not width-ft**
  (`shared/distance.ts:19-21` vs `MapState.mapWidthFt` as the documented source of
  truth): prone-advantage and auto-crit-vs-paralyzed (`combat.ts:328`) can disagree with
  the distances players measure on screen when scale was set via map width / "Match map
  grid". Make `tokenDistanceFt` prefer `mapWidthFt / imageWidthPx` with legacy fallback.
- **Offline-queued actions are silently lost on reconnect** while
  `ConnectionStatus.tsx:10` promises "changes will sync when you're back online":
  socket.io-client flushes buffered emits **before** the `connect` handler re-sends
  `join`, so they arrive on a fresh socket id the server doesn't recognize. Hold intents
  until the join ack, or make the banner honest.
- **A server-rejected `token:move` desyncs the mover's screen permanently**
  (`TokenShape.tsx:158-162`): the Konva node keeps its dropped position and the memo
  comparator never re-applies unchanged `x/y` — nothing snaps it back. Reset
  `e.target.position(...)` on dragEnd and let the snapshot move it.
- **In-game server `error` events are invisible** (`socket.ts:678` stores it; only the
  entry screens render it) — a rejected action just silently does nothing. Route `error`
  into the same toast as `notice`.
- **`useSelection` BroadcastChannel breaks under StrictMode** (`useSelection.ts:19-43`):
  channel constructed in `useMemo` (render side effect; dev double-render leaks one) and
  the effect cleanup closes the memoized channel that the re-run effect then reuses →
  `postMessage` on a closed channel throws in dev. Create + close inside one `useEffect`.
- **Multi-select group drag**: only the grabbed token moves smoothly; followers teleport
  after N separate `token:move` round-trips (`useSelection.ts:60-78`). A batched
  `tokens:move` event + optimistic follower offsets.
- **Dead guard in `object:paste`** (`socketHandlers.ts:391-395`): the "active map only"
  check is an empty `if` body — comment claims a check that doesn't happen. Delete or
  reinstate.
- Small: `token:move` coordinates written unclamped (`sessions.ts:474` — NaN/±1e9 park a
  token off-universe); `resource:set` stores `max` unvalidated; `parseSheetJSON` casts
  `weapons`/`sheetAbilities` unvalidated (a crafted import sets `attackBonus: 999` —
  add a `sanitizeWeapons`); stale hpNote comments (`types.ts:815`, `visibility.ts:220`)
  say neutral sees it — code (friendly-only) is correct, fix the comments.

---

## 5. Tooling, tests, DX

- **No CI quality gate at all.** `.github/workflows/` has only the PR-launcher
  automation; nothing runs typecheck/tests/build on push or PR — the project's own
  "always run typecheck+test before committing" rule is enforced purely by discipline.
  A ~20-line workflow is the single highest-leverage tooling fix.
- **Riskiest untested areas** (server pure-logic coverage is strong — combat 101 cases,
  visibility 31): **(1)** `socketHandlers.ts` role gates have zero tests — exactly where
  the ungated damage events lived; a table-driven "event × role → accepted/refused"
  matrix would have caught them. **(2)** Reconnection/claim-grace concurrency
  (`CLAIM_GRACE_MS`, `pendingReleases`, `reclaimForPlayer`) — the trickiest logic in the
  app, uncovered. **(3)** DB migrations are never run against an old-schema fixture
  (tests share one hardcoded on-disk DB; make `config.dbPath` env-overridable and check
  in a v1 fixture). **(4)** The client has no test runner at all.
- **Playwright 2-window e2e is feasible and recommended** (Playwright is preinstalled in
  this environment): DM context creates a session, player context joins/claims/moves,
  assert sync — and finally cover the reclaim-grace path. Prereqs are small: export a
  `start()` from `index.ts` (it currently listens at module top level), `DB_PATH` env
  override, tunnel skippable via env.
- **No linter/formatter** (Biome would be one cheap dep), **no Node pinning**
  (`engines` + `.nvmrc`; better-sqlite3 is ABI-tied, and the install.bat audience makes
  this a real risk), `shared/` has no tsconfig of its own (checked transitively under two
  different module resolutions).
- **Dependencies:** all maintained, none with known CVEs; express 4, React 18,
  Vite 6, better-sqlite3 11, react-router 6 are each one major behind — plan a deliberate
  upgrade train only after CI + smoke tests exist.

---

## 6. Product gaps (ranked by table value)

1. **No undo for destructive DM actions** — token/creature delete, fog cover-all rely on
   confirms alone. Even a small server-side last-N undo stack removes the scariest
   misclicks.
2. **No session backup/export** — the whole campaign lives in `data/game.db` +
   `uploads/` with no in-app export/restore; matters more now the GCP deploy kit exists
   (VM dies → campaign gone). A `GET /api/sessions/:code/export` (JSON + assets zip) +
   import is medium effort, high value, and doubles as migration/e2e fixtures.
3. **Discord voice (Phase 7)** — the roadmap's own phased plan starts with a per-session
   "Join voice" deep-link button: a genuine quick win.
4. **Condition duration auto-expiry** — `Condition.round` is already stamped ("T3" chips);
   "expires end of round N" is the cheapest next automation step. Then: cover, exhaustion,
   grapple/restrained movement, action economy.
5. **Google Slides live-token overlay** — cross-origin iframe makes it a research spike;
   decide to drop or timebox.
6. **ROADMAP hygiene** — stale unticked duplicates (library block, drag-reorder, the 5e
   audit list contradicts later ticked items).

---

## 7. What's done notably well (keep doing this)

- `createSnapshotBuilder` change-cycle sharing: session queries run once per change
  regardless of client count; per-caster `apply` overlays as cheap per-socket patches.
- The ephemeral drag/cursor channels reuse the exact snapshot fog/visibility gate, so a
  drag provably can't reveal more than a committed move; the decision not to fog-gate
  cursors (which would leak the fog boundary) is documented inline.
- `visibility.ts` tiering: AC redaction, `dmOnly`/`apply`/hpNote stripping with a correct
  per-caster overlay, loot gating on every tier.
- Client drag feel: imperative Konva tether, no React involvement, no round-trip snap —
  effectively free optimistic movement; token memoization with content comparators +
  identity-stable handlers is the right mitigation for the snapshot model.
- Durability discipline: idempotent migrations with parallel-race handling, defensive row
  mappers, per-row legacy migration so one corrupt row never blocks boot,
  `sanitizeModifiers`/`sanitizeItems` at every boundary feeding server roll math.
- Zero TODO/FIXME/`as any` debt; exact 92-event client↔server parity; strict TS both sides.

---

## 8. Prioritized action plan

### Now (small diffs, close the worst holes)

1. `safeOn` error-boundary wrapper for all socket handlers + process-level handlers;
   validate `roll.dice` at `ability:set`; numeric type-guards before DB binds. *(crash class)*
2. Gate `damage:apply` / `tempHp:set` / `tokens:damage` / `dice:clearLog`; add a
   role-matrix test for socketHandlers. *(authorization)*
3. Mandatory DM secret (generate at first boot, print in console); gate
   `GET /api/sessions`, `/settings`, library-destructive routes, AI endpoints. *(security)*
4. Strip `ownerId`/`claimedBy` from other players' characters in `visibility.ts`;
   restrict the player `monsters` array to visible tokens. *(leaks)*
5. Upload extension whitelist / magic-byte sniff; private-IP blocklist on
   `icons/from-url`. *(XSS/SSRF)*
6. CI workflow: `npm ci` + typecheck + tests + build on push/PR. Pin Node. *(tooling)*
7. One-liners: the two missing `map_id` indexes; warlock spells-known row; dead
   `object:paste` guard; `token:move` coordinate clamp; chat-table prune; route `error`
   events into the toast; fix stale hpNote comments; tick stale ROADMAP entries.

### Next (localized, high-impact)

8. Konva: split/cache layers, cache the fog shape, scope the turn-ring animation.
   *(combat-time perf — the biggest UX win in this list)*
9. Self-subscribing cursor/ghost/hover children + `useShallow` slice selectors for the
   heavy panels; snap-back on rejected `token:move`.
10. `db.transaction` around `deleteMap`/`duplicateToken`/`resolveAttack`/bulk loops;
    cache roller name on the connection. *(server perf/integrity)*
11. Reconnect: hold queued intents until the join ack (or fix the banner);
    `useSelection` BroadcastChannel lifecycle; batched `tokens:move` for group drag.
12. `tokenDistanceFt` width-ft scale fix; `sanitizeWeapons` on sheet import.

### Later (projects)

13. Playwright 2-window smoke suite (prereqs: `start()` export, `DB_PATH` env).
14. Session export/backup + restore.
15. Player-shaped types (`CharacterPublic`, `RollEntryPublic`) so visibility stripping is
    compile-checked; split `types.ts` into domain/payloads/events.
16. Undo stack for destructive DM actions; condition auto-expiry.
17. Deliberate dependency upgrade train (express 5, React 19, Vite 7) once CI exists.
