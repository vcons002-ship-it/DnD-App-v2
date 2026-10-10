import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {chromium} from '@playwright/test';
const root=path.resolve(process.argv[2],'review');
const server=http.createServer(async(req,res)=>{
 try{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)&&file!==root)throw Error('Outside preview');
  const target=file===root||file===root+path.sep?path.join(root,'index.html'):file;
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.json':'application/json','.png':'image/png','.glb':'model/gltf-binary'})[path.extname(target)]??'application/octet-stream');
  res.end(await fs.readFile(target));
 }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.PW_CHROMIUM||undefined});
try{
 const page=await browser.newPage({viewport:{width:1250,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
 for(const id of ['druk','varis','vanec']){
  await page.locator('#character').selectOption(id);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  for(const angle of ['front','tilt','overhead','back','face']){
   await page.locator(`[data-angle=${angle}]`).click();await page.waitForTimeout(250);
   await page.screenshot({path:path.join(root,`${id}-${angle}.png`)});
  }
 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log('All six preview models loaded; captured 15 matched-angle comparisons.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
