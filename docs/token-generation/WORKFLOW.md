# Static character miniature workflow

This records the actual generation and refinement methods behind the accepted Druk and Varis models. It is a practical recipe for extending the collection without discarding approved sculpting or artwork. It is not a one-click reconstruction of every historical candidate: stochastic image/model generation, local manual fitting, and unbundled intermediate meshes prevent a promise of byte-identical regeneration.

The delivered GLBs are static visual miniatures, equivalent in purpose to tabletop figures. They contain no skeletal animation. Importing them into the repository does **not** replace existing campaign tokens, change the VTT renderer, migrate campaign data, or deploy a server.

## Selected assets and evidence

All asset paths below are relative to the repository root. The reference PNGs are input artwork; only the preview PNGs are renders of exported 3D models.

| Character | Accepted source revision | Repository model | Triangles | Bytes | Mesh nodes / embedded images |
| --- | --- | --- | ---: | ---: | --- |
| Druk, male half-orc fighter | v7, assembled-03: corrected right wrist, larger hands, separate bone-and-steel longsword | `assets/miniatures/models/druk.glb` | 421,725 | 48,425,060 | 18 / 8 |
| Varis, male half-elf ranger | v3, candidate-06: restored face/hair, restrained beard-tone correction | `assets/miniatures/models/varis.glb` | 368,344 | 28,590,292 | 3 / 3 |

SHA-256 identifies the selected model, not a promise that a new generation will reproduce it:

```text
druk.glb   8919438bd9421fe32fb25c9c853bad1ab67825a982eef59e64d5f2089cbdedb0
varis.glb  55fc1a81a1cb57ba91c50d92663de9d16914e8758a7ff918bbf0720cd62cc1db
```

Review the actual exported-model evidence:

- [Druk, full three-quarter](../../assets/miniatures/previews/druk-three-quarter.png), [grip front](../../assets/miniatures/previews/druk-grip-front.png), [grip side](../../assets/miniatures/previews/druk-grip-side.png).
- [Varis, lit face](../../assets/miniatures/previews/varis-head-front.png), [lit side](../../assets/miniatures/previews/varis-head-side.png), [unlit face color](../../assets/miniatures/previews/varis-head-albedo-front.png), [unlit side color](../../assets/miniatures/previews/varis-head-albedo-right.png).

Druk's earlier small-hand turntable is not evidence for this final model and is intentionally excluded. Map-preview scenes are also excluded: they were isolated art demonstrations, not VTT integration tests.

## 1. Lock the design before reconstruction

Define identity, pose, handedness, equipment, and the intended tabletop viewing distance. Keep these stable through revisions:

- Druk: adult male half-orc; medium loose black hair, no ponytail; existing ready stance, armor, boots and base; a heavy, straight **bone-and-steel longsword**, not a wooden club.
- Varis: adult male half-elf; loose chestnut hair, light brown stubble, green cloak and leather armor; **shortsword in anatomical right hand, shorter dagger in anatomical left**. Keep the quiver and arrows. The accepted references and model deliberately omit the bow and bowstring.
- State anatomical left/right separately from image left/right. A rear view reverses screen placement; it must not swap the actual hands or weapons.
- Use true transparent RGBA cutouts, neutral even illumination, unclipped equipment, and safe framing margins. A painted checkerboard is not transparency.
- For a local repair, ask to preserve the accepted silhouette and pose. Do not regenerate the whole character to fix one wrist or a beard-color patch.

The selected references are in `assets/miniatures/references/druk/` and `assets/miniatures/references/varis/`. Druk's `body-cutout.png` is a body reconstruction reference; `head-medium-hair.png`, `sword-alpha.png`, and the four `hand-*.png` files document separate component reconstruction. `pauldron-dragon-paint.png` records a retained local armor-art reference, not a replacement whole armor mesh. Varis's four `body-*.png` files are the **no-bow** multiview set; `head.png` is the later isolated head reference.

## 2. Choose the actual reconstruction route

Two different routes were used. Uploading several images does not by itself prove that a multiview model processed them.

