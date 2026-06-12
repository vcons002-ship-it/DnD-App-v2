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
  - [Objects: traps, doors, chests & loot](#objects-traps-doors-chests--loot-dm)
  - [Pasting images: object tokens & scenery decals](#pasting-images-object-tokens--scenery-decals-dm)
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
  - [Looting & disarming](#looting--disarming-player)
  - [Seeing the party & NPCs](#seeing-the-party--npcs-player)
- [Shared tools (both roles)](#shared-tools-both-roles)
  - [Moving around the map](#moving-around-the-map)
  - [Tokens at a glance](#tokens-at-a-glance)
  - [The floating action menu (right-click)](#the-floating-action-menu-right-click)
  - [Dice & the roll log](#dice--the-roll-log)
  - [Measuring & AOE templates](#measuring--aoe-templates)
  - [Drawing on the map](#drawing-on-the-map)
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
the DM sent the copy-link) and click **Join** — or, if you've played before, pick
a game from the **saved-sessions list** on the screen (the same resume directory
the DM sees) to rejoin in one click. Then pick your character (see
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

Side panels are **resizable** (drag the edge) and **collapsible**, and the
panels' inner sections are **reorderable and collapsible** too — drag the ⠿
grip (desktop) or tap the **▲/▼** buttons (touch) to rearrange, click ▸/▾ to
collapse. Every layout preference is remembered **per session code**, so each
campaign keeps its own arrangement.

---

## The top toolbar (both roles)

Runs across the top of every session screen.

- **Session name** — click to rename the campaign (DM).
- **Code: XXXX** and **Active: <map>** — quick reference for what's live.
- **❔ Guide** — a quick desktop & mobile control reference for **both roles**
  (it auto-picks the tab matching your device, and points here for the full tour).
- **Map tool menus** — **Measure**, **Scale**, and **Fog** dropdowns live here,
  above the map, next to the **✏️ pen / 🅰 text** drawing tools. (Measure and
  drawing are available to everyone; Scale and Fog are DM-only.)
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
- **🔲 Match map grid (drag a square)** — for maps with a **printed grid**: drag
  across **one printed square** and the app's grid snaps to it exactly (cell
  size + origin offset), then **locks** so the size can't be clobbered. While
  locked, the grid-square input is disabled (an **Unlock** control re-enables
  it); the feet/width inputs still work — changing distance only re-means the
  square, never resizes it.
- **👁 Hide grid** — turn the grid lines off entirely (distances and snapping
  still work; useful when the map has its own printed grid).

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
  press **Esc**, click the button again, or tap **✕ Done** on the *"Placing …"*
  banner over the map (the touch-friendly cancel) to stop.
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
resistances/vulnerabilities, weapons/attacks, and traits**, then **Save** (or
**Cancel**).

- **✨ Fill missing details with AI** asks Gemini for the SRD block and fills
  **only the empty fields** — it never overwrites your edits.
- **Attacks:** under **Attacks**, **+ Attack** pulls from the 2024 weapon book
  **and** a natural-attacks library (Bite, Claw, Slam, Spit, Rock…), or add a
  blank one. Creature picks are stored "dice-only" so the to-hit and modifier
  come from the creature's live stats.
- **Rollable abilities** (breath weapons, spell-like actions, innate spells)
  live in the creature's **Spells & Abilities** section — the same system PCs
  use, with a roll editor (attack/save/damage/heal + DC/dice/type). When a
  creature arrives from the SRD, the AI, or pasted text, its free-text actions
  convert automatically: weapon-like lines become **Attacks** and the rest
  become rollable abilities (DCs and dice scraped from the prose). **Traits**
  stay in the stat block as descriptive text.
- Fire an **attack**-type ability at a target by selecting the creature and
  **right-clicking the victim** (rolls to-hit vs AC and applies typed damage,
  with resistances/vulnerabilities honored).

Selecting a **player character** gives the same panel shape — Attacks, Spells &
Abilities, Sheet info, Conditions, DM tools — so creatures and PCs read alike.

Each ability score is **clickable to roll that creature's saving throw**, and
weapon lines have roll buttons.

### Disposition: what players see (DM)

**Where:** select a token → right panel → **Disposition**.

A creature's disposition controls exactly how much players see (shown as a
colored dot on the token — green/amber/red):

- **Friendly** — players see the **full stat block** (like a party member), its
  HP changes in the log, and they may **move** its token (companions/summons).
- **Neutral** — players see **name + conditions** only, same as an enemy — the
  amber dot is the only difference (it signals intent without leaking stats).
- **Enemy** — players see **name + conditions** only (default).

Instances inherit their template's disposition. Players also get a free-text
**note** field on creatures that anyone at the table can read and edit.

### Hiding tokens & combat-role badges (DM)

**Where:** select a token → right panel → **DM tools** (collapsible).

- **Token icon** — set an emoji or upload an image (applies across a
  multi-selection).
- **Shape** — pick the token's silhouette: **circle** (default), **square**,
  **diamond**, **triangle**, or **image** (draws the art unclipped — pasted
  scenery/objects default sensibly: chests/doors square, traps triangular).
- **Combat role** — the ⚔️/🏹/✨ badge is auto-derived, but you can force
  **Auto / ⚔️ / 🏹 / ✨** or hide it.
- **Admin actions** — duplicate, hide from players, hide the role badge, delete.
- **Size** (DM-only) — type the token's footprint in feet directly (half-foot
  steps, down to 0.5 ft for small objects; 5 ft = Medium) or nudge with the
  **−/+** buttons; it keeps that real size when you change the grid.

Hidden tokens never reach players, regardless of fog.

### Objects: traps, doors, chests & loot (DM)

**Where:** left panel → **Spawn** section → set the **Object** dropdown
(*Trap / Door / Chest / Item / Other*) before clicking **Add object**, then place
it on the map like any token. Select the placed object for its **object controls**
(also in the right-click floating menu).

An "object" is a non-combat interactable — it reuses the token/template system but
shows interaction controls instead of a combat panel, gets no combat-role badge,
and defaults to **Neutral** so players can see it once it's revealed.

- **State chips** — toggle the object's state, stored as conditions that show on
  the hover card: doors **Locked / Open**; chests **Locked / Open / Looted**; traps
  **Armed / Disarmed / Triggered**; items **Taken**.
- **Locks players can beat:** doors and chests show **Pick lock / Open / Close**
  buttons to players too — picking rolls a server-side **DEX (Sleight of Hand)
  check** against the object's **DC** and clears *Locked* on a success
  (open/close is blocked while locked). You can always force-unlock as the DM.
- **👁 Hide / 🙈 Reveal** — keep an object secret (a hidden trap, a concealed door)
  until you reveal it to players.
- **Loot in a chest (or item/other):** a **💰 Loot** section lets you stock it with
  **gold** and **items** — typed in (with an optional description), pulled from the
  item **Library**, or **AI-generated** from a one-line prompt (needs a Gemini
  key; the item also lands in your library for reuse). Each loot row has an **ⓘ**
  toggle showing the item's description. Players **can't see the contents** until
  the object is **opened** (toggle *Open*). Then a
  player clicks **Take** (per item), **Take N gp**, or **Take all** to move it into
  their character — items merge into their inventory, gold into their **gold purse**
  — or you hand it to any PC via the recipient dropdown. An emptied container
  auto-flags itself **Looted/Taken**.
- **Loot on creatures:** the same **💰 Loot** section appears on **any creature's**
  token panel, so you can stock a boss with its treasure ahead of time. Players
  can take it only once the creature is **dead** *and* you flip **Loot revealed**
  (so you can gate it behind a perception roll first).
- **Trap effect & trigger:** give the trap an effect by adding a **save or attack
  action** in its stat block (e.g. "DC 13 DEX save, 2d6 poison"). The object panel
  then shows a **⚡ Trigger** button per action — firing it logs the roll and arms
  the roll log's **🎯 Apply damage** click-to-target flow (each creature rolls its
  own save), and marks the trap **Triggered**. Set a **Disarm DC** here too.
  *(Tip: AI-filled creatures/traps now author save effects as structured actions,
  so the Trigger button works straight away.)*

Players who can see a revealed trap get a **🔧 Disarm** button on it — see
[the player guide](#looting--disarming-player).

### Pasting images: object tokens & scenery decals (DM)

**Where:** copy any image, then press **Ctrl+V** (⌘V) with the map focused.

Copy art from anywhere — a file, a screenshot, or an **image on a web page or
Google Slides** (right-click → *Copy image*; even copies that only carry the
image's URL work — the server fetches it for you). Pasting opens a preview
dialog:

- **Touch up first (optional):** drag on the preview to select a region and
  **✂ Crop**; **🪄 Cut background** flood-fills the edges to transparency
  (checkerboard shows what's removed); **↺ Undo edits** reverts.
- **📦 Object** — drops it as a non-combat **object token** (like a chest/door:
  draggable, hideable, lootable), using the exact image as its art.
- **🖼 Scenery decal** — stamps it **onto the map itself, underneath the
  tokens** (furniture, rubble, a wagon, an extra room). Decals are DM-only:
  **drag** to reposition, drag the **corner handle** to resize (aspect locked),
  and remove them with the drawing tools' eraser or the **Clear decals** button
  (pen strokes and text stay).
- **🔒 Decals** (in the drawing toolbar) locks all decals **click-through and
  undraggable**, so panning and token drags can't grab a large piece of scenery.
  The eraser still works on locked decals.

Pasting never hijacks a paste aimed at a text field, and tells you when the
clipboard has no usable image.

### Running combat (DM)

**Where:** left panel → **Initiative** section.

- **Roll all** — resets combat: rolls **d20 + DEX** for everyone, highlights
  the top of the order, and starts **Round 1**.
- **Add rolls** — rolls only for combatants who don't have a number yet
  (latecomers slot into the order without disturbing the round count).
- **Next ▸** — advances the active turn; wrapping past the last combatant
  bumps the **round counter**.
- **End combat** — clears initiative rolls, the turn marker, and the round
  counter.

The **Round number** in the header is **editable** — type to fix a miscount —
and shows as a chip in everyone's top toolbar. **Objects** (chests, doors,
traps, items) never roll initiative and aren't listed. **Dead creatures keep
their place** in the list (dimmed with a 💀) so the order holds, but **Next
skips them** — a PC at 0 HP still gets its turn to roll death saves and is only
skipped once actually dead. Deleting the creature whose turn it is simply ticks
the marker to the next one.

The list shows each combatant's turn **order (#)**, an editable **roll** field,
name, and HP. The active turn is highlighted both here and on the board (a
pulsing ring + initiative-rank badge on the token).

**Automated attacks & saves** resolve on the server:

- Select an attacker — its right panel opens with a **Combat** section: a
  **Target** dropdown plus a small button for **every rollable action** it has
  (weapon attacks, attack-roll spells, save-forcing abilities, heals).
  **Right-clicking any token fills the Target dropdown** (and opens the
  [floating menu](#the-floating-action-menu-right-click) for the same target),
  so "select attacker → right-click victim" arms both surfaces. The server rolls
  to-hit vs the target's AC, doubles dice on a
  nat-20, applies resistances/vulnerabilities, and **auto-applies damage on a
  hit** (recorded in the roll log; you can heal it back). Save-forcing
  abilities make the chosen target roll its save and take the damage right
  away. Toggles for
  **Off-hand**, **2H** (versatile), and **advantage/disadvantage** are right there.
  Every HP change pops a floating **−X / +X** over the token for the whole
  table, and the roll log keeps an **HP note** ("Druk HP 42→38") so mistakes
  are easy to spot and hand-correct (players see notes only for PCs and
  friendly creatures).
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
- Library items can carry **magic effects** (✦n in the picker): the SRD magic
  items come with presets (a Cloak of Protection is +1 AC *and* +1 to all saves;
  Gauntlets of Ogre Power floor STR at 19), and **AI-generated items include
  them automatically**. Picking the item copies its effects into the inventory,
  where they apply once the item is **equipped/attuned** (the ⚔ toggle).
- **Saving items is explicit too.** Any item on a character sheet or in a loot
  container has a **💾** button that saves it to the library (with its magic
  effects), prompting to rename/overwrite on a name clash. AI-generated items are
  **not** auto-saved — you generate one into the container, then 💾 it just like a
  custom item if you want to keep it.
- **Loot effects are DM-editable in place**: click a loot item's **✦** to open the
  same effects editor the inventory uses — tweak an AI item's bonuses before
  anyone loots it.
- There's also a **character library** (see the player sheet's **💾 Save to
  library** and the **📂 Load saved character** picker) for full PCs.

### The DM Data dashboard (second screen) (DM)

**Where:** top toolbar → **🗔 Data view** (opens **`/dm/data`** in a new window).

A standalone combat dashboard meant for a second monitor or tablet. It gives you:

- A **map switcher** in the header — view **any** map here (non-active maps are
  preview-only), with a **Make active** button to take one live. It **auto-follows
  the live map** whenever it changes (set here or from the main DM window), but
  otherwise leaves you free to preview another map.
- A grid of **compact cards**, **color-coded by type** so the battlefield reads
  at a glance — PCs cyan, friendly creatures green, neutral amber, enemies red,
  objects gray (a tinted background + left border, matching the token dot
  colors) — each showing name, HP bar, quick damage/heal, AC, ability
  scores, condition chips, and a **Status** picker. Cards flow and **scroll**;
  expanding one (more conditions, etc.) pushes the rest down rather than overlapping.
- **Sort** by initiative / A–Z / type, then **drag to reorder**.
- A per-card **checkbox** that multi-selects — and that selection mirrors to your
  map window (same browser) and drives the bulk-actions panel.
- **Expand** any card into a large overlay that reuses the full token panel
  (edit stats, AI fill, disposition, conditions, damage/heal — everything). AI
  fills here show the same **"AI is working" banner + toast** as the main window.
- An **initiative header** (Roll all / Add rolls / Next / End combat) and a
  **collapsible, resizable** dice panel + roll log down the side — collapse it for
  more room for cards.

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
  it and reopens the chooser. After a page reload your character is
  **re-claimed automatically**.
- **While you're playing, it's yours.** A character others can't claim or edit
  is marked **taken**; the lock only lasts while someone is actually playing it.
  If your connection drops, the game **holds your character for a short grace
  window** (so a brief blip doesn't hand it away), then frees it if you don't
  come back. When you **rejoin, you're put right back on the character you last
  had** if it's still free — no re-picking. The DM can **🔓 unlock** a stuck
  claim from the spawn list as a fallback.
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
once. After that you can **drag it to move**. You can also move **friendly
creatures** (companions, summons) — enemies, neutral creatures, and objects are
the DM's to move. (Only the DM can resize tokens.)

### Attacking & casting (combat console) (player)

**Where:** right panel — it becomes your **combat console** whenever a token is
selected.

This is the key player combat surface, and it always acts **as your own PC**
(not the token you clicked):

- Selecting **any** token opens a **Combat** section at the top: one **Target**
  dropdown (defaulting to the token you clicked; friendly creatures are
  excluded) plus small buttons for **all your rollable actions** — weapon
  attacks, attack-roll spells, save-forcing abilities, and heals.
  **Right-clicking a token also sets this Target** — same aim as the floating
  menu, so even if you close the menu the panel is ready to attack that target.
- The Combat section also carries your **damage-altering toggles** (Rage,
  masteries, maneuvers, Hunter's-Mark-style marks — the mark select follows
  your current target) and your **Resources** (spell slots + class counters,
  spendable pips) — so everything you touch mid-fight is in one place. The full
  tracker stays on your left-panel sheet too.
- Below it, **Spells, Abilities & Masteries** is a compact **reference list** —
  tap a row to read its description — so you can see everything you've added
  without scrolling; add/edit/prepare from your character sheet in the left
  panel.
- **Attack-roll spells & cantrips** (Fire Bolt, Eldritch Blast, …) work just
  like weapons: the
  server rolls **to-hit vs the target's AC**, doubles dice on a crit, misses on a
  nat-1, and **auto-applies the typed damage** on a hit (so the target's
  resistances/vulnerabilities to that damage type actually count). Upcastable
  spells get a small **level select** beside their button.
- **Healing spells apply on cast:** pick who from the **Heal target** dropdown
  (you're the default; allies are listed) and the HP lands immediately —
  healing *spells* add your casting modifier on top of the dice. You can also
  **right-click your own token** to cast your heals on yourself.
- Click an action to roll it — the server resolves to-hit, damage, and
  advantage, and the **roll log is right below** so you see the result instantly.
- A selected creature's **Details** (collapsible, read-only) sits below it for
  target context — exactly as much as its disposition allows. **Double-click
  (or double-tap) a token** to select it and auto-expand its details — on a
  phone this also pops the right drawer open.
- **Faster still:** select your token, then **right-click an enemy** to attack it
  straight from the [floating menu](#the-floating-action-menu-right-click).

If a friendly creature (a companion/summon) is selected, attacks go out **as that
creature** instead — handy for pets and summons.

### Conditions & HP (player)

**Where:** left panel → **Conditions** (on your claimed character).

You can set/clear conditions on **your own PC only**. Damage and healing show on
your token's HP bar (with a cyan **+N** for temp HP). Temp HP soaks damage first
and is never refilled by healing.

### Looting & disarming (player)

**Where:** select (or right-click) a revealed object the DM has placed.

- **Locked door or chest:** you get **🔓 Pick lock**, **Open**, and **Close**
  buttons. Picking rolls a **Dexterity (Sleight of Hand) check** against the
  lock's DC (server-rolled, into the shared log); on a success the lock clears
  and you can open it. While it's locked, opening is blocked.
- **Open chest / loot pile:** once it's open, its **💰 Loot** shows the
  gold and items inside (each item has an **ⓘ** description). Click **Take** on an
  item, **Take N gp**, or **Take all**
  to move it onto your claimed character — items land in your **Inventory**, gold in
  your **gold purse** (shown on your sheet). A drained container reads **Looted**.
- **Looting a body:** defeated creatures can carry loot too — it appears the
  same way once the creature is **dead** and the DM reveals it.
- **Disarm a trap:** click **🔧 Disarm** to roll a **Dexterity (Sleight of Hand)
  check** against the trap's DC (rolled server-side; Sleight-of-Hand proficiency
  counts). On a success the trap flips to **Disarmed** in the shared log.

### Seeing the party & NPCs (player)

**Where:** left panel → **Party**.

- The **Party** section lists other players with their HP; expand a row to read
  their (read-only) sheet.
- For NPCs/monsters, what you see depends on the DM's
  [disposition](#disposition-what-players-see-dm) setting — full sheet for
  Friendly; name + conditions for Neutral and Enemy (the amber vs red dot tells
  you which is which). You can read
  and add to the shared **note** on any creature.

---

## Shared tools (both roles)

### Moving around the map

- **Zoom:** mouse **wheel** zooms toward the cursor (25%–1200%), the **−/+
  buttons** step it, and on a touchscreen **pinch with two fingers** to zoom.
- **Pan:** **click-drag empty canvas** (one finger on touch).
- **Fit:** the **Fit** button (bottom corner) resets to fit-the-window; the live
  zoom **%** is shown next to the zoom buttons.
- **Esc** cancels whatever mode you're in (placing, painting fog, measuring,
  setting scale, applying damage).

### Tokens at a glance

A token shows a lot without clicking:

- **HP bar** (where you're allowed to see it) — green > 50%, amber > 25%, red
  below; a cyan **+N** for temp HP; **💀** at 0 HP — or whenever the DM applies
  the **Dead** condition, which shows the skull even on enemies whose HP is
  hidden.
- **Floating damage/heal numbers:** every HP change pops a red **−X** or green
  **+X** that drifts up off the token — everyone sees it (hidden/fogged
  creatures never pop numbers for players).
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
  offers that attacker's **weapons and rollable abilities against the
  right-clicked token** — a clear header reads **"⚔️ Attacking as X → Y"**. (For
  players the attacker defaults to your own PC, or a selected friendly creature;
  for the DM, a selected monster's rollable **abilities** appear here too.)
  Attack-type abilities roll to-hit vs the target's AC and apply typed damage
  just like a weapon swing; save/damage abilities make the target roll and take
  it immediately; heals restore its HP. Right-clicking your **own** token offers
  your heals ("Casting as X → self").
- **DM admin** buttons (duplicate / hide / role badge / delete).

A right-click **never changes your selection**, so "select attacker → right-click
target" works cleanly.

### Dice & the roll log

**Where:** the **Dice** panel — DM: left panel; Player: right panel beneath the
combat console. Also on the DM Data dashboard.

- **Quick dice:** buttons for **d20 / d12 / d10 / d8 / d6 / d4 / d100**.
- **Custom roll:** type an expression like **`2d6+3`**, optionally a **label**,
  toggle **advantage/disadvantage**, and **Roll**.
- **Roll from chat:** type **`/roll 2d6+3`** (or **`/r`**, optionally ending in
  `adv`/`dis`) into the chat box — the result lands in the shared log right
  where the message would have gone.
- **Shared roll log:** every roll (and every automated attack/save) lands in one
  log everyone sees, color-coded by roller and roll type, showing the
  **individual die faces** (e.g. `2d6[3,4]`). Rolls that changed HP carry an
  **HP note** ("Druk HP 42→38" — DM always; players for PCs and
  friendly creatures). For players, enemy AC is redacted to `vs AC ?`
  while HIT/MISS stays visible. A cast spell's full description shows here. The
  DM can **Clear** the log.
- **Hide DM rolls (DM):** a **👁/🙈 DM rolls** toggle in the dice panel. While
  on, the DM's rolls stay out of the players' logs — damage still applies and
  the floating ±X still pops, so the table sees the *outcome* but not the dice
  (great for secret checks and fudge-free suspense).
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

### Drawing on the map

**Where:** the **✏️ / 🅰 buttons** in the map toolbar (everyone).

- **✏️ Freehand pen** — draw directly on the map (mark a route, circle a clue);
  pick a **color swatch** first. **🅰 Text** places a label where you click.
- Drawings are **shared and persistent** like measurements. **Clear mine**
  removes your own; the DM also gets **Clear all**.
- The DM's **scenery decals** (pasted images) live on this layer too, with a
  **🔒 Decals** lock and a **Clear decals** button — see
  [Pasting images](#pasting-images-object-tokens--scenery-decals-dm).

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
  The section header keeps a **soft count** for casters — "Cantrips 2/3 ·
  Prepared 5/6" (or *Known*, per your class) — turning red when you're over your
  class/level cap but never blocking; each leveled spell has a **✓ Prep** toggle
  so prepared casters can swap their list day to day. Every ability also shows
  an **action-economy icon** — **●** action, **⚡** bonus action, **↩** reaction
  (auto-detected, editable when you open the entry).
- **Items** — add gear by hand or from the **Library**, with quantity steppers,
  plus a **💰 gold** purse (filled automatically when you loot a chest).
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
| Select **and** open details | Double-click — or double-tap on touch (also opens the right drawer) |
| Open the action menu | Right-click (or long-press on touch) a token |
| Attack a target fast | Select attacker → right-click the target → pick a weapon |
| Delete selected tokens (DM) | **Delete** / **Backspace** |
| Cancel any mode | **Esc** (placing, fog, measure, scale, apply-damage) |
| Zoom | Mouse wheel (toward cursor) |
| Pan | Drag empty canvas |
| Reset view | **Fit** button |
| Roll a quick d20 | The on-map 🎲 button (bottom-right) or the Dice panel |
| Roll a custom expression | Dice panel → type `2d6+3` → **Roll** |
| Paste an image (DM) | Copy it anywhere → **Ctrl+V** over the map → Object or Scenery decal |
| Open the controls guide | **❔ Guide** in the top toolbar |

---

*Want the engineering view (architecture, invariants, how features are built)?
See **[CLAUDE.md](CLAUDE.md)**. Want the running backlog and per-feature status?
See **[ROADMAP.md](ROADMAP.md)**.*
