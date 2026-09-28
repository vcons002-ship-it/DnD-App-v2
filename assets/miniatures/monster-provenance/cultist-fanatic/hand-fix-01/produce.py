import subprocess,sys,json
from pathlib import Path
root=Path(__file__).parent
repo=Path('C:/Users/vcons/codex-work/dnd-undead-fiends')
tools=repo/'server/tools/asset-production'
with (root/'production.log').open('w',encoding='utf-8') as log:
    cmd=[sys.executable,'-X','utf8',str(tools/'generate_multiview_mesh.py'),'--base-url','http://127.0.0.1:42003']
    for view in ['front','back','left','right']:cmd+=['--'+view,str(root/(view+'.png'))]
    cmd+=['--output-dir',str(root/'generation-01'),'--steps','50','--guidance','5.5','--seed','927221','--octree-resolution','512','--num-chunks','10000','--remove-background']
    subprocess.run(cmd,cwd=repo,stdout=log,stderr=subprocess.STDOUT,check=True)
    r=json.loads((root/'generation-01/generation_receipt.json').read_text())
    assert r['actual_multiview_model_verified'] and r['multiview_texture_verified'] and r['view_count']==4
    subprocess.run(['node',str(tools/'reduce.mjs'),str(root/'generation-01/01_textured_mesh.glb'),str(root/'reduced')],cwd=repo,stdout=log,stderr=subprocess.STDOUT,check=True)
print('Generated and reduced left hand; four shape and texture inputs verified.')

