# DnD App v2

A locally-hosted, real-time **virtual tabletop** for D&D 5e. The DM and players
connect through **separate links** to one shared session and see role-specific
views over the same live map, tokens, and combat state. The server runs on your
PC and is exposed to remote players over a **Cloudflare Tunnel** (or any tunnel,
via `PUBLIC_URL`).

> **Status:** core VTT plus combat tooling, characters, creatures, and a DM
> second screen are all shipped. Done: durable sessions & resume directory,
> canvas zoom/pan + resizable panels (with **iPad pinch-zoom & touch**), fog of
> war (map + token-only modes), initiative tracker, **automated weapon attacks &
> saving throws**, a **dice roller with a shared, color-coded roll log** (with a
> **Hide-DM-rolls** toggle), full **character sheets** (skills,
> spells/abilities/masteries with **prepared-spell counters**, class resources,
> inventory + a **gold purse**, import/export, **claim-based ownership**),
> **SRD + AI (Gemini) creature creation**, a **cross-session creature/item
> library**, **non-combat objects** (traps, doors, **lootable chests & creature
> loot**, hidden items, player **pick-lock/open**), **paste-an-image** object
> tokens & **scenery decals**, **token shapes**, grid **match/offset/hide**
> tools, an in-app **❔ Guide**, a standalone **DM Data dashboard**, and an
> optional **free always-on cloud deployment** ([`deploy/`](deploy/README.md)).
> Up next is deeper AI assistance (spell resolution, rules lookup, enemy
> dialogue). See [`ROADMAP.md`](ROADMAP.md).

## Easiest install (one click)

You don't need to know any commands. The installer checks for and installs
everything (Git, Node.js, cloudflared), downloads the app, and sets it up.

**Windows**

1. Download **`install.bat`** from this repo (open the file on GitHub → **Download raw file**) into your Downloads folder.
2. **Double-click `install.bat`** and approve the admin prompt. It installs the prerequisites, clones the app to `%USERPROFILE%\DnD-App-v2`, installs dependencies, and offers to launch.
3. After that, start the app any time by double-clicking **`start.bat`** in that folder (or `start-dev.bat` for local-only testing). Re-running `install.bat` updates to the latest version.

**macOS / Linux**

```bash
curl -fsSL -O https://raw.githubusercontent.com/vcons002-ship-it/DnD-App-v2/claude/Main/install.sh
bash install.sh
```

The installer checks for and installs the prerequisites (Git, Node.js, and —
via Homebrew — cloudflared), clones the app to `~/DnD-App-v2`, installs
dependencies, and offers to launch. After that, start the app any time by
double-clicking **`start.command`** in that folder (or **`start-dev.command`**
for local-only testing). On macOS the first double-click may need
**right-click → Open** to clear Gatekeeper; from a terminal you can always run
`cd ~/DnD-App-v2 && npm start`. Re-running `install.sh` updates to the latest
version.

Prefer to do it by hand? Follow **Setup** and **Run** below.

## Features

**Maps & fog**
- Upload any image as a map; DM stages tokens, grid, and fog without players seeing it, then **Make active** to reveal.
- **Map scale & grid:** set the real-world scale by dragging a reference line; **match the grid to a printed map** (drag one square — sets size + origin and locks it), nudge its offset, **hide it**, or lock/unlock it.
- Fog of war per map: `off` / `map` / `tokens-only` modes, reveal/hide brush at 1×/3×/5×, and **Cover all** for a DM "curtain".
- **Draw on the map** (everyone): freehand pen + text labels in per-person colors, with Clear mine/all. The DM can also **paste images (Ctrl+V)** as **scenery decals** — cropped/background-cut in a preview, drawn under the tokens, draggable/resizable, and lockable click-through.
- Zoom toward the cursor (wheel), **−/+ zoom buttons** and two-finger **pinch-to-zoom** on touch, drag-to-pan, **Fit** to reset; resizable/collapsible side panels with **drag-reorderable sections** (tap ▲/▼ on touch), remembered per session — tuned for **tablet/iPad** use.

