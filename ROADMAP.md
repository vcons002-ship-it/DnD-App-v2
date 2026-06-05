# Roadmap & Feature Backlog

Phase 1 (MVP) is built. This file is the authoritative backlog for later phases.
Items tagged **[req]** come directly from the product owner's notes and must be
included. Status: ☐ todo · ◐ partially done · ☑ done.

## Cross-cutting invariants (must always hold)

- ☑ **Durable sessions [req].** Every session code, its game state (maps, tokens,
  positions, HP, conditions, initiative), and created/last-played **dates**
  persist in local SQLite (`server/src/db.ts`). Restarting the server / re-running
  `start.bat` never resets state; loading a code restores the exact board.
  Schema upgrades use idempotent `ensureColumn` migrations so old saves keep
  working. `data/` and `uploads/` are never wiped by start/build.
- ☑ **Session directory [req].** `GET /api/sessions` lists past sessions
  (code, name, map count, dates), surfaced on the DM landing page for one-click
  resume.

## Phase 2 — Canvas UX, DM combat tooling, persistence polish ✅ (done)

- ☑ **Map zoom & pan [req].** Wheel-zoom toward the cursor + drag-to-pan in
  `MapStage.tsx`, with a **Fit** button to reset to fit-to-window.
- ☑ **Collapsible *and* resizable side panels [req].** `SidePanel.tsx` —
  drag handle + collapse toggle, width/collapsed persisted to localStorage.
- ☑ **Direct click-to-place + multi-placement [req].** Clicking anywhere on the
  map places; placing mode stays active to drop several in a row (Esc or
  re-clicking the unit stops).
- ☑ **Delete token (DM) [req].** Delete button on the selected-token panel +
  Delete/Backspace removes the whole selection.
- ☑ **Death marker [req].** 💀 overlay + dimmed token at 0 HP.
- ☑ **Three concentric status rings [req].** `presentAuras()` + nested rings in
  `TokenShape.tsx`; buff/negative/concentration show together.
- ☑ **Initiative tracker [req].** Roll-all (d20), Next (advances active turn,
  wraps), Clear; list sorted by initiative; active turn highlighted on the token
  (dashed ring) and in the panel.
- ☑ **Multi-select + map thumbnails [req].** Shift/Ctrl-click multi-select with
  group drag; image thumbnails in the map switcher.
- ☑ **Delete map [req].** Per-map ✕ in the DM map switcher (`map:delete`, with a
  confirm). Removes the map plus its token placements and any monster instances
  those tokens uniquely referenced; templates and instances still placed on other
  maps are kept. Deleting the active map promotes the next remaining map (or
  none) and clears a dangling turn marker.
- ☑ **Carry tokens between maps [req].** "Bring tokens to this map" (PCs /
  Monsters / All); source map retains its tokens; HP/conditions carry via refs.

## Phase 2 follow-ups — token UX & permissions [req]

Smaller refinements on top of the shipped Phase 2 work.

- ☑ **Hover token menu [req].** Hovering a token shows a small read-only card
  (`TokenHoverCard`) with name, HP where visible, and conditions for both DM and
  players; **right-click / 500ms long-press** opens the fuller floating action
  menu (`FloatingMenu` — Duplicate / Hide / Delete for the DM), wired in
  `TokenShape` and rendered as an overlay by `MapStage`.
- ☑ **Players cannot resize tokens [req].** `token:resize` is now DM-only and the
  size buttons are disabled for players (they may still move tokens).
