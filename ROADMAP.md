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
- ☑ **Players place their own token [req].** A "📍 Place my token" button in
  PlayerPanel lets a player click the active map to drop their claimed
  character once (`token:spawn` now allows a player to place only their own
  claimed PC, on the active map, no duplicates).
- ☑ **High-visibility PC tokens [req].** Player-character tokens render a bright
  glowing cyan halo so the party stands out clearly from creature tokens.
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
- ☑ **Combined map + token fog, painted separately [req].** A map now has two
  independent fog layers, each with its own enabled flag + revealed-cell set
  (`mapFogRevealed` / `tokenFogRevealed`), both active at once. The fog toolbar
  toggles each layer on/off and a **Paint: Map / Tokens** selector picks which
  layer the Reveal/Hide brush (and Cover-all / Reveal-all) affects. `visibility.ts`
  hides a player's token if it's covered by EITHER enabled layer; map fog blacks
  out terrain (solid for players, translucent for the DM) while token fog shows a
  DM-only purple marker. The old single `fogMode` migrates into the matching
  layer (verified by a two-layer test).

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

- ☑ **Players see & edit their own character; view party + friendly sheets [req].**
  A character's full sheet (`CharacterSheet` = tagged `StatBlock` + skills) is now
  shown to players: editable for their own character (and the DM), read-only for
  party members (expandable in PlayerPanel) and for any **Friendly** creature.
  `SelectedTokenPanel` shows the read-only block to players when the snapshot
  carries full data (friendly creatures / other PCs); `StatBlock` gained a
  read-only mode (no Edit/AI when `onSave` is omitted).
- ☑ **Skills with proficiency + bonuses [req].** `shared/skills.ts` defines the 18
  5e skills (ability map), `proficiencyBonus(level)`, and `skillBonus`. Characters
  store `proficientSkills`; `CharacterSkills` shows each skill's ability, a
  proficiency toggle (owner/DM editable), the proficiency bonus, and the computed
  stat-based total. AI character generation/fill can set proficiencies.
- ☑ **Automated skill checks [req].** Clicking a skill rolls it server-side
  (`skill:roll` → `resolveSkillRoll`): d20 (with a section adv/dis toggle) + the
  sheet's ability modifier + proficiency bonus when proficient, logged to the
  shared roll log as "<Skill> check" (own color tier). Owner/DM-gated.
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

- ☑ **Cross-session library (creatures + items) [req].** App-wide
  `library_creatures` / `library_items` (`server/library.ts`); creature search +
  lookup merge the library (a hit skips Gemini), "💾 Save to library" with a
  side-by-side conflict prompt, and items feed the inventory "add from library"
  picker. (WP5)
- ☑ **Class-specific limited-use resources [req].** `server/data/classTables.ts`
  (5e spell-slot + class-resource tables) auto-fills `spellSlots`/`resources` on
  create and re-derives on level/class change (preserving used + custom).
  `CharacterResources` shows clickable pip trackers + custom counters
  (`resource:set`). (WP6)
- ☑ **Item / inventory tracking [req].** Characters carry `items`;
  `CharacterItems` is an editable list (qty steppers, free-form add, "add from
  library") via `item:set`/`item:remove`. (WP6)
- ☑ **Import/export character sheet [req].** `shared/sheetIO.ts`: a robust
  PLAIN-TEXT scraper (any sheet — name/race/class/level, HP `x/y`, AC, speed,
  ability scores via abbreviations OR full words, marker-based skill
  proficiencies, spell slots) AND a lossless JSON round-trip (Export JSON +
  import). `SheetImportExport` (on the editable character sheet) previews exactly
  which fields will be **overwritten** and confirms before applying; everything
  it doesn't recognize is preserved. (No public Roll20 API, so this works for any
  pasted sheet, not just Roll20.) (WP7)
- ☐ **Drag-reorder toolbar sections [req].** Let DM and players drag to reorder
  the main sections within their side toolbars (e.g. Maps / Spawn / Initiative),
  persisted per role like panel width/collapse. *(Deferred.)*
- ☑ Buff/nerf buttons with custom text (drive the green/red rings) — via the
  existing `ConditionPicker` custom buff/nerf + auras.
- ☑ **Collapsible Roll20 embed [req].** `Roll20Panel`: a collapsible `<iframe>`
  with an "Open ↗" pop-out fallback (Roll20 blocks framing via X-Frame-Options).
- ☑ **Dice roller + shared roll log [req].** `shared/dice.ts` parser
  (`NdM±K`, multi-term, d20 adv/dis); `dice:roll` is computed authoritatively on
  the server and written to a persisted `roll_log`, surfaced in every snapshot.
  `DicePanel` (quick dice, expression, adv/dis, label) + a shared log visible to
  all, in both views' left sidebar. (WP7)
- ☑ **Automated combat rolls [req].** `shared/combatMath.ts` (pure, tested):
  proficiency by PC level OR monster CR, weapon to-hit (tagged value or
  ability mod + prof; ranged→DEX, melee→better of STR/DEX), damage parse with
  crit (double dice on nat-20, auto-miss on nat-1), and saving throws. The
  server resolves `combat:attack` authoritatively (to-hit vs the target's AC,
  damage auto-applied on a hit, logged to the shared roll log) — gated to the DM
  or the player who owns the attacking PC. `AttackControls` on the selected-token
  panel rolls each weapon at a chosen target (adv/dis). `combat:save` rolls a
  DC-X ability save for the whole multi-selection from `BulkActionsPanel`. (WP11)
