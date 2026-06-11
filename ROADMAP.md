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
- ☑ **Edit / delete saved sessions [req].** Each saved-session row on the DM
  landing page shows its **name** and has **✎ edit** (rename + change the join
  **code**) and **🗑 delete** actions. Because all data is keyed by `sessions.id`
  (not `code`), changing the code is a one-line `UPDATE` that **preserves every map,
  token and log** — only links to the old code stop working. Delete cascades via
  `ON DELETE CASCADE`. Server: `changeSessionCode` / `deleteSession`
  (`sessions.ts`) + `PATCH`/`DELETE /api/sessions/:code` (gated by the DM passphrase
  when configured); validated by tests.
- ☑ **Import maps from another session [req].** A DM **"⇪ Import maps from another
  session"** dialog (`ImportMapsDialog` in `DmPanel`): enter a code, preview its maps
  (`GET /api/sessions/:code/maps`) with token counts, **pick** which, and deep-copy
  each picked map + its tokens + the creatures/PCs they reference into the current
  session (`importMaps` in `sessions.ts`, a transactional generic `cloneRow`; fresh
  ids, monster template links + player claims dropped, images shared by global path).
  DM-gated socket `session:importMaps` → `afterChange()`. Source session untouched;
  validated by tests.

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
- ☑ **High-visibility PC tokens [req].** Player-character tokens wear a 👑 crown
  above the rim (with the name lifted to clear it) so the party stands out clearly
  from creature tokens, without the old glowing halo crowding the status rings.
- ☑ **Temporary HP [req].** Characters and monsters carry a flat 2024-rules
  temp-HP buffer pool (`tempHp`, server-side `temp_hp`), set via the stat block's
  "Temp" field (DM for creatures, owning player for their own PC). Damage drains
  temp HP first with overflow to real HP, and healing never refills it
  (`applyDamage`, the single chokepoint for direct/AOE/combat damage). Shown as a
  cyan "+N" on the token HP bar and a "+N temp" suffix in panels/cards; visible to
  players for their own PCs and friendly/neutral creatures.
