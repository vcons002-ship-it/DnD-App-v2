"""Map experiment: retain generated side textures, project original art from above.
Usage: blender --background --python project_map_texture.py -- INPUT ORIGINAL OUTPUT_DIR
"""
import bpy, sys, json, math
from pathlib import Path
from mathutils import Matrix

source, original, destination = sys.argv[sys.argv.index('--')+1:]
out=Path(destination).resolve();out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
points=[o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
low=[min(p[i] for p in points) for i in range(3)]
high=[max(p[i] for p in points) for i in range(3)]
width=high[0]-low[0];depth=high[1]-low[1]
assert width>0 and depth>0
for obj in meshes:
    transform=obj.matrix_world.copy()
    for v in obj.data.vertices:
        p=transform @ v.co
        v.co=((p.x-(low[0]+high[0])/2)/width,(p.y-(low[1]+high[1])/2)/width,(p.z-low[2])/width)
    obj.matrix_world=Matrix.Identity(4);obj.data.update()
bpy.ops.export_scene.gltf(filepath=str(out/'generated.glb'),export_format='GLB',export_image_format='AUTO',export_yup=True)
image=bpy.data.images.load(str(Path(original).resolve()),check_existing=True)
image.pack()
material=bpy.data.materials.new('Original_map_top_projection');material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value=.95
shader.inputs['Specular IOR Level'].default_value=.15
texture=material.node_tree.nodes.new('ShaderNodeTexImage');texture.image=image
uv=material.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='OriginalMapProjection'
material.node_tree.links.new(uv.outputs['UV'],texture.inputs['Vector'])
material.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
counts={'projected':0,'generatedSides':0}
for obj in meshes:
    projection=obj.data.uv_layers.new(name='OriginalMapProjection')
    obj.data.uv_layers.active_index=0
    # Keep the generated UVs for side materials; top material explicitly uses this layer.
    for loop in obj.data.loops:
        p=obj.data.vertices[loop.vertex_index].co
        projection.data[loop.index].uv=(p.x+.5,p.y/(depth/width)+.5)
    index=len(obj.data.materials);obj.data.materials.append(material)
    for face in obj.data.polygons:
        if face.normal.z > .35:
            face.material_index=index;counts['projected']+=1
        else:counts['generatedSides']+=1
bpy.ops.export_scene.gltf(filepath=str(out/'original-top.glb'),export_format='GLB',export_image_format='AUTO',export_yup=True)
receipt={'source':str(Path(source).resolve()),'originalImage':str(Path(original).resolve()),
 'inputBounds':{'min':low,'max':high},'normalizedWidth':1,'normalizedDepth':depth/width,
 'normalizedHeight':(high[2]-low[2])/width,'sourceAspect':image.size[0]/image.size[1],
 'meshAspect':width/depth,'projection':'Planar XY, original north -> positive Blender Y / negative glTF Z',
 'upwardNormalThreshold':.35,'faceCounts':counts,
 'limitations':['Original art is aligned to overall rectangular mesh bounds, without manual layout repairs.',
 'Projection cannot recover hidden sides or correct invented/moved geometry.']}
(out/'projection-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print(json.dumps(receipt,indent=2))
