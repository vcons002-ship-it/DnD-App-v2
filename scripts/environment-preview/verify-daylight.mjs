import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const evidence=path.resolve(process.argv[2]),root=path.resolve('client/environment-dist');
await mkdir(evidence,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{try{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(path.relative(root,file).startsWith('..')){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(4198,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram/i.test(m.text()))errors.push(m.text());});
try{
  const shots=[];
  for(const [name,url] of [['before','https://dnd.nic024i.app/uploads/previews/environment-wind-color-20260928/lab/environment-test.html?storm=1'],['after','http://127.0.0.1:4198/environment-test.html?storm=1']]){
    await page.goto(url);const layer=page.getByTestId('miniature-layer');
    await expect(layer).toHaveAttribute('data-miniature-count','7',{timeout:90000});
    await expect(layer).toHaveAttribute('data-ground-ready','true');
    await page.getByRole('button',{name:'Close-up',exact:true}).click();await page.waitForTimeout(900);
    await expect(layer).toHaveAttribute('data-scene-tint-strength','0');await expect(layer).toHaveAttribute('data-scene-grade-opacity','0');
    shots.push(await page.getByTestId('environment-stage').screenshot({path:path.join(evidence,name+'.png')}));
  }
  const pixels=await page.evaluate(async images=>{
    const data=await Promise.all(images.map(async s=>{const image=await createImageBitmap(new Blob([Uint8Array.from(atob(s),c=>c.charCodeAt(0))],{type:'image/png'}));const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return {w:image.width,h:image.height,p:ctx.getImageData(0,0,image.width,image.height).data};}));
    const [a,b]=data;let mapChanged=0,robePixels=0,beforeChroma=0,afterChroma=0;
    // Empty ground below the figures, clear of any model or moving effect.
    for(let y=a.h-170;y<a.h-90;y++)for(let x=90;x<260;x++){const i=(y*a.w+x)*4;if(Math.abs(a.p[i]-b.p[i])+Math.abs(a.p[i+1]-b.p[i+1])+Math.abs(a.p[i+2]-b.p[i+2])>3)mapChanged++;}
    // Same red-cloth pixels on Vanec, excluding the background by their old hue.
    for(let y=310;y<405;y++)for(let x=758;x<880;x++){
      const i=(y*a.w+x)*4,r=a.p[i],g=a.p[i+1],blue=a.p[i+2];
      if(r>g*1.45&&r>blue*1.15&&r>70){robePixels++;beforeChroma+=(r-Math.min(g,blue))/r;afterChroma+=(b.p[i]-Math.min(b.p[i+1],b.p[i+2]))/Math.max(1,b.p[i]);}
    }
    return {mapChanged,robePixels,beforeChroma:beforeChroma/robePixels,afterChroma:afterChroma/robePixels};
  },shots.map(b=>b.toString('base64')));
  assert.equal(pixels.mapChanged,0);assert(pixels.robePixels>500);assert(pixels.afterChroma>pixels.beforeChroma+.02);
  assert.deepEqual(errors,[]);
  await writeFile(path.join(evidence,'daylight-verification.json'),JSON.stringify({status:'passed',pixels,errors},null,2));
  console.log(JSON.stringify({status:'passed',pixels,errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
