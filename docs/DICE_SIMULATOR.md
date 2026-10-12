# Interactive dice simulator

The public roller is `/uploads/previews/dice-roller/index.html`. Its source is
`client/dice-comparison.html` and `client/src/dice-comparison/main.ts`.

It uses the same dice renderer, approved appearance defaults, live rigid-body
physics, collision sounds, rolling sounds, and natural-20 cue as the app. Select
Druk, Varis, Vanec, or the DM and roll d4 through d100. Each percentile roll uses
two physical dice. Sound begins after a browser gesture, and the Sounds checkbox
and Volume slider use the app's saved sound preferences on that browser.
Check **Gold dice** before the next toss to roll the polished gold critical
versions for any character, die type and quantity. `index.html?gold=1` starts
with gold selected. Values still come from the ordinary live physics rolls.

The DM's confirmed natural results add soft red illumination inside purple resin,
behind moving black ink. The ink pigment stays black, even at a maximum.
Higher faces glow brighter and pulse more frequently, with independent timing
per die; a maximum keeps a sustained red inner glow. Reduced-motion mode uses a
steady glow instead of pulses. This is part of the shared production material,
so it applies to gameplay trays as well as the simulator when this code is installed.
Red illumination uses the confirmed natural face, with a gentle onset; it never
uses the temporary material strength or carries a previous roll's glow into a toss.

The linked `dice-power.html` compares low, strong, and maximum sample values.
`dice-models.html` provides the material inspection page. These are isolated
previews, so their rolls never modify a campaign or enter its roll log.

Gold bonus critical dice sparkle outside the metal, since their opaque faces
hide internal effects. Higher natural values increase glint count, brightness
and twinkle frequency, with character-colored tips and warm gold centers.
Druk keeps surface heat, Vanec surface lightning, and Varis his green sheen and
escaping maximum rays. Dark numerals remain clear. The glints use one instanced
draw per critical die, with no enclosing shell, extra lights or bloom passes;
they switch off when Druk's shell bursts. Reduced motion keeps the glints steady.
Use `dice-power.html?gold=1` to compare.

Varis' maximum keeps the centered bright mote and escaping beams, but limits
broad illumination of the resin so its dark green inclusions retain their depth.
It also swirls twelve curved, veined leaves around the die, using the same art
as the woodland wake. Vanec's maximum adds occasional branching red discharges
from changing points on its surface, with dark pauses between bolts. Both work
on ordinary and gold dice, only for confirmed natural maxima, and disable in
reduced-motion mode. Each effect uses one bounded mesh per applicable die, with
no additional lights; lightning geometry updates only when a bolt fires.
Maximum internal lightning now uses slower, readable strikes approximately
360–580 ms apart. Escaping bolts wait for one of those internal strikes instead
of flashing independently; their occasional cadence still varies between dice.
Internal lightning is crimson at every strength. Escaping lightning has
connected irregular branches, tapered tips, a traveling leader and return
stroke, with a hot red core and soft crimson corona in the same single mesh.

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
