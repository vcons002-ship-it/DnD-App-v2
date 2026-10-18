# Druk component texture and Battlefield repair trials

Review copies only. None of these candidates replaces the accepted runtime catalog.
The Low minimum tier policy is a separate change, committed as `21d1829`.

## Interactive comparisons

- [Body-only texture and manual right-wrist repair](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-wrist-review/)
- [Original, body-only, and body plus head and hands](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-body-review/)
- [Battlefield original, two-sided body, and conservative body reduction](https://dnd.nic024i.app/uploads/previews/druk-model-trials-20261018/druk-gap-review/)

Rotate all views together. Buttons include face, hands, right wrist, rear, map at
45 degrees, and overhead. Mobile layouts stack the comparison panels.

These pages are files served by the existing local installation under
`server/uploads/previews/druk-model-trials-20261018`, through its normal tunnel.
They do not require a new app deployment. Review GLBs deliberately retain unused
original data to verify that protected components survive unchanged. Their
displayed file sizes are not optimized production budgets.

## Source and scope

Source High: `/miniatures/druk-high-shared-3b43a1a9b56c.glb`.
Source Battlefield: `/miniatures/druk-battlefield-shared-9412d5a70d4c.glb`.
Source Low: `/miniatures/druk-low-shared-f5edeb1b13f5.glb`.

Trial working files and scripts are on D: in
`tmp/druk-body-pbr-20261018` in the rendering workspace. Source references were
rendered from the accepted component meshes, rather than regenerated concept art.
Each component used four equally framed orthographic RGBA views. Isolated head
geometry was painted in its local coordinate system, then restored to its
original node transform. The two hands were separate requests.

The PBR stage used Hunyuan 2.1, four references at 768px, six generated output
views, a 4096px atlas, seed 0, and a 300k face budget to avoid decimating any
component. No shape generation ran.

| Component | Triangles retained | Successful paint time |
|---|---:|---:|
| Body/armor, excluding the tiny custom hand patch | 233,920 | about 214 seconds |
| Head | 238,548 | 166.44 seconds |
| Right hand | 19,116 | 90.03 seconds |
| Left hand | 15,852 | 86.92 seconds |

Four encoded references and six generated views were observed for each request.
The body export succeeded, but an upstream final Chinese status print raised a
Windows encoding error. The generated GLB was recovered and independently
validated. Later jobs used UTF-8 output. The first right-hand attempt ran out of
GPU memory; the isolated worker was restarted and VAE slicing enabled for the
successful retry. The normal app worker was not changed or stopped.

## Preserving custom work

The UV/export stage recomputed surface normals, causing visibly faceted shading.
For a fair texture-only comparison, each generated face corner was matched back
to its original triangle. Original positions and shading normals were restored;
the new UVs and PBR materials were retained. The largest pre-restoration corner
error was below 0.000001 model units. Triangle counts were unchanged.

Reassembly appends new body data to the original GLB and changes only the chosen
mesh primitive references. Protected original binary data, material tables,
texture payloads, other meshes, and transforms remain intact. The body-only
candidate preserves the original head, hands, sword, wrist joins, accessories,
and base. The optional head/hands experiment changes only their materials/UVs
and retains their geometry and placement. The sword remains original throughout.

The head experiment changed the painted eyes and lips noticeably. The original
face remains the preferred comparison baseline; no default was replaced.

## Manual right-wrist candidate

The body pass painted an exposed forearm rim as silver metal beside the existing
leather join. The user accepted the body appearance and requested a local wrist
repair. This candidate:

- assigns the small cuff region to the existing nonmetallic glove leather;
- rebuilds the existing wrist transition from its measured two boundary loops;
- smooths/resamples those loops into a 96-segment, seven-ring leather sleeve,
  with slight overlap at each attachment;
- retains the original head, both hands, sword, and every node transform.

The join drops from 2,342 to 1,152 triangles. Full figure count is 879,214 versus
880,404 before. The repair adds one material group for the corrected cuff region.
There was no GPU performance benchmark for this bespoke repair. Full figure,
close side views, map views, and browser loading were checked.

## Cheap Battlefield candidate

Two-sided body rendering alone did not fix all visible problems. The conservative
candidate replaces only the armor/clothes and arm primitives with a gentler
reduction from Low, using `ratio=.2`, `error=.002`, locked borders and no
Permissive flag. Original texture bytes and all protected components are exact.

| | Original Battlefield | Conservative body candidate |
|---|---:|---:|
| Triangles | 51,832 | 61,202 |
| Geometry GLB bytes, shared textures excluded | 1,319,656 | 1,715,688 |

The added 396,032 bytes reuse existing cached texture images. The candidate
improves the observed arm/boot/armor seam appearance; it is not a guarantee that
the entire assembled character is watertight. The shader-only alternative and
the original remain available for comparison.

## Verification records

Small JSON receipts are in `assets/miniatures/druk-component-trial-20261018/`.
The public previews were checked in desktop and 412px mobile browser viewports.
The unrelated Low minimum tier app changes passed typecheck, build, all 2,299
tests, and real renderer tier/mode-switch checks before their commit.
