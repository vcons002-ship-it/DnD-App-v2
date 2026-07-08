# Project Handoff — DnD-App-v2

_Last updated: 2026-07-08. This is the "pick it up cold" doc. For durable
architecture detail read [`CLAUDE.md`](../CLAUDE.md); for the itemized feature
ledger read [`ROADMAP.md`](../ROADMAP.md); for install/run read
[`README.md`](../README.md). This file is the orientation layer over those._

---

## 1. What this is

A locally-hosted, real-time **virtual tabletop (VTT) for D&D 5e**. The DM and
players join one shared session through **separate links** and see role-specific
views over the same live map and tokens. The server runs on the host's PC and is
exposed to remote players via a **Cloudflare Tunnel** (or 24/7 on a free GCP
e2-micro VM via the `deploy/` kit).

**There is an active campaign running on a live session.** Treat anything that
touches the DM/player access flow, the session/save schema, or combat math as
production — verify before shipping, and prefer additive changes.

## 2. Stack (one-liner)

- **Client:** React 18 + TypeScript + Vite 7, **Konva** (`react-konva`) canvas, **Zustand**, react-router 7.
- **Server:** Node + Express 5 + **Socket.IO**, **SQLite** (`better-sqlite3` 12).
- **Shared:** a framework-free TS package imported by both sides.
- Monorepo, npm workspaces: `shared`, `server`, `client`.

## 3. Run / build / test / verify

```bash
npm install
npm run dev        # server + client (two browser windows = DM + player)
npm run typecheck  # tsc --noEmit for server AND client
npm run test       # server Vitest — 409 tests / 44 files (tests are SERVER-ONLY)
npm run build      # client (vite) + server (tsc)
npm run test:e2e   # Playwright 2-window smoke (builds client, then runs)
```

**Verification gate before any commit:** `typecheck` + `test` + `build`, and for
client/render changes also `test:e2e`. In this remote environment the e2e needs
the preinstalled Chromium: `PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e`.

Manual UX is verified with two windows: DM at `/dm`, player at `/join`.

## 4. Branches & release model

- **`claude/Main`** — the **stable / default** branch. The user's local install
  tracks it (`install.bat`/`install.sh` are hardcoded to `claude/Main`; `start.bat`
  runs that checkout). **This is what players actually run.**
- **`claude/Dev`** — day-to-day development branch (per `CLAUDE.md`).
- **`claude/app-state-analysis-odi72f`** — the working branch used for the
  2026-07 improvement arc (analysis → tiered fixes → upgrades → features). PRs from
  it target `claude/Main`.

**Workflow:** commit to the working/dev branch after the gate passes. **Open a PR
only when explicitly asked** — each PR also spins up a test-launcher `.bat`
(auto-generated on open, auto-removed on close by
`.github/workflows/pr-test-launcher.yml` / `pr-test-cleanup.yml`, committed to
`claude/Main`). PRs target `claude/Main`; merging is how work reaches the live
install (users pull via `install.bat` + rebuild).

If a PR for the working branch is already merged, treat follow-up work as a fresh
change: restart the branch from `origin/claude/Main`, don't stack new commits on
merged history.

## 5. Architecture — the load-bearing invariants

Read these before editing; full detail in `CLAUDE.md` §"Architecture & invariants".

- **Server-authoritative.** `server/src/db.ts` (SQLite) is the single source of
  truth. Clients send *intent* events only; the server validates them **by role**
  in `server/src/socketHandlers.ts`, mutates via `server/src/sessions.ts` (+ focused
  modules `combat.ts`, `library.ts`), and rebuilds **role-shaped snapshots** in
  `server/src/visibility.ts`. **Never trust client-computed numbers** (damage, dice,
  AC, rolls) — compute them server-side.
- **Snapshot flow.** Every mutation ends with `afterChange()` →
  `broadcastSnapshots()` (`server/src/connections.ts`). Clients are thin Zustand
  stores fed by the `state:snapshot` event (`client/src/state/socket.ts`).
- **Anything a player can see must be gated in `visibility.ts`** — disposition
  tiers, fog, hidden tokens, enemy-mod redaction (`hideMods`), DM-only payloads.
  A field leaked to the client is a leak, full stop.
