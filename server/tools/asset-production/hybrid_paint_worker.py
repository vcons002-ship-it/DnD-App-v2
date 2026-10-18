"""Hybrid production Hunyuan 2.1 PBR painting worker, launched with the managed runtime.

No checkpoint, standard worker, or production-app files are modified.
"""
import argparse
import gc
import hashlib
import inspect
import json
import os
from pathlib import Path
import sys
import textwrap
import threading
import time
import traceback

sys.path.insert(0, str(Path.cwd()))
sys.path.insert(0, str(Path.cwd() / 'hy3dpaint'))
from torchvision_fix import apply_fix
apply_fix()
import torch
import trimesh
from PIL import Image
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import uvicorn
from textureGenPipeline import Hunyuan3DPaintConfig, Hunyuan3DPaintPipeline
from hy3dpaint.convert_utils import create_glb_with_pbr_materials

app = FastAPI(title='DnD hybrid Hunyuan 2.1 PBR materials')
pipe = None
lock = threading.Lock()
status = {'running': False, 'stage': 'idle'}


class Trial(BaseModel):
    mesh_path: str
    reference_paths: list[str]
    output_dir: str
    faces: int = Field(default=120000, ge=40000, le=200000)
    resolution: int = 768
    views: int = Field(default=6, ge=6, le=9)
    atlas: int = Field(default=4096)


def patch_method(cls, name, replacements):
    method = getattr(cls, name)
    # Pipeline instances unload between jobs; their classes remain alive. Do not
    # inspect/repatch our generated function when the next queued job loads.
    existing = getattr(method, '_dnd_hybrid_adapter_sha256', None)
    if existing:
        return existing
    original = inspect.unwrap(method)
    source = textwrap.dedent(inspect.getsource(method))
    for old, new in replacements:
        if source.count(old) != 1:
            raise RuntimeError(f'Unsupported upstream source: {cls.__name__}.{name}: {old!r}')
        source = source.replace(old, new)
    namespace = dict(original.__globals__)
    namespace['TRIAL_STATUS'] = status
    exec(compile(source, '<isolated-2.1-trial-adapter>', 'exec'), namespace)
    digest = hashlib.sha256(source.encode()).hexdigest()
    namespace[name]._dnd_hybrid_adapter_sha256 = digest
    setattr(cls, name, namespace[name])
    return digest


def initialise():
    global pipe
    if pipe is not None:
        return
    status['stage'] = 'loading PBR model'
    conf = Hunyuan3DPaintConfig(6, 768)
    conf.realesrgan_ckpt_path = 'hy3dpaint/ckpt/RealESRGAN_x4plus.pth'
    conf.multiview_cfg_path = 'hy3dpaint/cfgs/hunyuan-paint-pbr.yaml'
    conf.custom_pipeline = 'hy3dpaint/hunyuanpaintpbr'
    pipe = Hunyuan3DPaintPipeline(conf)
    # Fix the list-input bug and keep the full texture atlas for this trial.
    status['paintAdapterSha256'] = patch_method(type(pipe), '__call__', [
        ('if isinstance(image_path, str):',
         'if isinstance(image_path, list):\n        image_prompt = image_path\n    elif isinstance(image_path, str):'),
        ('for i in range(len(enhance_images)):',
         'for i in range(len(enhance_images["albedo"])):'),
        ('image = image.resize((512, 512))',
         'image = image.resize((self.config.resolution, self.config.resolution))'),
        ('self.render.save_mesh(output_mesh_path, downsample=True)',
         'self.render.save_mesh(output_mesh_path, downsample=False)'),
        ('mesh = mesh_uv_wrap(mesh)',
         'TRIAL_STATUS["stage"] = "UV unwrap"\n    mesh = mesh_uv_wrap(mesh)\n    TRIAL_STATUS["stage"] = "rendering control views"'),
        ('multiviews_pbr = self.models["multiview_model"](',
         'TRIAL_STATUS["stage"] = "PBR diffusion"\n    multiviews_pbr = self.models["multiview_model"]('),
        ('enhance_images = {}', 'TRIAL_STATUS["stage"] = "upscaling generated views"\n    self.models["multiview_model"].pipeline.to("cpu")\n    torch.cuda.empty_cache()\n    enhance_images = {}'),
        ('enhance_images["albedo"][i] = self.models["super_model"]',
         'TRIAL_STATUS["stage"] = f"upscaling view {i+1}"\n        enhance_images["albedo"][i] = self.models["super_model"]'),
        ('texture, mask = self.view_processor.bake_from_multiview(',
         'TRIAL_STATUS["stage"] = "baking atlas"\n    texture, mask = self.view_processor.bake_from_multiview('),
        ('texture = self.view_processor.texture_inpaint(texture, mask_np)',
         'TRIAL_STATUS["stage"] = "inpainting atlas"\n    texture = self.view_processor.texture_inpaint(texture, mask_np)'),
    ])
    # The inner PBR pipeline supports N_ref > 1. Remove only the wrapper's slice.
    status['referenceAdapterSha256'] = patch_method(type(pipe.models['multiview_model']), 'forward_one', [
        ('input_images[0:1],', 'input_images,'),
    ])