| Stage | Actual shape checkpoint | Image input | Recorded settings actually forwarded |
| --- | --- | --- | --- |
| Druk replacement gripping gauntlet | `tencent/Hunyuan3D-2mv/hunyuan3d-dit-v2-mv` | Named front, back, left, right | 50 steps; guidance 5.5; seed 27109; octree 384; 10,000 chunks; randomize seed off |
| Varis whole body | `tencent/Hunyuan3D-2mv/hunyuan3d-dit-v2-mv` | Named front, back, left, right, all without bow | 50 steps; guidance 5.5; seed 27110; octree 512; 10,000 chunks; randomize seed off |
| Druk body/head and separate sword; Varis isolated head | `tencent/Hunyuan3D-2.1`, shape subfolder `hunyuan3d-dit-v2-1` | One image per generation | The installed worker forwarded the image only; see the important limitation below |

The two 2mv jobs used `tencent/Hunyuan3D-2` for texture generation. Their returned mesh metadata confirmed the checkpoint and forwarded parameters. The background-removal checkbox was false for already transparent reference images. In that worker, RGB input can still trigger background removal even when the checkbox is false; retain RGBA inputs and record what was actually submitted.

### Installed 2.1 worker limitation

The particular portable 2.1 worker used for these assets accepted request fields such as seed 1847, 20 steps, guidance 5, octree 256, 8,000 chunks, and a 60,000 face request. Inspection showed its shape call was simply:

```python
mesh = self.pipeline(image=image)[0]
```

Those quality/seed fields were **not passed to the shape pipeline**. They must not be represented as the effective reconstruction settings. The worker always attempted painting; its paint configuration used six internal views at 512 resolution. This is not the delivered texture-atlas resolution: the relevant final embedded atlases were 2048 square.

This worker also converted input to RGBA before an RGB-only background-removal condition. An opaque gray background therefore remained a problem despite the advertised removal option. The selected sword uses the alpha-cutout reference instead. This is a verified property of the installed worker at generation time, not a claim about every Hunyuan3D 2.1 distribution.

For a future run, inspect the currently installed worker and checkpoint arguments again. Record requested settings and effective settings separately; do not silently inherit this historical wrapper's behavior.

### Keep both outputs

Archive the dense untextured shape and the painted/reduced GLB from the **same job** before cleanup. They serve different purposes:

| Reconstruction | Dense raw shape triangles | Painted first-pass triangles |
| --- | ---: | ---: |
| Druk multiview gauntlet | 587,652 | 40,000 |
| Varis multiview body | 1,705,338 | 40,000 |
| Druk selected medium-hair head | 2,100,394 | 40,000 |
| Varis isolated head | 1,180,550 | 40,000 |

For 2mv, front supplied the painting appearance reference after multiview shape reconstruction. The four inputs are synthetic image-generation views, not measured scans or exact camera rotations of one true object. Even orthographic instructions can introduce silhouette drift. Actual mesh review, not the apparent quality of a reference sheet, is the acceptance gate.

## 3. Restore face and hair detail from the dense mesh

The successful head workflow was **separate reconstruction plus dense-detail recovery**, not a smooth/subdivide operation on the 40,000-triangle whole figure.

1. Generate an enlarged head, hair, ears, and short neck reference preserving the character's identity. Exclude armor, torso, weapons, and base. Loose medium hair gave a coherent silhouette without duplicate ponytails.
2. Reconstruct that single component through 2.1. Preserve its dense initial mesh and same-run painted GLB.
3. Confirm that the two exports align in the same raw coordinate frame. Do not apply a body-fitting transform before texture projection.
4. Adaptively reduce the dense geometry toward approximately 220,000 triangles. This retains genuine generated nose, eyelid, ear, and hair-lock surface detail that the painting export discarded. It cannot recover anatomical detail that was absent from the dense source.
5. Transfer UVs per triangle corner using the painted mesh as the donor. Respect UV islands; a nearest-point lookup that jumps across texture seams can smear hair, skin, or neck paint. Retain the existing embedded image payloads.
6. Create explicit seam-aware smooth normals. Coincident positions across UV seams may share an appropriate shading normal without welding their UVs. Druk's original helper used area/corner-angle weighting and a 50-degree normal gate rather than flattening every seam indiscriminately.
7. Inspect textured and neutral-clay exports at front, profile, back, and tactical angles. Check ears, loose locks, eyelids, neck, and any floating debris.
8. Fit the head **once** to the preserved body. Keep head-local data and one clearly declared assembly transform; verify glTF Y-up versus Blender Z-up conversion rather than baking a transform twice.

Recorded selected results:

