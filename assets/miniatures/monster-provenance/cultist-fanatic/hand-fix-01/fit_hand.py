import bpy,bmesh,sys,json,math,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
root=Path(sys.argv[sys.argv.index('--')+1])
original=root/'original-runtime.glb'
replacement=root/'reduced/model.glb'
out=root/'fitted-02';out.mkdir(exist_ok=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(original))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in meshes:
    for v in o.data.vertices:v.co=o.matrix_world@v.co
    o.parent=None;o.matrix_world=Matrix.Identity(4)
body=next(o for o in meshes if 'body' in o.name)
base=next(o for o in meshes if 'base' in o.name)
before=[tuple(v.co) for v in body.data.vertices]
base_before=[tuple(v.co) for v in base.data.vertices]
center=Vector((.279,-.351,1.039))
outward=Vector((.1,-.995,0)).normalized()
lat=Vector((0,0,1)).cross(outward).normalized()
back=outward.cross(lat).normalized()
region=lambda v:v.co.x>.18 and v.co.z>.89 and v.co.y<-.27
bm=bmesh.new();bm.from_mesh(body.data)
verts=[v for v in bm.verts if region(v)]
edges=[e for e in bm.edges if all(region(v) for v in e.verts)]
faces=[f for f in bm.faces if all(region(v) for v in f.verts)]
before_faces=len(bm.faces)
bmesh.ops.bisect_plane(bm,geom=verts+edges+faces,dist=1e-7,plane_co=center,plane_no=outward,clear_outer=True,clear_inner=False)
boundary=[v.co.copy() for v in bm.verts if region(v) and abs((v.co-center).dot(outward))<1e-5]
assert len(boundary)>=8,len(boundary)
assert not any(region(v) and (v.co-center).dot(outward)>1e-5 for v in bm.verts),'Old hand geometry remains'
# The original head, blade, clothing and base keep their coordinates.
after_set={tuple(v.co) for v in bm.verts}
protected=[p for p in before if not (p[0]>.18 and p[2]>.89 and p[1]<-.27)]
assert all(p in after_set for p in protected)
removed_faces=before_faces-len(bm.faces)
bm.to_mesh(body.data);bm.free();body.data.update()
# Actual cuff cross-section rather than a guessed hand scale.
u=[(p-center).dot(lat) for p in boundary];v=[(p-center).dot(back) for p in boundary]
center+=lat*((min(u)+max(u))/2)+back*((min(v)+max(v))/2)
rim=[]
for p in boundary:
    delta=p-center
    rim.append((math.atan2(delta.dot(back),delta.dot(lat)),delta.dot(lat),delta.dot(back)))
rim=sorted(set((round(a,6),x,y) for a,x,y in rim))
def cuff_at(angle):
    while angle<rim[0][0]:angle+=math.tau
    ext=rim+[(a+math.tau,x,y) for a,x,y in rim]
    for (a,x,y),(b,xx,yy) in zip(ext,ext[1:]):
        if a<=angle<=b:
            t=(angle-a)/max(1e-9,b-a)
            return lat*(x+(xx-x)*t)+back*(y+(yy-y)*t)
    return lat*rim[0][1]+back*rim[0][2]
existing=set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=str(replacement))
hands=[o for o in bpy.context.scene.objects if o not in existing and o.type=='MESH']
assert len(hands)==1
hand=hands[0]
for vert in hand.data.vertices:vert.co=hand.matrix_world@vert.co
hand.parent=None;hand.matrix_world=Matrix.Identity(4)
lo=min(v.co.z for v in hand.data.vertices);hi=max(v.co.z for v in hand.data.vertices)
cut=lo+(hi-lo)*.2
bm=bmesh.new();bm.from_mesh(hand.data)
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),plane_co=(0,0,cut),plane_no=(0,0,1),dist=1e-7,clear_inner=True,clear_outer=False)
source_rim=[v.co.copy() for v in bm.verts if abs(v.co.z-cut)<1e-5]
assert len(source_rim)>8
rootx=(min(p.x for p in source_rim)+max(p.x for p in source_rim))/2
rooty=(min(p.y for p in source_rim)+max(p.y for p in source_rim))/2
origin=Vector((rootx,rooty,cut))
scale=.17/(hi-cut)
finger_axis=Vector((.1,-.70,.707)).normalized()
lateral=(lat-finger_axis*lat.dot(finger_axis)).normalized()
dorsal=finger_axis.cross(lateral).normalized()
rotation=Matrix((lateral,dorsal,finger_axis)).transposed()
straight=Matrix((lat,back,outward)).transposed()
q0,q1=straight.to_quaternion(),rotation.to_quaternion()
assert rotation.determinant()>.999
# Extend the wrist slightly inside the cuff, then blend the original cuff
# section into the generated wrist. Fingers/palm above this zone stay rigid.
attach=center-outward*.02
sx=(max(p.x for p in source_rim)-min(p.x for p in source_rim))/2*scale
sy=(max(p.y for p in source_rim)-min(p.y for p in source_rim))/2*scale
for vert in bm.verts:
    local=(vert.co-origin)*scale
    t=max(0,min(1,local.z/.04));smooth=t*t*(3-2*t)
    q=q0.slerp(q1,smooth)
    actual=attach+q@local
    if t<1:
        angle=math.atan2(local.y/max(sy,1e-6),local.x/max(sx,1e-6))
        radial=math.sqrt((local.x/max(sx,1e-6))**2+(local.y/max(sy,1e-6))**2)
        cuff=attach+cuff_at(angle)*radial*.88+outward*local.z
        actual=cuff*(1-smooth)+actual*smooth
    vert.co=actual
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bm.to_mesh(hand.data);bm.free();hand.data.update()
hand.name='cultist_fanatic_left_hand'
for p in hand.data.polygons:p.use_smooth=True
for m in hand.data.materials:
    m.name='Cultist_Fanatic_Left_Hand_Skin'
    if m.use_nodes:
        for node in m.node_tree.nodes:
            if node.type=='BSDF_PRINCIPLED':
                node.inputs['Metallic'].default_value=0
                node.inputs['Roughness'].default_value=.7
assert base_before==[tuple(v.co) for v in base.data.vertices]
result=out/'assembled.glb'
bpy.ops.export_scene.gltf(filepath=str(result),export_format='GLB',export_animations=False)
receipt={'original':str(original),'originalSha256':sha(original),'handSource':str(replacement),'handSourceSha256':sha(replacement),'anatomicalSide':'left','mirrored':False,'wristCenter':list(center),'outward':list(outward),'cuffWidth':max(u)-min(u),'cuffThickness':max(v)-min(v),'wristInsideCuff':.02,'sourceWristCutZ':cut,'sourceWristCenter':list(origin),'handScale':scale,'handLength':.17,'fingerAxis':list(finger_axis),'cuffBlendLength':.04,'removedOriginalTriangles':removed_faces,'protectedOriginalVertices':len(protected),'protectedCoordinatesUnchanged':True,'baseCoordinatesUnchanged':True,'rotationDeterminant':rotation.determinant(),'triangles':sum(len(o.data.polygons) for o in [body,base,hand]),'output':str(result)}
(out/'fit.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt,indent=2))


