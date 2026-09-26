# Dice physics reference

The simulation uses standard Earth gravity (9.80665 m/s^2), a 16 mm acrylic d6 reference, and acrylic density 1190 kg/m^3. Convex mesh volume determines mass: a full 16 mm cube is 4.87424 g. All character skins use this acrylic physical profile; the obsidian/glass appearance does not imply stone/glass mass.

Sources: [NIST standard gravity](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9), [Chessex 16 mm dice catalog](https://www.chessex.com/images/2019%20CAT06.pdf), [ACRYLITE block weight data](https://www.acrylite.co/resources/knowledge-base/article/what-is-the-weight-of-acrylite-r-block-acrylic?category=product-properties). Acrylic density is rounded from the published block weights and dimensions.

Cannon uses uniformly scaled length units and grams to improve numerical conditioning of small rigid bodies. Gravity and launch velocity are converted by the same length scale. Thus changing display scale does not change physical gravity, die dimensions, or density. The responsive tray grows with larger pools, keeping the physical reference die size fixed. Other polyhedra use the same circumscribed radius, with mass calculated from their own volume.

The launch is an input: 1.2-1.5 m/s horizontally from 4-5 cm above the floor, with varied heading and spin. Integration is at 480 Hz; playback uses real elapsed seconds, without slow motion or artificial air damping. Collisions include friction, restitution, and contact-load-dependent rolling resistance. Small impact restitution is suppressed below 0.2 m/s to stabilize resting contacts. A low-motion contact island can sleep together to avoid repeated numerical wake-ups.

## Calibration boundary

This is a physical rigid-body model, not a measured replica of a particular dice set and tray. Surface coefficients are explicit estimates: floor friction 0.38 and restitution 0.12; die/die friction 0.3 and restitution 0.4; walls friction 0.2 and restitution 0.7; rolling resistance 0.01. A reference drop/roll recording or measurements would be needed to calibrate these. Neither higher gravity nor global drag is used to fake weight.
