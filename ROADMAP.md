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
- ☑ **Carry tokens between maps [req].** "Bring tokens to this map" (PCs /
  Monsters / All); source map retains its tokens; HP/conditions carry via refs.

## Phase 2 follow-ups — token UX & permissions [req]

Smaller refinements on top of the shipped Phase 2 work.

- ☐ **Hover token menu [req].** Hovering a token shows a small floating menu with
  key info (name, HP where visible, conditions) for both DM and players;
  right-click / long-press opens the fuller editable menu.
- ☐ **Players cannot resize tokens [req].** Resize controls and the
  `token:resize` handler must be DM-only (players may still move tokens).
  Correction to current behavior where the size buttons show for everyone.
- ☐ **Initiative *order* on token [req].** The on-token badge shows turn ORDER
  (1, 2, 3 … from sorted initiative), not the raw d20. The side panel shows BOTH
  the roll value and the order.
- ☐ **Carry-tokens confirmation [req].** Brief toast confirming how many tokens
  were brought over between maps.

## Phase 3 — Fog of war & map masking

- ☐ Fog of war: DM toggle, paint/reveal brush, stored per map; monsters in fog
  default hidden.
- ☐ **DM region mask / "curtain" [req].** Separate from fog: let the DM hide a
  portion of a map so a large map appears smaller to players until they
  investigate, then reveal regions on demand. (Distinct mechanic from the
  paintable fog — think hard-cropped/blocked areas.)
- ☐ **Live tokens over Google Slides (stretch, if feasible) [req].** Overlay the
  interactive token layer on top of a linked Slides embed so tokens can be placed
  on Slides maps. Technically tricky (cross-origin iframe) — investigate an
  absolutely-positioned transparent canvas over the iframe.
- ☐ Explicit save/load of full map+token state for future sessions (reinforces
  the durability invariant).

## Phase 4 — Creature data & token art

- ☐ SRD/Open5e search (cached, offline) + Gemini fallback for custom creatures,
  auto-filling monster token info.
- ☐ **Spawn multiple monsters at once [req].** Create N copies in one action,
  **named sequentially** (e.g. Goblin 1..N), each an **independent token with its
  own HP/conditions** (no shared health). Before adding, check whether a
  same-named creature already exists and auto-increment the number so names never
  collide.
- ☐ **Copy creature (DM) [req].** Duplicate an existing monster into a new,
  fully independent creature (auto-incremented name, fresh HP/conditions).
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