- ☑ **Short AI creature names [req].** The Gemini creature lookup now returns a
  short, flavorful name (e.g. "Bandit Captain") instead of echoing the whole
  free-text description; applies on the create flow only (back-fill leaves names).
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
  (`skill:roll` → `resolveSkillRoll`): d20 (with the creature's adv/dis toggle) +
  the sheet's ability modifier + proficiency bonus when proficient, logged to the
  shared roll log as "<Skill> check" (own color tier). Owner/DM-gated.
- ☑ **Click a stat block to roll its save [req].** Each ability score in a
  `StatBlock` is clickable to roll that creature's saving throw (`save:roll` →
  `resolveSave`): d20 + ability modifier + proficiency when proficient in the save,
  honoring the creature's adv/dis toggle and conditions. Works for a PC (owner/DM)
  and a monster (DM). The per-creature adv/dis toggle also now drives **bulk saves**
  (`combat:save` carries an `advantageByToken` map from each selected creature's
  toggle) and the **"Apply damage" click-to-target save** (`save:resolve` carries
  the clicked creature's advantage).
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
- ☑ **Weapon masteries (2024), tag-driven [req].** Modeled per the books: you gain
  mastery in specific weapons, so entries are named **"<Weapon> Mastery"**
  (e.g. "Longbow Mastery") and carry that weapon's mechanic as `weaponLabel`
  (e.g. "Slow"). `server/src/masteries/srd.ts` maps every 2024 weapon → its mastery
  property (plus **Great Weapon Master**, a feat, same format); searchable by weapon
  OR mechanic. **Weapons carry `tags`** (a type + props, e.g. `["halberd","heavy"]`,
  edited in `StatBlock`); a mastery declares `appliesToTags`, and an **active**
  mastery in the abilities list triggers on any attack with a weapon whose tags
  overlap — no per-weapon binding.
  `resolveAttack` then adjusts the attack server-side: **Graze** (ability-mod damage
  on a miss), **Cleave** (weapon damage minus the ability modifier to the target,
  then one-shot toggles off), **Great Weapon Master** (proficiency-bonus damage on a
  hit, all Heavy weapons), and a generic on-hit `bonusDamage` lever (homebrew/AI).
  The rest (Push/Sap/Slow/Topple/Vex/Nick) are collapsible descriptions handled
  manually. The weapon display **bold-lists the mechanic** of each applicable
  mastery via `weaponLabel` (defaults to the name) — e.g. a `[longbow][heavy]`
  weapon shows `Slow, GWM`, and a heavy melee weapon also shows the melee-only
  `meleeLabel` `Hew` (GWM's extra-attack mechanic).
- ☑ **Battle Master maneuvers, tag-driven [req].** `server/src/maneuvers/srd.ts`
  carries the full 2024 maneuver set (`GET /api/maneuvers`, also folded into the
  sheet "add" search). A maneuver is a toggleable sheet entry (`type: 'maneuver'`)
  that spends a **Superiority Die** (`Character.superiorityDie`, default d8; the
  pool is a normal `resources['Superiority Dice']` counter seeded on first add).
  When **armed**, the next attack with a matching weapon rolls the die and applies
  it per `addDieTo`: **attack** (Precision, added to the to-hit), **damage** (folded
  into the hit), **heal**/**none** (rolled + noted). A `save` rider logs its own
  click-to-target save (DC 8 + prof + STR/DEX mod) whose **failure applies a
  condition** via the existing force-save tool (`apply.onFail` → Prone/Frightened/
  Grappled). The maneuver spends a die and one-shot toggles itself off, exactly
  like Cleave; positional/reaction effects are noted for manual resolution.
- ☑ **Ability modifier added at roll time (PCs).** PC weapons store **dice only**;
  `rollWeaponAttack` adds the wielder's ability modifier (finesse-aware) from their
  live stat on a hit. Monsters' stat-block damage is left pre-baked (no auto-add).
  Off-hand / Cleave attacks omit that modifier. The sheet shows the effective
  damage (dice + current mod).
- ☑ **Weapon magic bonus as a separate field.** `Weapon.magicBonus` is its own
  damage modifier (not the ability mod), so it survives effects that strip the
  ability mod (Cleave / off-hand). `rollWeaponAttack` adds it to every hit (not
  doubled on a crit); editable in `StatBlock`.
- ☑ **Off-hand, versatile (2H), and finesse [req].** `AttackControls` has
  **Off-hand** and (when a weapon is versatile) **2H** toggles alongside adv/dis,
  threaded through `combat:attack` → `resolveAttack`. Off-hand omits the ability
  modifier (decided before the roll, unified with Cleave); 2H rolls the weapon's
  `versatileDamage` dice. `weaponAbility` is tag-aware — only `finesse` melee
  weapons use the better of STR/DEX (others use STR). The `light` tag is reserved
  for future off-hand feats. Weapon editor gains a 2H-damage field; tags carry the
  mechanics.
- ☑ **2024 weapon database [req].** `server/src/weapons/srd.ts` holds every 2024
  PHB weapon with dice, damage type, properties, range, versatile dice, and its
  mastery property; `GET /api/weapons` searches it. The weapon editor’s **“+ From
  book”** picker fills a sheet weapon from it — **dice-only** damage (the wielder’s
  modifier is added at roll time) and `tags` = type + properties (so
  masteries/finesse/versatile/heavy all light up automatically).
- ☑ **Player combat console (right panel) [req].** For a player, selecting ANY
  token turns the right `SelectedTokenPanel` into a combat console for THEIR own
  PC: `AttackControls` (attacker = the player's own token) defaults its target to
  the clicked token, plus `CharacterSpells` (abilities/masteries). The player's
  full editable sheet is no longer duplicated here (it lives in the left
  `PlayerPanel`); a visible creature's read-only StatBlock still shows for target
  context. The attack **target dropdown excludes friendly creatures** (friendly
  monsters + other PCs) for players. DM behavior is unchanged (DM still attacks
  AS the selected token).
- ☑ **Collapsible creature "Details" for players [req].** A player's combat
  console now leads with a collapsible, read-only **Details** panel (below the
  name/HP), **collapsed by default** and sticky (`detailsExpanded` in the store).
  Expanding it shows exactly what the creature's disposition tier grants — a full
  read-only `StatBlock` for a Friendly creature, type/AC/conditions for Neutral,
  conditions only for Enemy, or a read-only `CharacterSheet` for an allied PC.
  **Double-clicking a token** selects it and auto-expands the panel (`onActivate`
  on `TokenShape` → `MapStage`).
- ☑ **Floating-menu select-then-attack [req].** Select a token (the attacker),
  then right-click another token to attack it: the `FloatingMenu` offers the
  **selected token's** weapons, targeting the right-clicked token. Gated exactly
  like the server `combat:attack` (DM, or the owner of the attacking PC; no
  attacks when nothing else is selected or you right-click your own selection).
  One button per weapon → `combatAttack`. A right-click never changes selection
  (`TokenShape` ignores non-primary mouse buttons in its click handler — Konva
  otherwise synthesizes a left-click for the right button), so the attacker stays
  selected without needing Ctrl.
- ☑ **Latest-roll overlay [req].** The shared roll log stays in the left panel; a
  **⤢ Overlay** toggle (`DicePanel` → `showRollOverlay` store flag, **on by default**)
  shows a compact, **click-through** (`pointer-events:none`) `RollLogOverlay` pinned to
  the **bottom-left** of the map. It's a live feed: every roll under a minute old is
  **stacked** as a single line (newest nearest the corner, capped at 6), each fading in
  on arrival; as lines age past ~60s they **fade out** and the stack shrinks back to
  just the **most-recent roll, which always stays visible**. The map stays fully
  clickable underneath. DM **Clear** stays in the left UI. The overlay shows only the
  one-line `detail` (never a roll's long `description`).
- ☑ **Quick-dice D20 button [req].** A **D20-shaped** quick-roll button (`DiceButtonOverlay`)
  pinned to the **bottom-right** of the map, toggled by a **🎲 Dice** button (`DicePanel`
  → `showDiceButton` store flag, **on by default**). Sits **semi-transparent/unobtrusive**
  until hovered, then fades to full opacity and reveals the basic dice (d4–d20, d100)
  above it; clicking the d20 rolls `1d20`, clicking a die rolls one of it — all through the
  same server-authoritative `dice:roll` path into the shared roll log. Shown for DM + players
  (rendered once in shared `MapStage`).
- ☑ **Roll-overlay rework [req].** Each overlay line now shows its **full text**
  (wraps, never truncated). New rolls fade in and, when idle, fade out **~20s**
  later, leaving a faint latest line as a hover target. **Hovering** fades the panel
  to full opacity — within a minute it reveals the recent stack; once the latest roll
  is **over a minute** old, hovering shows only that single latest roll
  (`RollLogOverlay` + `.roll-log-overlay` CSS).
- ☑ **Player roll log on the right [req].** In the PLAYER view the shared roll log
  (`DicePanel`) lives in the RIGHT panel **beneath** the combat console, so clicking
  an attack shows the result immediately below. The DM keeps the left-panel log.
- ☑ **Spell descriptions in the full log [req].** `RollEntry` carries an optional
  `description`; `resolveAbilityRoll` attaches the cast spell/ability's full rules
  text. The **full** roll log (`DicePanel`) renders it (so others can read it); the
  compact overlay shows only the one-line result. Persisted via an idempotent
  `ensureColumn('roll_log','description',…)`.
- ☑ **Monster attack rolls (parse `actions` → `weapons`) [req].** SRD/AI monsters
  store attacks as free-text `actions`; `shared/monsterAttacks.ts`
  (`weaponsFromActions`, pure + tested) turns any action that has **both** a
  `+N to hit` and damage dice into a rollable `Weapon` (melee/ranged inferred from
  text, damage type + range captured), leaving non-attack actions (Multiattack,
  save/recharge breath) as leftovers. Wired into `createMonsterTemplate` (the
  single SRD/AI/library/copy chokepoint) so spawned monsters get rollable weapons.
  The DM can also **build/edit attacks** in the creature's `StatBlock` editor: a
  single **"+ Attack"** picker pulls from BOTH libraries — the 2024 weapon book
  (`/api/weapons`) and a new **natural-attacks library** (`server/src/attacks/natural.ts`,
  `/api/attacks`: Bite, Claw, Slam…) — plus a **Custom (blank)** row. A creature pick
  is stored **dice-only with a `diceOnly` flag**, so — exactly like a PC weapon — the
  ability modifier and to-hit are pulled from the creature's **live stats** at roll
  time (`rollWeaponAttack` adds the mod for `!isMonster || weapon.diceOnly`; tags carry
  finesse so STR/DEX is chosen correctly). Pre-baked SRD/parsed/hand-typed monster
  damage stays as-is (no flag), so it isn't double-counted. A **↻ Pull attacks from
  description** button re-runs the parser on the creature's `actions` on demand.
- ☑ **Structured monster action rolls [req].** A monster `action` can carry the same
  structured `roll` (`AbilityRoll`) PCs use, so the DM one-clicks a breath weapon /
  spell-like action: the server (`resolveMonsterAction`, mirror of `resolveAbilityRoll`)
  rolls the damage and shows the **save DC computed from the monster's CR + casting
  mod** (`8 + profBonusFor(CR) + best-of-INT/WIS/CHA`), or an explicit `roll.dc` from
  the stat block, logged with the action's description. Kinds: attack (to-hit + dmg),
  save (dmg + "DC N <ability> save for half"), damage, heal. DM-gated socket
  `monster:action`; authored/edited in the creature `StatBlock` (kind/dice/save/DC/type)
  with a **↻ Derive rolls from descriptions** button (`parseActionRoll` scrapes DC +
  dice from SRD/AI text). Per-target saves + damage reuse the existing bulk-save +
  damage tooling (parity with PC spell rolls); `roll`/`dc` optional so old saves load.
- ☑ **"Apply damage" → click-to-target saves [req].** A save/damage spell's damage roll
  (PC `resolveAbilityRoll` or monster `resolveMonsterAction`) carries a DM-only `apply`
  payload (rolled **amount** + server-computed **DC** + save ability) on its `RollEntry`.
  In the full log the DM gets an **"🎯 Apply damage"** button that arms a **click-to-target
  mode** on the map: each creature clicked rolls **its own** save (ability + proficiency +
  conditions) vs the DC and **auto-applies full (fail) / half (pass)** of the amount
  × resist/vuln (`resolveForcedSave` reuses `rollSavingThrow`/`saveAdvantage`/`applyDamage`/
  `damageMultiplier`); every save is logged. Keep clicking targets until **Esc**; the
  source roll keeps its payload so many targets reuse one roll. Save-less (`damage`-kind)
  applies full with no save. `apply` is **stripped for players** in `visibility.ts`; the
  bulk-selection manual path stays as the alternative. Persisted via
  `ensureColumn('roll_log','apply',…)`; DM-gated socket `save:resolve`.
- ☑ **Hide enemy AC in the roll log [req].** For players, `buildSnapshot` redacts
  `vs AC N` → `vs AC ?` in roll-log attack details (centralized at the one
  role-shaping point); the d20/total and HIT/MISS/CRIT resolution stay visible.
- ☑ **GWM folded into the initial damage [req].** Flat mastery damage (Great Weapon
  Master's proficiency bonus, flat homebrew `bonusDamage`) is pre-computed before
  the roll and folded into the damage number/breakdown via `rollWeaponAttack`'s
  `bonusDamage`/`bonusLabel`, instead of being appended as a trailing note.
  Dice-based bonuses and Graze (on a miss) still roll separately.
- ☑ **Save/load characters between sessions [req].** A cross-session
  **character library** mirroring the creature one: `library_characters`
  (`db.ts`), `saveLibraryCharacter`/`search`/`get`/`delete` (`library.ts`),
  `/api/library/characters` routes, and a `LibraryCharacterDialog`. **Players and
  the DM** both use it — a "💾 Save to library" button on the editable
  `CharacterSheet` saves the full sheet minus session state (keeps
  `sheetAbilities`/`items`/`spellSlots`/`resources`), and a "📂 Load saved
  character" picker (`LibraryCharacterPicker`) in `PlayerPanel` (claims it) and
  `DmPanel` (unclaimed) instantiates it via `character:loadFromLibrary` →
  `createCharacterFromLibrary`.
- ☑ **Resizable grid + map scale [req].** A DM control in the map toolbar sets a
  map's cell size (px, visual only) and its **real-world width in feet**
  (`maps.width_ft`, the source of truth for scale → feet-per-pixel = width ÷ image
  width). Feet-per-square is shown as a **derived read-out**, and scale can also
  be set by **dragging a reference line** of known length ("Set scale"). Scale is
  persisted via `map:setGrid` (carries `widthFt`) → `updateMapGrid`, broadcast.
  Distances are computed **client-side** from feet-per-pixel; maps with no width
  set fall back to the legacy feet-per-square model (so old saves are unchanged),
  and a fresh map's width is **derived from its pixel size** (default 5 ft/50 px)
  and prefilled for the DM to adjust. Placed AOEs **keep their footprint** when
  scale changes (stored in px; labels recompute).
- ☑ **Grid square set in FEET [req].** The DM's `ScaleMenu` now takes the **grid
  square size in feet** (e.g. 5) instead of pixels; the pixel cell is **derived**
  from the map scale (`feet × image width ÷ width_ft`) and shown as a read-out, so a
  square always means real feet. Changing the map width re-derives px to preserve the
  chosen feet-per-square. Client-side derivation only — the `map:setGrid` payload is
  unchanged. Legacy maps with no width fall back to the px field.
- ☑ **More visible grid [req].** Grid lines are visible at rest (`#ffffff5c`) and
  **light up** (`#ffffffcc`, thicker) while a token is **dragging** or a **measure**
  tool is active, for easier alignment (`MapStage` `gridHot`, fed by a new
  `onDragActive` signal from `TokenShape`).
- ☑ **Token footprint trail [req].** A move (local drag OR another client's, diffed
  from the snapshot) leaves a lingering trail of **white footprints** (alternating
  left/right ellipses with a **faint dark outline** for contrast) from the old spot
  to the new one, fading **oldest-first** over **~30s** so players remember where a
  token came from. Only the **6 most-recent** trails are kept — a 7th move **fades
  the oldest out** (~2s) instead of popping. Decorative/non-listening; the
  self-contained `FootprintLayer` owns the position-diff + fade tick so the long
  fade never re-renders the rest of the map.
- ☑ **Measuring tools (AOE shapes) [req].** A **"Measure" dropdown** in the map
  toolbar (`MeasureMenu`) for everyone, with a shape per row — **Circle, Cone,
  Line, Square/Cube, Emanation** — each expanding to **Custom / Small / Large**,
  plus a **snap-to-grid** toggle, a **click-to-remove** mode, and Clear mine /
  Clear all. **Standard** (small/large) shapes use classic 5e sizes (Circle r
  15/20, Cone 15/60, Line 30/100 ×5 ft, Square 10/20, Emanation 10/30 ft) with
  feet markers that track the grid; they're placed **click-anchor → rotate →
  click** (Circle/Square commit on one click). **Custom** keeps the drag-between-
  two-points mechanic (custom Line = a thin ruler; standard Line = a 5-ft AOE).
  **Emanation** centres on a token and follows it. Shapes are **shared**
  (server-persisted `measurements` table — `kind` ∈ cone/circle/line/square/
  emanation/ruler, optional `tokenId` — broadcast in the snapshot, coloured per
  drawer) and **persist** until cleared; players remove/clear only their own, the
  DM any. Tokens become non-listening while measuring so clicks never select them.
- ☑ **Roll log in the DM Data view [req].** The `/dm/data` dashboard gains a fixed
  **right column** with the full `DicePanel` (roller + shared log) beside the card
  grid, so rolls are visible on the second screen.

## Combat & startup QOL (req)

- ☑ **Players restricted to their own PC's status.** `condition:set`/`condition:clear`
  are now role-gated in `socketHandlers.ts`: a player may only change conditions on
  the PC they've claimed (`claimedBy === socket.id`); creatures stay DM-controlled,
  and bulk `tokens:setCondition`/`tokens:clearConditions` are DM-only.
- ☑ **Floating-menu attacker defaults to the player's own PC.** `floatingAttacker`
  (`MapStage`) makes the right-click menu attack **as the player's claimed PC** by
  default, unless a **friendly creature is selected** (companion/summon) — then that
  creature attacks. Players may now attack with friendly creatures: the `combat:attack`
  gate allows a non-PC attacker when its disposition is `friendly`. DM behavior
  unchanged (attacks as the selected token).
- ☑ **Floating menu shows who's attacking.** A prominent `.fm-attacker` header
  (“⚔️ Attacking as **X** → Y”) replaces the subtle note, so the attacker is clear
  before a weapon is clicked.
- ☑ **Condition-driven advantage/disadvantage (conservative).** `shared/conditionEffects.ts`
  (pure + tested) maps a conservative subset of 5e conditions to adv/dis on attacks
  (prone target = melee adv / ranged dis; restrained/blinded/paralyzed/stunned/
  unconscious/petrified target = adv; invisible attacker = adv; blinded/poisoned/
  prone/restrained/frightened attacker = dis; invisible target = dis) and saves
  (restrained → DEX-save dis). It folds the manually-requested adv/dis in and applies
  the **5e cancel rule** (any adv + any dis → straight). Wired into `resolveAttack`
  and `resolveSaves`; the reasons are noted in the roll log.
- ☑ **Resistances/vulnerabilities applied to damage.** `damageMultiplier`
  (`shared/combatMath.ts`) halves (resist) / doubles (vulnerable) auto-attack damage by
  the weapon's `damageType` in `resolveAttack`, noting it in the log. (Data already
  existed on creatures/PCs; now it's mechanical.)
- ☑ **DEX modifier added to initiative.** `rollAllInitiative`/`rollMissingInitiative`
  roll `d20 + DEX mod` from the token's creature instead of a flat d20.
- ☑ **Saving-throw proficiencies.** `Character`/`Monster` carry `saveProficiencies`
  (ability codes; idempotent `save_proficiencies` columns). `rollSavingThrow` adds the
  proficiency bonus on a proficient save; edited via a “Save proficiencies” chip row in
  `StatBlock` and shown read-only.
- ☑ **Custom memorable session codes.** The DM may choose a vanity code (e.g. `TAVERN`)
  when creating a session (`createSession(name, code)` + `normalizeSessionCode`,
  `SessionCodeError` → HTTP 409), giving a stable `/join?code=TAVERN` link; random codes
  remain the default. Input + inline error in `DmRoute`.
- ☐ **5e mechanics still NOT automated** (audit, for later): mechanical condition
  effects beyond adv/dis (auto-fail saves while paralyzed/stunned, movement from
  restrained/grappled), **concentration checks**, **death saving throws**, **cover**,
  **exhaustion levels**, **timed/duration effects**, **action economy** (action/bonus/
  reaction tracking), and **spell-slot auto-spend** on cast.

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
  - **Map tool menus in the top bar [req].** The **Measure / Scale / Fog** dropdowns
    now live in the top toolbar (above the map) instead of the in-canvas corner.
    They're **portaled** (`createPortal`) into a `#map-tool-slot` in `TopToolbar`
    but keep all their state/handlers in `MapStage`, so the canvas interactions are
    unchanged — a low-risk relocation. **Fit + zoom %** stay in the canvas corner
    (they're tied to pan/zoom). Measure shows for everyone; Scale/Fog are DM-only.
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

## Polish batch — token sizing, panel UX, spawn/import, rules & data

- ☑ **Token footprint in feet [req].** Tokens carry a real-world `widthFt`
  (default 5ft = Medium), rendered via the map's pixels-per-foot, so a token keeps
  its size when the DM changes only the visual grid cell. New `width_ft` column
  (backfilled `size*5`); resize works in 5ft steps; legacy `size` kept in sync.
- ☑ **Creature search full-width [req].** The DM creature-search box spans the
  panel with HP / Add creature / AI on the row below (`.add-monster` column layout).
- ☑ **Footstep trail rework [req].** Footprints are spaced a constant distance
  apart (≈one per 0.8 cells, count scales with the move), larger and brighter, and
  hold fully opaque before a faster oldest-first fade.
- ☑ **DM removes PCs from the spawn list [req].** DM-gated `character:delete`
  removes a character + its tokens via a 🗑 button, refused while a connected
  player holds the claim (`isConnected`).
- ☑ **Map-import conflict resolution [req].** Same-named characters prompt the DM
  per-conflict — **Reuse** (link), **Overwrite** (replace; never an actively-claimed
  PC), or **New** (duplicate) — via `session:importPreview` + resolutions on
  `session:importMaps`. Monsters still import as fresh instances.
- ☑ **Second Wind 2024 [req].** Fighter Second Wind uses scale 2 / 3 / 4 by level.
- ☑ **AI PC weapons are dice-only [req].** AI character fills produce dice-only
  damage (no baked-in `+mod`/to-hit) so the combat system adds the live ability
  mod + proficiency (`diceOnly`).
- ☑ **Item library seeded [req].** A curated SRD/OGL catalogue (gear, tools, armor,
  weapons, potions, and representative magic items, each with a description) is
  seeded once at boot (`server/src/items/srd.ts`, guarded by an `app_meta` marker).
- ☑ **Attack-from-description discoverability [req].** The prose→attacks action is
  relabelled "Generate attacks from description" and grouped with **+ Attack** in
  the `StatBlock` weapons editor with a fuller tooltip.
- ☑ **Player notes on creatures/NPCs [req].** A shared free-text note per
  monster/NPC the DM and any player can read/edit (visible on every disposition
  tier), via `player_notes` + a player-writable `creature:setNotes`, shown in both
  the player Details panel and the DM token panel.
- ☑ **Open-source license + SRD attribution.** The repo carries a standard **MIT
  `LICENSE`** (code, © 2026 vcons002) and the root `package.json` declares
  `"license": "MIT"`. The README's **License & attribution** section credits the
  bundled D&D content to the **SRD 5.1 / 5.2** under **CC-BY-4.0** with Wizards of
  the Coast's required notice (consistent with the existing SRD-safe data note in
  `server/src/items/srd.ts`); no proprietary PHB/DMG/MM text is included.
- ☑ **User-facing feature guide.** [`FEATURES.md`](FEATURES.md) — a plain-language
  DM + player tour (where each tool lives, how to use it, clicks/keys), kept
  alongside the README (install/run) and this backlog.
- ☑ **Weapon to-hit transparency, tag chips & double-count fix.** (1) The attack
  roll now spells out the to-hit like the damage breakdown —
  `d20[10] +2[DEX] +2[PROF]` (derived) or `+5[hit]` for a fixed bonus
  (`weaponAttackBonusDetail`). **Spell attacks and monster `action` attacks** get
  the same treatment — `d20[10] +3[CHA] +2[PROF]` (casting ability + proficiency,
  by level for PCs / by CR for monsters) via `spellAttackBonusDetail`. (2) Weapon
  **tags** are edited as add/remove
  **chips** (`TagInput`, with common-tag suggestions) on **both** creature and PC
  attacks, instead of a comma string. (3) **No more double-counted ability mod:**
  dice-only weapons (all PC weapons + creature library picks flagged `diceOnly`)
  carry dice only — the engine now ignores any stray baked flat in their damage
  string, the editor labels the damage field "dice only" (don't include the mod),
  and the read view strips it. (4) A creature's **to-hit is shown** and
  auto-derives from ability modifier + proficiency **by CR** (2024 rule: CR 0–4
  +2, 5–8 +3, 9–12 +4…), with an editor blurb; the "hit" field overrides.
- ☑ **Full 2024 SRD spell list + Spellbook + tag search.** Bundled the complete
  **SRD 5.2 spell set** (`spells/spellList.ts`, ~317 spells across all classes;
  merged into `srd.ts`, full list wins, curated class abilities preserved). Each
  spell carries `classes` + `tags` (school, classes, damage type, `cantrip`/
  `concentration`/`ritual`, descriptive flags). The sheet's add-search now matches
  **name OR tag/class/damage type** (find by "fire", "cantrip", "wizard"); maneuvers
  & masteries are likewise findable by their category words. A new **Spellbook**
  modal (`Spellbook.tsx`, `GET /api/spells/all`) browses the whole list with a
  class filter + keyword search, grouped by level, add-to-sheet (marks owned).
- ☑ **Magic Missile / split-damage spells.** Multi-instance damage spells declare
  separate `instances` (Magic Missile: 3 darts of `1d4+1`, +1 per slot above 1st);
  the server rolls each dart into `apply.split`, and the DM assigns **one dart per
  clicked target** (the button counts down "Dart n/N") instead of the full total
  hitting everyone. Resist/vuln still apply per dart.
- ☑ **Drag-reorder DM panel sections.** The DM's left panel (Maps/Spawn/Initiative,
  Dice & Roll Log, Roll20) reorders by dragging each section's handle; order
  persists per browser (`ReorderableSections`, native HTML5 DnD — same pattern as
  the Data view cards). _(Closes the deferred WP7 "drag-reorder toolbar sections".)_
- ☑ **Attack-as-the-acting-creature.** A player attacking with a friendly
  companion/summon (the floating menu's "Attacking as …") is now attributed in the
  roll log to **that creature**, not the player's own PC (server derives the roller
  from the attacking token; a player's own token is unchanged; DM stays "DM").
- ☑ **Weapon damage types as a set list + secondary damage.** Damage type is picked
  from the canonical 5e list (`shared/damage.ts`, incl. the magical types) via a
  select in the weapon editor for **both** creatures and PCs (legacy values
  preserved). Weapons gained a **secondary typed rider** (`extraDamage` +
  `extraDamageType`, e.g. a flaming sword's 1d8 slashing + 1d6 fire) — rolled on a
  hit, doubled on a crit, resisted on its **own** type independently of the main
  damage. The magic-bonus field is **restored on creature attacks** (was PC-only).
- ☑ **Class-feature stances + feature library.** A new `stance` ability type
  (toggle that stays on) plus a curated feature library (`features/srd.ts`: Rage,
  Reckless Attack, Hunter's Mark, Action Surge, Channel Divinity, Wild Shape,
  Bardic Inspiration, Ki, Lay on Hands, Indomitable), surfaced in the "+ Add"
  search. Stances modify the character's qualifying weapon attacks server-side —
  flat/dice **bonus damage** (Rage +2 melee, Hunter's Mark +1d6) folded into the
  hit, and **advantage** (Reckless Attack); each is gated by weapon kind. Features
  with a linked **`useCounter`** auto-create a tracked resource on add, and
  toggling a stance ON spends one use.
- ☑ **Player sheet layout pass.** HP +/- buttons are small and inline beside the
  HP line; **Skills** is collapsible; the **Conditions** editor is **collapsed by
  default for players** while the list of **active conditions stays visible** below
  it; **Add resource** is a button beside the Resources header that reveals the
  field on click; **Items** is relabelled **Inventory** and moved below Skills.
- ☑ **Searchable inventory + item descriptions.** The item-library picker has a
  search box (server matches name OR description), and every inventory/library item
  has an ℹ️ button opening a description window (library items ship with SRD
  descriptions that ride onto the item when added).
- ☑ **PC weapon lines show dice only.** A character's weapon line reads just the
  dice (e.g. "Greatsword 1d12 slashing") instead of re-deriving "+5 to hit. 1d12+3"
  from live stats — the modifier/to-hit are still applied at roll time. **Dice-only
  creature attacks now read the same way** (no re-derived to-hit/mod), since they're
  computed from stats + proficiency at roll time; truly pre-baked monster attacks
  still show their baked to-hit + damage.
- ☑ **Hunter's Mark marks a chosen target.** A `stance` can be `targeted`: its
  bonus (e.g. +1d6) applies **only to attacks against the marked token**. The combat
  console shows a target picker beside the toggle; switching the stance on defaults
  to the current target, and re-selecting moves the mark. Hunter's Mark is a
  **spell-backed stance** (`level: 1`, labelled as a spell): toggling it on **spends
  a 1st-level spell slot and starts concentration**, and toggling it off ends that
  concentration. (Rage/Reckless Attack are class-feature stances — no slot.)
- ☑ **Concentration: auto-set + prompt on damage.** Casting a concentration spell
  (detected by tag/meta) now **starts concentration** on the caster automatically —
  a blue `Concentration: <spell>` condition that **replaces any prior one** (5e's
  one-at-a-time rule); buff spells with no damage roll get a **🔮 Cast** button to
  trigger it. If another concentration is already running, casting a new one first
  **warns the player** ("already concentrating on X — casting Y will end it") and
  lets them confirm or cancel. When a concentrating creature then takes damage, the roll log posts
  the **DC = max(10, ⌊damage/2⌋)** CON save needed to maintain it (fired from every
  damage path: weapon hits, spell saves/auto-hit, Magic Missile darts, manual HP).
- ☑ **Upcasting for all leveled spells.** Any leveled spell can be cast with a
  higher slot via the level selector (not only dice-scaling ones) — including
  no-roll concentration buffs like Bless — spending the chosen slot; an "At higher
  levels" note (added to ~80 spells) describes the non-damage upcast effect.
- ☑ **Death saves.** A downed PC (0 HP) shows a Death Saves tracker (3✓/3✗ pips +
  Roll) — server-resolved (10+ success, nat 20 → 1 HP, nat 1 = two failures, 3✓
  stable, 3✗ dead); healing above 0 resets, damage while down adds a failure.
- ☑ **On-hit / on-fail status effects + target status tags.** Stances gain an
  on-hit save rider (Ensnaring Strike: hit → STR save or Restrained, via the
  click-to-target `apply.onFail` flow) and a `marksTargetWith` tag that puts a
  status (e.g. "Marked" for Hunter's Mark) on the marked creature, following the
  mark and clearing when the stance ends.
- ☑ **In-app chat.** Shared, persistent per-session chat (`chat_messages` →
  snapshot, `chat:send`) with a `ChatPanel` in the DM left panel and player view.
- ☑ **Map annotation layer.** Freehand pen + text labels drawn on the active map
  (`annotations` table → snapshot, `annotation:add/remove/clear`), shared and
  persistent, with colour swatches and Clear mine/all (players clear only theirs).
- ☑ **AI lookup retry.** `callGemini` now retries transient HTTP errors (429/5xx,
  e.g. model-overloaded) with backoff, not just network throws.
- ☑ **Import maps from a session list.** The "import maps from another session"
  dialog lists all saved sessions to pick from (name · code · map count) instead of
  requiring a typed code (manual entry kept as a fallback).
- ☑ **Mobile / touch responsive mode.** On narrow screens the side panels become
  overlay drawers (collapsed to an edge tab by default) so the map is full-width;
  larger tap targets, wrapping top bar, and `touch-action: none` on the stage.
- ☑ **Connection resilience.** Resilient Socket.IO reconnection with the last
  snapshot kept on screen and outgoing actions buffered/flushed on reconnect; a
  "Reconnecting…" banner (new `reconnecting` status) signals the offline state.
- ☑ **Player landing saved-session list.** The player join screen lists saved
  games from the public `/api/sessions` directory to click into (mirroring the DM
  landing), with the manual code box as fallback.
- ☑ **Class-ability variants in search.** ~57 curated subclass/variant features
  across all classes (rages, Metamagic, Channel Divinity, Invocations, …), tagged
  by class + family keyword + `variant`, so a search like "rage" surfaces every
  rage variant (feature-search limit raised so families aren't truncated).
- ☑ **Non-combat objects (MVP).** Traps, doors, chests, and hidden items as map
  objects (a Monster flagged `objectKind`), reusing placement/templates/hiding/
  conditions/visibility. `ObjectControls` toggles state (Locked/Open/Disarmed/
  Looted/…) as conditions + reveal/hide, in the floating menu and token panel;
  players see state read-only; objects get no combat-role badge. Remote DM
  session/map loading verified already working (no change).
- ☑ **Loot & gold.** Containers (chest/item/other objects) hold a `loot` payload
  (`{ gold, items }`) the DM stocks via `LootControls` (free-add or item-library
  picker). Loot is hidden from players until the object is **opened/unlocked**
  (gated in `visibility.ts`); then a player can **Take** items + gold into their
  claimed character — items merge into the inventory, gold into a per-character
  `gold` purse — or the DM hands loot to any PC. A drained container auto-flags
  itself Looted/Taken. `loot:take`/`object:setLoot` are role-gated; instances
  inherit a template's loot. (Shops/currency-denominations still deferred.)
- ☑ **Trap mechanics.** A trap carries an authored stat-block action (save/attack
  with a structured roll); `TrapControls` gives the DM a **⚡ Trigger** button per
  action (fired via the existing `monster:action` → roll-log → click-to-apply
  flow, and flips the trap to Triggered) plus a **disarm DC** field (`objectDc`).
  A player holding a character gets a **🔧 Disarm** button → `trap:disarm` rolls a
  server-authoritative DEX (Sleight of Hand) check vs the DC and, on success,
  flips the trap to Disarmed. (No auto-trigger-on-entry / passive-Perception
  detection — deferred.)
- ☑ **AI actions carry structured rolls.** Gemini creature/character generation
  now attaches a structured `roll` to each `action` (explicit from the model, else
  scraped from a "DC <n> <ability> saving throw, <dice> <type> damage" description),
  and `createMonsterTemplate` scrapes the same from free-text/SRD/pasted actions.
  So AI-built traps and breath weapons are immediately rollable and offer the
  **Apply damage** save flow, instead of becoming plain weapon attacks.
- ☑ **iPad / touch polish.** Two-finger **pinch-to-zoom** on the map plus on-screen
  **−/+ zoom buttons** beside Fit (a shared `zoomAtPoint` helper backs wheel,
  buttons and pinch; panning pauses mid-pinch); a wider, `touch-action:none`
  **sidebar resize handle** that also works on mobile drawers; long-press callout
  suppression over the canvas; and a friendly **HEIC/HEIF upload guard** (most
  browsers can't render those photos).
- ☑ **DM Data view upgrades.** A header **map switcher** to view ANY map
  (non-active are preview-only) with a **Make active** button; it auto-follows the
  live map only when it *changes* (set here or from the main DM UI). A stale
  active-turn pointer no longer **blanks** the view (guarded lookup), and a routes
  **`ErrorBoundary`** turns any future render error into a readable message + Reload
  instead of a white screen. AI fills here now show the **banner + toast** (the
  view renders `AiStatus`/`Toast`/`ConnectionStatus`). The roll log is a
  **collapsible/resizable `SidePanel`**, and the card grid sits in a
  definite-height scroll box so cards flow + scroll (never overlap) — reliable on
  iOS Safari, where the nested-flex height chain was collapsing them.
- ☑ **Review quick-wins batch (hardening + perf + UI polish).** Server: session
  guards on `monster:update`/`monster:delete`/`ai:fillCreature`/`monster:action`
  (`monsterInSession`), players can't move **hidden** tokens (`token:move` guard),
  `takeLoot` runs in a transaction, `applyDamage` clamps to ±10 000 (truncated),
  dice expressions cap terms/total dice (100/1000), idempotent **indexes** on the
  hot per-session/per-map columns, and the roll log **prunes to the newest 500**
  per session. Client: a manual **"Dead" condition** shows the 💀 even on enemies
  (players already auto-skull friendlies at 0 HP), `TokenShape` + Data-view cards
  are **memoized** (content comparators + identity-stable handlers — dragging one
  token no longer redraws them all), global **`:focus-visible`** ring, bigger
  touch targets (26px `.qbtn`, ≥32px on coarse pointers), section labels are real
  `h4`s, brighter `--muted`, the **player console + player left panel** use the
  same reorderable/collapsible sections as the DM, and all layout prefs
  (panels/sections/Roll20 URL) are **namespaced per session code**. Tests:
  `quickwins.test.ts` + dice-cap cases. Deferred to dedicated PRs: snapshot-perf
  rework; actions/sheetAbilities merge (must keep AI action flavor).
- ☑ **Ability-system merge (ONE rollable system).** Legacy free-text monster
  `actions` are now only a *transport* shape (SRD/AI/paste): at creature insert —
  and via an idempotent startup **migration** of old saves — weapon-like entries
  ("+4 to hit, 1d6+2 slashing") become rollable `weapons` and the rest become
  rich `sheetAbilities` (structured rolls kept, or scraped with
  `parseActionRoll`); stored monsters keep `actions` empty. The DM-only
  `monster:action` event and `resolveMonsterAction` are gone — everything rolls
  through `ability:roll`, and `resolveAbilityRoll` (PC) /
  `resolveMonsterSheetAbility` (creature) are thin wrappers over ONE shared
  `resolveSheetAbilityFor` core (PC: sheet-derived DC/to-hit + slot spend;
  monster: CR-based prof + best INT/WIS/CHA, explicit stat-block DC wins).
  Floating menu, trap **⚡ Trigger**, and the token panel all roll creature
  abilities via the one path; `updateMonster`/AI-fill convert incoming `actions`
  patches the same way (deduped by name); the **creature library** round-trips
  `sheetAbilities` (new idempotent column). AI generation keeps its action
  flavor — the prompt now explicitly arms humanoids (bandits, soldiers, guards)
  with named MANUFACTURED weapons and beasts with natural attacks. The
  natural-attacks library (`/api/attacks`) grew 16 → ~36 entries (large/huge
  variants, Stomp/Trample/Wing/Tusk…, typed touch/drain attacks, ranged
  Spit/Quill/Rock/Web). Tests: conversion at create, raw-row migration
  idempotence, ported action-roll suites (205 passing).
- ☑ **Chat dice + working heals.** Typing **`/roll 2d6+3`** (or `/r`, optional
  `adv`/`dis`) into chat rolls server-side into the shared roll log (invalid
  dice → notice; parser `parseRollCommand` in `shared/dice.ts`). **Heal
  abilities now actually heal**: a targeted heal applies the HP on cast (heal
  SPELLS add the caster's spellcasting mod; plain abilities use their dice as
  written) — the combat console gets a **Heal target** dropdown (self default +
  allies via `healTargets`), and the floating menu applies heals to the
  right-clicked token, including your own (right-click yourself → "Casting as …
  → self" lists your heals). Untargeted heals still just log.
- ☑ **Roll-log HP accounting.** Every roll that changes HP (weapon hits,
  targeted spell attacks, Apply-damage saves + darts, heals) records a DM-only
  `hpNote` on its `RollEntry` — "Druk HP 42→38" (temp HP shows as "42+5") —
  shown as a cyan line in the full log and the map overlay, so mistakes are
  easy to spot and hand-correct. Persisted (`roll_log.hp_note`, idempotent
  column) as `{kind, refId, text}` so `visibility.ts` shapes it per viewer:
  players see HP changes for **PCs and friendly/neutral creatures**; only
  ENEMY creature changes are stripped (their HP stays hidden, matching the
  disposition tiers).
- ☑ **Floating damage/heal numbers.** Every HP change pops a bold **red −X /
  green +X** above the creature's token that drifts up and fades (~0.9 s
  `Konva.Tween`, click-through, x-jitter so rapid hits stack readably). Server-
  pushed: `applyDamage` queues `{kind, refId, delta}` (temp-HP absorption reads
  as the full hit) and `broadcastSnapshots` drains it into a per-viewer
  **`fx:hp`** event filtered against each client's own snapshot tokens — so
  hidden/fog-covered/off-map creatures never pop a number for players, and only
  the delta (already log-visible) is revealed, never totals. Covers weapon
  hits, spells, heals, manual ±HP buttons and bulk AOE.
- ☑ **Mobile/touch fixes + reliable updates.** (1) The SPA shell (`index.html`)
  is served **`no-cache`** while hashed `/assets` stay immutable, so a phone
  always picks up the latest bundle after the host rebuilds (a stale cached
  `index.html` was why new features — floating numbers, HP notes — silently
  never appeared on mobile). (2) `ReorderableSections` gains tap **▲/▼** reorder
  buttons — HTML5 drag-and-drop never fires on touch, so the grip alone left
  mobile unable to reorder; the buttons work everywhere (de-emphasised on
  hover pointers, enlarged on coarse pointers). (3) A **"Placing <unit> — ✕
  Done"** banner shows over the map whenever a spawn is armed (`PlacementBanner`),
  giving a touch-reachable cancel since Esc/​re-tapping the side drawer isn't
  practical mid-place on a phone. (4) `install.bat`/`install.sh` now **force-sync
  to the remote tip** (`reset --hard origin/<branch>`) and **fail loudly** if the
  working tree can't be updated, instead of a silent `git pull` leaving stale
  code — gitignored `server/data`/`.env` are never touched.
- ☑ **UI polish round (mobile + consistency).** (1) Roll-log entries compact on
  phones (smaller total/meta/notes in the ≤820px drawer). (2) **DM right panel
  for PCs mirrors the creature layout**: Spells & Abilities (+ free-text
  actions) is its own reorderable section above Sheet info, and `CharacterSheet`
  gains `abilitiesElsewhere` so the sheet omits them there. (3) Ability rolls
  log **individual die faces** (e.g. Acid Splash "7 acid damage [2d6[3,4]]");
  crit doubles show both rolls, Magic Missile lists each dart, heals show the
  dice + mod breakdown (`rollFaces` helper). (4) Player view **re-claims the
  character after a reload** (persisted per session code; only when the claim is
  free) so the combat console doesn't fall back to the generic panel. (5)
  **Traits & Feats moved up** to sit with the character info box (stats +
  weapons), above Resources/Skills/Inventory.
- ☑ **Snapshot-performance rework** (review #7). `visibility.ts` now exposes
  `createSnapshotBuilder(sessionId)`: all session-wide queries (creatures, roll
  log, chat, maps) run ONCE per change-cycle, creature lookups go through
  in-memory id maps (kills the per-token `getMonster`/`getCharacter` N+1 in
  combat-role/fog/hpNote shaping), per-map token/measurement/annotation loads
  are cached across viewers, and player-shaped monsters/roll log are computed
  once and shared by every player connection. `broadcastSnapshots` builds one
  builder per cycle; `buildSnapshot` keeps its signature (join + tests
  unchanged). Bench (35 tokens, 6 clients): ~8.2 ms → ~1.5 ms per change-cycle
  (≈5.6×), on top of the already-removed N+1. Parity + reuse covered by new
  `createSnapshotBuilder` tests.
- ☑ **Combat round counter + objects sit out of initiative.** Sessions carry a
  `combat_round` counter (idempotent column, 0 = no combat): **Roll all** starts
  round 1, **Next** increments it when the turn order wraps past the LAST
  combatant (latecomers added via **Add rolls** mid-round slot in without
  resetting or double-counting; a vanished current token restarts the same
  round), **Clear** zeroes it, and a **↺ reset** button (`initiative:resetRound`,
  DM-only) sets it back to 1 without touching anyone's rolls. Shown as a
  **Round N chip** in the top toolbar (everyone), the Initiative header, and
  the Data-view turn line. **Objects (chests/doors/traps/items) never roll
  initiative**: Roll all/Add rolls skip them (Roll all also clears a stray roll
  an object had in an old save), the turn order excludes them defensively, and
  the Initiative panel doesn't list them.
- ☑ **Initiative robustness.** The round counter is a **DM-editable field** in
  the Initiative header (`initiative:setRound`, clamped 0–999) instead of just
  reset-to-1. **Dead combatants keep their slot** in the order (dimmed 💀 row)
  but `advanceTurn` walks past them — wraps crossed while skipping still count
  the round, and PCs at 0 HP **keep their turn** for death saves (skipped only
  at 3 failures or the Dead mark). **Deleting the current-turn token** ticks
  the marker to the next living combatant first (wrapping counts the round, as
  it would have anyway); `deleteMonster`/`deleteCharacter` route their token
  cleanup through the same guard, and deleting the only living combatant
  clears the marker.

## Feature batch — combat gates, loot, shapes, spells, grid, decals & ownership

- ☑ **Player move gate [req].** `token:move` lets players move only **PCs and
  FRIENDLY creatures** — enemy/neutral creatures and **objects**
  (chests/doors/traps) are blocked server-side, and the client no longer marks
  unmovable tokens draggable (the drag used to ghost locally before the server
  rejected it). Hidden-token block unchanged.
- ☑ **Token size typed entry [req].** Manual half-foot entry + −/+ 2.5 ft
  buttons; `resizeToken` snaps to 0.5 and clamps [0.5, 120] (min lowered from
  2.5 for small objects).
- ☑ **Neutral reveals nothing more than enemy [req].** Players see name +
  conditions only for BOTH; the amber dot is the only difference. Removed the
  `MonsterNeutral` type + client guards; `hpNote` visibility tightened to
  **friendly/PC-only**.
- ☑ **"Clear" initiative → "End combat" [req].** Renamed in the Initiative panel
  and the Data view (it already cleared rolls, the turn marker, and the round).
- ☑ **Hide DM rolls [req].** A DM toggle in the dice panel; while on, DM-rolled
  log entries are flagged `dm_only` and filtered from player snapshots (damage
  still applies, floating ±X still pop). `sessions.hide_dm_rolls` +
  `roll_log.dm_only` (idempotent), `session:setHideDmRolls`,
  `snapshot.hideDmRolls`.
- ☑ **Player unlock/open objects [req].** Players (and DM) get **Pick lock /
  Open / Close** on doors & chests: `object:interact` + `resolveObjectCheck`
  (generalized from `resolveTrapDisarm`) rolls DEX (Sleight of Hand) vs the
  object's DC and clears Locked on success; open/close is blocked while locked;
  DM can force-unlock.
- ☑ **Creature loot [req].** The DM stocks + reveals loot on ANY creature via a
  Loot section in the token panel; `lootVisibleToPlayers` extends to creatures —
  takeable only once **dead** *and* "Loot revealed" is toggled (enables a
  perception-roll gate). `object:setLoot`/`loot:take` drop the objectKind
  requirement (session-scoped). Loot rows gain an **ⓘ** description toggle.
- ☑ **Token shapes [req].** `tokens.shape` (circle/square/diamond/triangle/
  image; objects default by kind — chests/doors square, traps triangular);
  `TokenShape` renders each silhouette with matching image clip (`image` draws
  pasted art unclipped, selection-only outline); Shape picker in DM tools;
  `token:setShape` (DM-only).
- ☑ **Custom item descriptions + AI-generated items [req].** The loot editor's
  manual "+ Add" gains a Description field, plus an "AI generate" row —
  `POST /api/items/generate {prompt}` reuses `callGemini`, saves to the item
  library, and drops the item straight into the container (key-gated +
  fail-safe).
- ☑ **Prepared/cantrip soft counters + action economy.** `shared/spellPrep.ts`
  (`cantripsKnown` + `spellCapacity`: prepared casters = mod+level/half, known
  casters = per-class table, null for martials; `parseActionType`).
  `CharacterSpells` header shows "Cantrips x/y · Prepared|Known a/b" (red over
  the cap, never blocks); ✓ Prep toggle per leveled spell
  (`SheetAbility.prepared`); `SheetAbility.actionType` auto-derived from meta,
  editable, shown as ●/⚡/↩ icons.
- ☑ **Grid hide, offset, lock & match-to-map-grid [req].** Maps gain
  `grid_offset_x/y`, `grid_locked`, `grid_hidden` (idempotent columns;
  `map:setGrid` carries them, offsets normalize into one cell). Scale menu adds
  **Hide grid** and **Match map grid (drag a square)** — the drag sets cell size
  (longer side) + grid origin offset and locks the grid; locked disables the
  grid-square input (Unlock control) while feet/width inputs still work (scale
  is width-ft based, so distance changes never resize the cell). Grid render
  honors the offset and skips when hidden.
- ☑ **Paste images as object tokens or scenery decals [req].** DM presses Ctrl+V
  → upload (reuses `/api/icons`) → dialog offers **Object** (`object:paste`
  creates a non-combat 'other' object + an `image`-shaped token) or **Scenery
  decal** (annotations gain an `image` kind drawn UNDER the tokens, clamped to
  ~6 squares). Paste dialog supports drag-select **✂ Crop**, **🪄 Cut
  background** (corner flood-fill to transparency, checkerboard preview), and
  **↺ Undo edits** (`lib/imageEdit.ts`). Pasting an `<img>` copied from a web
  page / Google Slides works even when the clipboard only carries a URL —
  `POST /api/icons/from-url` fetches it server-side (http(s) only, image/* only,
  25 MB cap, browser-like UA for googleusercontent), with specific error
  reasons surfaced in the toast. Never hijacks a paste aimed at a text field.
- ☑ **Decal manipulation + lock [req].** Decals are DM-draggable
  (`annotation:move`) with an aspect-locked **corner resize** handle (constant
  screen size at any zoom; `annotation:resize`, clamped 8–20000 px), a **🔒
  Decals** toggle making them click-through/undraggable (DM-local, persisted
  per session; the eraser still removes locked decals), and **Clear decals**
  (`annotation:clear` by kind — strokes/text stay). Fixed DM "Clear mine"
  (role was hardcoded to player).
- ☑ **Mobile hold-to-open menu + ❔ Guide.** Long-press (~0.5 s) opens the
  floating menu and **releasing keeps it open** (close events swallowed 450 ms
  after opening; the touch is marked consumed so touchend doesn't re-select).
  A **❔ Guide** button in the top toolbar for BOTH roles opens `GuideModal`
  with Desktop/Mobile control tabs (auto-selected by pointer type), pointing at
  FEATURES.md for the full tour.
- ☑ **Durable per-player character ownership [req].** Each browser keeps a
  persistent random `playerId` (localStorage) sent in the join handshake;
  `characters.owner_player_id` is set on first claim / creation / claimed
  library load and never overwritten. `character:claim` rejects characters held
  by another live socket OR owned by a different player; reconnects by the
  owner keep working. DM-only `character:unlock` (🔓 in the spawn list) clears
  owner + claim for device switches; the player picker shows a 🔒 locked badge;
  auto-reclaim honors ownership; `updateCharacter`'s allow-list already
  excludes `ownerId`/`claimedBy` so patches can't forge it.
- ☑ **Stability fixes.** Data-view expand overlay uses a CSS **grid** of
  sections (multi-columns rebalanced on resize and overlapped in Chrome);
  damage at 0 HP still floats the attempted −X (death-save failures read on the
  map); weapon `extraDamage` riders roll ONCE on a hit and are **no longer
  doubled on a crit** (amends the earlier rider entry); window-snap glitches
  fixed (`.center`/`.stage-wrap` clip overflow, ResizeObserver updates coalesced
  per animation frame, a `devicePixelRatio` watcher remounts the Stage when
  monitor scaling changes).
- ☑ **Cloud deployment kit (`deploy/`).** Host the app 24/7 on a free GCP
  e2-micro VM with one permanent HTTPS link instead of the per-restart
  quick-tunnel URL: `deploy/README.md` (beginner click-by-click walkthrough —
  GCP VM + static IP → free DuckDNS hostname → `deploy/setup.sh` one-shot
  provisioner (swapfile, Node 20, build, systemd `dndapp.service`) → Caddy
  auto-HTTPS), all purely additive — no app-code or run-script changes; the
  local PC + quick-tunnel workflow is untouched (`PUBLIC_URL` set + blank
  `CF_TUNNEL_NAME` skips cloudflared).
- ☑ **Color-coded Data-view cards [req].** `/dm/data` cards tint by type —
  PC cyan, friendly green, neutral amber, enemy red, object gray (faint
  background + 3px left border, the token dot colors) — via a
  disposition/objectKind class on `DataCard`; the turn (gold border) and
  multi-select (outline) markers render on top.
- ☑ **Mobile double-tap fix [req].** Double-tapping a token now works on touch:
  `TokenShape` detects two quick nearby touches itself (Konva's synthesized
  `dbltap` was unreliable next to the long-press handlers; a drag clears the
  pending tap, a `lastActivate` guard de-dupes if both fire) — AND the result
  is visible on phones: `handleTokenActivate` bumps a store `rightPanelNudge`
  that pops the right `SidePanel` drawer open (`openSignal` prop; panels start
  collapsed under 820px).
- ☑ **Unified "Combat" right-panel section (both roles) [req].** ONE rolling
  surface at the top of the token panel: a **Target** dropdown
  (`validTargets`; players exclude friendlies, default = the clicked token)
  plus buttons for every rollable action of the selected attacker — weapons
  (off-hand/2H toggles, `combat:attack`) and rollable abilities via a new
  shared `AbilityButtons` (attack → vs AC, save/damage → the target rolls and
  takes it now, heals → own ally select with self default; inline upcast level
  select; concentration confirm), also reused by the floating menu so the two
  can't drift. The old separate Attacks section (`AttackControls`) is removed —
  moved, not duplicated — and the Spells & Abilities section keeps
  add/edit/✓ Prep/stances with its roll buttons hidden
  (`CharacterSpells rollsElsewhere`); the player's left-panel sheet still casts
  untargeted as before. `ReorderableSections` now slots never-seen section ids
  at their fallback index (not appended), so 'combat' lands on TOP for users
  with a saved order.
- ☑ **Combat section round 2: right-click targeting, toggles & resources [req].**
  (1) **Right-clicking a token fills the Combat section's Target dropdown**
  (store `combatTarget` {id, nonce}; set in `handleTokenMenu`, consumed only on
  change so a stale value never overrides the clicked-token default) — the same
  aim as the floating menu, so closing the menu leaves the panel armed at that
  target. (2) **Damage-altering toggles moved into the Combat section**:
  `AbilityToggles` chips (effect masteries On/Off, maneuvers Armed, stances
  On/Off with the targeted-mark select following the current target), backed by
  ONE shared `useAbilityToggles` hook also used by `CharacterSpells`' inline
  buttons (left-panel sheet keeps them; right-panel lists hide them via
  `rollsElsewhere`). (3) The player console's **Spells & Abilities is now a
  read-only reference list** (collapsible rows → description/meta) — add/edit/
  prep stays on the left-panel sheet. (4) **Resources ride in the Combat
  section** (`CharacterResources compact`: spendable spell-slot/counter pips,
  add/remove hidden) while the full tracker stays on the character sheet.
  Concentration-confirm extracted to `lib/spellcasting.confirmConcentration`
  (one implementation for casts, quick-casts, and stance activation). (5) The
  Combat section **always shows** for a creature/PC (not just when it has
  attacks) so toggles/resources always have a home — `CombatSection` renders a
  "No attacks or rollable abilities." note where the buttons would be.
- ☑ **Claim-based character ownership (reconnect-friendly) [req].** Replaced the
  "owned even while offline" lock with a live-claim model: a PC is unclaimable by
  others only while `claimedBy` is a connected socket OR one inside a short
  **disconnect grace window** (`CLAIM_GRACE_MS`, `pendingReleases` map +
  `isClaimProtected`/`claimHolderPlayerId` in `socketHandlers.ts`) — a blip no
  longer de-selects a character, and after the window it frees for anyone.
  `owner_player_id` is repurposed to the **last holder** (updated on every
  identified claim, one per player via `clearOwnershipElsewhere`) used purely for
  **reconnect priority**: `join` calls `reclaimForPlayer` to cancel the pending
  release and hand the player back the character they last held if still free.
  Explicit "Change" clears that record so it won't snap back; DM 🔓-unlock stays
  as a stuck-claim fallback. Picker drops the offline 🔒-locked state (taken =
  actively held). Tests updated for last-holder semantics + `clearOwnershipElsewhere`.
- ☑ **Visual polish pass (clarity + consistency) + grid-square drag.** Purely
  cosmetic except one grid tweak. CSS (`styles.css`): consolidated drifting colors
  into tokens (`--gold`, `--cyan-bright`, `--ok`, `--bad`, `--chat-dm/player`) so
  active-turn gold / PC cyan read consistently; form controls gained hover
  feedback and selects now match inputs; the floating menu caps height + scrolls
  (long weapon/ability lists) with a flex title (no name/HP collision); section
  `h4`s read as headers (not muted), temp-HP shows as a pill and a 0-HP line goes
  red (`zero-hp`), dead initiative rows are dimmed+italic but legible, roll-log
  rows got breathing room. **Grid:** "Match map grid" now drags a **box with a
  live square preview** (corner-to-corner over one printed square) instead of an
  ambiguous line — `MapStage` renders a `Rect` and commits a square-derived
  size/offset; the 📏 set-scale tool keeps its line.
- ☑ **Subclass + spell-list allowances + feats [req].** `Character.subclass`
  (column + sheet identity field, shown in the subtitle, saved to the library /
  JSON export, scraped from pasted sheets, AI-filled): `deriveClassResources`
  now derives **third-caster slots** (Eldritch Knight / Arcane Trickster) and
  **Battle Master Superiority Dice** (4/5/6), and re-derives on subclass change;
  `spellPrep` honors EK/AT cantrips (2@3, 3@10) + a known-spells table. New
  `shared/spellLists.ts` computes the **allowed spell lists** from class +
  subclass + feat names (Magic Initiate per-class, Artificer Initiate,
  Fey/Shadow Touched — matched in Traits & Feats AND sheet abilities), shown as
  a "Lists:" breakdown under the spell counters, whose caps now include feat
  bonuses. The features search gained a curated **feat list** (Magic Initiate ×3,
  Fey/Shadow Touched, Lucky, Tough, Alert).
- ☑ **Sheet math depth: stat modifiers, magic items, feat cap, spell-header clarity [req].**
  A unified modifier model (`shared/modifiers.ts`): `SheetModifier` (target =
  ability/save/skill/attack/AC/initiative) on `Character.modifiers` (ASI/Resilient/
  racial) and on `InventoryItem.modifiers` gated by an `equipped` toggle. Effective
  score = base `stats` + ability modifiers; flat save/skill/attack/AC bonuses layer
  on at roll time. The server folds them in at ONE chokepoint — the `Combatant`
  adapter in `combat.ts` swaps in `effectiveStats`/`effectiveAc` (fixing attack/save
  mods, defender AC, spell DC/attack, concentration, DEX initiative) — plus flat
  extras in the save/skill/attack resolvers; monsters (no modifiers) are unchanged.
  **Stat-math hover:** each ability cell shows the effective score with a `title`
  breakdown ("20 = 18 base + 2 Belt…") and a • dot when modified. **Magic items:**
  per-item effects editor + equipped/attuned toggle (`ModifierEditor`, reused for
  character ASIs). **Feat cap:** `shared/feats.ts` `featSlots` (ASI 4/8/12/16/19 +
  Fighter 6/14 + Rogue 10) with a HARD block on adding feats/ASIs past it, shown as
  "Feats & ASIs x/y" in a new Modifiers & Feats section. **Spell header:** per-list
  budget split ("Cantrips 5/6 = 4 Wizard + 2 Druid") with feat/expansion credits
  (`spellBudgetBreakdown`). Persisted via `ensureColumn` (characters +
  library_characters) and the items JSON; round-trips through library + JSON sheet
  I/O. +21 tests (modifiers/feats/breakdown).