- Druk: dense head reduced to **219,991 triangles**. The selected medium-hair component uses scale 0.217, yaw -30 degrees and Blender translation `(0.1695, 0.0487, 0.4619)` in that historical body's coordinates. A local charcoal material correction addressed rear hair; it was not a whole-head repaint. Later hand/sword work copied this accepted head unchanged.
- Varis: dense restoration produced **219,995 triangles**. Conservative detached-speck cleanup removed 2,209 triangles in 89 disconnected components, leaving **217,786**. Components were joined by exact coincident positions for the test, so UV seams did not masquerade as separate specks. Selected small slivers were reviewed explicitly; hair locks and ears were protected.
- Varis head fit: scale 0.20, yaw 0, Blender translation `(0.08, -0.065, 0.785)`. Exactly **1,573 original body head triangles** were removed; **38,427 body triangles** retained their original attributes and artwork. A separate **5,163-triangle inside-hood lining** closed the visible interior gap. The exterior collar was not rebuilt.

These numbers and transforms describe these specific source meshes, not universal presets for another character. For cleanup, filter only approved triangle indices and preserve retained positions, UVs, normals, materials, and images. Do not use “remove small objects” blindly: an ear, hair tip, arrow, or blade fragment may be small and still intentional.

## 4. Druk: separate sword and multiview hands

### Bone-and-steel sword

The selected sword was reconstructed separately from `sword-alpha.png` through the single-image 2.1 route. The weapon design explicitly separated hard pale bone relief, bright steel bevels, dark steel structure, and an oxblood leather grip. The exported standalone sword had 40,000 triangles and two embedded 2048-square textures.

A small centerline correction retained the blade's art, UVs, connectivity, and cross-section rather than replacing it with a primitive. The maximum local correction after recentering was 0.002493 source-model units. Explicit area-weighted normals were added where absent. The source weapon remained unchanged while fitting copies were developed.

The final larger-hand fitting used a uniform overall scale of approximately 0.871156518. It adjusted only the grip/collar region and a rigid position change: wider and minimally longer leather grip, rigid pommel/collar repositioning, and a 0.09-unit whole-sword move along its axis. The blade/guard shape and artwork stayed intact. Generated leather that imported as metallic was corrected on the fitted copy. Do not reuse these dimensions on a new hand without measuring its grip cavity and both palm centers.

### Hands and wrist attachment

The accepted replacement grip was a true 2mv reconstruction from the four enhanced gauntlet references. The earlier grip served as a camera/pose guide; each view was enhanced for leather art while asking to retain silhouette, gesture, and framing. Those references still had small silhouette differences, so they were not treated as exact geometry constraints.

The temporary ivory shaft and detached debris were removed from the generated hand. The opposite hand was mirrored with triangle winding corrected. Fit the palm, curled fingers, shaft axis, and wrist opening together before connecting the wrist to the armor. Bridge to pinned source wrist/cuff boundaries rather than using a detached cylinder or remeshing all the fingers. Check hand proportions in a full-figure render; an attractive close-up can conceal hands and wrists that are far too small.

Druk's final accepted assembly is **assembled-03**, not the small-hand trial. It uses the larger-hand fit, preserves the accepted left hand/wrist, restores the original right cuff art, and shortens/reorients the right connector by 33.2 percent. The final right-wrist correction leaves both palm/finger sculpts intact. The final assembly retained **97,874 original body triangles**, the accepted head, and 15 protected boot nodes with their original attributes/artwork.

Bounded hand/sword diagnostics found no observed triangle crossings or tested penetrating vertices in the selected assembly. This is not a certificate that the whole character is watertight or printable. Mild longitudinal texture stretch remains on the shortened red connector, and the original cuff rim remains somewhat faceted.

## 5. Varis: diagnose and balance baked beard color

First compare two renders with the same camera:

- **Unlit base color:** drive emission from the asset's actual base-color material so scene illumination does not hide or create a painted patch.
- **Neutral clay:** remove color differences to inspect the underlying shape and normals.

Varis's darker anatomical-left/image-right beard persisted in unlit color but not as the same patch in clay. That localized the problem to baked base-color asymmetry rather than requiring face remodeling or a new light setup.

The accepted candidate-06 uses **native linear-RGB vertex color derived from the original paint**, with feathered anatomical and darkness masks. It lightens/warms the darker beard and gently warms a cool pale patch directly above it. It does **not** mirror the other cheek's hair pattern, regenerate a texture atlas, or repaint the entire character.

To carry enough local paint samples without moving the surface, 4,457 original cheek triangles were split five times per edge: each parent became 25 planar triangles, with 21 barycentric lattice vertices before cross-face reuse. That produced 111,425 local triangles and 93,597 stored patch vertices. This tessellation is **color-sampling density only**, unlike the genuinely denser shape recovery in section 3.