**Tokens**
- Click-to-place (stays active for dropping several), multi-select with group drag, duplicate, delete, per-token hide-from-players.
- **Token shapes** (circle / square / diamond / triangle / image — pasted art draws unclipped) and a real-feet **size** control (typed half-foot entry or −/+ steps); pasting an image can also drop it straight in as an **object token**.
- Three concentric **status rings** (buff / negative / concentration), 💀 death marker at 0 HP (or via the DM's **Dead** condition), **floating −X/+X damage & heal numbers** on every HP change, combat-role badge (⚔️ / 🏹 / ✨), initiative-order badge, hover card, and a right-click / long-press floating action menu.
- Players can place and move their own claimed token **and friendly creatures** (companions/summons); enemies, objects, and resizing are DM-only.

**Non-combat objects & loot**
- Place **traps, doors, chests, and hidden items** as map objects (DM "Object type" picker): reveal/hide from players and toggle state chips (Locked / Open / Disarmed / Looted / Triggered…) that show on the hover card.
- **Lootable chests:** the DM stocks a chest with **gold + items** (each with an ⓘ description, typed in, from the library, or **AI-generated from a prompt**); contents stay hidden from players until it's opened, then a player **Takes** them into their inventory and a per-character **gold purse**.
- **Creature loot:** the DM can stock loot on **any creature** too — players can take it only once it's **dead** and the DM flips **Loot revealed**.
- **Locked doors & chests:** players get **Pick lock / Open / Close** buttons — picking rolls a server-side DEX (Sleight of Hand) check against the object's DC; the DM can force-unlock.
- **Trap mechanics:** the DM authors a save/attack effect on a trap and fires it with a **⚡ Trigger** button (resolves through the roll log's Apply-damage flow); players attempt a **🔧 Disarm** check (server-rolled) against the trap's DC.

**Combat**
- **Initiative tracker:** roll-all (d20), roll-missing, Next (wraps), **End combat**; active turn highlighted on the board and in the panel. A **round counter** (DM-editable) ticks on each wrap; objects (chests/doors/traps) sit out of initiative, and **dead creatures keep their slot but are skipped** (downed PCs still take their death-save turn).
- **Automated weapon attacks**, **saving throws**, and **heals that apply on cast** (Heal-target dropdown, casting mod added) resolve from stat blocks (`shared/combatMath.ts`); every HP change is floated over the token and noted in the log ("Druk HP 42→38").
- **Dice roller** with a **shared roll log** visible to everyone — quick dice, custom expressions (`2d6+3`) or **`/roll 2d6+3` typed in chat**, advantage/disadvantage, per-die faces, a **Clear** button, and color-coding by roller and by roll type (attacks / saves / plain rolls). A DM **Hide DM rolls** toggle keeps the DM's rolls out of player logs (damage still applies).
- Buff/nerf buttons with custom text drive the green/red status rings.

**Characters**
- Players claim a character (re-claimed automatically after a page reload), then view and edit their own sheet and see the party / friendly sheets.
- **Claim-based ownership:** a character is locked to others only while someone is actively playing it. On a disconnect it's held through a short grace window (so a blip doesn't free it), then released for anyone to claim; when a player rejoins they're handed back the character they last had if it's still free. The DM can 🔓 force-unlock a stuck claim as a fallback.
- 18 skills with proficiency + computed bonuses, class-specific limited-use resources (`server/data/classTables.ts`), and item/inventory tracking.
- **Prepared/known + cantrip counters** on the spell list (soft caps from class/level — shown red when over, never blocking) with a ✓ Prep toggle per spell, and **action-economy icons** (● action / ⚡ bonus / ↩ reaction) on every ability.
- Robust **import/export** of a character sheet (`shared/sheetIO.ts`), with overwrite preview/confirm.

**Creatures & art**
- Offline **SRD** creature search (curated subset) with a **Gemini** AI fallback for anything else, plus AI back-fill of missing stat-block fields and AI character creation from a description.
- Full editable stat blocks (AC, speed, traits, weapons + a rollable **Spells & Abilities** section shared with PCs — free-text actions convert automatically), reusable one-click spawn templates, multi-spawn with sequential names, disposition (**friendly / neutral / enemy**) controlling what players see — friendly shows the full sheet; neutral and enemy show only name + conditions (the dot color marks intent).
- Auto emoji icons by name/type + custom icon upload with bulk apply.
- **Cross-session library** of custom/AI creatures and items for reuse across games.

**DM second screen & shell**
- `/dm/data` — a standalone **DM Data dashboard** (compact stat cards, large expand overlay, status popovers) for a second monitor or tablet, with a **map switcher** (view/preview any map, **Make active**, auto-follows the live map) and a **collapsible/resizable** roll-log panel.
- Shared top toolbar, copy-player-link with the join code baked in, an **❔ Guide** button (desktop & mobile control reference for both roles), a required **DM secret** gate, editable map & session names, and a persistent resume directory on the DM landing screen (players join by shared link/code and auto-rejoin).

## Stack

- **Client:** React + TypeScript + Vite, Konva (`react-konva`) for the map canvas, Zustand for state, Socket.IO client.
- **Server:** Node.js + Express + Socket.IO, SQLite (`better-sqlite3`).
- **Shared:** pure, unit-tested game logic in `shared/` (dice, combat math, skills, sheet import/export) used by both sides.
- **Remote access:** `cloudflared` (Cloudflare Tunnel), tunnel-agnostic via `PUBLIC_URL`.
- **AI:** Google Gemini (Generative Language API) for creature/character generation — entirely optional.

## Requirements

Only the **host** (the person running the server) needs the things below.
Players just need a modern browser and the join link — no install on their end.

This is a lightweight Node.js app: at rest the server is a small process with a
local SQLite file, sized for **one table** (a DM plus a typical party of up to
~6–8 players). The heaviest moment is the **one-time install/build**
(`npm install` + the Vite client build), which drives the RAM/CPU figures more
than gameplay does.

### Hardware (host PC)

| Resource | Minimum | Recommended |
| --- | --- | --- |
| **CPU** | 64-bit dual-core (x86-64 or ARM64) | Modern quad-core, 2 GHz+ |
| **RAM** | 4 GB system (≈2 GB free during the build) | 8 GB+ |
| **Free disk** | 2 GB (app + `node_modules`) | 5 GB+ (room for uploaded map images) |
| **GPU** | None — the server is headless | None (the map canvas renders in each *player's* browser, not on the host) |
| **Network** | Stable broadband; ~5 Mbps upload for remote play | 20+ Mbps upload, wired Ethernet. LAN-only play needs no internet at all |

Map/icon uploads are stored on the host's disk, so plan extra space if you
upload many high-resolution maps. Remote players reach you through a Cloudflare
Tunnel, so your **upload** speed (and a stable connection) matters more than
download.

### Supported operating systems

All require a **64-bit** OS — there are no 32-bit builds of the native SQLite
module.

- **Windows:** Windows 10 (64-bit) or Windows 11. The one-click `install.bat`
  uses `winget` (ships with current Windows; otherwise update *App Installer*
  from the Microsoft Store). Windows Server 2019+ also works.
- **macOS:** macOS 11 Big Sur or later. **Apple Silicon (M1/M2/M3…) and Intel**
  are both supported. [Homebrew](https://brew.sh) is recommended so `install.sh`
  can fetch the prerequisites automatically.
- **Linux:** a 64-bit `glibc` distribution — Ubuntu 20.04+, Debian 11+, Fedora
  36+, or similar (glibc ≥ 2.28). `install.sh` auto-installs via `apt` where
  available; on other distros install Git + Node yourself first. *Alpine/musl*
  works but needs the build toolchain below (no prebuilt SQLite binary).
- **ARM single-board computers (e.g. Raspberry Pi):** a Pi 4 / Pi 5 (or similar)
  running a **64-bit (arm64)** OS with ≥4 GB RAM is fine. 32-bit OSes and older
  boards are **not** recommended (no prebuilt native binaries, and Node 20+
  dropped much 32-bit support).

### Software prerequisites

The `install.bat` / `install.sh` scripts install these for you; you can also add
them by hand:

- **Node.js 20 LTS minimum** (developed and tested on **22 LTS** — recommended),
  which includes `npm`.
- **Git** — used to clone and later update the app.
- **[`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)**
  — optional, only for exposing the game to remote players over a tunnel. The
  app runs fully on your LAN without it.
- **A Gemini API key** — optional, only for AI creature/character generation.
  SRD search, combat, sheets, and everything else work offline without a key.
- **A C/C++ build toolchain** — *normally not needed.* `better-sqlite3` ships
  prebuilt binaries for the common platforms above. Only if you're on an
  unsupported target (Alpine/musl, BSD, an exotic arch) will npm compile it from
  source, which then needs Python 3 + `make` + a compiler (GCC/Clang, or the
  *Visual Studio Build Tools* on Windows).

Each connected device (the DM and every player) should use a current
**Chrome, Edge, Firefox, or Safari**; the interactive map uses HTML5 canvas
(Konva), so a very old browser may struggle.

## Setup

```bash
npm install
cp .env.example .env   # adjust PORT / PUBLIC_URL / DM_PASSPHRASE / GEMINI_API_KEY if you like
```

## Run

Development (hot reload, local only — no tunnel):

```bash
npm run dev
# client: http://localhost:5173   server: http://localhost:4000
```

Production / game night (builds the client, serves it, opens a tunnel):

```bash
npm start
```

The server prints the public links to share **and the DM secret**, e.g.:

```
DM:      https://<random>.trycloudflare.com/dm
Players: https://<random>.trycloudflare.com/join
──────────────────────────────────────────────
DM secret:  K7QF9MPT2X
            Enter this on the DM screen to log in.
            (Saved in server/data/dm-secret.txt — keep it private.)
Players just need the session code — no secret.
```

**DM login:** open the **DM** link and enter the **DM secret** from the server
console (or `server/data/dm-secret.txt`). It's required for every DM action and
is generated automatically on first run — set `DM_PASSPHRASE` in `.env` to pick
your own instead. Then click **Create new session**.

**Players link in** with just the **player link** (the DM console has a "Copy
player link" button with the join code baked in) — no secret needed. They open
it, enter the code, and claim a character; returning players auto-rejoin. The DM
can also open **`/dm/data`** on a second screen (enter the DM secret there too)
for the at-a-glance combat dashboard.

Other useful scripts:

```bash
npm run typecheck   # type-check server + client
npm test            # run the server/shared unit tests (vitest)
```

### Run it 24/7 on your PC (Windows service)

To keep the app reachable without leaving a console window open, install the
server as a Windows service: right-click **`install-service.bat`** →
**Run as administrator**. It registers a `DnDServer` service that starts on boot
and auto-restarts on a crash (logs in `server\data\service.log`). Pair it with a
stable tunnel (a Cloudflare **named/token tunnel** via `CF_TUNNEL_TOKEN` +
`PUBLIC_URL`, or your own `PUBLIC_URL`) so your links never change.

Once the service is installed: don't use `start.bat` (they'd fight over the
port — `start.bat` now detects the service and no-ops), and running
`install.bat` to update rebuilds the client and restarts the service for you.
Manage it with `tools\nssm.exe stop|start|restart DnDServer`.

## Always-on cloud hosting (optional, free)

Instead of running the server on your PC behind a per-restart tunnel URL, you
can host the app 24/7 on a **free Google Cloud `e2-micro` VM** with **one
permanent HTTPS link** (e.g. `https://yourname.duckdns.org/join?code=TAVERN`)
that players bookmark once — reachable even when your PC is off, at ~$0/month.

**[`deploy/README.md`](deploy/README.md)** is a complete beginner walkthrough
(direct links + copy-paste steps: Google Cloud VM → free DuckDNS address →
one-script install → automatic HTTPS via Caddy). It's purely additive — the
local `start.bat` / quick-tunnel workflow keeps working unchanged.

## Testing a pull request (Windows)

When a PR is opened, a matching **`PR #<N> - <Title>.bat`** launcher is added to
`claude/Main`, so you can try a proposed change without disturbing your real
game:

1. Double-click **`install.bat`** — this updates your main install to the latest
   approved `claude/Main` and pulls in the new `PR #<N> - <Title>.bat` launcher.
2. Double-click **`PR #<N> - <Title>.bat`**. It checks the PR's branch out into a
   **separate folder** (`%USERPROFILE%\DnD-App-v2-pr-<N>`), runs it on its **own
   port** (`4100 + N`) with its **own save data**, and opens the DM + player
   views. Your main install and its game data are never touched.
3. **Close** the `PR# TEST` server window to stop testing. `start.bat` always
   runs the approved `claude/Main` code — never a PR build.

Several PRs can be tested at once: each has its own launcher, folder, and port.

**Cleanup is automatic.** When a PR is merged or closed, a GitHub Action removes
its launcher from `claude/Main`; the next `install.bat` deletes the local
launcher (it's pulled away) **and** its throwaway test folder. If you double-click
a launcher whose PR has already merged, it just cleans up its folder and exits
instead of testing.

## How it works

- **Server-authoritative:** all game state lives in SQLite on your PC. Clients
  send intents (move token, apply damage, attack…); the server validates by role,
  persists, and broadcasts **role-shaped** snapshots. Players never receive
  hidden monsters or full monster stats — that filtering happens server-side
  (`server/src/visibility.ts`).
- **Map prep / staging:** the DM can upload and fully arrange any map (tokens,
  grid, fog) without affecting players. Players only ever see the **active** map,
  and it only changes when the DM clicks **Make active**.
- **Remote upload:** the DM uploads maps and icons through the browser; files are
  stored on the server's PC (`server/uploads/`). No filesystem access needed for
  anyone.
- **Durable by default:** sessions, maps, tokens, HP, conditions, initiative, fog,
  and the roll log persist across restarts. Schema changes use idempotent
  migrations so old saves keep working.

Local data (`server/data/`, `server/uploads/`) and `.env` are git-ignored.

## Configuration (`.env`)

| Key | Purpose |
| --- | --- |
| `PORT` | Local server port (default 4000) |
| `PUBLIC_URL` | Override the public base URL (named tunnel / other provider) |
| `CF_TUNNEL_NAME` | Use a pre-created Cloudflare named tunnel for a stable URL |
| `DM_PASSPHRASE` | DM login secret. Optional to set — if blank, one is generated on first run and saved to `server/data/dm-secret.txt` (printed at startup). A secret is always required to act as DM. |
| `GEMINI_API_KEY` | Optional — enables AI creature/character generation |
| `GEMINI_MODEL` | Optional — pin a Gemini model (blank auto-picks a current one) |

## Roadmap

See **[`ROADMAP.md`](ROADMAP.md)** for the detailed, authoritative backlog and the
per-feature status. High-level status:

- **Phase 1–2 (done):** core loop — maps, tokens, sync, damage, conditions, views; canvas zoom/pan, resizable panels, click-to-place, delete token, death markers, 3 status rings, initiative tracker, multi-select, carry-tokens, session directory.
- **Phase 3 (done):** fog of war (map + token-only modes, reveal/hide brush, cover-all curtain), per-token hide-from-players, DM-only token resize, initiative-order badges.
- **Phase 4 (done):** SRD creature search + Gemini fallback, full stat blocks, reusable spawn templates, multi-spawn with sequential names, duplicate-token, auto + custom token icons.
- **Phase 5 / 5a (done):** character sheets with skills, disposition, editable NPC stats, AI back-fill; class resources, inventory, sheet import/export; cross-session creature/item library; Roll20 embed; dice roller + shared roll log; automated weapon attacks & saving throws.
- **Phase 7 (done):** DM Data second-screen dashboard (map switcher + collapsible roll log) and shared top toolbar.
- **Recent (done):** non-combat **objects** (traps/doors/chests/items) with **lootable chests + a gold purse**, **trap trigger/disarm**, player **pick-lock/open**, and **creature loot**; structured AI actions + **AI-generated items**; **player-landing session list**; **iPad/touch polish** (pinch-zoom, on-screen zoom buttons, touch resize, hold-to-open menu); **token shapes & paste-an-image** (object tokens / scenery decals); grid **match/offset/hide/lock**; **hide-DM-rolls**; **prepared-spell counters + action icons**; durable **character ownership**; the **❔ Guide**; and a free **cloud deployment kit** (`deploy/`).
- **Phase 6 (future):** AI-assisted spell-effect resolution, rules/item lookup, and AI-generated enemy combat dialogue.
- **Phase 7 (future):** Discord voice/video integration.

## License & attribution

The **code** in this repository is released under the [MIT License](LICENSE) —
Copyright (c) 2026 vcons002. See [`FEATURES.md`](FEATURES.md) for a full,
plain-language tour of what the app can do.

**Game content (SRD).** The bundled creature, spell, weapon, weapon-mastery,
maneuver, and item data is derived from the Dungeons & Dragons **System
Reference Document (SRD)**, used under the Creative Commons Attribution 4.0
International License (CC-BY-4.0). It contains **no** text from the proprietary
Player's Handbook, Dungeon Master's Guide, or Monster Manual, and this project
is **not** affiliated with, endorsed, or sponsored by Wizards of the Coast.

> This work includes material from the System Reference Document 5.1 ("SRD 5.1")
> and the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC,
> available at <https://dnd.wizards.com/resources/systems-reference-document> and
> licensed under the Creative Commons Attribution 4.0 International License,
> available at <https://creativecommons.org/licenses/by/4.0/legalcode>.

The optional Google Gemini AI integration is provided by Google and subject to
Google's terms; it is entirely optional, and the app runs fully offline (SRD
search and all core features) without an API key.

