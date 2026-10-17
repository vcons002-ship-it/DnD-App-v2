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
After a toss settles, **3D inspector** opens the selected character and die in
a rotatable close-up. Drag to rotate, pinch/scroll to zoom, switch between tray
and studio lighting, and use Result to preview an unrolled, low, high or maximum
face. Gold dice and percentile pairs are supported. Reset view restores the
camera; Replay effect restarts the maximum animation. Closing frees the
inspection scene and resumes the tray. The inspector loads only when opened.

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
Tetrahedral dice compensate for their shorter glass paths and lower face slopes
so white light cannot wash out their resin colors in the tray.

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


## Remaining class dice and grouped saves (16 Oct 2026)

The roller, its 3D inspector, and the low/strong/maximum comparison now include
Barbarian (bloodstone/iron), Bard (peacock opal), Cleric (alabaster/gold),
Druid (malachite/copper), Monk (river jade), Paladin (midnight enamel/gold),
Rogue (nightstone/silver), Warlock (labradorite/witchfire), Wizard (lapis/gold),
and Artificer (brushed bronze/steel). Existing Fighter, Ranger, Sorcerer and DM
materials retain their approved renderer paths. Mineral textures continue across
faces, use studio reflections and recessed number inlays, and respond to the
confirmed natural face. Each added class has a bounded maximum effect; reduced
motion suppresses external particles. No additional lights, shadow casters or
bloom passes are introduced. This first art pass is available for visual review.

Grouped saves keep one shared tray. Each physical die carries the saving
character's class art when that character is claimed by a connected player.
Creatures, unclaimed characters and DM-controlled characters use purple DM dice.
Advantage/disadvantage dice preserve the same owner. Artwork is included in the
renderer reuse key; changing owners cannot accidentally reuse an old material.
Hidden-save filtering removes the corresponding art with the hidden die's pose,
value and label. Existing modifier/DC privacy and save outcome math are unchanged.
The same owner rule also applies to individual targeted saving throws and
initiative batches. Gold creation dice remain a separate appearance override.

Validation: 2,241 unit tests passed. A live Fireball in a disposable session
rendered Fighter, Ranger and DM dice together, with independent labels and
PASS/FAIL outcomes. Browser regression: e2e/grouped-save-dice-art.spec.ts.


### Resin revision

The ten added class sets now have closed refractive resin bodies, using the
same MeshPhysicalMaterial transmission path as the approved DM dice. Their
former opaque stone/metal body treatment is replaced. Metal number inlays stay
opaque, with dark inward backings so transmitted far-side numbers do not become
competing bright results. Gold critical/creation dice remain their opaque gold
variant, and the approved Fighter/Ranger/Sorcerer/DM designs keep their existing
material paths.

Each new class samples a distinct animated 3D field inside the refracted ray:
embers, iridescent ribbons, solar/radiant cores, pollen, qi rings, shadow/witchfire
clouds, stars, or copper dust and energy coils. Depth changes with the viewing
angle. These are bounded twelve-sample shader effects, without per-die scene
lights or extra particle meshes inside the shell. Existing maximum effects
outside the dice remain. Reduced motion freezes the new internal field and
suppresses its existing external particles. This is real transmission with
absorption and refraction, rather than lowering the whole model's alpha.

Physical transmission has a rendering cost relative to opaque bodies; no claim
of unchanged frame rate is made. The body uses the shared transmission pass
rather than a new light, shadow map, or offscreen pass per class. Inspect and
roll all revised materials in the existing public dice reviewer.

Druk's maximum-roll lava now has a soft rising smoke plume. Eight expanding,
camera-facing wisps share one instanced draw, with turbulent density, a warm
base and a cooler fading top. Pool, splatter, flames and smoke have explicit
transparent draw order, so rotating the inspector cannot let the pool paint
over its rising effects. Depth testing remains on for solid tray/dice
occlusion, and the smoke clips at the floor. It resets and disposes with the
pool, adds no lights or shadow maps, and follows the existing reduced-motion
suppression of Druk's explosion.
