import {test} from 'vitest';import assert from 'node:assert/strict';
import {enhanceCreases,uvCoverage,CREASE_POLICY} from './crease_detail.mjs';
test('uniform colors and unused atlas space stay unchanged',async()=>{
 const w=64,h=64,rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++)rgba.set([80,150,200,255],i*4);
 const out=await enhanceCreases(rgba,w,h,Buffer.alloc(w*h,255));assert.deepEqual(out.data,rgba);
 const empty=await enhanceCreases(rgba,w,h,Buffer.alloc(w*h));assert.deepEqual(empty.data,rgba);
});
test('creases darken within the cap while highlights, alpha and deep black survive',async()=>{
 const w=256,h=256,rgba=Buffer.alloc(w*h*4),mask=Buffer.alloc(w*h,255);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=x===128?60:x===150?250:x===170?4:160;rgba.set([v,v,v,255],(y*w+x)*4);}
 const result=await enhanceCreases(rgba,w,h,mask);assert.ok(result.stats.changedPixels>0);assert.ok(result.stats.maxDarkeningPercent<=CREASE_POLICY.maxDarkening*100);
 assert.ok(result.data[(128*w+128)*4]<=50,'crease contrast should remain visible after texture reduction');
 assert.ok(result.data[(128*w+128)*4]<rgba[(128*w+128)*4]);assert.equal(result.data[(128*w+150)*4],250);assert.equal(result.data[(128*w+170)*4],4);
 for(let i=0;i<rgba.length;i++){if(i%4===3)assert.equal(result.data[i],rgba[i]);else{assert.ok(result.data[i]<=rgba[i]);assert.ok(result.data[i]>=Math.floor(rgba[i]*(1-CREASE_POLICY.maxDarkening)));}}
});
test('UV coverage follows triangles and ignores invalid mappings',()=>{
 const p={uvs:new Float32Array([0,0,1,0,0,1]),indices:new Uint16Array([0,1,2])};
 const mask=uvCoverage([p],32,32);assert.equal(mask[0],255);assert.equal(mask[31*32+31],0);
 assert.equal(uvCoverage([{...p,uvs:new Float32Array([-2,0,1,0,0,1])}],32,32).some(x=>x),false);
});
test('semi-transparent patterned surfaces are left alone',async()=>{
 const w=64,h=64,rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){const v=i%4?200:40;rgba.set([v,v,v,128],i*4);}
 assert.deepEqual((await enhanceCreases(rgba,w,h,Buffer.alloc(w*h,255))).data,rgba);
});

test('UV island boundaries do not acquire dark seams from bright unused pixels',async()=>{
 const w=256,h=256,rgba=Buffer.alloc(w*h*4),mask=Buffer.alloc(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const inside=x>=48&&x<208&&y>=48&&y<208,v=inside?130:250;
  rgba.set([v,v,v,255],(y*w+x)*4);if(inside)mask[y*w+x]=255;
 }
 assert.deepEqual((await enhanceCreases(rgba,w,h,mask)).data,rgba);
});
