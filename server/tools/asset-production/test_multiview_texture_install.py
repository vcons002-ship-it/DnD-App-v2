import unittest
from install_multiview_texture import transform

class InstallTests(unittest.TestCase):
    def test_preserves_named_references_and_is_repeatable(self):
        source = '''def shape(image, MV_MODE):
    main_image = image if not MV_MODE else image['front']
    return main_image
if True:
    if True:
        if True:
            texgen_worker = Hunyuan3DPaintPipeline.from_pretrained(args.texgen_model_path)
def generate(mesh, image, stats):
    textured_mesh = texgen_worker(mesh, image)
'''
        updated = transform(source)
        self.assertIn('main_image = image  # DND_MULTIVIEW_TEXTURE_V1', updated)
        self.assertIn("stats['texture_reference_views']", updated)
        self.assertIn('install(texgen_worker)', updated)
        self.assertEqual(transform(updated), updated)

    def test_rejects_unrecognized_worker_instead_of_partial_install(self):
        with self.assertRaises(RuntimeError):
            transform('print("different worker")')

if __name__ == '__main__':
    unittest.main()
