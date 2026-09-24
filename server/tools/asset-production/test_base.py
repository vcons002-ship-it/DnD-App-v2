"""Blender regression: disconnected floor specks must not displace the base.
Run: blender --background --python server/tools/asset-production/test_base.py
"""
import bpy, json, runpy, sys, tempfile
from pathlib import Path

directory=Path(tempfile.mkdtemp(prefix='dnd-base-regression-'))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,radius=1,location=(0,0,1))
body=bpy.context.object
mesh=bpy.data.meshes.new('Generation speck')
mesh.from_pydata([(20,0,-10),(20.001,0,-10),(20,.001,-10)],[],[(0,1,2)])
speck=bpy.data.objects.new('Speck',mesh);bpy.context.collection.objects.link(speck)
body.select_set(True);speck.select_set(True);bpy.context.view_layer.objects.active=body
bpy.ops.object.join()
source=directory/'source.glb'
bpy.ops.export_scene.gltf(filepath=str(source),export_format='GLB')
sys.argv=['test','--',str(source),str(directory/'based'),'test-sphere','1.6']
runpy.run_path(str(Path(__file__).with_name('prepare_base.py')),run_name='__main__')
receipt=json.loads((directory/'based/preparation.json').read_text())
assert receipt['removedSpeckVertices']==3,receipt
assert receipt['sourcePreserved']
body=next(o for o in bpy.context.scene.objects if o.name=='test-sphere_body')
points=[body.matrix_world@v.co for v in body.data.vertices]
assert abs((min(p.x for p in points)+max(p.x for p in points))/2)<.001
assert abs(min(p.z for p in points)-.055)<.001
print('PASS: disconnected floor speck removed; body centered and seated; source preserved.')
