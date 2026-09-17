# Revision 22 - persistent damage dice and modifier details

Development follow-up to `1cf5485`; not a production deployment.

## Cause and fix

Manual Damage entries and Magic Missile darts previously put only the final
amount in their text summary. Their animation payload already retained the
ordinary damage dice and modifiers, but both log surfaces rendered only text.

The full history and bottom activity overlay now share an explicit, wrapping
breakdown such as `Damage: 2d6 [3, 5] = 8 · STR +4 → 12 slashing`. It uses the
role-shaped server record, never client rolls, pending precomputed damage or
the attack's to-hit total. Critical dice, negative modifiers and anonymous
enemy bonuses are preserved. Compound spell expressions such as `1d4+1` keep
their embedded flat term exactly once. Plain checks, healing and generic dice
rolls are not incorrectly labeled as damage.

For existing history, the renderer falls back to the already-saved reveal.
Missing historical die faces are never invented; any unitemized difference is
labeled as such rather than guessed to be a particular feature or resistance.
Entries with no recorded breakdown retain their existing text summary.

## Forward rider accounting

Weapon mastery/stance dice, superiority dice and separately typed weapon riders
previously discarded their faces or merged them into aggregate modifiers. New
rolls retain those already-generated faces in an optional, log-only
`damageBreakdown` on the existing reveal/pending JSON. Flat feature bonuses,
typed resistance/vulnerability adjustments and minimum-damage adjustments are
itemized separately. Mixed-type totals are not labeled as only the secondary
animation damage type.

Existing RNG order, damage calculation, resource spending, manual damage guard,
HP application, and animation dice/modifier steps are unchanged. No database
column, migration or new automation is introduced. Saved pending hits without
the optional field still resolve using their existing data.

Enemy/neutral damage metadata is visibility-shaped: feature/item/stat names
are removed and modifiers remain anonymous. Hidden DM rolls stay hidden.
Unresolved pending damage is never rendered as a completed breakdown.

## Verification and deployment

- Client and server TypeScript checks passed; production client build passed.
- **597 unit tests across 63 files passed**, including 13 formatter cases and
  8 deterministic forward-data/confidentiality cases. Tests confirm the original
  RNG call order/count, unchanged animation steps, correct HP and resource use,
  persisted critical/pending detail and old pending-record compatibility.
- **97 browser tests passed**, including the four new full-log/overlay/reload,
  automatic-attack, targeted-spell and player-vs-DM confidentiality cases. The
  prior floating-damage timing regressions remain green.
- All regression fixtures use disposable databases, never the production
  campaign. Local Node 24.16 is outside the declared Node 20-22 range; no Node
  22 CI or performance/security benchmark is claimed.
- Actual browser screenshots of the full log and bottom overlay are under
  `preview-evidence/damage-roll-log-v22/`. One captured example is
  `Damage: 2d6 [3, 3] = 6 · STR +4 → 10 slashing`.

A final custom-label hardening replaces the formatter's object lookup with a
switch, preserving arbitrary feature names such as `constructor`. It is covered
by the final 597-test unit run; all four damage-log browser tests passed again
against the final rebuilt client (`index-CiTBOBw7.js`, `index-BESasgvq.css`).
The final repeat's screenshots are in `preview-evidence/damage-roll-log-v22-final/`.

The new client can display ordinary details from already-recorded reveals after
a development-preview refresh. Retaining previously discarded rider faces for
future rolls requires the updated backend as well. Historical discarded faces
cannot be recovered. No production restart, push, PR or merge occurred here.