- **Durable saves (top invariant).** Sessions persist by code and reload on
  restart. Schema changes MUST use the idempotent `ensureColumn(...)` /
  `CREATE TABLE IF NOT EXISTS` pattern in `db.ts` so old saves keep loading.

### Adding a feature (the recipe)
1. **Schema** → `ensureColumn`/`CREATE TABLE IF NOT EXISTS` in `db.ts`, extend the row mapper.
2. **Domain helper** in `sessions.ts` (or `combat.ts`/`library.ts`).
3. **Event** → payload type in `ClientToServerEvents` (`shared/types.ts`) + a **role-gated** handler in `socketHandlers.ts` ending with `afterChange()`.
4. **Visibility** → shape it in `visibility.ts` if players can see it.
5. **Client** → store action in `client/src/state/socket.ts`, then UI. Keep `shared/*` framework-free.
6. Update `ROADMAP.md`, add a server test, run the gate.

## 6. Deployment & operations

Two ways to run it; both drive the same server.

**A) Host PC + Cloudflare Tunnel (the normal setup).**
- `PUBLIC_URL` = the stable hostname; a **named/token tunnel** is configured in the
  Cloudflare Zero Trust dashboard (Networks → Tunnels), with a **Public Hostname /
  "Published application" route** (NOT an Access application — no Google sign-in) →
  `http://localhost:4000`. Tunnel token goes in `CF_TUNNEL_TOKEN`.
  The user's live tunnel: **`nic024i.app`** (e.g. `dnd.nic024i.app/dm`, `/join`).
- **Always-on:** `install-service.bat` installs the server as a Windows service
  (via NSSM); `start.bat`/`install.bat` were wired to accommodate it (install
  rebuilds the client and restarts the service). See `README.md`.
- Tunnel hardening + retry logic lives in `server/src/tunnel.ts`.

**B) GCP e2-micro VM (24/7, free tier).** The `deploy/` kit: `setup.sh`,
`dndapp.service` (systemd), `Caddyfile` (TLS/reverse-proxy), `deploy/README.md`.
Purely additive — the local workflow is unchanged.

**DM login / how people join (important — this changed in the 2026-07 hardening):**
- The **DM secret is mandatory** to open `/dm`. It's set via `DM_PASSPHRASE`
  (env), or auto-generated on first run and printed at startup + saved to
  `server/data/dm-secret.txt`. The DM types it on the `/dm` screen.
- **Players need only the session code** (no secret) at `/join`.
- Config resolver: `server/src/config.ts` (`resolveDmSecret`, plus a `DB_PATH`
  env override for tests/alt data dirs).

