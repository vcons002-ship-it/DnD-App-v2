# Dice physics reference

New rolls use the live server-authoritative world described in
[LIVE_DICE_PHYSICS.md](LIVE_DICE_PHYSICS.md). The server reads fixed face labels
from resting dice; clients interpolate streamed poses. The client worker remains
for older, already-resolved roll reveals and does not decide new outcomes.

## Physical scale and launch

The reference is a 16 mm acrylic d6, with density 1190 kg/m^3 (about 4.9 g for a
full cube). Convex hull volume determines each body's mass. Character skins share
this physical profile; the glass and obsidian artwork does not change mass.

Sources: [NIST standard gravity](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9), [Chessex 16 mm dice catalog](https://www.chessex.com/images/2019%20CAT06.pdf), [ACRYLITE block weight data](https://www.acrylite.co/resources/knowledge-base/article/what-is-the-weight-of-acrylite-r-block-acrylic?category=product-properties). Acrylic density is rounded from the published block weights and dimensions.

Cannon uses uniformly scaled lengths and grams for stable small-body contacts.
The tray grows with the dice pool; the reference die retains its physical size.
Dice enter together at a roughly 30-degree diagonal, with a 0.55-0.70 m/s release,
22-30 rad/s forward tumble and randomized twist. Rounded d6 collision hulls match
their artwork while retaining six broad, numbered faces.

## Current contact and timing profile

The values live in `shared/liveDicePhysics.ts`, `shared/diceLaunch.ts` and
`shared/liveDiceTypes.ts`:

| Setting | Value |
| --- | --- |
| Gravity | 0.9 x 9.80665 m/s^2 |
| Solver substep | 1/480 second |
| Server advance interval | 1/120 second |
| Stream frequency | Approximately 30 Hz |
| Client interpolation buffer | 80 ms |
| Presentation rate | 0.75 physics seconds per wall-clock second |
| Floor friction / restitution | 0.065 / 0.79 |
| Die-to-die friction / restitution | 0.09 / 0.76 |
| Wall friction / restitution | 0.045 / 0.88 |
| Linear / angular damping | 0.01 / 0.01 |

The modest gravity reduction and slower presentation cadence are intentional
readability adjustments. Contact coefficients are a consistent simulation
profile, not measurements of the illustrated tray materials. There is no custom
braking torque, forced group sleep or forced final resting position.

Only unreadable, stacked, escaped or overdue dice are rethrown live. The other
dice stay in the world. Faces flash and travel to their result boxes after the
pool settles; the completed rules action follows that reveal.
