# CLAUDE.md — Project reference for Claude Code

> Durable orientation for any chat session. **Current feature ledger lives in
> [`ROADMAP.md`](ROADMAP.md)** (kept ticked as work lands); install/run details
> in [`README.md`](README.md). This file is the architecture + conventions +
> status summary — keep it concise (it loads into every session).

## What this is

A locally-hosted, real-time **virtual tabletop (VTT) for D&D 5e**. The DM and
players join one shared session through **separate links** and see role-specific
views over the same live map and tokens. The server runs on the host's PC and is
exposed to remote players via a **Cloudflare Tunnel** — or 24/7 on a free GCP
e2-micro VM via the **`deploy/`** kit (stable HTTPS URL through `PUBLIC_URL`,
no cloudflared; purely additive, the local workflow is unchanged). Most of the
roadmap (Phases 1–6 / WP1–WP11) is implemented.

## Run / verify

Monorepo, npm workspaces: `shared`, `server`, `client`.

```bash
npm install
npm run dev        # server + client (concurrently); two browser windows = DM + player
npm run typecheck  # tsc --noEmit for server AND client
npm run test       # server Vitest (230+ tests across ~26 *.test.ts) — tests are SERVER-ONLY
npm run build      # client (vite) + server (tsc)
```

Always run `npm run typecheck` and `npm run test` before committing. Manual UX
is verified with two windows (DM at `/dm`, player at `/join`). Dev branch:
`claude/Dev`.

**Workflow — default to committing directly to `claude/Dev`.** Commit changes
straight to `claude/Dev` (after `typecheck` + `test`). **Only open a PR when the
user explicitly asks for one** in their request — never proactively, since each
PR also requires creating a test launcher (extra work/tokens). Small changes
never warrant a PR on their own.

**Two-branch model:** `claude/Dev` is the active development branch (day-to-day
commits). `claude/Main` is the **stable** branch the user's local install tracks
(`install.bat`/`install.sh` are hardcoded to `claude/Main`, and `start.bat` runs
that checkout). PRs target `claude/Main` as their base, and their test launchers
are committed to `claude/Main`, so `install.bat` pulls them into the user's local
folder for testing.

**PR convention (only when a PR is requested):** each PR gets a `PR #<N> - <Title>.bat`
launcher on **`claude/Main`** — a thin wrapper over `tools/pr-test-runner.bat` that sets
`PR_NUMBER`/`PR_BRANCH`/`PR_TITLE`. **Both ends are automated by workflows** (base
`claude/Main`), so opening a PR normally needs no manual launcher work:
- **Create** — `.github/workflows/pr-test-launcher.yml` (on PR **opened/reopened**) generates
  the launcher and commits it to `claude/Main` (skips if one already exists). It sanitizes the
  title: in the **filename** `\`/`/`→`-`, `:`→space, drop `* ? " < > |` (keep `#`/spaces); in
  **`PR_TITLE`** replace `&`→"and" and drop cmd-unsafe chars `% ^ < > | ( ) " !`. PR fields are
  passed via env (never inlined) to avoid title-driven shell injection.
- **Clean up** — `.github/workflows/pr-test-cleanup.yml` (on PR **closed**) removes the launcher
  from `claude/Main`; `install.bat` then deletes the stale local folder, and the runner
  self-cleans if a merged launcher is double-clicked — no manual teardown.

The runner checks the PR branch out into an isolated sibling folder
(`%USERPROFILE%\DnD-App-v2-pr-<N>`) on port `4100+N` with its own data, so users can test
without touching their main install (`start.bat` keeps running `claude/Main`). To hand-make a
launcher (rare — e.g. for a PR opened before the workflow existed), follow the same naming +
sanitization rules above and commit it to `claude/Main`.

## Stack

- **Client:** React + TypeScript + Vite, **Konva** (`react-konva`) for the map
  canvas, **Zustand** store, react-router.
