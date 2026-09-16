# Player HUD preview — 15 September 2026

> Historical preview record: the release state, defaults, and validation below describe
> the 15 September snapshot, not the current build. See [the 16 September release
> handoff](PLAYER_HUD_RELEASE_2026-09-16.md) for current defaults, reconciliation,
> validation, and release status.

## Release state

Implemented in **`C:\Users\vcons\DnD-App-v2-player-preview`**, on local branch
`claude/Dev`, based on the installed app's commit
`f9fb0cf474c27238e4e1830e788d8ed946200d13`.

**Not deployed, pushed, merged, or submitted as a PR.** The installed checkout,
Windows service, public tunnel, credentials, session codes and live campaign
storage have not been updated. Newer upstream Main/Dev commits were deliberately
not folded into this UI preview: doing so could bring unrelated DM/mechanical
changes. Reconcile upstream separately before any eventual release.

Changes are staged but **uncommitted**: this independent clone has no configured
Git author identity. No identity was invented and no global Git settings were
changed. That does not affect running/reviewing the built preview.

The review snapshot at `8507ded3` was useful audit evidence, not the codebase
installed beneath a live campaign. This implementation follows the later
gameplay-first scope, not the earlier replacement-interface/rules-engine ideas.

## Open the preview

- Player entry: **http://127.0.0.1:4276/join**. Use the campaign's usual code.
- The preview is **loopback-only** and uses `.preview-review/game.db` plus a copied
  uploads directory. There is no preview tunnel. Its player view explicitly
  labels itself a separate campaign copy.
- The isolated DM test credential is `local-preview-only`; it is **not** the
  live DM passphrase. The actual installed credential was not copied or changed.
- If the preview has stopped, build here, then run
  `powershell -NoProfile -ExecutionPolicy Bypass -File tools/start-player-preview.ps1`.
- **Never copy `.preview-review` or `.preview-data` back to production.** They contain test rolls,
  character claims, and manual-control exercises. This copy is for reviewing
  compatibility and visuals, not an import or replacement campaign.
- An earlier preview process at 127.0.0.1:4274 was left alone after tool policy
  blocked its restart. Use 4276 for the finished server code. Neither is the
  installed live server at port 4000.

## What changed

### Player interface

- Full map canvas; former left player sidebar replaced by a bottom-left corner
  HUD, attached action buttons, and expandable jewel resource rack.
- Three original, transparent PNG orb holders selected by race/class:
  Druk — Half-Orc Fighter/Battle Master; Vanec — Tiefling Sorcerer/Wild Magic;
  Varis — Half-Elf Ranger (no subclass currently recorded). All are level 6 in
  the most recently played campaign. Other combinations get a generic frame.
- Red HP sphere and separate cyan temporary-HP vessel, with animated liquid,
  glass highlights, caustics and bubbles. Numeric values remain explicit.
  Temporary HP has **no invented maximum**: its liquid indicates presence,
  while its number is authoritative; it is not mana or a percentage of max HP.
- Existing skill, save, HP/condition, inventory, spell and character actions are
  reused. Equipment modifiers still feed effective AC in the HUD.
- Top-right combat retains `SelectedTokenPanel`/`CombatSection`, including
  targeting, weapons, off-hand/two-handed controls, spells/upcasting, healing
  targets, advantage, maneuvers, masteries, stances and existing summons.
- Independent collapsible chat/log bottom-right. The existing composer stays
  visible; existing dice/settings controls expand above it. The original
  transparent log reappears when full chat is hidden, with a wider text lane.
- The original on-map dice picker is retained, moved player-only to top-left.
- Expanded character/inventory/spellbook/checks/party dialogs reuse the existing
  editors, with keyboard focus trapping and Escape dismissal. Routine combat
  does not require opening these dialogs.
- Styling is scoped under `.player-fantasy`. **DM sidebar layout, combat UI,
  controls and roll visuals remain unchanged.**

### All seven 3D dice

`d4`, `d6`, `d8`, `d10`, `d12`, `d20`, and `d100` are present. Percentile rolls
use separate ten-sided tens/ones dice; `00 + 0` represents 100.

