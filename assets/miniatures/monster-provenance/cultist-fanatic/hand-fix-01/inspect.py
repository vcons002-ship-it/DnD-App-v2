import bpy, sys, json, math
from pathlib import Path
from mathutils import Vector,Matrix
source,out=map(Path,sys.argv[sys.argv.index('--')+1:])
out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in objects:
    for v in o.data.vertices:v.co=o.matrix_world@v.co
    o.parent=None
    o.matrix_world=Matrix.Identity(4)
rows=[]
for o in objects:
    pts=[v.co for v in o.data.vertices]
    rows.append({'name':o.name,'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]})
print(json.dumps(rows))
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=1000;scene.render.resolution_y=1000
scene.world=bpy.data.worlds.new('World');scene.world.color=(.5,.5,.5)
scene.view_settings.view_transform='Standard'
for loc,power,size in [((3,-4,5),250,4),((-3,-2,3),150,3),((0,4,4),200,3)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    bpy.context.object.data.energy=power;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=size
    bpy.context.object.rotation_euler=(Vector((0,0,.7))-bpy.context.object.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add()
cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO'
# Front screen right is anatomical left. Inspect farthest right high arm.
body=next(o for o in objects if 'body' in o.name)
pts=[v.co for v in body.data.vertices if v.co.x>.22 and v.co.z>.78]
lo=Vector([min(p[i] for p in pts) for i in range(3)])
hi=Vector([max(p[i] for p in pts) for i in range(3)])
center=Vector((.2965744138,-.1993640512,.9709700346))
views=[]
for name, direction in [('front',Vector((0,-1,.12))),('top',Vector((0,0,1))),('side',Vector((1,0,.1)))]:
    cam.location=center+direction.normalized()*3
    cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.ortho_scale=.65
    scene.render.filepath=str(out/(name+'.png'))
    bpy.ops.render.render(write_still=True)
    views.append({'name':name,'position':list(cam.location),'target':list(center),'scale':.65})
(out/'inspection.json').write_text(json.dumps({'source':str(source),'objects':rows,'views':views},indent=2))

