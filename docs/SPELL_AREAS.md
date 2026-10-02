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
effects. The server determines occupants from their base centers, excludes
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
