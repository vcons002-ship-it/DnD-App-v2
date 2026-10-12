# Measured spell targeting

Choose an area spell from Combat or the token's spell menu. Casting first opens
**Place spell area**. A translucent ground footprint and highlighted base centers
show the visible creatures it would affect. Circle/cylinder values are radii;
cube values are full side lengths; cone/line values are lengths. All distances
use the map's feet-per-square scale and work in overhead or rotated/tilted views.

Click to place a distant origin. For a cone or line from the caster, aim and
click to lock its direction. A distant line uses one click for its start and a
second to lock its direction. The Direction slider rotates cubes, cones and
lines. Undo placement removes the last piece. Escape or Cancel spends no slot.
Out-of-range or covered origins cannot be confirmed.

Confirm once to spend the normal casting resource and resolve supported initial
effects. The server determines occupants from their circular combat footprints, excludes
objects/dead creatures, deduplicates multiple tokens referring to one creature,
and checks Total Cover from each origin. Ordinary areas include allies. Spells
that permit chosen recipients show checkboxes and enforce their target limit.
Overlapping areas affect each creature once.

Damage is rolled once, retaining separate damage types. Saves then roll together
with each creature's tag/name and PASS/FAIL in the same display. The DM sees
creature bonuses and equations; players receive raw creature dice and outcomes
without those private statistics or DCs. Player-initiated PC rolls keep their
own bonuses. Creature attack/save totals, stat chips and HP bookkeeping also
stay out of player roll logs and result popups.
Advantage/disadvantage belongs to the appropriate creature. HP and effects commit
after the physical roll presentations finish. Individual log entries remain,
without replaying the saves one by one. Hidden creatures' save dice and identities
are filtered for each viewer. A player may place an origin only in their own
current vision and revealed map fog; a confirmed blast can still hit unseen
bystanders behind that origin when they have no Total Cover.

Ice Knife first resolves its Piercing attack, then nearby creatures make their
Dexterity saves together, then the shared Cold explosion damage is rolled.
The save results do not replay after the explosion. The same once-only result
presentation applies to single-target spell saves, hit riders and recurring
spell saves; their PASS/FAIL and supported effect explanation appear on the
live tray rather than on an additional result popup.

## Coverage and boundaries

Every catalogue spell tagged as an area spell uses this placement workflow,
except Hail of Thorns and Ice Knife (their bursts stay centered on the triggering
hit), and Compulsion/Chain Lightning (chosen individual creatures, not a footprint).
Untagged area utility spells and fields also receive measured templates, including
Alarm, image illusions, Daylight, Magic Circle, Plant Growth, protective fields,
the 2024 area conjurations, and terrain/weather effects.

Fire Storm places up to ten connected 10-foot cubes, snapping additional cubes
to the first cube's orientation. Corner contact does not count as a shared face.
Meteor Swarm supports four 40-foot-radius spheres. Self-range cubes such as
Thunderwave put the caster on the near face rather than the center. Call Lightning
places its 5-foot-radius strike and reuses the picker for later Magic actions
without spending another slot; cloud space/storm bonuses remain adjudicated.

The ground-plane templates use the standard straight wall footprint for wall
spells. Alternative ring/dome shapes, bent/stacked panels, heights and terrain
effects still need DM adjudication. Conjure Animals marks a 30-foot square ground
footprint (a 10-foot pack plus its 10-foot surrounding reach); moving its pack and
entry/turn triggers remain manual. Forbiddance defaults to a 200-foot square.

Ongoing/utility templates persist as ordinary removable measurements, preserving
their rotation and width. Emanations follow their caster. Templates are planning
aids, not automatically created movement/vision walls. Removing concentration
does not delete a measurement; use Measure's remove/clear controls. Recurring
entry, movement and turn effects are not inferred from a template. Spells with
supported appearance damage (such as Wall of Fire) resolve that initial effect,
then leave their ongoing triggers with the DM. Manual-only spells retain their
manual status instead of running an incomplete damage formula.

Authored abilities may supply `roll.area` with kind, sizeFt, widthFt, rangeFt,
self, excludeCaster, count, selective/maxTargets, ongoing and initialEffect.
Otherwise known spell names use the reviewed footprint registry. Unknown AoE
spells with an explicit printed dimension/shape receive a conservative parser
fallback; spells lacking dimensions keep manual targeting.

Footprints were checked against the official [SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf).
Ice Storm uses 2d10 Bludgeoning plus 4d6 Cold, with each pool independently halved
on a successful save and processed against that type's defenses before their
combined HP/concentration resolution.

## Verification

`server/src/areaSpells.test.ts` covers catalogue coverage, shapes and sizes,
Total Cover, invalid placements, overlapping areas, typed defenses on passing
and failing saves, save bonuses/advantage, selective healing, connected cubes,
and persistent rotated templates. Browser regressions cover cancellation without
slot spending, confirmation followed by automatic damage, and physical faces
matching the logged damage. Optional `linked-spells-video` captures exercise
the shapes with real server dice in a disposable campaign.