- ☑ **Initiative *order* on token [req].** The on-token badge now shows turn ORDER
  (1, 2, 3 …); the DM initiative list shows BOTH the order (#) and the roll.
- ☑ **Carry-tokens confirmation [req].** `copyTokens` returns a count; the server
  sends a `notice` the DM surfaces as a bottom toast ("Brought N tokens to this
  map"), auto-dismissed after 3s.
- ☑ **Clearer player character selection [req].** Explicit per-character "Play"
  CTA, a "you" badge on the claimed character, and a "Change" button that releases
  it and reopens the chooser. New `character:release`; `claimCharacter` now frees
  any prior claim so a player holds exactly one.

## Phase 3 — Fog of war & map masking ✅ (mostly done)

- ☑ Fog of war: per-map grid-cell fog stored in SQLite (`maps.fog_revealed`).
  DM Reveal/Hide brush with **1×/3×/5× brush sizes** + Cover-all / Reveal-all.
  DM sees through (translucent); players see solid cover; fog-covered tokens are
  filtered out server-side in `visibility.ts` (covered tests).
- ☑ **Token-only fog [req].** Per-map fog *mode* (`off` / `map` / `tokens`).
  In `tokens` mode the map stays fully visible to players but creature tokens in
  covered cells are hidden; the DM sees a translucent purple marker of the hidden
  region. (`tokens` mode seeds revealed so the DM paints spots to hide.)
- ☑ **Hide individual tokens [req].** DM "Hide from players" toggle on the
  selected-token panel (`token:setHidden`); hidden tokens never reach players
  regardless of fog.
- ☑ **DM "curtain" [req].** Served by the same system: **Cover all**, then reveal
  the starting area — a large map appears smaller until players investigate.
  (If a distinct hard-rectangular crop is ever wanted, revisit.)
- ☑ Save/load is provided by the durable-session invariant — fog, tokens, and
  board state persist by session code and reload on restart (verified by tests).
- ☐ **Live tokens over Google Slides (stretch, if feasible) [req].** Overlay the
  interactive token layer on top of a linked Slides embed so tokens can be placed
  on Slides maps. Technically tricky (cross-origin iframe) — investigate an
  absolutely-positioned transparent canvas over the iframe.
- ☐ **Combined map + token fog, painted separately [req].** Let a single map use
  BOTH map fog and token fog at the same time, as two independent painted layers
  (separate Reveal/Hide per layer) — so the DM can hide terrain and hide
  creatures in different areas. Requires splitting the current single fog mode +
  `fogRevealed` set into two layers (e.g. `mapFogRevealed` / `tokenFogRevealed`)
  with a layer selector on the brush.

## Phase 4 — Creature data & token art ✅ (done)

- ☑ SRD creature search (offline, curated subset in `server/src/creatures/srd.ts`)
  with autofill, plus a key-gated **Gemini fallback** (`creatures/gemini.ts`,
  fails safe) for names not in the SRD. Surfaced via `GET /api/creatures` and
  `POST /api/creatures/lookup`. *(Future: optional live Open5e fetch for the full
  bestiary; the curated list keeps it fully offline today.)*
- ☑ **Spawn multiple monsters at once [req].** Count field → N independent
  records, auto-numbered "Goblin 1..N"; checks existing names and continues the
  numbering so names never collide (verified by tests).
- ☑ **Duplicate token (DM) [req].** Right-click / long-press a placed token (or
  the selected-token panel) → "Duplicate" drops a second, independently-tracked
  copy one square over, carrying the source's current HP/conditions and taking
  the next sequential name ("Goblin 2"). Replaces the old spawn-list "Copy"
  template button, which sequential instancing already made redundant.
- ☑ **Auto token icons [req].** Emoji icon auto-assigned by creature name/type
  (`iconForCreature`), rendered on the token (DM + players).
- ☑ **Custom icon upload + bulk apply [req].** Upload an image (`POST /api/icons`)
  or set an emoji on the selected token; applies to the whole multi-selection.

### Phase 4 refinements (later pass)

- ☑ **Gemini env fix.** `.env` is now loaded from the repo root even when the
  server runs with cwd = `server/` (npm workspaces) — that's why the key wasn't
  picked up. Failures are also logged server-side now.
- ☑ **Full stat blocks.** Monsters carry AC, speed, ability scores, actions and
  traits (SRD + Gemini); the DM sees a full stat block (`StatBlock.tsx`) on the
  selected token.
- ☑ **One button per creature [req].** Creating a creature makes a reusable
  *template* (one spawn button); each click-to-place spawns a unique **numbered
  instance** (Goblin 1, 2, 3…) with its own HP/conditions. Templates vs instances
  via `is_template`/`template_id`.
- ☑ **Delete spawn buttons [req].** ✕ on each creature template removes it
  (`monster:delete`) so the list stays short.

## Persistent creature & item library [req]

- ☐ **Save custom / AI creatures & items for reuse [req].** Store custom-made and
  Gemini-generated creatures (and, later, items) in a **cross-session local
  library** so they're searchable and reusable in any future session — not just
  the session they were made in. Details:
  - A library table (e.g. `library_creatures`, `library_items`) at the app level,
    independent of any one session's templates.
  - The creature search (`GET /api/creatures`) merges results from **SRD + your
    saved library**, so your homebrew/AI creatures show up in autofill.
  - **DM-controlled save only — no auto-save.** AI results are *not* saved
    automatically; the DM saves explicitly via a "Save to library" button.
  - **Save under a DM-edited name.** The name saved is whatever the DM enters at
    save time, not the query. e.g. query AI for "bandit with a short sword", then
    save it as just "bandit" — future searches for "bandit" hit the library and
    **don't call the AI again**.
  - Pairs with item tracking (Phase 5) — saved items become a pickable catalog.

## Phase 5a — Characters, NPCs & editing [req]

- ☑ **Create party characters [req].** Both the DM (DmPanel) and players
  (PlayerPanel) can add characters — name, race, class, HP, ability scores — via
  a `NewCharacterForm` → `character:create` → `createCharacter()`. Players can
  create one and immediately claim it.
- ☑ **Pre-placement creature editing [req].** Each DM spawn-list creature has an
  "Edit" toggle opening a `TemplateEditor`: adjust the full tagged stat block,
  "✨ Fill missing details with AI", and set the token image (emoji/upload) BEFORE
  placing. Edits target the template, so every instance placed afterwards
  inherits them.
- ☑ **Bulk multi-select token edits [req].** Selecting >1 token shows a
  `BulkActionsPanel`: AOE Damage/Heal all, apply/clear conditions on all, set one
  token image on all (`tokens:setIcon`), and (DM) hide/show, hide/show role
  badges, and delete the whole selection. New `tokens:damage` /
  `tokens:setCondition` / `tokens:clearConditions` / `tokens:setHidden` events.
- ☑ **Disposition on every creature [req].** Each creature carries a
  `disposition` (`friendly` / `neutral` / `enemy`, default enemy) set via a
  selector on the DM's selected-token panel (`monster:update`). It shapes the
  player payload in `visibility.ts` (3-tier `toPlayerMonster`):
  - **Friendly** — full stat block visible (like a party member).
  - **Neutral** — name + HP + type + AC only.
  - **Enemy** — name + conditions only (the original hostile view).
  Instances inherit their template's disposition; a small green/amber/red dot on
  the token shows it at a glance to DM and players (verified by per-tier tests).
  *(NPCs are just creatures with a non-enemy disposition; explicit NPC/character
  creation is the next item.)*
- ☑ **Editable NPC/creature stats [req].** `StatBlock` has a display ↔ edit
  toggle; the DM can patch every tagged field in place — name, type, HP/AC/speed,
  ability scores, resist/vulnerable, Weapons, Actions, Traits — via
  `monster:update` (dynamic patch, clamps curHp to a lowered max).
- ☑ **Tagged creature data [req].** Creatures carry structured `weapons`
  (name + melee/ranged + damage + to-hit) alongside stats/actions/abilities, so
  missing data is obvious and reusable by later features (combat-role now, attack
  rolls in WP11).
- ☑ **AI back-fill of missing fields [req].** "✨ Fill missing details with AI"
  on the stat panel → `ai:fillCreature` asks Gemini for the SRD block and merges
  ONLY empty fields (type/HP/AC/speed/stats/resist/weapons/actions/traits),
  never overwriting DM edits. Fails safe with no/invalid key (tested).
- ☑ **Combat-role badge [req].** Each token shows ⚔️ melee / 🏹 ranged / ✨ caster,
  derived from creature data (`shared/combatRole.ts`) and computed server-side so
  it reaches players even on enemies. DM can override (Auto/⚔️/🏹/✨) or hide the
  badge across a multi-selection (`tokens:setCombatRole` /
  `tokens:setHideCombatRole`).

## Phase 5 — Player resources, items, Roll20, dice

- ☐ **Class-specific limited-use resources [req].** Track and update spell slots,
  second wind, superiority dice, sorcery points, etc. on the player token/panel.
- ☐ **Item / inventory tracking [req].** Let players track items on their
  character.
- ☐ **Import character tracker from Roll20 sheet [req].** Pull stats, modifiers,
  spell-slot counts, and limited-use resources from a player's linked Roll20
  character sheet to auto-populate the tracker (ties into the character-selection
  cleanup above).
- ☐ **Drag-reorder toolbar sections [req].** Let DM and players drag to reorder
  the main sections within their side toolbars (e.g. Maps / Spawn / Initiative),
  persisted per role like panel width/collapse.
- ☐ Buff/nerf buttons with custom text (drive the green/red rings).
- ☐ Collapsible Roll20 `<iframe>` (DM roll logs; player character sheet).
- ☐ **Sidebar layout for Roll20 [req].**
  - Players: fold the selected-token info into the LEFT sidebar (with the
    character tracker) or the hover/floating menu, freeing the RIGHT sidebar for
    the Roll20 character sheet + roll log.
  - DM: keep the right toolbar for token editing but include a *small* Roll20
    roll-log panel — the roll log is the only Roll20 piece the DM needs.
- ☐ Optional in-app dice roller.

## Phase 6 — AI assistance (future)

- ☐ AI-assisted spell-effect resolution and rules/item lookup from current D&D
  rules.
- ☐ AI-generated enemy combat dialogue on hit/miss/target.
