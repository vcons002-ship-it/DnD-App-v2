# Arch cuts with preserved end supports

This test reuses the accepted two-arch magenta mask from
`../courtyard-arch-door-test-20261003/door-arch-mask-v4.jpg` and the original
yellow-mask walls from `../courtyard-stone-comparison-20261003/walls.json`.
Neither API prompt nor mask was changed. No new image request was made.

The existing local doorway cut now uses only the central 70% of each arch's
long axis. The outer 15% at each end is excluded from the cut, preserving the
existing support walls and their normal vision and movement blocking. This
does not fill missing regions in the original yellow wall mask. The full
accepted arch footprint is retained for the 2D artwork overlay.

`conversion-receipt.json` records two clear passages and 20 wall pieces before
and after. `verification.json` records ten sight/movement checks and two actual
player mouse drags through the arches in the disposable app on port 4172.
There were no browser errors. Lower-wall notches already absent from the
original wall geometry remain absent; they are not arch-cut changes.

To reproduce, copy `original.png`, `door-arch-mask-v4.jpg`, and
`api-receipt-v4.json` from the accepted arch experiment into this directory,
then run from the repository root:

```powershell
node --import tsx server/tools/asset-production/convert_arch_door_mask.mjs assets/maps/experiments/courtyard-arch-inset-20261003 assets/maps/experiments/courtyard-stone-comparison-20261003/walls.json
```

This changes the experimental converter, not the production door-mask API.
The installed campaign was not changed. Raised walls remain parked.