@app.get('/health')
def health():
    return {'ok': True, 'protocol': 'dnd-hybrid-v1', **status,
            'torchAllocatedMiB': round(torch.cuda.memory_allocated() / 1024**2, 1) if torch.cuda.is_initialized() else 0,
            'torchReservedMiB': round(torch.cuda.memory_reserved() / 1024**2, 1) if torch.cuda.is_initialized() else 0}


@app.post('/trial')
def trial(req: Trial):
    global pipe
    if req.resolution not in (512, 768) or req.atlas not in (2048, 4096):
        raise HTTPException(422, 'Unsupported trial resolution or atlas')
    if len(req.reference_paths) not in (1, 4):
        raise HTTPException(422, 'Expected one or four actual reference images')
    if not lock.acquire(blocking=False):
        raise HTTPException(409, 'A trial is already running')
    start = time.monotonic()
    out = Path(req.output_dir).resolve()
    created = False
    try:
        if out.exists():
            raise ValueError('Use a new output directory')
        out.mkdir(parents=True)
        created = True
        status.update(running=True, stage='preparing geometry')
        torch.cuda.reset_peak_memory_stats()
        source = Path(req.mesh_path).resolve(strict=True)
        mesh = trimesh.load(source, force='mesh')
        raw_faces = len(mesh.faces)
        if raw_faces > req.faces:
            mesh = mesh.simplify_quadric_decimation(face_count=req.faces)
        mesh.export(out / 'geometry.obj')
        references = []
        images = []
        for filename in req.reference_paths:
            p = Path(filename).resolve(strict=True)
            images.append(Image.open(p).convert('RGBA'))
            references.append({'path': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
        initialise()
        pipe.config.resolution = req.resolution
        pipe.config.max_selected_view_num = req.views
        pipe.config.texture_size = req.atlas
        pipe.render.set_default_texture_resolution(req.atlas)
        observed = []
        inner = pipe.models['multiview_model'].pipeline
        original_encode = inner.encode_images

        def encode_and_observe(tensor):
            result = original_encode(tensor)
            observed.append({'input': list(tensor.shape), 'latents': list(result.shape)})
            status['encodeCalls'] = observed
            return result

        inner.encode_images = encode_and_observe
        status['stage'] = 'four-reference PBR texturing' if len(images) == 4 else 'front-reference PBR texturing'
        try:
            obj = pipe(mesh_path=str(out / 'geometry.obj'), image_path=images,
                       output_mesh_path=str(out / 'textured.obj'), use_remesh=False, save_glb=False)
        finally:
            inner.encode_images = original_encode
        if not observed or observed[0]['latents'][1] != len(images):
            raise RuntimeError(f'Reference conditioning was not verified: {observed}')
        status['stage'] = 'packing PBR GLB'
        create_glb_with_pbr_materials(obj, {
            'albedo': str(out / 'textured.jpg'),
            'metallic': str(out / 'textured_metallic.jpg'),
            'roughness': str(out / 'textured_roughness.jpg'),
        }, str(out / 'model.glb'))
        actual = trimesh.load(out / 'model.glb', force='mesh')
        if len(actual.faces) != len(mesh.faces):
            raise RuntimeError('Unexpected geometry reduction during texturing')
        receipt = {
            'seconds': round(time.monotonic() - start, 2),
            'geometrySource': str(source), 'geometrySourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'nativeTriangles': raw_faces, 'triangles': len(actual.faces),
            'settings': req.model_dump(), 'references': references,
            'encodedReferenceCount': observed[0]['latents'][1], 'encodeCalls': observed,
            'actualOutputViewCount': observed[1]['input'][1] if len(observed) > 1 else None,
            'textureSizes': {name: list(Image.open(out / name).size) for name in
                             ['textured.jpg', 'textured_metallic.jpg', 'textured_roughness.jpg']},
            'output': str(out / 'model.glb'), 'bytes': (out / 'model.glb').stat().st_size,
            'peakTorchAllocatedMiB': round(torch.cuda.max_memory_allocated() / 1024**2, 1),
            'adapter': {k: v for k, v in status.items() if k.endswith('Sha256')},
            'geometryInputMode': 'supplied mesh; see shape receipt for checkpoint and input provenance',
        }
        (out / 'receipt.json').write_text(json.dumps(receipt, indent=2))
        status.update(running=False, stage='complete')
        return receipt
    except Exception as exc:
        traceback.print_exc()
        status.update(running=False, stage='failed', error=str(exc))
        if created:
            (out / 'failure.json').write_text(json.dumps({'error': str(exc), 'seconds': time.monotonic() - start}, indent=2))
        raise HTTPException(500, str(exc))
    finally:
        if pipe is not None:
            pipe.models.clear()
        inner = None
        original_encode = None
        pipe = None
        gc.collect()
        torch.cuda.empty_cache()
        lock.release()



if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=int(sys.argv[1]))
