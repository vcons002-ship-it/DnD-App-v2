# Roadmap & Feature Backlog

Phase 1 (MVP) is built. This file is the authoritative backlog for later phases.
Items tagged **[req]** come directly from the product owner's notes and must be
included. Status: ☐ todo · ◐ partially done · ☑ done.

## Cross-cutting invariants (must always hold)

- **Durable sessions [req].** Every session code, its game state (maps, tokens,
  token/board positions, HP, conditions, initiative), and a created/last-played
  **date** persist in local SQLite. Re-running `start.bat` (or restarting the
  server) any number of times must **never** reset state — loading a session by
  its code always restores the exact board. `data/` and `uploads/` are never
  wiped by start/build.
- **Session directory [req].** A locally-stored, browsable list of past session
  codes + names + dates (DM landing page and/or a `sessions.json`/DB view) so the
  DM can find and resume the right game.

## Phase 2 — Canvas UX, DM combat tooling, persistence polish

- ☐ **Map zoom & pan [req].** Mouse-wheel / pinch zoom and click-drag (or
  scroll) panning for large maps; keep **fit-to-window** as the default/reset
  view. (Fit-to-window ◐ already auto-scales in `MapStage.tsx`; zoom/pan is new.)
- ☐ **Collapsible *and* resizable side panels [req].** Drag-to-resize handles +
  collapse toggles on the DM and player control panels.
- ◐ **Direct click-to-place on creation [req].** Fixed: clicking **directly on
  the map image/grid** now places a pending unit (previously only the black
  letterbox area registered). Remaining: have creation drop straight into placing
  mode and allow placing several in a row, instead of first picking the unit in
  the side panel.
- ☐ **Delete token (DM) [req].** Remove a token from the map via floating menu /
  panel.
- ☐ **Death marker [req].** Show a skull / death overlay on any token at 0 HP.
- ☐ **Three concentric status rings [req].** Render buff (green), negative (red),
  and concentration (blue) as **separate concentric rings simultaneously** rather
  than one dominant color. Replaces `dominantAura()` in
  `client/src/lib/conditions.ts` + the single `Circle` in `TokenShape.tsx` with
  up to three nested rings (only the present categories shown).
- ☐ Initiative tracker polish, highlight active token, initiative badges.
- ☐ Multi-select tokens; map thumbnails in the switcher.
- ☐ Carry tokens between maps with status sync (both maps retain state).
- ☐ Session directory UI + dates (see invariants).

## Phase 3 — Fog of war & map masking

- ☐ Fog of war: DM toggle, paint/reveal brush, stored per map; monsters in fog
  default hidden.
- ☐ **DM region mask / "curtain" [req].** Separate from fog: let the DM hide a
  portion of a map so a large map appears smaller to players until they
  investigate, then reveal regions on demand. (Distinct mechanic from the
  paintable fog — think hard-cropped/blocked areas.)
- ☐ Explicit save/load of full map+token state for future sessions (reinforces
  the durability invariant).

## Phase 4 — Creature data & token art

- ☐ SRD/Open5e search (cached, offline) + Gemini fallback for custom creatures,
  auto-filling monster token info.
- ☐ **Spawn multiple monsters at once [req].** Create N copies in one action,
  **named sequentially** (e.g. Goblin 1..N), each an **independent token with its
  own HP/conditions** (no shared health).
- ☐ **Auto token icons [req].** Pull a creature icon/art based on name when
  created from the DB or via Gemini.
- ☐ **Custom icon upload + bulk apply [req].** Upload an image to use as a
  token's icon, and apply that icon to multiple selected tokens at once.

## Phase 5 — Player resources, items, Roll20, dice

- ☐ **Class-specific limited-use resources [req].** Track and update spell slots,
  second wind, superiority dice, sorcery points, etc. on the player token/panel.
- ☐ **Item / inventory tracking [req].** Let players track items on their
  character.
- ☐ Buff/nerf buttons with custom text (drive the green/red rings).
- ☐ Collapsible Roll20 `<iframe>` (DM roll logs; player character sheet).
- ☐ Optional in-app dice roller.

## Phase 6 — AI assistance (future)

- ☐ AI-assisted spell-effect resolution and rules/item lookup from current D&D
  rules.
- ☐ AI-generated enemy combat dialogue on hit/miss/target.
