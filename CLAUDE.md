# CLAUDE.md — Project reference for Claude Code

> Durable orientation for any chat session. **Current feature ledger lives in
> [`ROADMAP.md`](ROADMAP.md)** (kept ticked as work lands); install/run details
> in [`README.md`](README.md). This file is the architecture + conventions +
> status summary — keep it concise (it loads into every session).

## What this is

A locally-hosted, real-time **virtual tabletop (VTT) for D&D 5e**. The DM and
players join one shared session through **separate links** and see role-specific
views over the same live map and tokens. The server runs on the host's PC and is
exposed to remote players via a **Cloudflare Tunnel**. Most of the roadmap
(Phases 1–6 / WP1–WP11) is implemented.

## Run / verify

Monorepo, npm workspaces: `shared`, `server`, `client`.

```bash
npm install
npm run dev        # server + client (concurrently); two browser windows = DM + player
npm run typecheck  # tsc --noEmit for server AND client
npm run test       # server Vitest (~51 tests across 10 *.test.ts) — tests are SERVER-ONLY
npm run build      # client (vite) + server (tsc)
```

Always run `npm run typecheck` and `npm run test` before committing. Manual UX
is verified with two windows (DM at `/dm`, player at `/join`). Dev branch:
`claude/Main`.

**Workflow — default to committing directly to `claude/Main`.** Commit changes
straight to `claude/Main` (after `typecheck` + `test`). **Only open a PR when the
user explicitly asks for one** in their request — never proactively, since each
PR also requires creating a test launcher (extra work/tokens). Small changes
never warrant a PR on their own.

**PR convention (only when a PR is requested):** when opening a PR, also add a
launcher named `PR #<N> - <Title>.bat` to **`claude/Main`** (a thin wrapper over
`tools/pr-test-runner.bat` that sets `PR_NUMBER`/`PR_BRANCH`/`PR_TITLE`; in the
filename strip `\ / : * ? " < > |` (keep `#`/spaces), and in `PR_TITLE` avoid cmd
metacharacters — replace `&` with "and", drop `% ^ < > | ( )`). The runner checks the PR
branch out into an isolated sibling folder (`%USERPROFILE%\DnD-App-v2-pr-<N>`) on
port `4100+N` with its own data, so users can test without touching their main
install (`start.bat` keeps running `claude/Main`). Cleanup is automatic:
`.github/workflows/pr-test-cleanup.yml` removes the launcher from `claude/Main`
on PR close, `install.bat` then deletes the stale local folder, and the runner
self-cleans if a merged launcher is double-clicked — no manual teardown.

## Stack

- **Client:** React + TypeScript + Vite, **Konva** (`react-konva`) for the map
  canvas, **Zustand** store, react-router.
- **Server:** Node + Express + **Socket.IO**, **SQLite** (`better-sqlite3`).
- **Shared:** a framework-free TS package imported by both sides.
- **Remote access:** `cloudflared` (tunnel-agnostic via `PUBLIC_URL`). **AI:**
  Google Gemini, **key-gated and fail-safe** (works fully offline without a key).

## Architecture & invariants (read this first)

- **Server-authoritative.** SQLite (`server/src/db.ts`) is the single source of
  truth. Clients only send *intent* events; the server validates them by
  **role** in `server/src/socketHandlers.ts`, mutates via
  `server/src/sessions.ts`, and rebuilds **role-shaped snapshots** in
  `server/src/visibility.ts` (`buildSnapshot`). **Never trust client-computed
  numbers** (damage, dice, AC, attack rolls) — compute them on the server.
- **Snapshot flow.** Every mutation ends with `broadcastSnapshots()`
  (`server/src/connections.ts`). Clients are thin Zustand stores fed by the
  `state:snapshot` event (`client/src/state/socket.ts`). **Anything a player can
  see must be gated in `visibility.ts`** (disposition tiers, fog, hidden tokens,
  server-computed combat-role badge).
- **Per-connection view.** The DM may stage/preview any map (`conn.viewMapId`);
  players are locked to the session's active map.
- **Durable saves (top invariant).** Sessions persist by code and reload on
  restart. Schema changes MUST use the idempotent `ensureColumn(...)` /
  `CREATE TABLE IF NOT EXISTS` pattern in `db.ts` so old saves keep loading.

## Recipe: how to add a feature

1. **Schema** — add a column/table in `db.ts` via `ensureColumn` /
   `CREATE TABLE IF NOT EXISTS`; extend the row mapper (`rowToX`).
2. **Domain helper** — a function in `server/src/sessions.ts` (or a focused
   module like `library.ts` / `combat.ts`).
