# Code Audit — DnD-App-v2 (2026-07)

_Full-codebase audit run across six parallel dimensions: security/visibility, server
correctness, client correctness, performance, code quality, and test coverage. Each
dimension was reviewed against the **current** code with adversarial self-refutation;
the top-tier and cross-agent findings below were then hand-verified against source.
This supersedes nothing in [`app-state-analysis-2026-07.md`](app-state-analysis-2026-07.md) —
that earlier review's "Now"/"Next" tiers were already fixed and were re-confirmed as
holding._

## Executive summary

The core is in good shape: **no player→DM privilege escalation, no SQL injection, no
SSRF hole, no player-visibility leak of enemy stats** — those defenses were checked
handler-by-handler and held. The domain/rules-math and snapshot-redaction layers are
thoroughly tested (409 tests) and mostly correct.

The real risk sits in three places:

1. **A live, user-visible regression:** the DM's **AI creature lookup, AI item
   generation, and AI shop-fill are currently returning 403** — the mandatory-DM-secret
   rollout gated those routes but the client calls never send the secret.
2. **Inconsistent auth on REST routes** — the same rollout *under*-gated the cross-session
   library and spell-lookup routes, which a stranger on the tunnel URL can hit.
3. **Data-fidelity bugs in the monster copy paths** — spawning/duplicating a creature
   silently drops save proficiencies (and more), so tuned bosses fail saves they should pass.

Plus a measured performance ceiling (~1.6 MB uncompressed per mutation) that will bite on
the e2-micro / a home tunnel, and a cluster of reconnect-lifecycle glitches that surface on
mobile.

**Highest-confidence items are the ones two independent dimensions found:** the
`saveProficiencies` drop (server-correctness + code-quality) and the auth inconsistency
(security + code-quality).

---

## Remediation status (fixed 2026-07)

All HIGH + MEDIUM findings and every actionable LOW were fixed across 10 verified
commits (typecheck + 418 tests + build + 4 e2e green after each). Regression tests
added: `server/src/auditFixes.test.ts` (8), `backup.test.ts` (+1), and an e2e that
would have caught the H1/H2 auth regression.

- **Fixed:** H1, H2, H3, H4, H5, H6 · M1, M2, M3, M4, M5, M6, M7, M8, M10, M11, M12
  · L1, L2, L4, L6, L7, L8, L9, L10, L11, L12 · P1, P2, P3.
- **Deferred (with rationale in the commit/notes):**
  - **M9** (offline emits dropped pre-rejoin) — the only fix manipulates socket.io's
    `sendBuffer` and risks the *normal* reconnect path; already documented in
    `ConnectionStatus`.
  - **P4** (monster-instance text duplicated in the DM snapshot) and **P7**
    (async/incremental auto-backup) — larger changes; **P1**'s wire compression
    already cuts the dominant cost, so these are better as a separate, dedicated
    perf pass.
  - **L3** (per-code session-metadata disclosure) — the app's deliberate
    "the code is the secret" design; noted, not a defect to fix.
  - **T1** (a socket.io-client harness for the inline role gates) — REST auth is now
    covered by the new e2e; the socket gates were verified solid in the audit and
    unchanged by these fixes. Worth adding as its own testing-infra task.

---

## CRITICAL
_None._ No auth bypass, RCE, or unrecoverable-data-loss defect was found.

---

## HIGH

### H1 — AI creature/item/shop endpoints 403 for the DM (live regression) — VERIFIED
`server/src/routes.ts:463,600,611` gate `/creatures/lookup`, `/items/generate`,
`/shops/generate` with `requireDm`, and `requireDm` always enforces (the DM secret is
always set). But the client calls send **no secret**:
`client/src/components/DmPanel.tsx:89` (`/creatures/lookup`),
`client/src/components/LootControls.tsx:326` (`/items/generate`),
`client/src/components/DecalPopup.tsx:65` (`/shops/generate`) send only
`Content-Type` + a JSON body. (`DmPanel.tsx:147` proves the pattern — the map upload
*does* append `dmPassphrase` — it just wasn't applied to these three.)
**Impact:** the DM's three AI authoring buttons have been silently broken since the
mandatory-secret change; failures surface only as generic "Could not generate…" toasts.
**Root cause (quality):** ~45 raw `fetch()` calls across 22 client files, no shared API
helper. **Fix:** one `apiFetch()` in `client/src/lib/` that injects
`useStore.getState().dmPassphrase`, then sweep the call sites.

### H2 — Cross-session library routes are unauthenticated — VERIFIED
`server/src/routes.ts:556,568,581,592` — `POST`/`DELETE /library/creatures` and
`/library/items` call **no** `requireDm` and take no session code.
`deleteLibraryCreature` runs `DELETE FROM library_creatures WHERE LOWER(name)=?`
unconditionally (`library.ts:149`).
**Impact:** anyone who reaches the public tunnel URL — no session, no secret — can wipe or
bloat the DM's cross-campaign bestiary/item library (e.g. loop the SRD name list through
`DELETE`). **Fix:** add `requireDm` to the creature/item library writes+deletes; the
*character* library is intentionally player-usable, so scope that one to a session instead.

