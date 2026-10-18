"""Deterministic four-view silhouette alignment without stretching or recropping."""
import hashlib,json
from pathlib import Path
import numpy as np
from PIL import Image

POLICY='hybrid-alignment-v1'
VIEWS=('front','back','left','right')

def silhouette(im):
    a=np.asarray(im.getchannel('A'))
    ys,xs=np.where(a>127)
    if len(xs)<100:raise ValueError('Reference has no usable subject silhouette')
    box=(int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1))
    x0,y0,x1,y1=box;centres=[]
    # The median centre of the widest run in the lower torso band is less
    # affected by thin held weapons than the full silhouette bounding box.
    for row in a[y0+int((y1-y0)*.40):y0+int((y1-y0)*.78)]:
        padded=np.pad(row>127,(1,1));edges=np.diff(padded.astype(np.int8));starts=np.where(edges==1)[0];ends=np.where(edges==-1)[0]
        if len(starts):
            idx=int(np.argmax(ends-starts));centres.append((starts[idx]+ends[idx])/2)
    axis=float(np.median(centres)) if centres else (x0+x1)/2
    return box,axis

def align_views(paths,output,remove_background):
    out=Path(output);out.mkdir(parents=True,exist_ok=False);images={};metrics={}
    for view in VIEWS:
        p=Path(paths[view]).resolve(strict=True);im=Image.open(p).convert('RGBA')
        alpha=im.getchannel('A');extrema=alpha.getextrema()
        if extrema[0]==255:im=remove_background(im.convert('RGB')).convert('RGBA')
        box,axis=silhouette(im);images[view]=im
        metrics[view]={'source':str(p),'sourceSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bbox':box,'axis':axis}
    # A wide dragon must fit its wings/tail too. Use one shared target height
    # limited by the widest reach in any view, rather than squeezing its width.
    height=min([870.0]+[488*(m['bbox'][3]-m['bbox'][1])/max(m['axis']-m['bbox'][0],m['bbox'][2]-m['axis']) for m in metrics.values()])
    floor=(1024+height)/2;result={};preview=Image.new('RGB',(2048,2048),'white')
    for i,view in enumerate(VIEWS):
        m=metrics[view];box=m['bbox'];scale=height/(box[3]-box[1]);tx=512-m['axis']*scale;ty=floor-box[3]*scale
        aligned=images[view].transform((1024,1024),Image.Transform.AFFINE,(1/scale,0,-tx/scale,0,1/scale,-ty/scale),resample=Image.Resampling.BICUBIC)
        actual,_=silhouette(aligned)
        if actual[0]<16 or actual[2]>1008 or actual[1]<16 or actual[3]>1008:raise ValueError('Alignment would crop the subject; check the reference art')
        p=out/(view+'.png');aligned.save(p);rgb=Image.new('RGBA',aligned.size,'white');rgb.alpha_composite(aligned);preview.paste(rgb.convert('RGB'),((i%2)*1024,(i//2)*1024))
        result[view]={**m,'scale':scale,'translation':[tx,ty],'output':str(p.resolve()),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'alignedBBox':actual,'figureHeightPx':actual[3]-actual[1]}
    heights=[v['figureHeightPx'] for v in result.values()]
    if max(heights)-min(heights)>2:raise ValueError('Aligned view scales disagree')
    preview.save(out/'sheet.png')
    receipt={'policy':POLICY,'views':result,'figureHeightPx':height,'floorY':floor,'bodyAxisX':512,'size':[1024,1024],'manualAdjustments':False}
    (out/'receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8');return receipt
