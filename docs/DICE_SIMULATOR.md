# Interactive dice simulator

The public roller is `/uploads/previews/dice-roller/index.html`. Its source is
`client/dice-comparison.html` and `client/src/dice-comparison/main.ts`.

It uses the same dice renderer, approved appearance defaults, live rigid-body
physics, collision sounds, rolling sounds, and natural-20 cue as the app. Select
Druk, Varis, Vanec, or the DM and roll d4 through d100. Each percentile roll uses
two physical dice. Sound begins after a browser gesture, and the Sounds checkbox
and Volume slider use the app's saved sound preferences on that browser.

The DM's confirmed natural results progressively charge the purple ink with red
pulses. Higher faces pulse brighter and more frequently, with independent timing
per die; a maximum keeps a sustained blood-red glow. Reduced-motion mode uses a
steady tint instead of pulses. This is part of the shared production material,
so it applies to gameplay trays as well as the simulator when this code is installed.

The linked `dice-power.html` compares low, strong, and maximum sample values.
`dice-models.html` provides the material inspection page. These are isolated
previews, so their rolls never modify a campaign or enter its roll log.

After changing production dice art or sounds, rebuild and refresh the published
bundle:

```powershell
npm.cmd run build
node tools/publish-dice-roller.mjs <preview-directory>
```

The publisher copies only the three preview pages, their referenced asset chunks,
and the four tray images. It writes entry pages last and retains older hashed
chunks for browsers that still have an older page open. It does not modify any
campaign database or restart the server. `simulator-build.json` identifies the
source commit and publication time; publish from a clean, committed checkout.

Verification: `e2e/dice-simulator.spec.ts` checks all four character themes,
real Web Audio source starts, collision events, totals, percentile dice, mute,
volume, and phone layout. `e2e/dice-power.spec.ts` checks their strength effects.