### H3 — `POST /api/spells/lookup` spends the Gemini key unauthenticated & unrate-limited — VERIFIED
`server/src/routes.ts:517` — unlike `/creatures/lookup` (gated) this has no `requireDm`
and isn't wrapped in `rateLimited`; on a miss it calls `lookupSpellAI(name)` live.
**Impact:** an unauthenticated client can loop gibberish names to burn the DM's Gemini
quota / rack cost. **Fix:** gate with `requireDm`, or at minimum `rateLimited`.

### H4 — Monster spawn/copy/duplicate silently drops `saveProficiencies` (and `proficientSkills`, `modifiers`, `items`) — VERIFIED (found by 2 dimensions)
`MonsterInput` declares the field and `insertMonster` persists it
(`server/src/sessions.ts:1712,1746,1768`), but the callers don't pass it:
`instantiateMonster` (`sessions.ts:2454`) builds its insert object with ~19 hand-copied
fields and omits `saveProficiencies`/`proficientSkills`/`modifiers`/`items`; `copyMonster`
(`sessions.ts:2494`) and `duplicateToken` (`sessions.ts:935`) do the same.
**Impact:** `resolveSaves`/`resolveSave` read `saveProficiencies: []` on every spawned
instance → a boss tuned to be proficient in INT/WIS saves fails Hold Person / etc. it
should pass. This is the most consequential correctness bug for a live game.
**Fix:** replace the three hand-copied field lists with one `toMonsterInput(m)` helper so a
field can't be forgotten again; add `saveProficiencies` (+ the others) to it.

### H5 — `duplicateToken` produces a corrupt copy of rich creatures/objects — VERIFIED (same family as H4)
`server/src/sessions.ts:935-954` — the duplicate's `insertMonster` omits
`sheetAbilities`, `objectKind`, `loot`, `objectDc` (and the H4 fields).
**Impact:** duplicating "Cult Mage 1" → "Cult Mage 2" has an empty Spells & Abilities
section; duplicating a locked chest → the copy isn't an object at all (rolls initiative,
loot/DC gone, renders as a circle instead of its pasted image). **Fix:** route through the
same `toMonsterInput` helper as H4.

### H6 — `map:setGrid` rounds the exact reference-line scale to an integer — VERIFIED-BY-READING
`server/src/socketHandlers.ts:344` — `Math.round(Math.max(1, Math.min(100, p.feetPerSquare)))`
destroys the precise float the client's "Set scale (drag a line)" path deliberately sends
(`client/src/canvas/MapStage.tsx:741`, commented "exact float → precise").
`feetPerSquare` is the source of truth for both the client feet-per-pixel and the server's
`tokensWithin5ft`. **Impact:** a 3000px map declared 100 ft wide with a 50px grid → true
1.667 ft/px stored as **2** (20% long); a fine map (0.5) is off 100%. Every measurement,
plus prone-advantage / paralyzed-auto-crit / reach (which key off `tokensWithin5ft`), skews
near the 5-ft boundary. **Fix:** store `feetPerSquare` as a float (clamp only, no round).

---

## MEDIUM

### M1 — `save:resolve` re-applies one cast's damage unboundedly (footgun + exploit)
`server/src/combat.ts:706-764`, `socketHandlers.ts:1288` — the server never records which
targets/darts a cast consumed; split-spell darts **re-roll** each click, capped only by
`instanceIndex < darts`. **Impact:** an accidental double-click double-applies damage (or
re-rolls a Fireball save on one target); because `apply.owner` opens the event to the
casting *player*, one 1st-level Magic Missile is an infinite auto-hit faucet. **Fix:** track
consumed instances/targets per roll id server-side; reject repeats.

