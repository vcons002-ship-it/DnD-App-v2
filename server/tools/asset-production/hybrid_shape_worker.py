"""Hybrid production shape worker; preserves automatically aligned framing."""
import os,sys,json,time,hashlib,threading,gc,traceback
from pathlib import Path
sys.path.insert(0,str(Path.cwd()))
import numpy as np
from PIL import Image
import torch
from fastapi import FastAPI,HTTPException
from pydantic import BaseModel,Field
import uvicorn
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
from hy3dgen.shapegen.preprocessors import MVImageProcessorV2

app=FastAPI(title='DnD hybrid multiview geometry')
pipe=None;lock=threading.Lock();status={'running':False,'stage':'idle'}
class FrameLockedMV(MVImageProcessorV2):
 @staticmethod
 def recenter(image,border_ratio=0):
  assert image.shape[:2]==(1024,1024),'Expected prepared square views'
  alpha=image[...,3:].astype(np.float32)/255
  rgb=(image[...,:3]*alpha+255*(1-alpha)).clip(0,255).astype(np.uint8)
  return rgb,(alpha*255).clip(0,255).astype(np.uint8)
class Request(BaseModel):
 reference_paths:dict[str,str]
 output_dir:str
 steps:int=Field(default=75,ge=1,le=100)
 guidance:float=Field(default=5.5,ge=1,le=10)
 seed:int=923300
 resolution:int=512
 num_chunks:int=10000
@app.get('/health')
def health():return {'ok':True,'protocol':'dnd-hybrid-v1',**status}
@app.post('/shape')
def shape(req:Request):
 global pipe
 if not lock.acquire(blocking=False):raise HTTPException(409,'Busy')
 started=time.monotonic();out=Path(req.output_dir).resolve();created=False
 try:
  if out.exists():raise ValueError('Use a new output directory')
  assert set(req.reference_paths)=={'front','back','left','right'}
  out.mkdir(parents=True);created=True;status.update(running=True,stage='loading full 2mv checkpoint')
  if pipe is None:
   pipe=Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2mv',subfolder='hunyuan3d-dit-v2-mv',use_safetensors=True,device='cuda')
   pipe.image_processor=FrameLockedMV(size=512,border_ratio=0)
  images={v:Image.open(p).convert('RGBA') for v,p in req.reference_paths.items()}
  # Save the actual model-conditioning pixels; assert all views survived.
  processed=pipe.image_processor(images);tensor=processed['image'];mask=processed['mask']
  assert list(tensor.shape)==[1,4,3,512,512]
  order=['front','left','back','right'];audit={}
  for idx,v in enumerate(order):
   rgb=((tensor[0,idx].permute(1,2,0).numpy()+1)*127.5).round().clip(0,255).astype(np.uint8)
   alpha=((mask[0,idx,0].numpy()+1)*127.5).round().clip(0,255).astype(np.uint8)
   Image.fromarray(rgb).save(out/(v+'-condition.png'))
   box=Image.fromarray(alpha).point(lambda x:255 if x>127 else 0).getbbox()
   audit[v]={'imageShape':list(rgb.shape),'alphaBBox':box,'bodyHeightPx':box[3]-box[1],'sha256':hashlib.sha256(rgb.tobytes()).hexdigest()}
  assert max(v['bodyHeightPx'] for v in audit.values())-min(v['bodyHeightPx'] for v in audit.values())<=2,audit
  torch.cuda.reset_peak_memory_stats();status.update(stage='generating geometry',guidance=req.guidance,steps=req.steps)
  inference_start=time.monotonic()
  mesh=pipe(image=images,num_inference_steps=req.steps,guidance_scale=req.guidance,generator=torch.Generator().manual_seed(req.seed),octree_resolution=req.resolution,num_chunks=req.num_chunks,output_type='trimesh')[0]
  infer_seconds=time.monotonic()-inference_start
  assert np.isfinite(mesh.vertices).all()
  mesh.export(out/'native.glb')
  receipt={'checkpoint':'tencent/Hunyuan3D-2mv/hunyuan3d-dit-v2-mv','settings':req.model_dump(),'framing':'pre-aligned shared scale and body axis; no independent recenter','conditioningShape':list(tensor.shape),'viewIndices':list(processed['view_idxs']),'conditionedViews':audit,'references':{v:{'path':p,'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest()} for v,p in req.reference_paths.items()},'triangles':len(mesh.faces),'vertices':len(mesh.vertices),'inferenceSeconds':round(infer_seconds,2),'totalSeconds':round(time.monotonic()-started,2),'peakTorchMiB':round(torch.cuda.max_memory_allocated()/1048576,1),'output':str(out/'native.glb'),'sha256':hashlib.sha256((out/'native.glb').read_bytes()).hexdigest(),'postprocessing':'none; native shape before reduction, UVs or texturing'}
  (out/'receipt.json').write_text(json.dumps(receipt,indent=2));status.update(running=False,stage='complete');return receipt
 except Exception as exc:
  traceback.print_exc();status.update(running=False,stage='failed',error=str(exc))
  if created:(out/'failure.json').write_text(json.dumps({'error':str(exc)}))
  raise HTTPException(500,str(exc))
 finally:
  pipe=None
  gc.collect();torch.cuda.empty_cache();lock.release()

class AlignRequest(BaseModel):
 reference_paths:dict[str,str]
 output_dir:str
@app.post('/align')
def align(req:AlignRequest):
 if not lock.acquire(blocking=False):raise HTTPException(409,'Busy')
 try:
  from align_views import align_views
  from hy3dgen.rembg import BackgroundRemover
  if set(req.reference_paths)!={'front','back','left','right'}:raise ValueError('Four named views required')
  remover=None
  def remove(im):
   nonlocal remover
   if remover is None:remover=BackgroundRemover()
   return remover(im)
  status.update(running=True,stage='background removal and shared alignment')
  result=align_views(req.reference_paths,req.output_dir,remove)
  status.update(running=False,stage='alignment complete');return result
 except Exception as exc:
  status.update(running=False,stage='alignment failed',error=str(exc));raise HTTPException(500,str(exc))
 finally:gc.collect();torch.cuda.empty_cache();lock.release()

if __name__=='__main__':uvicorn.run(app,host='127.0.0.1',port=int(sys.argv[1]))
