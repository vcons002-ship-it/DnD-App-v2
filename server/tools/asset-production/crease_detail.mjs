import sharp from 'sharp';

// Texture-local detail, deliberately not baked directional lighting or full AO.
export const CREASE_POLICY = {id:'defined-crease-v2',maxDarkening:.35,threshold:1.5,gain:3.2};

/** Actual UV coverage prevents unused atlas space from producing dark seams. */
export function uvCoverage(primitives,width,height){
  const mask=Buffer.alloc(width*height);
  for(const {uvs,indices} of primitives)for(let f=0;f<indices.length;f+=3){
    const p=[indices[f],indices[f+1],indices[f+2]].map(i=>[uvs[i*2]*width,uvs[i*2+1]*height]);
    if(p.flat().some(v=>!Number.isFinite(v))||p.some(([x,y])=>x<0||y<0||x>width||y>height))continue;
    const [a,b,c]=p,edge=(u,v,x,y)=>(v[0]-u[0])*(y-u[1])-(v[1]-u[1])*(x-u[0]);
    const area=edge(a,b,...c);if(Math.abs(area)<1e-8)continue;const sign=area<0?-1:1;
    const x0=Math.max(0,Math.floor(Math.min(...p.map(v=>v[0])))),x1=Math.min(width-1,Math.ceil(Math.max(...p.map(v=>v[0]))));
    const y0=Math.max(0,Math.floor(Math.min(...p.map(v=>v[1])))),y1=Math.min(height-1,Math.ceil(Math.max(...p.map(v=>v[1]))));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(edge(a,b,x+.5,y+.5)*sign>=0&&edge(b,c,x+.5,y+.5)*sign>=0&&edge(c,a,x+.5,y+.5)*sign>=0)mask[y*width+x]=255;
  }
  return mask;
}

/** Darken small luminance valleys with a hard cap and shadow protection.
 * Uniform color and highlights are unchanged. Normalized masked blur protects
 * empty UV space, and the same multiplier preserves RGB ratios and alpha. */
export async function enhanceCreases(rgba,width,height,coverage){
  if(rgba.length!==width*height*4||coverage.length!==width*height)throw Error('Invalid texture dimensions');
  const luma=Buffer.alloc(width*height),weighted=Buffer.alloc(width*height),effectiveCoverage=Buffer.from(coverage);
  for(let i=0;i<luma.length;i++){
    const j=i*4;if(rgba[j+3]<250)effectiveCoverage[i]=0;
    luma[i]=Math.round(.2126*rgba[j]+.7152*rgba[j+1]+.0722*rgba[j+2]);weighted[i]=Math.round(luma[i]*effectiveCoverage[i]/255);
  }
  const blur=async(buffer,sigma)=>sharp(buffer,{raw:{width,height,channels:1}}).blur(Math.max(.3,sigma)).greyscale().raw().toBuffer();
  const scale=Math.max(width,height)/2048;
  const [[small,smallMask],[large,largeMask]]=await Promise.all([4,14].map(async s=>Promise.all([blur(weighted,s*scale),blur(effectiveCoverage,s*scale)])));
  const output=Buffer.from(rgba);let touched=0,covered=0,sum=0,max=0;
  for(let i=0;i<luma.length;i++){
    if(!coverage[i]||!rgba[i*4+3])continue;covered++;
    if(smallMask[i]<245||largeMask[i]<128)continue;
    const local=.65*small[i]*255/smallMask[i]+.35*large[i]*255/largeMask[i];
    const valley=Math.max(0,local-luma[i]-CREASE_POLICY.threshold);
    const shadowProtection=Math.min(1,Math.max(0,(luma[i]-12)/36));
    const amount=Math.min(CREASE_POLICY.maxDarkening,valley/Math.max(64,local)*CREASE_POLICY.gain)*shadowProtection;
    if(amount<=0)continue;let changed=false;
    for(let channel=0;channel<3;channel++){const j=i*4+channel;output[j]=Math.round(rgba[j]*(1-amount));changed||=output[j]!==rgba[j];}
    if(changed){touched++;sum+=amount;max=Math.max(max,amount);}
  }
  return {data:output,stats:{policy:CREASE_POLICY.id,coveredPixels:covered,changedPixels:touched,changedCoveragePercent:covered?touched/covered*100:0,meanDarkeningPercent:covered?sum/covered*100:0,maxDarkeningPercent:max*100}};
}