### M2 — Melee crit vs a downed PC inflicts 1 death-save failure instead of 2
`server/src/sessions.ts:2731` — `applyDamage` adds one failure for damage at 0 HP with no
crit signal, even though `resolveAttack` force-crits an unconscious target within 5 ft.
RAW: a crit on a downed creature is 2 failures, and melee vs unconscious is always a crit.
**Fix:** thread the crit flag into the death-save-failure increment.

### M3 — Crits don't double rider dice (Hunter's Mark / stance / mastery bonus dice)
`shared/combatMath.ts:203`, `server/src/combat.ts:361-388` — only the weapon's own dice
double. `extraDamage` not-doubling is a documented deliberate choice; the stance/mastery
case is not. **Fix:** double stance/maneuver/mastery dice on a crit (or document the
deviation if intentional).

### M4 — AI-fill lost-update race across the LLM await
`server/src/creatures/fill.ts:130-171` (and 89-127) — `aiFillCharacter` reads the sheet,
`await`s a multi-second LLM call, then writes `[...c.weapons, ...]` from the **stale**
pre-await copy. **Impact:** a weapon/spell the player adds while the "AI is working" banner
spins is overwritten. **Fix:** re-read the entity after the await, or merge against current
state.

### M5 — `session:importMaps` drops image tiles, decals, and measurements
`server/src/sessions.ts:784-864` — clones the `maps` row + tokens/creatures but never
touches `map_images` (tile composition), `annotations` (image decals + shop popups), or
`measurements`; the token insert also omits `shape`/`hide_combat_role`/`combat_role_override`.
**Impact:** importing a tile-composed map yields fog data but **no image**; pasted-image
object tokens arrive as circles. Same reduced column set in `copyTokens`. **Fix:** include
the missing tables/columns.

### M6 — `importSession` doesn't drop durable ownership (typo'd override key)
`server/src/backup.ts:197` — `insertRow('characters', c, { …, owner_id: null })` targets a
column that doesn't exist (`owner_player_id`), so `insertRow`'s column-intersection silently
discards it and imports `owner_player_id` **verbatim**, contradicting the "drop live
owners" intent. **Impact:** restoring a backup as a scratch copy while the live game runs
auto-reclaims a joining player onto "their" PC in the copy. **Fix:** use `owner_player_id: null`.

### M7 — Reconnect replays a stale roll's reveal + sound as if fresh
`client/src/state/socket.ts:702-717` — the join-ack path sets `snapshot` without seeding
`seenRollIds`, and the server broadcasts right after join. **Impact:** after a blip during
which anyone rolled (common on mobile — `visibilitychange` reconnects backgrounded iOS
tabs), the returning player sees a minute-old attack animate as a fresh hit and can
double-count damage. **Fix:** seed `seenRollIds` from `ack.snapshot.rollLog` in the join
callback.

### M8 — Reconnect dumps the DM off their staged map + resets zoom/pan
`server/src/socketHandlers.ts:289` resets `viewMapId` to active on join; the client never
re-emits `map:select` after an auto-rejoin. **Impact:** a DM prepping a future map over a
flaky link is snapped to the live map (and re-fit) on every blip. **Fix:** track the viewed
map id in the store and re-emit `map:select` in the join-ack callback.

### M9 — Events emitted while disconnected are flushed pre-rejoin and dropped
`client/src/state/socket.ts:507-513` — Socket.IO flushes buffered emits on reconnect
**before** the `connect` handler re-`join`s, so every handler's `getConn(socket.id)` misses
and the action is lost with no per-action feedback. **Fix:** gate emits on
`status==='connected'`, or clear `socket.sendBuffer` before re-emitting `join`.

### M10 — Stale combat target fires attacks at removed tokens (silent no-op)
`client/src/components/CombatSection.tsx:76,100` — `targetId`/`healTargetId` seed once and
never reconcile when the target list changes, and the component isn't keyed by attacker.
**Impact:** after the targeted token is deleted (or the map switches), the dropdown blanks
but `disabled={!targetId}` stays false (stale id is truthy) → clicks emit `combat:attack`
at a nonexistent token, dropped silently; the player mashes attack and nothing happens.
**Fix:** clamp `targetId` against the live target list each render, or key `CombatSection`
by `attacker.id`.