- ☑ **Spells & abilities on the character sheet [req].** `CharacterSpells`
  adds a searchable spell/ability menu to the sheet: a local rules database
  (`server/src/spells/srd.ts`, curated SRD spells + class features with
  structured rolls) is queried first via `GET /api/spells`, with a key-gated
  **Gemini** fallback (`POST /api/spells/lookup`). Each entry has a collapsible
  description and, where applicable, a **roll button** resolved authoritatively
  (`ability:roll`): spell attack bonus / save DC derived from the caster, damage
  upcast by the chosen slot level, cantrips scaled by caster level
  (`shared/spellMath.ts`, pure + tested). Rolls land in the shared roll log;
  owner/DM-gated like items. (extends the WP11 structured-spell follow-up)
- ☑ **Weapon masteries (2024) [req].** The 8 mastery properties (plus **Hew** —
  the 2024 Great Weapon Master feat, same format) in `server/src/masteries/srd.ts`
  are searchable in the Spells & Abilities menu and added as `type:'mastery'` sheet
  entries. Effect-bearing entries get a **weapon binding + on/off toggle**; when
  active and bound to the attacking weapon, `resolveAttack` adjusts that attack
  server-side: **Graze** (ability-mod damage on a miss), **Cleave** (rolls the
  second-creature damage — weapon dice + magic, no ability mod — logged for manual
  application), **Hew** (proficiency-bonus damage on a hit), and a generic on-hit
  `bonusDamage` lever (homebrew/AI). The rest (Push/Sap/Slow/Topple/Vex/Nick) are
  collapsible descriptions handled manually.
- ☑ **Weapon magic bonus as a separate field.** `Weapon.magicBonus` keeps a
  weapon's magic damage distinct from its ability modifier (which lives in the
  `damage` string), so mastery effects that strip the ability mod (Cleave) keep
  the magic damage. `rollWeaponAttack` adds it to every hit (not doubled on a
  crit); editable in `StatBlock`.

## Phase 6 — AI assistance (future)

- ◐ AI-assisted spell/ability lookup is **done** for the sheet (Gemini fills a
  structured spell when it's not in the local database); full spell-effect
  resolution (auto-applying area damage to targets) and rules/item lookup remain.
- ☐ AI-generated enemy combat dialogue on hit/miss/target.

## Phase 7 — UX shell & integrations (future)

- ☑ **DM Data mode (second-screen dashboard) [req].** A standalone `/dm/data`
  route (`DmDataRoute` → `DmDataView`) opened in a new window via a 🗔 **Data
  view** button in the DM toolbar — for a second monitor / tablet, freeing the map
  screen of its sidebars. It connects as another DM client (no new server state)
  and always mirrors the LIVE active map (re-selects it if the main DM switches).
  A grid of **compact cards** (name, HP bar, quick damage/heal, AC, ability
  scores, condition chips + a Status picker) that **expand into a large overlay**
  (over everything, flowed into responsive columns so the full token panel fits
  on screen without a skinny scrolling card). The per-card **Status** picker opens
  in a floating popover ABOVE the grid (no longer clipped behind cards). The
  overlay reuses the exact same `SelectedTokenPanel` the map uses — editable stat
  block + AI fill, disposition, combat-role, icon tools, conditions,
  duplicate/hide/delete, damage/heal, resize. **Sort** by initiative / A–Z / type
  (players first, then creatures grouped by type), then **drag-reorder** cards. A
  per-card **checkbox multi-selects**, which mirrors to the map window
  (BroadcastChannel between DM tabs via `useSelection` `syncKey`) and drives the
  `BulkActionsPanel` from the Data screen. Initiative header: **Roll all** resets
  the round (re-roll everyone, auto-highlight the top), **Add rolls** rolls only
  combatants who haven't yet, Next / Clear. *(Future: selectable/toggleable panels.)*
- ☑ **Top app toolbar [req].** Shared `TopToolbar` replaces the ad-hoc headers in
  `DmView` / `PlayerView`, role-aware:
  - **Load session** (DM) / **Leave** (player) — disconnects and returns to the
    landing/resume screen.
  - **Settings** (DM) — `SettingsModal` edits the **Gemini API key** (masked,
    write-only — blank keeps the current one) and **model** (auto-detect when
    blank), via `GET/POST /api/settings` (`settings.ts`). The raw key is never
    returned to clients; saves persist to `data/settings.json`, apply on top of
    env at boot, and reset the Gemini model cache. Gated by the DM passphrase
    when one is configured. Built so new settings are simple rows.
  - **Session info** and **Copy player link** (DM) moved here.
  *(Future settings to add as rows: default fog, grid size, theme, Discord
  channel for the integration below.)*
- ☐ **Discord video integration [req].** Bring the table's Discord voice/video
  into the app so players don't need to juggle windows. Feasibility caveat (like
  Roll20): Discord has no general embeddable video iframe — viable paths are
  (a) a **Discord Activity** via the Embedded App SDK (richest, requires a
  registered Discord app + running inside Discord), or (b) a **launch / deep-link**
  button that opens the table's voice/video channel (`discord://` / invite URL),
  optionally remembered per session. Start with (b) — a "Join voice" button in
  the new top toolbar with a per-session channel/invite setting — and investigate
  (a) as the deeper integration.
