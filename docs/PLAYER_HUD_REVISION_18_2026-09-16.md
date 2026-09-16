# Revision 18 - spell execution and accurate token clicks

This is a tested mechanics pass in the independent player-preview clone, not a
production deployment. The DM panel layout, campaign/session identifiers,
passcodes, saved characters, and existing resource-spending policy are retained.
It is not a claim that every spell in the catalogue is fully implemented.

## Implemented

- Hold Person, Command, and Hypnotic Pattern gain missing saving-throw actions
  through runtime profiles. Base single-target spells resolve at the selected
  token; upcast/multiple-target spells expose the existing choose-targets flow.
  A save-only cast shows "Roll saving throws", not "0 damage".
- Area spells no longer require an enemy selected before casting. The damage
  roll is reused across recipients, with one save/application per target.
- Reviewed save spells distinguish no damage versus half damage on success.
  The editor exposes this choice, target workflow, and casting ability.
- Spell attacks honor the existing manual-damage setting. Critical hits double
  dice, not constants; resistance can reduce damage to zero.
- Scorching Ray and Eldritch Blast use separate target clicks and attack rolls.
  The server owns the remaining-attack budget. A pending hit finishes its
  normal damage step before another ray; one cast spends one spell slot.
  The initially armed advantage/disadvantage applies to the first attack only.
- Chromatic Orb has a visible per-cast damage-type selector in Combat, the
  context menu, and full-sheet cast controls. Choices are validated before
  resource spending. An explicit saved damage type remains authoritative.
- Recognized single-class casters use their casting ability; an explicit
  override is available. Ambiguous/multiclass entries retain the old fallback.
- Second Wind self-heals with its Fighter-level bonus for a single-class
  Fighter. Reviewed Heal, Regenerate, and Prayer of Healing formulas no longer
  receive an inappropriate spellcasting-modifier bonus. This corrects the
  initial amount, not their broader lifecycle or multi-recipient behavior.
- Spell execution now checks source session, caster ownership, target map and
  visibility. The ray counter rejects stale indexes, and completed single-target
  applications cannot be reused on another token.
- Decorative token names, HP bars, crowns, conditions, and selection rings do
  not intercept clicks. One hit region matches each actual token silhouette.
  Selection, dragging, hover, context menu, touch and measurement mode remain.
  Image tokens use a circular hit region while showing their missing/loading/
  failed-image fallback, changing to a rectangle only once the image is loaded.

## Compatibility and manual controls

Runtime profiles do not rewrite stored spell entries. Explicit authored fields,
custom-source entries and `executionProfile: 'manual'` take precedence. Removing
a roll is a real opt-out; simply opening a sheet never migrates it. Editing a
DC does not accidentally freeze a spell's base-level target mode for upcasts.
Intentional kind/save changes retain the displayed workflow defaults.

Spell slots and class resources still spend through the existing server paths,
including their existing soft warnings. No new exhaustion, rest, condition,
mark, duration or recurring-effect automation was introduced. The old direct
damage versions of Ensnaring Strike and Hunter's Mark are visibly described as
manual riders, not silently converted into stances or automatic effects.

Existing logs remain usable. New optional JSON fields describe only new casts
and explicit edits. No new database schema, campaign import, or credentials are
required. The DM layout is unchanged, but shared spell corrections apply to
both DM and player casts in this preview.

## Important unfinished spell work

1. **Triggered and recurring effects:** the saved ranger Ensnaring Strike and
   Hunter's Mark entries need explicit on-hit/follow-up controls. Repeated
   damage or saves should reference the original cast, not spend another slot.
   Their current damage buttons are not a complete lifecycle implementation.
2. **Multi-target healing:** Mass Healing Word, Mass Cure Wounds, Aid and Mass
   Heal require recipient selection, maximum-HP or shared-pool semantics.
   Correcting a healing formula alone does not resolve these workflows.
3. **Remaining save-only catalogue entries:** e.g. Charm Person, Slow and Fear
   need reviewed execution metadata. A player can author a save action now,
   but only the explicitly reviewed profiles above gain it automatically.
