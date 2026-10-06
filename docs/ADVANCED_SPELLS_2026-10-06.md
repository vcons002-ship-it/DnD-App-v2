# Invisibility, Spike Growth and Counterspell

Implemented using the 2024 spell rules in the development branch. These profiles
adopt compatible catalog entries at execution time; explicit manual, custom or
incompatible roll formulas are preserved. No campaign-save rewrite is required.

## Invisibility

Choose a cast level, click Invisibility, select willing living creatures within
5 feet of the caster and confirm. A level-2 cast affects one creature; each higher
slot permits one additional recipient. Pact-slot selection uses its actual level.
Concentration lasts up to one hour. Each recipient becomes visible after making
an attack roll, dealing damage or casting a spell; other recipients remain
invisible. Losing concentration ends the remaining linked effects.

Party members and the DM see a translucent miniature. Hostile invisible creatures
are removed from player token/stat-block snapshots unless the viewer has an
active See Invisibility/Truesight condition or a matching blindsight/truesight
trait in range. Invisible enemies do not consume reveal tags merely by existing.
Sound, willingness and unusual senses still need DM adjudication.

## Spike Growth

Place and confirm its measured 20-foot-radius area within 150 feet. Its terrain
remains until concentration ends or ten minutes elapse. Casting does not damage
creatures already inside it. Accepted movement into or within the area rolls
2d4 Piercing for each five feet traveled; sub-five-foot moves accumulate per token.
Damage applies the target's Piercing defenses and uses the existing damage reveal
and concentration handling. Forced moves through the area count; Misty Step does
not. Wall-rejected movement does not count. Overlapping Spike Growth areas do not
double damage or difficult-terrain costs.

The drag preview shows both distance and doubled movement cost for travel inside
its area. Movement budgets remain soft, consistent with existing movement tools.
The DM adjudicates recognition of the camouflaged hazard; the visible template is
an interaction aid rather than automated Perception/Survival discovery.

## Counterspell

A perceptible spell cast pauses if an opposing creature with Counterspell can see
the caster within 60 feet and has a reaction and (for PCs) a slot available.
Eligible owners receive **Counterspell** slot buttons and **Pass**. The DM can
continue immediately; otherwise the cast continues after a 30-second reaction
window. Reaction offers honor walls, personal vision, painted fog and invisibility.

Counterspell spends the reactor's slot and reaction, then rolls the original
caster's CON save against the reactor's spell save DC. Failure interrupts the
spell without its effects or original slot expenditure. Success, pass or timeout
resumes the original cast with its original permissions and slot choice. The
window also covers Shield reactions, summon placement and post-hit spell options such as Divine
Smite. Interrupting a post-hit spell preserves the triggering weapon's damage.

Creature modifiers remain hidden from players; player-facing caster names use
reveal tags. Already-resolved offers cannot spend another slot. Nested
Counterspell chains and imperceptible casting beyond explicit Subtle/no-components
metadata remain table-managed. Non-spell features are not countered.

## Verification

Server regressions cover target limits, per-recipient visibility, concentration,
area clipping, short moves, defenses, overlapping areas, wall collision, teleport
exclusion, reaction slots, replay protection, original-owner continuation, Smite
and summon interruption. Browser regressions run against a disposable save and
exercise the real 3D ghost, movement damage and Counterspell reaction/save flow.
The installed campaign and its data are kept separate from these tests.

## Dispel Magic: proposed next step

Not implemented in this batch. It should target a creature, object or ongoing
magical effect within 120 feet. Spells at or below the Dispel Magic slot level end
automatically; higher-level spells each require a spellcasting-ability check
against DC 10 plus that spell's level, respecting explicit exceptions. Removing
an effect must use its existing cleanup path so conditions, areas, summons and
Haste lethargy remain consistent. The engine will need reliable spell/slot-level
provenance for active effects, without guessing levels for custom entries.
It must not undo damage already dealt or automatically erase non-spell magic.

Rules reference: [2024 Basic Rules spell descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions).