These are actual convex polyhedral meshes, rotated, projected and lit on
Canvas2D, not seven flat icons or a d20 reused for everything. The d10 is a
pentagonal trapezohedron and the d12 a dodecahedron. Gold-inlaid faces fit the
player window styling. Small rolls receive larger dice; multi-die damage keeps
a compact row. They live inside the **existing** reveal popup and timeline.

The server's roll remains authoritative. Rendering never chooses a result,
spends resources, applies damage, or creates additional rolls. Existing
advantage resolution still supplies the chosen d20; this release does not add
new paired advantage-result data to the server protocol.

### Resources and save preservation

- Jewel clicks preserve the old remaining/used semantics. Click a row label to
  edit maximum and remaining independently. Raising maximum retains spent uses.
- Spell-slot capacity beyond the recognized **2024 class/level reference** has
  a gold rim and `+` crest, including when those slots are spent.
- No fixed custom-row limit. The rack scrolls and expands. A very large pool
  renders at most 24 jewels plus an explicit remaining-capacity/edit control;
  the saved maximum itself is not capped at 24.
- Existing `{max, used}` counters stay in place. Optional `maxOverride`
  metadata remembers explicit maximum edits. Ordinary sheet saves no longer
  silently re-derive counters just because unchanged level/class fields were
  included. Known custom legacy totals survive later level changes.
- Auto-spending preserves this optional metadata. No new spending, recovery,
  exhaustion, equipment enforcement, or concentration automation was added.
- A resource editor notices a newer server snapshot and asks to reload its
  values instead of applying a visibly stale correction. This is **not** a
  claim of transactional revision checks across all app actions.
