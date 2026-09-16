# Player HUD revision 7 — temporary HP placement

Preview-only refinement in `C:\Users\vcons\DnD-App-v2-player-preview`.

- Temporary HP moved out of the upper-right glass area to the **bottom-right
  of the orb artwork**, 10px from the right and 6px from the bottom, opposite
  the AC shield. Its 38px size, value, animation and click-to-edit behavior remain.
- Removed the ranger-specific upper placement; all three guardians use the
  same base-aligned placement.
- Raised the concentric symbol baseline by 16 logical pixels so its 26px editor
  buttons clear the temporary-HP button. Orb centers, radii and parallel gem
  levels are preserved. The custom shortcut uses the same baseline constant.
- No art, campaign data, rules, resource automation or DM layout changed.

Validation: client build and server/client typecheck passed; 12 focused geometry
tests and 6 targeted HUD/resource browser tests passed. Real campaign-copy QA
checks all three artworks at laptop/desktop sizes, including temp HP/main HP
clearance, direct click targets, and the existing circle-radius audit. Tests use
throwaway databases. Installed/preview services were not restarted.

Runtime captures: `preview-evidence/revision-7/*-map-through-corner.png` and
`layout-checks.json`. Refreshing the existing preview loads the new client.
