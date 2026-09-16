# Player HUD revision 17 - per-resource placement preference

Player-only local preview. No changes to campaign counters, server resource
automation, campaign/session identifiers, DM controls or production deployment.

## Placement controls

- Character window > Resources now places a Show by orb checkbox on each
  custom resource row, beside the existing resource controls. It is not an
  all-or-nothing custom-resource switch.
- Each custom tracker is checked by default. Checked trackers fill available
  positions after spell slots and class resources, up to ten displayed rows.
  Unchecked trackers remain in Additional resources even when the rack has
  room. Compact and concentric layouts honor the same individual choices.
- Full accessible checkbox labels include the resource name. Class resources
  have no placement checkbox and retain priority. Existing geometry fallbacks
  for large/zero-capacity pools still apply in concentric mode.
- Preferences are browser-local, keyed by character id and exact custom
  resource name. A JSON list stores only the names assigned to overflow, under
  `dnd:player-custom-resource-overflow:v1:<character-id>`. No character schema
  migration or resource:set action is involved. Newly added names default on;
  browser storage failure leaves the current page usable.
- The shared DM/read-only sheets receive no presentation controls.

## Empty overflow

Previously the icon could open a No additional trackers message. Now the icon
and drawer are absent when there is no overflow. If the last overflow tracker
is removed or returns to the rack, the open drawer closes and its expanded
state resets; later overflow does not unexpectedly reopen it.

## Validation

- Client/server TypeScript checks and client build passed.
- 36 focused unit tests passed for display ordering, geometry and saved
  resource preservation.
- Preview assets: `index-BOlee7Kx.js` / `index-DwpAwxih.css`.
- Eight screenshots plus integrity receipt:
  `preview-evidence/current-character-resources-2026-09-16T17-54-11-787Z/`.
  The opt-in `--normal --resource-preferences` capture mode used a disposable
  backup on 4283. It unchecked only Cloak Spell Slot, kept AZUTH'S Knowledge
  inline, then restored the local preference. Rings changed 6 -> 5 -> 6 and
  overflow-icon counts 0 -> 1 -> 0. Source DB/WAL and saved counters unchanged;
  no seeded resources, no browser errors. Capture server stopped afterward.
- Root visually reviewed both the per-row checkboxes and the single-resource
  overflow capture; labels and individual placement match the requested model.
- All 19 focused Chromium tests passed in 46.2 seconds: independent custom
  selections in both layouts, reload and per-character isolation, resource
  editing while in overflow, counter preservation during preference changes,
  automatic empty-drawer closure, and absence of player toggles on the DM sheet.
  Existing HUD/gem/sigil/ten-ring regressions remain passing. Two test-only DM
  fixture selectors were corrected (spawn a selectable token; use right sidebar);
  no application changes were required by the test failures.
- Test/capture services 4099 and 4283 stopped; production4000 and preview4276
  retained their original processes. Only preview client assets were rebuilt.
