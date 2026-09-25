"""Versioned adapter for the tested Hunyuan3D-2 low-VRAM texture worker.

Installed beside gradio_app.py. Patches only in-memory callables; checkpoint
weights stay unchanged. Rejects unknown upstream implementations at startup.
"""
import inspect
import textwrap

POLICY = 'named-multiview-texture-v1'
CAMERAS = {'front': 0, 'back': 6, 'left': 3, 'right': 9}


def _patch(cls, replacements):
    original = inspect.unwrap(cls.__call__)
    code = textwrap.dedent(inspect.getsource(cls.__call__))
    for old, new in replacements:
        if code.count(old) != 1:
            raise RuntimeError('Unsupported Hunyuan texture implementation: ' + cls.__name__)
        code = code.replace(old, new)
    namespace = dict(original.__globals__)
    namespace['DND_TEXTURE_CAMERAS'] = CAMERAS
    exec(compile(code, '<dnd-multiview-texture>', 'exec'), namespace)
    cls.__call__ = namespace['__call__']


def install(pipe):
    if getattr(type(pipe), '_dnd_multiview_texture', False):
        return
    _patch(type(pipe.models['multiview_model'].pipeline), [
        ('image = to_rgb_image(image)', 'image = [to_rgb_image(i) for i in image]'),
        ('image_vae = torch.tensor(np.array(image) / 255.0)\n    image_vae = image_vae.unsqueeze(0).permute(0, 3, 1, 2).unsqueeze(0)',
         'image_vae = torch.stack([torch.tensor(np.array(i) / 255.0).permute(2,0,1) for i in image]).unsqueeze(0)'),
    ])
    _patch(type(pipe.models['multiview_model']), [
        ('input_image = input_image.resize((self.view_size, self.view_size))',
         'reference_names = list(input_image)\n    input_image = [i.resize((self.view_size, self.view_size)) for i in input_image.values()]'),
        ('camera_info_ref = [[0]]',
         'camera_info_ref = [[DND_TEXTURE_CAMERAS[name] for name in reference_names]]'),
    ])
    _patch(type(pipe), [
        ('if isinstance(image, str):\n        image_prompt = Image.open(image)\n    else:\n        image_prompt = image',
         "image_prompt = image if isinstance(image, dict) else {'front': Image.open(image) if isinstance(image, str) else image}\n    if not image_prompt or any(k not in DND_TEXTURE_CAMERAS for k in image_prompt):\n        raise ValueError('Expected named texture references')"),
        ('image_prompt = self.recenter_image(image_prompt)',
         'image_prompt = {k: self.recenter_image(v) for k, v in image_prompt.items()}'),
        ("image_prompt = self.models['delight_model'](image_prompt)",
         "image_prompt = {k: self.models['delight_model'](v) for k, v in image_prompt.items()}"),
    ])
    type(pipe)._dnd_multiview_texture = True
