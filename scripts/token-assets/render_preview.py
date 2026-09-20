"""Render the accepted static miniatures in Blender 5.1+ without changing them.

From the repository root:
  blender --background --python scripts/token-assets/render_preview.py -- --out .token-preview/review-01
Optionally pass --map /path/to/your-map.png --map-columns 19.
The default is a neutral grid. No campaign data or generation service is used.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def bounds(points):
    return {name: [fn(p[i] for p in points) for i in range(3)]
            for name, fn in [('min', min), ('max', max)]}


def referenced_points(meshes):
    # Some accepted meshes retain unused vertices from bounded face removals.
    return [obj.matrix_world @ obj.data.vertices[i].co for obj in meshes
            for i in {i for face in obj.data.polygons for i in face.vertices}]


def add_token(model, source, position):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported = set(bpy.context.scene.objects) - before
    meshes = [obj for obj in imported if obj.type == 'MESH']
    bpy.context.view_layer.update()
    points = referenced_points(meshes)
    if not points:
        raise ValueError(f"{model['id']}: no referenced geometry")
    bottom = min(p.z for p in points)
    height = max(p.z for p in points) - bottom
    base = bounds([p for p in points if p.z < bottom + height * .05])
    lo, hi = Vector(base['min']), Vector(base['max'])
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, bottom))
    diameter = max(hi.x - lo.x, hi.y - lo.y)
    if diameter <= 0:
        raise ValueError(f"{model['id']}: degenerate base")
    scale = .9 / diameter
    placement = Matrix.Translation((*position, .014)) @ Matrix.Scale(scale, 4) @ Matrix.Translation(-center)
    # Root-only placement preserves imported parent-child transforms and materials.
    for obj in imported:
        if obj.parent not in imported:
            obj.matrix_world = placement @ obj.matrix_world
    bpy.context.view_layer.update()
    return {'id': model['id'], 'source': model['path'], 'sha256': sha(source),
            'mesh_objects': len(meshes),
            'triangles': sum(len(p.vertices) - 2 for obj in meshes for p in obj.data.polygons),
            'uniform_scale': scale, 'base_diameter_grid_units': .9,
            'base_center_grid_units': [*position, .014],
            'placement_matrix': [list(row) for row in placement],
            'placed_bounds': bounds(referenced_points(meshes))}


def add_board(source, columns):
    image = bpy.data.images.load(str(source), check_existing=False) if source else None
    rows = columns * image.size[1] / image.size[0] if image else columns
    bpy.ops.mesh.primitive_plane_add(size=2)
    board = bpy.context.object
    board.name = 'Offline_Review_Board'
    board.scale = (columns / 2, rows / 2, 1)
    material = bpy.data.materials.new('Review_Board_Grid')
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 1
    bsdf.inputs['Specular IOR Level'].default_value = .08
    uv = nodes.new('ShaderNodeTexCoord')
    split = nodes.new('ShaderNodeSeparateXYZ')
    links.new(uv.outputs['UV'], split.inputs[0])
    masks = []
    for axis, count in [('X', columns), ('Y', rows)]:
        multiply = nodes.new('ShaderNodeMath')
        multiply.operation = 'MULTIPLY'
        multiply.inputs[1].default_value = count
        links.new(split.outputs[axis], multiply.inputs[0])
        # Align cell centers to integer world coordinates, even for arbitrary maps.
        offset = nodes.new('ShaderNodeMath')
        offset.operation = 'ADD'
        offset.inputs[1].default_value = .5 - count / 2
        links.new(multiply.outputs[0], offset.inputs[0])
        fract = nodes.new('ShaderNodeMath')
        fract.operation = 'FRACT'
        links.new(offset.outputs[0], fract.inputs[0])
        low, high = nodes.new('ShaderNodeMath'), nodes.new('ShaderNodeMath')
        low.operation, high.operation = 'LESS_THAN', 'GREATER_THAN'
        low.inputs[1].default_value, high.inputs[1].default_value = .012, .988
        links.new(fract.outputs[0], low.inputs[0])
        links.new(fract.outputs[0], high.inputs[0])
        maximum = nodes.new('ShaderNodeMath')
        maximum.operation = 'MAXIMUM'
        links.new(low.outputs[0], maximum.inputs[0])
        links.new(high.outputs[0], maximum.inputs[1])
        masks.append(maximum.outputs[0])
    maximum = nodes.new('ShaderNodeMath')
    maximum.operation = 'MAXIMUM'
    for i, mask in enumerate(masks):
        links.new(mask, maximum.inputs[i])
    mix = nodes.new('ShaderNodeMixRGB')
    mix.inputs[1].default_value = (.115, .13, .15, 1)
    mix.inputs[2].default_value = (.035, .042, .05, 1)
    links.new(maximum.outputs[0], mix.inputs[0])
    if image:
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        links.new(uv.outputs['UV'], texture.inputs['Vector'])
        links.new(texture.outputs['Color'], mix.inputs[1])
    links.new(mix.outputs[0], bsdf.inputs['Base Color'])
    links.new(mix.outputs[0], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = .23
    board.data.materials.append(material)
    # Record only basename/hash, not private absolute map paths.
    return {'source': source.name if source else 'procedural neutral grid',
            'sha256': sha(source) if source else None, 'columns': columns, 'rows': rows,
            'flat_2d_board': True}


def area(name, position, energy, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy, data.size, data.color = energy, 5, color
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    look_at(obj, (.5, 0, .4))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path, help='Fresh output directory')
    parser.add_argument('--map', type=Path, help='Optional map image you have rights to use')
    parser.add_argument('--map-columns', type=float, default=19)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if not math.isfinite(args.map_columns) or args.map_columns < 4:
        parser.error('--map-columns must be finite and at least 4')
    manifest = json.loads((ROOT / 'assets/miniatures/manifest.json').read_text(encoding='utf-8'))
    sources = {}
    for model in manifest['models']:
        path = (ROOT / model['path']).resolve(strict=True)
        if not path.is_relative_to((ROOT / 'assets/miniatures/models').resolve()):
            raise ValueError('Model path must stay inside the miniature models folder')
        if sha(path) != model['sha256']:
            raise ValueError(f"{model['id']}: source hash mismatch; run git lfs pull and validate.mjs")
        sources[model['id']] = path
    if set(sources) != {'druk', 'varis'}:
        raise ValueError('Expected exactly Druk and Varis')
    map_source = args.map.resolve(strict=True) if args.map else None
    map_hash = sha(map_source) if map_source else None
    output = args.out.resolve()
    if output.is_relative_to((ROOT / 'assets/miniatures').resolve()):
        raise ValueError('Render outputs must not be written into the accepted asset package')
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise FileExistsError(f'Use a fresh output directory: {output}')
    output.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    tokens = [add_token(model, sources[model['id']], (i, 0))
              for i, model in enumerate(manifest['models'])]
    board = add_board(map_source, args.map_columns)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 1800, 1400
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = -1.2
    world = bpy.data.worlds.new('Neutral_Tabletop_Ambient')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.25, .27, .30, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5
    scene.world = world
    area('Soft_Key', (-3.5, -4.5, 7), 2900, (1, .92, .8))
    area('Cool_Fill', (4, -1, 5), 1500, (.78, .87, 1))
    area('Rear_Fill', (0, 5, 6), 1800, (1, .97, .89))
    data = bpy.data.cameras.new('Review_Camera')
    data.type, data.clip_start, data.clip_end = 'ORTHO', .01, 100
    camera = bpy.data.objects.new('Review_Camera', data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    views = [('tabletop', (-.35, -1, .85), (.5, 0, .65), 4.3),
             ('tactical', (0, -.001, 1), (.5, 0, 0), 6.2)]
    for name, direction, target, span in views:
        camera.location = Vector(target) + Vector(direction).normalized() * 20
        look_at(camera, target)
        data.ortho_scale = span
        scene.render.filepath = str(output / f'{name}.png')
        bpy.ops.render.render(write_still=True)
    unchanged = all(sha(sources[m['id']]) == m['sha256'] for m in manifest['models'])
    unchanged = unchanged and (not map_source or sha(map_source) == map_hash)
    if not unchanged:
        raise RuntimeError('Source changed during render; do not use this preview')
    receipt = {'status': 'rendered_pending_visual_review', 'blender': bpy.app.version_string,
               'models': tokens, 'board': board, 'sources_unchanged': True,
               'images': ['tabletop.png', 'tactical.png'],
               'limits': ['Offline static Blender preview, not VTT integration or a performance test.',
                          'Only scene placement and uniform scale changed; source GLBs remain untouched.',
                          'Grid scale is illustrative; map artwork has no three-dimensional walls.']}
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
