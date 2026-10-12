# Weapon attack effects

Physical weapon hits now use a separate effect alongside any spell rider:

- Slashing: an upper-left to lower-right steel streak across the victim's body.
- Bludgeoning: a short contact flash, expanding impact, and scattered debris.
- Piercing melee: a pointed thrust that drives inward and retracts.
- Bows and crossbows: an arrow or bolt travels from the attacker into the target.
- Slings: a stone projectile.
- Thrown weapons: spinning handaxes, daggers, and hammers; point-first spears,
  javelins, tridents, and darts.
- Firearms: a short bullet tracer. Whips: a snapping lash. Natural attacks:
  three claw cuts or closing bite marks.

The server chooses a generic visual category from the weapon kind, damage type,
name, tags, and distance. A melee weapon with the thrown property uses its
projectile visual outside melee reach, while a nearby attack keeps its melee
impact. This selects visuals only; attack rules are unchanged. It sends no
weapon name, attack bonus, defenses, or other private
stats in that cosmetic event. Manual damage, live physical dice, automatic
attacks, Smite, and maneuver continuations keep their existing resolution flow.
Pending origin data is removed from snapshots. Hidden attackers produce a
local impact without exposing their projectile origin; hidden victims emit no
player feedback.

Effects start after the correlated damage roll finishes or is skipped. A ranged
hit has a 420 ms flight before its floating numbers and spell rider appear.
Hunter's Mark and other spell effects remain independent of the physical hit.
The effect follows the victim's displayed position and uses the existing
terrain-fog-safe effect pass and foreground model depth. Physical impacts add
no illumination or shadow calculations and reuse small shared meshes.

This is impact/projectile presentation; the model's arms are not re-rigged or
animated. Misses and manual HP edits do not create a weapon-hit effect.

Validation: client/server type checks, production build, 2,055 unit tests, and
six focused browser checks passed. Coverage includes both damage modes, ranged
arrival timing, overhead/tilted GPU rendering, hidden origins/victims, private
pending payloads, coexistence with spell riders, and existing Fireball/warmup
regressions.

Mobile video preview: https://dnd.nic024i.app/uploads/previews/weapon-attacks-20261012/index.html

The page includes controlled close-up replays and a separate real UI combat sequence captured with RTX 5090 AV1 NVENC at 60 fps. Phone playback uses H.264; the original AV1 capture is also linked. HTTP, range requests, and mobile layout/playback were verified.

## Visibility refinement

The sweep is wider with a dark contour for contrast against pale map art. Projectiles are 65% larger, with a thicker shaft and brighter metallic tip. Contact flashes, screen-facing impact rings, and debris are larger; the ordinary effect lasts 1.25 seconds (1.45 on a critical hit). The 420 ms projectile flight and damage timing remain unchanged. Depth testing and hidden-origin handling are retained, with no lights or shadows added.

Updated preview: https://dnd.nic024i.app/uploads/previews/weapon-attacks-visible-20261012/index.html

## Diagonal cuts and additional weapons

The cut now crosses the body diagonally, without rotating around the base.
Piercing has a separate pointed thrust. Thrown axes have a shaped metallic axe
head and tumble end over end; knives, hammers, spears and tridents have their own
silhouettes. Dart, firearm, whip, claw and bite effects complete the additional
weapon/natural-attack families. Shared geometry is not mutated per effect, so
simultaneous cuts retain independent animation timing.

New preview: https://dnd.nic024i.app/uploads/previews/weapon-attacks-expanded-20261012/index.html
