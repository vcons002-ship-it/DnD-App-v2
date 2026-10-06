# Invisibility, Spike Growth, Counterspell and Dispel Magic

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

## Dispel Magic

Click Dispel Magic in Combat, choose a visible creature, object or tracked Spike
Growth area within 120 feet, then confirm the casting. Spells with a recorded
casting level at or below the Dispel Magic slot end automatically. Each
higher-level spell requires its own spellcasting ability check against DC 10 plus
its casting level; proficiency is not added. Upcasting improves automatic removal.
The check uses the live dice tray with its ability, target and outcome labeled.
The cast spends a slot even if no tracked spell is found.

Cleanup uses the existing condition, summon and concentration paths. Removing
Haste applies lethargy; removing the last concentration recipient ends its source.
Removing one recipient of upcast Invisibility leaves the others intact. Merely
targeting a concentrating caster does not end a spell affecting someone elsewhere.
Witch Bolt links, Hunter's Mark/Hex targets, spectral weapons and provenance-tracked
summons are supported. Dispel targets the entire Spike Growth effect, not just the
part inside its visual wave. Damage already dealt is never undone.

Unknown legacy casting levels, untracked spells, homebrew/non-spell magic and
exceptions remain DM-managed, with a notice for tracked effects lacking their
casting level. Wall of Force, Forcecage and Antimagic Field are excluded. Existing
save data is not rewritten to invent casting levels. New compatible casts record
actual slot levels, including Pact Magic; explicit custom companions remain manual.

## Distinct animations

- Invisibility uses rising silver-violet arcs and motes with an eased body fade.
- Spike Growth raises a bounded, merged 3D bramble/thorn field across its 20-foot
  radius. The old flat glyphs remain as the fallback when no miniatures are used.
- Counterspell contracts and shatters a sigil around the interrupted caster.
- Dispel Magic sweeps cyan-white rings and motes through its selected effect.

Effects use existing world-space geometry lighting, visibility, reduced-motion
support and roll-completion timing. They draw above darkvision terrain while
retaining depth testing against figures. Geometry is reused; no model/image
requests or additional shadow-map lights are generated for these effects.

The opt-in `e2e/advanced-spells-video.spec.ts` records actual UI casting, movement
damage, Counterspell and both terrain and higher-level Dispel Magic in a disposable
campaign. It uses the NVIDIA AV1 recorder and highlighted pointer clicks.

Rules reference: [2024 Basic Rules spell descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions).

## Recorded demonstration

[Watch with chapters](https://dnd.nic024i.app/uploads/previews/advanced-spell-effects-20261006/index.html)

[Direct mobile MP4](https://dnd.nic024i.app/uploads/previews/advanced-spell-effects-20261006/spells.mp4)

The 99-second recording uses the real casting controls in a disposable campaign,
with 3D party models in regular darkness, highlighted clicks and live dice. The
chapter player and MP4 playback were verified on the public domain. Original
capture is RTX 5090 AV1 at 60 fps; the page serves H.264 for mobile compatibility.

Verification for this update: typecheck, client/server builds, 1,766 server tests,
10 targeted browser scenarios and the real-app recording scenario passed.

## Daylight ground-effect review and DM resin

[Daylight thorns and DM dice videos](https://dnd.nic024i.app/uploads/previews/daylight-thorns-resin-20261006/index.html)

Spike Growth was recorded in clear daylight from 45 degrees and overhead, with
actual movement damage. Use `DND_DAYLIGHT_THORNS=1` for that shorter recording.
The DM resin shader now passes more tray detail through the broad faces, keeps
grazing edges denser and preserves opaque gold numeral inlays. There is no new
central glow, physics change or change to player dice. The live DM tray recording
covers creature checks and general 2d6 rolls.

## Gem resin and thicker Spike Growth

[Updated ground field and DM dice videos](https://dnd.nic024i.app/uploads/previews/gem-dice-thorn-field-20261006/index.html)

The DM dice body now uses physically based transmission, refraction and purple
volume attenuation, replacing the alpha-overlay approach from the prior preview.
The closed body is merged into one mesh, with separate opaque gold numeral
inlays. The existing studio environment produces polished moving reflections;
its intensity is bounded to keep white reflections from overwhelming the purple.
This affects DM/NPC dice only and retains their existing physics and results.
Reference: [Three.js MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html).

Spike Growth increases from 145 to 260 stems and from 52 to 95 thicker branches,
with larger thorns. Forty-eight floating green light cores and soft halos use two
instanced meshes. They drift and pulse slowly across the area, freeze in reduced
motion and stay behind foreground figures through depth testing. Existing local
spell-light sampling follows representative motes; no extra shadow-map lights
are created. Instance buffers are released when the effect is removed. The video
shows daylight, overhead and regular darkness, plus movement damage.

## Clearer DM resin in the actual tray

[Updated DM resin rolls](https://dnd.nic024i.app/uploads/previews/dm-clear-resin-20261006/index.html)

The previous physical material still appeared solid because dense surface tint
and volume filtering suppressed the tray detail, while studio reflections filled
entire faces. The revised material keeps most color in its volume absorption and
reduces those reflections. Opaque, double-sided cutout gold inlays now participate
in the transmission render pass, allowing the far numerals to appear refracted
through the resin rather than being hidden by its front surface. Front numerals
retain their depth-tested gold surface. DM resin uses existing soft contact shadows
instead of opaque geometry shadows, which cannot transmit this material or respect
the custom numeral cutout shader.

Patterned-background diagnostics verified transmission, and the recorded real-app
browser scenario passed for creature d20 checks and general DM 2d6 rolls, with no
WebGL or shader errors. Player materials, critical gold dice and physics are unchanged.

Validation: typecheck, client build, all 1,766 server tests across 160 files,
and the live DM theme browser scenario passed. Public MP4 range delivery and
mobile-mode video playback were verified.
