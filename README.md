# DnD App v2

A locally-hosted, real-time **virtual tabletop** for D&D. The DM and players
connect through **separate links** to one shared session and see role-specific
views over the same live map and tokens. The server runs on your PC and is
exposed to remote players over a **Cloudflare Tunnel**.

> Status: **Phase 2 complete** — on top of the Phase 1 core (sessions, remote
> map upload, DM staging, real-time token sync, damage, conditions, DM-vs-player
> visibility): map zoom/pan, collapsible+resizable panels, click-to-place,
> token deletion, death markers, three concentric status rings, an initiative
> tracker, multi-select, carry-tokens-between-maps, and a resume directory.
> See [`ROADMAP.md`](ROADMAP.md) for what's next.

## Easiest install (one click)

You don't need to know any commands. The installer checks for and installs
everything (Git, Node.js, cloudflared), downloads the app, and sets it up.

**Windows**

1. Download **`install.bat`** from this repo (open the file on GitHub → **Download raw file**) into your Downloads folder.
2. **Double-click `install.bat`** and approve the admin prompt. It installs the prerequisites, clones the app to `%USERPROFILE%\DnD-App-v2`, installs dependencies, and offers to launch.
3. After that, start the app any time by double-clicking **`start.bat`** in that folder (or `start-dev.bat` for local-only testing). Re-running `install.bat` updates to the latest version.

**macOS / Linux**

```bash
curl -fsSL -O https://raw.githubusercontent.com/vcons002-ship-it/DnD-App-v2/claude/app-concept-architecture-sJbvy/install.sh
bash install.sh
```

Prefer to do it by hand? Follow **Setup** and **Run** below.

## Stack

- **Client:** React + TypeScript + Vite, Konva (`react-konva`) for the map canvas
- **Server:** Node.js + Express + Socket.IO, SQLite (`better-sqlite3`)
- **Remote access:** `cloudflared` (Cloudflare Tunnel), tunnel-agnostic via `PUBLIC_URL`

## Requirements

- Node.js 20+ (developed on 22)
- [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
  for remote access (optional — the app still runs locally without it)

## Setup

```bash
npm install
cp .env.example .env   # adjust PORT / PUBLIC_URL / DM_PASSPHRASE if you like
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

The server prints the public links to share, e.g.:

```
DM:      https://<random>.trycloudflare.com/dm
Players: https://<random>.trycloudflare.com/join
```

Open the **DM** link, click **Create new session**, then share the **player
link** (the DM console has a "Copy player link" button with the join code baked
in). Players open it, enter the code, and claim a character.

## How it works

- **Server-authoritative:** all game state lives in SQLite on your PC. Clients
  send intents (move token, apply damage…); the server validates by role,
  persists, and broadcasts **role-shaped** snapshots. Players never receive
  hidden monsters or full monster stats — that filtering happens server-side
  (`server/src/visibility.ts`).
- **Map prep / staging:** the DM can upload and fully arrange any map (tokens,
  grid) without affecting players. Players only ever see the **active** map, and
  it only changes when the DM clicks **Make active**.
- **Remote upload:** the DM uploads maps through the browser; files are stored
  on the server's PC (`server/uploads/`). No filesystem access needed for anyone.

Local data (`server/data/`, `server/uploads/`) and `.env` are git-ignored.

## Configuration (`.env`)

| Key | Purpose |
| --- | --- |
| `PORT` | Local server port (default 4000) |
| `PUBLIC_URL` | Override the public base URL (named tunnel / other provider) |
| `CF_TUNNEL_NAME` | Use a pre-created Cloudflare named tunnel for a stable URL |
| `DM_PASSPHRASE` | Optional gate on the DM view |
| `GEMINI_API_KEY` | For AI creature creation (Phase 4) |

## Roadmap

See **[`ROADMAP.md`](ROADMAP.md)** for the detailed backlog (including requested
refinements like map zoom/pan, resizable panels, three concentric status rings,
multi-monster spawning with sequential names + per-token HP, token icons,
DM map-region masking, death markers, token deletion, a persistent session
directory, and player resource/item tracking).

- **Phase 1 (done):** core loop — maps, tokens, sync, damage, conditions, views
- **Phase 2 (done):** canvas zoom/pan, resizable panels, click-to-place, delete token, death markers, 3 status rings, initiative tracker, multi-select, carry-tokens, session directory
- **Phase 3:** fog of war + DM map-region masking + save/load
- **Phase 4:** SRD + Gemini creature lookup, multi-spawn, token icons
- **Phase 5:** player spell-slot/resource + item tracking, Roll20 embed, dice
- **Phase 6 (future):** AI spell resolution, rules lookup, enemy dialogue