The final local material uses `COLOR_0` for base color, white base-color factor, and no base-color texture on the corrected patch. Original `TEXCOORD_0` still drives metallic/roughness. The remaining head keeps its original material. All three embedded image payloads remain byte-identical.

For this source only, the selected tonal branch used a 0.72 power curve with RGB weights `(1.12, 0.94, 0.69)`, blended through the dark-beard mask. A separate neutral/cool-pixel mask limited the cheek-halo warming. The raw-head anatomical mask was bounded by X approximately 0.11..0.43, Y -0.39..0.21, Z above -0.025, with top slope 1.60 and top offset -0.27. These are model-local coordinates and art-tuned parameters, not a universal “fix beard” preset.

Independent validation checked every new point against its original parent triangle; original UV0 interpolation and renormalized normal interpolation were preserved within floating-point tolerance. Maximum position deviation was approximately `3.10e-8` source units. All **213,329 unpainted head triangles**, the body, hood lining, node transforms, and image payloads were preserved.

The result is more even beard **tone**, not identical stubble density on both cheeks. The original direction/coverage asymmetry remains. Existing rough hood-rim, hand, weapon, quiver, and base details were outside this correction.

## 6. Preservation and acceptance gates

Use fresh versioned output folders. Keep source models immutable and record their SHA-256 hashes before processing. Separate “generated,” “visually reviewed,” “selected,” and “deployed” states; an old intermediate receipt may predate later acceptance.

Before accepting a new assembly:

1. **Validate the file:** GLB version/length, JSON/BIN boundaries, buffer/accessor ranges, finite values, index bounds, expected node/triangle/image counts, embedded image decoding, and absence/presence of rigs or animation as intended.
2. **Validate preservation:** compare untouched position/normal/UV/index payloads, materials, images, and world transforms against their declared source. A GLB re-export can silently alter more than the edited region; direct buffer-preserving assembly avoids that where possible.
3. **Validate intentional changes honestly:** head replacement has a declared removed-face set; a lining is new geometry; a planar color patch has changed topology but an unchanged underlying surface. Do not call the entire mesh byte-identical when only the protected regions are.
4. **Validate contact and silhouettes:** hands must meet wrists, fingers must wrap the grip, the sword axis must stay straight, feet must remain plausible, and thin props must survive back/profile/tactical views. Check both textured and clay images. A triangle count or passing script cannot approve anatomy.
5. **Re-import the delivered GLB and render it:** inspect the file that will ship, not just an in-memory Blender scene or source artwork. Include a complete-character frame and relevant close-ups. A turntable is a rigid inspection rotation, not character animation.
6. **Keep runtime testing separate:** source validation and offline Blender renders do not establish browser FPS, memory use, lighting parity, click accuracy, collision behavior, LOD quality, or production readiness.

The portable [asset manifest](../../assets/miniatures/manifest.json) records file hashes, sizes, roles, and selected-model provenance. Repository tooling lives in `scripts/token-assets/`: `validate.mjs` checks the packaged assets, and `render_preview.py` renders both selected models with Blender. From the repository root, run:

```sh
node scripts/token-assets/validate.mjs
node --test scripts/token-assets/validate.test.mjs
```

