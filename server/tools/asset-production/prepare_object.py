"""Ground a reduced image-generated prop without adding a miniature pedestal.
Usage: blender --background --python prepare_object.py -- INPUT OUTPUT NAME
"""
import bpy, sys, json
from pathlib import Path
from mathutils import Matrix
source, destination, name = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
points = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
low = [min(p[i] for p in points) for i in range(3)]
high = [max(p[i] for p in points) for i in range(3)]
cx, cy = (low[0]+high[0])/2, (low[1]+high[1])/2
# Fit the actual horizontal footprint to a unit diameter. Preserve proportions.
diameter = max(((p.x-cx)**2+(p.y-cy)**2)**.5 for p in points)*2
assert diameter > 0
for index, obj in enumerate(meshes):
    transform = obj.matrix_world.copy()
    for v in obj.data.vertices:
        p = transform @ v.co
        v.co = ((p.x-cx)/diameter, (p.y-cy)/diameter, (p.z-low[2])/diameter)
    obj.matrix_world = Matrix.Identity(4)
    obj.name = name + '_object_' + str(index)
    obj.data.update()
bpy.ops.export_scene.gltf(filepath=str(Path(destination).resolve()), export_format='GLB', export_image_format='AUTO', export_yup=True)
Path(destination).with_suffix('.bounds.json').write_text(json.dumps({'baseDiameter':1,'baseCenter':[0,0,0], 'height':(high[2]-low[2])/diameter,'pedestal':False},indent=2),encoding='utf-8')
