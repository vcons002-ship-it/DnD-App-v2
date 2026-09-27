"""Restore natural face length and chin depth using the same source art."""
import importlib.util,json,math
from pathlib import Path
import bpy,bmesh

HERE=Path(__file__).resolve().parent;ROOT=HERE.parent
s=importlib.util.spec_from_file_location('head_io',ROOT.parent/'tools/recover_head_detail.py');h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
source=ROOT/'generation/01_textured_mesh.glb';out=HERE/'head-left-eye';assert not out.exists();out.mkdir()
source_sha=h.digest(source);doc,binary=h.read_glb(source)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(source))
obj=next(o for o in bpy.context.scene.objects if o.type=='MESH');bpy.context.view_layer.objects.active=obj;obj.select_set(True)
bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=1e-7,plane_co=(0,0,0),plane_no=(1,0,0),clear_outer=False,clear_inner=True)
assert min(v.co.x for v in bm.verts)>-1e-5
bm.to_mesh(obj.data);bm.free();obj.data.update()
mirror=obj.modifiers.new('Retain matching approved eyes','MIRROR');mirror.use_axis=(True,False,False);mirror.use_clip=True;mirror.merge_threshold=1e-5;bpy.ops.object.modifier_apply(modifier=mirror.name)
sub=obj.modifiers.new('Natural facial curvature','SUBSURF');sub.levels=1;sub.render_levels=1;sub.uv_smooth='PRESERVE_BOUNDARIES';bpy.ops.object.modifier_apply(modifier=sub.name)
def smooth(a,b,x):
    q=max(0,min(1,(x-a)/(b-a)));return q*q*(3-2*q)
for v in obj.data.vertices:
    x,zneg,y=v.co;z=-zneg
    front=smooth(.30,.50,z)
    cheek=math.exp(-((abs(x)-.30)/.14)**2-((y+.24)/.20)**2)*front
    v.co.y-=.006*cheek
    chin=math.exp(-(x/.26)**2-((y+.49)/.13)**2)*smooth(.4,.62,z)
    v.co.y+=.015*chin
    nose=math.exp(-(x/.105)**2-((y+.075)/.145)**2)*smooth(.69,.84,z)
    v.co.z+=.018*nose
    v.co.y+=.015*nose
    # Add length below the eyes, with a broad blend into the lower neck.
    # Eye sockets, cranial height, and the existing collar join stay fixed.
    face=smooth(.0,.45,z)*(1-smooth(.50,.78,abs(x)))*smooth(-.98,-.72,y)
    below=max(0,.10-y)
    v.co.z-=.10*below*face
obj.data.update();obj.data.shade_smooth()
tri=obj.modifiers.new('Final triangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=tri.name)
obj.name='Druk_Natural_Proportions_Matched_Eyes'
geometry=out/'geometry.glb';final=out/'head-raw.glb'
bpy.ops.export_scene.gltf(filepath=str(geometry),export_format='GLB',use_selection=True,export_normals=True,export_texcoords=True,export_animations=False,export_skins=False,export_materials='NONE',export_yup=True)
h.attach_original_art(geometry,final,doc,binary)
assert h.digest(source)==source_sha
receipt={'source':str(source),'sha256':source_sha,'source_unchanged':True,'original_atlas_bytes_preserved':True,'method':'Keep original anatomical left eye (positive X, image-right in front view); mirror it to the other side. Same welded and subdivided native head. Chin retraction reduced from .075 to .015; removed chin lift and lateral cheek widening; cheek pad .025 to .006. Nose lift .040 to .018 and retraction .040 to .015. Lower face length increased 10% below eye line with smooth fade into neck. No new image generation.','symmetry_scope':'Head, ears and hair as in previous preview','new_geometry_triangles':len(obj.data.polygons),'output':str(final),'output_sha256':h.digest(final)}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt))
