import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from '@playwright/test';

const url=process.argv[2], output=process.argv[3];
if(!url||!output)throw Error('Usage: node verify-published.mjs PREVIEW_PAGE_URL EVIDENCE_DIRECTORY');
await mkdir(output,{recursive:true});
const base=new URL('.',url), headers={'User-Agent':'Mozilla/5.0'};
const pageResponse=await fetch(url,{headers});
assert.equal(pageResponse.status,200);
const videoURL=new URL('courtyard-environment-comparison.mp4',base).href;
const range=await fetch(videoURL,{headers:{...headers,Range:'bytes=0-1023'}});
assert.equal(range.status,206,'Video must support seeking');
assert.match(range.headers.get('content-type')??'',/video\/mp4/);
const rangeBytes=(await range.arrayBuffer()).byteLength;
assert.equal(rangeBytes,1024);
const browser=await chromium.launch({headless:true,executablePath:process.env.PW_CHROMIUM??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const errors=[];
const report={url,at:new Date().toISOString(),pageStatus:pageResponse.status,videoStatus:range.status,rangeBytes,errors};
try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('video').evaluate(v=>{v.muted=true;return v.play();});
  await page.waitForFunction(()=>document.querySelector('video').currentTime>.5,{},{timeout:60000});
  report.video=await page.locator('video').evaluate(v=>({duration:v.duration,currentTime:v.currentTime,width:v.videoWidth,height:v.videoHeight,error:v.error?.message??null}));
  assert(report.video.duration>20&&report.video.width===1600&&!report.video.error);
  await page.locator('video').evaluate(v=>v.pause());
  await page.screenshot({path:path.join(output,'published-phone-video.png'),fullPage:true});
  report.phone=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
  assert(report.phone.document<=report.phone.viewport+1);
  await page.getByRole('link',{name:'Open interactive test',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-testid="miniature-layer"]')?.dataset.miniatureCount==='7',null,{timeout:120000});
  report.interactive=await page.getByTestId('miniature-layer').evaluate(e=>({...e.dataset}));
  assert.equal(report.interactive.groundReady,'true');
  const height=page.getByRole('slider',{name:'Mist height',exact:true});
  if(await height.count()){
    const initial=await height.inputValue();
    await height.evaluate(input=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'6');
      input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>Math.abs(Number(document.querySelector('[data-testid="miniature-layer"]').dataset.mistHeight)-76.8)<.001);
    await page.getByRole('checkbox',{name:'Drifting mist',exact:true}).uncheck();
    await page.waitForFunction(()=>document.querySelector('[data-testid="miniature-layer"]').dataset.mistVisible==='false');
    await page.getByRole('checkbox',{name:'Drifting mist',exact:true}).check();
    await page.waitForFunction(()=>document.querySelector('[data-testid="miniature-layer"]').dataset.mistVisible==='true');
    await height.evaluate((input,value)=>{
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
      input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    },initial);
    report.mistControls={heightSixFeetRendered:true,offOnToggle:true,restoredFeet:Number(initial)};
  }
  await page.screenshot({path:path.join(output,'published-phone-interactive.png'),fullPage:true});
  assert.equal(errors.length,0);
  report.status='passed';
}catch(error){report.status='failed';report.failure=error.message;process.exitCode=1;}
finally{
  await browser.close();
  await writeFile(path.join(output,'published-receipt.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