Area inclusion uses the occupied combat diameter (`Token.widthFt`), normally 5 feet for Small/Medium and 10 feet for Large creatures. Any overlap with the exact circle, cone, cube or line counts, including edges and end caps. Cosmetic miniature scaling does not change targeting. Self-origin cones and lines exclude their caster; non-self areas can affect the caster. Doorway clearance is unchanged. Splash damage, Pass without Trace and Spike Growth use the same footprint edge rule.

Lightning Bolt draws one jagged, flickering 100-foot bolt from the caster along the confirmed direction, at a waist-level 2½ feet above the map so it passes through smaller creatures in the tilted view. Its individual victims retain separate save/defense calculations and floating damage feedback. The bolt starts when the roll sequence completes or is skipped; an empty line still displays the cast.

Ice Storm displays one hail field over the entire confirmed 20-foot-radius area,
including empty space between creatures. Faceted ice falls, breaks into splinters,
and leaves a brief moving frost wash. The field uses instanced geometry and fewer
pieces on reduced effects settings. Separate Bludgeoning/Cold rolls, per-type
defenses, grouped saves and creature-specific damage numbers are unchanged;
individual damage events do not create duplicate storms.


## Area artwork audit (12 October 2026)

Area targeting support does not imply full-area artwork. This audit follows the
actual server effect dispatch and client geometry, not just a spell's AoE tag.

| Status | Spells | Current presentation |
| --- | --- | --- |
| Full confirmed area | Fireball, Lightning Bolt, Call Lightning, Ice Storm, Burning Hands, Cone of Cold, Thunderwave, Shatter, Flame Strike, Meteor Swarm | One authoritative effect fills the confirmed footprint, including empty space. |
| Persistent ground area | Spike Growth | Thorn field fills the placed radius while active. |
| Next damage-art updates | Acid Splash, Arms of Hadar, Circle of Death, Sunbeam, Fire Storm, Sunburst, Weird | Generic bursts or specialized individual-victim effects, rather than one confirmed cone, cube, line or disk. |
| Utility/control artwork still partial | Color Spray, Entangle, Faerie Fire, Grease, Sleep, Calm Emotions, Fear, Hypnotic Pattern, Slow, Confusion | Templates and/or individual status effects; no complete confirmed-area cast animation. |
| Other placed/ongoing areas | Wind Wall, Cloud of Daggers, fog/cloud spells, magical walls and other ongoing catalogue areas | Placement/measurement or specialized ongoing presentation; not a universal full-area art renderer. |

Hit-centered ranger splashes (Hail of Thorns and Lightning Arrow) already have
specialized arrows/impact art. They use a separate resolution path; they are not
part of the placed-area dispatcher above. Ice Knife now has one full 5-foot-radius cold explosion after its primary piercing hit or miss, with separate save and damage feedback.
Conjure Barrage/Volley also use arrow
art and still need a confirmed-footprint art review. Manual-only catalogue spells
retain their existing rule-support flags; artwork is not a rules automation claim.

Burning Hands now renders a single caster-origin flame cone that grows across
its 15-foot length and width. Folded, advected flame surfaces and flowing embers
cover the area between victims. The confirmed angle and map scale drive the
geometry; decorative token size and submitted non-self origin points do not.
Three draw calls and reduced ember counts keep the transient effect bounded.
Two-dimensional rendering has an aimed, expanding flame-cone fallback. Per-target
DEX saves, half damage, fire defenses, Total Cover, and roll completion/skip
presentation gating remain unchanged. Empty cones still display the cast.

Targeting previews disappear immediately on confirmation for the caster and DM.
The server still locks the confirmed geometry during saves and hidden-roll
approval, so late pointer packets cannot change a submitted cast. Persistent
measurements for ongoing spells are separate from the aiming preview. Burning
Hands starts lower, near arm level; its horizontal cone matches the map-space
preview even though elevated flames have perspective parallax in tilted views.

The next six damage-art updates use the confirmed combat footprint: Cone of Cold
spreads a frost front and crystals along its 60-foot aimed cone; Thunderwave
fills its oriented 15-foot cube with a pressure front; Shatter sends a resonant
shockwave across its 10-foot radius; Flame Strike descends as a mixed fire and
radiant column across its 10-foot cylinder. Meteor Swarm reuses Fireball’s
volumetric dome and folded flame crest with larger projectiles falling from
the sky into each selected 40-foot-radius area. Overlapping victims still
take damage only once. Empty areas still display their cast. Ice Knife uses
one splash field instead of repeated victim-sized bursts. Typed defenses,
grouped saves, hidden-roll approval and roll completion/skip timing are
unchanged. Shared geometry, bounded instancing and reduced particle counts
keep these cosmetic fields independent of the number of victims.
