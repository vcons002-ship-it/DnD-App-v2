// Compare the native SVG masks with the previous data-URL representation of
// exactly the same geometry. Reduced motion freezes light and mist animation.
const {chromium}=require('playwright');
const sharp=require('sharp');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const results=[];
 try{
  const page=await browser.newPage({viewport:{width:1100,height:950},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.goto(process.env.PERF_URL||'https://dnd.nic024i.app/uploads/previews/darkvision-interactive-20260928/environment-test.html?vision=1');
  await page.getByText('7/7 miniatures loaded',{exact:true}).waitFor({timeout:180000});
  const stage=page.getByTestId('environment-stage');
  for(const tilt of ['45° view','Overhead view'])for(const darkness of ['Regular darkness','Heavy darkness']){
   await page.getByRole('button',{name:tilt,exact:true}).click();
   await page.getByRole('button',{name:darkness,exact:true}).click();
   await page.waitForTimeout(1100);
   const native=await stage.screenshot();
   const previous=await page.getByTestId('player-vision').evaluate(root=>{
    const divs=[...root.children].filter(el=>el.tagName==='DIV');
    const paths=root.querySelectorAll('defs > g, defs > mask > g');
    const width=root.clientWidth,height=root.clientHeight;
    const mask=shapes=>`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><mask id="m"><rect width="100%" height="100%" fill="white"/>${shapes}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#m)"/></svg>`)}")`;
    const original=divs.map(el=>el.style.maskImage);
    divs[0].style.maskImage=mask(paths[0].innerHTML);
    divs[1].style.maskImage=mask(paths[1].innerHTML+paths[0].innerHTML);
    return original;
   });
   await page.waitForTimeout(200);
   const legacy=await stage.screenshot();
   const {data:a,info}=await sharp(native).removeAlpha().raw().toBuffer({resolveWithObject:true});
   const b=await sharp(legacy).removeAlpha().raw().toBuffer();
   let different=0,maxDelta=0;
   for(let i=0;i<a.length;i+=3){const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));maxDelta=Math.max(maxDelta,d);if(d>4)different++;}
   const row={tilt,darkness,differentPixels:different,totalPixels:info.width*info.height,maxChannelDelta:maxDelta};results.push(row);
   await page.getByTestId('player-vision').evaluate((root,styles)=>{[...root.children].filter(el=>el.tagName==='DIV').forEach((el,i)=>el.style.maskImage=styles[i]);},previous);
   if(different>info.width*info.height*.001)throw Error('Vision mask appearance changed: '+JSON.stringify(row));
  }
 }finally{await browser.close();fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/vision-mask-comparison.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
