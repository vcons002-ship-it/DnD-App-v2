# Revision 19 - compact checks, consistent weapon intent and matching trim

Four follow-up fixes in the independent player-preview checkout, based on
`94dc2eb` from `claude/Main`. This is not a production update or a new PR.

## Changes

- Skills/Stats/Save drawer width is 244 logical CSS pixels instead of 300,
  about 207 screen pixels at the default 85% scale. Tighter columns and padding
  preserve full skill names, proficiency editing, advantage and the existing
  Stat/Save popup. The general narrow-screen drawer rule no longer widens it.
- The combat panel and right-click menu now share the selected attacker's
  two-handed and off-hand options. A versatile longsword shows and sends its
  d10 option in both places, reverting to d8 when 2H is switched off. These are
  transient client choices keyed by creature kind and ID, not saved character
  data. Different creatures do not inherit another attacker's options. The
  server still calculates damage, and manual damage remains a separate step.
- Player Interface settings is in the existing top toolbar's action flow.
  It no longer occupies the map zoom/Fit hit area. Its popup stays within the
  viewport and uses the UI scale once. Narrow-window dice/zoom lanes also keep
  their click targets clear. The DM toolbar and panel layout are unchanged.
- Resource trim follows the orb's existing race/class art selection: forged
  bronze/crimson for the half-orc fighter, natural gold/green leafwork for the
  half-elf ranger, and dark arcane gold/purple for the tiefling sorcerer. These
  are new transparent PNG assets made with the built-in image generator, not
  extra resource gems or recolored character artwork. Original assets and a
  neutral fallback remain. Ordinary and extended ten-ring racks use the same
  selected material. [Asset paths and complete prompts](RESOURCE_TRIM_ART_2026-09-17.md).

## Compatibility

No server code, database schema, campaign records, passwords, session codes,
resource counts, spell rules or spending behavior changed in this revision.
Orb liquid, temporary-HP effects, gem animation, resource ordering and arc
geometry are unchanged. The weapon fix uses the existing combat intent fields;
it adds no new combat automation. DM layout is untouched, while its shared
weapon controls receive the same consistency fix.

## Verification and evidence

Browser regressions use the Playwright configuration's disposable database on
port 4099, never the live campaign. Visual evidence is captured on a different
temporary server, using a read-only backup of the preview campaign. Its receipt
records source integrity and the exact working tree used for capture.

Evidence folder: `preview-evidence/player-followup-2026-09-17/` (ignored local
artifacts), with 15 actual app screenshots and `recording-receipt.json`.

- Client and server TypeScript checks pass; client production build passes.
- Server/shared tests: **565 passed across 60 files**.
- Full Chromium browser suite: **84 passed** in the final integration run,
  including all new compact-check, settings-placement and actual right-click
  attack regressions. The attack assertions verify authoritative d10/d8 damage,
  off-hand modifier handling, independent creatures and unchanged manual damage.
- Placement tests cover 1920, 1366, 860, 480 and 360 pixel viewports at 70%, 85%
  and 115% UI scale, including live pointer hit tests with dice choices open.
  DM map controls retain their original top-right location.
- Visual captures show all three normal resource racks and all three ten-ring
  fixtures. Their real transparent trim assets load correctly; visual review
  found no obvious breaks in the extended compositor. Orb/gem effects themselves
  were not changed; their existing animation regressions also pass.
- Source integrity: **14 table hashes / 1,766 rows unchanged**. Original
  character resources were captured before explicit disposable-copy fixture
  edits. Zero browser JavaScript errors; isolated capture backend stopped.
- Final client assets: `index-Bxpufma4.js` / `index-CWp6Duhf.css`.
- Local read-only screenshot viewer: `http://127.0.0.1:4286/`. It serves only an
  explicit evidence-file allowlist, not a campaign database or play session.

Validation used the machine's installed Node 24.16.0, outside this repository's
declared Node `>=20 <23` range. These passing local runs do not claim a supported
runtime change, Node 22 CI completion, security audit or performance benchmark.

## Deployment boundary

PR #66 was previously merged. The official production updater built that
release, but its service restart did not complete because the UAC request was
cancelled. This revision does not retry that restart, touch the production
campaign, or claim that the existing production/4276 backend reloaded.