- **Server:** Node + Express + **Socket.IO**, **SQLite** (`better-sqlite3`).
- **Shared:** a framework-free TS package imported by both sides.
- **Remote access:** `cloudflared` (tunnel-agnostic via `PUBLIC_URL`). **AI:**
  one app-wide gateway (`server/src/ai/`, `generateText`/`generateJson`) routing
  ALL features (creature/character/item/spell gen + the DM **rules-assistant**,
  `/ask` in chat). Backend = `config.aiMode`: **`gemini`** (default, best
  quality, local fallback) or **`local`** (Ollama-only lockdown); a per-call
  `prefer` overrides it (the chat's model dropdown, default local) unless locked.
  **Fail-safe** (works without either). Assistant grounded on an SRD digest + app
  data + an optional uploaded rulebook PDF (wins on conflict). Settings hold the
  Gemini key/model, Ollama URL/model, and the `aiMode` toggle.

## Architecture & invariants (read this first)

- **Server-authoritative.** SQLite (`server/src/db.ts`) is the single source of
  truth. Clients only send *intent* events; the server validates them by
  **role** in `server/src/socketHandlers.ts`, mutates via
  `server/src/sessions.ts`, and rebuilds **role-shaped snapshots** in
  `server/src/visibility.ts` (`buildSnapshot`; broadcasts use
  `createSnapshotBuilder` — ONE set of session queries per change-cycle, cheap
  per-viewer shaping, no per-token SELECTs). **Never trust client-computed
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
  + a **server-computed effective `combatRole`**, a real-world `widthFt`
  footprint (snap 0.5 ft, clamp [0.5, 120]), and a `shape`
  (circle/square/diamond/triangle/image — objects default by kind, `image`
  draws pasted art unclipped).
- **`Monster` & `Character` share one tagged stat-block shape:** `level` (PC
  level / monster **CR**), `armorClass`, `speed`, `stats`, `resistances`,
  `weaknesses`, `weapons: Weapon[]` (name, melee/ranged, damage, to-hit),
  `sheetAbilities: SheetAbility[]` (the ONE rollable system), `abilities`
  (traits, free text), `icon`. `actions` is only a *transport* shape (SRD/AI/
  paste) — converted into weapons/sheetAbilities at insert; stored creatures
  keep it empty. `Character` additionally has `proficientSkills`, `spellSlots`,
  `resources`, `items`, `gold`, `deathSaves`, `claimedBy` (live socket) +
  `ownerId` (durable per-browser id of the LAST holder — reconnect priority
  only, does NOT lock others; a char is "taken" only while `claimedBy` is a live
  socket or one in its disconnect grace; DM 🔓-unlocks a stuck claim). `Monster`
  additionally has `disposition`, `source`, `conditions`, `objectKind`/`loot`
  (non-combat objects — but loot works on **any** creature:
  `lootVisibleToPlayers` gates objects on open/unlocked, creatures on
  dead + DM "Loot revealed").
- **Templates vs instances:** `is_template` monsters are the DM's spawn buttons;
  each placement creates a **numbered instance** (Goblin 1, 2, …) with its own
  HP/conditions, referenced by a token.
- **`Disposition`** = `friendly | neutral | enemy` (default enemy) → drives
  player visibility (`toPlayerMonster`): friendly = full stats; **neutral and
  enemy both reveal only name+conditions** (the amber vs red dot is the only
  player-visible difference). `hpNote` visibility is **PC/friendly-only**.
- **`MapState`** has **two independent fog layers** (`mapFogEnabled/Revealed`,
  `tokenFogEnabled/Revealed`) plus grid placement fields
  (`gridOffsetX/Y`, `gridLocked`, `gridHidden`). **Map fog** is a terrain
  blackout (hides ANY non-owned token in an unrevealed cell); **token fog** hides
  ONLY enemy/neutral creatures — PCs and friendly creatures stay visible to
  players even under token fog (a player always sees their own claimed PC too).
- **`StateSnapshot`** is role-shaped and also carries `rollLog`, `chat`,
  `round`, `sessionName`, `annotations` (pen/text/image decals), and
  `hideDmRolls`.

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
- `shared/spellPrep.ts` — `cantripsKnown` + `spellCapacity` (prepared casters =
  mod+level/half, known casters = per-class table, null for martials) and
  `parseActionType` (meta string → action/bonus/reaction).

## Client structure & reuse (don't reinvent these)

- **Routes:** `DmView` (map screen), `DmDataView` (`/dm/data` second-screen
  dashboard), `PlayerView`; entry routes `DmRoute`/`DmDataRoute`/`PlayerRoute`.
- **Canvas:** `MapStage` (Konva stage, fog rendering, placement) + `TokenShape`
  (memoized; content comparators in `lib/entities.ts`, identity-stable handlers
  via `lib/useStableCallback`) + `HpFx` (floating ±X damage/heal numbers).
- **`ReorderableSections`** — drag-reorder (desktop) + tap ▲/▼ (touch) +
  per-section collapse, persisted per storageKey (namespaced by session code).
  Used by the DM/player left panels, the token panel, and the combat console.
- **`StatBlock`** — ONE generalized component for monsters AND characters:
  display ↔ edit toggle, built-in AI-fill, and a **read-only mode** (omit
  `onSave`) for players viewing allies/friendly creatures.
- **`SelectedTokenPanel`** — the full right-side token panel; **also reused**
  inside the Data view's expand overlay (so they never diverge).
- **`CharacterSheet`** = `StatBlock` + skills + resources + items + sheet I/O.
- **Shared action widgets (reuse, don't re-inline):** `DamageHealControls`
  (amount + Damage/Heal, `compact` for the floating menu), `WeaponButtons`
  (attack-button list, `variant` menu/inline), `AbilityButtons` (rollable
  attack/save/damage/heal ability buttons vs a target, `variant` menu/inline,
  inline gets an upcast select; the ONE concentration-confirm + `ability:roll`
  path), `TokenAdminButtons` (DM duplicate/hide/role-badge/delete, `variant`
  menu/panel), and `IconTools` (emoji/upload/clear) — used by both
  `FloatingMenu` and `SelectedTokenPanel`/`BulkActionsPanel`/`CombatSection`
  so the right-click menu and panels can't drift. **`CombatSection`** is the
  right panel's ONE rolling surface for both roles: target dropdown
  (right-clicking a token aims it via the store's `combatTarget` nonce) +
  off-hand/2H + WeaponButtons + AbilityButtons + **`AbilityToggles`**
  (stance/mastery/maneuver chips; the ONE `useAbilityToggles` hook is shared
  with `CharacterSpells`' inline buttons on the left sheet) + a `compact`
  `CharacterResources` (spendable pips, management stays on the sheet).
  `CharacterSpells rollsElsewhere` hides its in-list roll buttons AND toggles
  there; the player console renders it read-only as a reference list. Map toolbar dropdowns
  `MeasureMenu`/`ScaleMenu`/`FogMenu` share the
  `.measure-menu`/`.popover-backdrop` popover pattern. `ReorderableSections`
  slots never-seen section ids in at their fallback index (not appended), so a
  new section designed for the top lands on top for existing saved orders.
- **`useSelection`** — multi-select with optional cross-tab **BroadcastChannel
  sync** (`syncKey`), used to mirror selection between the map and Data windows.
- Helpers: `resolveToken` (`lib/entities.ts`), `presentAuras`/`STANDARD_CONDITIONS`
  (`lib/conditions.ts`).

## Status — DONE (summary; see ROADMAP for the itemized ledger)

- **Real-time VTT:** maps (upload/Slides URL, staging, active/live, rename,
  delete), tokens (place/move/resize/duplicate/hide, sequential instances, icons,
  **shapes** via `token:setShape`, hover card + right-click/long-press floating
  menu — long-press hold-to-open works on mobile), live sync, **two-layer fog**
  (map blackout + token-only; players' covered area is seamless), disposition
  **visibility tiers**, per-token hide, a shared **annotation layer** (pen +
  text, per-person colors, Clear mine/all) with DM **scenery decals**: Ctrl+V
  pastes an image (clipboard bitmap, inline data: URI, or a copied web/Slides
  `<img>` fetched server-side via `/api/icons/from-url`) → a dialog drops it as
  an **object token** (`object:paste`) or an **image decal** under the tokens
  (crop/background-cut/undo via `lib/imageEdit.ts`; DM drag `annotation:move`,
  corner aspect-resize `annotation:resize`, a 🔒 click-through lock, and
  `annotation:clear` by kind for "Clear decals"). A decal can carry a **clickable
  "shop" popup** (`Annotation.popup`, `annotation:setPopup`): a title + note +
  priced items (`DecalPopup`) anyone clicks open — read-only for players, inline-
  editable for the DM. While **editing decals (UNLOCKED)** the DM gets a corner
  🛒 button on every decal (`🛒 +` to add, `🛒` to edit); it's hidden when LOCKED
  so it never clutters the map during play, where a decal **body** click opens the
  editor instead (and the 🔒 lock doubles as the drag-vs-interact mode).
  `token:move` lets players move
  only **PCs + friendly creatures** (objects and hidden tokens are blocked
  server-side).
- **Creatures:** offline **SRD** search + key-gated **Gemini** lookup +
  **cross-session library** (save with side-by-side conflict prompt that also
  detects SRD-name shadowing; lookup checks library → SRD → AI). The SRD bestiary
  (`creatures/srd.ts`) is **fully statted** — every entry has a canonical CR
  (`level`), AC, speed, ability scores, and attacks (type-enforced + a completeness
  test), so any creature from search arrives combat-ready at its INTENDED power
  level (a Goblin stays CR 1/4). Themed AI variants are **grounded on the nearest
  base** (`findBaseCreature`: "Stone Goblin" → the Goblin block as a floor) so they
  scale UP rather than drift.
- **Characters:** DM + player creation, shared tagged sheet (editable), **skills**
  with proficiency/bonuses + **click-to-roll skill checks** (server-resolved
  `skill:roll` using the sheet's mod + proficiency, adv/dis, into the roll log),
  **resources** auto-filled from 5e class/level tables
  (+ custom counters, pip trackers), **inventory items** (+ library picker),
  **spells, abilities & weapon masteries** (`CharacterSpells`: search a local
  rules DB `spells/srd.ts` + `masteries/srd.ts` → Gemini fallback; collapsible
  text; server-resolved `ability:roll` with upcast/cantrip scaling; masteries are
  **tag-driven** — weapons carry `tags`, a mastery has `appliesToTags` + on/off
  toggle and adjusts any tagged weapon's attack in `resolveAttack`, e.g. Graze
  damage on a miss; the weapon line bold-lists applicable mastery mechanics),
  **weapons** store dice-only damage (PCs add the ability mod at roll time,
  finesse→DEX; monsters stay pre-baked) plus `magicBonus`/`tags`/`versatileDamage`;
  combat honors off-hand + versatile-2H toggles (`CombatSection`) and a **2024
  weapon book** (`weapons/srd.ts`, `GET /api/weapons`, "+ From book" picker that
  sets dice + tags), **prepared/cantrip soft counters** (`shared/spellPrep.ts`;
  header "Cantrips x/y · Prepared|Known a/b", red over cap, never blocks; ✓ Prep
  toggle per leveled spell) + **action-economy icons** (●/⚡/↩ from
  `SheetAbility.actionType`, auto-derived, editable), player places/edits own
  token, **high-visibility PC tokens**, party + friendly sheets read-only, sheet
  import (text/JSON) + export.
- **AI:** generate/back-fill creatures *and* characters from free-text
  descriptions; AI picks level/CR. **Character AI generation is grounded in the
  local rules DB** (`creatures/fill.ts` `groundAbilities`/`groundWeapons`): each
  generated spell/ability/mastery + weapon is replaced by the canonical DB entry
  when the name matches (so it's rollable + combat-compatible) and **de-duplicated
  by name** against the sheet — AI fill tops up what's missing without ever making
  a second copy of the same spell. **AI-generated items** (`POST
  /api/items/generate` returns an item with structured `modifiers`, dropped into
  the loot editor — NOT auto-saved; saving to the library is the same explicit
  💾 choice as a custom item); global "AI is working" banner; editable API key +
  model in **Settings**.
- **Combat:** initiative (Roll-all resets + auto-highlights top, **Add rolls** for
  latecomers, Next/**End combat**) with a **round counter** (`combat_round`, DM-editable
  field in the Initiative header; Next increments on a wrap, shown as a chip
  everywhere) — **objects never roll initiative**, **dead combatants keep their
  slot but are skipped** (PCs at 0 HP keep their turn for death saves), and
  deleting the current-turn token ticks the marker forward first. **Dice roller +
  shared persisted roll log** (pruned to 500/session; `/roll 2d6+3 [adv|dis]`
  typed in chat rolls too), **automated weapon attacks** (server-authoritative,
  auto-applies damage on hit), **saving throws** (bulk), and **heals that apply
  on cast** (spells add the casting mod; combat-console Heal-target dropdown,
  self default). Every HP change pops a **floating ±X** over the token (`fx:hp`,
  per-viewer filtered; damage at 0 HP still floats the attempted amount) and
  writes a DM-only **`hpNote`** ("Druk HP 42→38";
  players see it for PCs/**friendly** only). Roll log shows **individual die
  faces**, has a clear button + color-coding by roller/roll type; a **Hide DM
  rolls** toggle (`sessions.hide_dm_rolls`, `session:setHideDmRolls`) flags
  DM-rolled entries `dm_only` and strips them from player snapshots (damage
  still applies, floaters still pop); for players
  enemy **AC is redacted** (`vs AC ?`) while HIT/MISS stays visible, and flat
  mastery damage (GWM prof bonus) is **folded into the damage number** rather
  than appended. A cast spell/ability's full `description`
  rides on its `RollEntry` and shows in the **full** log (overlay shows only the
  one-line result). **Monster attacks — ONE merged system**: free-text `actions`
  (SRD/AI/paste) are only a *transport* shape, converted at insert + by a startup
  migration (`shared/monsterAttacks.ts` `weaponsFromActions`/`actionsToSheetAbilities`):
  weapon-like entries become rollable `weapons`, the rest become rich
  `sheetAbilities` (rolls kept or scraped via `parseActionRoll`) — stored monsters
  keep `actions` empty. The DM builds/edits attacks via the `StatBlock`
  **"+ Attack"** picker spanning the 2024 weapon book (`/api/weapons`) AND a
  natural-attacks library (`/api/attacks`, ~42 entries: Bite/Claw/Slam/Spit/Rock…);
  creature picks are stored **dice-only (`Weapon.diceOnly`)** so the mod + to-hit come
  from the creature's **live stats** like a PC weapon (`rollWeaponAttack` adds the mod
  for `!isMonster || diceOnly`; pre-baked SRD/parsed damage stays as-is). The right
  panel's first section for BOTH roles is a unified **"Combat" section**
  (`CombatSection`): a target dropdown + every rollable action of the selected
  attacker — weapons (off-hand/2H toggles) and rollable abilities
  (attack/save/damage at the target, heals with their own ally select; inline
  upcast). It's the ONE rolling surface: the Spells & Abilities section keeps
  add/edit/prep/stances but its roll buttons hide there (`rollsElsewhere`). For a
  player it acts as their **combat console** — selecting any token shows their own
  actions (target defaulting to the clicked token, friendly creatures excluded),
  not a duplicate sheet, with the **roll log right below it**; the
  right-click **floating menu** offers the **selected** token's attacks against the
  right-clicked token (select attacker, right-click target — right-click never
  changes selection). A compact, click-through **latest-roll overlay** can be pinned
  to the map's bottom-left corner (`RollLogOverlay`, toggled from `DicePanel`).
- **DM Data mode** (`/dm/data`): compact sortable (init/A–Z/type) + drag-reorder
  cards **color-coded by type** (PC cyan / friendly green / neutral amber /
  enemy red / object gray — tinted background + left border, matching the dot
  colors), expand into a large overlay reusing `SelectedTokenPanel`, checkbox
  multiselect synced to the map window driving bulk AOE/conditions/etc., plus a
  right-column roll log (full `DicePanel`).
- **Character library:** cross-session save/load of full PC sheets
  (`library_characters` + `/api/library/characters`, mirroring the creature
  library) — players + DM, via `LibraryCharacterDialog` (save) and
  `LibraryCharacterPicker` (load → `character:loadFromLibrary`).
- **Map tools:** DM-resizable grid + **map scale** (`map:setGrid` carries
  `widthFt`): a map's **real-world width in feet** (`maps.width_ft`) is the source
  of truth for distances (feet-per-pixel = width ÷ image width, computed
  client-side); the grid cell is visual-only and feet-per-square is a derived
  read-out. Scale is also settable by **dragging a reference line** ("Set scale").
  Maps with no width fall back to the legacy feet-per-square model (old saves
  unchanged); a fresh map's width derives from its pixel size. The grid can be
  **hidden, offset, and locked** (`grid_offset_x/y`, `grid_locked`,
  `grid_hidden` ride on `map:setGrid`; offsets normalize into one cell), and
  **"Match map grid (drag a square)"** clones the scale-line drag: one dragged
  printed square sets cell size + origin offset and locks the grid (the locked
  size input gets an Unlock control; feet/width inputs still work since scale
  is width-ft based). Shared, persistent
  **measuring shapes** via a toolbar **"Measure" dropdown** (`MeasureMenu`):
  Circle/Cone/Line/Square/Emanation, each Custom (drag) or Small/Large (classic 5e
  sizes, click-anchor→rotate→click), a snap-to-grid toggle, and click-to-remove +
  Clear mine/all. A `measurements` table (kinds cone/circle/line/square/emanation/
  ruler, optional `tokenId` for token-following emanations) is broadcast in the
  snapshot, drawn on the Konva canvas and coloured per drawer; tokens go
  non-listening while measuring.
- **Objects & loot:** traps/doors/chests/items as map objects (state chips as
  conditions, reveal/hide); **players can Pick lock / Open / Close** doors and
  chests (`object:interact` → `resolveObjectCheck`, a DEX Sleight-of-Hand check
  vs the object DC; DM can force-unlock); loot containers (gold + items, ⓘ
  per-item descriptions) and **creature loot** (DM stocks any creature; takeable
  once dead + "Loot revealed"); trap ⚡ Trigger + player 🔧 Disarm.
- **Shell:** shared **TopToolbar** (editable session name, code, load session,
  Settings, copy link, open Data view, **❔ Guide** — a desktop/mobile controls
  modal for both roles, auto-tab by pointer type), editable map names.

## Remaining / not yet built

- **Phase 7 — Discord video:** no general embeddable iframe; start with a
  **deep-link "Join voice"** button (per-session channel/invite), investigate the
  **Embedded App SDK** (Activity) as the deeper integration.
- **WP7 leftover — drag-reorder panel sections:** DONE (`ReorderableSections`
  everywhere; tap ▲/▼ on touch where HTML5 drag doesn't fire).
- **WP11 follow-up — structured spell attacks:** DONE. `sheetAbilities` carry a
  structured `roll` (attack/save/damage/heal + upcast), rolled server-side via
  `ability:roll`; casting a leveled spell **auto-spends a slot** (`spendSpellSlot`)
  and spell attacks support adv/dis. **Monsters use the SAME system** —
  `sheetAbilities` rolled via `ability:roll` with `{kind:'monster'}` (DM-only),
  resolved by `resolveMonsterSheetAbility` (a thin wrapper over the ONE shared
  `resolveSheetAbilityFor` core: CR-based prof + best INT/WIS/CHA, explicit
  `roll.dc` wins, no slot spend), authored in the creature's **Spells & Abilities**
  section (`CharacterSpells kind="monster"`). A
  save/damage roll's `RollEntry` carries a DM-only `apply` payload, so the full log's
  **"Apply damage"** button arms a **click-to-target** mode (`save:resolve` →
  `resolveForcedSave`): each clicked creature rolls its own save and takes auto half/full
  damage (× resist/vuln); `apply` is stripped for players in `visibility.ts`.
- **Conditions** auto-apply more 5e rules in `resolveAttack`/saves/skills
  (`shared/conditionEffects.ts`): paralyzed/stunned/unconscious/petrified auto-FAIL
  STR/DEX saves; poisoned/frightened give disadvantage on ability checks; applying
  a condition CASCADES its bundle (`impliedConditions`: Unconscious → Incapacitated
  + Prone) via `setCondition`, which also **stamps the combat round** (`Condition.round`,
  shown as "T{n}" on the chip — no auto-expiry, just manual duration tracking).
  **Location-based** (`shared/distance.ts`
  `tokensWithin5ft`, grid-Chebyshev with footprint reach): a **prone** target gives
  advantage WITHIN 5 ft / disadvantage beyond; a **paralyzed/unconscious** target
  within 5 ft is an **auto-crit** (`forceCrit` in `rollWeaponAttack`). Homebrew
  sheet abilities get an inline **"✏️ Add roll"** editor (kind/dice/save/dc/type,
  no AI) + a remove-roll ✕.
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
- **Sheet import is per-section + overwrites only what you pick.** The preview
  (`SheetImportExport`) lists each recognized section as a **checkbox** (default
  all on) with a value preview; "Only empty fields" leaves anything already filled
  alone, then it overwrites just the checked sections. Works on *any* pasted text
  (Roll20, D&D Beyond, …); `parseSheetText` (`shared/sheetIO.ts`) infers **skill +
  save proficiencies** from listed bonuses (bonus ≥ ability-mod + proficiency-
  bonus, no markers needed), scrapes **feats + a Features & Traits block** into
  free-text traits (`abilities`), and captures **spells (by level) + weapon
  masteries** as `sheetAbilities` — names are **resolved against the local rules
  DB at import** (`POST /api/spells/resolve`, no AI) so known entries arrive
  **rollable** (with their structured roll); unknown names stay as references.
  (The old Roll20 `<iframe>` embed was removed — most sites block framing, and
  Roll20 has no per-character export API anyway.)
- **AI is key-gated and fails safe** — every AI path no-ops cleanly without a key.

## Gotchas for edits

- Keep `shared/*` framework-free (imported by both server and client).
- Every player-visible field must pass through `visibility.ts` — never leak via
  the client.
- Client-supplied `SheetModifier[]`/`InventoryItem[]` must pass
  `sanitizeModifiers`/`sanitizeItems` (`shared/modifiers.ts`) before storage —
  they feed the server's own roll math.
- New client→server events need a **role gate** in `socketHandlers.ts` and a
  matching entry in `ClientToServerEvents` (`shared/types.ts`); end mutations
  with `afterChange()`.
- Match the surrounding code's style/comment density.
- Tests are **server-only** (Vitest). Keep `ROADMAP.md` ticked as features land.
