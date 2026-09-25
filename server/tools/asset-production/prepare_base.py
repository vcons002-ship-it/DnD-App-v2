"""Make a separate 20k-triangle board candidate and simple measured round base."""
import bpy, bmesh, sys, json, hashlib
from pathlib import Path
from mathutils import Vector, Matrix
import math

args=sys.argv[sys.argv.index('--')+1:]
source_arg, out_arg, name, height_arg = args[:4]
foot_limit=float(args[4]) if len(args)>4 else .465
base_radius=float(args[5]) if len(args)>5 else .5
source=Path(source_arg).resolve()
out=Path(out_arg).resolve();out.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parent


sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_hash=sha(source)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
removed_speck_vertices=0
for o in meshes:
    # UV seams duplicate vertices, so detect islands by rounded position without
    # welding UVs. Tiny disconnected generation specks must not define the floor.
    used={i for p in o.data.polygons for i in p.vertices}
    keys={i:tuple(round(x,5) for x in o.data.vertices[i].co) for i in used}
    adjacency={key:set() for key in keys.values()}
    for p in o.data.polygons:
        polygon_keys=[keys[i] for i in p.vertices]
        for key in polygon_keys:adjacency[key].update(polygon_keys)
    islands=[]
    while adjacency:
        stack=[next(iter(adjacency))];island=set()
        while stack:
            key=stack.pop()
            if key not in adjacency:continue
            stack.extend(adjacency.pop(key));island.add(key)
        islands.append(island)
    largest=max((len(island) for island in islands),default=0)
    main_island=max(islands,key=len,default=set())
    main_floor=min(((o.matrix_world@Vector(key)).z for key in main_island),default=0)
    main_points=[o.matrix_world@Vector(key) for key in main_island]
    main_low=[min((p[i] for p in main_points),default=0) for i in range(3)]
    main_high=[max((p[i] for p in main_points),default=0) for i in range(3)]
    margin=max((b-a for a,b in zip(main_low,main_high)),default=0)*.05
    def detached_outlier(island):
        points=[o.matrix_world@Vector(key) for key in island]
        return any(max(p[i] for p in points)<main_low[i]-margin
            or min(p[i] for p in points)>main_high[i]+margin for i in range(3))
    # Small fragments well outside the body bounds must not determine its size.
    specks=set().union(*(island for island in islands if len(island)<largest*.002
        or (len(island)<largest*.01 and (max((o.matrix_world@Vector(key)).z for key in island)<main_floor
            or detached_outlier(island)))))
    remove={i for i,key in keys.items() if key in specks}
    if remove:
        bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm,geom=[bm.verts[i] for i in remove],context='VERTS')
        bm.to_mesh(o.data);bm.free();o.data.update();removed_speck_vertices+=len(remove)
if name=='mage-hand':
    rotation=Matrix.Rotation(math.pi/2,4,'X')
    for o in meshes:
        for v in o.data.vertices:v.co=rotation@(o.matrix_world@v.co)
        o.parent=None
        o.matrix_world=Matrix.Identity(4)
points=[o.matrix_world@o.data.vertices[i].co for o in meshes for i in {i for p in o.data.polygons for i in p.vertices}]
low=Vector(tuple(min(p[i] for p in points) for i in range(3)))
high=Vector(tuple(max(p[i] for p in points) for i in range(3)))
feet=points if name=='mage-hand' else [p for p in points if p.z<low.z+(high.z-low.z)*.035]
cx=(min(p.x for p in feet)+max(p.x for p in feet))/2
cy=(min(p.y for p in feet)+max(p.y for p in feet))/2
radius=max(((p.x-cx)**2+(p.y-cy)**2)**.5 for p in feet)
target_height=float(height_arg)
scale=min(target_height/(high.z-low.z),foot_limit/max(radius, .000001))
before=sum(len(o.data.polygons) for o in meshes)
for o in meshes:
    for v in o.data.vertices:
        p=o.matrix_world@v.co
        v.co=((p.x-cx)*scale,(p.y-cy)*scale,(p.z-low.z)*scale+(.22 if name=='mage-hand' else .055))
    # Coordinates above are already baked into world space. Detach imported
    # glTF parents and assign identity explicitly; mutating the returned matrix
    # in place does not reliably update Blender's object transform.
    o.parent=None
    o.matrix_world=Matrix.Identity(4)
    o.name=name+'_body'
    bpy.context.view_layer.objects.active=o
    o.data.validate(clean_customdata=False)
    o.data.update()
    for p in o.data.polygons:p.use_smooth=True
body_triangles=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
def material(name,color,roughness):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=roughness;bs.inputs['Metallic'].default_value=.85
    return m
bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=base_radius,depth=.055,location=(0,0,.0275))
base=bpy.context.object;base.name=name+'_round_base'
base.data.materials.append(material('Dark pewter base',(.10,.11,.12),.35))
bevel=base.modifiers.new('Soft rim','BEVEL');bevel.width=.008;bevel.segments=2
bpy.ops.object.modifier_apply(modifier=bevel.name)
for p in base.data.polygons:p.use_smooth=abs(p.normal.z)<.9
bpy.ops.export_scene.gltf(filepath=str(out/(name+'-board-source.glb')),export_format='GLB',export_yup=True,export_animations=False)
assert sha(source)==source_hash
receipt={'name':name,'source':str(source),'sourceSha256':source_hash,'bodyTriangles':body_triangles,'sourceBodyTriangles':before,'uniformScale':scale,'bodyHeight':float((high.z-low.z)*scale),'baseDiameter':base_radius*2,'baseCenter':[0,0,0],'sourcePreserved':True,'baseTop':.055,'footRadiusAfterScale':radius*scale,'footRadiusLimit':foot_limit,'targetHeight':target_height,'orientation':'horizontal palm down' if name=='mage-hand' else 'upright','note':'Standard 20k JPEG95 derivative fitted with a round base; no further simplification.'}
receipt['removedSpeckVertices']=removed_speck_vertices
(out/'preparation.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt))
