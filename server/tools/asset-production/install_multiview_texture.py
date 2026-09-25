"""Install the versioned texture adapter into an existing tested Hunyuan worker."""
import argparse
import ast
import shutil
from pathlib import Path


def transform(source):
    if '# DND_MULTIVIEW_TEXTURE_V1' in source:
        return source
    replacements = [
        ('main_image = image if not MV_MODE else image[\'front\']', 'main_image = image  # DND_MULTIVIEW_TEXTURE_V1'),
        ('texgen_worker = Hunyuan3DPaintPipeline.from_pretrained(args.texgen_model_path)',
         'texgen_worker = Hunyuan3DPaintPipeline.from_pretrained(args.texgen_model_path)\n            from dnd_multiview_texture import install\n            install(texgen_worker)'),
        ('textured_mesh = texgen_worker(mesh, image)',
         "textured_mesh = texgen_worker(mesh, image)\n    stats['texture_reference_views'] = list(image) if isinstance(image, dict) else ['front']\n    stats['texture_policy'] = 'named-multiview-texture-v1'"),
    ]
    for old, new in replacements:
        if old not in source:
            raise RuntimeError('Unsupported gradio_app.py; no files changed: ' + old)
        source = source.replace(old, new)
    ast.parse(source)
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('worker_directory', type=Path)
    args = parser.parse_args()
    worker = args.worker_directory.resolve(strict=True)
    target = worker / 'gradio_app.py'
    original = target.read_text(encoding='utf-8')
    updated = transform(original)
    backup = worker / 'gradio_app.before-dnd-multiview-texture.py'
    if not backup.exists():
        backup.write_text(original, encoding='utf-8')
    shutil.copyfile(Path(__file__).with_name('multiview_texture_adapter.py'), worker / 'dnd_multiview_texture.py')
    target.write_text(updated, encoding='utf-8')
    print('Installed named-multiview-texture-v1. Restart the Hunyuan worker.')


if __name__ == '__main__':
    main()
