# Changelog

All notable changes to the DnD VTT, newest first. Dates are when the work
landed on `claude/Dev`. See [`ROADMAP.md`](ROADMAP.md) for the feature ledger and
[`CLAUDE.md`](CLAUDE.md) for architecture.

## 2026-06-21 — ComfyUI: top-down framing for generated battle maps

### Added / Changed
- Generated **maps** are now wrapped in **top-down battle-map framing** server-side
  (base models aren't trained on VTT maps, so a bare prompt rendered a scene). The
  DM's description goes into an overhead-view frame plus a negative that rejects
  characters, perspective, and region/city/world maps — only the **map** kind is
  framed (token/decal art is unchanged).
- The framing is **editable** in Settings → *Battle-map prompt style*: a `{prompt}`
  placeholder marks where the description lands (blank = built-in default), and it's
  where you'd add a battle-map **LoRA** trigger word (e.g. Mapcraft) for far better
  results. The map-panel prompt now asks for the scene, not "top-down battle map".
- **First-class battle-map LoRA** — Settings → *Battle-map LoRA* picks an installed
  LoRA (dropdown from ComfyUI) that's **auto-spliced into the workflow for map
  generation only** — no JSON editing. It inserts a `LoraLoaderModelOnly` after the
  model loader and rewires the sampler through it, and **fails gracefully**: a LoRA
  that isn't installed (or a workflow with no clear model node) just generates
  without it. The filename auto-matcher covers LoRA nodes too.
- **Automatic LoRA trigger word** — an optional trigger field paired with the map
  LoRA; set it once and it's prepended to every map prompt, so you never retype it.
  (Many LoRAs need no trigger — leave it blank.)

## 2026-06-21 — ComfyUI: tolerate model filename mismatches

### Fixed
- ComfyUI rejected a generation when a workflow's loader filename didn't exactly
  match an installed file (e.g. a preset saying `flux-2-klein-4b.safetensors` on a
  `flux-2-klein-4b-fp8.safetensors` install → *"Value not in list"*), and the app
  only showed a generic "is ComfyUI running?" message.
  - The server now **auto-matches loader filenames** (`UNETLoader`/`CLIPLoader`/
    `VAELoader`/checkpoint) against ComfyUI's actually-installed files before
    submitting — a safe near-match only (an added `-fp8` suffix / shared stem),
    **never** a loose guess that would mis-pair a model with the wrong text encoder.
  - When a model genuinely isn't installed, the DM now sees a **precise error**
    ("ComfyUI has no unet_name 'X'. Installed: …") and ComfyUI's own workflow
    rejection reason, instead of a generic failure.
  - Flux.2 Klein presets updated to the canonical fp8 filenames.

## 2026-06-19 — AI DC suggestions + local ComfyUI image generation

### Added
- **AI help setting DCs** — built into the existing `/ask` rules assistant (no new
  command): ask "what DC for climbing the wet wall?" and it returns a concrete DC +
  the fitting ability/skill + a one-line why, using the standard 5e difficulty
  scale. (The assistant previously refused to "invent DCs"; that's now a sanctioned
  adjudication task.)
- **Local ComfyUI image generation** for **token art, decals, and battle maps**.
  Point Settings → *Image generation (ComfyUI)* at a running local ComfyUI; a 🎨
  button then appears on the token/decal art tools (`IconTools`) and the map panel.
  Type a prompt → the server runs a standard txt2img graph on your ComfyUI
  (`POST /api/comfy/generate`), saves the result, and drops it straight in as the
  icon / map. Configurable URL + checkpoint (auto-picks the first installed if
  blank); fail-safe — the controls stay hidden unless ComfyUI is reachable.
  - **Scenery decals** get a 🎨 *Generate* button on the map annotation toolbar —
    the result drops into the existing paste dialog, so you place it as a decal or
    object with the usual crop / background-cut tools.
  - **Custom workflow support** (Settings → *Advanced: custom workflow*): the
    built-in graph only runs SD1.5/SDXL checkpoints. To use **Flux, SD3, or any
    T5/Mistral "text-diffusion" model**, export your working graph from ComfyUI
    (*Save (API Format)*), paste the JSON, and mark the prompt with `%prompt%`
    (plus optional `%width%`/`%height%`/`%seed%`). The app then runs *your* graph,
    so it's model-agnostic.
  - **Built-in Flux.2 Klein presets** — Settings offers *Flux.2 Klein 4B
    (distilled, fastest)* and *Klein 9B (quality)* as one-click workflow presets
    (no JSON pasting), each listing the model files it needs; the JSON stays
    editable to match your installed filenames.
- Fixed the Settings save to actually forward the **AI-mode** toggle (Gemini vs
  local), which wasn't being persisted.

## 2026-06-18 — Sheet UI pass (colour-coded sections + simpler add)

### Changed
- **Character-sheet sections are now colour-coded** for at-a-glance scanning — a
  coloured left tab + tinted heading + a whisper of the colour per section (stats
  blue · resources orange · spells violet · skills green · inventory gold · traits
  slate), reusing the app's existing panel-accent palette. Scoped to the PC sheet
  (your own, party, and DM-viewed).
- **Simpler "add" affordances.** The cluttered spells row (three loose buttons:
  add / 📖 Spellbook / ✏️ Custom) is now **one primary "＋ Add spell or ability"**
  button that opens a panel with the search plus *Browse spellbook* / *Create
  custom* tucked inside. The same clean full-width "＋ Add" pattern now covers
  weapons/attacks and feats/ASIs.
- **Expanded spells/abilities are more compact** — tighter body padding, line
  height, and editor spacing, so an open spell list takes far less vertical room.

## 2026-06-18 — Float/animation/AI polish

### Added
- **Weapons can key off any ability** — a new per-weapon **attack ability**
  override (auto / STR / DEX / CON / INT / WIS / CHA) sets which score drives both
  the to-hit and the damage modifier. Use it for a Druid's **Shillelagh** (WIS), a
  custom/magic weapon, etc.; "auto" keeps the normal STR/DEX/finesse rules.

### Changed
- **Floating ±HP numbers linger longer** over a token (~1.6s rise/fade, up from
  ~0.9s) so damage/heal is easier to read.
- **Spell attack animation breaks out the modifiers** — the reveal now adds the
  casting modifier and proficiency as **separate steps** (e.g. `+3 INT`, `+2 PROF`)
  instead of one combined `+7 spell`, matching weapon attacks.
- **Ollama model dropdown lists the actually-pulled models** from the connected
  server (`GET /api/ai/models` → Ollama's `/api/tags`), refreshed on open and
  after saving the URL, with a connection hint — no more hardcoded guesses.

## 2026-06-18 — Plain ability checks (Stat/Save menu)

### Added
- **Click a stat → a quick Stat/Save menu.** Clicking an ability score on the stat
  block now opens a small popover: **🎲 Stat** rolls a plain ability check (d20 +
  ability mod, **no proficiency**) and **🛡 Save** rolls the saving throw (adds
  proficiency if proficient). Works for PCs and DM-controlled creatures
  (`check:roll` → `resolveCheck`, with poisoned/frightened disadvantage and the
  creature's armed adv/dis folded in). Enemy creature checks are mod-redacted for
  players like other creature rolls.

## 2026-06-18 — Player AOE visibility + no enemy-stat leak

### Fixed
- **A player's own AOE save resolution stays visible** even when the DM has "hide
  my rolls" on — the per-target save/damage entry is now attributed to the caster
  (the source roll's roller), so only true DM rolls are hidden.
- **No more enemy stat leak in the combat log.** An ENEMY/NEUTRAL creature's roll
  no longer shows its modifier breakdown to players — the bracketed
  ability/proficiency/magic terms (`+4[DEX] +2[PROF]`, `+4[STR]+1[MAGIC]`) and a
  save's `(+5 prof)` are stripped, and the roll-reveal animation collapses its
  bonus chips into one anonymous step (the d20, total, outcome and damage dice
  still show). FRIENDLY creatures and PCs are unaffected (their stats are already
  visible to players). New durable `roll_log.hide_mods` flag.

## 2026-06-18 — Player combat panel + AOE damage for players

### Fixed
- **Player right panel is collapsible/resizable again** — the combat console + the
  dice/log/chat are now **reorderable, per-section collapsible** sections (like the
  DM panels), so the dice panel can be collapsed to give the combat section room
  (and the panel edge drags to resize). Replaces the bottom-docked dice panel that
  was squeezing the combat console.

### Changed
- **AOE save spells no longer auto-apply to one target.** Casting a save-for-half
  spell (Fireball, etc.) from the combat section or floating menu now just **rolls
  the damage once** (with the cast animation); it's applied **per target** via the
  **Apply damage** click path — never auto-hitting a single creature.
- **Players get the Apply damage button for their own AOE spells**, same as the DM.
  The cast stamps the caster as `apply.owner`, so visibility keeps the payload for
  them and `save:resolve` lets them click each target to roll its save + apply.

## 2026-06-18 — Summons tied to spells + roll-animation polish

### Changed
- **Summons are now cast from a spell/ability**, not a standalone panel. A
  spell/ability can be tagged as a **summon** (icon + optional token name); a
  **✋ Summon** button on it spawns the friendly companion (`summon:cast`). A
  **leveled** summon spell **spends a slot**; cantrips/abilities don't. Known
  summon spells (Mage Hand, Find Familiar, Conjure Animals/Woodland Beings,
  Spiritual Weapon) ship pre-tagged; the old `summon:create` panel is removed.
- **Roll animation — every die is rolled individually**: each damage die tumbles
  in its real shape and settles one by one (Fireball shows all its d6s rolling,
  crit dice tinted), with the total climbing as they land.
- **Roll animation — colour held back** until the result reveals (grey through the
  tumble + to-hit build-up), **real die shapes** for all types (d4 triangle … d20
  hexagon), and it **lingers longer** after the damage concludes.
- **Player roll log is sticky** — the player console docks the dice/log/chat to
  the bottom of the right panel so the newest roll stays visible.

## 2026-06-18 — Sound↔animation sync + perf pass

### Changed
- **Combat sounds now sync with the roll animation**, not the server roll. When a
  roll animates, the hit/miss cue lands **with the HIT/MISS stamp** and the impact
  lands **with the damage dice** (Fireball cast / Magic Missile dart). Heals still
  chime on apply (they don't animate); skill/save ticks and un-animated rolls stay
  immediate. When roll animations are off, all cues fire immediately as before.

### Performance
- Memoized the spell-grouping buckets in `CharacterSpells` and the
  `KillScoreboard` sort so they don't recompute on unrelated re-renders.
- `RollRevealOverlay` is now `React.memo` — it no longer re-renders on every
  snapshot (it's a child of the snapshot-subscribing routes), only when the active
  reveal changes.

## 2026-06-18 — Attack-roll reveal animation

### Added
- **Roll animations** — when an attack resolves, everyone who received the roll
  sees a **staged** reveal: the **d20 tumbles** and lands on its natural face, then
  each bonus (ability mod, proficiency, magic, mastery…) **flies in as a chip and
  the to-hit total counts up**, a **HIT / MISS / CRIT / FUMBLE** stamp lands, and on
  a hit the **damage dice roll (showing their faces) and each modifier counts the
  damage up** to the applied total. **Magic Missile** fires a quick single-dart
  burst each time the caster assigns a dart. It's **non-blocking** (the map stays
  interactive) and **click / tap / Esc skips** it; mechanics still apply instantly
  server-side. Default **on**, per-device toggle in **Settings → Sound**.
- Driven by a structured `reveal` payload on the attack's `RollEntry` — the d20,
  the labelled to-hit steps, the damage dice (with their faces) and modifier steps
  — surfaced from `combatMath` and persisted (rides the snapshot, already
  per-viewer filtered, so DM-hidden rolls don't animate for players).
- **AoE / save spells (Fireball, etc.)** animate their damage roll **once, at
  cast** — the single rolled total is the spell's damage. Applying it to each
  target (the save-for-half click-to-target flow) does **not** animate, pending a
  decision on what the DM wants revealed per target. (The principle: animate where
  dice are actually rolled — so Magic Missile still bursts per assigned dart.)

## 2026-06-18 — Combat correctness verified (bug-pass follow-up)

### Verified (regression tests added — no behavior change needed)
- **Save-for-half deals half, not 0** — a PC save spell (Hail of Thorns-style)
  carries its rolled damage into the apply payload; a passed save takes half.
- **Crit + Pushing Attack** — the weapon's (crit-doubled) damage still lands on a
  hit while the maneuver's `amount:0` save rider only applies the push/condition.
- **Chromatic Orb** is in the spell database with a proper attack roll, so it
  appears in the right-click floating menu once added from search.

## 2026-06-18 — Summons & audio (Phase 3b)

### Added
- **Lightweight summons/companions** — a **✋ Summon** panel (DM AND players)
  spawns a friendly creature token (Mage Hand, familiar, spiritual weapon,
  conjured beast, or a custom name + emoji). It's a `disposition:'friendly'`
  creature, so the existing move rules let the owner drag it and players see it
  under token fog. Spawned via `summon:create`; placed on the active map.
- **Combat audio cues** — procedural Web Audio blips (no assets/licensing) for
  hit, miss, heal and skill/save checks, driven by `fx:hp` and new roll-log
  entries. **Default on**, with a per-device mute in **Settings → Sound**.

## 2026-06-18 — Table features (Phase 3a)

### Added
- **Kill count** — each PC tallies enemies it drops to 0 HP (weapon + targeted
  spell attacks). Shown as a 💀 badge on the sheet and a shared **scoreboard**
  (everyone can see it) in the initiative header and DM Data view. Durable
  (`characters.kill_count`).
- **DM "speak as" a token** — with a token selected, the DM's chat can be voiced
  as that NPC/monster: the message shows the token's name and a speech bubble
  pops over it. A 🗣 toggle above the chat input switches between the token and
  plain "DM".
- **AI-fill shops** — the decal shop editor gets a **✨ AI fill** input: describe
  a shop and AI stocks it with priced items (`POST /api/shops/generate`),
  appended to the editor (not auto-saved). Key-gated, fails safe.

## 2026-06-18 — Spells & character UX (Phase 2)

### Added
- **Sorcerous Burst** (2024 sorcerer cantrip) added to the spell database —
  searchable + rollable (1d8, scales by caster level).
- **Custom spell authoring** — a **✏️ Custom spell** button creates a homebrew
  spell with an inline editor for name, level, school, action and roll
  (kind/dice/save/DC/damage type), reusing the existing roll editor.
- **Inline header edit** for any sheet ability while editing — rename, change
  level/school, and edit the description in place.

### Changed
- **Spell view redesign** — spells/abilities are grouped into collapsible
  **Cantrips / Level N / Other abilities** sections (each shows a count and
  remembers open/closed). Entries can be **reordered within a group** via tap
  ▲/▼ (works on touch); the order persists server-side (`ability:reorder`).

## 2026-06-18 — Combat & visibility fixes (bug pass)

### Fixed
- **Token fog** now hides only enemy/neutral creatures — your party (PCs +
  friendly creatures) stays visible to players even under token fog. Map fog
  (terrain blackout) is unchanged.
- **Magic Missile** is now assigned by the **casting player** (not DM-gated):
  each dart rolls its own damage on the click, capped at the dart count for the
  slot level.

### Added
- **Players see who's dead** — a defeated enemy shows a skull even though its HP
  stays hidden (server-computed `dead` flag).
- **Players can end their own turn** — an "End turn" button appears in the top
  bar on the active player's turn (server allows it only then; the DM still
  advances anyone).

## 2026-06-16 — Map decals & shops

### Added
- **Clickable "shop" popups on image decals** — attach a title, note, and a
  priced item list to any decal. Players click to view it read-only (item /
  price / qty / notes); the DM edits inline with live save (`annotation:setPopup`).
- **Discoverable 🛒 add/edit button** on decals while editing (UNLOCKED):
  `🛒 +` to add a shop, `🛒` to edit one. Hidden when decals are LOCKED so it
  never clutters the map during play (a body click still opens the editor there).

## 2026-06-15 — Conditions, AI rules assistant, creatures & sheet import

### Added
- **Conditions — first location-based mechanics:** auto-crit when attacking a
  paralyzed/unconscious target within 5 ft, and prone advantage/disadvantage by
  distance. Conditions also **cascade** (e.g. Unconscious → Incapacitated +
  Prone) and **stamp the combat round** they were applied ("T{n}") for manual
  duration tracking — no auto-expiry.
- **Conditions auto-apply 5e rules:** paralyzed/stunned/unconscious/petrified
  auto-fail STR/DEX saves; poisoned/frightened give disadvantage on ability
  checks.
- **Homebrew inline roll editor** for custom sheet abilities (kind/dice/save/dc/
  type), plus a remove-roll control.
- **AI quick wins:** condition rules tooltips, "ask the buddy about this roll",
  AI-generated NPC dialogue → speech bubble, and session recap.
- **Live cursor "laser pointers"** for everyone on the map, with a mute-others
  toggle (on by default) and a DM "share my pointer" self-mute.
- **Clickable web links in chat** (http/https only — safe, no raw HTML).

### Changed
- **Fully statted SRD bestiary** — every creature arrives combat-ready at its
  intended power level (canonical CR, AC, speed, stats, attacks). AI variants are
  **grounded on the nearest base creature as a power *floor*** ("Stone Goblin"
  scales up from Goblin) without stripping AI creativity for fully-custom names.
- **AI character generation/fill grounded in the local rules DB** — generated
  spells/abilities/weapons are replaced by canonical, rollable DB entries and
  de-duplicated by name (no accidental duplicate spells).
- **Sheet-import overhaul:** per-section import checkboxes ("only empty fields"),
  parses skills/saves/feats/spells/masteries, and resolves spell/mastery names to
  **rollable** entries at import; a per-entry "Make rollable" button for the rest.

### Removed
- Broken Roll20 `<iframe>` embed (most sites block framing; no per-character
  export API anyway).

## 2026-06-14 — AI gateway & DM rules assistant

### Added
- **DM rules-assistant chatbot** — Ollama-first with Gemini fallback, grounded on
  an SRD digest + app data + an optional uploaded rulebook PDF.
- **Rulebook reader** with clickable page citations; assistant **thinking
  indicator + Stop button** that doesn't block other chat.
- **App-wide AI gateway** (`generateText`/`generateJson`) routing all AI
  features; `/rule` alias for the assistant.

### Changed
- **Gemini is the default** backend (best quality, local fallback) with a
  **Local-only** lockdown mode and a per-question chat model dropdown.
- Stricter grounding and a larger Ollama context window.

## 2026-06-13 — Multi-image maps & token presence

### Added
- **Multi-image battlemaps** — build a larger map from several image tiles in any
  direction with a fixed, grid-based scale; much closer zoom (native-pixel floor).
- **Chat speech bubbles** over PC tokens (typing + spoken words).
- Pan from anywhere, including off the map.

## 2026-06-12 — Sheets, modifiers & UI polish

### Added
- **Live drag-distance readout** on tokens, broadcast table-wide
  (visibility-gated); the label rides the tether midpoint.
- **Color-coded panel section headers** (both roles, both panels).

### Changed
- **Feats & ASIs redesign** with a working level-based feat cap; the stat tooltip
  always shows the underlying math (base + ASI + magic item).
- Second Wind now spends its resource.

### Fixed
- Panning no longer clears the current selection.
