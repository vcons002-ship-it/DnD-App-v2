import {chromium} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';

const out=path.resolve(process.argv[2]);await mkdir(out,{recursive:true});
const root=path.resolve('client/environment-dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
  try{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path.relative(root,file).startsWith('..')){res.writeHead(403).end();return;}
    res.setHeader('Content-Type',mime[path.extname(file)]??'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(4198,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),report={errors:[],samples:[]};
page.on('pageerror',e=>report.errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:4198/environment-test.html');
  await page.waitForFunction(()=>document.querySelector('[data-testid="miniature-layer"]')?.dataset.miniatureCount==='7');
  await page.getByRole('button',{name:'Close-up',exact:true}).click();await page.waitForTimeout(800);
  await page.getByRole('button',{name:'Move Druk',exact:true}).click();await page.waitForTimeout(2000);
  report.before=await page.getByTestId('miniature-layer').evaluate(e=>({...e.dataset}));
  await page.getByRole('button',{name:'Rotate view',exact:true}).click();
  for(let i=0;i<12;i++){
    await page.waitForTimeout(150);
    report.samples.push(await page.getByTestId('miniature-layer').evaluate(e=>({wakes:+e.dataset.mistWakes,time:+e.dataset.mistTime,age:+e.dataset.mistOldestWakeAge})));
  }
  await page.screenshot({path:path.join(out,'rotating-wake.png')});
  assert(Number(report.before.mistWakes)>10,'Must start with an established trail');
  assert(report.samples.every(s=>s.wakes>=Number(report.before.mistWakes)),'Camera rotation erased existing wake segments before expiry');
  assert(report.samples.every((s,i)=>!i||s.time>=report.samples[i-1].time),'Camera rotation rewound mist time');
  assert(report.samples.at(-1).age>2,'Old path must remain throughout camera movement');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=error.message;process.exitCode=1;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(out,'orbit-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
