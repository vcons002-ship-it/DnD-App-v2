"""Test repeated worker initialization without loading CUDA or model weights."""
import ast,hashlib,inspect,textwrap,unittest
from pathlib import Path

class Fixture:
    def run(self):
        return 'original'

class AdapterTests(unittest.TestCase):
    def test_patch_is_idempotent_across_pipeline_reloads(self):
        tree=ast.parse(Path(__file__).with_name('hybrid_paint_worker.py').read_text(encoding='utf-8'))
        function=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='patch_method')
        ns=dict(inspect=inspect,textwrap=textwrap,hashlib=hashlib,status={})
        exec(compile(ast.Module(body=[function],type_ignores=[]),'<adapter-test>','exec'),ns)
        patch=ns['patch_method'];digest=patch(Fixture,'run',[("'original'","'patched'")])
        self.assertEqual(Fixture().run(),'patched')
        self.assertEqual(patch(Fixture,'run',[("'original'","'patched'")]),digest)
        self.assertEqual(Fixture().run(),'patched')

if __name__=='__main__':unittest.main()
