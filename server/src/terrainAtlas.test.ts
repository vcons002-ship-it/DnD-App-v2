import {it,expect} from 'vitest';
import sharp from 'sharp';
import {terrainAtlas} from './terrainAtlas.js';
import {legacyMaskSvg} from '../../shared/legacyMaskSvg.js';
const w=40,h=24,columns=4,count=13;
const svg=(body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`;
async function fixture(){
 const color=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){color[i*4]=(i*31)%256;color[i*4+1]=(i*53)%256;color[i*4+2]=(i*17)%256;color[i*4+3]=i<w?0:255;}
 const gray=Buffer.from(color);for(let i=0;i<w*h;i++){const p=i*4,v=Math.round((color[p]*.2126+color[p+1]*.7152+color[p+2]*.0722)*.78);gray[p]=gray[p+1]=gray[p+2]=v;}
 return {color,gray};
}
async function compare(lights:string[],translucent=false){
 const base=await fixture();if(translucent)base.color[7]=base.gray[7]=128;
 const args={base,width:w,height:h,columns,lightSvgs:lights,maskSvgs:lights.map(()=>svg('<rect width="100%" height="100%" fill="#050608" opacity=".8"/>'))};
 const full=await terrainAtlas(args),small=await terrainAtlas({...args,compact:true});expect(small.mask).toEqual(full.mask);
 if(translucent){expect(small.base).toBeUndefined();expect(small.terrain).toEqual(full.terrain);return;}
 expect(small.base).toBeDefined();
 const region=small.region!;
 for(let i=0;i<count;i++){
  const expected=await sharp(full.terrain).extract({left:i%columns*w,top:Math.floor(i/columns)*h,width:w,height:h}).ensureAlpha().raw().toBuffer();
  const tile=await sharp(small.terrain).extract({left:i%columns*region.width,top:Math.floor(i/columns)*region.height,width:region.width,height:region.height}).png().toBuffer();
  const actual=await sharp(small.base).ensureAlpha().composite([{input:tile,left:region.left,top:region.top}]).raw().toBuffer();
  expect(actual.length).toBe(expected.length);
  for(let p=0;p<actual.length;p++){if(p%4===3)expect(actual[p]).toBe(expected[p]);else if(expected[Math.floor(p/4)*4+3])expect(Math.abs(actual[p]-expected[p])).toBeLessThanOrEqual(1);}
 }
 return small;
}
it('reconstructs every pose with the original pixels, including antialiased light edges and transparent padding',async()=>{
 const result=await compare(Array.from({length:count},(_,i)=>svg(`<circle cx="${10+i}" cy="12" r="3.6" fill="white"/>`)));
 expect(result!.region!.width).toBeLessThan(w);expect(result!.region!.height).toBeLessThan(h);
});
it('sends constant daylight once while retaining all thirteen mask poses',async()=>{
 const result=await compare(Array(count).fill(svg('<rect width="100%" height="100%" fill="white"/>')));
 expect(result!.region).toEqual({left:0,top:0,width:1,height:1});expect(result!.maskWidth).toBe(w*columns);
});
it('keeps unlit terrain when there are no light pixels',async()=>{const result=await compare(Array(count).fill(svg('')));expect(result!.region!.width).toBe(1);});
it('retains the full-image path for translucent artwork',async()=>{await compare(Array.from({length:count},(_,i)=>svg(`<circle cx="${i+10}" cy="12" r="5" fill="white"/>`)),true);});
it('preserves every mask pixel while changing terrain packing',async()=>{
 const width=96,height=72,options={width,height,x:-8,y:-4,scale:1,wallFog:true,heavy:true,daylight:false,keepRevealed:false,graded:true};
 const rect=(x:number,y:number,w:number,h:number)=>`M${x},${y}L${x+w},${y}L${x+w},${y+h}L${x},${y+h}Z`;
 const frames=Array.from({length:13},(_,i)=>legacyMaskSvg({sight:[rect(0,0,70+i,60)],near:[rect(i*3,10,24,30)],lights:[rect(i*2,20,35,30)],memory:[rect(-4,-2,90,65)],affinity:[]},options));
 const base={color:Buffer.alloc(width*height*4,255),gray:Buffer.alloc(width*height*4,255)};
 const result=await terrainAtlas({base,width,height,columns:4,lightSvgs:frames.map(()=>`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`),maskSvgs:frames,compact:true});
 const packed=result.mask!;
 for(let i=0;i<frames.length;i++){
  const expected=await sharp(Buffer.from(frames[i])).ensureAlpha().raw().toBuffer();
  const actual=await sharp(packed).extract({left:i%4*width,top:Math.floor(i/4)*height,width,height}).ensureAlpha().raw().toBuffer();
  expect(actual.equals(expected)).toBe(true);
 }
});
