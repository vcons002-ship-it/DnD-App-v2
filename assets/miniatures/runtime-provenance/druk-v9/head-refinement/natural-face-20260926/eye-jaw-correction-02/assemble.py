"""Fit generated head; replace only the old head and ocular overlays."""
import argparse, copy, importlib.util, io, json, math
from pathlib import Path
import numpy as np
from PIL import Image
HERE=Path(__file__).resolve().parent.parent; MODELS=HERE.parents[2]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod); return mod
h=load('assemble',MODELS/'druk-v7/assembly/assembly_common.py')
w=load('write',MODELS/'druk-v8/tools/transform_parts.py')
def smooth(a,b,x):
    q=np.clip((x-a)/(b-a),0,1); return q*q*(3-2*q)
p=argparse.ArgumentParser()
p.add_argument('--out',type=Path,required=True)
p.add_argument('--head',type=Path,default=HERE/'dense-detail/head-detail-raw.glb')
p.add_argument('--scale',type=float,default=.19)
p.add_argument('--height',type=float,default=.773)
p.add_argument('--skin',type=float,nargs=3,default=[.14,.20,.13])
a=p.parse_args(); out=a.out.resolve(); assert out.is_relative_to(HERE) and not out.exists()
source=h.GLB(MODELS/'druk-v9/final-07/druk.glb')
assert source.sha=='25864639e1aee7decc62c90f343093f461d33b83a3f37774e35da4e36e0ed758'
head=h.GLB(a.head.resolve(strict=True)); d=copy.deepcopy(head.doc); b=bytearray(head.bin)
assert len(d['nodes'])==1 and len(d['meshes'])==1
pr=d['meshes'][0]['primitives'][0]; pos=head.accessor(pr['attributes']['POSITION']); uv=head.accessor(pr['attributes']['TEXCOORD_0'])
assert np.allclose(head.world_matrix(0),np.eye(4))
bv=d['bufferViews'][d['images'][0]['bufferView']]
px=np.asarray(Image.open(io.BytesIO(b[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB'),float)/255
u=np.clip(uv[:,0]*(px.shape[1]-1),0,px.shape[1]-1); v=np.clip(uv[:,1]*(px.shape[0]-1),0,px.shape[0]-1)
u0=u.astype(int);v0=v.astype(int);u1=np.minimum(u0+1,px.shape[1]-1);v1=np.minimum(v0+1,px.shape[0]-1);du=(u-u0)[:,None];dv=(v-v0)[:,None]
rgb=(px[v0,u0]*(1-du)+px[v0,u1]*du)*(1-dv)+(px[v1,u0]*(1-du)+px[v1,u1]*du)*dv
x,y,z=pos.T; lum=rgb@np.array([.2126,.7152,.0722])
face=(1-smooth(.40,.49,abs(x)))*smooth(.35,.48,z)*(1-smooth(.38,.46,y))
neck=(1-smooth(.42,.65,abs(x)))*(1-smooth(-.46,-.34,y))*smooth(-.25,.2,z)
ear=smooth(.4,.5,abs(x))*smooth(-.30,-.2,y)*(1-smooth(.32,.46,y))*smooth(.05,.22,z)
skin=np.maximum.reduce([face,neck,ear,smooth(.15,.30,lum)])
eyes=(abs(x)>.10)&(abs(x)<.38)&(y>-.10)&(y<.13)&(z>.48)&(rgb[:,2]>rgb[:,0]*.83)&(rgb[:,2]>rgb[:,1]*.91)
gain=np.tile(a.skin,(len(pos),1))
ears=(abs(x)>.43)&(y>-.24)&(y<.42)&(z>.1)
gain[ears]=np.array(a.skin)*[.85,1.1,1.2]
colors=np.ones((len(pos),4),dtype='<f4')
colors[:,:3]=np.array([.4,.45,.5])*(1-skin[:,None])+gain*skin[:,None]
colors[eyes,:3]=[.32,.44,.61]
b.extend(b'\0'*(-len(b)%4));vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':colors.nbytes,'target':34962});b.extend(colors.tobytes())
ai=len(d['accessors']);d['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(colors),'type':'VEC4'});pr['attributes']['COLOR_0']=ai
# Retract the generated bust flare into the existing recessed collar.
neck_tuck=(1-smooth(-.90,-.70,y))*smooth(-.25,.15,z)
adjusted=pos.copy(); adjusted[:,0]*=1-.24*neck_tuck
adjusted[:,2]=.05+(adjusted[:,2]-.05)*(1-.24*neck_tuck)
adjusted[:,1]-=.17*neck_tuck
adjusted=np.asarray(adjusted,dtype='<f4')
b.extend(b'\0'*(-len(b)%4));vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':adjusted.nbytes,'target':34962});b.extend(adjusted.tobytes())
ai=len(d['accessors']);d['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(adjusted),'type':'VEC3','min':adjusted.min(0).tolist(),'max':adjusted.max(0).tolist()});pr['attributes']['POSITION']=ai
mat=d['materials'][pr['material']];mat['name']='Druk_Natural_Face_Organic_Material'
mat['pbrMetallicRoughness'].update(metallicFactor=0,roughnessFactor=.76)
mat['extensions']={'KHR_materials_specular':{'specularFactor':.15}}
d.setdefault('extensionsUsed',[]).append('KHR_materials_specular')
t=math.radians(12);R=np.array([[math.cos(t),0,math.sin(t)],[0,1,0],[-math.sin(t),0,math.cos(t)]])
M=np.eye(4);M[:3,:3]=R*a.scale;M[:3,3]=[.048,a.height,-.078]
d['nodes'][0]={'name':'Druk_Natural_Multiview_Head','mesh':0,'matrix':M.T.flatten().tolist()}
d['meshes'][0]['name']='Druk_Natural_Multiview_Head'
out.mkdir(parents=True); fitted=out/'fitted-head.glb'; w.write_glb(fitted,d,b); f=h.GLB(fitted)
removed={'DrukV9_New_Refined_Head','DrukV9_Refined_Eyes_Forward'}
collar_name='DrukV9_Recessed_Front_Neck_Closure'
cd=copy.deepcopy(source.doc);ci=source.nodes[collar_name][1]['mesh']
mi=len(cd['materials']);cd['materials'].append({'name':'Druk_Recessed_Collar_Dark_Lining','pbrMetallicRoughness':{'baseColorFactor':[.012,.009,.006,1],'metallicFactor':0,'roughnessFactor':.93},'doubleSided':False})
for cp in cd['meshes'][ci]['primitives']:
    cp['material']=mi;cp['attributes'].pop('COLOR_0',None)
collar_source=out/'collar-material-source.glb';w.write_glb(collar_source,cd,source.bin);cg=h.GLB(collar_source)
cm=h.binary.Merge();cm.add(cg,collar_name);cm.save(out/'collar-lining.glb');collar=h.GLB(out/'collar-lining.glb')
groups=[(source,n,'unchanged_body_equipment_base_or_collar') for n in source.nodes if n not in removed|{collar_name}]
groups += [(collar,collar_name,'original_collar_geometry_with_dark_inner_lining')]
groups += [(f,n,'new_multiview_head') for n in f.nodes]
merged=h.binary.Merge()
for g,n,_ in groups: merged.add(g,n)
merged.doc['asset']['generator']='Druk natural face: four-view generated head with preserved body, hands, sword, axes, base and neck repairs'
dest=out/'druk-natural-face.glb';merged.save(dest);final=h.GLB(dest)
checks=[h.compare_node(g,n,final,role) for g,n,role in groups]
assert not (set(final.nodes)&removed)
assert h.file_sha(source.path)==source.sha and h.file_sha(head.path)==head.sha
triangles=sum(final.doc['accessors'][p['indices']]['count']//3 for m in final.doc['meshes'] for p in m['primitives'])
receipt={'status':'candidate_for_visual_review','source':str(source.path),'source_sha256':source.sha,'new_head_source':str(head.path),'new_head_sha256':head.sha,'source_files_unchanged':True,'preserved_component_count':len(groups)-2,'collar_finish':'Original front closure geometry retained, material changed to dark inner collar lining instead of stretched green skin visible behind the new neck.','removed_nodes':sorted(removed),'geometry_source':'four-view Hunyuan3D-2mv original textured export, one native subdivision with continuous UVs and matched eye UVs','head_transform':M.tolist(),'skin_linear_gain':a.skin,'original_head_texture_bytes_preserved':True,'native_face_refinement':'Anatomical left eye retained; reduced chin retraction and cheek pad; restored lower-face length and nose depth; texture atlas preserved','attachment_blend':'Neck base only below source Y -0.70; original cheek, chin and nose refinements remain intact','neck_tuck_vertices':int((neck_tuck>0).sum()),'neck_tuck_max_world_displacement':float(np.linalg.norm(adjusted-pos,axis=1).max()*a.scale),'native_vertex_color_used_for_skin_match':True,'bytes':dest.stat().st_size,'triangles':triangles,'sha256':final.sha,'output':str(dest),'comparisons':checks,'bounds':h.referenced_bounds(final),'script_sha256':h.file_sha(Path(__file__))}
(out/'assembly.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps({k:receipt[k] for k in ['output','sha256','bytes','triangles','preserved_component_count']}))