Follow the [renderer instructions](../../assets/miniatures/README.md#render-both-on-a-grid-or-your-own-map) for optional Blender previews of both models on a neutral grid or a map you supply; generation services are not started by these checks. The package retains selected references, preview evidence, provenance, and final models rather than every dense intermediate, cached job, or rejected candidate. Consequently, repository-only validation proves the delivered package's integrity; it does not rerun every historical preservation comparison without the original source archive.

## 7. Prompts used for selected component references

These are the relevant recorded reference-art prompts, not hidden 3D-model prompts. They accompany the selected image inputs above. They intentionally constrain identity and geometry instead of asking for a general “more detailed” redesign. The multiview source images remain synthetic even when a prompt asks for exact matching.

### Druk: loose medium hair

```text
Use case: precise-object-edit. Input image 1 is the edit target and identity reference: Druk, the same adult male half-orc head.
Change ONLY HIS HAIRSTYLE. Completely remove the ponytail, braid, raised topknot, hair bands, ties, bronze hair cuff and every dangling braided strand. Replace them with naturally LOOSE MEDIUM-LENGTH BLACK HAIR, swept back from the forehead in thick gently tousled layers, ending around the nape and upper neck. This is one continuous normal haircut covering the scalp, with a modest natural crown and loose tapered locks behind the ears. NO tied or gathered hair, NO ponytail, NO braids, NO bun, NO topknot, NO long tails, NO hair accessories. No long hair down onto the shoulders; no giant spiky mane. Hair should have coherent softly sculpted locks and a clean solid silhouette suitable for reconstructing a tabletop miniature.
Keep the exact same recognizable masculine half-orc face, square jaw, brow and cheekbones, olive skin, scar over his left brow/eye, amber eyes, broad nose, lips, two lower ivory tusks, ears and short beard. Keep stern combat-ready expression, facial proportions, viewpoint and realistic fantasy 3D render style. Do not redesign the face or make a new character.
Isolated HEAD, HAIR AND NECK ONLY on genuinely transparent RGBA background, clean neutral flat bottom of neck for fitting into existing armor. No torso, no armor, no shoulders, no base, no weapons, no blood, no severed-head scene. Show all hair with 5 percent clear margin; no clipping. Single near-frontal three-quarter head view at eye level like the reference, no additional panels. Soft even neutral studio lighting, detailed readable facial anatomy and smooth organic surfaces. No text, no labels, no watermark.
```

### Varis: isolated face and hair

Druk's successful **method** was the precedent; Druk's face was not an image input. Varis's own selected body-front image supplied identity.

```text
Use case: identity-preserve. Asset type: isolated head-and-neck reference for high-detail 3D tabletop miniature reconstruction. Input image 1 is the identity reference: Varis, the adult MALE HALF-ELF ranger. Create a very detailed close-up of ONLY this same character's head, all hair, ears, and a short natural neck, on a genuinely transparent RGBA background. Preserve his recognizable handsome rugged masculine face: defined angular jaw and cheekbones, straight nose, mildly furrowed brow, calm focused blue-gray eyes, normal lips, light brown facial stubble, natural light warm skin, subtly pointed half-elf ears. Preserve the reference's medium-length loose wavy chestnut-brown hair, swept back in coherent tousled layered locks with a few natural forehead strands, ending around the nape, no ponytail, braid, topknot, bun, or tied hair. Improve readable facial anatomy, clean eyelids, symmetrical correctly aligned eyes, well-shaped nose and mouth, and rich but coherent sculpted hair strand detail. Maintain adult masculine identity and believable natural proportions; do not change him into an orc or a different person. Near-frontal three-quarter view at eye level, head upright and gaze horizontal, no tilt, both ears visible, soft even neutral studio illumination, realistic fantasy collectible sculpture / physically based 3D render style. Hair and entire head uncropped with 7 percent transparent margin; head occupies most of the square image. Include enough neck below the jaw to fit inside his existing cloak collar, with a clean neutral flat bottom. No shoulders, armor, cloak, quiver, weapons, base, accessories, dramatic shadows, scene, text, labels, watermark, panels, or extra views. This is an isolated miniature component study, not a severed-head scene.
```

### Druk: sword design and alpha preparation

The original design prompt requested a gray background. The second, localized alpha edit below produced the actual selected reconstruction input without redesigning the weapon.

```text
Use case: stylized-concept. Asset: isolated single weapon production concept for an actual 3D tabletop miniature. Create ONE fresh heavy BONE AND STEEL LONGSWORD for a powerful male half-orc fighter in grounded dark fantasy. Full weapon only, no person, no hand, no stand, no props, no writing. Tall portrait composition, tip straight up, pommel straight down, perfectly vertical and centered. Orthographic front broad-face view with no perspective bending. Entire tip and pommel visible with margins. Plain neutral gray background. A long broad double-edged steel blade with clearly visible bright sharpened steel bevels and forged charcoal steel structural rails, enclosing a substantial carved ivory bone central ridge. The bone is unmistakably dense hard aged pale ivory with smooth polished ridges, small natural pits and dark recessed carved crevices, absolutely no wood grain, no brown wooden blade. Bone plates taper elegantly toward a sharp steel tip; heavy and dangerous yet functional longsword, not a cleaver or club. Distinct robust crossguard of sculpted ivory bone prongs reinforced by dark steel collars, modest warm bronze fastening details. Compact straight two-hand grip wrapped in dark oxblood leather, anatomically sufficient for two hands placed close together, not a polearm handle; grip approximately 19 percent of blade length, crossguard width about 22 percent of blade length. Small steel-capped bone pommel. Tip, blade central ridge, tang, leather grip and pommel share one perfectly straight centerline. Excellent AAA game prop material reference: readable true relief, bone carvings, steel hardness, practical construction, crisp controlled microdetail, high quality realistic 3D sculpt appearance. Even studio lighting describes material, no glow, no smoke, no motion blur. No detached pieces, no ornate spikes on the grasped portion, no skull-shaped whole sword, no decorative base. A single coherent fresh sword, not multiple views or a collage.
```

```text
Use case: background-extraction. Image 1 is the exact sword design to preserve. Remove only its entire gray background and produce a clean cutout on a GENUINELY TRANSPARENT ALPHA background. Preserve the entire bone-and-steel longsword, exact straight blade, proportions, carvings, hard ivory bone and steel materials, guard, compact leather grip, pommel, lighting and orientation unchanged. Keep tiny carved openings transparent where they show background. No solid white, gray, black or checkerboard pixels as background; actual alpha transparency. One weapon only, full tip and pommel, no new objects, no shadow plane, no border or text. This will be passed to image-to-3D so all empty space around the isolated sword must have zero alpha.
```

### Druk: front gauntlet enhancement

Other views used their own orthographic render as the geometry/camera target and this enhanced front only as a material reference. Keep that two-reference distinction; do not rotate a side view to look like the front. Avoid emphasizing an individual digit in the prompt: earlier attempts introduced abnormal duplicated/connected digit shapes.

```text
Use case: precise-object-edit. This is the FRONT orthographic reference of one gripping leather gauntlet for a multi-view 3D reconstruction. Improve only surface/material detail while keeping EXACTLY the same whole silhouette, pose, camera angle, position, scale, handle shape and length, wrist shape, cuff boundaries, overlap and empty spaces as the supplied image. Do not rotate, reframe or redesign. Restore crisp fine worn dark charcoal-brown leather grain, natural fine folds and subtle stitching, oxblood leather cuff and narrow aged bronze rim. Make it look like a beautifully sculpted realistic dark fantasy glove, matte supple leather rather than smooth shiny plastic. Preserve the entire ordinary gripping gesture exactly; no added features or accessories. Plain ivory temporary shaft stays unchanged. Same square canvas, object bounds and transparent alpha background, no ground plane or shadow outside subject, no text, no extra views. The matching other views will be reconstructed together, so geometry and framing consistency take precedence over artistic changes.
```

### Varis: final no-bow constraint

This exact front edit was repeated with BACK, LEFT, or RIGHT as appropriate for the other selected views. The quiver is explicitly independent of the bow.

```text
Use case: precise-object-edit. Edit the supplied FRONT view of Varis, the male half-elf ranger miniature. Make one strictly localized change: REMOVE THE ENTIRE BOW AND EVERY PART OF ITS BOWSTRING from the image. Remove upper and lower wooden limbs, bow grip, bow tips, all bow-only metal fittings and string. Do not leave a bow fragment above the shoulder, down the back, behind the arm or beside the hip. Reconstruct only the tiny cloak/background areas uncovered by removing the bow. KEEP THE QUIVER AND ALL ITS ARROWS exactly as they are; the quiver is the brown leather arrow container on his back and is a separate object, not part of the bow. Keep its shoulder straps, leather decoration, arrows and fletching. No replacement weapon on the back.
Everything else must remain unchanged: same camera direction, exact body and weapon pose, face, hair, male half-elf identity, ears, hands, complete connected wrists, longer SHORTSWORD in anatomical right hand and shorter DAGGER in anatomical left hand, costume and leaf-trimmed leather armor, green hood and cloak, feet and boots, mossy rocky circular bronze base and its existing orientation, materials, sharp miniature detail and lighting. Do not move, swap, shorten or re-angle either handheld weapon. Do not create an extra arm, finger, strap or accessory. Preserve the exact subject scale, crop and transparent RGBA background. ONE full-body image; no text, labels, collage, floor or scenery.
```

## Limits and next phase

These are accepted high-detail **review assets**, not runtime-optimized or print-certified tokens. Neither new animations nor new gameplay automation are included. Vanec has no accepted 3D deliverable in this package.

A future runtime phase should separately agree on model/texture budgets, LODs, scale/orientation, loading and caching, browser lighting, click/selection behavior, and a non-destructive opt-in token mapping. Keep the current campaign records and ordinary token behavior unchanged until that integration is implemented and verified. A future printable edition would require a different gate for watertight solids, minimum thickness, supports, and physical scale.
