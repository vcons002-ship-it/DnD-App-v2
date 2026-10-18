import unittest,tempfile
from pathlib import Path
from PIL import Image,ImageDraw
from align_views import align_views

class AlignmentTests(unittest.TestCase):
 def fixtures(self,root,wide=False):
  paths={}
  for i,v in enumerate(['front','back','left','right']):
   im=Image.new('RGBA',(1000,1000));d=ImageDraw.Draw(im);h=600+i*40;x=380+i*20;y=100+i*10
   d.rectangle((x,y,x+150,y+h),fill='green')
   if wide:d.rectangle((25,y+100,950,y+160),fill='green')
   else:d.line((x+140,y+300,x+300,y+150),fill='brown',width=12)
   p=root/(v+'.png');im.save(p);paths[v]=str(p)
  return paths
 def test_shared_scale_preserves_proportions_floor_and_weapons(self):
  with tempfile.TemporaryDirectory()as t:
   root=Path(t);paths=self.fixtures(root);a=align_views(paths,root/'out',lambda _:self.fail('RGBA should not be rematted'))
   self.assertLessEqual(max(v['figureHeightPx']for v in a['views'].values())-min(v['figureHeightPx']for v in a['views'].values()),2)
   self.assertFalse(a['manualAdjustments'])
   for v in a['views'].values():
    self.assertGreater(v['alignedBBox'][0],16);self.assertLess(v['alignedBBox'][2],1008)
   b=align_views(paths,root/'repeat',lambda _:None)
   self.assertEqual([x['sha256']for x in a['views'].values()],[x['sha256']for x in b['views'].values()])
 def test_wide_dragon_fits_wings_with_shared_height(self):
  with tempfile.TemporaryDirectory()as t:
   root=Path(t);a=align_views(self.fixtures(root,True),root/'out',lambda _:None)
   self.assertLess(a['figureHeightPx'],870)
   self.assertTrue(all(v['alignedBBox'][0]>=16 and v['alignedBBox'][2]<=1008 for v in a['views'].values()))
 def test_empty_reference_is_rejected(self):
  with tempfile.TemporaryDirectory()as t:
   root=Path(t);paths=self.fixtures(root);Image.new('RGBA',(1000,1000)).save(paths['left'])
   with self.assertRaisesRegex(ValueError,'silhouette'):align_views(paths,root/'out',lambda _:None)
 def test_nearly_transparent_red_fringe_never_becomes_opaque(self):
  with tempfile.TemporaryDirectory()as t:
   root=Path(t);paths={}
   for view in ['front','back','left','right']:
    im=Image.new('RGBA',(1000,1000));d=ImageDraw.Draw(im)
    d.rectangle((400,150,600,850),fill=(40,120,60,255))
    d.rectangle((620,180,650,240),fill=(255,0,0,1))
    p=root/(view+'.png');im.save(p);paths[view]=str(p)
   a=align_views(paths,root/'out',lambda _:self.fail('Existing alpha must not be replaced'))
   for view in a['views'].values():
    pixels=Image.open(view['output']).convert('RGBA').getdata()
    self.assertFalse(any(r>160 and r>g*1.8 and r>b*1.8 and alpha>127 for r,g,b,alpha in pixels))
if __name__=='__main__':unittest.main()