4. **Special riders and rules differences:** bouncing Chromatic Orb, exploding
   Sorcerous Burst dice, secondary weapon critical dice, and mixed-edition
   catalogue fields need focused tests/review. Saved definitions are not
   silently standardized or replaced.
5. **Manual adjudication retained:** conditions, repeated end-of-turn saves,
   duration, range, line of sight, actual area membership, and target limits.
   Upcast control spells currently offer a soft reusable recipient selector,
   not a hard class/rule-enforced target cap.

## Other previously identified work still open

| Priority | Area | Concrete remaining work |
| --- | --- | --- |
| High | Action/reconnect reliability | Server acknowledgements and pending/succeeded/rejected feedback; reconnect and stale-action tests; action IDs/revisions before changing the full-state protocol. |
| High | REST/import security | Finish authorization on shared library/rulebook routes; authorize before uploads; validate redirect destinations and streamed size/type limits for remote images. This pass is not comprehensive security hardening. |
| High | Recovery/deployment | Full-install backup including global libraries/settings/rulebook; restore drill, upstream reconciliation, rollback rehearsal and explicit production approval. Existing complete-backup reporting was already fixed. |
| Medium | Crowded-map performance | Measure realistic multiplayer/laptop cases; full snapshots, broad subscriptions, one large map/fog/token layer, image loading/caching and fog loops are still candidates. No general performance improvement is claimed here. |
| Medium | Literal token overlap | Body-accurate hit testing fixes nearby decorative overlap. Two token bodies occupying the same point still select the topmost one; a deliberate overlap chooser/cycle is a separate improvement. |
| Medium | Rules/equipment transparency | Clear 2014/2024/custom labels, spell-preparation guidance, equipped versus attuned distinction and visible AC/stat contributions; preserve soft warnings, not new enforcement. |
| Later | Visual/platform breadth | More guardian combinations and mobile-first layout; the current target remains laptop/desktop. |

## Validation

- Server/shared suite: **539 tests across 57 files pass**, including 25 new
  spell execution and socket-boundary tests in two files.
- Client and server TypeScript checks pass; client production build passes.
- **All 62 Chromium tests pass** in the final full integration run (1.5 minutes).
  This includes 5 new spell workflow tests and 10 new token hit-region tests,
  plus the existing HUD, resource, dice, orb, compact combat and DM layout tests.
  Earlier runs caught a test's wrong roll-label lookup and the image-token
  fallback fixture gap; both were corrected before the final successful run.
- Final preview assets: `index-Do-NsWxa.js` / `index-DwpAwxih.css`.
- Browser evidence (disposable test scenes, not live campaign play):
  `test-results/spell-execution-single-sav-da251-pendently-without-recasting-chromium/spell-save-and-damage-workflow.png`,
  `test-results/spell-execution-rays-roll--f71ae--without-another-slot-spend-chromium/separate-ray-attacks.png`,
  `test-results/spell-execution-Chromatic--6dfe3-serves-its-saved-definition-chromium/chromatic-orb-damage-choice.png`.
- A fresh read-only backup of the preview campaign passed cold startup with
  **14 tables / 1,766 rows / zero changed table hashes**. The source was not
  opened for writes. Receipt: `preview-evidence/startup-compatibility.json`.
- Browser fixtures use a fresh temporary database on 4099; body-hit tests mount
  the actual React-Konva component on a blank page. No production campaign is
  used for gameplay tests.

## Activation status - restart blocked

The built client files are ready, but the local preview backend is still the
previous process. A guarded restart attempt was rejected by the computer's
execution policy before it executed. Read-only verification afterward found
preview 4276 still on PID 25032 and production 4000 still on PID 5728.

Restart **only** the existing preview through
`tools/start-player-preview.ps1`, then refresh its browser. A browser refresh
alone is not sufficient for this revision's server-side changes. Production
has not been restarted or deployed; no commit or push was made. The validated
runtime behavior above is from the isolated test servers, not a claim that
the old running preview process has hot-loaded the new backend.

## Rules references

Reviewed against the official [2024 spell descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions)
and [2024 character classes](https://www.dndbeyond.com/sources/dnd/br-2024/character-classes).
These profiles fill specific execution gaps; they are not a full rules-engine
replacement or a conversion of the saved campaign.
