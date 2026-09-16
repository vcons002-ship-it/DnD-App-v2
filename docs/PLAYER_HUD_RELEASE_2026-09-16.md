# Player HUD release candidate - 16 September 2026

This is the current summary for the player-interface PR. The preview and
revision 2-18 notes are historical design/validation records, not current
deployment instructions. This change is additive to the existing application;
it is not a new campaign, server, or save-import system.

## Default presentation

- Players enter the dark-fantasy gameplay layout directly, without a feature
  flag: bottom-left health orb and guardian art, left icon rail, independently
  resizable top-right Combat and bottom-right chat, and a bottom activity feed.
- Concentric resource arcs are the default for fresh browsers, missing/invalid
  stored modes, and Reset interface layout. An explicitly stored compact choice
  remains available. Default UI scale is 85 percent.
- The final female guardian assets are fighter-v9, ranger-v7 and tiefling-v6;
  resource-branch-v4 extends for six through ten occupied rings. The Cinzel font
  ships locally with its SIL OFL license. Earlier experimental PNGs are not
  runtime dependencies and are deliberately excluded from this PR.
- Spell/class resources take priority; custom resources fill the remaining ten
  rings unless individually assigned to overflow. Counts/maxima remain editable
  through existing server resource controls. Extra slot capacity is indicated
  visually, not enforced as a rules lock.
- Animated, translucent health liquid, a temporary-HP ward visible only while
  active (plus its finite depletion reaction), socketed glowing gems and
  spend/restore effects retain reduced-motion and renderer fallbacks.
- All seven die types and paired advantage/disadvantage sets use the existing
  reveal popup and server results; settled faces point toward the viewer.

## Reconciliation with Main

Reconciled against `claude/Main` at
`8507ded3f6033fe5526219128b48213062bb9d6a`, retaining its eight intervening commits.
The source branch is `claude/Dev`, following this repository's two-branch model.

- Preserve Main's initiative exclusions/turn-marker fixes, opt-in racial trait
  library and Savage Attacks critical die, and DM-only bulk disposition.
- Preserve per-entity map ADV/DIS and consumption for PCs, the DM and friendly
  creatures, integrating it with the responsive top-left player dice picker.
- Preserve roll-reveal IDs and damage-prompt timing while retaining both 3D
  advantage candidates and the player action dock outside map stacking contexts.
- Preserve overlays on Slides maps, suppress the transient feed when full chat
  is open, and avoid duplicating the player's damage prompt inside the map.
- Preserve the resource-maximum, session/ownership, async-error and backup
  reporting fixes already implemented in the player work.
- DM panel structure and placement remain as in current Main. Shared mechanics
  corrections apply to both roles; this is not a claim that no backend behavior
  changed.

## Compatibility and limits

No database schema change, campaign import, new session/passcode, or saved-spell
rewrite is required by this PR. Existing counters remain authoritative; the
2024 slot reference is guidance for recognized classes, not a conversion of
legacy characters. No new exhaustion, rest, duration, condition, mark or other
unapproved automation was added.

Reviewed spell fixes include save-only profiles, single/area target workflows,
success-save damage semantics, manual spell-hit damage, separate rays with one
slot per cast, Chromatic Orb choices and selected casting/healing corrections.
This is **not complete spell coverage**. Recurring/on-hit effects, additional
save-only profiles, multi-recipient healing and special riders remain in the
[revision 18 backlog](PLAYER_HUD_REVISION_18_2026-09-16.md#important-unfinished-spell-work).
Literal overlapping token bodies still select the topmost body; decorative
labels/HP bars no longer steal neighboring token clicks.

## Verification

Post-reconciliation local validation (Windows, Node 24.16.0):

- `npm run typecheck`: server and client pass.
- `npm test`: **565 tests across 60 files pass**, including the upstream
  initiative/racial-trait suites, six reconciliation tests, and the spell,
  ownership, resource-preservation and backup regressions.
- `npm run build`: client production bundle and server check pass.
- `npm run test:e2e` with the local installed Chrome override: **all 73 browser
  tests pass** in the final 1.7-minute full run. This includes fresh/default,
  reset and preserved compact preferences, all three final guardian assets,
  both image/Slides ADV/DIS presentations, separate companion/PC toggles,
  reveal-gated manual damage, resources, orbs, spells and token hit regions.
  Initial runs exposed old compact-layout/DM-anchor assumptions and new fixture
  mistakes; those assertions were corrected before the final successful run.
- Cold startup of a read-only backup of the preview campaign: **14 tables,
  1,766 rows, zero changed table hashes**, healthy isolated server.
- Package audit: runtime art/font/license and all imported modules included;
  campaign/test data and seven obsolete art intermediates excluded.

Unit and browser suites allocate temporary data roots, not live campaign data.
The compatibility tool opens its source read-only and starts only a SQLite
backup in a disposable directory. GitHub CI separately uses the repository's
supported Node 22 on Ubuntu with Playwright-installed Chromium; local Windows
results do not substitute for those PR checks. `PW_CHROMIUM` is now an optional
shared-config override, not a Windows-only requirement in a browser spec.

## Review and deployment boundary

The PR does not merge, restart the installed server, or deploy the application.
Production still requires an approved between-session rollout, a verified
whole-install backup/restore/rollback plan, a correct backend restart, health
checks, and existing-player refresh/rejoin checks.

Opening this repository's PR automatically adds a test launcher to Main; it is
not a deployment, but it advances the base. Recheck the base after opening.
The existing generic PR runner copies the installed `.env` and does not pin all
data paths. Do not assume that launcher is isolated if the copied environment
contains absolute `DB_PATH` or `DATA_ROOT` values. Use an explicitly isolated
preview/test configuration instead; this release has not run that launcher.

Campaign data, copied uploads, actual join codes, generated screenshots/videos,
test output and the local recovery stash are not part of the PR.