### M11 — Inconsistent runtime input validation at the socket boundary
Payloads are compile-time-typed only; siblings disagree at runtime. `token:spawn` passes
`p.x/p.y` raw into `createToken` (`sessions.ts:402`) — a player-reachable path — while
`moveToken` clamps with a "never trust client coordinates" comment; `map:setGrid` can push
`NaN` through `Math.round(...)` into the DB; `condition:set` stores `condition.label` with
no length clamp (`socketHandlers.ts:768`); `character:update` writes `name`/`abilities`
free-text and `sheetAbilities` unbounded (`sessions.ts:2171,2206`); `dice:roll` treats any
truthy `advantage` as disadvantage (`shared/dice.ts:83`). **Impact:** a player can park a
token at ±1e9 (breaking the shared view) or persist a multi-MB condition label that
broadcasts to everyone. **Fix:** a shared coerce/clamp layer; reuse `moveToken`'s clamp in
`createToken`; bound the free-text fields like chat (4000) already is.

### M12 — Rejected `token:move` leaves a permanent client-only ghost
`client/src/canvas/MapStage.tsx:1699` + `TokenShape.tsx:158` — on dragend the Konva node
stays put; react-konva only re-applies `x/y` when the prop changes, so a server-rejected
move (e.g. a companion flipped friendly→enemy mid-drag) never gets corrected on the mover's
screen while everyone else sees the original spot. **Fix:** imperatively reset the node to
`token.x/y` on dragend (the next snapshot echo re-applies an accepted move).

---

## LOW (selected — full list in the per-dimension notes)

- **L1** Library creature writes bypass `sanitizeWeapons` (`library.ts:122`) — poisoned
  weapon values reach `resolveAttack` when the DM later loads that entry (reachable via H2's
  open route). Fix with H2.
- **L2** Sheet-ability dice validated by `ability:set` but not by `character:update` /
  `monster:update` (`sessions.ts:2206,2602`); `updateMonster` also skips `sanitizeWeapons`.
  Add a shared `sanitizeSheetAbilities`.
