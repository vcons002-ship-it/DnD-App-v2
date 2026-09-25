#!/usr/bin/env python3
"""Use the existing Gradio API with named views for one true MV shape."""
import argparse
import json
import time
import urllib.parse
from pathlib import Path

from generate_image_mesh import await_sse, materialize_file, request_json, sha256_file, source_file_data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--front', type=Path, required=True)
    parser.add_argument('--back', type=Path)
    parser.add_argument('--left', type=Path)
    parser.add_argument('--right', type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--steps', type=int, default=50)
    parser.add_argument('--guidance', type=float, default=5.5)
    parser.add_argument('--seed', type=int, default=27109)
    parser.add_argument('--octree-resolution', type=int, default=384)
    parser.add_argument('--num-chunks', type=int, default=10000)
    parser.add_argument('--remove-background', action='store_true')
    parser.add_argument('--allow-front-only', action='store_true', help='Explicitly permit one named front view; receipt retains view_count=1')
    args = parser.parse_args()
    views = {name: getattr(args, name).resolve(strict=True) for name in ('front', 'back', 'left', 'right') if getattr(args, name)}
    if len(views) < 2 and not args.allow_front_only:
        raise ValueError('This trial requires at least two distinct named views')
    out = args.output_dir.resolve()
    if out.exists() and any(out.iterdir()):
        raise FileExistsError('Use a new output directory')
    out.mkdir(parents=True, exist_ok=True)
    base = args.base_url.rstrip('/')
    settings = {'steps': args.steps, 'guidance': args.guidance, 'seed': args.seed, 'octree_resolution': args.octree_resolution, 'num_chunks': args.num_chunks, 'remove_background': args.remove_background}
    payload = {'data': [None, None] + [source_file_data(views[name]) if name in views else None for name in ('front', 'back', 'left', 'right')] + [args.steps, args.guidance, args.seed, args.octree_resolution, args.remove_background, args.num_chunks, False]}
    started = time.monotonic()
    job = request_json(base + '/gradio_api/call/generation_all', payload)
    event_id = job['event_id']
    inputs = {name: {'path': str(path), 'sha256': sha256_file(path)} for name, path in views.items()}
    (out / 'submitted.json').write_text(json.dumps({'event_id': event_id, 'inputs': inputs, 'settings': settings}, indent=2), encoding='utf-8')
    print('SUBMITTED ' + event_id, flush=True)
    result = await_sse(base + '/gradio_api/call/generation_all/' + urllib.parse.quote(event_id, safe=''))
    (out / 'completion.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    artifacts = []
    for index, value in enumerate(result[:2]):
        while isinstance(value, dict) and 'value' in value:
            value = value['value']
        if value is not None:
            path = materialize_file(base, value, out, index)
            artifacts.append({'path': str(path), 'sha256': sha256_file(path), 'bytes': path.stat().st_size, 'result_index': index})
    stats = result[3] if len(result) > 3 else {}
    actual_model = stats.get('model', {}).get('shapegen', '')
    receipt = {'endpoint': 'generation_all', 'event_id': event_id, 'inputs': inputs, 'view_count': len(views), 'settings': settings, 'mesh_stats': stats, 'returned_seed': result[4] if len(result) > 4 else None, 'artifacts': artifacts, 'elapsed_seconds': round(time.monotonic() - started, 3), 'actual_multiview_model_verified': 'Hunyuan3D-2mv/' in actual_model}
    (out / 'generation_receipt.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt, indent=2), flush=True)
    if not receipt['actual_multiview_model_verified']:
        raise RuntimeError('Returned model did not verify the requested multi-view checkpoint')


if __name__ == '__main__':
    main()