**Backups (don't lose the campaign):**
- **Automatic:** every session is exported to `server/data/backups/<timestamp>/`
  every `BACKUP_INTERVAL_DAYS` (default **3.5** ≈ twice a week), keeping the newest
  `BACKUP_KEEP` (default **8** ≈ 4 weeks). Restart-safe (last-run time is in
  `app_meta`, re-checked every ~3h). Code: `server/src/backupScheduler.ts`.
- **Manual:** a session exports as a **self-contained JSON** (rows + base64-inlined
  `/uploads` images); import remaps all ids into a **new** session.
  Code: `server/src/backup.ts` (`exportSession`/`importSession`).
- **Undo:** destructive DM actions (delete token/creature, cover fog) capture the
  rows first and restore them verbatim. Code: `server/src/undo.ts`,
  `session:undo` handler.

## 7. Recent work (the 2026-07 improvement arc)

Kicked off from a codebase review → `docs/app-state-analysis-2026-07.md`. Shipped
in tiers, all merged to `claude/Main`:

- **Security/stability ("Now" tier):** mandatory DM secret, per-event socket
  try/catch (`safeOn`), damage-event role gates, process-level crash guards,
  `sanitizeWeapons` on import, warlock/cantrip prep fix.
- **"Next" tier + tunnel/always-on:** tunnel hardening + `CF_TUNNEL_TOKEN`,
  `install-service.bat`, wired `start.bat`/`install.bat`.
- **No-risk cleanups:** shared de-duplication (`DAMAGE_TYPES`, `Advantage`),
  small client-UX safety fixes, ROADMAP hygiene.
- **Safe/additive features:** session backup/export + restore, Playwright e2e,
  **undo** for destructive DM actions, **automatic bi-weekly backups**.
- **Dependency upgrade train** (each verified individually through the full gate):
  **better-sqlite3 11→12, Vite 6→7, Express 4→5, react-router-dom 6→7.**
- **"Every roll animates" (PR #58, newest):** the staged roll-reveal overlay now
  fires for **all** rolls — skill checks, saving throws, ability checks, death
  saves, lock/trap checks, and plain `/roll`/dice-panel rolls — not just attacks
  and spell damage. New `RollReveal` kinds `check` + `dice` (`shared/rollReveal.ts`
  builders). See §8 for the one deliberate gap.

## 8. Known issues / deferred / not-built

- **React 19 + react-konva 19 — DEFERRED, do not retry casually.** The upgrade
  crashes at runtime: a dual React copy throws `Cannot read properties of null
  (reading 'useCallback')` inside react-konva and the Konva canvas never mounts
  (both e2e windows fail). Reverted to **React 18**. Revisit only as its own
  dedicated react-konva-compatibility task, on its own PR, when no campaign is live.
- **Untargeted spell-attack roll does NOT animate.** The rare path where a spell
  *attack* ability is rolled with no target selected (`resolveSheetAbilityFor`,
  the untargeted fallback) intentionally shows no reveal — there's no target AC, so
  a HIT/MISS stamp would be misleading. Every targeted attack and every other roll
  animates. Easy to add a `check`-style reveal later if wanted.
- **Heals** keep their existing feedback (floating `+X` number + chime) rather than
  a dice reveal — deliberate, to avoid double visuals. Revisit if desired.
- **Auto-backup test is disk-heavy.** `backupScheduler.test.ts` exports every
  session in the shared test DB; on a slow disk it can exceed the default 5s Vitest
  timeout, so that one test was given a 30s timeout. Not a product bug.
- **Not built yet** (from `ROADMAP.md`): **Phase 7 — Discord video** (start with a
  deep-link "Join voice" button; investigate the Embedded App SDK); **Phase 3
  stretch — Google Slides** live token layer; **Phase 6 AI** — spell-effect/rules
  resolution and AI-generated enemy dialogue on hit/miss.

## 9. Gotchas for edits (the short list)

- Keep `shared/*` **framework-free** (imported by both server and client).
- Every player-visible field must pass through `visibility.ts` — never leak via the client.
- Client-supplied `SheetModifier[]`/`InventoryItem[]`/`Weapon[]` must pass
  `sanitize*` (`shared/modifiers.ts`) before storage — they feed the server's own roll math.
- New client→server events need a **role gate** in `socketHandlers.ts` + a matching
  entry in `ClientToServerEvents`; end mutations with `afterChange()`.
- Tests are **server-only** (Vitest). Client correctness is covered by typecheck + e2e.
- Match the surrounding code's style/comment density.

## 10. Where to look

| Need | File |
| --- | --- |
| Architecture + conventions (canonical) | `CLAUDE.md` |
| Itemized feature ledger | `ROADMAP.md` |
| Install / run / deploy | `README.md`, `deploy/README.md` |
| The 2026-07 review that seeded recent work | `docs/app-state-analysis-2026-07.md` |
| Schema / persistence | `server/src/db.ts` |
| Domain mutations | `server/src/sessions.ts`, `combat.ts`, `library.ts` |
| Role gating of events | `server/src/socketHandlers.ts` |
| Player-shaped snapshots + redaction | `server/src/visibility.ts` |
| Client store / socket wiring | `client/src/state/socket.ts` |
| Canvas | `client/src/canvas/` (`MapStage`, `TokenShape`, `HpFx`) |
| Shared pure math | `shared/` (`dice`, `combatMath`, `spellMath`, `skills`, `rollReveal`, …) |
| Config / DM secret / tunnel | `server/src/config.ts`, `tunnel.ts` |
| Backups / undo | `server/src/backup.ts`, `backupScheduler.ts`, `undo.ts` |
