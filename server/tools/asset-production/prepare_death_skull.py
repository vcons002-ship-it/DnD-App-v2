"""Rest a generated skull face-up on a unit-diameter pewter death-marker base.

Usage: blender --background --python prepare_death_skull.py -- INPUT OUTPUT_DIR
Textures and the source file are preserved; package.mjs restores compressed bytes.
"""
import bpy, hashlib, json, math, sys
from pathlib import Path
from mathutils import Matrix, Vector

source_arg, out_arg = sys.argv[sys.argv.index('--') + 1:]
source = Path(source_arg).resolve()
out = Path(out_arg).resolve()
out.mkdir(parents=True, exist_ok=True)
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
# Hunyuan's named front is +Z glTF, which imports as -Y in Blender.
# Lie on the back with the face pointing upward, tipped toward the viewer.
rotation = Matrix.Rotation(-math.pi / 2 + .52, 4, 'X')
for obj in meshes:
    transform = rotation @ obj.matrix_world
    for vertex in obj.data.vertices:
        vertex.co = transform @ vertex.co
    obj.parent = None
    obj.matrix_world = Matrix.Identity(4)
points = [v.co.copy() for obj in meshes for v in obj.data.vertices]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
center = (low + high) / 2
radius = max(math.hypot(p.x - center.x, p.y - center.y) for p in points)
scale = .41 / radius
for obj in meshes:
    for vertex in obj.data.vertices:
        p = vertex.co.copy()
        vertex.co = ((p.x-center.x)*scale, (p.y-center.y)*scale, (p.z-low.z)*scale+.055)
    obj.name = 'death-skull_bone'
    obj.data.update()
    for face in obj.data.polygons:
        face.use_smooth = True
bone_triangles = sum(sum(len(p.vertices)-2 for p in obj.data.polygons) for obj in meshes)
bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=.5, depth=.055, location=(0,0,.0275))
base = bpy.context.object
base.name = 'death-skull_round_base'
pewter = bpy.data.materials.new('Dark pewter base')
pewter.use_nodes = True
bsdf = pewter.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value = (.09,.105,.12,1)
bsdf.inputs['Metallic'].default_value = .85
bsdf.inputs['Roughness'].default_value = .32
base.data.materials.append(pewter)
bevel = base.modifiers.new('Rounded metal lip', 'BEVEL')
bevel.width = .008
bevel.segments = 2
bpy.ops.object.modifier_apply(modifier=bevel.name)
for face in base.data.polygons:
    face.use_smooth = abs(face.normal.z) < .9
bpy.ops.export_scene.gltf(filepath=str(out/'death-skull-board-source.glb'), export_format='GLB', export_yup=True, export_animations=False)
assert hashlib.sha256(source.read_bytes()).hexdigest() == source_hash
receipt = dict(sourceSha256=source_hash, sourcePreserved=True, bodyTriangles=bone_triangles,
    baseDiameter=1, baseCenter=[0,0,0], baseTop=.055, bodyHeight=(high.z-low.z)*scale,
    uniformScale=scale, footprintRadius=.41, orientation='face-up, 0.52 rad forward tilt')
(out/'preparation.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
print(json.dumps(receipt))
