import sharp from 'sharp';

export const NATURAL_BOUNDARY_PROMPT='Draw one continuous bright green (#00FF00) line where the walkable cave floor meets the surrounding rock wall. Leave entrances and passages open. Keep the rest of the image unchanged.';

const green=(r:number,g:number,b:number)=>g>165&&r<135&&b<135&&g>r*1.8&&g>b*1.8;
const yellow=(r:number,g:number,b:number)=>r>25&&g>20&&r>b*1.8&&g>b*1.8;
const yellowSeed=(r:number,g:number,b:number)=>r>165&&g>155&&b<115&&yellow(r,g,b);

/** Add only newly painted green boundaries to the original structural mask.
 * Yellow paint or changed map pixels in the second response are never imported.
 * The existing converter receives a single yellow union, joining natural rims
 * to masonry without asking the model to redraw already accepted wall caps. */
export async function mergeNaturalBoundaryMask(structural:Buffer,natural:Buffer){
  const first=await sharp(structural,{limitInputPixels:40_000_000}).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const {width,height,channels}=first.info,meta=await sharp(natural,{limitInputPixels:40_000_000}).rotate().metadata();
  if(!meta.width||!meta.height||Math.abs(Math.log((meta.width/meta.height)/(width/height)))>.04)throw new Error('The natural-boundary mask changed the map framing.');
  const second=await sharp(natural,{limitInputPixels:40_000_000}).rotate().resize(width,height,{fit:'fill'}).removeAlpha().toColourspace('srgb').raw().toBuffer();
  const pixels=Buffer.from(first.data),preexisting=new Uint8Array(width*height),nearWalls=new Uint8Array(width*height),candidates=new Uint8Array(width*height);
  for(let p=0;p<preexisting.length;p++){
    const i=p*channels;
    if(!green(first.data[i],first.data[i+1],first.data[i+2]))continue;
    // Preserve green already present in the artwork, including small JPEG shifts.
    const x=p%width,y=Math.floor(p/width);
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)preexisting[(y+dy)*width+x+dx]=1;
  }
  // Reject whole green components that mostly retrace existing masonry. This
  // prevents second-pass recoloring or slight shifts from widening the walls.
  const radius=Math.max(2,Math.round(Math.max(width,height)/400));
  for(let y=0;y<height;y++){
    let last=-Infinity;for(let x=0;x<width;x++){const i=(y*width+x)*channels;if(yellowSeed(first.data[i],first.data[i+1],first.data[i+2]))last=x;if(x-last<=radius)nearWalls[y*width+x]=1;}
    last=Infinity;for(let x=width-1;x>=0;x--){const i=(y*width+x)*channels;if(yellowSeed(first.data[i],first.data[i+1],first.data[i+2]))last=x;if(last-x<=radius)nearWalls[y*width+x]=1;}
  }
  for(let x=0;x<width;x++){
    let last=-Infinity;const column=Uint8Array.from({length:height},(_,y)=>nearWalls[y*width+x]);
    for(let y=0;y<height;y++){if(column[y])last=y;if(y-last<=radius)nearWalls[y*width+x]=1;}
    last=Infinity;for(let y=height-1;y>=0;y--){if(column[y])last=y;if(last-y<=radius)nearWalls[y*width+x]=1;}
  }
  for(let p=0;p<preexisting.length;p++){
    const i=p*channels;
    if(!preexisting[p]&&green(second[i],second[i+1],second[i+2]))candidates[p]=1;
  }
  let addedPixels=0,ignoredWallComponents=0;
  const additions=Buffer.alloc(pixels.length);
  const seen=new Uint8Array(width*height);
  for(let start=0;start<candidates.length;start++)if(candidates[start]&&!seen[start]){
    const component=[start];seen[start]=1;let near=0;
    for(let n=0;n<component.length;n++){
      const p=component[n],x=p%width,y=Math.floor(p/width);near+=nearWalls[p];
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height){const q=(y+dy)*width+x+dx;if(candidates[q]&&!seen[q]){seen[q]=1;component.push(q);}}
    }
    if(near/component.length>.7){ignoredWallComponents++;continue;}
    // Dark brown rock is not old yellow paint unless it adjoins a bright seed.
    for(const p of component){const i=p*channels;if(nearWalls[p]&&yellow(first.data[i],first.data[i+1],first.data[i+2]))continue;pixels[i]=255;pixels[i+1]=255;pixels[i+2]=0;additions[i]=255;additions[i+1]=255;addedPixels++;}
  }
  return {image:addedPixels?await sharp(pixels,{raw:{width,height,channels}}).png().toBuffer():structural,addedPixels,ignoredWallComponents,
    ...(addedPixels?{naturalImage:await sharp(additions,{raw:{width,height,channels}}).png().toBuffer()}:{})};
}