3. **Event** — add the payload type + entry in `ClientToServerEvents`
   (`shared/types.ts`); add a **role-gated** handler in `socketHandlers.ts` that
   ends with `afterChange()` (→ `broadcastSnapshots`).
4. **Visibility** — if players can see it, shape it in `visibility.ts`.
5. **Client** — add a store action in `client/src/state/socket.ts`; build/extend
   UI. Keep `shared/*` framework-free.
6. Update `ROADMAP.md`, add a test, `typecheck` + `test`.

## Data model cheat-sheet (`shared/types.ts`)

- **`Token`** — a per-map placement that references a `Character`/`Monster` by
  `refId` (+ `kind`). Carries a per-token combat-role override + `hideCombatRole`
  + a **server-computed effective `combatRole`**.
- **`Monster` & `Character` share one tagged stat-block shape:** `level` (PC
  level / monster **CR**), `armorClass`, `speed`, `stats`, `resistances`,
  `weaknesses`, `weapons: Weapon[]` (name, melee/ranged, damage, to-hit),
  `actions`, `abilities`, `icon`. `Character` additionally has
  `proficientSkills`, `spellSlots`, `resources`, `items`, `claimedBy`.
  `Monster` additionally has `disposition`, `source`, `conditions`.
- **Templates vs instances:** `is_template` monsters are the DM's spawn buttons;
  each placement creates a **numbered instance** (Goblin 1, 2, …) with its own
  HP/conditions, referenced by a token.
- **`Disposition`** = `friendly | neutral | enemy` (default enemy) → drives
  3-tier player visibility (`toPlayerMonster`): friendly = full stats, neutral =
  name+HP+type+AC, enemy = name+conditions.
- **`MapState`** has **two independent fog layers** (`mapFogEnabled/Revealed`,
  `tokenFogEnabled/Revealed`).
- **`StateSnapshot`** is role-shaped and also carries `rollLog` and
  `sessionName`.

## Shared pure modules (client + server, unit-tested)

- `shared/dice.ts` — `rollDice("2d6+3", 'adv'|'dis')` parser/roller.
- `shared/skills.ts` — the 18 5e skills, `abilityMod`, `proficiencyBonus(level)`,
  `skillBonus`.
- `shared/combatMath.ts` — `rollWeaponAttack` (to-hit vs AC, crit doubles dice,
  nat-20 hit / nat-1 miss), `rollSavingThrow`, `profBonusForCR`.
- `shared/spellMath.ts` — `effectiveDice` (upcast: +scaleDice per slot above
  base; cantrips scale by caster level at 5/11/17), `spellAttackBonus`,
  `spellSaveDC` (8 + prof + best of INT/WIS/CHA).
- `shared/combatRole.ts` — `deriveCombatRole` (caster > ranged > melee) +
  `COMBAT_ROLE_ICON`.
- `shared/sheetIO.ts` — `parseSheet` (auto-detect text vs JSON), `parseSheetText`
  (best-effort scrape), `parseSheetJSON`, `exportSheetJSON`.

## Client structure & reuse (don't reinvent these)

- **Routes:** `DmView` (map screen), `DmDataView` (`/dm/data` second-screen
  dashboard), `PlayerView`; entry routes `DmRoute`/`DmDataRoute`/`PlayerRoute`.
- **Canvas:** `MapStage` (Konva stage, fog rendering, placement) + `TokenShape`.
- **`StatBlock`** — ONE generalized component for monsters AND characters:
  display ↔ edit toggle, built-in AI-fill, and a **read-only mode** (omit
  `onSave`) for players viewing allies/friendly creatures.
- **`SelectedTokenPanel`** — the full right-side token panel; **also reused**
  inside the Data view's expand overlay (so they never diverge).
- **`CharacterSheet`** = `StatBlock` + skills + resources + items + sheet I/O.
- **`useSelection`** — multi-select with optional cross-tab **BroadcastChannel
  sync** (`syncKey`), used to mirror selection between the map and Data windows.
- Helpers: `resolveToken` (`lib/entities.ts`), `presentAuras`/`STANDARD_CONDITIONS`
  (`lib/conditions.ts`).

## Status — DONE (summary; see ROADMAP for the itemized ledger)