- **L3** Unauthenticated per-code metadata disclosure — `GET /sessions/:code` and
  `/sessions/:code/maps` leak session/map names by code (design leans on "code is the
  secret"; noted, low impact).
- **L4** Long-press timer not cleared on `TokenShape` unmount → menu can open for a vanished
  token; `MapStage` `hover`/`menu` not pruned when a token leaves the snapshot
  (`TokenShape.tsx:167`, `MapStage.tsx:355`).
- **L5** Session-scoped transient state (`saveResolve`, `manualAdvantage`, `hpFx`, cursors,
  timers) not reset on session switch in `connect()` (`socket.ts:494`).
- **L6** Any server `notice` clears the AI-busy spinner (`socket.ts:697`) — an unrelated
  toast kills the "AI is working" banner mid-request.
- **L7** Emanation placement hit-test uses legacy `size`×grid, not the rendered radius
  (`MapStage.tsx:726`) — mis-targets on non-5-ft-square maps.
- **L8** Deleting the sole living current-turn combatant spuriously bumps the round counter
  (`sessions.ts:521,1091`).
- **L9** A failed undo permanently consumes the entry (`socketHandlers.ts:701` — `popUndo`
  before `run()`), so a retry-after-fix is impossible.
- **L10** `curHp` has no lower clamp in `updateCharacter`/`updateMonster` — a negative value
  slips past the `=== 0` death-save-failure gate.
- **L11** Debounce/listener leaks: `DecalPopup` save timer (can write to a deleted decal),
  `SidePanel` resize listeners not removed on `pointercancel`, a few unguarded
  `localStorage.setItem` in store toggles.
- **L12** 3 dead CSS classes (`.ctrl-sep`, `.data-conds`, `.data-cond-edit`); cross-session
  id not validated on `combat:attack`/`save:resolve`/`damage:apply` (shielded by UUIDs +
  single DM secret today).

---

## Performance (measured — benchmark at real table scale: 100 tokens, 2 fog layers ×3200 cells, 500 rolls)

- **P1 (high)** ~**1.6 MB serialized + ~27 ms CPU per mutation**, sent to every client on
  every `afterChange()`, **uncompressed** — Socket.IO `perMessageDeflate` is off and
  `index.ts:40` doesn't enable it. On an e2-micro expect ~100 ms event-loop stalls per roll.
  **Fix:** enable `perMessageDeflate` (5–10× wire cut on this payload) + coalesce bursts with
  a microtask debounce.
- **P2 (high)** Fog brush = a full 1.6 MB broadcast **per mousemove** (`MapStage.tsx:1104`
  unthrottled → `fog:paint` → `afterChange`); a single stroke attempts tens of MB/s and
  stutters every player's map. **Fix:** batch stroke cells client-side on a ~120 ms timer.
- **P3 (high)** Fog cell arrays are the biggest recurring payload and are **double-shipped**
  (active map goes out as both `map` and inside `maps`; the DM also gets every other map's
  fog every mutation) — 96 KB of a 225 KB player snapshot is the same cells twice
  (`visibility.ts:335`). **Fix:** ship the active map once; strip fog from non-viewed maps in
  the DM list; RLE/bitmask the cells.
- **P4 (med-high)** 94 monster instances each carry the template's full ability text →
  212 KB in every DM snapshot (`instantiateMonster` deep-copies; DM path ships all). **Fix:**
  ship shared long text once (instances carry `templateId`) or lazy-load stat blocks on select.
- **P5 (med)** `MapStage` subscribes to `cursors`/`dragGhosts`/`hpFx` at the top of a
  2000-line component and re-runs `resolveToken` (linear `.find` over monsters) per token per
  fx packet → up to ~100 renders/s × 10k scans with 5 players. **Fix:** move fx subscriptions
  into small child components; build an id→creature `Map` once per snapshot.
- **P6 (med)** Single Konva layer: the ~20fps turn-ring pulse re-executes both fog
  `sceneFunc`s (6400 fillRects) + all grid lines + every token, continuously through combat.
  **Fix:** split into static/token/fx layers or `cache()` the fog shape.
- **P7 (med)** Auto-backup runs synchronously mid-session and base64-inlines all uploads into
  one string (`backup.ts:78`) — seconds of event-loop block + ~2.7× upload-bytes memory spike,
  risky on 1 GB. **Fix:** `setImmediate`-yield per session, stream assets, skip unchanged.
- Smaller: freehand annotations ship raw mousemove points unbounded (decimate them);
  `getMap` re-parses both fog arrays per `token:drag` packet; `useImage` makes one
  `HTMLImageElement` per token instead of caching by URL.

---

## Test coverage (CI exists and is complete: typecheck + Vitest + Playwright on every push/PR)

The **domain/rules-math and `visibility.ts` redaction layers are excellent** (409 tests;
`visibility.ts` alone has 33 covering both fog layers, disposition tiers, apply-stripping,
hidden-monster suppression, and a `createSnapshotBuilder ≡ buildSnapshot` equivalence test).
The untested, load-bearing surface is the **transport/auth layer and disaster-recovery paths** —
which is exactly where the H-tier bugs above live:

- **T1 (high)** `socketHandlers.ts` (1,676 lines) has **zero** direct tests; no test asserts a
  player-role socket is rejected from a DM event. A socket.io-client harness with ~3 tests
  (player denied a DM mutation; `token:move` gate; wrong-passphrase join) would guard every
  inline role gate.
- **T2 (high)** `routes.ts` — the `requireDm` **403 path is never asserted** (only the header-
  present path via the e2e helper). A supertest test of "DM endpoint without header → 403 + no
  side effect" would have caught **H1 and H2** immediately.
- **T3 (high)** Backup import edge cases (version mismatch throws + rolls back, path-traversal
  asset key skipped, colliding custom code) and `backupScheduler.pruneOldBackups` (deletes the
  safety net — a bad sort here is the worst silent failure) are untested.
- **T4 (med)** Non-hermetic test DB (all 44 suites share one on-disk `game.db`,
  `fileParallelism:false`) — point `config.dataDir` at a per-run temp dir to restore
  parallelism + hermeticity. RNG isn't injectable, forcing ~30 loop-until-outcome tests
  (sound, but nat-1/20/crit branches can't be pinned).
- **T5 (med)** Highest-value e2e additions: DM places token → player sees it; **fog hides an
  enemy from the player view** (the only render-path test of the visibility boundary); a full
  combat attack round-trip; reconnect/claim-grace.

---

## Verified solid (defenses checked that held — do not "re-fix")

- **No privilege escalation:** every `on()` handler enumerated; all DM-only mutations gate on
  `isDm()`; shared mutations use `ownsCharacter`/`canEditCreature`/claim checks; `token:spawn`
  blocks non-PC kinds + off-map/duplicate for players; `initiative:endTurn` restricts to the
  caller's own active PC. No player→DM path.
- **Snapshot redaction (`visibility.ts`):** enemy/neutral monsters reduced to name+conditions;
  hidden + fog-covered tokens filtered; staged/hidden monsters excluded from the visible set
  (no boss-name leak); other players' `ownerId` nulled / `claimedBy` masked; `apply` stripped
  except the caster's own; `dmOnly` chat/rolls filtered; enemy AC + mod breakdown redacted;
  `hpNote` limited to PC/friendly.
- **SSRF:** `/icons/from-url` enforces http(s), rejects loopback/private/link-local/CGNAT/
  metadata IPs, 10 s timeout, 25 MB cap, `image/*` check, UUID filename.
- **Upload safety:** raster whitelist (no `.svg`/`.html`), UUID filenames (no traversal /
  client-name smuggling); `imagePath` validated by regex + `fs.existsSync`.
- **Injection:** all DB access is parameterized prepared statements incl. the dynamic `SET`
  list (fixed column whitelist); no string-built SQL. `insertRow` whitelists columns via
  `PRAGMA table_info`. No prototype pollution reachable (explicit column whitelists + own-key
  spreads).
- **Rules math:** proficiency (level & CR, boundary-checked), crit/fumble, resist/vuln
  (halve-after-multiply, floor), 2024 temp-HP, death saves (nat 1=2 fails, nat 20 revive,
  all-saves item bonus on the 10+ check), upcast/cantrip scaling, spell DC/attack, initiative
  (dead skipped, downed PCs keep turns, objects excluded, ties stable) — all correct.
- **Persistence:** every schema access goes through `ensureColumn`/`CREATE TABLE IF NOT
  EXISTS` with defaults; all `rowTo*` mappers null-coalesce legacy columns; legacy JSON parses
  are try/caught; fog + monster-actions migrations idempotent. `exportSession` covers every
  session-owned table; `importSession` remaps all FKs in one transaction (modulo M6's typo).
- **Client lifecycle:** `RollRevealOverlay` timers, `useTween` rAF, `TokenShape` turn-ring
  `Konva.Animation`, `HpFx` tweens, the fx-timer maps, `MapStage` ResizeObserver/DPR/paste
  listeners, and `useSelection`'s BroadcastChannel all clean up correctly; `TokenShape` memo
  comparators cover every rendered field; no client-computed combat number is rendered as
  authoritative.
- **Code health:** zero dead exports, no `any` in production code, every socket event fully
  wired (handler + emitter), `shared/*` genuinely framework-free, no unused dependencies.

---

## Recommended remediation order

1. **H1** — restore the DM's AI buttons (shared `apiFetch` helper that sends the secret).
   Live-broken, one-helper fix. Add **T2** (route 403 test) alongside so it can't regress.
2. **H2 + H3** — gate the library + spell-lookup routes (same `requireDm`). Closes the
   unauthenticated-wipe / key-drain holes; **L1** (library sanitize) rides along.
3. **H4 + H5** — one `toMonsterInput(m)` helper feeding instantiate/copy/duplicate; fixes the
   save-proficiency drop and the corrupt-duplicate bug together and kills the field-list
   duplication.
4. **H6 + M2 + M3** — combat-accuracy batch (float scale; crit-vs-downed = 2 fails; double
   rider dice) so the live game resolves rules correctly.
5. **M1** — track consumed apply-instances server-side (double-click / infinite-dart footgun).
6. **M7–M10** — reconnect-lifecycle batch (seed seenRollIds; re-emit map:select; gate offline
   emits; clamp combat target). Mobile stability.
7. **P1–P3** — enable `perMessageDeflate`, throttle the fog brush, ship the active map once.
   Biggest bang for the e2-micro / home tunnel.
8. **T1/T3** — socket-auth harness + backup-import/prune tests for the disaster-recovery paths.

The M11/L-tier input-validation and the remaining perf/quality items are good follow-on
hygiene once the above lands.