- New recognized single-class characters default to 2024 spell-slot counts,
  including level-one Ranger/Paladin. Explicit supplied/saved counter maps win,
  even when empty. Unknown/multiclass/Pact Magic cases are labeled unconfirmed.
  [Official 2024 class reference](https://www.dndbeyond.com/sources/dnd/br-2024/character-classes).
- This is **not a full 2024 rules-engine/catalog conversion**. Existing spell
  text, class-resource names, preparation approximations and combat behavior
  remain as saved/implemented; the spellbook explicitly warns about mixed or
  custom rules. No new edition profile or character conversion is required.

### Reliability improvements

- Full `DATA_ROOT` isolation covers SQLite, uploads, settings, rulebook, secrets
  and backup outputs. Normal installation paths are unchanged. Unit tests
  refuse startup outside their disposable temporary root.
- Invalid Socket.IO roles are rejected; non-DM redaction and drag secrecy are
  restrictive by default. Character claim/edit/unlock/delete/resource operations
  check session membership. Resource edits still require ownership or DM role.
- The socket failure boundary catches rejected promises as well as synchronous
  exceptions. It does not replace the app's existing service recovery policy.
- Session export reports missing/over-capacity assets. Automatic backups write
  verified per-file checksums and a completion manifest; success timestamps and
  retention pruning occur only after a complete run. Partial and legacy
  unverified backup folders are retained. Review their disk usage manually.
- These remain **session exports**, not whole-install disaster-recovery backups.
  Shared libraries/settings and pending-reference import limitations still need
  the separate backup/restore work described below.

## Important action locations

| Existing action | Player location in this preview |
| --- | --- |
| Attack, spell, upcast, heal target, advantage | Top-right Combat |
| Mastery, maneuver, stance, summon | Same Combat controls / ability section |
| Manual versus automatic weapon damage | Existing DM setting; unchanged |
| HP, temp HP, conditions | Click HP orb, temp vessel, or HP & conditions |
| Spell slots, superiority dice, custom resources | Attached jewel rack; click label to correct values |
| Skill checks | Checks drawer; existing proficiency/advantage controls |
| Ability checks and saving throws | Checks drawer → Ability checks & saving throws, or full sheet |
| Inventory quantities/equipment/consumable use | Inventory window; existing item editor |
| Character stats, weapons, feats, import/export/library | Character window |
| Spell/ability editing and custom actions | Spellbook window |
| Party reference/change character | Party window |
| Place missing token | Attached HUD status strip |
| Quick dice | Existing top-left on-map picker, or expanded chat dice controls |
| Full chat and roll actions | Bottom-right Chat & roll log |
| Transparent chat/roll feed | Existing overlay when full chat is closed |

## Validation and evidence

All executable checks use isolated storage. The test harness opens the source
campaign using SQLite **read-only** mode and makes an online backup; it never
imports the app's database module against production.

- TypeScript checks and production build pass.
- **471 server/shared tests across 51 files pass.** Existing combat tests are
  included; new coverage includes override preservation, 2024 slot references,
  polyhedral topology, percentile convention, async errors and backup failures.
- **11 Playwright tests pass**: the original seven smoke tests plus role gates,
  resource ownership/session gates, laptop HUD/editor/refresh/all-dice checks,
  and reduced-motion/no-WebGL fallback.
- A newly made campaign copy passes cold startup with **zero changed tables**:
  14 tables and 1,766 rows compared by count and SHA-256 before/after startup.
  This check covers startup, not an assertion that gameplay never writes data.
- Actual campaign-copy browser walkthrough: all three race/class holders,
  1440×900 and 1366×768, inventory, spellbooks, chat, HP/temp-HP manual controls,
  extra slot capacity and every die. Each displayed die result is reconciled
  against the persisted server roll. No browser page errors were recorded.
- Current-machine validation uses Node **24.16.0** and installed Chrome.
  The repository's declared Node range is 20–22; Node 22 has **not** been
  separately validated in this pass. No dependency/runtime upgrade was made.

Local artifacts (ignored by Git because they include campaign content):

- `preview-evidence/browser-checks.json`
- `preview-evidence/startup-compatibility.json`
- `preview-evidence/druk-laptop.png`, `vanec-laptop.png`, `varis-laptop.png`
- `preview-evidence/druk-hp-and-temp-liquid.png`
- `preview-evidence/vanec-extra-slots.png`, `vanec-resource-editor.png`
- `preview-evidence/inventory-laptop.png`, `chat-laptop.png`
- `preview-evidence/dice-d4.png` through `dice-d100.png`

Orb rendering is independent of Konva, bounded to 384×384 per sphere and roughly
30 fps; dice use no WebGL contexts, stop repainting once settled, and pause in
hidden tabs. Reduced-motion/static fallbacks are implemented. No multiplayer
latency/load benchmark or broad low-end-laptop performance claim is made.

## Deliberately not bundled into this player release

- DM redesign and new resource/condition automation remain excluded. The later
  user-approved [revision 18 mechanics pass](PLAYER_HUD_REVISION_18_2026-09-16.md)
  corrects reviewed casting, save, healing and per-ray workflows without moving
  DM controls or rewriting saved definitions. Its notes supersede this original
  preview's blanket mechanics deferral and list the still-open spell work.
- Exhaustion, new concentration/death-state/rest automation, armor/attunement
  enforcement, replacement inventory/spell storage or mandatory edition rules.
- New player credentials/accounts or session links. Broader REST authorization,
  safe remote-image ingestion, and browser-identity trust remain security work;
  the changes here are **not** a comprehensive security hardening release.
- Full-snapshot protocol replacement, map/fog render-layer overhaul, action
  deduplication/revision protocol, versioned migrations, whole-install backup
  recovery and automated deployment/rollback. These need dedicated verification.
- Mobile-first layout and art for other race/class combinations.

## Production deployment gate

Review the actual preview with the players/DM first. Once deployment is explicitly
approved, choose a between-sessions window, preserve uncommitted installed files,
reconcile upstream code, take a verified whole-install backup, deploy reviewed
code/assets to the **same** installation, restart the **same** service, and check
both local and public health plus refresh/rejoin with the existing identities.
Do not run the current force-resetting updater blindly over local changes.

No campaign import, new campaign, new public server or credential change is
required by this implementation. A restart can still lose unsaved edits,
transient animation/selection, pending AI work and in-memory undo history.
Rollback must not restore an older database over newer play without a separate
recovery decision.

## Artwork provenance

The three holders were generated with the built-in image-generation tool,
inspected as transparent RGBA assets, and integrated into the runtime. Reusable
prompts are in `docs/player-hud-art-prompts.json`; outputs are in
`client/public/art/hud`. Liquid, jewels, dice and panel styling are code-native.
They are original dark-fantasy designs, not extracted Diablo assets.
