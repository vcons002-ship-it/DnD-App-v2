# Feature Guide — what you can do and where to find it

A complete, plain-language tour of everything the app can do, written for the
people at the table rather than for developers. It is split into a **DM guide**
and a **Player guide**, with a shared reference for the tools both roles use
(map, dice, character sheets). For each feature you'll find **where the tool
lives**, **how to use it**, and any gotchas.

> New here? Read **[README.md](README.md)** for install/run. This file answers
> "OK, it's running — now what can I actually do?" The authoritative
> feature-by-feature status lives in **[ROADMAP.md](ROADMAP.md)**.

---

## Contents

- [The big picture](#the-big-picture)
- [Getting into a game](#getting-into-a-game)
  - [DM: create or resume a session](#dm-create-or-resume-a-session)
  - [Player: join a session](#player-join-a-session)
- [The screen layout](#the-screen-layout)
- [The top toolbar (both roles)](#the-top-toolbar-both-roles)
- [DM guide](#dm-guide)
  - [Maps](#maps-dm)
  - [Fog of war](#fog-of-war-dm)
  - [Map scale & grid](#map-scale--grid-dm)
  - [Spawning creatures](#spawning-creatures-dm)
  - [Player characters on the spawn list](#player-characters-on-the-spawn-list-dm)
  - [Editing a creature or NPC](#editing-a-creature-or-npc-dm)
  - [Disposition: what players see](#disposition-what-players-see-dm)
  - [Hiding tokens & combat-role badges](#hiding-tokens--combat-role-badges-dm)
  - [Running combat](#running-combat-dm)
  - [Bulk actions on many tokens](#bulk-actions-on-many-tokens-dm)
  - [The creature & item libraries](#the-creature--item-libraries-dm)
  - [The DM Data dashboard (second screen)](#the-dm-data-dashboard-second-screen-dm)
  - [Settings & AI](#settings--ai-dm)
- [Player guide](#player-guide)
  - [Choosing your character](#choosing-your-character-player)
  - [Your character sheet](#your-character-sheet-player)
  - [Placing & moving your token](#placing--moving-your-token-player)
  - [Attacking & casting (combat console)](#attacking--casting-combat-console-player)
  - [Conditions & HP](#conditions--hp-player)
  - [Seeing the party & NPCs](#seeing-the-party--npcs-player)
- [Shared tools (both roles)](#shared-tools-both-roles)
  - [Moving around the map](#moving-around-the-map)
  - [Tokens at a glance](#tokens-at-a-glance)
  - [The floating action menu (right-click)](#the-floating-action-menu-right-click)
  - [Dice & the roll log](#dice--the-roll-log)
  - [Measuring & AOE templates](#measuring--aoe-templates)
  - [The character sheet in depth](#the-character-sheet-in-depth)
  - [Importing & exporting a sheet](#importing--exporting-a-sheet)
- [Quick reference: clicks & keys](#quick-reference-clicks--keys)

---

## The big picture

This is a **shared, live virtual tabletop for D&D 5e**. The DM and the players
open **different links** to the **same session** and see the same map and tokens
update in real time. The server is authoritative: clients never compute damage,
dice, or AC themselves — they ask the server, which decides and tells everyone.

Two consequences worth knowing:

- **Players only ever see what their role allows.** Hidden monsters, full enemy
  stat blocks, and secret fog are filtered out on the server before a player's
  screen ever receives them.
- **Everything is saved automatically**, keyed to the session code: maps,
  tokens, HP, conditions, initiative, fog, and the roll log all survive a server
  restart. Loading the same code restores the exact board.

---

## Getting into a game

### DM: create or resume a session

**Where:** the **`/dm`** link (the "DM:" URL printed when the server starts).

You land on the **DM Console** ("Start a new session or rejoin an existing one").

- **Start fresh:** optionally type a **custom code** in the
  *"Custom code (optional, e.g. TAVERN)"* box for a memorable join link, then
  click **Create new session**. Leave it blank for a random code.
- **Rejoin an existing one:** type the **Session code** (and the **DM
  passphrase** if your server is configured with one) and click **Rejoin as DM**.
- **Resume a past game:** under **saved sessions**, every previous session is
  listed with its code, name, map count, and last-played date. Click a row to
  jump back in. Use **✎** to rename a session or change its join code (this keeps
  all maps and tokens — only the old link stops working), or **🗑** to delete it.

Once in, click **Copy player link** (top toolbar) to grab a link with the join
code already baked in, and hand it to your players.

### Player: join a session

**Where:** the **`/join`** link your DM shares.

You see **"Join Game"**. Enter the **session code** (it's usually pre-filled if
the DM sent the copy-link) and click **Join**. Then pick your character (see
[Choosing your character](#choosing-your-character-player)).

---

## The screen layout

Both views share the same three-column shape:

| Area | DM | Player |
| --- | --- | --- |
| **Top** | [Top toolbar](#the-top-toolbar-both-roles) (session name, code, tools) | Top toolbar (session name, leave button) |
| **Left panel** | Maps / Spawn / Initiative, plus the dice roller and Roll20 embed | Your character (claim, HP, conditions, sheet), party roster, Roll20 embed |
| **Center** | The live map canvas | The live map canvas |
| **Right panel** | The selected token's full panel (or bulk-actions when several are selected) | Your **combat console** for the selected token, with the roll log beneath it |

Side panels are **resizable** (drag the edge) and **collapsible**, and your
preference is remembered.

---

## The top toolbar (both roles)

Runs across the top of every session screen.

- **Session name** — click to rename the campaign (DM).
- **Code: XXXX** and **Active: <map>** — quick reference for what's live.
- **Map tool menus** — **Measure**, **Scale**, and **Fog** dropdowns live here,
  above the map. (Measure is available to everyone; Scale and Fog are DM-only.)
- **DM-only buttons:**
  - **Load session** — disconnect and return to the console to load/import another.
  - **🗔 Data view** — open the [DM Data dashboard](#the-dm-data-dashboard-second-screen-dm) in a new window (great on a second monitor or tablet).
  - **⚙ Settings** — edit the Gemini AI key and model.
  - **Copy player link** — copy the join link with the code embedded.
- **Player-only button:** **Leave** — disconnect and return to the join screen.

---

## DM guide

### Maps (DM)

**Where:** left panel → **Maps** section.

- **Add a map:** give it an optional name, then either **Upload image map** (any
  image file) **or** paste a **Google Slides URL** and click **Add**. Files are
  stored on your PC — players never touch your filesystem.
- **Stage privately, then reveal:** you can fully arrange a map (tokens, grid,
  fog) while players see something else. When it's ready, click **Make active**
  on that map — only then do players switch to it. The active map is badged
  **LIVE**.
- **Preview any map:** click a map's **thumbnail** to view it yourself without
  making it active.
- **Rename / delete:** click a map's name to rename it; click **✕** to delete it
  (this also removes that map's token placements — you'll confirm first).
- **Bring tokens to this map:** when you're on a map and others exist, use
  **Bring tokens to this map** — pick a source map from the **From map…**
  dropdown and click **PCs**, **Monsters**, or **All**. HP and conditions carry
  across via the underlying creature, and the source map keeps its copies.
- **Import maps from another session:** click **⇪ Import maps from another
  session**, enter a code, **Find**, tick the maps you want (token counts shown),
  and **Import**. The maps, their tokens, and the creatures/PCs they reference are
  deep-copied in; the other session is untouched. If a PC name collides, you
  choose per character: **Reuse** (link to the existing one), **Overwrite**
  (replace — never an actively-played PC), or **New** (separate copy).

### Fog of war (DM)

**Where:** top toolbar → **🌫 Fog** dropdown (DM-only).

There are **two independent fog layers**, both can be on at once:

- **🗺 Map fog** — blacks out unexplored terrain. Players see solid cover that's
  indistinguishable from the off-map background; you see it translucent.
- **👤 Token fog** — leaves the terrain visible but hides any creature tokens
  standing in covered cells. You see a purple marker over the hidden region.

To paint:

1. Turn on **Map fog** and/or **Token fog**.
2. Under **Paint layer**, pick **Map** or **Tokens** (only enabled layers are
   selectable).
3. Under **Brush**, choose **Reveal** or **Hide**, and a size — **1×**, **3×**,
   or **5×** cells.
4. **Click-drag on the map** to paint.
5. **Cover all** re-covers the whole layer (your "curtain" — then reveal just the
   starting room); **Reveal all** clears it.

Individual tokens can also be hidden outright — see
[Hiding tokens](#hiding-tokens--combat-role-badges-dm).

### Map scale & grid (DM)

**Where:** top toolbar → **📐 Scale** dropdown (DM-only).

Distances are driven by the map's **real-world width in feet**.

- **Grid square** — the size of one grid cell **in feet** (e.g. 5). The pixel
  size is derived and shown as a read-out (`≈ N px / square`).
- **Map width** — the real width of the whole map in feet (the source of truth
  for every distance measurement).
- **📏 Set scale from line** — the easy way: click it, then **drag a line across
  a known distance** on the map (e.g. a 20-ft hallway). Release, type the real
  length in the **"This line is ___ ft"** prompt, and **Apply**.

The grid lines are visible at rest and **brighten** while you drag a token or use
a measure tool, to help you line things up. Maps with no width set fall back to a
legacy feet-per-square model, so older saves are unaffected.

### Spawning creatures (DM)

**Where:** left panel → **Spawn** section → **Monsters**.

- **Find or invent a creature:** type in the search box — *"Search SRD, or
  describe a creature for AI — e.g. 'goblin with a longbow'…"*. Matches from the
  offline **SRD** and your **library** appear as you type (with icon, name, HP,
  type). Pick one, set **HP** if you like, and click **Add creature**. With a
  Gemini key configured, **✨ AI** invents anything not in the SRD from your
  description.
- **Spawn buttons vs. instances:** each creature you add becomes a reusable
  **spawn button** (a *template*). Click it, then **click the map** to drop a
  numbered **instance** ("Goblin 1", "Goblin 2", …), each with its own HP and
  conditions. Placement mode stays active so you can drop several in a row —
  press **Esc** (or click the button again) to stop.
- **Tidy the list:** **✕** on a spawn button removes it. **Edit** opens the
  template editor to adjust stats/art *before* placing (every later instance
  inherits the change).

### Player characters on the spawn list (DM)

**Where:** left panel → **Spawn** section → **Player characters**.

- Create PCs yourself with the **New Character Form** (name, race, class, HP,
  ability scores), or load one from the cross-session library with the
  **Library Character Picker** (it's added unclaimed, ready for a player).
- Click a PC to enter placement mode, then click the map to drop its token.
- **✕** removes a character and its tokens — blocked while a connected player is
  holding that character.

### Editing a creature or NPC (DM)

**Where:** select a token → right panel → the **stat block** → **Edit**.

The stat block is one shared component for monsters and characters. In edit mode
you can change **name, type, HP/AC/speed, ability scores, save proficiencies,
resistances/vulnerabilities, weapons/attacks, actions, and traits**, then
**Save** (or **Cancel**).

- **✨ Fill missing details with AI** asks Gemini for the SRD block and fills
  **only the empty fields** — it never overwrites your edits.
- **Attacks:** under **Attacks**, **+ Attack** pulls from the 2024 weapon book
  **and** a natural-attacks library (Bite, Claw, Slam…), or add a blank one.
  Creature picks are stored "dice-only" so the to-hit and modifier come from the
  creature's live stats. **↻ Generate attacks from description** scrapes rollable
  attacks out of free-text actions.
- **Structured actions** (breath weapons, spell-like actions) can carry a roll
  (attack/save/damage/heal); **↻ Derive rolls from descriptions** scrapes the DC
  and dice from SRD/AI text. Roll them from the stat block in play — and for an
  **attack**-type action you can fire it at a target by selecting the monster and
  **right-clicking the victim** (it rolls to-hit vs AC and applies typed damage,
  with resistances/vulnerabilities honored).

Each ability score is **clickable to roll that creature's saving throw**, and
weapon/action lines have roll buttons.

### Disposition: what players see (DM)

**Where:** select a token → right panel → **Disposition**.

A creature's disposition controls exactly how much players see (shown as a
colored dot on the token — green/amber/red):

- **Friendly** — players see the **full stat block** (like a party member).
- **Neutral** — players see **name + HP + type + AC** only.
- **Enemy** — players see **name + conditions** only (default).

Instances inherit their template's disposition. Players also get a free-text
**note** field on creatures that anyone at the table can read and edit.

### Hiding tokens & combat-role badges (DM)

**Where:** select a token → right panel → **DM tools** (collapsible).

- **Token icon** — set an emoji or upload an image (applies across a
  multi-selection).
- **Combat role** — the ⚔️/🏹/✨ badge is auto-derived, but you can force
  **Auto / ⚔️ / 🏹 / ✨** or hide it.
- **Admin actions** — duplicate, hide from players, hide the role badge, delete.
- **Size** (DM-only) — the **Size** −/+ buttons set the token's footprint in feet
  (5 ft = Medium); it keeps that real size when you change the grid.

Hidden tokens never reach players, regardless of fog.

### Running combat (DM)

**Where:** left panel → **Initiative** section.

- **Roll all** — resets the round: rolls **d20 + DEX** for everyone and
  highlights the top of the order.
- **Add rolls** — rolls only for combatants who don't have a number yet (for
  latecomers).
- **Next ▸** — advances the active turn (wraps around).
- **Clear** — clears initiative.

The list shows each combatant's turn **order (#)**, an editable **roll** field,
name, and HP. The active turn is highlighted both here and on the board (a
pulsing ring + initiative-rank badge on the token).

**Automated attacks & saves** resolve on the server:

- Select an attacker, then use **Attacks** in its right panel (or right-click a
  target — see the [floating menu](#the-floating-action-menu-right-click)) to
  roll a weapon. The server rolls to-hit vs the target's AC, doubles dice on a
  nat-20, applies resistances/vulnerabilities, and **auto-applies damage on a
  hit** (recorded in the roll log; you can heal it back). Toggles for
  **Off-hand**, **2H** (versatile), and **advantage/disadvantage** are right there.
- Conditions automatically nudge advantage/disadvantage where 5e is unambiguous
  (prone, restrained, invisible, etc.), with the cancel rule applied.
- Cast a save-or-damage spell/action and the log gets a DM-only **🎯 Apply
  damage** button: click it, then **click each target** on the map — each rolls
  its **own** save and takes auto full/half damage. Keep clicking targets; press
  **Esc** to stop.

### Bulk actions on many tokens (DM)

**Where:** select 2+ tokens (Shift/Ctrl-click, or marquee) → right panel turns
into the **Bulk actions** panel.

- **Damage / heal all (AOE)** — one amount, applied to the whole selection.
- **Conditions (all)** — pick a condition and **Apply**, or **Clear all**.
- **Saving throw (all)** — pick an ability and **DC**, then **Roll saves** —
  each creature rolls with its own advantage/disadvantage.
- **Token image (all)** — set one icon on everything selected.
- **Visibility (all)** — **Hide from players / Show**, **Hide role badges /
  Show badges**.
- **Delete N tokens** — remove the whole selection.

### The creature & item libraries (DM)

**Where:** creatures — **💾 Save to library** on a selected creature's panel;
items — the **Library** picker inside a character's Items list.

The library is **app-wide**, so homebrew and AI creatures (and items) are
reusable in **any** future session — not just the one they were made in.

- Saving is **explicit** (no auto-save): query the AI for "bandit with a short
  sword", then save it as just **"bandit"**, and future searches hit the library
  instead of calling the AI again.
- Creature search merges **SRD + your library**; a library hit skips the AI.
  Name conflicts show a side-by-side prompt (it even detects when you'd shadow a
  built-in SRD name).
- There's also a **character library** (see the player sheet's **💾 Save to
  library** and the **📂 Load saved character** picker) for full PCs.

### The DM Data dashboard (second screen) (DM)

**Where:** top toolbar → **🗔 Data view** (opens **`/dm/data`** in a new window).

A standalone combat dashboard meant for a second monitor or tablet. It mirrors
the live active map and gives you:

- A grid of **compact cards** — name, HP bar, quick damage/heal, AC, ability
  scores, condition chips, and a **Status** picker.
- **Sort** by initiative / A–Z / type, then **drag to reorder**.
- A per-card **checkbox** that multi-selects — and that selection mirrors to your
  map window (same browser) and drives the bulk-actions panel.
- **Expand** any card into a large overlay that reuses the full token panel
  (edit stats, AI fill, disposition, conditions, damage/heal — everything).
- An **initiative header** (Roll all / Add rolls / Next / Clear) and a
  **full dice panel + roll log** down the right side.

### Settings & AI (DM)

**Where:** top toolbar → **⚙ Settings**.

- Edit the **Gemini API key** (masked/write-only — leaving it blank keeps the
  current one) and pin a **model** (blank auto-detects a current one).
- AI is **entirely optional and fails safe**: without a key, SRD search, combat,
  sheets, and everything else still work — only the "✨" generate/fill buttons go
  quiet. A global **"AI is working"** banner shows when a request is in flight.

---

## Player guide

### Choosing your character (player)

**Where:** left panel → **Choose your character**.

- Tap a character and click **Play** to claim it (a **you** badge marks yours;
  taken ones show **taken**). You hold exactly one at a time — **Change** releases
  it and reopens the chooser.
- No character yet? Create one with the **New Character Form**, or **📂 Load saved
  character** from your cross-session library — either way you immediately claim it.

### Your character sheet (player)

**Where:** left panel, below your claimed character.

Your full, **editable** sheet lives here (the DM can edit it too; party members
see it read-only). See [the character sheet in depth](#the-character-sheet-in-depth)
for every section. Quick HP buttons (**−1 / −5 / +1 / +5**) and a temp-HP field
are right at the top.

### Placing & moving your token (player)

**Where:** left panel → **📍 Place my token**.

Click the button, then **click the active map** to drop your character's token
once. After that you can **drag it to move**. (Only the DM can resize tokens.)

### Attacking & casting (combat console) (player)

**Where:** right panel — it becomes your **combat console** whenever a token is
selected.

This is the key player combat surface, and it always acts **as your own PC**
(not the token you clicked):

- Selecting **any** token shows **"Your attacks & abilities"** with your
  **Attacks** (target defaults to the token you clicked; friendly creatures are
  excluded from the target list) and your **Spells, Abilities & Masteries**.
- **Attack-roll spells & cantrips** (Fire Bolt, Eldritch Blast, …) work just
  like weapons: pick a target from the **Spell target** dropdown, then roll. The
  server rolls **to-hit vs the target's AC**, doubles dice on a crit, misses on a
  nat-1, and **auto-applies the typed damage** on a hit (so the target's
  resistances/vulnerabilities to that damage type actually count). Save-based and
  healing spells still resolve their own way.
- Pick a weapon/spell to roll it — the server resolves to-hit, damage, and
  advantage, and the **roll log is right below** so you see the result instantly.
- A selected creature's **Details** (collapsible, read-only) sits up top for
  target context — exactly as much as its disposition allows. **Double-click a
  token** to select it and auto-expand its details.
- **Faster still:** select your token, then **right-click an enemy** to attack it
  straight from the [floating menu](#the-floating-action-menu-right-click).

If a friendly creature (a companion/summon) is selected, attacks go out **as that
creature** instead — handy for pets and summons.

### Conditions & HP (player)

**Where:** left panel → **Conditions** (on your claimed character).

You can set/clear conditions on **your own PC only**. Damage and healing show on
your token's HP bar (with a cyan **+N** for temp HP). Temp HP soaks damage first
and is never refilled by healing.

### Seeing the party & NPCs (player)

**Where:** left panel → **Party**.

- The **Party** section lists other players with their HP; expand a row to read
  their (read-only) sheet.
- For NPCs/monsters, what you see depends on the DM's
  [disposition](#disposition-what-players-see-dm) setting — full sheet for
  Friendly, name+HP+type+AC for Neutral, name+conditions for Enemy. You can read
  and add to the shared **note** on any creature.

---

## Shared tools (both roles)

### Moving around the map

- **Zoom:** mouse **wheel** zooms toward the cursor (25%–1200%).
- **Pan:** **click-drag empty canvas**.
- **Fit:** the **Fit** button (bottom corner) resets to fit-the-window; the live
  zoom **%** is shown next to it.
- **Esc** cancels whatever mode you're in (placing, painting fog, measuring,
  setting scale, applying damage).

### Tokens at a glance

A token shows a lot without clicking:

- **HP bar** (where you're allowed to see it) — green > 50%, amber > 25%, red
  below; a cyan **+N** for temp HP; **💀** at 0 HP.
- **Disposition dot** (green/amber/red), **combat-role badge** (⚔️/🏹/✨),
  **initiative-rank** number when in combat, and **status rings** (buff /
  negative / concentration shown together).
- **👑 crown** marks player-character tokens so the party stands out.
- **Move trails:** a moved token leaves fading white footprints so everyone
  remembers where it came from.
- **Hover** a token for a small card (name, HP if visible, conditions).

Interactions: **click** selects (Shift/Ctrl-click adds to the selection),
**drag** moves, **double-click** selects + expands details,
**right-click / long-press** opens the floating menu.

### The floating action menu (right-click)

**Where:** **right-click** (or **500 ms long-press** on touch) any token.

It opens at your cursor with:

- The token's name and HP (if visible).
- **Quick damage/heal** (where HP is visible).
- **Attacks:** if you have a *different* token selected as the attacker, the menu
  offers that attacker's **weapons and attack-roll spells against the
  right-clicked token** — a clear header reads **"⚔️ Attacking as X → Y"**. (For
  players the attacker defaults to your own PC, or a selected friendly creature;
  for the DM, a selected monster's spell-attack **actions** appear here too.)
  These spell-attacks roll to-hit vs the target's AC and apply typed damage, just
  like a weapon swing.
- **DM admin** buttons (duplicate / hide / role badge / delete).

A right-click **never changes your selection**, so "select attacker → right-click
target" works cleanly.

### Dice & the roll log

**Where:** the **Dice** panel — DM: left panel; Player: right panel beneath the
combat console. Also on the DM Data dashboard.

- **Quick dice:** buttons for **d20 / d12 / d10 / d8 / d6 / d4 / d100**.
- **Custom roll:** type an expression like **`2d6+3`**, optionally a **label**,
  toggle **advantage/disadvantage**, and **Roll**.
- **Shared roll log:** every roll (and every automated attack/save) lands in one
  log everyone sees, color-coded by roller and roll type. For players, enemy AC
  is redacted to `vs AC ?` while HIT/MISS stays visible. A cast spell's full
  description shows here. The DM can **Clear** the log.
- **On-map overlays** (toggled from the dice panel):
  - **⤢ Overlay** — a click-through latest-rolls feed pinned to the map's
    **bottom-left**; recent rolls stack and fade, the newest always stays visible.
  - **🎲 Dice** — a quick **d20** button pinned to the map's **bottom-right**;
    hover it to reveal the full set of dice.

### Measuring & AOE templates

**Where:** top toolbar → **📐 Measure** dropdown (everyone).

Pick a shape — **Circle, Cone, Line, Square/Cube, Emanation** — then a size:

- **Custom** — drag between two points to size it freely.
- **Small / Large** — classic 5e presets (e.g. Cone 15/60 ft, Circle r 15/20 ft),
  placed **click-to-anchor → move to rotate → click to commit** (circles/squares
  commit on the first click).
- **Emanation** centers on a token and follows it as it moves.

Extras: **🧲 Snap to grid** toggle, **✕ Remove (click a shape)** to delete one,
and **Clear mine** / **Clear all** (DM). Shapes are **shared and persistent**,
colored per person, and visible to the whole table until cleared. Players can
only remove their own; the DM can remove anyone's.

### The character sheet in depth

One generalized sheet powers both PCs and NPC stat blocks. Sections (top to
bottom):

- **Stat block** — name, race/class, level, HP (+ temp), AC, speed, ability
  scores, save proficiencies, resist/vulnerable. **Edit** to change anything;
  **✨ Fill missing details with AI** to back-fill blanks. Click an ability score
  to roll that **saving throw**.
- **Resources** — **spell slots** and class resources auto-fill from 5e
  class/level tables; click the **pips** to spend/restore, and add your own
  **custom counters** (e.g. Ki, Rage).
- **Spells, Abilities & Masteries** — search a local rules database (with a
  Gemini fallback) and add spells, class features, **weapon masteries** (2024,
  tag-driven), and **Battle Master maneuvers**. Each entry collapses to a
  description and, where applicable, has a **roll button** (spell attack / save
  DC / upcast damage all computed for you). The small **roll editor** lets you
  tag what a roll does — **attack / save / damage / heal**, its dice, and the
  **damage type** — so an **attack** spell rolls to-hit against a chosen
  **Spell target** and applies typed damage on a hit. Masteries toggle
  **On/Off**; maneuvers **arm** for your next attack (spending a Superiority Die).
- **Items** — add gear by hand or from the **Library**, with quantity steppers.
- **Skills** — all 18 skills with their ability, a **proficiency dot** (click to
  toggle), the proficiency bonus, and the computed total. **Click a skill to
  roll** the check server-side (honoring advantage/disadvantage).
- **Actions & Traits** — free-text, collapsible.

Editing is allowed for **your own PC** (player) or **anything** (DM); other
players' and read-only creatures' sheets are view-only.

### Importing & exporting a sheet

**Where:** on an editable character sheet → **Import / export sheet**.

- **Paste** plain text from almost any sheet (HP `25/30`, AC, class/level,
  ability scores, skill proficiencies, spell slots) **or** the app's own JSON
  export. Click **Preview import** to see **exactly which fields will be
  overwritten** (everything it doesn't recognize is preserved), then
  **Overwrite** to apply.
- **Export JSON** copies a lossless snapshot of the sheet to your clipboard for
  backup or transfer.

---

## Quick reference: clicks & keys

| Action | How |
| --- | --- |
| Select a token | Click it |
| Add/remove from selection | Shift-click or Ctrl/Cmd-click |
| Move a token | Drag it (your own PC as a player; any token as DM) |
| Select **and** open details | Double-click a token |
| Open the action menu | Right-click (or long-press on touch) a token |
| Attack a target fast | Select attacker → right-click the target → pick a weapon |
| Delete selected tokens (DM) | **Delete** / **Backspace** |
| Cancel any mode | **Esc** (placing, fog, measure, scale, apply-damage) |
| Zoom | Mouse wheel (toward cursor) |
| Pan | Drag empty canvas |
| Reset view | **Fit** button |
| Roll a quick d20 | The on-map 🎲 button (bottom-right) or the Dice panel |
| Roll a custom expression | Dice panel → type `2d6+3` → **Roll** |

---

*Want the engineering view (architecture, invariants, how features are built)?
See **[CLAUDE.md](CLAUDE.md)**. Want the running backlog and per-feature status?
See **[ROADMAP.md](ROADMAP.md)**.*
