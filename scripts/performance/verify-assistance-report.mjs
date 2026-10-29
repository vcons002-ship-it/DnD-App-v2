import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium,devices} from '@playwright/test';
const root=path.resolve(process.argv[2]);
const summary=JSON.parse(fs.readFileSync(path.join(root,'summary.json'),'utf8'));
const checks=[];
for(const file of ['index.html','summary.json','report.md']){
 const url=new URL(file,summary.url),response=await fetch(url);
 assert.equal(response.status,200,String(url));
 const body=await response.text();assert(body.length>100);
 if(file==='summary.json')assert.deepEqual(JSON.parse(body).groups,summary.groups);
 checks.push({url:String(url),status:response.status,bytes:Buffer.byteLength(body)});
}
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM});
try{
 const page=await browser.newPage({...devices['Pixel 7']}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(summary.url);
 assert.equal(await page.locator('table').count(),3);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(root,'public-mobile.png'),fullPage:true});
 fs.writeFileSync(path.join(root,'public-mobile-verified.json'),JSON.stringify({at:new Date().toISOString(),url:summary.url,checks,errors,viewport:'Pixel 7 emulation',tables:3,noPageOverflow:true},null,2));
 console.log(JSON.stringify({url:summary.url,checks,mobile:'passed'},null,2));
}finally{await browser.close();}
