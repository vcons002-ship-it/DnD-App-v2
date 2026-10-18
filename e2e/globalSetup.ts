import {chromium} from '@playwright/test';

/** Detect a software WebGL renderer once, before any test; `helpers/test.ts`
 * then widens every budget. `E2E_SOFTWARE_GL=0|1` overrides the probe. */
export default async function globalSetup(){
 if(process.env.E2E_SOFTWARE_GL!==undefined)return;
 const browser=await chromium.launch(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{});
 try{
  const page=await browser.newPage();
  const renderer=await page.evaluate(()=>{
   const gl=document.createElement('canvas').getContext('webgl2')??document.createElement('canvas').getContext('webgl');if(!gl)return 'none';
   const info=gl.getExtension('WEBGL_debug_renderer_info');
   return String(info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER));
  });
  const software=/swiftshader|llvmpipe|softpipe|software|none/i.test(renderer);
  process.env.E2E_SOFTWARE_GL=software?'1':'0';
  console.log(`[e2e] WebGL renderer: ${renderer}${software?` — software: budgets ×${process.env.E2E_SLOW_FACTOR||4}`:''}`);
 }finally{await browser.close();}
}
