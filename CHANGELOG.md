# Changelog

All notable changes to the DnD VTT, newest first. Dates are when the work
landed on `claude/Dev`. See [`ROADMAP.md`](ROADMAP.md) for the feature ledger and
[`CLAUDE.md`](CLAUDE.md) for architecture.

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