- **Real-time VTT:** maps (upload/Slides URL, staging, active/live, rename,
  delete), tokens (place/move/resize/duplicate/hide, sequential instances, icons,
  hover card + right-click/long-press floating menu), live sync, **two-layer fog**
  (map blackout + token-only; players' covered area is seamless), disposition
  **visibility tiers**, per-token hide.
- **Creatures:** offline **SRD** search + key-gated **Gemini** lookup +
  **cross-session library** (save with side-by-side conflict prompt that also
  detects SRD-name shadowing; lookup checks library → SRD → AI).
- **Characters:** DM + player creation, shared tagged sheet (editable), **skills**
  with proficiency/bonuses + **click-to-roll skill checks** (server-resolved
  `skill:roll` using the sheet's mod + proficiency, adv/dis, into the roll log),
  **resources** auto-filled from 5e class/level tables
  (+ custom counters, pip trackers), **inventory items** (+ library picker),
  **spells, abilities & weapon masteries** (`CharacterSpells`: search a local
  rules DB `spells/srd.ts` + `masteries/srd.ts` → Gemini fallback; collapsible
  text; server-resolved `ability:roll` with upcast/cantrip scaling; masteries
  carry a weapon binding + on/off toggle and adjust the matching weapon's attack
  in `resolveAttack`, e.g. Graze damage on a miss),
  player places/edits own token, **high-visibility PC tokens**, party + friendly
  sheets read-only, sheet import (text/JSON) + export.
- **AI:** generate/back-fill creatures *and* characters from free-text
  descriptions; AI picks level/CR; global "AI is working" banner; editable API
  key + model in **Settings**.
- **Combat:** initiative (Roll-all resets + auto-highlights top, **Add rolls** for
  latecomers, Next/Clear), **dice roller + shared persisted roll log**,
  **automated weapon attacks** (server-authoritative, auto-applies damage on hit)
  and **saving throws** (bulk). Roll log has a clear button + color-coding by
  roller/roll type.
- **DM Data mode** (`/dm/data`): compact sortable (init/A–Z/type) + drag-reorder
  cards, expand into a large overlay reusing `SelectedTokenPanel`, checkbox
  multiselect synced to the map window driving bulk AOE/conditions/etc.
- **Shell:** shared **TopToolbar** (editable session name, code, load session,
  Settings, copy link, open Data view), editable map names, Roll20 collapsible
  embed + pop-out.

## Remaining / not yet built

- **Phase 7 — Discord video:** no general embeddable iframe; start with a
  **deep-link "Join voice"** button (per-session channel/invite), investigate the
  **Embedded App SDK** (Activity) as the deeper integration.
- **WP7 leftover — drag-reorder toolbar sections** (deferred; lower value).
- **WP11 follow-up — structured spell attacks:** DONE for the character sheet —
  `sheetAbilities` carry a structured `roll` (attack/save/damage/heal + upcast),
  rolled server-side via `ability:roll`. Still open: **auto-spending a spell
  slot** on cast (players track slots manually in the resources UI), structured
  rolls for monster/NPC `actions`, and adv/dis on spell attack rolls.
- **Phase 3 stretch — Google Slides:** live token layer over a Slides embed; map
  refresh from Slides.
- **Phase 6 AI:** spell-effect/rules resolution and AI-generated enemy dialogue.

## Key design decisions (the "why" — don't relitigate)

- **Combat damage auto-applies on a hit** (recorded in the roll log; DM can heal
  back) instead of a per-hit confirm modal — deterministic and fast.
- **Combat-role badge is server-computed** and shown to players even on enemies
  (whose stats they never receive); disposition decides how much else they see.
- **Library save conflict also checks the SRD** (saving shadows a built-in), and
  `/creatures/lookup` checks **library before SRD** so a DM's saved/edited copy
  is authoritative everywhere.
- **Player-facing map fog uses the exact off-map backdrop color** (`#0e0f12`,
  matching `.center`) and 1px-overlapped cells, so a covered region is
  indistinguishable from empty space beyond the map.
- **Selection sync between DM windows is same-browser only** (BroadcastChannel);
  true cross-device sync would require server-side selection state.
- **Sheet import overwrites** the fields it recognizes (others preserved) — it
  previews + confirms which fields change. Works on *any* pasted text, not just
  Roll20.
- **Roll20** has no public per-character API → manual paste + iframe/pop-out only.
- **AI is key-gated and fails safe** — every AI path no-ops cleanly without a key.

## Gotchas for edits

- Keep `shared/*` framework-free (imported by both server and client).
- Every player-visible field must pass through `visibility.ts` — never leak via
  the client.
- New client→server events need a **role gate** in `socketHandlers.ts` and a
  matching entry in `ClientToServerEvents` (`shared/types.ts`); end mutations
  with `afterChange()`.
- Match the surrounding code's style/comment density.
- Tests are **server-only** (Vitest). Keep `ROADMAP.md` ticked as features land.
